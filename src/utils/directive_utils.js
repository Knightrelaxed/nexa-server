'use strict';
// =====================================================================
// directive_utils.js - [v3.3.2]
// Operational directives: one short imperative sentence telling N.E.X.A HOW to behave because of
// an identity trait ("Tawarkan langkah awal 10 menit"), instead of injecting the raw trait.
// Pure functions, no I/O. Used by the weekly inference, proposal approval and the backfill script.
// =====================================================================

const MAX_DIRECTIVE_CHARS = 160;
const MIN_DIRECTIVE_CHARS = 12;
const HARD_REJECT_CHARS = 220; // far beyond the limit: the model ignored the rule, do not trust it

const INJECTION_PATTERNS = [
  /\b(abaikan|lupakan|ignore|disregard|forget)\b.{0,40}\b(instruksi|perintah|aturan|instructions?|rules?|prompt|previous|sebelumnya)\b/i,
  /\b(system\s*prompt|developer\s*message|jailbreak)\b/i,
  /<\/?[a-z][^>]*>/i,                                    // HTML / pseudo-tags
  /https?:\/\//i,                                        // URLs
  /`{1,3}/,                                              // code fences
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/      // invisible / bidi control characters
];

const JUDGMENTAL = /\b(malas|bodoh|payah|pecundang|tidak berguna|gagal total|lemah)\b/i;

const STOPWORDS = new Set([
  'jangan', 'sering', 'selalu', 'dengan', 'untuk', 'supaya', 'karena', 'sebagai', 'tetap',
  'lebih', 'sangat', 'agar', 'yang', 'dalam', 'tentang', 'setelah', 'sebelum', 'ketika'
]);

function scanForInjection(text) {
  const s = String(text == null ? '' : text);
  for (const re of INJECTION_PATTERNS) {
    if (re.test(s)) return { safe: false, reason: 'injection_pattern' };
  }
  return { safe: true, reason: null };
}

function significantWords(text) {
  return new Set(
    String(text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 5 && !STOPWORDS.has(w))
  );
}

/** Share of the smaller word set that the other one repeats (0..1). High = the directive restates the trait. */
function echoScore(directive, traitValue) {
  const a = significantWords(directive);
  const b = significantWords(traitValue);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function defaultSensitivityForLayer(layer) {
  return String(layer || '').toUpperCase() === 'WEAKNESSES' ? 'private' : 'normal';
}

/**
 * @returns {{ok: boolean, directive: string|null, reason: string|null}}
 * Private traits are held to a stricter echo threshold: the directive must not name the weakness.
 */
function validateDirective(raw, { traitValue = '', sensitivity = 'normal' } = {}) {
  if (raw === undefined || raw === null) return { ok: false, directive: null, reason: 'empty' };
  let s = String(raw).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  s = s.replace(/^(arahan|directive|panduan)\s*:\s*/i, '');
  s = s.replace(/^["'\u201C\u201D\u2018\u2019\-\u2022*\s]+|["'\u201C\u201D\u2018\u2019\s]+$/g, '');
  if (!s) return { ok: false, directive: null, reason: 'empty' };
  if (s.length < MIN_DIRECTIVE_CHARS) return { ok: false, directive: null, reason: 'too_short' };
  if (s.length > HARD_REJECT_CHARS) return { ok: false, directive: null, reason: 'too_long' };
  if (s.length > MAX_DIRECTIVE_CHARS) {
    const cut = s.slice(0, MAX_DIRECTIVE_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    s = (lastSpace > MAX_DIRECTIVE_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:\s]+$/, '');
  }
  const scan = scanForInjection(s);
  if (!scan.safe) return { ok: false, directive: null, reason: scan.reason };
  if (JUDGMENTAL.test(s)) return { ok: false, directive: null, reason: 'judgmental' };
  const threshold = sensitivity === 'private' ? 0.6 : 0.85;
  if (traitValue && echoScore(s, traitValue) >= threshold) return { ok: false, directive: null, reason: 'echoes_trait' };
  return { ok: true, directive: s, reason: null };
}

function sanitizeDirective(raw, opts) {
  const r = validateDirective(raw, opts);
  return r.ok ? r.directive : null;
}

const DIRECTIVE_PROMPT_RULES = `ATURAN DIRECTIVE (wajib untuk setiap hipotesis):
- directive = SATU kalimat perintah operasional, 12-160 karakter, ditujukan kepada N.E.X.A tentang BAGAIMANA bersikap atau menyusun jawaban.
- Tulis sebagai perintah ("Tawarkan...", "Ringkas...", "Mulai dari..."), BUKAN deskripsi tentang Tuan Faqih.
- JANGAN menyalin atau memparafrase isi trait. Untuk layer WEAKNESSES JANGAN menyebut atau menyiratkan kelemahannya; cukup beri cara membantu yang halus.
- JANGAN memakai kata yang menghakimi, URL, tag HTML, tanda kutip balik, atau instruksi tentang system prompt.
- Jika trait hanya fakta statis tanpa implikasi perilaku, isi directive dengan string kosong "".`;

module.exports = {
  MAX_DIRECTIVE_CHARS, MIN_DIRECTIVE_CHARS, DIRECTIVE_PROMPT_RULES,
  scanForInjection, echoScore, defaultSensitivityForLayer, validateDirective, sanitizeDirective
};
