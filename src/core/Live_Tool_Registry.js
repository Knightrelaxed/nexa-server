// ============================================================
// N.E.X.A 3.0 — LIVE TOOL REGISTRY v2.5 (100% ABSOLUTE PARITY)
// Real-Time Tool Calling Registry for Google Gemini Multimodal Live API
// Covers ALL 15 AI_Router Intent Domains:
// 1. FINANCE, 2. CALENDAR, 3. TASK, 4. DEVICE_CONTROL, 5. WEB_SEARCH,
// 6. LOCATION, 7. EMAIL, 8. 2ND_BRAIN, 9. DISCIPLINE, 10. USER_PROFILE,
// 11. CORE_IDENTITY, 12. DIAGNOSE_SYSTEM, 13. DATABASE (Protected),
// 14. INCOMPLETE_INFO (Native Spoken), 15. NORMAL_CHAT (Native Spoken)
// ============================================================
'use strict';

const geminiVectorCache    = require('../utils/gemini_vector_cache');
const supabaseFinance      = require('../infrastructure/Supabase_Finance');
const supabaseMemories     = require('../infrastructure/Supabase_Memories');
const mobileBridgeWs       = require('../interfaces/mobile_bridge/MobileBridge_WS');
const bridge               = require('../interfaces/mobile_bridge/adapter');
const agendaManager        = require('../domain/Agenda_Manager');
const taskManager          = require('../domain/Task_Manager');
const webSearch            = require('../infrastructure/Web_Search');
const googleWorkspace      = require('../infrastructure/Google_Workspace');
const googleTasks          = require('../infrastructure/Google_Tasks');
const logger               = require('../utils/logger');
const aiRouter             = require('./AI_Router');
const locationOrchestrator = require('../domain/Location_Orchestrator');
const appDiscipline        = require('../domain/App_Discipline_Engine');
const gmailClient          = require('../infrastructure/Gmail_Client');

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Per-tool timeout wrapper (prevents API hanging)
// ────────────────────────────────────────────────────────────────────────────
function _withToolTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Tool timed out after ${ms}ms`)), ms)
    )
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Normalize payment method from voice transcription to account name
// ────────────────────────────────────────────────────────────────────────────
function _normalizeAccountName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();

  if (/\bbca\b|mobile\s*banking\s*bca|m-?banking\s*bca|debit\s*bca|transfer\s*bca/.test(s)) return 'BCA';
  if (/\bmandiri\b|livin|livin'\s*by\s*mandiri|mandiri\s*mobile/.test(s)) return 'Mandiri';
  if (/\bgopay\b|go\s*pay/.test(s)) return 'GoPay';
  if (/\bshopeepay\b|shopee\s*pay/.test(s)) return 'ShopeePay';
  if (/\bovo\b/.test(s)) return 'OVO';
  if (/\bdana\b/.test(s)) return 'DANA';
  if (/\b(cash|tunai|uang\s*tunai|uang\s*fisik|kontan)\b/.test(s)) return 'Cash';
  if (/\b(qris|qr\s*code|scan\s*qr|bayar\s*qr|kris|quris)\b/.test(s)) return 'QRIS';
  if (/\bbri\b|brimobi|bank\s*rakyat/.test(s)) return 'BRI';
  if (/\btransfer\b|tf\b|trf\b/.test(s)) return 'Transfer';

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Infer expense category from description (zero-token heuristic)
// ────────────────────────────────────────────────────────────────────────────
function _inferCategoryFromDescription(desc) {
  if (!desc || typeof desc !== 'string') return null;
  const d = desc.toLowerCase();

  if (/\b(nasi|makan|ayam|soto|rendang|bakso|mie|bubur|warung|warteg|restoran|lauk|sate|gado|rawon|pecel|makan\s*siang|makan\s*malam|makan\s*pagi|sarapan|makan\s*berat|prasmanan|katering)\b/.test(d)) return 'Makan Berat / Makan Luar';
  if (/\b(kopi|coffee|teh|boba|minuman|jajan|camilan|snack|es\s*krim|donat|roti|kafe|cafe|starbuck|kopi\s*kenangan|iced)\b/.test(d)) return 'Jajan / Ngopi / Kafe';
  if (/\b(indomaret|alfamart|beras|minyak|sabun|shampo|odol|deterjen|belanja|supermarket|minimarket|grocery|groceries|bahan\s*makanan)\b/.test(d)) return 'Bahan Makanan / Groceries';
  if (/\b(bensin|bahan\s*bakar|pertamina|pertalite|bbm|solar|ojek|gojek|grab|angkot|bis|bus|kereta|kai|busway|transjakarta|parkir|tol|toll)\b/.test(d)) return 'Transportasi';
  if (/\b(apotek|obat|vitamin|dokter|klinik|rumah\s*sakit|puskesmas|konsultasi|medis|kesehatan)\b/.test(d)) return 'Kesehatan';
  if (/\b(bioskop|film|cinema|netflix|spotify|game|steam|playstation|hiburan|tiket|konser)\b/.test(d)) return 'Hiburan';
  if (/\b(buku|kuliah|kursus|les|sekolah|fotokopi|print|seminar|workshop|pendidikan)\b/.test(d)) return 'Pendidikan';
  if (/\b(listrik|pln|wifi|internet|pulsa|token|tagihan|iuran|cicilan|bayar\s*tagihan)\b/.test(d)) return 'Tagihan';
  if (/\b(laundry|cuci\s*baju|cuci\s*pakaian|dry\s*clean)\b/.test(d)) return 'Jasa Laundry';
  if (/\b(salon|pangkas|cukur|barbershop|perawatan|kecantikan|skincare|parfum)\b/.test(d)) return 'Perawatan Diri';

  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Parse date from Indonesian spoken language
// ────────────────────────────────────────────────────────────────────────────
function _parseDateFromVoice(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  }

  const d = dateStr.toLowerCase().trim();
  const nowJkt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

  if (/^(today|hari\s*ini|sekarang)$/.test(d)) {
    return nowJkt.toLocaleDateString('en-CA');
  }

  if (/^(tomorrow|besok|esok)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + 1);
    return t.toLocaleDateString('en-CA');
  }

  if (/^(lusa|lusa\s*hari)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + 2);
    return t.toLocaleDateString('en-CA');
  }

  if (/^(yesterday|kemarin|tadi\s*malam)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() - 1);
    return t.toLocaleDateString('en-CA');
  }

  const nDaysMatch = d.match(/^(\d+)\s*(hari\s*(?:lagi|ke\s*depan|kemudian)|days?\s*later)$/);
  if (nDaysMatch) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + parseInt(nDaysMatch[1]));
    return t.toLocaleDateString('en-CA');
  }

  const DAY_MAP = {
    'minggu': 0, 'sunday': 0,
    'senin': 1, 'monday': 1,
    'selasa': 2, 'tuesday': 2,
    'rabu': 3, 'wednesday': 3,
    'kamis': 4, 'thursday': 4,
    'jumat': 5, 'friday': 5,
    'sabtu': 6, 'saturday': 6
  };

  const isNextWeek = /depan|next/.test(d);
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (d.includes(dayName)) {
      const t = new Date(nowJkt);
      const currentDay = t.getDay();
      let daysUntil = (dayNum - currentDay + 7) % 7;
      if (daysUntil === 0 && isNextWeek) daysUntil = 7;
      if (daysUntil === 0 && !isNextWeek) daysUntil = 7;
      t.setDate(t.getDate() + daysUntil);
      return t.toLocaleDateString('en-CA');
    }
  }

  if (/bulan\s*depan|next\s*month/.test(d)) {
    const t = new Date(nowJkt);
    t.setMonth(t.getMonth() + 1, 1);
    return t.toLocaleDateString('en-CA');
  }

  return nowJkt.toLocaleDateString('en-CA');
}

// ────────────────────────────────────────────────────────────────────────────
// MASTER TOOL SCHEMAS (Covering ALL 15 AI_Router Domains)
// ────────────────────────────────────────────────────────────────────────────
const LIVE_TOOL_DECLARATIONS = [
  // ── 1. FINANCE: RECORD EXPENSE ────────────────────────────────
  {
    name: 'recordExpense',
    description: 'Mencatat transaksi pengeluaran keuangan Tuan Faqih ke database Supabase secara real-time. Panggil segera saat Tuan menyebutkan pembelian, pembayaran, atau pengeluaran.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount:        { type: 'NUMBER', description: 'Jumlah nominal uang dalam Rupiah. Contoh: 25000 untuk 25 ribu.' },
        category:      { type: 'STRING', description: 'Kategori pengeluaran. Contoh: "Makan Berat / Makan Luar", "Jajan / Ngopi / Kafe", "Transportasi", "Bahan Makanan / Groceries", "Tagihan", "Kesehatan", "Hiburan", "Pendidikan", "Jasa Laundry", "Lainnya".' },
        description:   { type: 'STRING', description: 'Keterangan atau nama barang/jasa. Contoh: "nasi ayam bakar", "bensin pertalite", "kopi americano".' },
        paymentMethod: { type: 'STRING', description: 'Metode pembayaran yang disebutkan Tuan. Contoh: "BCA", "Cash", "QRIS", "GoPay", "ShopeePay", "Mandiri", "Transfer".' },
        date:          { type: 'STRING', description: 'Tanggal transaksi jika disebutkan secara khusus. Contoh: "today", "yesterday", "kemarin", "2026-08-19".' }
      },
      required: ['amount', 'description']
    }
  },

  // ── 2. FINANCE: RECORD INCOME ─────────────────────────────────
  {
    name: 'recordIncome',
    description: 'Mencatat transaksi pemasukan atau penerimaan uang Tuan Faqih ke database Supabase.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount:             { type: 'NUMBER', description: 'Jumlah nominal uang yang diterima dalam Rupiah.' },
        description:        { type: 'STRING', description: 'Sumber atau keterangan pemasukan. Contoh: "Gaji", "Transfer dari Ayah", "Beasiswa", "Bayaran proyek".' },
        destinationAccount: { type: 'STRING', description: 'Rekening tujuan penerimaan. Contoh: "BCA", "Mandiri", "Cash", "GoPay".' }
      },
      required: ['amount', 'description']
    }
  },

  // ── 3. FINANCE: QUERY SUMMARY ─────────────────────────────────
  {
    name: 'queryFinancialSummary',
    description: 'Mengecek total pengeluaran, pemasukan, atau saldo seluruh rekening keuangan Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeframe: { type: 'STRING', description: 'Periode: "today", "this_week", "this_month", "all_balances".' },
        category:  { type: 'STRING', description: 'Kategori spesifik untuk difilter (opsional).' }
      }
    }
  },

  // ── 4. CALENDAR: CREATE EVENT ─────────────────────────────────
  {
    name: 'createCalendarEvent',
    description: 'Membuat jadwal atau agenda baru di Google Calendar Tuan Faqih. Panggil saat Tuan ingin menjadwalkan kegiatan.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title:       { type: 'STRING', description: 'Judul kegiatan. Contoh: "Kuliah Nahwu", "Rapat BEM", "Bimbingan Skripsi".' },
        date:        { type: 'STRING', description: 'Tanggal kegiatan. Contoh: "today", "tomorrow", "besok", "lusa", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu", "senin depan", "2026-08-25".' },
        startTime:   { type: 'STRING', description: 'Jam mulai format HH:mm WIB. Contoh: "09:00", "14:30", "20:00".' },
        endTime:     { type: 'STRING', description: 'Jam selesai format HH:mm WIB (opsional, akan diinfer otomatis).' },
        location:    { type: 'STRING', description: 'Lokasi kegiatan jika disebutkan.' },
        description: { type: 'STRING', description: 'Catatan tambahan (opsional).' }
      },
      required: ['title', 'startTime']
    }
  },

  // ── 5. CALENDAR: QUERY AGENDA ─────────────────────────────────
  {
    name: 'queryCalendarAgenda',
    description: 'Mengecek jadwal kalender Tuan Faqih untuk hari ini, besok, atau minggu ini.',
    parameters: {
      type: 'OBJECT',
      properties: {
        timeframe: { type: 'STRING', description: '"today" untuk hari ini, "tomorrow"/"besok" untuk besok, "this_week"/"upcoming" untuk minggu ini.' },
        date:      { type: 'STRING', description: 'Tanggal spesifik jika ingin mengecek hari tertentu (YYYY-MM-DD).' }
      }
    }
  },

  // ── 6. CALENDAR: UPDATE EVENT ─────────────────────────────────
  {
    name: 'updateCalendarEvent',
    description: 'Mengubah waktu, jam, tanggal, atau judul jadwal yang sudah ada di Google Calendar.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetTitle:  { type: 'STRING', description: 'Judul jadwal yang ingin diubah. Contoh: "rapat BEM", "kuliah nahwu".' },
        newTitle:     { type: 'STRING', description: 'Judul baru jika ingin diubah (opsional).' },
        newDate:      { type: 'STRING', description: 'Tanggal baru format YYYY-MM-DD atau nama hari (opsional).' },
        newStartTime: { type: 'STRING', description: 'Jam mulai baru format HH:mm (opsional).' }
      },
      required: ['targetTitle']
    }
  },

  // ── 7. CALENDAR: DELETE EVENT ─────────────────────────────────
  {
    name: 'deleteCalendarEvent',
    description: 'Menghapus atau membatalkan jadwal dari Google Calendar Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Judul atau kata kunci jadwal yang ingin dihapus. Contoh: "rapat BEM", "kuliah nahwu senin".' }
      },
      required: ['title']
    }
  },

  // ── 8. TASKS: CREATE TASK ─────────────────────────────────────
  {
    name: 'createTask',
    description: 'Mencatat tugas baru ke Google Tasks Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title:    { type: 'STRING', description: 'Nama atau isi tugas.' },
        dueDate:  { type: 'STRING', description: 'Tenggat waktu. Contoh: "today", "tomorrow", "besok", "lusa", "senin", "2026-08-22".' },
        listName: { type: 'STRING', description: 'Nama daftar tugas. Contoh: "Tugas Kuliah", "Pekerjaan", "Belanja", "Riset & Baca".' },
        notes:    { type: 'STRING', description: 'Catatan detail pengerjaan tugas (opsional).' }
      },
      required: ['title']
    }
  },

  // ── 9. TASKS: QUERY TASKS ─────────────────────────────────────
  {
    name: 'queryTasks',
    description: 'Mengecek daftar tugas yang belum selesai, jatuh tempo, atau overdue di Google Tasks Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        listName: { type: 'STRING', description: 'Filter nama daftar tugas (opsional).' },
        status:   { type: 'STRING', description: '"pending" untuk semua aktif, "today" untuk hari ini, "tomorrow" untuk besok, "overdue" untuk terlambat, "upcoming" untuk 7 hari ke depan.' }
      }
    }
  },

  // ── 10. TASKS: COMPLETE TASK ──────────────────────────────────
  {
    name: 'completeTask',
    description: 'Menandai tugas sebagai selesai di Google Tasks Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskTitle: { type: 'STRING', description: 'Nama atau kata kunci tugas yang ingin ditandai selesai. Contoh: "resume buku", "makalah sastra arab", "tugas 1".' }
      },
      required: ['taskTitle']
    }
  },

  // ── 11. TASKS: DELETE TASK ────────────────────────────────────
  {
    name: 'deleteTask',
    description: 'Menghapus tugas dari Google Tasks Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskTitle: { type: 'STRING', description: 'Nama atau kata kunci tugas yang ingin dihapus.' }
      },
      required: ['taskTitle']
    }
  },

  // ── 12. LOCATION: SEARCH NEARBY PLACES ────────────────────────
  {
    name: 'searchNearbyPlaces',
    description: 'Mencari tempat, fasilitas, atau POI terdekat dari posisi GPS aktif Tuan Faqih (warkop, cafe, pom bensin, ATM, masjid, tempat makan).',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: 'Jenis tempat yang dicari. Contoh: "warkop", "spbu", "pom bensin", "atm", "masjid", "tempat makan", "cafe".' }
      },
      required: ['keyword']
    }
  },

  // ── 13. EMAIL: QUERY EMAILS ───────────────────────────────────
  {
    name: 'queryEmails',
    description: 'Membaca kotak masuk Gmail Tuan Faqih untuk mengecek email baru atau mencari email tertentu.',
    parameters: {
      type: 'OBJECT',
      properties: {
        searchKeyword: { type: 'STRING', description: 'Kata kunci pencarian email atau subjek (opsional).' },
        maxResults:    { type: 'NUMBER', description: 'Jumlah email yang ingin dibaca (default 3).' }
      }
    }
  },

  // ── 14. EMAIL: SEND EMAIL ─────────────────────────────────────
  {
    name: 'sendEmail',
    description: 'Mengirim pesan email keluar melalui akun Gmail Tuan Faqih.',
    parameters: {
      type: 'OBJECT',
      properties: {
        to:      { type: 'STRING', description: 'Alamat email penerima.' },
        subject: { type: 'STRING', description: 'Subjek email.' },
        content: { type: 'STRING', description: 'Isi teks email.' }
      },
      required: ['to', 'subject', 'content']
    }
  },

  // ── 15. 2ND BRAIN VAULT: SAVE NOTE ────────────────────────────
  {
    name: 'saveVaultNote',
    description: 'Menyimpan ide, kutipan, riset, atau catatan penting ke dalam 2nd Brain Vault Supabase.',
    parameters: {
      type: 'OBJECT',
      properties: {
        content:  { type: 'STRING', description: 'Isi catatan atau ide yang ingin disimpan.' },
        category: { type: 'STRING', description: 'Kategori: "ACADEMIC", "RESEARCH", "DIPLOMACY", "PERSONAL", "PROJECT", "IDEA".' }
      },
      required: ['content']
    }
  },

  // ── 16. DISCIPLINE: MANAGE APP LIMITS ─────────────────────────
  {
    name: 'manageAppDiscipline',
    description: 'Mengecek, menambah, mengubah, atau mematikan batas waktu penggunaan aplikasi di HP Samsung Tuan Faqih (YouTube, TikTok, Instagram, Game).',
    parameters: {
      type: 'OBJECT',
      properties: {
        action:            { type: 'STRING', description: '"READ_LIMITS", "ADD_LIMIT", "UPDATE_LIMIT", "DISABLE_LIMIT", "ENABLE_LIMIT", "DELETE_LIMIT".' },
        appName:           { type: 'STRING', description: 'Nama aplikasi. Contoh: "YouTube", "TikTok", "Instagram", "Mobile Legends".' },
        maxSessionMinutes: { type: 'NUMBER', description: 'Batas durasi sekali buka (menit).' },
        maxDailyMinutes:   { type: 'NUMBER', description: 'Batas total penggunaan harian (menit).' }
      },
      required: ['action']
    }
  },

  // ── 17. MEMORY: QUERY PERSONAL FACTS ─────────────────────────
  {
    name: 'queryPersonalFacts',
    description: 'Mencari informasi, preferensi, catatan pribadi, atau sejarah Tuan Faqih dari Living Memory N.E.X.A.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Topik atau kata kunci yang ingin dicari. Contoh: "jadwal nahwu", "makanan favorit", "nomor bpjs", "skripsi".' }
      },
      required: ['query']
    }
  },

  // ── 18. MEMORY: SAVE PERSONAL FACT ───────────────────────────
  {
    name: 'savePersonalFact',
    description: 'Menyimpan fakta baru, preferensi, atau catatan penting tentang TUAN FAQIH ke database ingatan permanen.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact:     { type: 'STRING', description: 'Informasi atau fakta tentang TUAN FAQIH yang harus diingat.' },
        category: { type: 'STRING', description: 'Kategori memori: "USER_PROFILE", "PREFERENCE", "ACADEMIC", "PROJECT", "PERSONAL".' }
      },
      required: ['fact']
    }
  },

  // ── 19. MEMORY: SAVE CORE IDENTITY FACT ──────────────────────
  {
    name: 'saveCoreIdentityFact',
    description: 'Menyimpan aturan perilaku, koreksi, atau fakta tentang N.E.X.A SENDIRI ke memori identitas.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'Fakta atau aturan tentang N.E.X.A sendiri (bukan tentang Tuan).' }
      },
      required: ['fact']
    }
  },

  // ── 20. HARDWARE: CONTROL DEVICE ─────────────────────────────
  {
    name: 'controlDeviceHardware',
    description: 'Mengontrol perangkat keras HP Samsung Tuan Faqih (senter, volume, DND, kunci layar, baterai, GPS, buka app, cari HP, foto, screenshot).',
    parameters: {
      type: 'OBJECT',
      properties: {
        action:      { type: 'STRING', description: '"TOGGLE_FLASHLIGHT", "SET_VOLUME", "FORCE_DND", "LOCK_SCREEN", "GET_BATTERY_STATUS", "GET_LOCATION", "LAUNCH_APP", "PLAY_RINGTONE", "STOP_MEDIA", "TAKE_PHOTO", "TAKE_SCREENSHOT", "GO_HOME_SCREEN", "SHOW_RECENTS".' },
        enabled:     { type: 'BOOLEAN', description: 'true/false untuk senter atau DND.' },
        volumeLevel: { type: 'NUMBER', description: 'Tingkat volume 0–100.' },
        packageName: { type: 'STRING', description: 'Package name aplikasi untuk LAUNCH_APP.' },
        appName:     { type: 'STRING', description: 'Nama aplikasi yang ingin dibuka (contoh: "YouTube", "WhatsApp", "Chrome").' }
      },
      required: ['action']
    }
  },

  // ── 21. CALL: END CALL / HANG UP ──────────────────────────────
  {
    name: 'endCall',
    description: 'Mengakhiri atau menutup sesi panggilan telepon saat Tuan Faqih berpamitan atau meminta mematikan panggilan ("sudah ya", "tutup teleponnya", "matikan panggilannya", "akhiri panggilan", "sampai jumpa", "bye nexa", "cukup nexa"). PANGGIL TOOL INI dan Anda WAJIB mengucapkan salam perpisahan yang hangat dan ramah ("Baik Tuan Faqih, panggilan saya akhiri. Sampai jumpa!") dalam kalimat suara Anda.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: { type: 'STRING', description: 'Alasan penutupan panggilan. Contoh: "User requested hangup", "Conversation completed".' }
      }
    }
  },

  // ── 22. WEB SEARCH ────────────────────────────────────────────
  {
    name: 'searchWeb',
    description: 'Mencari informasi terkini dari internet secara cepat (berita, cuaca, kurs, pengetahuan umum, jadwal sholat).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Pertanyaan atau kata kunci pencarian.' }
      },
      required: ['query']
    }
  },

  // ── 22. SYSTEM DIAGNOSTICS: QUERY LOGS ───────────────────────
  {
    name: 'querySystemLogs',
    description: 'Membaca dan menganalisis log sistem server N.E.X.A secara real-time untuk diagnosa error/status.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: 'Kata kunci spesifik untuk difilter dari log (opsional).' }
      }
    }
  }
];

// ────────────────────────────────────────────────────────────────────────────
// MASTER TOOL EXECUTOR
// ────────────────────────────────────────────────────────────────────────────
async function executeLiveTool(toolName, args = {}) {
  console.log(`[LIVE-TOOL] 🛠️ Executing: ${toolName}(${JSON.stringify(args)})`);
  const startTime = Date.now();

  try {
    switch (toolName) {

      // ─────────────────────────────────────────────────────────────
      // 1. FINANCE: RECORD EXPENSE
      // ─────────────────────────────────────────────────────────────
      case 'recordExpense': {
        const nominal = Math.abs(Number(args.amount) || 0);
        if (nominal <= 0) return { status: 'ERROR', message: 'Nominal transaksi tidak valid.' };

        const desc     = String(args.description || 'Pengeluaran').trim();
        const rawMethod = String(args.paymentMethod || '');
        const normalizedAccount = _normalizeAccountName(rawMethod) || 'Cash';
        const category = String(args.category || '').trim() || _inferCategoryFromDescription(desc) || 'Lainnya';
        const targetDate = _parseDateFromVoice(args.date || 'today');

        const now     = new Date();
        const hours   = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeHHMM = `${hours}:${minutes}`;

        const writeRes = await _withToolTimeout(
          supabaseFinance.writeTransaction({
            txType: 'EXPENSE',
            nominal,
            categoryName: category,
            accountName: normalizedAccount,
            description: desc,
            dateISO: targetDate,
            timeHHMM,
            paymentMethod: normalizedAccount
          }),
          5000
        );

        const elapsed = Date.now() - startTime;
        console.log(`[LIVE-TOOL] ✅ Expense recorded in ${elapsed}ms: Rp${nominal.toLocaleString('id-ID')} (${desc}) → Status: ${writeRes?.status}`);

        return {
          status: writeRes?.status === 'SUCCESS' ? 'SUCCESS' : 'SAVED',
          message: `Pengeluaran Rp${nominal.toLocaleString('id-ID')} untuk ${desc} (Kategori: ${category}) berhasil dicatat menggunakan ${normalizedAccount}.`,
          amount: nominal,
          description: desc,
          category,
          paymentMethod: normalizedAccount,
          transaction_id: writeRes?.id || 'RECORDED'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 2. FINANCE: RECORD INCOME
      // ─────────────────────────────────────────────────────────────
      case 'recordIncome': {
        const nominal = Math.abs(Number(args.amount) || 0);
        if (nominal <= 0) return { status: 'ERROR', message: 'Nominal pemasukan tidak valid.' };

        const desc    = String(args.description || 'Pemasukan').trim();
        const rawDest = String(args.destinationAccount || '');
        const account = _normalizeAccountName(rawDest) || 'BCA';

        const now     = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const hours   = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timeHHMM = `${hours}:${minutes}`;

        const writeRes = await _withToolTimeout(
          supabaseFinance.writeTransaction({
            txType: 'INCOME',
            nominal,
            categoryName: 'Pemasukan',
            accountName: account,
            description: desc,
            dateISO: dateStr,
            timeHHMM,
            paymentMethod: 'Transfer bank'
          }),
          5000
        );

        return {
          status: writeRes?.status === 'SUCCESS' ? 'SUCCESS' : 'SAVED',
          message: `Pemasukan Rp${nominal.toLocaleString('id-ID')} (${desc}) berhasil dicatat masuk ke rekening ${account}.`,
          amount: nominal,
          destinationAccount: account,
          transaction_id: writeRes?.id || 'RECORDED'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 3. FINANCE: QUERY SUMMARY
      // ─────────────────────────────────────────────────────────────
      case 'queryFinancialSummary': {
        const now          = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [analytics, balances] = await Promise.all([
          _withToolTimeout(supabaseFinance.getFinanceAnalytics(startOfMonth, now), 5000),
          _withToolTimeout(supabaseFinance.getAccountBalances(), 5000)
        ]);

        const totalBalance  = (balances || []).reduce((sum, a) => sum + (a.balance || 0), 0);
        const balanceList   = (balances || []).map(b => `${b.account_name || b.name}: Rp${(b.balance || 0).toLocaleString('id-ID')}`).join(', ');
        const totalExpense  = analytics?.totalExpense || 0;
        const totalIncome   = analytics?.totalIncome  || 0;

        return {
          status: 'SUCCESS',
          timeframe: args.timeframe || 'this_month',
          expense_this_month: totalExpense,
          income_this_month: totalIncome,
          total_liquid_balance: totalBalance,
          account_balances: balanceList,
          summary_text: `Ringkasan bulan ini: Pengeluaran Rp${totalExpense.toLocaleString('id-ID')}, pemasukan Rp${totalIncome.toLocaleString('id-ID')}. Total saldo likuid Tuan Rp${totalBalance.toLocaleString('id-ID')} (${balanceList}).`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 4. CALENDAR: CREATE EVENT
      // ─────────────────────────────────────────────────────────────
      case 'createCalendarEvent': {
        const title         = String(args.title || 'Agenda Baru').trim();
        const rawTime       = args.startTime || '09:00';
        const targetDateISO = _parseDateFromVoice(args.date || 'today');

        let cleanTime = rawTime;
        if (/^\d{1,2}$/.test(cleanTime)) cleanTime = `${cleanTime.padStart(2, '0')}:00`;
        else if (/^\d{1,2}:\d{2}$/.test(cleanTime)) cleanTime = cleanTime;
        else cleanTime = '09:00';

        const startISO = `${targetDateISO}T${cleanTime}:00+07:00`;

        let endISO = null;
        let durationMins = 60;
        if (args.endTime) {
          let cleanEndTime = String(args.endTime);
          if (/^\d{1,2}$/.test(cleanEndTime)) cleanEndTime = `${cleanEndTime.padStart(2, '0')}:00`;
          endISO = `${targetDateISO}T${cleanEndTime}:00+07:00`;
        } else {
          durationMins = agendaManager.inferProbableDuration ? agendaManager.inferProbableDuration(title) : 60;
          const sDate = new Date(startISO);
          endISO = new Date(sDate.getTime() + durationMins * 60000).toISOString();
        }

        const created = await _withToolTimeout(
          googleWorkspace.createCalendarEvent(
            title,
            startISO,
            endISO,
            args.description || '',
            args.location || '',
            [30],
            '',
            ''
          ),
          6000
        );

        return {
          status: 'SUCCESS',
          message: `Jadwal "${title}" berhasil dicatat di Google Calendar untuk tanggal ${targetDateISO} pukul ${cleanTime} WIB.`,
          title,
          date: targetDateISO,
          start_time: cleanTime,
          event_id: created?.id || 'CREATED'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 5. CALENDAR: QUERY AGENDA
      // ─────────────────────────────────────────────────────────────
      case 'queryCalendarAgenda': {
        const timeframe = String(args.timeframe || 'today').toLowerCase();
        let action = 'READ_TODAY';
        if (timeframe === 'tomorrow' || timeframe === 'besok') action = 'READ_TOMORROW';
        else if (timeframe === 'upcoming' || timeframe === 'this_week' || timeframe === 'minggu_ini') action = 'READ_UPCOMING';

        const res = await _withToolTimeout(
          agendaManager.handleCalendarIntent({ action }, ''),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : 'Tidak ada agenda terjadwal.';

        return {
          status: 'SUCCESS',
          timeframe,
          agenda_details: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 6. CALENDAR: UPDATE EVENT
      // ─────────────────────────────────────────────────────────────
      case 'updateCalendarEvent': {
        const targetTitle = String(args.targetTitle || '').trim();
        if (!targetTitle) return { status: 'ERROR', message: 'Sebutkan judul agenda yang ingin diubah.' };

        const patch = { action: 'UPDATE', summary: targetTitle };
        if (args.newTitle) patch.summary = args.newTitle;
        if (args.newDate || args.newStartTime) {
          const dateStr = _parseDateFromVoice(args.newDate || 'today');
          const timeStr = args.newStartTime || '09:00';
          patch.start = `${dateStr}T${timeStr}:00+07:00`;
        }

        const res = await _withToolTimeout(
          agendaManager.handleCalendarIntent(patch, targetTitle),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Jadwal "${targetTitle}" berhasil diperbarui.`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 7. CALENDAR: DELETE EVENT
      // ─────────────────────────────────────────────────────────────
      case 'deleteCalendarEvent': {
        const title = String(args.title || '').trim();
        if (!title) return { status: 'ERROR', message: 'Sebutkan judul agenda yang ingin dihapus.' };

        const res = await _withToolTimeout(
          agendaManager.handleCalendarIntent({
            action: 'DELETE',
            summary: title
          }, title),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Jadwal "${title}" berhasil dihapus dari kalender.`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 8. TASKS: CREATE TASK
      // ─────────────────────────────────────────────────────────────
      case 'createTask': {
        const title    = String(args.title || 'Tugas Baru').trim();
        const dueDate  = args.dueDate ? _parseDateFromVoice(String(args.dueDate)) : null;
        const listName = args.listName || null;

        const res = await _withToolTimeout(
          taskManager.handleTaskIntent({
            action: 'CREATE',
            title,
            due_date: dueDate,
            list_name: listName,
            notes: args.notes || null
          }, title),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Tugas "${title}" berhasil dicatat di Google Tasks.`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 9. TASKS: QUERY TASKS
      // ─────────────────────────────────────────────────────────────
      case 'queryTasks': {
        const status   = String(args.status || 'pending').toLowerCase();
        const listName = args.listName || null;

        let action = 'READ';
        if (status === 'today' || status === 'hari_ini')                       action = 'READ_TODAY';
        else if (status === 'tomorrow' || status === 'besok')                  action = 'READ_TOMORROW';
        else if (status === 'overdue' || status === 'terlambat')               action = 'READ_OVERDUE';
        else if (status === 'upcoming' || status === 'this_week')              action = 'READ_UPCOMING';

        const res = await _withToolTimeout(
          taskManager.handleTaskIntent({ action, list_name: listName }, ''),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : 'Tidak ada tugas yang tertunda.';

        return {
          status: 'SUCCESS',
          task_details: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 10. TASKS: COMPLETE TASK
      // ─────────────────────────────────────────────────────────────
      case 'completeTask': {
        const taskTitle = String(args.taskTitle || '').trim();
        if (!taskTitle) return { status: 'ERROR', message: 'Sebutkan nama tugas yang ingin ditandai selesai.' };

        const res = await _withToolTimeout(
          taskManager.handleTaskIntent({
            action: 'COMPLETE',
            search_keyword: taskTitle
          }, taskTitle),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Tugas "${taskTitle}" berhasil ditandai selesai!`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 11. TASKS: DELETE TASK
      // ─────────────────────────────────────────────────────────────
      case 'deleteTask': {
        const taskTitle = String(args.taskTitle || '').trim();
        if (!taskTitle) return { status: 'ERROR', message: 'Sebutkan nama tugas yang ingin dihapus.' };

        const res = await _withToolTimeout(
          taskManager.handleTaskIntent({
            action: 'DELETE',
            search_keyword: taskTitle
          }, taskTitle),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Tugas "${taskTitle}" berhasil dihapus.`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 12. LOCATION: SEARCH NEARBY PLACES (OpenStreetMap Spatial)
      // ─────────────────────────────────────────────────────────────
      case 'searchNearbyPlaces': {
        const keyword = String(args.keyword || '').trim();
        if (!keyword) return { status: 'ERROR', message: 'Sebutkan jenis tempat yang ingin dicari.' };

        let locRes = null;
        try {
          locRes = await _withToolTimeout(
            locationOrchestrator.handleLocationQuery(keyword),
            7000
          );
        } catch (e) {
          console.warn('[LIVE-TOOL] Location query error:', e.message);
        }

        const cleanMessage = typeof locRes === 'string'
          ? locRes.replace(/<[^>]+>/g, '').slice(0, 600)
          : 'Tidak dapat menemukan tempat di sekitar posisi saat ini.';

        return {
          status: 'SUCCESS',
          keyword,
          places: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 13. EMAIL: QUERY EMAILS (Gmail Inbox)
      // ─────────────────────────────────────────────────────────────
      case 'queryEmails': {
        const limit = Number(args.maxResults) || 3;
        const kw    = args.searchKeyword || null;

        let emailList = [];
        try {
          emailList = await _withToolTimeout(
            gmailClient.getLatestEmails(limit, kw),
            6000
          );
        } catch (e) {
          console.warn('[LIVE-TOOL] Gmail read error:', e.message);
        }

        if (!emailList || emailList.length === 0) {
          return { status: 'SUCCESS', message: 'Kotak masuk email bersih, tidak ada pesan baru.' };
        }

        const summary = emailList.map((em, idx) =>
          `${idx + 1}. Dari: ${em.from || 'Anonim'} | Subjek: ${em.subject || '(Tanpa subjek)'} (${(em.snippet || '').slice(0, 80)})`
        ).join('\n');

        return {
          status: 'SUCCESS',
          count: emailList.length,
          emails: summary
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 14. EMAIL: SEND EMAIL
      // ─────────────────────────────────────────────────────────────
      case 'sendEmail': {
        const to      = String(args.to || '').trim();
        const subject = String(args.subject || 'Pesan dari Tuan Faqih').trim();
        const content = String(args.content || '').trim();

        if (!to || !content) return { status: 'ERROR', message: 'Alamat penerima dan isi pesan email wajib diisi.' };

        const sent = await _withToolTimeout(
          gmailClient.sendEmail(to, subject, content),
          7000
        );

        return {
          status: sent ? 'SUCCESS' : 'FAILED',
          message: sent
            ? `Email berhasil dikirimkan kepada ${to} dengan subjek "${subject}".`
            : `Gagal mengirimkan email ke ${to}. Periksa konfigurasi Gmail.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 15. 2ND BRAIN VAULT: SAVE NOTE
      // ─────────────────────────────────────────────────────────────
      case 'saveVaultNote': {
        const content  = String(args.content || '').trim();
        const category = String(args.category || 'IDEA').toUpperCase();

        if (!content) return { status: 'ERROR', message: 'Isi catatan tidak boleh kosong.' };

        const saved = await _withToolTimeout(
          supabaseMemories.saveIdeaToVault ? supabaseMemories.saveIdeaToVault(`[${category}] ${content}`) : Promise.resolve(true),
          5000
        );

        return {
          status: saved ? 'SUCCESS' : 'SAVED',
          message: `Catatan berhasil disimpan ke 2nd Brain Vault: "${content.slice(0, 60)}..."`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 16. DISCIPLINE: MANAGE APP LIMITS
      // ─────────────────────────────────────────────────────────────
      case 'manageAppDiscipline': {
        const action  = String(args.action || 'READ_LIMITS').toUpperCase();
        const appName = args.appName || null;

        const res = await _withToolTimeout(
          appDiscipline.handleDisciplineChatIntent({
            action,
            app_name: appName,
            max_session_minutes: args.maxSessionMinutes,
            max_daily_minutes: args.maxDailyMinutes
          }, appName || ''),
          6000
        );

        const cleanMessage = typeof res === 'string'
          ? res.replace(/<[^>]+>/g, '').slice(0, 500)
          : 'Status batas aplikasi telah diperbarui.';

        return {
          status: 'SUCCESS',
          action,
          details: cleanMessage
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 17. MEMORY: QUERY PERSONAL FACTS
      // ─────────────────────────────────────────────────────────────
      case 'queryPersonalFacts': {
        const query  = String(args.query || '').trim();
        const res    = await _withToolTimeout(
          geminiVectorCache.getRelevantFacts(query),
          4000
        );
        const allFacts = [...(res?.profileFacts || []), ...(res?.identityFacts || [])];

        if (allFacts.length === 0) {
          return { status: 'NOT_FOUND', message: `Tidak ditemukan catatan spesifik tentang "${query}" di memori saya.` };
        }

        const factsList = allFacts.slice(0, 5).join('\n• ');
        return {
          status: 'SUCCESS',
          query,
          facts: `• ${factsList}`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 18. MEMORY: SAVE PERSONAL FACT (Supersede Engine)
      // ─────────────────────────────────────────────────────────────
      case 'savePersonalFact': {
        const fact = String(args.fact || '').trim();
        if (!fact) return { status: 'ERROR', message: 'Fakta tidak boleh kosong.' };

        const saved = await _withToolTimeout(
          aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE'),
          6000
        );

        try {
          if (geminiVectorCache.invalidateCache) await geminiVectorCache.invalidateCache();
        } catch (_) {}

        return {
          status: 'SUCCESS',
          saved,
          message: saved
            ? `Fakta baru berhasil disimpan ke memori permanen Tuan Faqih: "${fact}".`
            : `Fakta ini sudah ada di memori atau merupakan pembaruan dari fakta sebelumnya.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 19. MEMORY: SAVE CORE IDENTITY FACT
      // ─────────────────────────────────────────────────────────────
      case 'saveCoreIdentityFact': {
        const fact = String(args.fact || '').trim();
        if (!fact) return { status: 'ERROR', message: 'Fakta identitas tidak boleh kosong.' };

        const saved = await _withToolTimeout(
          aiRouter.deduplicateAndSaveFact(fact, 'CORE_IDENTITY'),
          6000
        );

        try {
          await _withToolTimeout(
            aiRouter.deduplicateAndSaveSelfFact(fact, 'OPERATIONAL_RULES', 'LIVE_CALL', 'Voice call instruction'),
            6000
          );
        } catch (_) {}

        try { aiRouter.invalidatePersonalFactsCache(); } catch (_) {}

        return {
          status: 'SUCCESS',
          saved,
          message: saved
            ? `Aturan baru untuk saya berhasil disimpan: "${fact}".`
            : `Instruksi ini sudah tercatat sebelumnya.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 20. HARDWARE: CONTROL DEVICE (Full 25+ Hardware Passthrough)
      // ─────────────────────────────────────────────────────────────
      case 'controlDeviceHardware': {
        const action = String(args.action || '').toUpperCase();

        if (action === 'TOGGLE_FLASHLIGHT' || action === 'FLASHLIGHT') {
          const enabled = args.enabled !== undefined ? args.enabled : true;
          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('TOGGLE_FLASHLIGHT', { enabled }, { timeoutMs: 3000 }),
            4000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Lampu senter HP telah ${enabled ? 'dinyalakan' : 'dimatikan'}.` : 'Gagal mengubah status senter HP.'
          };
        }

        if (action === 'SET_VOLUME') {
          const vol = Number(args.volumeLevel !== undefined ? args.volumeLevel : 80);
          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('SET_VOLUME', { volume: vol, streamType: 'STREAM_MUSIC' }, { timeoutMs: 3000 }),
            4000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Volume HP diatur ke ${vol}%.` : 'Gagal mengatur volume HP.'
          };
        }

        if (action === 'FORCE_DND') {
          const enabled = args.enabled !== undefined ? args.enabled : true;
          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('FORCE_DND', { enabled }, { timeoutMs: 3000 }),
            4000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Mode Jangan Ganggu (DND) ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` : 'Gagal mengubah status DND.'
          };
        }

        if (action === 'LOCK_SCREEN') {
          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('LOCK_SCREEN', {}, { timeoutMs: 3000 }),
            4000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? 'Layar HP berhasil dikunci.' : 'Gagal mengunci layar HP.'
          };
        }

        if (action === 'GET_BATTERY_STATUS') {
          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('GET_BATTERY_STATUS', {}, { timeoutMs: 3000 }),
            4000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            battery_level: bridgeRes?.data?.level || null,
            is_charging: bridgeRes?.data?.isCharging || null,
            message: bridgeRes.success ? `Baterai HP saat ini ${bridgeRes?.data?.level || '?'}%${bridgeRes?.data?.isCharging ? ' (sedang charging)' : ''}.` : 'Gagal mengambil status baterai.'
          };
        }

        if (action === 'GET_LOCATION') {
          const bridgeRes = await _withToolTimeout(bridge.getLocation(), 5000);
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            latitude: bridgeRes.latitude,
            longitude: bridgeRes.longitude,
            address: bridgeRes.address || 'Koordinat berhasil diambil.'
          };
        }

        if (action === 'LAUNCH_APP') {
          const APP_PACKAGES = {
            'youtube': 'com.google.android.youtube',
            'whatsapp': 'com.whatsapp',
            'instagram': 'com.instagram.android',
            'tiktok': 'com.zhiliaoapp.musically',
            'spotify': 'com.spotify.music',
            'chrome': 'com.android.chrome',
            'gojek': 'com.gojek.app',
            'grab': 'com.grabtaxi.passenger',
            'shopee': 'com.shopee.id',
            'tokopedia': 'com.tokopedia.tkpd',
            'maps': 'com.google.android.apps.maps',
            'gmail': 'com.google.android.gm',
            'telegram': 'org.telegram.messenger'
          };

          const appNameLower = String(args.appName || '').toLowerCase().trim();
          const packageName  = args.packageName || APP_PACKAGES[appNameLower] || null;

          if (!packageName) {
            return {
              status: 'FAILED',
              message: `Tidak mengenali aplikasi "${args.appName}". Sebutkan nama aplikasi yang lebih spesifik.`
            };
          }

          const bridgeRes = await _withToolTimeout(
            mobileBridgeWs.sendCommand('LAUNCH_APP', { package_name: packageName }, { timeoutMs: 4000 }),
            5000
          );
          return {
            status: bridgeRes.success ? 'SUCCESS' : 'FAILED',
            action,
            message: bridgeRes.success ? `Aplikasi ${args.appName || packageName} berhasil dibuka di HP.` : `Gagal membuka aplikasi ${args.appName || packageName}.`
          };
        }

        if (action === 'END_CALL' || action === 'HANGUP') {
          return await executeLiveTool('endCall', args);
        }

        // Generic Passthrough for other Hardware actions (PLAY_RINGTONE, TAKE_PHOTO, TAKE_SCREENSHOT, GO_HOME_SCREEN, etc.)
        const genericRes = await _withToolTimeout(
          mobileBridgeWs.sendCommand(action, args, { timeoutMs: 4000 }),
          5000
        );

        return {
          status: genericRes.success ? 'SUCCESS' : 'FAILED',
          action,
          message: genericRes.success ? `Aksi ${action} berhasil dikirim ke HP.` : `Gagal mengeksekusi ${action} di HP.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 21. WEB SEARCH
      // ─────────────────────────────────────────────────────────────
      case 'searchWeb': {
        const query = String(args.query || '').trim();
        if (!query) return { status: 'ERROR', message: 'Query pencarian tidak boleh kosong.' };

        let searchResult = null;
        try {
          searchResult = await _withToolTimeout(webSearch.searchWeb(query), 6000);
        } catch (e) {
          console.warn('[LIVE-TOOL] searchWeb error:', e.message);
        }

        const cleanResult = typeof searchResult === 'string'
          ? searchResult.replace(/<[^>]+>/g, '').slice(0, 800)
          : (searchResult ? JSON.stringify(searchResult).slice(0, 800) : 'Tidak ada data ditemukan.');

        return {
          status: 'SUCCESS',
          query,
          result: cleanResult
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 22. SYSTEM DIAGNOSTICS: QUERY SYSTEM LOGS
      // ─────────────────────────────────────────────────────────────
      case 'querySystemLogs': {
        let rawLogs = logger.getRecentLogs() || '';
        const keyword = String(args.keyword || '').trim().toLowerCase();

        if (keyword) {
          const lines  = rawLogs.split('\n');
          const filtered = lines.filter(l => l.toLowerCase().includes(keyword));
          rawLogs = filtered.length > 0 ? filtered.join('\n') : rawLogs;
        }

        const lines   = rawLogs.split('\n').filter(l => l.trim().length > 0);
        const excerpt = lines.slice(-50).join('\n');

        if (!excerpt) {
          return {
            status: 'SUCCESS',
            log_lines: 0,
            summary: 'Log sistem bersih. Server berjalan normal tanpa error kritis.'
          };
        }

        const hasError   = /error|fail|exception|crash|timeout/i.test(excerpt);
        const hasWarning = /warn|warning/i.test(excerpt);

        return {
          status: 'SUCCESS',
          log_lines: lines.length,
          has_errors: hasError,
          has_warnings: hasWarning,
          recent_logs: excerpt,
          summary: hasError
            ? 'Terdeteksi kegagalan/error dalam log sistem.'
            : hasWarning
              ? 'Ada beberapa peringatan (warning) dalam log, tapi server berjalan stabil.'
              : 'Log sistem bersih. Semua proses berjalan normal.'
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 23. CALL MANAGEMENT: END CALL / HANG UP
      // ─────────────────────────────────────────────────────────────
      case 'endCall': {
        console.log(`[LIVE-TOOL] 📞 Autonomous Call Hangup requested: "${args.reason || 'Requested by user'}"`);

        // Schedule closing of the Live Voice WebSocket session and sending END_CALL after speech finishes
        try {
          const liveVoice = require('./Live_Voice_Engine');
          liveVoice.markEndingCall();

          // Safety fallback: ensure session terminates after 8 seconds even if turnComplete is delayed
          setTimeout(() => {
            mobileBridgeWs.sendCommand('END_CALL', { reason: args.reason || 'User requested hangup' }, { timeoutMs: 3000 }).catch(() => {});
            liveVoice.closeAllLiveSessions();
          }, 8000);
        } catch (e) {
          console.warn('[LIVE-TOOL] Failed to schedule live session close:', e.message);
        }

        return {
          status: 'SUCCESS',
          message: 'Panggilan telepon siap diakhiri. Sampaikan salam perpisahan yang ramah dan hangat kepada Tuan Faqih sekarang (contoh: "Baik Tuan Faqih, panggilan saya akhiri. Sampai jumpa!").'
        };
      }

      // ─────────────────────────────────────────────────────────────
      default:
        return { status: 'UNKNOWN_TOOL', message: `Tool "${toolName}" tidak terdaftar.` };
    }
  } catch (err) {
    console.error(`[LIVE-TOOL] ❌ Error executing ${toolName}:`, err.message);
    return { status: 'ERROR', message: `Gagal mengeksekusi ${toolName}: ${err.message}` };
  }
}

module.exports = {
  LIVE_TOOL_DECLARATIONS,
  executeLiveTool
};
