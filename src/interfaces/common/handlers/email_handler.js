'use strict';
// ============================================================
// N.E.X.A — COMMON EMAIL HANDLER
// Handles Gmail operations (READ, SEND, DELETE) across interfaces
// ============================================================

const gmailClient = require('../../../infrastructure/Gmail_Client');
const helpers     = require('../helpers');

function _getPendingEmail(context) {
  if (context.pendingEmailContext) return context.pendingEmailContext;
  if (context.pendingEmail && typeof context.pendingEmail.get === 'function') {
    return context.pendingEmail.get(context.sessionKey);
  }
  return null;
}

function _setPendingEmail(context, val) {
  if (typeof context.setPendingEmailContext === 'function') {
    return context.setPendingEmailContext(val);
  }
  if (context.pendingEmail && typeof context.pendingEmail.set === 'function') {
    if (val === null) context.pendingEmail.delete(context.sessionKey);
    else context.pendingEmail.set(context.sessionKey, val);
  }
}

async function handleEmailIntent(routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const action = ed.action || 'READ';
  const textInput = context.textInput || '';
  const pendingEmail = _getPendingEmail(context);
  const isTelegram = context.platform === 'telegram' || context.isTelegram;

  if (action === 'READ') {
    const searchKeyword = ed.search_keyword || '';
    const defaultQuery = context.emailDefaults?.defaultQuery !== undefined
      ? context.emailDefaults.defaultQuery
      : (isTelegram ? '' : '(from:noreply.livin@bankmandiri.co.id OR from:noreply@jago.com OR livin)');
    const defaultFetch = context.emailDefaults?.defaultFetch || (isTelegram ? 30 : 20);
    const baseQuery = searchKeyword || defaultQuery;
    const requestedLimit = Math.min(parseInt(ed.max_results, 10) || 5, 10);
    const followUpPrevious = Boolean(ed.before_current);

    let emails = [];
    let contextCursorIndex = 0;
    let candidateEmailsForContext = [];

    const temporalHint = helpers.getEmailTemporalFilterFromText(textInput);
    const dayHint = helpers.parseDayOfMonthHint(textInput);

    if (followUpPrevious && pendingEmail) {
      const fullBatch = await gmailClient.getLatestEmails(searchKeyword || pendingEmail.searchKeyword || baseQuery, 20);
      candidateEmailsForContext = fullBatch;
      const nextCursor = (pendingEmail.cursorIndex || 0) + 1;
      if (nextCursor < fullBatch.length) {
        emails = [fullBatch[nextCursor]];
        contextCursorIndex = nextCursor;
      }
    } else {
      const temporalQuerySuffix = (typeof helpers.getTemporalGmailQuerySuffix === 'function')
        ? helpers.getTemporalGmailQuerySuffix(temporalHint, dayHint)
        : '';
      const queryWithTemporalWindow = `${baseQuery}${temporalQuerySuffix}`;
      const candidateEmails = await gmailClient.getLatestEmails(queryWithTemporalWindow, Math.max(requestedLimit, defaultFetch));
      let scopedEmails = helpers.filterEmailsByTemporalHint(candidateEmails, temporalHint);
      if (dayHint) scopedEmails = helpers.filterEmailsByDayOfMonth(scopedEmails, dayHint);

      candidateEmailsForContext = candidateEmails;
      emails = scopedEmails.slice(0, requestedLimit);
    }

    if (isTelegram) {
      if (emails.length === 0) {
        if (temporalHint?.type === 'yesterday') {
          return '📭 Tidak ada email yang cocok untuk <b>hari kemarin</b>.';
        } else if (temporalHint?.type === 'today') {
          return '📭 Tidak ada email yang cocok untuk <b>hari ini</b>.';
        } else {
          return 'Kotak masuk kosong atau tidak ada email yang cocok dengan pencarian.';
        }
      }

      const esc = (s) => helpers.escapeHtml(s || '');
      const emailLines = emails.map(e => {
        const parsedNominal = helpers.extractNominalFromEmail(e);
        const nominalLine = parsedNominal ? `\n<b>Nominal:</b> Rp${parsedNominal.toLocaleString('id-ID')}` : '';
        return `[${esc(e.date)}]\n<b>Dari:</b> ${esc(e.from)}\n<b>Subjek:</b> ${esc(e.subject)}${nominalLine}\n<b>Snippet:</b> <i>${esc(e.snippet)}</i>\n`;
      }).join('\n---\n');

      _setPendingEmail(context, {
        searchKeyword,
        lastLimit: requestedLimit,
        cursorIndex: contextCursorIndex,
        lastBatch: candidateEmailsForContext.slice(0, 50),
        askedAt: Date.now()
      });

      return `📧 <b>Email Terbaru Anda (${emails.length}):</b>\n\n${emailLines}`;
    }

    // CLI / Non-Telegram (Plain text)
    if (emails.length === 0) {
      return '📭 Kotak masuk kosong atau tidak ada email yang cocok dengan kriteria pencarian.';
    }

    const emailLines = emails.map(e => {
      const parsedNominal = helpers.extractNominalFromEmail(e);
      const nominalLine = parsedNominal ? `\nNominal: Rp${parsedNominal.toLocaleString('id-ID')}` : '';
      return `[${e.date}]\nDari: ${e.from}\nSubjek: ${e.subject}${nominalLine}\nSnippet: ${e.snippet}\n`;
    }).join('\n---\n');

    _setPendingEmail(context, {
      searchKeyword,
      lastLimit: requestedLimit,
      cursorIndex: contextCursorIndex,
      lastBatch: candidateEmailsForContext.slice(0, 50),
      askedAt: Date.now()
    });

    return `📧 Email Terbaru (${emails.length}):\n\n${emailLines}`;
  }

  if (action === 'SEND') {
    const success = await gmailClient.sendEmail(ed.to, ed.subject, ed.content);
    _setPendingEmail(context, null);
    const esc = isTelegram ? helpers.escapeHtml : (s) => String(s || '');
    return success ? `✅ Email berhasil dikirim ke ${esc(ed.to)}.` : '❌ Gagal mengirim email.';
  }

  if (action === 'DELETE') {
    const emails = await gmailClient.getLatestEmails(ed.search_keyword, 1);
    _setPendingEmail(context, null);
    if (emails.length > 0) {
      const success = await gmailClient.deleteEmail(emails[0].id);
      const esc = isTelegram ? helpers.escapeHtml : (s) => String(s || '');
      return success ? `🗑️ Email dengan subjek "${esc(emails[0].subject)}" berhasil dihapus.` : '❌ Gagal menghapus email.';
    }
    return 'Tidak ditemukan email dengan kata kunci tersebut untuk dihapus.';
  }

  return null;
}

module.exports = {
  handleEmailIntent
};
