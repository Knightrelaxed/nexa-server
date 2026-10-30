'use strict';
/**
 * Finance_Confirmations - Pending-confirmation lifecycle: request, edit, confirm, auto-save, recovery.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
const supabase = require('../../infrastructure/Supabase_Memories');
const supabaseFinance = require('../../infrastructure/Supabase_Finance');
const { _autoCategorizeMerchant, _normalizePaymentMethod, _parseFlexibleCurrency } = require('./Finance_Helpers');
const { processTransaction } = require('./Finance_Ledger');
const { pendingConfirmations, processingKeys } = require('./Finance_State');

/**
 * On startup: recover any pending transactions from Supabase that were
 * never sent to Telegram (e.g. server crashed mid-send).
 * Re-registers their 5-min timeout from remaining time.
 */
async function recoverPendingTransactions() {
  try {
    const rows = await supabase.getPendingTransactions();
    if (!rows || rows.length === 0) return;
    console.log(`[FINANCE] Recovering ${rows.length} pending transaction(s) from Supabase...`);

    for (const row of rows) {
      const tx = row.tx_data;
      const compositeKey = row.composite_key;
      const createdAt = new Date(row.created_at);
      const ageMs = Date.now() - createdAt.getTime();
      const TIMEOUT_MS = 5 * 60 * 1000;

      // If already older than 5 minutes — auto-save immediately
      if (ageMs >= TIMEOUT_MS) {
        console.log(`[FINANCE] Recovered tx ${compositeKey} is expired. Auto-saving now...`);
        try {
          // DEDUP GUARD: Check dedup tables before saving to prevent
          // race condition with Watchdog cron (which also runs every 90s).
          // We pass checkPending=false because this is already a pending transaction.
          const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, createdAt, false);
          if (alreadySaved) {
            console.log(`[FINANCE] Recovery: ${compositeKey} already saved or pending. Deleting stale pending record.`);
            await supabase.deletePendingTransaction(compositeKey);
            continue;
          }

          const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
          const _recDest = tx.destination && tx.destination !== 'Unknown' ? tx.destination : '';
          const _recDesc = tx.description && tx.description !== '[Menunggu Detail User]' && tx.description !== '-' ? tx.description : '';
          const _recContext = [_recDest, _recDesc].filter(Boolean).join(' - ') || 'Unknown';
          tx.category = await _autoCategorizeMerchant(_recContext, tx.category);
          if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
          await processTransaction(tx, 'GMAIL_POLLING');
          // processTransaction already calls logTransactionKey, but we
          // delete the pending record immediately after to signal to the
          // Watchdog that this tx is resolved and should not be re-processed.
        } catch (saveErr) {
          console.error(`[FINANCE] Recovery auto-save failed for ${compositeKey}:`, saveErr.message);
        } finally {
          try { await supabase.deletePendingTransaction(compositeKey); } catch (e) {
            console.error(`[FINANCE] Failed to delete recovered tx ${compositeKey}:`, e.message);
          }
        }
        continue;
      }

      // Register in-memory map
      const remaining = TIMEOUT_MS - ageMs;
      const timeoutId = setTimeout(async () => {
        if (pendingConfirmations.has(compositeKey)) {
          await _autoSavePending(compositeKey, tx);
        }
      }, remaining);
      pendingConfirmations.set(compositeKey, { tx, timeoutId });

      // If Telegram was never sent — resend now via curl+proxy (proven to work on HF)
      if (!row.telegram_sent) {
        console.log(`[FINANCE] Resending unsent Telegram alert for: ${compositeKey}`);
        const msg = await _buildConfirmationMessage(tx);
        try {
          const { sendTelegramOutbound } = require('../../interfaces/webhook');
          await sendTelegramOutbound(msg);
          await supabase.markPendingTransactionSent(compositeKey);
        } catch (e) {
          console.warn(`[FINANCE] Recovery resend failed for ${compositeKey}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[FINANCE] Recovery failed:', e.message);
  }
}

/**
 * Resolves a pending transaction confirmation.
 * Returns a reply message to send to the user, or null if no pending transactions.
 */
/**
 * Given a snippet text (from a Telegram reply_to_message) of a confirmation message,
 * try to find which compositeKey in pendingConfirmations best matches it.
 *
 * Matching strategy:
 *   1. PRIMARY: Extract Rp-prefixed amounts via regex (handles "Rp25.000", "Rp1.250.000")
 *   2. SECONDARY: Fallback to any standalone large number (>= 1000) in the snippet
 *
 * Returns the matching compositeKey string, or null if no match / only 1 pending tx.
 */
function _resolveTargetKeyFromSnippet(replySnippet) {
  if (!replySnippet || pendingConfirmations.size <= 1) return null;

  const candidates = [];

  // Strategy 1 (PRIMARY): Extract Rp-prefixed amounts — most reliable
  // Handles: Rp25.000, Rp1.250.000, Rp25,000, Rp1,250,000
  const rpPattern = /[Rr][Pp]\.?\s*([0-9][0-9.,]+)/g;
  let m;
  while ((m = rpPattern.exec(replySnippet)) !== null) {
    const n = _parseFlexibleCurrency(m[1]);
    if (!isNaN(n) && n > 0) candidates.push(n);
  }

  // Strategy 2 (FALLBACK): If no Rp prefix found, look for large standalone numbers
  // e.g., the user quoted just the number in their message
  if (candidates.length === 0) {
    const clean = replySnippet.replace(/[^0-9.,]/g, ' ');
    for (const part of clean.split(/\s+/)) {
      if (part.length < 4) continue; // skip short fragments
      const n = _parseFlexibleCurrency(part);
      if (!isNaN(n) && n >= 1000) candidates.push(n);
    }
  }

  if (candidates.length === 0) return null;

  // Find a pending key whose nominal matches one of the extracted amounts
  for (const [key, pending] of pendingConfirmations.entries()) {
    const txNominal = typeof pending.tx.nominal === 'number'
      ? pending.tx.nominal
      : _parseFlexibleCurrency(String(pending.tx.nominal));
    if (candidates.some(c => Math.abs(c - txNominal) < 1)) {
      return key;
    }
  }
  return null;
}

async function confirmPendingTransactions(isYes, customDescription = null, customCategory = null, customAccount = null, customPaymentMethod = null, targetKey = null) {
  if (pendingConfirmations.size === 0) return null;

  // If multiple pending exist and a targetKey was resolved from user's Reply,
  // only act on that specific transaction — leave others waiting.
  const keysToProcess = targetKey && pendingConfirmations.has(targetKey)
    ? [targetKey]
    : [...pendingConfirmations.keys()];

  let processedCount = 0;
  let skippedCount = 0;
  let successMessages = [];

  for (const key of keysToProcess) {
    const pending = pendingConfirmations.get(key);
    if (!pending) continue;
    clearTimeout(pending.timeoutId);
    if (isYes) {
      try {
        if (customDescription) pending.tx.description = customDescription;
        if (customCategory) pending.tx.category = customCategory;
        if (customAccount) pending.tx.account = customAccount;
        if (customPaymentMethod) pending.tx.payment_method = customPaymentMethod;
        
        // Use lightweight AI categorizer instead of full routing
        if (!customCategory) {
          const dest = pending.tx.destination && pending.tx.destination !== 'Unknown' ? pending.tx.destination : '';
          const desc = pending.tx.description && pending.tx.description !== '[Menunggu Detail User]' && pending.tx.description !== '-' ? pending.tx.description : '';
          const combinedContext = [dest, desc].filter(Boolean).join(' - ') || 'Unknown';
          
          pending.tx.category = await _autoCategorizeMerchant(
            combinedContext, pending.tx.category
          );
        }

        // Use TELEGRAM_MANUAL for non-email transactions to avoid strict email dedup
        const source = pending.tx.isAutoSyncEmail ? 'GMAIL_POLLING' : 'TELEGRAM_MANUAL';
        const res = await processTransaction(pending.tx, source);
        if (res && res.message) successMessages.push(res.message);
        processedCount++;
        
        // BUG FIX 5: Only delete from memory if SUCCESSFUL
        pendingConfirmations.delete(key);
        try { await supabase.deletePendingTransaction(key); } catch (_) {}
      } catch (e) {
        console.error(`[FINANCE] Failed to save confirmed tx:`, e.message);
        successMessages.push(`❌ Gagal menyimpan transaksi Rp${pending.tx.nominal}: ${e.message}`);
        // Do NOT delete from pending confirmations so user can try again (e.g. with different account)
      }
    } else {
      skippedCount++;
      try {
        // Log to Supabase so it doesn't get re-polled as a new transaction
        await supabase.logTransactionKey(key, new Date(pending.tx.time || Date.now()), 'CANCELLED');
      } catch (e) {
        console.error(`[FINANCE] Failed to log cancelled tx:`, e.message);
      }
      
      pendingConfirmations.delete(key);
      try { await supabase.deletePendingTransaction(key); } catch (_) {}
    }
  }

  // If other transactions are still pending after targeted action, remind user
  const remainingCount = pendingConfirmations.size;
  let suffix = '';
  if (remainingCount > 0) {
    suffix = `\n\n⏳ <b>${remainingCount} transaksi lain</b> masih menunggu konfirmasi. Silakan balas pesan konfirmasi masing-masing transaksi tersebut.`;
  }

  if (isYes) {
    const base = successMessages.length > 0
      ? successMessages.join('\n\n')
      : `✅ <b>Berhasil dicatat!</b> ${processedCount} transaksi telah dimasukkan ke dalam database keuangan Tuan.`;
    return base + suffix;
  } else {
    return `❌ <b>Dibatalkan.</b> ${skippedCount} transaksi diabaikan dan tidak dimasukkan ke dalam database.` + suffix;
  }
}

/**
 * Updates a pending transaction with new details (description/category/nominal/account/paymentMethod).
 */
async function updatePendingTransaction(newDescription = null, newCategory = null, newNominal = null, newAccount = null, newPaymentMethod = null, targetKey = null) {
  if (pendingConfirmations.size === 0) return null;

  // Targeted resolution: if a specific key was resolved from the user's Reply,
  // update only that transaction. Otherwise fall back to the first one (legacy).
  let resolvedKey = null;
  if (targetKey && pendingConfirmations.has(targetKey)) {
    resolvedKey = targetKey;
  } else {
    resolvedKey = pendingConfirmations.keys().next().value;
  }

  const pending = pendingConfirmations.get(resolvedKey);
  if (!pending) return null;

  const key = resolvedKey;

  if (newDescription) {
    pending.tx.description = newDescription;
    
    // If user gives a new description but NO explicit category, 
    // let's re-run the AI categorizer so the preview reflects the correct category
    if (!newCategory) {
      const dest = pending.tx.destination && pending.tx.destination !== 'Unknown' ? pending.tx.destination : '';
      const desc = pending.tx.description;
      const combinedContext = [dest, desc].filter(Boolean).join(' - ') || 'Unknown';
      
      // Pass null as currentCategory so AI is forced to re-evaluate based on the new description
      pending.tx.category = await _autoCategorizeMerchant(combinedContext, null);
    }
  }
  
  // ── VALIDASI KATEGORI ────────────────────────────────────────────────────────
  if (newCategory) {
    const categories = await supabaseFinance.getCategoriesList();
    const normalizedInput = newCategory.toLowerCase().replace(/\s+/g, '');
    const matched = categories.find(c => {
      const normalizedName = c.name.toLowerCase().replace(/\s+/g, '');
      return normalizedName.includes(normalizedInput) || normalizedInput.includes(normalizedName);
    });
    
    if (matched) {
      pending.tx.category = matched.name;
    } else {
      // Fallback to AI categorizer if fuzzy match fails
      pending.tx.category = await _autoCategorizeMerchant(newCategory, null);
    }
  }
  if (newNominal) {
    const parsed = _parseFlexibleCurrency(newNominal);
    if (!isNaN(parsed)) pending.tx.nominal = parsed;
  }

  // ── VALIDASI AKUN ──────────────────────────────────────────────────────────
  // Jika user menyebutkan nama akun, verifikasi dulu ke database.
  // Jika tidak ditemukan, JANGAN update pending.tx.account dan balas dengan
  // pesan konfirmasi yang menyebutkan daftar akun aktif.
  if (newAccount) {
    const accounts = await supabaseFinance.getAccountsList();
    const normalizedInput = newAccount.toLowerCase().replace(/\s+/g, '');

    // Cari akun yang paling cocok (fuzzy match sederhana berbasis includes)
    const matched = accounts.find(a => {
      const normalizedName = a.name.toLowerCase().replace(/\s+/g, '');
      return normalizedName.includes(normalizedInput) || normalizedInput.includes(normalizedName);
    });

    if (matched) {
      // Akun ditemukan — gunakan nama resmi dari database
      pending.tx.account = matched.name;
    } else {
      // Akun TIDAK ditemukan — jangan update, dan balas dengan konfirmasi
      const accountList = accounts.map(a => `• ${a.name} (${a.type})`).join('\n');
      const unknownAccountMsg =
        `⚠️ <b>Akun "${newAccount}" tidak ditemukan</b> di daftar akun aktif Tuan.\n\n` +
        `Berikut akun yang terdaftar:\n${accountList}\n\n` +
        `❓ Silakan pilih salah satu dari daftar di atas, atau abaikan agar disimpan ke akun default dalam 5 menit.`;

      // Reset timeout karena user sudah berinteraksi
      clearTimeout(pending.timeoutId);
      const newTimeoutId = setTimeout(async () => {
        if (pendingConfirmations.has(key)) await _autoSavePending(key, pending.tx);
      }, 5 * 60 * 1000);
      pending.timeoutId = newTimeoutId;

      return unknownAccountMsg;
    }
  }

  if (newPaymentMethod) {
    const normalizedPM = _normalizePaymentMethod(newPaymentMethod);
    if (normalizedPM) {
      pending.tx.payment_method = normalizedPM;
    } else {
      // Metode tidak dikenali — beritahu user dan JANGAN simpan nilai acak
      clearTimeout(pending.timeoutId);
      const newTimeoutId = setTimeout(async () => {
        if (pendingConfirmations.has(key)) await _autoSavePending(key, pending.tx);
      }, 5 * 60 * 1000);
      pending.timeoutId = newTimeoutId;
      return `⚠️ <b>Metode pembayaran "${newPaymentMethod}" tidak dikenali.</b>\n\nMetode yang tersedia hanya:\n• <b>QRIS</b> (scan QR)\n• <b>Transfer bank</b>\n• <b>Kartu Kredit</b>\n• <b>Tunai</b>\n\nSilakan balas dengan salah satu metode di atas, atau abaikan agar disimpan dalam 5 menit.`;
    }
  }

  // Reset the 5-minute timeout because user interacted
  clearTimeout(pending.timeoutId);

  // Update Supabase
  await supabase.savePendingTransaction(key, pending.tx, true);

  const newTimeoutId = setTimeout(async () => {
    if (pendingConfirmations.has(key)) await _autoSavePending(key, pending.tx);
  }, 5 * 60 * 1000);
  pending.timeoutId = newTimeoutId;

  // Notify about remaining pending transactions
  const remainingCount = pendingConfirmations.size - 1;
  let footer = '';
  if (remainingCount > 0) {
    footer = `\n\n⏳ <b>${remainingCount} transaksi lain</b> masih menunggu konfirmasi. Silakan balas pesan konfirmasi masing-masing.`;
  }

  const msg = await _buildConfirmationMessage(pending.tx, 'DETAIL TRANSAKSI DIPERBARUI ✏️');
  return msg + footer;
}

/**
 * Build the Telegram confirmation message text for a pending transaction.
 * Extracted as a shared helper so recovery and new confirmations use the same format.
 */
async function _buildConfirmationMessage(tx, sourceLabel = 'SINKRONISASI KEUANGAN TERBARU') {
  const transactionTime = new Date(tx.time);
  const dateStr = transactionTime.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = transactionTime.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '.');
  // BUG FIX #5: Safely parse nominal whether it comes as number or string (e.g., from Supabase recovery)
  const nominalNum = typeof tx.nominal === 'number' ? tx.nominal : _parseFlexibleCurrency(String(tx.nominal));
  const nominalFmt = isNaN(nominalNum) ? String(tx.nominal) : `Rp${nominalNum.toLocaleString('id-ID')}`;
  const tipeStr = tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran';
  const isMissingDesc = tx.description === '[Menunggu Detail User]';
  const displayDesc = isMissingDesc ? `[KOSONG - Tujuan: ${tx.destination}]` : tx.description;

  let currentSaldo = '-';
  try {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const analytics = await supabaseFinance.getFinanceAnalytics(startOfMonth, endOfMonth);
    if (analytics) {
      const saldoNum = analytics.balance;
      currentSaldo = isNaN(saldoNum) ? '-' : `Rp${Math.abs(saldoNum).toLocaleString('id-ID')}`;
    }
  } catch (_) {}

  let proactiveQuestion = '';
  if (isMissingDesc) {
    const outContext = tx.destination === 'Unknown' ? `sebesar ${nominalFmt}` : `ke ${tx.destination}`;
    const inContext = tx.destination === 'Unknown' ? `sebesar ${nominalFmt}` : `dari ${tx.destination}`;
    proactiveQuestion = tx.type === 'INCOME'
      ? `❓ <b>Terdapat dana masuk ${inContext}.</b>\n\nKira-kira uang ini masuk dalam rangka apa, Tuan? <i>(Tanpa balasan, N.E.X.A akan menyimpannya dengan kategori otomatis dalam 5 menit).</i>`
      : `❓ <b>N.E.X.A mencatat pengeluaran ${outContext}.</b>\n\nTuan, uang ini digunakan untuk keperluan apa ya? <i>(Tanpa balasan, N.E.X.A akan menebak kategorinya dalam 5 menit).</i>`;
  } else if (!tx.account || !tx.payment_method) {
    const missingItems = [];
    if (!tx.account) missingItems.push("akun yang digunakan");
    if (!tx.payment_method) missingItems.push("metode pembayarannya (QRIS/Transfer/Tunai/Kredit)");
    
    if (sourceLabel.includes('DIPERBARUI')) {
      proactiveQuestion = `✏️ <b>Detail catatan diperbarui!</b>\n\nSatu hal lagi Tuan, mohon informasikan ${missingItems.join(" dan ")} untuk transaksi ini.`;
    } else {
      proactiveQuestion = `❓ <b>Satu hal lagi Tuan.</b>\n\nMohon informasikan ${missingItems.join(" dan ")} untuk transaksi ini. <i>(Atau abaikan jika ingin disimpan otomatis ke akun default dalam 5 menit).</i>`;
    }
  } else {
    proactiveQuestion = `💡 Transaksi ini siap dikunci. Jika ada koreksi tambahan, silakan balas pesan ini. Jika tidak, N.E.X.A akan meresmikannya dalam 5 menit.`;
  }

  const displayCategory = (tx.category && tx.category !== 'Lainnya' && tx.category !== '[Menunggu Kategori AI/User]') ? `${tx.category} [Auto-AI]` : 'Lainnya [Auto-AI]';

  return `💸 <b>${sourceLabel}</b>\n\n` +
    `<b>No:</b> [Auto]\n` +
    `<b>Tanggal:</b> ${dateStr}\n` +
    `<b>Waktu:</b> ${timeStr}\n` +
    `<b>Tipe:</b> ${tipeStr}\n` +
    `<b>Kategori:</b> ${displayCategory}\n` +
    `<b>Akun:</b> ${tx.account || 'Belum dipilih'}\n` +
    `<b>Metode:</b> ${tx.payment_method || '-'}\n` +
    `<b>Deskripsi:</b> ${displayDesc}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}\n` +
    `<b>Saldo (Rp) Saat Ini:</b> ${currentSaldo}\n\n` +
    `${proactiveQuestion}`;
}

/**
 * Auto-save a pending transaction (called by timeout or recovery).
 */
async function _autoSavePending(compositeKey, tx) {
  // BUG FIX 1: Race Condition & Lock Check
  // Node.js is single threaded, so we use a dedicated Set to lock processing.
  // We CANNOT use pendingConfirmations.has() because after a server restart,
  // Watchdog recovers transactions that are not in the map!
  if (processingKeys.has(compositeKey)) {
    return; // Already handled by another concurrent process
  }
  processingKeys.add(compositeKey);
  
  try {
    pendingConfirmations.delete(compositeKey);
    try { await supabase.deletePendingTransaction(compositeKey); } catch (_) {}

    const txTime = new Date(tx.time || Date.now());
    const alreadySaved = await supabase.isDuplicateTransaction(compositeKey, txTime, false);
    if (alreadySaved) {
      console.log(`[FINANCE] _autoSavePending: ${compositeKey} already saved. Skipping.`);
      return;
    }

    const tipeStr = tx.type === 'INCOME' ? 'pemasukan' : 'pengeluaran';
    // Use lightweight AI categorizer with combined destination+description for maximum context
    const _saveDest = tx.destination && tx.destination !== 'Unknown' ? tx.destination : '';
    const _saveDesc = tx.description && tx.description !== '[Menunggu Detail User]' && tx.description !== '-' ? tx.description : '';
    const _saveContext = [_saveDest, _saveDesc].filter(Boolean).join(' - ') || 'Unknown';
    tx.category = await _autoCategorizeMerchant(_saveContext, tx.category);
    if (tx.description === '[Menunggu Detail User]') tx.description = `${tipeStr} ke ${tx.destination}`;
    try {
      // Use 'TELEGRAM_MANUAL' to bypass strict email duplicate checks for user-initiated saves
      const source = tx.isAutoSyncEmail ? 'GMAIL_POLLING' : 'TELEGRAM_MANUAL';
      await processTransaction(tx, source);
    } catch (e) {
      // BUG FIX 5: Notify user of silent failures
      console.error('[FINANCE] Auto-save processTransaction failed:', e.message);
      const { sendTelegramOutbound } = require('../../interfaces/webhook');
      await sendTelegramOutbound(`⚠️ <b>Gagal Menyimpan Transaksi Otomatis</b>\n\nNominal: Rp${tx.nominal}\nTujuan: ${tx.destination}\nAlasan: ${e.message}\n\n<i>Transaksi dibatalkan.</i>`);
      return;
    }
    
    // AUDIT FIX (CRITICAL): Use _parseFlexibleCurrency — the old replace(/[^0-9]/g,'') stripped
    // the decimal point, so "50000.50" became 5000050. _parseFlexibleCurrency handles all formats.
    const nominalNum = typeof tx.nominal === 'number' ? tx.nominal : _parseFlexibleCurrency(String(tx.nominal));
    const nominalFmt = isNaN(nominalNum) ? String(tx.nominal) : `Rp${nominalNum.toLocaleString('id-ID')}`;
    const timeoutMsg = `⏳ <i>Waktu habis.</i>\nTransaksi <b>${nominalFmt}</b> telah disimpan otomatis.\n\nKategori AI: <b>${tx.category}</b>\nCatatan: <b>${tx.description}</b>`;
    try {
      const { sendTelegramOutbound } = require('../../interfaces/webhook');
      await sendTelegramOutbound(timeoutMsg);
    } catch (_) {}
  } catch (e) {
    console.error('[FINANCE] Auto-save failed:', e.message);
  } finally {
    processingKeys.delete(compositeKey);
  }
}

/**
 * Universally requests transaction confirmation (Email, Text, Voice, Photo).
 * Persists to Supabase FIRST, returns message for the caller to send.
 * Does NOT send to Telegram itself — the caller (webhook.js) handles delivery.
 * Waits 5 minutes before auto-saving.
 */
async function requestTransactionConfirmation(txData, sourceLabel = 'PENCATATAN KEUANGAN BARU', customKey = null) {
  const nominal = txData.nominal;
  const destination = txData.destination || 'Unknown';

  // AI auto-categorize IMMEDIATELY so the confirmation message shows the real category
  const aiCategory = await _autoCategorizeMerchant(destination, txData.category);

  const cleanMerchant = destination.toLowerCase().replace(/[^a-z0-9]/g, '');
  const compositeKey = customKey || txData.compositeKey || `${nominal}_${cleanMerchant}`;

  const tx = {
    nominal,
    type: txData.type || 'EXPENSE',
    destination,
    category: aiCategory,
    description: txData.description && txData.description !== '-' ? txData.description : '[Menunggu Detail User]',
    time: txData.time || new Date().toISOString(),
    payment_method: txData.payment_method || null,
    account: txData.account || null,
    suggestedAccount: txData.suggestedAccount || null,
    compositeKey,
    isAutoSyncEmail: !!txData.isAutoSyncEmail
  };

  // Idempotency: if this key is already pending in memory, don't re-register
  if (pendingConfirmations.has(compositeKey)) {
    console.log(`[FINANCE] Transaction ${compositeKey} is already pending. Skipping.`);
    return null;
  }

  // 1. Auto-assign akun jika belum diisi
  if (!tx.account) {
    try {
      const accounts = await supabaseFinance.getAccountsList();
      if (tx.suggestedAccount) {
        tx.account = tx.suggestedAccount;
      } else if (accounts && accounts.length === 1) {
        tx.account = accounts[0].name;
        console.log(`[FINANCE] Auto-assigned sole account: ${tx.account}`);
      }
    } catch (_) {}
  }

  // 2. Persist to Supabase FIRST (telegram_sent = false)
  await supabase.savePendingTransaction(compositeKey, tx, false);

  // 3. Build message
  const msg = await _buildConfirmationMessage(tx, sourceLabel);

  // 3. Auto-save timeout
  const timeoutId = setTimeout(async () => {
    if (pendingConfirmations.has(compositeKey)) {
      await _autoSavePending(compositeKey, tx);
    }
  }, 5 * 60 * 1000);

  pendingConfirmations.set(compositeKey, { tx, timeoutId });

  // 4. Return message — caller (webhook.js) will send it via the proven webhook response method
  //    and call markPendingTransactionSent() after successful delivery.
  return msg;
}

/**
 * Public alias used by the Watchdog cron to auto-save an expired pending tx.
 */
async function autoSaveFromWatchdog(compositeKey, tx) {
  return _autoSavePending(compositeKey, tx);
}

/**
 * Public accessor: resolve which compositeKey best matches a Telegram reply snippet.
 * Used by webhook.js to pass the targetKey to confirm/update functions.
 */
function resolveTargetKeyFromSnippet(replySnippet) {
  return _resolveTargetKeyFromSnippet(replySnippet);
}

/**
 * Expose pending confirmations context.
 * ASYNC: checks in-memory map first, falls back to Supabase if empty
 * (handles server restarts where in-memory map is wiped).
 */
async function getPendingConfirmationsContext() {
  // 1. Check in-memory map first (fast path)
  if (pendingConfirmations.size > 0) {
    let contextStr = "STATUS FINANCE TERTUNDA (MENUNGGU RESPON USER):\n";
    for (const [key, pending] of pendingConfirmations.entries()) {
      const tx = pending.tx;
      contextStr += `- Ada transaksi tertunda: ${tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'} Rp${tx.nominal} ke/dari ${tx.destination}.\n`;
      if (tx.description === '[Menunggu Detail User]' || tx.category === '[Menunggu Kategori AI/User]') {
        contextStr += `  User mungkin sedang mencoba memberi tahu rincian/kategori untuk transaksi ini!\n`;
      }
    }
    return contextStr;
  }

  // 2. Fallback: check Supabase (handles server restart scenario)
  try {
    const rows = await supabase.getPendingTransactions();
    const fresh = rows.filter(r => {
      const ageMs = Date.now() - new Date(r.created_at).getTime();
      return ageMs < 5 * 60 * 1000; // only still-active ones
    });
    if (fresh.length === 0) return null;

    // Re-register recovered transactions into in-memory map so future calls are fast
    for (const row of fresh) {
      const tx = row.tx_data;
      const key = row.composite_key;
      if (!pendingConfirmations.has(key)) {
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const remaining = Math.max(1000, (5 * 60 * 1000) - ageMs); // Guard: never negative/zero
        const timeoutId = setTimeout(async () => {
          if (pendingConfirmations.has(key)) await _autoSavePending(key, tx);
        }, remaining);
        pendingConfirmations.set(key, { tx, timeoutId });
        console.log(`[FINANCE] Re-registered pending tx from Supabase (post-restart): ${key}`);
      }
    }

    let contextStr = "STATUS FINANCE TERTUNDA (MENUNGGU RESPON USER — dipulihkan dari Supabase setelah restart):\n";
    for (const row of fresh) {
      const tx = row.tx_data;
      contextStr += `- Ada transaksi tertunda: ${tx.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'} Rp${tx.nominal} ke/dari ${tx.destination}.\n`;
    }
    return contextStr;
  } catch (e) {
    console.error('[FINANCE] getPendingConfirmationsContext Supabase fallback failed:', e.message);
    return null;
  }
}

module.exports = {
  recoverPendingTransactions,
  _resolveTargetKeyFromSnippet,
  confirmPendingTransactions,
  updatePendingTransaction,
  _buildConfirmationMessage,
  _autoSavePending,
  requestTransactionConfirmation,
  autoSaveFromWatchdog,
  resolveTargetKeyFromSnippet,
  getPendingConfirmationsContext,
};
