'use strict';
/**
 * Finance_Email_Sync - Multi-Bank (Mandiri & Jago) mutation email polling and import.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
const supabase = require('../../infrastructure/Supabase_Memories');
const gmailClient = require('../../infrastructure/Gmail_Client');
const env = require('../../config/env');
const { _autoCategorizeMerchant, _parseFlexibleCurrency } = require('./Finance_Helpers');
const { pendingConfirmations } = require('./Finance_State');
const { requestTransactionConfirmation } = require('./Finance_Confirmations');

let isPollingFinance = false;

/**
 * Detect bank provider from email metadata (sender, subject, body).
 * Returns: 'JAGO' | 'MANDIRI'
 */
function _detectProvider(email, blob) {
  const fromLower = String(email?.from || '').toLowerCase();
  const blobLower = String(blob || '').toLowerCase();
  const subjLower = String(email?.subject || '').toLowerCase();

  if (
    fromLower.includes('jago.com') ||
    blobLower.includes('bertransaksi dengan jago') ||
    blobLower.includes('bank jago') ||
    blobLower.includes('@jago.com') ||
    subjLower.includes('transaksi dengan jago')
  ) {
    return 'JAGO';
  }

  return 'MANDIRI';
}

/**
 * Parse Bank Mandiri transaction email
 */
