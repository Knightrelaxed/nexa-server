// ============================================================
// N.E.X.A 3.0 — LIVE TOOL REGISTRY v2.0
// Real-Time Tool Calling Registry for Google Gemini Multimodal Live API
// Translates voice intents into server domain executions in <50ms
// Full Support: Finance, Calendar, Tasks, Living Memory, Device Control,
//               Web Search, Core Identity, System Diagnostics, App Control
// ============================================================
'use strict';

const geminiVectorCache = require('../utils/gemini_vector_cache');
const supabaseFinance   = require('../infrastructure/Supabase_Finance');
const supabaseMemories  = require('../infrastructure/Supabase_Memories');
const mobileBridgeWs    = require('../interfaces/mobile_bridge/MobileBridge_WS');
const bridge            = require('../interfaces/mobile_bridge/adapter');
const agendaManager     = require('../domain/Agenda_Manager');
const taskManager       = require('../domain/Task_Manager');
const webSearch         = require('../infrastructure/Web_Search');
const googleWorkspace   = require('../infrastructure/Google_Workspace');
const googleTasks       = require('../infrastructure/Google_Tasks');
const logger            = require('../utils/logger');
const aiRouter          = require('./AI_Router');

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Per-tool timeout wrapper
// Prevents any single slow API from freezing the voice session
// Default: 5000ms per tool
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
// HELPER: Normalize payment method string from voice transcription to account name
// Maps raw STT output → valid account name in Supabase
// ────────────────────────────────────────────────────────────────────────────
function _normalizeAccountName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.toLowerCase().trim();

  // BCA variations
  if (/\bbca\b|mobile\s*banking\s*bca|m-?banking\s*bca|debit\s*bca|transfer\s*bca/.test(s)) return 'BCA';

  // Mandiri variations
  if (/\bmandiri\b|livin|livin'\s*by\s*mandiri|mandiri\s*mobile/.test(s)) return 'Mandiri';

  // GoPay / Gopay
  if (/\bgopay\b|go\s*pay/.test(s)) return 'GoPay';

  // ShopeePay
  if (/\bshopeepay\b|shopee\s*pay/.test(s)) return 'ShopeePay';

  // OVO
  if (/\bovo\b/.test(s)) return 'OVO';

  // Dana
  if (/\bdana\b/.test(s)) return 'DANA';

  // Cash / Tunai
  if (/\b(cash|tunai|uang\s*tunai|uang\s*fisik|kontan)\b/.test(s)) return 'Cash';

  // QRIS
  if (/\b(qris|qr\s*code|scan\s*qr|bayar\s*qr|kris|quris)\b/.test(s)) return 'QRIS';

  // BRI
  if (/\bbri\b|brimobi|bank\s*rakyat/.test(s)) return 'BRI';

  // Transfer bank generic
  if (/\btransfer\b|tf\b|trf\b/.test(s)) return 'Transfer';

  return null; // Will fallback to default in caller
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Infer expense category from description (heuristic, zero-token)
// Returns a likely category string or null to let caller use fallback
// ────────────────────────────────────────────────────────────────────────────
function _inferCategoryFromDescription(desc) {
  if (!desc || typeof desc !== 'string') return null;
  const d = desc.toLowerCase();

  // Food / Meals
  if (/\b(nasi|makan|ayam|soto|rendang|bakso|mie|bubur|warung|warteg|restoran|lauk|sate|gado|rawon|pecel|makan\s*siang|makan\s*malam|makan\s*pagi|sarapan|makan\s*berat|prasmanan|katering)\b/.test(d)) return 'Makan Berat / Makan Luar';

  // Snacks / Drinks / Café
  if (/\b(kopi|coffee|teh|boba|minuman|jajan|camilan|snack|es\s*krim|donat|roti|kafe|cafe|starbuck|kopi\s*kenangan|iced)\b/.test(d)) return 'Jajan / Ngopi / Kafe';

  // Groceries
  if (/\b(indomaret|alfamart|beras|minyak|sabun|shampo|odol|deterjen|belanja|supermarket|minimarket|grocery|groceries|bahan\s*makanan)\b/.test(d)) return 'Bahan Makanan / Groceries';

  // Transportation
  if (/\b(bensin|bahan\s*bakar|pertamina|pertalite|bbm|solar|ojek|gojek|grab|angkot|bis|bus|kereta|kai|busway|transjakarta|parkir|tol|toll)\b/.test(d)) return 'Transportasi';

  // Health
  if (/\b(apotek|obat|vitamin|dokter|klinik|rumah\s*sakit|puskesmas|konsultasi|medis|kesehatan)\b/.test(d)) return 'Kesehatan';

  // Entertainment
  if (/\b(bioskop|film|cinema|netflix|spotify|game|steam|playstation|hiburan|tiket|konser)\b/.test(d)) return 'Hiburan';

  // Education
  if (/\b(buku|kuliah|kursus|les|sekolah|fotokopi|print|seminar|workshop|pendidikan)\b/.test(d)) return 'Pendidikan';

  // Bills / Utilities
  if (/\b(listrik|pln|wifi|internet|pulsa|token|tagihan|iuran|cicilan|bayar\s*tagihan)\b/.test(d)) return 'Tagihan';

  // Laundry
  if (/\b(laundry|cuci\s*baju|cuci\s*pakaian|dry\s*clean)\b/.test(d)) return 'Jasa Laundry';

  // Personal care
  if (/\b(salon|pangkas|cukur|barbershop|perawatan|kecantikan|skincare|parfum)\b/.test(d)) return 'Perawatan Diri';

  return null; // No confident match
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Parse date string from voice to ISO date string (YYYY-MM-DD)
// Supports: today, tomorrow, besok, lusa, kemarin, hari nama (Senin-Minggu),
//           "minggu depan", "N hari lagi", ISO YYYY-MM-DD
// ────────────────────────────────────────────────────────────────────────────
function _parseDateFromVoice(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') {
    // default to today
    const now = new Date();
    return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
  }

  const d = dateStr.toLowerCase().trim();
  const nowJkt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;

  // Today
  if (/^(today|hari\s*ini|sekarang)$/.test(d)) {
    return nowJkt.toLocaleDateString('en-CA');
  }

  // Tomorrow
  if (/^(tomorrow|besok|esok)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + 1);
    return t.toLocaleDateString('en-CA');
  }

  // Lusa (day after tomorrow)
  if (/^(lusa|lusa\s*hari)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + 2);
    return t.toLocaleDateString('en-CA');
  }

  // Yesterday
  if (/^(yesterday|kemarin|tadi\s*malam)$/.test(d)) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() - 1);
    return t.toLocaleDateString('en-CA');
  }

  // "N hari lagi" / "N hari ke depan"
  const nDaysMatch = d.match(/^(\d+)\s*(hari\s*(?:lagi|ke\s*depan|kemudian)|days?\s*later)$/);
  if (nDaysMatch) {
    const t = new Date(nowJkt);
    t.setDate(t.getDate() + parseInt(nDaysMatch[1]));
    return t.toLocaleDateString('en-CA');
  }

  // Day of week — find NEXT occurrence (including today if it matches)
  const DAY_MAP = {
    'minggu': 0, 'sunday': 0,
    'senin': 1, 'monday': 1,
    'selasa': 2, 'tuesday': 2,
    'rabu': 3, 'wednesday': 3,
    'kamis': 4, 'thursday': 4,
    'jumat': 5, 'friday': 5,
    'sabtu': 6, 'saturday': 6
  };

  // "senin depan", "selasa ini", "jumat", etc.
  const isNextWeek = /depan|next/.test(d);
  for (const [dayName, dayNum] of Object.entries(DAY_MAP)) {
    if (d.includes(dayName)) {
      const t = new Date(nowJkt);
      const currentDay = t.getDay();
      let daysUntil = (dayNum - currentDay + 7) % 7;
      // If same day and "depan", add 7
      if (daysUntil === 0 && isNextWeek) daysUntil = 7;
      // If same day without "depan", pick today if it's genuinely a future event, else next week
      if (daysUntil === 0 && !isNextWeek) daysUntil = 7;
      t.setDate(t.getDate() + daysUntil);
      return t.toLocaleDateString('en-CA');
    }
  }

  // "bulan depan" → first day of next month
  if (/bulan\s*depan|next\s*month/.test(d)) {
    const t = new Date(nowJkt);
    t.setMonth(t.getMonth() + 1, 1);
    return t.toLocaleDateString('en-CA');
  }

  // Fallback: return today
  return nowJkt.toLocaleDateString('en-CA');
}

