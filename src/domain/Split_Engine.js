/**
 * Split_Engine.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Engine pemecahan transaksi campuran (Split Transaction) untuk N.E.X.A Finance.
 *
 * Tanggung jawab:
 *  1. parseSplitFromText()  — Deteksi & parse rincian split dari teks/voice natural
 *  2. parseSplitFromImage() — Deteksi & parse item belanja dari foto struk via Vision
 *  3. executeSplit()        — Hapus transaksi induk, insert N baris split ke Supabase
 *  4. isSplitIntent()       — Cek apakah input mengandung pola multi-item (tanpa keyword wajib)
 *  5. formatSplitMessage()  — Format pesan konfirmasi split yang rapi untuk Telegram
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { randomUUID } = require('crypto');
const supabaseFinance = require('../infrastructure/Supabase_Finance');

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS: Currency Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse nominal dari string fleksibel: "5rb", "5.000", "5000", "5k", "lima ribu"
 * Returns number atau NaN jika gagal.
 */
function _parseCurrency(str) {
  if (!str) return NaN;
  const s = String(str).toLowerCase().trim();

  // Handle kata "ribu" / "rb" / "k"
  const ribuan = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:ribu|rb|k)$/);
  if (ribuan) return parseFloat(ribuan[1].replace(',', '.')) * 1000;

  // Handle "juta" / "jt"
  const jutaan = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:juta|jt)$/);
  if (jutaan) return parseFloat(jutaan[1].replace(',', '.')) * 1000000;

  // Handle angka biasa dengan titik/koma sebagai separator ribuan
  const clean = s.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? NaN : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETEKSI POLA SPLIT (Heuristic + NLP sederhana tanpa keyword wajib)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deteksi apakah teks mengandung pola multi-item yang perlu di-split.
 * Tidak memerlukan keyword "split" atau "pecah" — cukup pola natural.
 *
 * Pola yang dideteksi:
 *   - "beras 10rb dan sabun 5rb dan es krim 3rb"
 *   - "split: dapur 100rb, jajan 20rb"
 *   - "untuk beli nasi 10000 sama jajan 5000 dan sabun 9000"
 *   - "dapur 100, kecantikan 30, jajan 20"
 *
 * Returns: true jika terdeteksi sebagai pola split
 */
