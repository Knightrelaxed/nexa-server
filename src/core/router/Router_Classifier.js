/**
 * ============================================================
 * [N.E.X.A] router/Router_Classifier.js
 * Klasifikasi tanpa-token: reflex bypass, gating domain, sentimen, preflight
 *
 * Bagian dari modularisasi AI_Router.js (facade: ../AI_Router.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

// ~2.500 token safety net (pesan N.E.X.A max 4.000 char)

// ============================================================
// PRE-FLIGHT CLASSIFIER — keyword banks untuk calendar gating
// ============================================================
const _CAL_TIME_KWS = [
  'besok', 'lusa', 'kemarin', 'minggu depan', 'hari ini', 'malam ini',
  'sore ini', 'pagi ini', 'senin', 'selasa', 'rabu', 'kamis', 'jumat',
  'sabtu', 'tanggal', 'bulan depan',
];

const _CAL_DOMAIN_KWS = [
  'jadwal', 'kalender', 'meeting', 'rapat', 'event', 'reminder',
  'ingatkan', 'buat jadwal', 'agenda', 'matkul', 'kelas', 'kuliah',
  'jadwal hari'
];

function _isReflexMessage(textInput, runtimeHints = {}) {
  if (!textInput) return false;
  if (runtimeHints && Object.keys(runtimeHints).length > 0) {
    if (runtimeHints.pendingEmailContext ||
        runtimeHints.pendingDatabaseContext ||
        runtimeHints.pendingCalendarContext ||
        runtimeHints.pendingVaultContext ||
        runtimeHints.conversationContext?.intent) {
      return false;
    }
  }
  const clean = textInput.trim().toLowerCase();
  const words = clean.split(/\s+/);
  if (words.length > 3) return false;

  const REFLEX_REGEX = /^(halo|hai|hey|p|ping|cek|test|tes|pagi|siang|sore|malam|selamat pagi|selamat siang|selamat sore|selamat malam|makasih|terima kasih|tengkyu|thanks|ok|oke|siap|baik|sip|mantap|yoi|yo)(?:\s+(?:nex|nexa|min|bot|bro|sis))?[!.]*$/i;
  return REFLEX_REGEX.test(clean);
}

function _detectCandidateDomains(textInput, runtimeHints = {}) {
  if (!textInput) return 'ALL';
  if (runtimeHints && Object.keys(runtimeHints).length > 0) {
    if (runtimeHints.pendingEmailContext ||
        runtimeHints.pendingDatabaseContext ||
        runtimeHints.pendingCalendarContext ||
        runtimeHints.pendingVaultContext ||
        runtimeHints.conversationContext?.intent) {
      return 'ALL';
    }
  }

  const clean = textInput.toLowerCase();
  const matched = new Set();

  if (/\b(beli|bayar|uang|duit|rp|ribu|jt|juta|pengeluaran|pemasukan|belanja|saldo|transfer|tf|rekening|dompet|qris|cash|kas|finansial|biaya|ongkir|makan|kopi|nasi|tagihan|gaji|buku kas|split|indomaret|alfamart|top up|topup|ewallet|gopay|ovo|dana|shopeepay)\b/i.test(clean) || /\b\d+\s*(?:k|rb|ribu|jt|juta|rupiah)\b/i.test(clean)) {
    matched.add('FINANCE');
  }

  if (/\b(jadwal|kalender|agenda|kuliah|matkul|meeting|rapat|acara|janji|event|semester|reschedule|ingatkan|pengingat|besok|lusa|minggu depan|hari ini|jam \d|pukul \d)\b/i.test(clean)) {
    matched.add('CALENDAR');
  }

  if (/\b(tugas|task|todo|to-do|deadline|selesaikan|kerjakan|list belanja|catatan tugas|pr|makalah|tandai selesai|hapus tugas)\b/i.test(clean)) {
    matched.add('TASK');
  }

  if (/\b(hp|ponsel|handphone|senter|baterai|battery|wifi|layar|screenshot|kunci hp|volume|suara|kamera|clipboard|notif|dering|telepon hp|ringtone|buka aplikasi)\b/i.test(clean)) {
    matched.add('DEVICE_CONTROL');
  }

  if (/\b(cari|carikan|googling|google|siapa|apa itu|berita|informasi|info|riset|cek internet|terbaru|cuaca)\b/i.test(clean)) {
    matched.add('WEB_SEARCH');
  }

  if (/\b(terdekat|lokasi|jarak|rute|peta|maps|alamat|di mana letak|warkop|cafe terdekat|pom bensin|masjid terdekat)\b/i.test(clean)) {
    matched.add('LOCATION');
  }

  if (/\b(database|tabel|supabase|kolom|row|insert|update row|delete row|hapus riwayat|bersihkan vault)\b/i.test(clean)) {
    matched.add('DATABASE');
  }

  if (/\b(email|inbox|gmail|surat|kirim email|cek email)\b/i.test(clean)) {
    matched.add('EMAIL');
  }

  if (/\b(disiplin|limit|batas aplikasi|screen time|durasi aplikasi|god\s*mode|godmode)\b/i.test(clean)) {
    matched.add('DISCIPLINE');
  }

  if (/\b(catat|catatan|simpan catatan|vault|second brain|2nd brain|arsip)\b/i.test(clean)) {
    matched.add('2ND_BRAIN');
  }

  if (/\b(ingat ya aku|kebiasaanku|tentangku|diriku|profilku|biodataku|kesukaanku|hobiku)\b/i.test(clean)) {
    matched.add('USER_PROFILE');
  }

  if (/\b(kamu itu siapa|kamu siapa|kamu diciptakan|kemampuanmu|aturanmu|namamu|identitasmu|kamu bisa apa|kamu bisa|bisa apa|fitur apa|kemampuan)\b/i.test(clean)) {
    matched.add('CORE_IDENTITY');
  }

  // Strict Fail-Open: If no technical domain matched, load all schemas
  if (matched.size === 0) {
    return 'ALL';
  }

  return matched;
}

// ============================================================
// CROSS-DOMAIN FUSION & SENTIMENT HELPERS
// ============================================================

/**
 * Pure heuristic sentiment detection from text style (Zero Latency).
 * Returns 'STRESSED', 'CASUAL', or 'NEUTRAL'.
 */
