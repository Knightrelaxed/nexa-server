'use strict';
/**
 * Finance_Helpers - Pure parsing/formatting helpers and the AI merchant categoriser.
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */


// AUDIT FIX: sendTelegramWithRetry REMOVED — it called api.telegram.org directly which is BLOCKED
// on HF Docker. All Telegram sends from Finance_Engine must use sendTelegramOutbound() from
// webhook.js which routes through the Cloudflare Worker proxy.

// VALID_FINANCE_CATEGORIES statis telah dihapus. Daftar ditarik dinamis dari DB.

// ============================================================
// PAYMENT METHOD NORMALIZER — terpusat, fuzzy & typo-aware
// Mendukung 5 metode valid: QRIS, Direct Debit, Transfer bank, Kartu Kredit, Tunai
// Mampu menangkap typo (e.g. "qis" → QRIS, "debet" → Direct Debit) serta shorthand (dd, tf, cc, cash)
// ============================================================
function _normalizePaymentMethod(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();
  if (!s) return null;

  // 1. Direct Debit (debit otomatis / account linking / kantong ekosistem)
  // Short aliases & typos: dd, debit, debet, direk, direct, autodebit, kantong, saku, link
  if (
    /\b(direct\s*debit|direct\s*debet|direk\s*debit|direk\s*debet|dd|autodebit|auto\s*debit|autodebet|auto\s*debet|debit|debet|debitt|direk|direct)\b/i.test(s) ||
    /\b(kantong|kantong\s*jago|kantong\s*utama|saku|saku\s*jago)\b/i.test(s) ||
    /\b(debit\s*otomatis|debet\s*otomatis|potong\s*saldo|potong\s*rekening|potong\s*jago)\b/i.test(s) ||
    /\b(linked|link\s*account|akun\s*terhubung|rekening\s*terhubung)\b/i.test(s)
  ) {
    return 'Direct Debit';
  }

  // 2. QRIS (scan barcode / QR / qis typo / transcription variations)
  if (
    /\b(qris|qis|qiss|qriz|kris|kriss|chris|gris|crispy|grisy|quris|qri|qriss|cris|criss|qr|qrcode|barcode|scan|kode\s*qr)\b/i.test(s) ||
    s === 'q-r-i-s' || s === 'q.r.i.s'
  ) {
    return 'QRIS';
  }

  // 3. Kartu Kredit (credit card / cc / cicilan)
  if (
    /\b(kartu\s*kredit|kredit|credit\s*card|credit|cc|k\.kredit|kartucredit|kartu\s*credit|gesek|swipe|cicil|cicilan|visa|mastercard)\b/i.test(s)
  ) {
    return 'Kartu Kredit';
  }

  // 4. Transfer Bank (tf / trf / tranfer / remit / mbanking)
  if (
    /\b(transfer|transfer\s*bank|transfer\s*antar\s*bank|atm|bank\s*transfer|trasnfer|tranfer|trnsfer|tf|trf|kirim|remit|e-banking|internet\s*banking|mobile\s*banking|m-banking|mbanking|bi-fast|bifast)\b/i.test(s)
  ) {
    return 'Transfer bank';
  }

  // 5. Tunai (cash / kas / kontan / uang fisik)
  if (
    /\b(tunai|cash|kontan|kas|uang\s*tunai|uang\s*cash|uang\s*fisik|uang\s*kertas|bayar\s*tunai|bayar\s*cash|cash\s*money)\b/i.test(s) ||
    s === 'uang'
  ) {
    return 'Tunai';
  }

  // Jika tidak cocok dengan alias manapun → return null
  console.log(`[FINANCE] Payment method "${raw}" tidak dikenali → disimpan sebagai null.`);
  return null;
}