function isSplitIntent(text) {
  if (!text) return false;
  const s = text.toLowerCase().trim();

  // Hard-pass: keyword eksplisit split
  if (/\bsplit\b|\bpecah\b|\brincian\b/.test(s)) return true;

  // Pola 1: minimal 2 pasangan [item + nominal] dipisahkan koma / "dan" / "sama" / "&" / spasi
  // Contoh: "untuk es krim 5rb dan nasi 10rb dan sabun 9rb", "beras 100rb sabun 30rb"
  const pairPattern = /\b[a-z]{2,30}\b\s+\d+(?:[.,]\d+)?\s*(?:ribu|rb|k|jt|juta|000)?/gi;
  const pairMatches = s.match(pairPattern) || [];
  if (pairMatches.length >= 2) return true;

  // Pola 2: nominal dahulu baru item (e.g. "20rb beras sama 15rb sabun")
  const revPairPattern = /\d+(?:[.,]\d+)?\s*(?:ribu|rb|k|jt|juta|000)\s+[a-z]{2,30}\b/gi;
  const revMatches = s.match(revPairPattern) || [];
  if (revMatches.length >= 2) return true;

  // Pola 3: daftar koma / dan yang mengandung minimal 2 nominal
  const commaList = s.match(/\d+(?:[.,]\d+)?\s*(?:ribu|rb|k|jt|juta|000)/gi) || [];
  if (commaList.length >= 2 && (/[,&+]|\bdan\b|\bsama\b|\bserta\b/.test(s) || pairMatches.length >= 2)) return true;

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE & MECHANISM FOR SPLIT REMAINDER (SISA NOMINAL)
// ─────────────────────────────────────────────────────────────────────────────
const pendingSplitRemainders = new Map(); // chatId -> { baseTx, items, totalNominal, storeName, remainder, timeoutId }

/**
 * Cek apakah ada pending split remainder untuk chatId tertentu.
 */
function hasPendingRemainder(chatId) {
  return pendingSplitRemainders.has(String(chatId));
}

/**
 * Batalkan pending split remainder jika ada.
 */
function cancelPendingRemainder(chatId) {
  const cid = String(chatId);
  const existing = pendingSplitRemainders.get(cid);
  if (existing && existing.timeoutId) clearTimeout(existing.timeoutId);
  pendingSplitRemainders.delete(cid);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER TEKS / VOICE → SPLIT ITEMS (via AI)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ekstrak JSON array secara presisi menggunakan balanced bracket matching,
 * tahan terhadap teks sebelum/sesudah maupun markdown fences.
 */
function _extractJsonArray(rawText) {
  if (!rawText) return null;
  let s = String(rawText);

  s = s.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1');

  const startIdx = s.indexOf('[');
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIdx = -1;

  for (let i = startIdx; i < s.length; i++) {
    const ch = s[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '[') depth++;
      else if (ch === ']') {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (endIdx === -1) return null;
  const candidate = s.substring(startIdx, endIdx + 1);

  try {
    const parsed = JSON.parse(candidate);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    try {
      const cleaned = candidate.replace(/,\s*([\]}])/g, '$1');
      const parsed2 = JSON.parse(cleaned);
      if (Array.isArray(parsed2)) return parsed2;
    } catch (_) {}
  }

  return null;
}

/**
 * Parse teks/voice natural menjadi array item split dengan kategori.
 *
 * @param {string} text        — Teks rincian dari user (e.g. "beras 100rb, jajan 20rb, sabun 30rb")
 * @param {number} totalNominal — Total nominal transaksi induk (dari email/user sebelumnya)
 * @param {string} storeName   — Nama toko/merchant (opsional, untuk konteks AI)
 * @returns {Promise<Array<{label: string, nominal: number, category: string}>>}
 */
async function parseSplitFromText(text, totalNominal = null, storeName = '') {
  const { callAI } = require('../core/AI_Router');
  const supabaseFinanceModule = require('../infrastructure/Supabase_Finance');

  // Ambil daftar kategori valid dari DB
  const categories = await supabaseFinanceModule.getCategoriesList();
  const validCatNames = categories.map(c => c.name).join('\n');

  const totalHint = totalNominal ? `Total transaksi induk adalah Rp${Number(totalNominal).toLocaleString('id-ID')}.` : '';
  const storeHint = storeName ? `Nama toko/merchant: "${storeName}".` : '';

  const prompt = `Kamu adalah sistem ekstraksi item belanja campuran untuk pencatatan keuangan.
${storeHint}
${totalHint}
User menyebutkan rincian pembelian berikut:
"${text}"

Tugasmu:
1. Identifikasi SETIAP item/kelompok pengeluaran beserta nominalnya yang SECARA NYATA disebutkan oleh user.
2. Kategorikan setiap item ke kategori yang PALING TEPAT dari daftar berikut:
${validCatNames}

ATURAN PENTING:
- JANGAN menambahkan item "Sisa belanja" atau item fiktif jika total item yang disebutkan kurang dari totalNominal. Cukup kembalikan item yang benar-benar disebutkan user.
- Jika totalNominal tidak diketahui, gunakan total dari item-item yang disebutkan.
- Output HANYA JSON array, tanpa markdown, tanpa penjelasan.

Output format TEPAT:
[
  {"label": "nama item singkat", "nominal": 100000, "category": "Kategori Valid"},
  {"label": "nama item singkat", "nominal": 20000, "category": "Kategori Valid"}
]`;

  let rawOutput;
  try {
    rawOutput = await callAI(prompt, { maxTokens: 500 });
  } catch (e) {
    console.error('[SPLIT_ENGINE] AI call failed:', e.message);
    return [];
  }

  // Parse JSON dari output AI dengan bulletproof bracket matching
  const items = _extractJsonArray(rawOutput);
  if (!items) {
    console.error('[SPLIT_ENGINE] JSON parse failed | Raw:', rawOutput?.substring(0, 200));
    return [];
  }

  // Validasi dan sanitasi
  const validItems = items
    .filter(item => item && item.label && typeof item.nominal === 'number' && item.nominal > 0)
    .map(item => ({
      label: String(item.label).trim().substring(0, 100),
      nominal: Math.round(item.nominal),
      category: String(item.category || 'Lainnya').trim()
    }));

  if (validItems.length < 2) {
    console.warn('[SPLIT_ENGINE] Warning: AI returned < 2 valid items. Raw AI output:', rawOutput?.substring(0, 200));
  } else {
    console.log(`[SPLIT_ENGINE] Successfully parsed ${validItems.length} items from text.`);
  }

  return validItems;
}

// ─────────────────────────────────────────────────────────────────────────────
// PARSER GAMBAR STRUK → SPLIT ITEMS (via Vision Engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse foto struk/nota menjadi array item split dengan kategori.
 *
 * @param {string} fileId       — Telegram file_id dari foto struk
 * @param {number} totalNominal — Total nominal transaksi induk
 * @returns {Promise<Array<{label: string, nominal: number, category: string}>>}
 */
async function parseSplitFromImage(fileId, totalNominal = null) {
  const visionEngine = require('../core/Vision_Engine');
  const supabaseFinanceModule = require('../infrastructure/Supabase_Finance');

  const categories = await supabaseFinanceModule.getCategoriesList();
  const validCatNames = categories.map(c => c.name).join(', ');

  const totalHint = totalNominal ? `Total transaksi: Rp${Number(totalNominal).toLocaleString('id-ID')}.` : '';

  const visionPrompt = `Ini adalah foto struk/nota belanja. ${totalHint}
Ekstrak SEMUA item/produk yang tertera beserta harganya.
Kategorikan ke salah satu: ${validCatNames}.
Output HANYA JSON array:
[{"label": "nama item", "nominal": 15000, "category": "Kategori Valid"}]
Jika bukan struk belanja, output: []`;

  try {
    const rawVision = await visionEngine.processTelegramImage(fileId, visionPrompt);

    const items = _extractJsonArray(rawVision);
    if (!items) {
      console.warn('[SPLIT_ENGINE] Vision output bukan JSON array murni. Fallback ke teks.');
      return await parseSplitFromText(rawVision, totalNominal, 'Struk Belanja');
    }

    return items
      .filter(item => item && item.label && typeof item.nominal === 'number' && item.nominal > 0)
      .map(item => ({
        label: String(item.label).trim().substring(0, 100),
        nominal: Math.round(item.nominal),
        category: String(item.category || 'Lainnya').trim()
      }));
  } catch (e) {
    console.error('[SPLIT_ENGINE] Vision parse failed:', e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUTOR: Simpan Split Items ke Supabase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Eksekusi split: simpan N baris transaksi baru dengan split_group_id yang sama.
 * Jika existingTxId diberikan, hapus transaksi induk setelah insert berhasil.
 *
 * @param {Array}  items          — Array item dari parseSplitFromText/Image
 * @param {Object} baseTx         — Data transaksi induk (date, account, paymentMethod, type)
 * @param {string} [existingTxId] — UUID transaksi induk di Supabase (jika split dari existing)
 * @returns {Promise<{success: number, failed: number, splitGroupId: string}>}
 */
async function executeSplit(items, baseTx, existingTxId = null) {
  if (!items || items.length === 0) {
    return { success: 0, failed: 0, splitGroupId: null };
  }

  const splitGroupId = randomUUID();
  let successCount = 0;
  let failedCount = 0;

  let accountName = baseTx.account;
  if (!accountName || String(accountName).trim().toLowerCase() === 'null') {
    const supabaseFinance = require('../infrastructure/Supabase_Finance');
    const accounts = await supabaseFinance.getAccountsList();
    if (accounts && accounts.length > 0) {
      accountName = accounts[0].name;
    } else {
      accountName = 'Tunai';
    }
  }

  console.log(`[SPLIT_ENGINE] Executing split: ${items.length} items, group=${splitGroupId}, fallbackAccount=${accountName}`);

  // Insert setiap item sebagai baris transaksi terpisah
  for (const item of items) {
    try {
      const supabaseFinance = require('../infrastructure/Supabase_Finance');
      const result = await supabaseFinance.writeTransaction({
        txType: baseTx.type || 'EXPENSE',
        nominal: item.nominal,
        categoryName: item.category,
        accountName: accountName,
        description: item.label,
        dateISO: baseTx.dateISO,
        timeHHMM: baseTx.timeHHMM || null,
        paymentMethod: baseTx.paymentMethod || null,
        splitGroupId,      // akan dipakai di writeTransaction
        splitLabel: item.label
      });

      if (result.status === 'SUCCESS') {
        successCount++;
        console.log(`[SPLIT_ENGINE] ✅ Saved item: "${item.label}" Rp${item.nominal.toLocaleString('id-ID')} → ${item.category}`);
      } else {
        failedCount++;
        console.warn(`[SPLIT_ENGINE] ❌ Failed to save item "${item.label}": ${result.reason}`);
      }
    } catch (e) {
      failedCount++;
      console.error(`[SPLIT_ENGINE] Error saving item "${item.label}":`, e.message);
    }
  }

  // Hapus transaksi induk jika split dari existing transaction
  if (existingTxId && successCount > 0) {
    try {
      const { data, error } = await require('../infrastructure/Supabase_Finance')
        ._getClient()
        .from('transactions')
        .delete()
        .eq('id', existingTxId);

      if (!error) {
        console.log(`[SPLIT_ENGINE] ✅ Deleted parent transaction: ${existingTxId}`);
      } else {
        console.error(`[SPLIT_ENGINE] Failed to delete parent tx: ${error.message}`);
      }
    } catch (e) {
      console.error(`[SPLIT_ENGINE] Error deleting parent tx:`, e.message);
    }
  }

  return { success: successCount, failed: failedCount, splitGroupId };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTER: Pesan Konfirmasi Split untuk Telegram
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format pesan konfirmasi split yang rapi untuk dikirim ke Telegram.
 *
 * @param {Array}  items       — Array item split yang sudah disimpan
 * @param {number} total       — Total nominal keseluruhan
 * @param {string} storeName   — Nama toko/merchant (opsional)
 * @param {number} successCount — Jumlah item yang berhasil disimpan
 * @returns {string} — Pesan HTML untuk Telegram
 */
function formatSplitMessage(items, total, storeName = '', successCount = null) {
  const storeLabel = storeName ? ` <b>${storeName}</b>` : '';
  const totalFmt = `Rp${Number(total).toLocaleString('id-ID')}`;
  const itemCount = items.length;
  const savedCount = successCount !== null ? successCount : itemCount;

  let lines = items.map((item, i) => {
    const nomFmt = `Rp${Number(item.nominal).toLocaleString('id-ID')}`;
    return `  ${i + 1}. <b>${item.category}</b> — ${nomFmt}\n      📝 ${item.label}`;
  }).join('\n');

  return `✂️ <b>TRANSAKSI SPLIT DICATAT</b>${storeLabel}\n` +
    `<b>Total:</b> ${totalFmt} | <b>Dipecah menjadi ${itemCount} kategori</b>\n\n` +
    `<b>Rincian Pengeluaran:</b>\n${lines}\n\n` +
    `<i>✅ ${savedCount} dari ${itemCount} item tersimpan di database.</i>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROMPTING & TIMEOUT FOR SPLIT REMAINDER (KEKURANGAN NOMINAL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle split items ketika ada potensi kekurangan nominal (remainder).
 * Jika sisa > 500 rupiah:
 * - Tanya dulu ke user: "Tuan, masih ada sisa RpX yang belum disebutkan. Untuk apa?"
 * - Set watchdog timeout 5 menit -> otomatis simpan item "Sisa split [toko]"
 * Jika sisa <= 500 rupiah: langsung jalankan executeSplit.
 */
async function handleSplitWithRemainder(chatId, splitItems, totalNominal, baseTx, storeName = '', existingTxId = null, respondToTelegramFn = null) {
  // Normalize payment method to prevent check constraint violations
  if (baseTx.paymentMethod) {
    const txt = String(baseTx.paymentMethod).toLowerCase();
    let normalizedPM = 'QRIS';
    if (txt.includes('qris')) normalizedPM = 'QRIS';
    else if (txt.includes('transfer') || txt.includes('tf')) normalizedPM = 'Transfer bank';
    else if (txt.includes('tunai') || txt.includes('cash')) normalizedPM = 'Tunai';
    else if (txt.includes('kredit') || txt.includes('cc')) normalizedPM = 'Kartu Kredit';
    else normalizedPM = null;
    baseTx.paymentMethod = normalizedPM;
  }

  const sumItems = splitItems.reduce((s, i) => s + (Number(i.nominal) || 0), 0);
  const remainder = (totalNominal && totalNominal > 0) ? (totalNominal - sumItems) : 0;

  // 1. Cek Kekurangan Nominal
  if (remainder > 500) {
    const cid = String(chatId);
    cancelPendingRemainder(cid);

    const remFmt = `Rp${Math.round(remainder).toLocaleString('id-ID')}`;
    const totFmt = `Rp${Math.round(totalNominal).toLocaleString('id-ID')}`;
    const sumFmt = `Rp${Math.round(sumItems).toLocaleString('id-ID')}`;

    // Set 5-min watchdog timeout
    const timeoutId = setTimeout(async () => {
      const pending = pendingSplitRemainders.get(cid);
      if (pending && pending.waitingFor === 'REMAINDER') {
        pendingSplitRemainders.delete(cid);
        const autoRemItem = {
          label: `Sisa split ${storeName || 'Belanja'}`,
          nominal: remainder,
          category: 'Lainnya'
        };
        const finalItems = [...splitItems, autoRemItem];
        const res = await executeSplit(finalItems, baseTx, existingTxId);
        const autoMsg = `⏳ <i>Waktu habis (5 menit).</i>\nSisa <b>${remFmt}</b> disimpan otomatis sebagai 'Sisa split ${storeName || 'Belanja'}' (Lainnya).\n\n` +
          formatSplitMessage(finalItems, totalNominal, storeName, res.success);
        if (respondToTelegramFn) {
          try { await respondToTelegramFn(autoMsg); } catch (_) {}
        } else {
          try { await require('../interfaces/webhook').sendTelegramOutbound(autoMsg, true); } catch (_) {}
        }
      }
    }, 5 * 60 * 1000);

    pendingSplitRemainders.set(cid, {
      baseTx,
      items: splitItems,
      totalNominal,
      storeName,
      remainder,
      existingTxId,
      timeoutId,
      waitingFor: 'REMAINDER',
      respondToTelegramFn
    });

    return `❓ <b>Tuan, dari total ${totFmt} baru disebutkan ${sumFmt}.</b>\n\n` +
      `Masih ada sisa <b>${remFmt}</b> yang belum disebutkan. Untuk apa?\n` +
      `<i>(Tanpa balasan dalam 5 menit, N.E.X.A akan membuat baris item dengan kategori Lainnya: "Sisa split ${storeName || 'Belanja'}").</i>`;
  }

  // 2. Cek Kekurangan Metode Pembayaran
  if (!baseTx.paymentMethod) {
    const cid = String(chatId);
    cancelPendingRemainder(cid);
    
    const timeoutId = setTimeout(async () => {
      const pending = pendingSplitRemainders.get(cid);
      if (pending && pending.waitingFor === 'PAYMENT_METHOD') {
        pendingSplitRemainders.delete(cid);
        // Fallback default (kosongkan / null jika diabaikan)
        pending.baseTx.paymentMethod = null; 
        const res = await executeSplit(pending.items, pending.baseTx, pending.existingTxId);
        const totalDisplay = pending.totalNominal || pending.items.reduce((s, i) => s + i.nominal, 0);
        const autoMsg = `⏳ <i>Waktu habis (5 menit).</i>\nTransaksi split otomatis disimpan.\n\n` +
          formatSplitMessage(pending.items, totalDisplay, pending.storeName, res.success);
        if (respondToTelegramFn) {
          try { await respondToTelegramFn(autoMsg); } catch (_) {}
        } else {
          try { await require('../interfaces/webhook').sendTelegramOutbound(autoMsg, true); } catch (_) {}
        }
      }
    }, 5 * 60 * 1000);

    pendingSplitRemainders.set(cid, {
      baseTx,
      items: splitItems,
      totalNominal,
      storeName,
      remainder: 0,
      existingTxId,
      timeoutId,
      waitingFor: 'PAYMENT_METHOD',
      respondToTelegramFn
    });

    const totalDisplay = totalNominal || sumItems;
    return formatSplitMessage(splitItems, totalDisplay, storeName, null) + 
      `\n\n❓ <b>Satu hal lagi Tuan.</b>\nMohon informasikan <b>metode pembayarannya (QRIS/Transfer/Tunai/Kredit)</b> untuk transaksi split ini. <i>(Atau abaikan jika ingin disimpan otomatis dalam 5 menit).</i>`;
  }

  // Jika sisa <= 500 dan payment method sudah ada
  const res = await executeSplit(splitItems, baseTx, existingTxId);
  const totalDisplay = totalNominal || sumItems;
  return formatSplitMessage(splitItems, totalDisplay, storeName, res.success);
}

/**
 * Intersep balasan user untuk pertanyaan kekurangan nominal split.
 */
async function resolveRemainderReply(chatId, userText) {
  const cid = String(chatId);
  const pending = pendingSplitRemainders.get(cid);
  if (!pending) return null;

  cancelPendingRemainder(cid);

  if (pending.waitingFor === 'PAYMENT_METHOD') {
    const txt = userText.trim().toLowerCase();
    let normalizedPM = 'QRIS';
    if (txt.includes('qris')) normalizedPM = 'QRIS';
    else if (txt.includes('transfer') || txt.includes('tf')) normalizedPM = 'Transfer bank';
    else if (txt.includes('tunai') || txt.includes('cash')) normalizedPM = 'Tunai';
    else if (txt.includes('kredit') || txt.includes('cc')) normalizedPM = 'Kartu Kredit';
    else normalizedPM = null;

    pending.baseTx.paymentMethod = normalizedPM;
    const res = await executeSplit(pending.items, pending.baseTx, pending.existingTxId);
    const totalDisplay = pending.totalNominal || pending.items.reduce((s, i) => s + i.nominal, 0);
    return `✅ <b>Metode Pembayaran Ditambahkan (${normalizedPM}).</b>\n\n` + formatSplitMessage(pending.items, totalDisplay, pending.storeName, res.success);
  }

  const { callAI } = require('../core/AI_Router');
  const supabaseFinanceModule = require('../infrastructure/Supabase_Finance');
  const categories = await supabaseFinanceModule.getCategoriesList();
  const validCatNames = categories.map(c => c.name).join('\n');

  // Ekstrak label bersih dan kategorikan
  const prompt = `Ekstrak nama barang/pengeluaran (singkat, max 3 kata) dan kategorikan ke salah satu kategori valid dari teks berikut.
Keterangan user: "${userText}"
Nominal: Rp${pending.remainder}

Daftar Kategori Valid:
${validCatNames}

Output HANYA dalam format persis seperti ini, tanpa tambahan apapun:
NAMA_BARANG|NAMA_KATEGORI

Contoh Output:
Sunscreen|Skincare & Kosmetik`;

  let aiLabel = userText.trim();
  let aiCat = 'Lainnya';
  try {
    const raw = await callAI(prompt, { maxTokens: 50 });
    if (raw && raw.includes('|')) {
      const parts = raw.split('|');
      if (parts[0].trim()) aiLabel = parts[0].trim();
      if (parts[1].trim()) aiCat = parts[1].trim();
    } else {
      aiCat = raw.trim(); // Fallback jika model menolak pakai format pipe
    }
  } catch (_) {}

  const addedItem = {
    label: aiLabel || `Sisa split ${pending.storeName || 'Belanja'}`,
    nominal: pending.remainder,
    category: aiCat
  };

  const finalItems = [...pending.items, addedItem];
  
  // Lanjutkan cycle: panggil handleSplitWithRemainder lagi menggunakan finalItems.
  // Ini otomatis mengecek apakah butuh paymentMethod atau bisa langsung disimpan.
  return handleSplitWithRemainder(chatId, finalItems, pending.totalNominal, pending.baseTx, pending.storeName, pending.existingTxId, pending.respondToTelegramFn);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  isSplitIntent,
  parseSplitFromText,
  parseSplitFromImage,
  executeSplit,
  formatSplitMessage,
  hasPendingRemainder,
  cancelPendingRemainder,
  handleSplitWithRemainder,
  resolveRemainderReply,
  _extractJsonArray,
};

