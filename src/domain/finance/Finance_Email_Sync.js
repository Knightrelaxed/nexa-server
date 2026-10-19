'use strict';
/**
 * Finance_Email_Sync - Gmail (Mandiri) mutation email polling and import.
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
    console.log('[FINANCE] Polling for new Finance emails...');
    const emails = await gmailClient.getLatestEmails('from:noreply.livin@bankmandiri.co.id newer_than:4d', 15);
    if (!emails || emails.length === 0) return 0;

    let newCount = 0;
    for (const e of emails) {
      const blob = `${e.subject || ''}\n${e.body || ''}\n${e.snippet || ''}`;
      
      // Extract Nominal (Including Admin Fees / Biaya Transfer)
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

      if (isNaN(nominal) || nominal <= 0) continue;

      // Check for failed transactions
      const isFailed = blob.toLowerCase().includes('tidak berhasil') || blob.toLowerCase().includes('gagal');

      // Extract Merchant/Destination
      let destination = 'Auto-Sync Transaction';
      const merchantMatch = blob.match(/penerima\s+([a-z0-9\s\&\.\-]+)/i);
      if (merchantMatch?.[1]) {
        let rawDest = merchantMatch[1].trim().split(/[\r\n]+/)[0]; // Take only the first line safely
        rawDest = rawDest.replace(/&nbsp;?/ig, ' ');
        rawDest = rawDest.replace(/&\w+;?/g, ' '); // Strip other HTML entities
        rawDest = rawDest.replace(/\s*-?\s*ID\s+Tanggal.*$/i, ''); // Strip trailing ID Tanggal
        rawDest = rawDest.replace(/\s*-?\s*Tanggal.*$/i, ''); // Strip trailing Tanggal
        destination = rawDest.replace(/\s+/g, ' ').trim().substring(0, 80);
      }

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
        // AUDIT FIX (CRITICAL): Use sendTelegramOutbound (Cloudflare proxy) — direct axios.post to
        // api.telegram.org is BLOCKED on HF Docker. Failed-transfer alerts had NO Watchdog recovery
        // path, so they were permanently silently lost. Now routed through the proxy.
        try {
          const nominalFmt = `Rp${nominal.toLocaleString('id-ID')}`;
          const failedMsg = `⚠️ <b>TRANSFER GAGAL</b>\n\nTujuan: ${destination}\nNominal: ${nominalFmt}\n\n<i>N.E.X.A mengabaikan transaksi ini dan tidak mencatatnya ke dalam catatan keuangan Anda.</i>`;
          const { sendTelegramMessage } = require('../../utils/telegram_network');
          await sendTelegramMessage(failedMsg, env.TELEGRAM_CHAT_ID, env.TELEGRAM_BOT_TOKEN);
        } catch (_sendErr) {
          console.warn('[FINANCE] Failed transfer alert could not be sent:', _sendErr.message);
        }
        continue;
      }

      newCount++;

      // Let AI make an initial guess for the category based on the destination name.
      // Uses _autoCategorizeMerchant (lightweight, dedicated AI categorizer)
      // instead of the expensive routeUserMessage (full routing engine).
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
        compositeKey,
        isAutoSyncEmail: true
      };

      try {
        const msg = await requestTransactionConfirmation(tx, 'SINKRONISASI KEUANGAN TERBARU', compositeKey);
        if (msg) {
          // AUDIT FIX: Use sendTelegramOutbound (Cloudflare proxy) instead of direct axios.post.
          // Direct calls to api.telegram.org are BLOCKED on HF Docker. Previously relied on
          // 90-second Watchdog retry as a workaround. Now sends immediately via proxy.
          const { sendTelegramMessage } = require('../../utils/telegram_network');
          await sendTelegramMessage(msg, env.TELEGRAM_CHAT_ID, env.TELEGRAM_BOT_TOKEN);
          // Mark as sent so Watchdog doesn't redundantly resend 90s later
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
};