async function _autoCategorizeMerchant(merchantName, currentCategory) {
  // If user/AI Router already chose a valid specific category, keep it.
  // MUST also treat placeholder strings as "needs categorization".
  const INVALID_CATEGORIES = ['Lainnya', 'Finance Email', '[Menunggu Kategori AI/User]', 'Uncategorized'];
  if (currentCategory && !INVALID_CATEGORIES.includes(currentCategory) && currentCategory.trim() !== '' && !currentCategory.startsWith('[')) {
    return currentCategory;
  }

  // 100% AI-driven categorization — no rigid regex rules
  try {
    const { callAI } = require('../../core/AI_Router');
    const supabaseFinance = require('../../infrastructure/Supabase_Finance');
    const categories = await supabaseFinance.getCategoriesList();
    const validCatNames = categories.map(c => c.name);

    const prompt = `You are a financial transaction categorization engine. Analyze the following transaction purpose/note and select EXACTLY ONE most appropriate category from the list.

Transaction: "${merchantName}"

Category list (Choose ONLY ONE, copy EXACTLY):
${validCatNames.map(c => `- ${c}`).join('\n')}

INTERNAL ANALYSIS RULES (DO NOT INCLUDE IN YOUR OUTPUT):
1. IDENTIFY THE OBJECT: What is the ACTUAL SUBSTANCE being bought/paid for? Do not be fooled by superficial words!
2. MATCH: Select the category from the list above that is closest SEMANTICALLY to that object.

CRITICAL DISAMBIGUATION RULES (SUPER STRICT):
1. EXACT NAME MATCHING: You MUST ONLY copy one category name from the list above EXACTLY (case-sensitive, spaces, symbols). IT IS STRICTLY FORBIDDEN to invent new categories (forbidden examples: "Makanan & Minuman", "Perawatan & Kecantikan", etc., if they are not in the list).
2. SEMANTIC REASONING: If the purchased item/service lacks an exact category, find the CLOSEST match from the active list.
   - Debt & Loans examples: Paying debt / bayar hutang / cicilan → "Cicilan / Hutang". Lending money / pinjamkan uang → "Memberi Pinjaman / Piutang".
   - Food examples: Nasi ayam, sate, etc. → "Makan Berat / Makan Luar". Kopi, boba, camilan → "Jajan / Ngopi / Kafe".
   - Service examples: Paying for laundry/cuci baju → "Jasa Laundry".
   - Transportation examples: Grab/Gojek → "Ojek / Taksi Online" or "Transportasi Umum".
   - Shopping examples: Buying beras/minyak at a minimarket → "Bahan Makanan / Groceries".
3. If the merchant name is a third-party payment provider (e.g., "Gopay", "Ovo", "Dana", "Qris", "Midtrans", "Shopeepay"), IGNORE that name and FOCUS purely on the description note provided by the user.

OTHER RULES:
1. "Lainnya" category: ONLY use this if the description is entirely empty OR if the information is just an extremely ambiguous abbreviation/person's name. IF there is any hint of purpose (like "jajan", "nasi", "es teh", "kopi"), NEVER choose "Lainnya"!
2. CRITICAL IMPORTANCE: DO NOT write any explanations, greetings, or your thought process! OUTPUT EXACTLY 1 LINE OF TEXT containing the category name from the list above! No quotes, never invent a new category.`;
    const aiResp = await callAI(prompt);
    let cat = aiResp.trim();
    // Strip quotes/whitespace if AI wraps the answer
    cat = cat.replace(/^["'`](.*)["'`]$/, '$1').trim();
    // Strip trailing period/punctuation
    cat = cat.replace(/[.!]+$/, '').trim();

    if (validCatNames.includes(cat)) {
      console.log(`[FINANCE] AI categorized "${merchantName}" → "${cat}"`);
      return cat;
    }
    // Fuzzy match: AI might return slightly different casing
    const fuzzy = validCatNames.find(v => v.toLowerCase() === cat.toLowerCase());
    if (fuzzy) {
      console.log(`[FINANCE] AI categorized (fuzzy) "${merchantName}" → "${fuzzy}"`);
      return fuzzy;
    }
    // Defensive extraction: Jika AI tetap menjawab dengan kalimat panjang/menjelaskan alasannya,
    // cari apakah ada nama kategori sah di dalam jawaban AI!
    const matchedCategories = validCatNames.filter(v => aiResp.toLowerCase().includes(v.toLowerCase()));
    if (matchedCategories.length > 0) {
      // Prioritaskan kategori yang muncul paling akhir di teks jawaban AI (biasanya di kesimpulan)
      let bestMatch = matchedCategories[0];
      let maxIdx = -1;
      for (const v of matchedCategories) {
        const idx = aiResp.toLowerCase().lastIndexOf(v.toLowerCase());
        if (idx > maxIdx) {
          maxIdx = idx;
          bestMatch = v;
        }
      }
      console.log(`[FINANCE] AI categorized (extracted from explanation text) "${merchantName}" → "${bestMatch}"`);
      return bestMatch;
    }
    console.warn(`[FINANCE] AI returned invalid category "${cat}" for "${merchantName}". Falling back to Lainnya.`);
  } catch (e) {
    console.error('[FINANCE] AI Categorization failed:', e.message);
  }

  return 'Lainnya';
}

/**
 * Safely parse localized currency strings into numbers (handles thousands separators).
 */
function _parseFlexibleCurrency(val) {
  if (typeof val === 'number') return val;
  const str = String(val).trim();
  if (!str || str === '-') return NaN;
  
  const dots = (str.match(/\./g) || []).length;
  const commas = (str.match(/,/g) || []).length;
  
  let cleaned = str;
  if (dots > 0 && commas === 1) {
    cleaned = str.replace(/\./g, '').replace(',', '.'); // IDR with decimal
  } else if (commas > 0 && dots === 1) {
    cleaned = str.replace(/,/g, ''); // USD with decimal
  } else if (dots > 0 && commas === 0) {
    cleaned = str.replace(/\./g, ''); // IDR thousands only
  } else if (commas > 0 && dots === 0) {
    cleaned = str.replace(/,/g, ''); // USD thousands only
  } else {
    cleaned = str.replace(/,/g, '.'); // fallback
  }
  
  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned);
}

/**
 * Parse relative date text to an actual Date object (WIB).
 * Supports: "kemarin", "hari ini", "tanggal 14", "14 mei", day names.
 */
function _parseRelativeDateFilter(text) {
  if (!text) return null;
  const lower = text.toLowerCase().trim();
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (lower.includes('hari ini') || lower.includes('today')) return today;
  if (lower.includes('kemarin') || lower.includes('yesterday')) {
    const d = new Date(today); d.setDate(d.getDate() - 1); return d;
  }
  // "tanggal 14", "tgl 14"
  const tglMatch = lower.match(/(?:tanggal|tgl)\s*(\d{1,2})/);
  if (tglMatch) {
    const d = new Date(today); d.setDate(parseInt(tglMatch[1])); return d;
  }
  // "14/5" or "14-5"
  const slashMatch = lower.match(/(\d{1,2})[\/\-](\d{1,2})/);
  if (slashMatch) {
    const d = new Date(today);
    // BUG FIX: Passing day as second argument prevents JS Date wrap-around 
    // if today's date exceeds the days in the target month (e.g. today is 31st, target is Feb)
    d.setMonth(parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]));
    return d;
  }
  // ISO Date from AI_Router (e.g., "2026-05-13T00:00:00")
  const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }
  // Fallback for standalone day number (e.g., "13")
  const numMatch = lower.match(/^(\d{1,2})$/);
  if (numMatch) {
    const d = new Date(today); d.setDate(parseInt(numMatch[1])); return d;
  }
  return null;
}