// ────────────────────────────────────────────────────────────────────────────
// TOOL SCHEMA DECLARATIONS
// Sent to Google Gemini Live API in the setup payload
// ────────────────────────────────────────────────────────────────────────────
const LIVE_TOOL_DECLARATIONS = [
  // ── 1. FINANCE: RECORD EXPENSE ────────────────────────────────
  {
    name: 'recordExpense',
    description: 'Mencatat transaksi pengeluaran keuangan Tuan Faqih ke database Supabase secara real-time. Panggil segera saat Tuan menyebutkan pembelian, pembayaran, atau pengeluaran apapun.',
    parameters: {
      type: 'OBJECT',
      properties: {
        amount:        { type: 'NUMBER', description: 'Jumlah nominal uang dalam Rupiah. Contoh: 25000 untuk dua puluh lima ribu rupiah.' },
        category:      { type: 'STRING', description: 'Kategori pengeluaran. Contoh: "Makan Berat / Makan Luar", "Jajan / Ngopi / Kafe", "Transportasi", "Bahan Makanan / Groceries", "Tagihan", "Kesehatan", "Hiburan", "Pendidikan", "Jasa Laundry", "Lainnya".' },
        description:   { type: 'STRING', description: 'Keterangan atau nama barang/jasa. Contoh: "nasi ayam bakar", "bensin pertalite", "kopi americano".' },
        paymentMethod: { type: 'STRING', description: 'Metode pembayaran yang disebutkan Tuan. Contoh: "BCA", "Cash", "QRIS", "GoPay", "ShopeePay", "Mandiri", "Transfer".' },
        date:          { type: 'STRING', description: 'Tanggal transaksi jika disebutkan secara khusus. Contoh: "today", "yesterday", "kemarin", "2026-08-19". Kosongkan jika tidak disebutkan.' }
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
        amount:            { type: 'NUMBER', description: 'Jumlah nominal uang yang diterima dalam Rupiah.' },
        description:       { type: 'STRING', description: 'Sumber atau keterangan pemasukan. Contoh: "Gaji", "Transfer dari Ayah", "Beasiswa", "Bayaran proyek".' },
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
    description: 'Membuat jadwal atau agenda baru di Google Calendar Tuan Faqih. Panggil saat Tuan ingin menjadwalkan kegiatan apapun.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title:       { type: 'STRING', description: 'Judul kegiatan. Contoh: "Kuliah Nahwu", "Rapat BEM", "Bimbingan Skripsi".' },
        date:        { type: 'STRING', description: 'Tanggal kegiatan. Contoh: "today", "tomorrow", "besok", "lusa", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu", "senin depan", "2026-08-25". Gunakan nama hari jika Tuan menyebutkan nama hari.' },
        startTime:   { type: 'STRING', description: 'Jam mulai format HH:mm WIB. Contoh: "09:00", "14:30", "20:00".' },
        endTime:     { type: 'STRING', description: 'Jam selesai format HH:mm WIB (opsional, akan diinfer otomatis dari jenis kegiatan).' },
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

  // ── 6. CALENDAR: DELETE EVENT ─────────────────────────────────
  {
    name: 'deleteCalendarEvent',
    description: 'Menghapus atau membatalkan jadwal dari Google Calendar Tuan Faqih. Panggil saat Tuan ingin membatalkan atau menghapus suatu agenda.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Judul atau kata kunci dari jadwal yang ingin dihapus. Contoh: "rapat BEM jam 2", "kuliah nahwu senin".' }
      },
      required: ['title']
    }
  },

  // ── 7. TASKS: CREATE TASK ─────────────────────────────────────
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

  // ── 8. TASKS: QUERY TASKS ─────────────────────────────────────
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

  // ── 9. TASKS: COMPLETE TASK ───────────────────────────────────
  {
    name: 'completeTask',
    description: 'Menandai tugas sebagai selesai di Google Tasks Tuan Faqih. Panggil saat Tuan bilang tugas sudah beres, selesai, atau done.',
    parameters: {
      type: 'OBJECT',
      properties: {
        taskTitle: { type: 'STRING', description: 'Nama atau kata kunci tugas yang ingin ditandai selesai. Contoh: "resume buku", "makalah sastra arab", "tugas 1".' }
      },
      required: ['taskTitle']
    }
  },

  // ── 10. TASKS: DELETE TASK ────────────────────────────────────
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

  // ── 11. MEMORY: QUERY PERSONAL FACTS ─────────────────────────
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

  // ── 12. MEMORY: SAVE PERSONAL FACT ───────────────────────────
  {
    name: 'savePersonalFact',
    description: 'Menyimpan fakta baru, preferensi, atau catatan penting tentang TUAN FAQIH ke database ingatan permanen. Panggil saat Tuan secara eksplisit meminta N.E.X.A untuk "ingat" sesuatu tentang dirinya.',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact:     { type: 'STRING', description: 'Informasi atau fakta tentang TUAN FAQIH yang harus diingat. Contoh: "Tuan Faqih alergi udang", "Tuan Faqih sekarang rutin olahraga lari pagi".' },
        category: { type: 'STRING', description: 'Kategori memori: "USER_PROFILE", "PREFERENCE", "ACADEMIC", "PROJECT", "PERSONAL".' }
      },
      required: ['fact']
    }
  },

  // ── 13. MEMORY: SAVE CORE IDENTITY FACT ──────────────────────
  {
    name: 'saveCoreIdentityFact',
    description: 'Menyimpan aturan perilaku, koreksi, atau fakta tentang N.E.X.A SENDIRI ke memori identitas. Panggil saat Tuan memberikan instruksi atau koreksi untuk N.E.X.A ("kamu jangan terlalu panjang", "mulai sekarang kamu harus...").',
    parameters: {
      type: 'OBJECT',
      properties: {
        fact: { type: 'STRING', description: 'Fakta atau aturan tentang N.E.X.A sendiri (bukan tentang Tuan). Contoh: "Saat di telepon, N.E.X.A harus berbicara singkat dan tidak bertele-tele".' }
      },
      required: ['fact']
    }
  },

  // ── 14. HARDWARE: CONTROL DEVICE ─────────────────────────────
  {
    name: 'controlDeviceHardware',
    description: 'Mengontrol fitur perangkat keras HP Samsung Tuan Faqih via Nexa Mobile Bridge.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action:      { type: 'STRING', description: '"TOGGLE_FLASHLIGHT", "SET_VOLUME", "FORCE_DND", "LOCK_SCREEN", "GET_BATTERY_STATUS", "GET_LOCATION", "LAUNCH_APP", "SPEAK_TEXT".' },
        enabled:     { type: 'BOOLEAN', description: 'true/false untuk senter atau DND.' },
        volumeLevel: { type: 'NUMBER', description: 'Tingkat volume 0–100.' },
        packageName: { type: 'STRING', description: 'Package name aplikasi untuk LAUNCH_APP. Contoh: "com.google.android.youtube", "com.whatsapp".' },
        appName:     { type: 'STRING', description: 'Nama aplikasi yang ingin dibuka. Contoh: "YouTube", "WhatsApp", "Chrome", "Spotify".' }
      },
      required: ['action']
    }
  },

  // ── 15. WEB SEARCH ────────────────────────────────────────────
  {
    name: 'searchWeb',
    description: 'Mencari informasi terkini dari internet secara cepat (berita, cuaca, kurs, pengetahuan umum, jadwal sholat, dll.).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Pertanyaan atau kata kunci pencarian.' }
      },
      required: ['query']
    }
  },

  // ── 16. SYSTEM DIAGNOSTICS: QUERY LOGS ───────────────────────
  {
    name: 'querySystemLogs',
    description: 'Membaca dan menganalisis log sistem server N.E.X.A secara real-time. Panggil saat Tuan bertanya tentang error server, status sistem, atau kenapa sesuatu tidak berjalan normal.',
    parameters: {
      type: 'OBJECT',
      properties: {
        keyword: { type: 'STRING', description: 'Kata kunci spesifik untuk difilter dari log (opsional). Contoh: "error", "supabase", "calendar".' }
      }
    }
  }
];

