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
 * Parse combined date and time expression in natural Indonesian text or ISO strings.
 * Examples:
 *   "jam 9 malam tgl 1 nov" -> { dateISO: '2026-11-01', timeHHMM: '21:00' }
 *   "tadi malam jam 9"      -> { dateISO: '2026-11-01', timeHHMM: '21:00' } (assuming today is 2 Nov)
 *   "kemarin jam 15:30"     -> { dateISO: '2026-11-01', timeHHMM: '15:30' }
 *   "2026-11-01T21:00:00"   -> { dateISO: '2026-11-01', timeHHMM: '21:00' }
 */
function _parseDateTimeExpression(text, baseDate = null) {
  if (!text) return { dateISO: null, timeHHMM: null };
  const s = String(text).toLowerCase().trim();
  const now = baseDate ? new Date(baseDate) : new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
      jan: 0, januari: 0, january: 0,
      feb: 1, februari: 1, february: 1,
      mar: 2, maret: 2, march: 2,
      apr: 3, april: 3,
      mei: 4, may: 4,
      jun: 5, juni: 5, june: 5,
      jul: 6, juli: 6, july: 6,
      agu: 7, agustus: 7, august: 7,
      sep: 8, september: 8,
      okt: 9, oktober: 9, october: 9,
      nov: 10, november: 10,
      des: 11, desember: 11, december: 11
    };

    // "tgl 1 nov", "tanggal 1 november 2026", "1 nov"
    const indDateMatch = s.match(/(?:tanggal|tgl\s*)?(\d{1,2})\s+([a-z]{3,10})(?:\s+(\d{4}))?/i);
    if (indDateMatch && MONTHS[indDateMatch[2].toLowerCase()] !== undefined) {
      const day = parseInt(indDateMatch[1], 10);
      const month = MONTHS[indDateMatch[2].toLowerCase()];
      const year = indDateMatch[3] ? parseInt(indDateMatch[3], 10) : now.getFullYear();
      const d = new Date(year, month, day);
      targetDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } else if (/\b(kemarin|yesterday)\b/i.test(s) || (/\btadi\s*malam\b/i.test(s) && !/\btgl\b|\btanggal\b/.test(s))) {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      targetDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } else if (/\bhari\s*ini\b|\btoday\b/i.test(s)) {
      targetDate = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } else if (/\blusa\b/i.test(s)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 2);
      targetDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } else if (/\bbesok\b|\btomorrow\b/i.test(s)) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      targetDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    } else {
      const tglMatch = s.match(/(?:tanggal|tgl)\s*(\d{1,2})/i);
      if (tglMatch) {
        const d = new Date(today);
        d.setDate(parseInt(tglMatch[1], 10));
        targetDate = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
      }
    }
  }

  // 3. Time Expression parsing (if not already found via ISO)
  if (!targetTime) {
    // "jam 9 malam", "pukul 21:00", "jam 21.00", "jam 9 pagi", "tadi malam jam 9"
    const timeMatch = s.match(/(?:jam|pukul)\s*(\d{1,2})(?:[.:](\d{2}))?(?:\s*(pagi|siang|sore|malam))?/i);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      let period = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      // If period was not directly after hour, check if "malam", "sore", "siang", "pagi" is in context
      if (!period) {
        if (/\bmalam\b/i.test(s)) period = 'malam';
        else if (/\bsore\b/i.test(s)) period = 'sore';
        else if (/\bsiang\b/i.test(s)) period = 'siang';
        else if (/\bpagi\b/i.test(s)) period = 'pagi';
      }

      if (period === 'malam' && hour < 12) {
        hour += 12;
      } else if (period === 'sore' && hour < 12 && hour < 7) {
        hour += 12;
      } else if (period === 'siang' && hour < 10) {
        hour += 12;
      } else if (period === 'pagi' && hour === 12) {
        hour = 0;
      }

      targetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else if (/\btadi\s*malam\b/i.test(s)) {
      targetTime = '21:00';
    } else {
      const hhmmMatch = s.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
      if (hhmmMatch) {
        targetTime = `${String(hhmmMatch[1]).padStart(2, '0')}:${String(hhmmMatch[2]).padStart(2, '0')}`;
      }
    }
  }

  return { dateISO: targetDate, timeHHMM: targetTime };
}

module.exports = {
  _normalizePaymentMethod,
  _autoCategorizeMerchant,
  _parseFlexibleCurrency,
  _parseRelativeDateFilter,
  _parseIndonesianDateString,
  _parseDateTimeExpression,
  _formatTxAsCard,
};