/**
 * Parse Indonesian date string to Date object.
 * Handles: "14 Mei 2026", "14 May 2026"
 */
function _parseIndonesianDateString(str) {
  if (!str) return null;
  const MONTHS = {
    januari: 0, january: 0,
    februari: 1, february: 1,
    maret: 2, march: 2,
    april: 3,
    mei: 4, may: 4,
    juni: 5, june: 5,
    juli: 6, july: 6,
    agustus: 7, august: 7,
    september: 8,
    oktober: 9, october: 9,
    november: 10,
    desember: 11, december: 11
  };
  const m = str.toLowerCase().match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m) {
    const day   = parseInt(m[1]);
    const month = MONTHS[m[2]];
    const year  = parseInt(m[3]);
    if (month !== undefined && !isNaN(day) && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }
  const iso = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3]));
  return null;
}

/**
 * Format a single transaction as a rich card for Telegram.
 */
function _formatTxAsCard(tx) {
  const tanggal  = tx.transaction_date || '-';
  const waktu    = tx.transaction_time || '-';
  let tipe = 'Pengeluaran';
  let tipeIcon = '🔴';
  if (tx.type === 'income') {
    tipe = 'Pemasukan';
    tipeIcon = '🟢';
  } else if (tx.type === 'transfer') {
    tipe = tx.split_label === 'transfer_in' ? 'Transfer (Masuk)' : (tx.split_label === 'transfer_out' ? 'Transfer (Keluar)' : 'Transfer');
    tipeIcon = '🔄';
  }
  const kategori = tx.categories?.name || '-';
  const akun     = tx.accounts?.name || '-';
  const deskripsi = tx.description || '-';
  const nominal  = tx.amount || 0;

  const nominalFmt = `Rp${Math.abs(nominal).toLocaleString('id-ID')}`;
  
  // Gunakan no jika ada, jika tidak fallback ke UUID pendek
  const displayId = tx.no ? `#${tx.no}` : (tx.id ? tx.id.substring(0, 8) : 'N/A');

  return `${tipeIcon} <b>ID: ${displayId}</b>\n` +
    `<b>Tanggal:</b> ${tanggal}\n` +
    `<b>Waktu:</b> ${waktu}\n` +
    `<b>Tipe:</b> ${tipe}\n` +
    `<b>Kategori:</b> ${kategori}\n` +
    `<b>Akun:</b> ${akun}\n` +
    `<b>Deskripsi:</b> ${deskripsi}\n` +
    `<b>Nominal (Rp):</b> ${nominalFmt}`;
}