// ────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR
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

        // Normalize account/payment method from voice → valid account name
        const normalizedAccount = _normalizeAccountName(rawMethod) || 'Cash';

        // Infer category from description if Gemini didn't provide one
        const category = String(args.category || '').trim() || _inferCategoryFromDescription(desc) || 'Lainnya';

        // Resolve target date
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
        const title    = String(args.title || 'Agenda Baru').trim();
        const rawTime  = args.startTime || '09:00';

        // Parse date with full support for Indonesian day names
        const targetDateISO = _parseDateFromVoice(args.date || 'today');

        // Normalize time format
        let cleanTime = rawTime;
        if (/^\d{1,2}$/.test(cleanTime)) cleanTime = `${cleanTime.padStart(2, '0')}:00`;
        else if (/^\d{1,2}:\d{2}$/.test(cleanTime)) cleanTime = cleanTime;
        else cleanTime = '09:00';

        const startISO = `${targetDateISO}T${cleanTime}:00+07:00`;

        let endISO = null;
        if (args.endTime) {
          let cleanEndTime = String(args.endTime);
          if (/^\d{1,2}$/.test(cleanEndTime)) cleanEndTime = `${cleanEndTime.padStart(2, '0')}:00`;
          endISO = `${targetDateISO}T${cleanEndTime}:00+07:00`;
        }

        const res = await _withToolTimeout(
          agendaManager.handleCalendarIntent({
            action: 'CREATE',
            summary: title,
            start: startISO,
            end: endISO,
            location: args.location || null,
            description: args.description || null
          }, title),
          8000
        );

        const cleanMessage = res?.message
          ? res.message.replace(/<[^>]+>/g, '')
          : `Agenda "${title}" berhasil dijadwalkan di Kalender.`;

        return {
          status: res?.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
          message: cleanMessage,
          title,
          date: targetDateISO,
          start_time: cleanTime
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
      // 6. CALENDAR: DELETE EVENT
      // ─────────────────────────────────────────────────────────────
      case 'deleteCalendarEvent': {
        const title = String(args.title || '').trim();
        if (!title) return { status: 'ERROR', message: 'Sebutkan judul atau kata kunci agenda yang ingin dihapus.' };

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
      // 7. TASKS: CREATE TASK
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
      // 8. TASKS: QUERY TASKS
      // ─────────────────────────────────────────────────────────────
      case 'queryTasks': {
        const status   = String(args.status || 'pending').toLowerCase();
        const listName = args.listName || null;

        let action = 'READ'; // READ is valid — maps to all active tasks
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
      // 9. TASKS: COMPLETE TASK
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
      // 10. TASKS: DELETE TASK
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
      // 11. MEMORY: QUERY PERSONAL FACTS
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
      // 12. MEMORY: SAVE PERSONAL FACT (with Supersede Engine)
      // ─────────────────────────────────────────────────────────────
      case 'savePersonalFact': {
        const fact = String(args.fact || '').trim();
        if (!fact) return { status: 'ERROR', message: 'Fakta tidak boleh kosong.' };

        // Use full Supersede Engine (4-way dedup) from AI_Router
        const saved = await _withToolTimeout(
          aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE'),
          6000
        );

        // Invalidate RAM vector cache so next query reflects new fact
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
      // 13. MEMORY: SAVE CORE IDENTITY FACT (about N.E.X.A itself)
      // ─────────────────────────────────────────────────────────────
      case 'saveCoreIdentityFact': {
        const fact = String(args.fact || '').trim();
        if (!fact) return { status: 'ERROR', message: 'Fakta identitas tidak boleh kosong.' };

        const saved = await _withToolTimeout(
          aiRouter.deduplicateAndSaveFact(fact, 'CORE_IDENTITY'),
          6000
        );

        // Also update self-model under OPERATIONAL_RULES layer
        try {
          await _withToolTimeout(
            aiRouter.deduplicateAndSaveSelfFact(fact, 'OPERATIONAL_RULES', 'LIVE_CALL', 'Explicit instruction from Tuan during voice call'),
            6000
          );
        } catch (_) {}

        // Invalidate caches
        try { aiRouter.invalidatePersonalFactsCache(); } catch (_) {}

        return {
          status: 'SUCCESS',
          saved,
          message: saved
            ? `Aturan baru untuk saya berhasil disimpan: "${fact}". Saya akan ingat dan patuhi ini ke depannya.`
            : `Instruksi ini sudah tercatat sebelumnya atau merupakan pembaruan dari catatan saya.`
        };
      }

      // ─────────────────────────────────────────────────────────────
      // 14. HARDWARE: CONTROL DEVICE
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
            message: bridgeRes.success
              ? `Lampu senter HP telah ${enabled ? 'dinyalakan' : 'dimatikan'}.`
              : 'Gagal mengubah status senter HP.'
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
            message: bridgeRes.success
              ? `Volume HP diatur ke ${vol}%.`
              : 'Gagal mengatur volume HP.'
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
            message: bridgeRes.success
              ? `Mode Jangan Ganggu (DND) ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.`
              : 'Gagal mengubah status DND.'
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
            message: bridgeRes.success
              ? `Baterai HP saat ini ${bridgeRes?.data?.level || '?'}%${bridgeRes?.data?.isCharging ? ' (sedang charging)' : ''}.`
              : 'Gagal mengambil status baterai.'
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
          // Map common app names to package names
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
            'camera': 'com.android.camera2',
            'galeri': 'com.sec.android.gallery3d',
            'telegram': 'org.telegram.messenger',
            'facebook': 'com.facebook.katana',
            'twitter': 'com.twitter.android',
            'x': 'com.twitter.android'
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
            message: bridgeRes.success
              ? `Aplikasi ${args.appName || packageName} berhasil dibuka di HP.`
              : `Gagal membuka aplikasi ${args.appName || packageName}.`
          };
        }

        return { status: 'UNKNOWN_ACTION', message: `Aksi hardware "${action}" tidak dikenali.` };
      }

      // ─────────────────────────────────────────────────────────────
      // 15. WEB SEARCH
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
      // 16. SYSTEM DIAGNOSTICS: QUERY SYSTEM LOGS
      // ─────────────────────────────────────────────────────────────
      case 'querySystemLogs': {
        let rawLogs = logger.getRecentLogs() || '';
        const keyword = String(args.keyword || '').trim().toLowerCase();

        // Filter by keyword if provided
        if (keyword) {
          const lines  = rawLogs.split('\n');
          const filtered = lines.filter(l => l.toLowerCase().includes(keyword));
          rawLogs = filtered.length > 0 ? filtered.join('\n') : rawLogs;
        }

        // Take last 50 lines for context
        const lines   = rawLogs.split('\n').filter(l => l.trim().length > 0);
        const excerpt = lines.slice(-50).join('\n');

        if (!excerpt) {
          return {
            status: 'SUCCESS',
            log_lines: 0,
            summary: 'Log sistem kosong. Server berjalan normal tanpa catatan error kritis.'
          };
        }

        // Quick error detection
        const hasError   = /error|fail|exception|crash|timeout/i.test(excerpt);
        const hasWarning = /warn|warning/i.test(excerpt);

        return {
          status: 'SUCCESS',
          log_lines: lines.length,
          has_errors: hasError,
          has_warnings: hasWarning,
          recent_logs: excerpt,
          summary: hasError
            ? 'Terdeteksi error/kegagalan dalam log sistem. Periksa detail di recent_logs.'
            : hasWarning
              ? 'Ada beberapa peringatan (warning) dalam log, tapi tidak ada error kritis.'
              : 'Log sistem bersih. Semua proses berjalan normal.'
        };
      }

      // ─────────────────────────────────────────────────────────────
      default:
        return { status: 'UNKNOWN_TOOL', message: `Tool "${toolName}" tidak terdaftar dalam Live Tool Registry.` };
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
