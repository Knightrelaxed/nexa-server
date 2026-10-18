'use strict';
// ============================================================
// N.E.X.A — TELEGRAM EMAIL HELPERS
// Utility functions for parsing email dates, temporal hints,
// filtering emails by date/day, and follow-up intent detection.
// ============================================================

function getEmailReadLimitFromText(text, fallback = 5) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return fallback;
  if (/\b(satu|1)\b/.test(normalized) || /paling terbaru|terbaru saja|satu saja/.test(normalized)) {
    return 1;
  }
  const explicitNumber = normalized.match(/\b(\d{1,2})\b/);
  if (explicitNumber) {
    const n = parseInt(explicitNumber[1], 10);
    if (!isNaN(n) && n > 0) return Math.min(n, 10);
  }
  return fallback;
}

function parseEmailDateSafe(rawDate) {
  const raw = String(rawDate || '').trim();
  if (!raw) return null;

  // Common Bank format: "Thu, 7 May 2026 21:38:01 +0700 (WIB)"
  // Remove trailing parenthetical timezone label to improve JS Date parsing consistency.
  const cleaned = raw.replace(/\s*\([^)]+\)\s*$/, '');
  let parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) return parsed;

  // Fallback: strip non-essential labels and retry.
  const hasWib = /\bWIB\b/i.test(cleaned);
  let strToParse = cleaned.replace(/\bWIB\b/gi, '').trim();
  if (hasWib && !strToParse.match(/[+-]\d{2,4}/)) {
    strToParse += ' +0700'; // Append correct offset if WIB was detected and no other offset exists
  }
  parsed = new Date(strToParse);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

function getJakartaDateOnly(date) {
  const d = parseEmailDateSafe(date);
  if (!d) return null;
  if (isNaN(d.getTime())) return null;
  const jakarta = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return `${jakarta.getFullYear()}-${String(jakarta.getMonth() + 1).padStart(2, '0')}-${String(jakarta.getDate()).padStart(2, '0')}`;
}

function getEmailTemporalFilterFromText(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return null;
  if (/hari ini|today/.test(normalized)) return { type: 'today' };
  if (/kemarin|yesterday/.test(normalized)) return { type: 'yesterday' };
  if (/minggu lalu|last week/.test(normalized)) return { type: 'last_week' };
  return null;
}

function parseDayOfMonthHint(text) {
  const normalized = String(text || '').toLowerCase();
  if (!normalized) return null;
  const m = normalized.match(/\b(?:tgl|tanggal)\s*(\d{1,2})\b/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  if (isNaN(day) || day < 1 || day > 31) return null;
  return day;
}

function extractNominalFromEmail(e) {
  const text = `${e?.subject || ''} ${e?.snippet || ''}`;
  const nominalMatch = text.match(/(?:Rp\.?|IDR)\s*([\d.,]+)/i);
  if (!nominalMatch) return null;
  const raw = nominalMatch[1].replace(/[^0-9]/g, '');
  const val = parseInt(raw, 10);
  return isNaN(val) ? null : val;
}

function filterEmailsByTemporalHint(emails, temporalHint) {
  if (!temporalHint || !emails || emails.length === 0) return emails || [];
  const now = new Date();
  const todayStr = getJakartaDateOnly(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayStr = getJakartaDateOnly(yesterday);

  return emails.filter(e => {
    const emailDate = parseEmailDateSafe(e.date);
    const dateStr = getJakartaDateOnly(emailDate);
    if (!dateStr) return false;

    if (temporalHint.type === 'today') {
      return dateStr === todayStr;
    }
    if (temporalHint.type === 'yesterday') {
      return dateStr === yesterdayStr;
    }
    if (temporalHint.type === 'last_week') {
      const diffMs = now.getTime() - emailDate.getTime();
      return diffMs >= 0 && diffMs <= (7 * 24 * 60 * 60 * 1000);
    }
    return true;
  });
}

function filterEmailsByDayOfMonth(emails, dayOfMonth) {
  if (!Array.isArray(emails) || !dayOfMonth) return emails || [];
  return emails.filter(e => {
    const d = parseEmailDateSafe(e.date);
    if (!d || isNaN(d.getTime())) return false;
    const jakartaDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    return jakartaDate.getDate() === dayOfMonth;
  });
}

function isEmailHistoryFollowUp(text) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  return /sebelumnya|email sebelumnya|sebelum itu|yang kemarin|sebelum tanggal/.test(normalized);
}

function isGenericContinuation(text) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  return /^(lagi|lanjut|berikutnya|next|ada lagi|cek lagi|lihat lagi|yang lain)$/.test(normalized);
}

function isAmbiguousFollowUp(text) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  return /^(hapus|delete|selesai|complete|done|ubah|edit|update|ganti|batal|cancel|cek lagi|lihat lagi|ada lagi|lagi|lanjut|berikutnya)$/.test(normalized) ||
    /^(hapus|delete|selesai|complete|done|ubah|edit|update|ganti)\s+(itu|ini|tadi|tersebut)$/.test(normalized);
}