/**
 * Extract exact Asia/Jakarta (WIB) calendar components independent of host OS timezone.
 */
function _getWibParts(baseDate = null) {
  const ref = baseDate ? new Date(baseDate) : new Date();
  const safeRef = isNaN(ref.getTime()) ? new Date() : ref;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(safeRef);
  const map = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
  }
  const hour = map.hour === 24 ? 0 : (map.hour || 0);
  return {
    year: map.year,
    month: map.month, // 1..12
    day: map.day,
    hour,
    minute: map.minute || 0
  };
}

function _formatYmd(year, month1Based, day) {
  const utc = new Date(Date.UTC(year, month1Based - 1, day));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}-${String(utc.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Parse combined date and time expression in natural Indonesian text or ISO strings.
 * Examples:
 *   "jam 9 malam tgl 1 nov" -> { dateISO: '2026-11-01', timeHHMM: '21:00' }
 *   "tadi malam jam 9"      -> { dateISO: '2026-11-01', timeHHMM: '21:00' } (when current WIB hour < 18)
 *   "tadi pagi"             -> { dateISO: '2026-11-02', timeHHMM: '08:00' }
 *   "kemarin sore"          -> { dateISO: '2026-11-01', timeHHMM: '16:30' }
 *   "kemarin jam 15:30"     -> { dateISO: '2026-11-01', timeHHMM: '15:30' }
 *   "2026-11-01T21:00:00"   -> { dateISO: '2026-11-01', timeHHMM: '21:00' }
 */
function _parseDateTimeExpression(text, baseDate = null) {
  if (!text) return { dateISO: null, timeHHMM: null };
  const s = String(text).toLowerCase().trim();
  const wib = _getWibParts(baseDate);

  let targetDate = null;
  let targetTime = null;

  // 1. Direct ISO Check: e.g. "2026-11-01T21:00:00+07:00" or "2026-11-01 21:00"
  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{2}):(\d{2}))?/i);
  if (isoMatch) {
    targetDate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    if (isoMatch[4] !== undefined && isoMatch[5] !== undefined) {
      targetTime = `${isoMatch[4]}:${isoMatch[5]}`;
    }
  }

  // 2. Date Expression parsing (if not already found via ISO)
  if (!targetDate) {
    const MONTHS = {
      jan: 1, januari: 1, january: 1,
      feb: 2, februari: 2, february: 2,
      mar: 3, maret: 3, march: 3,
      apr: 4, april: 4,
      mei: 5, may: 5,
      jun: 6, juni: 6, june: 6,
      jul: 7, juli: 7, july: 7,
      agu: 8, ags: 8, agustus: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      okt: 10, oktober: 10, october: 10,
      nov: 11, november: 11,
      des: 12, desember: 12, december: 12
    };

    // "tgl 1 nov", "tanggal 1 november 2026", "1 nov"
    const indDateMatch = s.match(/(?:tanggal|tgl\s*)?(\d{1,2})\s+([a-z]{3,10})(?:\s+(\d{4}))?/i);
    if (indDateMatch && MONTHS[indDateMatch[2].toLowerCase()] !== undefined) {
      const day = parseInt(indDateMatch[1], 10);
      const month = MONTHS[indDateMatch[2].toLowerCase()];
      const year = indDateMatch[3] ? parseInt(indDateMatch[3], 10) : wib.year;
      targetDate = _formatYmd(year, month, day);
    } else if (/\b(kemarin|yesterday|semalam)\b/i.test(s)) {
      targetDate = _formatYmd(wib.year, wib.month, wib.day - 1);
    } else if (/\btadi\s*malam\b/i.test(s) && !/\btgl\b|\btanggal\b/.test(s)) {
      // Before 18:00 WIB, "tadi malam" means last night (yesterday); at 18:00+ WIB it means earlier tonight
      const dayOffset = wib.hour < 18 ? -1 : 0;
      targetDate = _formatYmd(wib.year, wib.month, wib.day + dayOffset);
    } else if (/\b(hari\s*ini|today|tadi\s*pagi|pagi\s*tadi|pagi\s*ini|tadi\s*siang|siang\s*tadi|siang\s*ini|tadi\s*sore|sore\s*tadi|sore\s*ini|malam\s*ini|tadi\s*subuh|subuh\s*tadi)\b/i.test(s)) {
      targetDate = _formatYmd(wib.year, wib.month, wib.day);
    } else if (/\blusa\b/i.test(s)) {
      targetDate = _formatYmd(wib.year, wib.month, wib.day + 2);
    } else if (/\bbesok\b|\btomorrow\b/i.test(s)) {
      targetDate = _formatYmd(wib.year, wib.month, wib.day + 1);
    } else {
      const tglMatch = s.match(/(?:tanggal|tgl)\s*(\d{1,2})/i);
      if (tglMatch) {
        targetDate = _formatYmd(wib.year, wib.month, parseInt(tglMatch[1], 10));
      }
    }
  }

  // 3. Time Expression parsing (if not already found via ISO)
  if (!targetTime) {
    // "jam 9 malam", "pukul 21:00", "jam 21.00", "jam 9 pagi", "tadi malam jam 9"
    const timeMatch = s.match(/(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(subuh|pagi|siang|sore|petang|malam))?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      let period = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      // If period was not directly after hour, check if "malam", "sore", "siang", "pagi", "subuh" is in context
      if (!period) {
        if (/\b(malam|semalam)\b/i.test(s)) period = 'malam';
        else if (/\b(sore|petang)\b/i.test(s)) period = 'sore';
        else if (/\bsiang\b/i.test(s)) period = 'siang';
        else if (/\bsubuh\b/i.test(s)) period = 'subuh';
        else if (/\bpagi\b/i.test(s)) period = 'pagi';
      }

      if (period === 'malam') {
        if (hour === 12) hour = 0;
        else if (hour >= 1 && hour < 12) hour += 12;
      } else if (period === 'sore' || period === 'petang') {
        if (hour >= 1 && hour <= 7) hour += 12;
      } else if (period === 'siang') {
        if (hour >= 1 && hour <= 5) hour += 12;
      } else if ((period === 'pagi' || period === 'subuh') && hour === 12) {
        hour = 0;
      }

      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        targetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
      }
    } else {
      const hhmmMatch = s.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
      if (hhmmMatch) {
        targetTime = `${String(hhmmMatch[1]).padStart(2, '0')}:${String(hhmmMatch[2]).padStart(2, '0')}`;
      } else if (/\b(tadi\s*malam|semalam|kemarin\s*malam|malam\s*tadi)\b/i.test(s)) {
        targetTime = '20:30';
      } else if (/\b(tadi\s*subuh|subuh\s*tadi|kemarin\s*subuh|dini\s*hari)\b/i.test(s)) {
        targetTime = '05:00';
      } else if (/\b(tadi\s*pagi|pagi\s*tadi|kemarin\s*pagi)\b/i.test(s)) {
        targetTime = '08:00';
      } else if (/\b(tadi\s*siang|siang\s*tadi|kemarin\s*siang)\b/i.test(s)) {
        targetTime = '12:30';
      } else if (/\b(tadi\s*sore|sore\s*tadi|kemarin\s*sore)\b/i.test(s)) {
        targetTime = '16:30';
      }
    }
  }

  return { dateISO: targetDate, timeHHMM: targetTime };
}