function _detectSentiment(text) {
  if (!text) return 'NEUTRAL';
  const str = text.toLowerCase();

  const matchAny = (words) => words.some(w => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(str));

  // 1. STRESSED / FRUSTRATED — Kepanikan, Ketergesaan, Darurat, Frustrasi Teknis
  const rushWords = [
    "panik", "darurat", "buru-buru", "keburu", "mepet", "gawat",
    "urgent", "buruan", "cepetan", "ngebut", "kepepet", "sos",
    "emergency", "last minute", "ga sempet", "hampir telat",
    "dikejar waktu", "waktunya abis", "tolong cepat",
    "butuh bantuan segera", "sekarang juga", "telat parah",
    "kerjaan numpuk", "tugas numpuk", "ga ada waktu",
    "deg deg ser", "takut telat", "gelagapan", "keteteran",
    "pusing pala", "puyeng", "overwhelmed", "stres banget",
    "panik banget", "ngejar deadline", "deadline besok",
    "waktu mepet", "mepet banget", "dikejar-kejar",
    "mampus telat", "kacau banget", "berantakan semua",
    "argh", "arghh", "bingung", "ga sesuai", "kok gini",
    "malah balik", "looping", "ngeloop", "kenapa sih",
    "kok salah", "perbaiki", "benerin", "error terus",
    "ga jalan", "ga mau", "rusak", "kacau", "pusing parah"
  ];
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const isAllCaps = text.length > 5 && text === text.toUpperCase();
  if (matchAny(rushWords) || hasExclamation || isAllCaps) return 'STRESSED';

  // 2. ANGRY — Kemarahan, Frustrasi Berat, Kekesalan
  const angryWords = [
    "anjing", "ajg", "brengsek", "sialan", "keparat", "bangsat",
    "goblok", "tolol", "nyebelin", "bikin emosi", "bikin kesel",
    "frustrasi", "jengkel", "gondok", "muak", "sebel", "marah",
    "ngamuk", "kesal", "dongkol", "ngeselin", "bete parah",
    "eneg", "kampret", "bedebah", "jahanam", "najis",
    "bikin naik darah", "ngegas", "emosi jiwa", "nyolot",
    "kesel parah", "marah banget", "emosi parah", "setan",
    "menyebalkan", "kesel banget", "gondok banget",
    "capek ngurusin", "males banget ngurusin", "sebel parah",
    "naik pitam", "bodoh", "parah banget", "cacat"
  ];
  if (matchAny(angryWords)) return 'ANGRY';

  // 3. FOCUSED / MOTIVATED — Fokus Kerja, Riset, Coding, Produktivitas
  const focusedWords = [
    "riset", "coding", "deploy", "server", "commit", "push",
    "github", "vercel", "supabase", "database", "fokus",
    "mengerjakan", "selesaikan", "project", "analisis",
    "bedah", "pelajari", "simulasikan", "investigasi",
    "eksekusi", "target", "produktivitas", "kerjaan"
  ];
  if (matchAny(focusedWords)) return 'FOCUSED';

  // 4. TIRED / BORED — Lelah, Ngantuk, Jenuh
  const tiredWords = [
    "ngantuk", "lelah", "capek", "istirahat", "tidur",
    "cape banget", "lemas", "bosen", "jenuh", "penat",
    "letih", "lesu", "rebahan dulu", "capek fisik"
  ];
  if (matchAny(tiredWords)) return 'TIRED';

  // 5. SAD — Kesedihan, Demotivasi, Putus Asa, Sakit
  const sadWords = [
    "sedih", "nangis", "galau", "hopeless", "sakit hati",
    "mati rasa", "putus asa", "depresi", "down", "nelangsa",
    "patah hati", "kehilangan", "kecewa", "hancur", "hampa",
    "terpuruk", "kesepian", "ga semangat", "demotivasi",
    "nyesel", "remuk", "murung", "nestapa", "merana",
    "capek hidup", "ngerasa gagal", "gak ada harapan",
    "mau nyerah", "pengen nangis", "sakit banget", "terluka",
    "ditinggal", "dikhianati", "ngerasa sendiri", "sedih banget",
    "nangis bombay", "hancur lebur", "drop banget",
    "hidup hampa", "males hidup", "ga ada motivasi"
  ];
  if (matchAny(sadWords)) return 'SAD';

  // 6. HAPPY / EXCITED — Kegembiraan, Kepuasan, Antusiasme
  const happyWords = [
    "seneng", "bahagia", "mantul", "yeay", "asik",
    "gembira", "happy", "semangat", "excited", "girang",
    "pecah", "keren banget", "mantap", "yess", "berhasil",
    "sukses", "bangga", "alhamdulillah", "seru banget",
    "puas banget", "hepi", "luar biasa", "amazing",
    "gila keren", "wohoo", "asyik banget", "juara",
    "top banget", "gokil abis", "legend", "epic",
    "kece", "sip banget", "senangnya", "bahagia banget",
    "excited parah", "ga sabar nunggu", "hore",
    "mantap jiwa", "suka banget", "terharu bahagia",
    "jos gandos", "top markotop", "anjay keren"
  ];
  if (matchAny(happyWords)) return 'HAPPY';

  // 7. CASUAL — Santai, Candaan, Tidak Terburu-buru
  const casualWords = [
    "wkwk", "haha", "santai", "gabut", "mager", "bercanda",
    "becanda", "ngakak", "lol", "hehe", "iseng", "slow",
    "peace", "kwkw", "xixi", "ngetroll", "ngeledek",
    "btw", "fyi", "ngobrol", "nongkrong",
    "rebahan", "healing", "receh", "gaje",
    "garing", "random", "asal ngomong",
    "hmm", "gabut parah",
    "mager banget", "otw", "ntar", "besok aja",
    "santuy", "gengs", "bestie", "chill",
    "gausah buru-buru", "pelan-pelan aja", "yaudah",
    "gitu deh", "ngalir aja"
  ];
  if (matchAny(casualWords)) return 'CASUAL';

  return 'NEUTRAL';
}

/**
 * Zero-latency pre-flight domain classifier.
 * Detects whether the user message contains time/date references
 * or calendar-specific keywords.
 */
function _preflightClassify(text) {
  const t = (typeof text === 'string' ? text : String(text || '')).toLowerCase();
  const hasTime = _CAL_TIME_KWS.some(kw => t.includes(kw)) || /\d{1,2}:\d{2}/.test(text || '');
  const hasCal = _CAL_DOMAIN_KWS.some(kw => t.includes(kw));
  return { hasTime, hasCal };
}

module.exports = {
  _CAL_TIME_KWS,
  _CAL_DOMAIN_KWS,
  _isReflexMessage,
  _detectCandidateDomains,
  _detectSentiment,
  _preflightClassify
};