function hasStrongNewIntentCue(text) {
  const normalized = String(text || '').toLowerCase().trim();
  if (!normalized) return false;
  return /\b(buat|tambah|catat|ingatkan|jadwalkan|kirim|cari|search|saldo|rekap|briefing|evaluasi|audit)\b/.test(normalized);
}

function buildGlobalFollowUpRouting(text, ctx) {
  if (!ctx || !ctx.intent) return null;
  if (Date.now() - (ctx.askedAt || 0) > 10 * 60 * 1000) return null;
  if (!isAmbiguousFollowUp(text) || hasStrongNewIntentCue(text)) return null;

  const normalized = String(text || '').toLowerCase().trim();

  if (ctx.intent === 'FINANCE') {
    if (/(hapus|delete)/.test(normalized)) {
      return { intent: 'FINANCE', extracted_data: { action: 'DELETE', search_keyword: 'latest' } };
    }
    if (/(ubah|edit|update|ganti)/.test(normalized)) {
      return { intent: 'FINANCE', extracted_data: { action: 'EDIT', search_keyword: 'latest' } };
    }
  }

  if (ctx.intent === 'TASK') {
    if (/(hapus|delete)/.test(normalized)) {
      return { intent: 'TASK', extracted_data: { action: 'DELETE', task_id: 'latest' } };
    }
    if (/(selesai|complete|done)/.test(normalized)) {
      return { intent: 'TASK', extracted_data: { action: 'COMPLETE', task_id: 'latest' } };
    }
    if (/(ubah|edit|update|ganti)/.test(normalized)) {
      return { intent: 'TASK', extracted_data: { action: 'UPDATE', task_id: 'latest' } };
    }
  }

  if (ctx.intent === 'CALENDAR') {
    if (/(hapus|delete)/.test(normalized)) {
      return { intent: 'CALENDAR', extracted_data: { action: 'DELETE', event_id: 'latest' } };
    }
    if (/(ubah|edit|update|ganti)/.test(normalized)) {
      return { intent: 'CALENDAR', extracted_data: { action: 'UPDATE', event_id: 'latest' } };
    }
  }

  if (ctx.intent === '2ND_BRAIN' || ctx.intent === 'USER_PROFILE' || ctx.intent === 'CORE_IDENTITY') {
    if (/(hapus|delete)/.test(normalized)) {
      return { intent: ctx.intent, extracted_data: { action: 'DELETE', search_keyword: 'latest' } };
    }
  }

  if (ctx.intent === 'WEB_SEARCH') {
    if (/^(lagi|lanjut|berikutnya|next|ada lagi|cek lagi|lihat lagi)$/.test(normalized)) {
      return { intent: 'WEB_SEARCH', extracted_data: { query: ctx.lastUserText || '', continuation: true } };
    }
  }

  return null;
}

function getClarificationMessage(routing, text) {
  if (!routing || !routing.intent) return null;
  const intent = routing.intent;
  const ed = routing.extracted_data || {};
  const lowerText = String(text || '').toLowerCase();

  if (intent === 'INCOMPLETE_INFO') {
    return routing.reply_message || 'Maaf Tuan, informasinya belum lengkap. Mohon berikan detail yang diinginkan.';
  }

  if (intent === 'TASK' && ed.action === 'DELETE' && !ed.task_id && !ed.task_title && !ed.search_keyword) {
    return '❓ Tugas mana yang ingin dihapus, Tuan? Mohon sebutkan judul tugasnya.';
  }

  if (intent === 'CALENDAR' && ed.action === 'DELETE' && !ed.event_id && !ed.summary && !ed.search_keyword) {
    return '❓ Jadwal mana yang ingin dibatalkan atau dihapus, Tuan?';
  }

  if (intent === 'FINANCE' && ed.action === 'DELETE' && !ed.search_keyword && !ed.nominal) {
    return '❓ Transaksi mana yang ingin dihapus? Mohon sebutkan nominal atau nama merchant-nya.';
  }

  if ((intent === '2ND_BRAIN' || intent === 'USER_PROFILE' || intent === 'CORE_IDENTITY') && ed.action === 'DELETE' && !ed.search_keyword && !ed.item_id) {
    return '❓ Item mana yang ingin dihapus dari memori, Tuan?';
  }

  return null;
}

module.exports = {
  getEmailReadLimitFromText,
  parseEmailDateSafe,
  getJakartaDateOnly,
  getEmailTemporalFilterFromText,
  parseDayOfMonthHint,
  extractNominalFromEmail,
  filterEmailsByTemporalHint,
  filterEmailsByDayOfMonth,
  isEmailHistoryFollowUp,
  isGenericContinuation,
  isAmbiguousFollowUp,
  hasStrongNewIntentCue,
  buildGlobalFollowUpRouting,
  getClarificationMessage
};