/**
 * Resolve final transaction ISO timestamp (+07:00 WIB) from AI extracted `ed.time`
 * AND raw natural Indonesian `textInput`. Falls back cleanly to current WIB time when
 * no date/time is mentioned (or user says "sekarang"/"barusan").
 */
function _resolveTransactionTimeISO(edTime, textInput = '', baseDate = null) {
  const ref = baseDate ? new Date(baseDate) : new Date();
  const safeRef = isNaN(ref.getTime()) ? new Date() : ref;
  const wib = _getWibParts(safeRef);
  const nowDateISO = _formatYmd(wib.year, wib.month, wib.day);
  const nowTimeHHMM = `${String(wib.hour).padStart(2, '0')}:${String(wib.minute).padStart(2, '0')}`;

  // 1. Parse raw user text first so explicit phrases like "tadi malam", "kemarin sore", "jam 8 pagi" are never lost
  const fromText = _parseDateTimeExpression(textInput, safeRef);
  if (fromText.dateISO || fromText.timeHHMM) {
    const dStr = fromText.dateISO || nowDateISO;
    const tStr = fromText.timeHHMM || nowTimeHHMM;
    return `${dStr}T${tStr}:00+07:00`;
  }

  // 2. Next check AI-extracted ed.time (ISO or natural Indonesian phrase)
  if (edTime && typeof edTime === 'string' && edTime.trim()) {
    const trimmed = edTime.trim();
    const direct = new Date(trimmed);
    if (!isNaN(direct.getTime()) && /\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return direct.toISOString();
    }
    const fromEd = _parseDateTimeExpression(trimmed, safeRef);
    if (fromEd.dateISO || fromEd.timeHHMM) {
      const dStr = fromEd.dateISO || nowDateISO;
      const tStr = fromEd.timeHHMM || nowTimeHHMM;
      return `${dStr}T${tStr}:00+07:00`;
    }
  }

  // 3. Default: exact current timestamp
  return safeRef.toISOString();
}

module.exports = {
  _normalizePaymentMethod,
  _autoCategorizeMerchant,
  _parseFlexibleCurrency,
  _parseRelativeDateFilter,
  _parseIndonesianDateString,
  _parseDateTimeExpression,
  _resolveTransactionTimeISO,
  _formatTxAsCard,
};
