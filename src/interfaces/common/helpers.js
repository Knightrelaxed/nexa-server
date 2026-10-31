'use strict';
// ============================================================
// N.E.X.A — COMMON INTERFACE HELPERS
// Shared utilities across all interfaces (Telegram, CLI, Mobile)
// ============================================================

/**
 * Strips HTML tags and unescapes standard entities for terminal/CLI output
 */
function stripHtml(str) {
  return String(str || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"');
}

/**
 * Escapes HTML entities for Telegram HTML parse_mode
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Formats memory storage reply with AI message or fallback + badge
 */
function formatMemoryReply(aiReply, fallbackText, badgeText) {
  const base = (aiReply && typeof aiReply === 'string' && aiReply.trim().length > 3)
    ? aiReply.trim()
    : fallbackText;
  return `${base}\n\n${badgeText}`;
}

/**
 * Classifies whether a fact is about N.E.X.A or user (Tuan Faqih)
 */
function isFactAboutNexa(fact) {
  const f = fact.toLowerCase().trim();
  let score = 0;

  if (/\b(aku|saya|gue|gw)\b/.test(f)) score -= 2;
  const hasTuanName = /\b(tuan|faqih|hidayatulloh)\b/.test(f);
  const tuanIsSubject = /^(tuan|faqih)/.test(f) || /\b(tuan faqih|faqih)\s+(punya|memiliki|suka|biasa|kuliah|adalah)\b/.test(f);
  if (hasTuanName && tuanIsSubject) score -= 2;
  else if (hasTuanName) score -= 1;
  if (/\w+ku\b/.test(f) && !/\b(namaku|diriku sebagai)\b/.test(f)) score -= 1;

  if (/\b(nexa|n\.e\.x\.a)\b/.test(f)) score += 3;
  if (/^(kamu|anda|kau)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(adalah|itu|merupakan|diciptakan|dibuat|diluncurkan|punya|memiliki|bernama|disebut|bisa|dapat|mampu|tidak bisa|tidak mampu|sering|selalu|harus|jangan)\b/.test(f)) score += 2;
  if (/\b(diciptakan|dibuat|diluncurkan|lahir|dirancang|diprogram|dibangun)\b/.test(f)) score += 1;
  if (/\b(namamu|nama kamu|nama asisten|versimu|versi kamu|kemampuanmu|kemampuan kamu|identitasmu)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(bisa|dapat|mampu|tidak bisa|tidak mampu|belum bisa)\b/.test(f)) score += 1;
  if (/^(bot|asisten|ai)\b/.test(f)) score += 2;
  if (/\b(bot|asisten ai|model ai|sistem ai|ai asisten|kecerdasan buatan)\b/.test(f)) score += 1;
  if (/\b(dirimu|diri kamu|diri anda)\b/.test(f)) score += 2;
  if (/\b(ingat ya|catat ini|harap|tolong jangan|jangan terlalu|sebaiknya kamu|kamu seharusnya|kamu perlu|kamu harus|kamu sebaiknya)\b/.test(f)) score += 1;
  if (/\b(ternyata kamu|kamu ternyata|sebenarnya kamu|rupanya kamu)\b/.test(f)) score += 2;
  if (/\b(format (jawaban|balasan|respons)|gaya (bahasa|bicara|komunikasi)|responsmu|balasanmu|jawabanmu)\b/.test(f)) score += 1;

  return score > 0;
}

/**
 * Classifies fact about N.E.X.A into proper self-model layer
 */
function classifySelfModelLayer(fact) {
  const f = fact.toLowerCase();
  // 1. LIMITATIONS
  if (/\b(tidak bisa|tidak mampu|belum bisa|belum mampu|gagal|lupa|terbatas|kendala|kesulitan|error|bug|lambat|keterbatasan|kelemahan)\b/.test(f)) return 'LIMITATIONS';
  // 2. CORRECTIONS
  if (/\b(ingat ya|catat ini|jangan|tolong jangan|seharusnya|harap|perbaiki|salah|keliru|koreksi|ralat)\b/.test(f)) return 'CORRECTIONS';
  if (/\b(ternyata kamu|kamu ternyata)\b/.test(f) && !/\b(bisa|mampu|dapat|berhasil)\b/.test(f)) return 'CORRECTIONS';
  // 3. COMMUNICATION_STYLE
  if (/\b(format (jawaban|balasan|respons)|gaya bahasa|gaya bicara|gaya komunikasi|nada (bicara|respons)|responsmu|balasanmu|jawabanmu)\b/.test(f)) return 'COMMUNICATION_STYLE';
  // 4. CAPABILITIES
  if (/\b(bisa|dapat|mampu|berhasil|fitur|fungsi|kemampuan|kapabilitas|dukungan|mendukung|otomatis|sinkronisasi)\b/.test(f)) return 'CAPABILITIES';
  // 5. Default
  return 'OPERATIONAL_RULES';
}

/**
 * Robust locale-aware currency parser supporting dot-thousands, comma-decimals, IDR, and standard notations
 */
function parseFlexibleNominal(rawStr) {
  if (!rawStr) return 0;
  let str = String(rawStr).trim();

  const firstDot = str.indexOf('.');
  const firstComma = str.indexOf(',');

  if (firstDot !== -1 && firstComma !== -1) {
    if (firstDot < firstComma) {
      // Indonesian: 1.250.000,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // English: 50,000.00
      str = str.replace(/,/g, '');
    }
  } else if (firstDot !== -1) {
    const parts = str.split('.');
    if (parts.length > 2) {
      str = str.replace(/\./g, '');
    } else if (parts.length === 2) {
      if (parts[1].length === 3) {
        str = parts[0] + parts[1];
      } else if (parts[1].length <= 2 && parseInt(parts[0], 10) < 1000) {
        str = parts[0];
      } else {
        str = str.replace(/\./g, '');
      }
    }
  } else if (firstComma !== -1) {
    const parts = str.split(',');
    if (parts.length > 2) {
      str = str.replace(/,/g, '');
    } else if (parts.length === 2) {
      if (parts[1].length === 3) {
        str = parts[0] + parts[1];
      } else {
        str = parts[0] + '.' + parts[1];
      }
    }
  }

  const num = parseFloat(str.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num;
}

/**
 * Extracts nominal from an email object or text snippet
 */
function extractNominalFromEmail(emailObj) {
  const text = `${emailObj?.subject || ''} ${emailObj?.body || ''} ${emailObj?.snippet || ''}`;
  const match = text.match(/(?:nominal(?:\s+transaksi)?|jumlah(?:\s+transfer)?|total|sebesar|rp|idr)\s*(?:transaksi|transfer)?\s*(?:rp|idr)?\.?\s*([0-9][0-9.,\s]*[0-9])/i)
    || text.match(/(?:Rp|IDR)\.?\s*([0-9][0-9.,\s]*[0-9])/i);
  if (!match) return 0;

  return parseFlexibleNominal(match[1].replace(/\s+/g, ''));
}

/**
 * Parses safe ISO date from email date string
 */
function parseEmailDateSafe(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extracts structured finance transactions from Mandiri/Livin and Bank Jago emails
 */
function extractFinanceTransactionsFromEmails(emails) {
  const results = [];
  for (const e of emails || []) {
    const text = `${e.subject || ''} ${e.body || ''} ${e.snippet || ''}`;
    const nominal = extractNominalFromEmail(e);
    if (!nominal || nominal < 100) continue;

    const isJago = /jago\.com|bank jago|bertransaksi dengan jago/i.test(text) ||
                   /jago/i.test(e.from || '');
    const defaultAccount = isJago ? 'Bank Jago' : 'Bank Mandiri';
    const defaultDesc = isJago ? 'Notifikasi Bank Jago' : 'Notifikasi Livin Mandiri';
    const defaultDest = isJago ? 'Transaksi Jago' : 'Transaksi Mandiri';

    const merchantMatch = text.match(/(?:penerima|ke|di|merchant|tujuan|dari)\s+([A-Za-z0-9\s._-]{2,60})/i);
    const destination = merchantMatch?.[1] ? merchantMatch[1].trim() : defaultDest;
    const isExpense = !/(masuk|inflow|cr|kredit|setoran|menerima\s+(?:sejumlah\s+)?uang)/i.test(text);

    let isoDate = null;
    const emailDate = parseEmailDateSafe(e.date);
    if (emailDate && !isNaN(emailDate.getTime())) {
      isoDate = emailDate.toISOString();
    }

    const isQRIS = /(?:dengan qr|qris|nama acquirer|id terminal)/i.test(text);

    results.push({
      nominal,
      type: isExpense ? 'EXPENSE' : 'INCOME',
      destination,
      category: isExpense ? 'Belanja' : 'Pendapatan',
      description: (e.subject || defaultDesc).substring(0, 80),
      time: isoDate || new Date().toISOString(),
      account: defaultAccount,
      payment_method: isQRIS ? 'QRIS' : 'Transfer bank'
    });
  }
  return results;
}

/**
 * Temporal hint extraction from text for email filtering
 */
function getEmailTemporalFilterFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/(hari ini|today)/.test(t)) return { type: 'today' };
  if (/(kemarin|yesterday)/.test(t)) return { type: 'yesterday' };
  if (/(minggu ini|this week)/.test(t)) return { type: 'this_week' };
  if (/(minggu lalu|last week)/.test(t)) return { type: 'last_week' };
  if (/(bulan ini|this month)/.test(t)) return { type: 'this_month' };
  return null;
}

/**
 * Day of month hint extraction from text
 */
function parseDayOfMonthHint(text) {
  const m = String(text || '').match(/(?:tanggal|tgl)\s*([0-9]{1,2})/i);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  return (day >= 1 && day <= 31) ? day : null;
}

/**
 * Filters emails by temporal hint
 */
function filterEmailsByTemporalHint(emails, filter) {
  if (!filter || !Array.isArray(emails)) return emails || [];
  const now = new Date();
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  return emails.filter(e => {
    const d = parseEmailDateSafe(e.date);
    if (!d) return true;
    if (filter.type === 'today') {
      return startOfDay(d).getTime() === startOfDay(now).getTime();
    }
    if (filter.type === 'yesterday') {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return startOfDay(d).getTime() === startOfDay(yesterday).getTime();
    }
    if (filter.type === 'this_week') {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= oneWeekAgo;
    }
    if (filter.type === 'last_week') {
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d >= twoWeeksAgo && d < oneWeekAgo;
    }
    if (filter.type === 'this_month') {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    return true;
  });
}

/**
 * Filters emails by day of month
 */
function filterEmailsByDayOfMonth(emails, day) {
  if (!day || !Array.isArray(emails)) return emails || [];
  return emails.filter(e => {
    const d = parseEmailDateSafe(e.date);
    return d ? d.getDate() === day : true;
  });
}

/**
 * Formats a Date object to YYYY/MM/DD for Gmail search queries
 */
function toGmailDateLiteral(dateObj) {
  return `${dateObj.getFullYear()}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${String(dateObj.getDate()).padStart(2, '0')}`;
}

/**
 * Gets current time in Asia/Jakarta timezone
 */
function getJakartaNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

/**
 * Builds Gmail temporal query suffix (e.g. after:YYYY/MM/DD before:YYYY/MM/DD)
 */
function getTemporalGmailQuerySuffix(temporalHint, dayHint) {
  const nowJakarta = getJakartaNow();

  if (temporalHint?.type === 'today') {
    const start = new Date(nowJakarta); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
  }
  if (temporalHint?.type === 'yesterday') {
    const end = new Date(nowJakarta); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - 1);
    return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
  }
  if (temporalHint?.type === 'last_week') {
    const end = new Date(nowJakarta); end.setHours(23, 59, 59, 999);
    const start = new Date(nowJakarta); start.setDate(start.getDate() - 7); start.setHours(0, 0, 0, 0);
    return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
  }
  if (dayHint) {
    const start = new Date(nowJakarta.getFullYear(), nowJakarta.getMonth(), dayHint, 0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return ` after:${toGmailDateLiteral(start)} before:${toGmailDateLiteral(end)}`;
  }
  return '';
}

module.exports = {
  stripHtml,
  escapeHtml,
  formatMemoryReply,
  isFactAboutNexa,
  classifySelfModelLayer,
  parseFlexibleNominal,
  extractNominalFromEmail,
  parseEmailDateSafe,
  extractFinanceTransactionsFromEmails,
  extractFinanceTxFromEmails: extractFinanceTransactionsFromEmails,
  getEmailTemporalFilterFromText,
  parseDayOfMonthHint,
  filterEmailsByTemporalHint,
  filterEmailsByDayOfMonth,
  toGmailDateLiteral,
  getJakartaNow,
  getTemporalGmailQuerySuffix,
  // Underscore aliases for backward compatibility
  _stripHtml: stripHtml,
  _isFactAboutNexa: isFactAboutNexa,
  _classifySelfModelLayer: classifySelfModelLayer,
  _extractFinanceTxFromEmails: extractFinanceTransactionsFromEmails
};