function _parseMandiriTransaction(blob, email) {
  let nominal = 0;
  
  // Try to find "Total Transaksi" first
  const totalMatch = blob.match(/(?:total transaksi|total pembayaran|total)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
  if (totalMatch) {
    nominal = _parseFlexibleCurrency(totalMatch[1]);
  } else {
    // Fallback: Find nominal and add admin fee if exists
    const nominalMatch = blob.match(/(?:nominal transaksi|jumlah transfer|nominal|rp)\s*(?:transaksi|transfer)?\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
    if (nominalMatch) {
      nominal = _parseFlexibleCurrency(nominalMatch[1]);
    }
    
    const adminMatch = blob.match(/(?:biaya transfer|biaya admin|biaya)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
    if (adminMatch && !isNaN(nominal)) {
      const adminFee = _parseFlexibleCurrency(adminMatch[1]);
      if (!isNaN(adminFee)) {
        nominal += adminFee;
      }
    }
  }

  const isFailed = blob.toLowerCase().includes('tidak berhasil') || blob.toLowerCase().includes('gagal');

  let destination = 'Auto-Sync Transaction';
  const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
  if (merchantMatch?.[1]) {
    let rawDest = merchantMatch[1].trim().split(/[\r\n]+/)[0];
    rawDest = rawDest.replace(/&nbsp;?/ig, ' ');
    rawDest = rawDest.replace(/&\w+;?/g, ' ');
    rawDest = rawDest.replace(/\s*-?\s*ID\s+Tanggal.*$/i, '');
    rawDest = rawDest.replace(/\s*-?\s*Tanggal.*$/i, '');
    destination = rawDest.replace(/\s+/g, ' ').trim().substring(0, 80);
  }

  const paymentMethod = blob.toLowerCase().includes('dengan qr') ? 'QRIS' : 'Transfer bank';

  return {
    provider: 'MANDIRI',
    account: 'Bank Mandiri',
    nominal,
    destination,
    paymentMethod,
    isFailed
  };
}

/**
 * Parse Bank Jago transaction email
 */
function _parseJagoTransaction(blob, email) {
  let nominal = 0;
  // Match "Jumlah Rp 6.500" or "Total Rp ..." or "Nominal Rp ..."
  const jumlahMatch = blob.match(/(?:jumlah|total|nominal)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
  if (jumlahMatch) {
    nominal = _parseFlexibleCurrency(jumlahMatch[1]);
  }

  // Detect Tip (e.g. "Jumlah Tip Rp 0" or "Tip Rp 5.000")
  const tipMatch = blob.match(/(?:jumlah tip|tip)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
  if (tipMatch && !isNaN(nominal)) {
    const tip = _parseFlexibleCurrency(tipMatch[1]);
    if (!isNaN(tip) && tip > 0) {
      nominal += tip;
    }
  }

  // Detect Admin / Transfer fee if any
  const feeMatch = blob.match(/(?:biaya transaksi|biaya transfer|biaya admin|biaya)\s*rp\.?\s*([0-9][0-9\.\,]+)/i);
  if (feeMatch && !isNaN(nominal)) {
    const fee = _parseFlexibleCurrency(feeMatch[1]);
    if (!isNaN(fee) && fee > 0) {
      nominal += fee;
    }
  }

  // Check for failed status
  const statusMatch = blob.match(/status transaksi\s*([a-z0-9\s]+)/i);
  const statusVal = statusMatch ? statusMatch[1].toLowerCase() : '';
  const isFailed = statusVal.includes('gagal') ||
                   statusVal.includes('tidak berhasil') ||
                   blob.toLowerCase().includes('status transaksi gagal') ||
                   blob.toLowerCase().includes('transaksi tidak berhasil');

  // Extract Destination / Merchant
  let rawDest = '';
  // 1. From "Ke <Merchant>"
  const keMatch = blob.match(/\bKe\s+([^\r\n]+)/i);
  if (keMatch?.[1]) {
    rawDest = keMatch[1].trim();
  } else {
    // Fallback: "Penerima <Nama>"
    const penerimaMatch = blob.match(/\bPenerima\s+([^\r\n]+)/i);
    if (penerimaMatch?.[1]) {
      rawDest = penerimaMatch[1].trim();
    }
  }

  // 2. Fallback to Subject: "Kamu telah membayar ke <Merchant>"
  if (!rawDest && email?.subject) {
    const subjMatch = email.subject.match(/(?:kamu telah membayar ke|membayar ke)\s+(.*?)(?:💸|\s*$)/i);
    if (subjMatch?.[1]) {
      rawDest = subjMatch[1].trim();
    }
  }

  if (!rawDest) rawDest = 'Auto-Sync Jago';

  // Sanitize
  rawDest = rawDest.replace(/&nbsp;?/ig, ' ').replace(/&\w+;?/g, ' ');
  rawDest = rawDest.replace(/[\r\n].*$/s, '').trim();

  // Extract Merchant Location (e.g. "Lokasi Merchant Jakarta" or "Jakarta Selatan")
  const locMatch = blob.match(/lokasi merchant\s+([^\r\n]+)/i);
  if (locMatch?.[1]) {
    const locClean = locMatch[1].trim().replace(/&nbsp;?/ig, ' ').replace(/&\w+;?/g, ' ').trim();
    if (locClean && !rawDest.toLowerCase().includes(locClean.toLowerCase())) {
      rawDest = `${rawDest} ${locClean}`;
    }
  }

  const destination = rawDest.replace(/\s+/g, ' ').trim().substring(0, 80);

  // Payment Method:
  // Jago email with "Nama Acquirer", "ID Terminal", "PAN Nasabah", or subject "Kamu telah membayar ke" is QRIS
  const isQRIS = /nama acquirer|id terminal|pan nasabah/i.test(blob) ||
                 /kamu telah membayar ke/i.test(email?.subject || '');
  const paymentMethod = isQRIS ? 'QRIS' : 'Transfer bank';

  return {
    provider: 'JAGO',
    account: 'Bank Jago',
    nominal,
    destination,
    paymentMethod,
    isFailed
  };
}

/**
 * Automatically poll Gmail for new financial transaction emails, parse them, and record them.
 * Relies on Zero-Duplication Engine to prevent duplicate entries across polls.
 */
async function pollFinanceEmails() {
  if (isPollingFinance) {
    console.log('[FINANCE] Polling skipped: Another instance is already polling.');
    return 0;
  }
  isPollingFinance = true;
  try {
    console.log('[FINANCE] Polling for new Finance emails (Mandiri & Jago)...');
    const emails = await gmailClient.getLatestEmails(
      '(from:noreply.livin@bankmandiri.co.id OR from:noreply@jago.com) newer_than:4d',
      20
    );
    if (!emails || emails.length === 0) return 0;

    let newCount = 0;
    for (const e of emails) {
      const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
      const provider = _detectProvider(e, blob);
      const parsed = provider === 'JAGO'
        ? _parseJagoTransaction(blob, e)
        : _parseMandiriTransaction(blob, e);

      const nominal = parsed.nominal;
      if (isNaN(nominal) || nominal <= 0) continue;

      const isFailed = parsed.isFailed;
      const destination = parsed.destination;
      const account = parsed.account;
      const paymentMethod = parsed.paymentMethod;

      // Date parsing
      let dateIso = new Date().toISOString();
      const transactionTime = e.date ? new Date(e.date) : new Date();
      if (!isNaN(transactionTime.getTime())) dateIso = transactionTime.toISOString();

      // SAFETY GUARD: Abaikan email/transaksi yang berumur lebih dari 4 hari
      // Mencegah re-impor transaksi lama yang data dedup-nya sudah dibersihkan oleh cleanupOldFinanceDedup(7)
      if (Date.now() - transactionTime.getTime() > 4 * 24 * 60 * 60 * 1000) {
        continue;
      }

      const cleanMerchant = destination.toLowerCase().replace(/[^a-z0-9]/g, '');
      const compositeKey = e.id ? `gmail_${e.id}` : `${nominal}_${cleanMerchant}`;

      // Check if already pending or duplicated
      if (pendingConfirmations.has(compositeKey)) continue;
      const isDuplicate = await supabase.isDuplicateTransaction(compositeKey, transactionTime);
      if (isDuplicate) continue;

      if (isFailed) {
        // Log to Supabase so we don't notify again
        await supabase.logTransactionKey(compositeKey, transactionTime, 'FAILED_TRANSFER');
        try {
          const nominalFmt = `Rp${nominal.toLocaleString('id-ID')}`;
          const accountSuffix = account === 'Bank Jago' ? ' (Bank Jago)' : '';
          const failedMsg = `⚠️ <b>TRANSFER GAGAL${accountSuffix}</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam catatan keuangan Anda.</i>`;
          const { sendTelegramMessage } = require('../../utils/telegram_network');
          await sendTelegramMessage(failedMsg, env.TELEGRAM_CHAT_ID, env.TELEGRAM_BOT_TOKEN);
        } catch (_sendErr) {
          console.warn('[FINANCE] Failed transfer alert could not be sent:', _sendErr.message);
        }
        continue;
      }

      newCount++;

      // Let AI make an initial guess for the category based on the destination name.
      let guessedCategory = 'Lainnya';
      try {
        guessedCategory = await _autoCategorizeMerchant(destination, null);
      } catch (e) {
        console.warn('[FINANCE] Pre-categorization failed:', e.message);
      }

      const tx = {
        nominal,
        type: 'EXPENSE',
        destination,
        category: guessedCategory,
        description: '[Menunggu Detail User]',
        time: dateIso,
        suggestedAccount: account,
        payment_method: paymentMethod,
        compositeKey,
        isAutoSyncEmail: true
      };

      try {
        const msg = await requestTransactionConfirmation(tx, 'SINKRONISASI KEUANGAN TERBARU', compositeKey);
        if (msg) {
          const { sendTelegramMessage } = require('../../utils/telegram_network');
          await sendTelegramMessage(msg, env.TELEGRAM_CHAT_ID, env.TELEGRAM_BOT_TOKEN);
          await supabase.markPendingTransactionSent(compositeKey);
        }
      } catch (err) {
        console.error('[FINANCE] Confirmation send failed (Watchdog will retry in 90s):', err.message);
      }
    }

    return newCount;
  } catch (error) {
    console.error('[FINANCE] Polling failed:', error.message);
    return 0;
  } finally {
    isPollingFinance = false;
  }
}

module.exports = {
  pollFinanceEmails,
  _detectProvider,
  _parseMandiriTransaction,
  _parseJagoTransaction,
};
