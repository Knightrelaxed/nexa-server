const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');



// ============================================================
// ADAPTIVE HISTORY — dynamic fetch limit based on context
// Normal: 6 exchanges (12 msg) | Context-ref detected: 10 exchanges (20 msg)
// ============================================================
const CONTEXTUAL_REF_WORDS = [
  'yang tadi', 'sebelumnya', 'lanjut', 'ubah itu', 'yang barusan',
  'tadi bilang', 'hapus yang', 'yang itu', 'edit itu', 'hapus itu',
];
const HISTORY_CHAR_CAP = 10000; // ~2.500 token safety net (pesan N.E.X.A max 4.000 char)

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
  'tugas hari ini', 'deadline', 'jadwal hari'
];

// ============================================================
// PROGRESSIVE FACT INJECTION
// ============================================================
const FACT_KEYWORD_GROUPS = [
  // Keuangan & transaksi
  ['pengeluaran','beli','bayar','makan','jajan','harga','rb','ribu','qris','transfer','uang','tagihan','ongkos'],
  // Waktu & jadwal (cross-domain: "kampus" bisa relevan ke FINANCE)
  ['jadwal','jam','kuliah','kelas','meeting','rapat','besok','hari','agenda','kampus','ugm','skripsi'],
  // Lokasi & aktivitas
  ['kantor','toko','rumah','mall','warung','pergi','dari','ke','lokasi','tempat'],
  // Preferensi & kebiasaan
  ['preferensi','biasa','suka','kebiasaan','cara','gaya','selalu','favorit','rutin'],
];
const PROFILE_CORE_COUNT  = 20; // fakta tertua — selalu diinjeksi
const PROFILE_KW_LIMIT    =  8; // max fakta tambahan dari keyword matching

// ============================================================
// PERSONAL FACTS CACHE (Module-level — lives as long as server runs)
// Zero overhead after first fetch. Invalidated when new PERSONAL_FACT is saved.
// ============================================================
let _personalFactsCache = null;
let _personalFactsCacheTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes TTL (safety net re-fetch)

/**
 * Load personal facts with smart caching.
 * First call: fetches from Supabase (~15ms).
 * Subsequent calls: returns from RAM (0ms) until cache is invalidated.
 */
async function loadPersonalFactsWithCache() {
  const now = Date.now();
  // Return from cache if still valid
  if (_personalFactsCache !== null && (now - _personalFactsCacheTime) < CACHE_TTL_MS) {
    return _personalFactsCache;
  }
  // Fetch fresh from Supabase
  const facts = await supabaseMemories.getPersonalFacts();
  _personalFactsCache = facts;
  _personalFactsCacheTime = now;
  const count = (facts.userProfile?.length || 0) + (facts.coreIdentity?.length || 0);
  console.log(`[ROUTER] Personal facts cache refreshed. Count: ${count}`);
  return facts;
}

/**
 * Invalidate the personal facts cache.
 * Call this immediately after saving a new PERSONAL_FACT so the next
 * AI response already includes it.
 */
function invalidatePersonalFactsCache() {
  _personalFactsCache = null;
  _personalFactsCacheTime = 0;
  console.log('[ROUTER] Personal facts cache invalidated. Will re-fetch on next message.');
}

const ROUTER_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[TUGAS KOGNITIF & ROUTING]
Tugas Anda adalah membaca pesan, menganalisis riwayat obrolan (jika ada), dan menentukan INTENT secara absolut.
Sebagai sistem cerdas multiguna, kapabilitas Anda tidak terbatas.

LOGIKA PELENGKAPAN (SANGAT PENTING):
Jika instruksi Tuan Faqih tidak detail atau kekurangan data esensial untuk intent selain FINANCE (contoh: "geser rapat" tanpa menyebut jam), Anda WAJIB menahan eksekusi. Atur intent menjadi "INCOMPLETE_INFO" dan gunakan \`reply_message\` untuk menanyakan detail tersebut. KHUSUS TRANSAKSI KEUANGAN (FINANCE), JANGAN gunakan INCOMPLETE_INFO; tetap gunakan intent FINANCE (contoh: action RECORD) dengan deskripsi "-" agar backend keuangan bisa mencatatnya sementara dan proaktif bertanya.

LOGIKA KONTEKS LANJUTAN (WAJIB):
- Jika pesan terbaru berupa perintah lanjutan singkat (misal: "yang tadi", "sebelumnya", "lanjut", "yang itu", "hapus itu", "ubah itu"), BACA [STATUS AKTIF N.E.X.A SAAT INI] atau [RIWAYAT OBROLAN] untuk mengikat intent ke domain yang tepat (misalnya FINANCE, TASK, atau CALENDAR). JANGAN ubah intent menjadi NORMAL_CHAT atau INCOMPLETE_INFO jika konteks aslinya masih sangat relevan!
- Prioritas konteks: EMAIL → DATABASE → TASK → CALENDAR jika frasa follow-up ambigu.
- Frasa "sebelum itu/sebelumnya" setelah membaca email HARUS tetap menjadi intent EMAIL (minta email yang lebih lama), bukan intent lain.
- Jika user bilang "periksa database" tanpa tabel/aksi rinci, gunakan INCOMPLETE_INFO dan tanya tabel Supabase yang dimaksud.

LOGIKA PEMBELAJARAN PASIF (PASSIVE BACKGROUND LEARNING) - SANGAT PENTING:
Sebagai AI yang super pintar, Anda harus tajam membedakan informasi berharga jangka panjang vs percakapan kasual/sementara. Ekstrak informasi ke array "learned_user_facts" atau "learned_core_identities" HANYA jika memenuhi syarat:
1. "learned_user_facts": Fakta PERMANEN tentang Tuan Faqih. Contoh: Makanan favorit, jam tidur rutin, nama keluarga, tujuan hidup, prinsip kerja. JANGAN simpan hal sementara seperti "Tuan Faqih sedang makan siang" atau "Tuan sedang lelah hari ini".
2. "learned_core_identities": Aturan PERMANEN tentang cara N.E.X.A bersikap, atau dinamika hubungan/interaksi kalian. Contoh: "N.E.X.A harus memanggil dengan nada lebih santai di akhir pekan", "Tuan Faqih suka jika penjelasan teknis dipersingkat".
3. ANTI-DUPLIKASI: Jika informasi sudah ada di bagian [FAKTA PERMANEN TENTANG TUAN FAQIH] di prompt bawah, JANGAN menambahkannya lagi! KOSONGKAN array jika tidak ada hal krusial yang perlu dipelajari.

Output Anda HARUS berupa JSON valid tanpa markdown \`\`\`json, dengan format:
{
  "reasoning": "Tuliskan 1-3 kalimat analisis logis (Chain of Thought). Pahami [STATUS AKTIF N.E.X.A SAAT INI] (apa yang sedang dikerjakan sistem) dan riwayat obrolan sebelumnya. Evaluasi apa maksud Tuan Faqih sekarang, apakah ini lanjutan dari konteks sebelumnya, dan apa aksi yang paling tepat.",
  "intent": "FINANCE" | "CALENDAR" | "TASK" | "WEB_SEARCH" | "DISCIPLINE" | "2ND_BRAIN" | "USER_PROFILE" | "CORE_IDENTITY" | "EMAIL" | "DATABASE" | "INCOMPLETE_INFO" | "NORMAL_CHAT" | "<NAMA_INTENT_KUSTOM_LAINNYA>",
  "reply_message": "String balasan natural dan luwes untuk Tuan Faqih (wajib ada jika intent NORMAL_CHAT, INCOMPLETE_INFO, atau DISCIPLINE)",
  "learned_user_facts": ["Fakta BARU & PERMANEN tentang Tuan Faqih. KOSONGKAN array ini jika hanya obrolan biasa/sementara atau sudah pernah diingat."],
  "learned_core_identities": ["Aturan BARU tentang diri N.E.X.A atau dinamika hubungan kalian. KOSONGKAN array ini jika tidak ada instruksi/pembelajaran baru."],
  "extracted_data": {
     // FINANCE: { action: "RECORD"|"RECORD_MULTIPLE"|"READ_LATEST"|"READ_ANALYTICS"|"EDIT"|"DELETE"|"UNDO_DELETE"|"IMPORT_FROM_EMAIL"|"CONFIRM_TRANSACTION"|"UPDATE_PENDING"|"CANCEL_TRANSACTION", nominal: number, type: "INCOME"|"EXPENSE", destination: string, category: string, description: string, time: string (ISO), account: string (NAMA AKUN PERSIS dari daftar [AKUN KEUANGAN AKTIF] atau kosong jika tidak disebutkan), payment_method: "QRIS"|"Transfer bank"|"Kartu Kredit"|"Tunai"|null, search_keyword: string, date_text: string, limit: number, transactions: [{"nominal": number, "type": "INCOME"|"EXPENSE", "destination": "string", "category": "string", "description": "string", "time": "string", "account": "string", "payment_method": "QRIS"|"Transfer bank"|"Kartu Kredit"|"Tunai"|null}] }
     //   → Jika pengguna MENGKONFIRMASI ("masukkan", "ya", "benar", "simpan") untuk menanggapi transaksi tertunda, WAJIB gunakan "CONFIRM_TRANSACTION". Ini akan LANGSUNG menyimpan data.
     //   → Jika pengguna MENGOREKSI/MENAMBAH DETAIL transaksi tertunda, WAJIB gunakan "UPDATE_PENDING" beserta field yang relevan. PENTING: JANGAN MENGISI field "description" jika pengguna HANYA menjawab metode pembayaran atau nama akun (misal: "pake qris bro", "pakai livin"). Isi HANYA "payment_method" atau "account", dan biarkan field lain kosong (null) agar catatan lama tidak tertimpa!
     //   → Jika pengguna MEMBATALKAN/MENOLAK transaksi tertunda ("batalkan", "batal", "jangan"), WAJIB gunakan "CANCEL_TRANSACTION".
     //   → Jika pengguna meminta MENCATAT transaksi baru ("catat pengeluaran..."), gunakan action "RECORD".
     //     - CATATAN/DESKRIPSI: Jika pengguna HANYA menyebutkan nominal dan kata generik seperti "pengeluaran", "bayar", "uang keluar", "pemasukan", tanpa menyebutkan SECARA SPESIFIK apa yang dibeli atau tujuannya, field "description" WAJIB diisi "-". Ini penting agar N.E.X.A bisa proaktif menanyakan detailnya nanti!
     //   → KHUSUS jika pengguna mengirim struk/gambar/teks dengan banyak item dan meminta "satu-satu dipisah" atau "pisahkan transaksinya", WAJIB gunakan action "RECORD_MULTIPLE" dan isi array "transactions" dengan objek masing-masing transaksi. DILARANG menggabungkan nominal jika disuruh memisah.
     //     - WAKTU: Jika pengguna HARI/TANGGAL ("kemarin", "lusa") TANPA menyebutkan JAM, buat perkiraan logis (misal 12:00 siang) dan isi field "time". TETAP gunakan action "RECORD". JANGAN PERNAH gunakan "INCOMPLETE_INFO" karena akan membuat nominal yang sudah diketik user hangus!
     //   → PENTING: Untuk action RECORD/EDIT/UPDATE_PENDING, pilih kategori spesifik HANYA dari opsi daftar [KATEGORI TRANSAKSI AKTIF].
     //     - ATURAN KATEGORI (SANGAT KRITIS — BACA DENGAN TELITI):
     //       DILARANG KERAS menggunakan kategori "Lainnya" atau "Uncategorized" kecuali benar-benar tidak ada yang mendekati.
     //       PROSES KOGNITIF WAJIB (4 LANGKAH):
     //       1. IDENTIFIKASI OBJEK: Apa yang DIBELI/DIBAYAR? (bukan siapa/di mana/bagaimana)
     //       2. TENTUKAN TUJUAN INTI: Mengapa uang keluar? Apa fungsi utamanya?
     //       3. COCOKKAN ke kategori yang paling SEMANTIK DEKAT di daftar [KATEGORI TRANSAKSI AKTIF]
     //       4. VERIFIKASI: Apakah ada kategori lain yang LEBIH TEPAT? Jika ya, ganti!
     //
     //       ATURAN DISAMBIGUASI (SANGAT PENTING):
     //       - Fokus pada OBJEK/SUBSTANSI transaksi, BUKAN kata-kata permukaan!
     //       - "iuran" / "patungan" / "urunan" untuk acara/kegiatan → kategori SOSIAL/ACARA, BUKAN kategori makanan meskipun acaranya melibatkan makan!
     //       - "makrab" = "malam keakraban" (acara sosial kampus). "iuran makrab" = kontribusi untuk acara sosial → BUKAN "Makanan dan Minuman"!
     //       - "rokok" / "sigaret" / "vape" / "liquid" / "cerutu" / "tembakau" → kategori "Tembakau" atau "Tembakau, Alkohol", BUKAN "Layanan" atau "Lainnya"!
     //       - "bir" / "wine" / "alkohol" / "miras" / "arak" / "vodka" / "whiskey" → kategori "Tembakau, Alkohol"
     //       - "ojek" / "grab" / "gojek" / "taxi" / "bus" / "kereta" / "bensin" / "parkir" / "tol" → kategori Transportasi
     //       - "kopi" / "makan" / "restoran" / "warteg" / "jajan" / "snack" / "minuman" → kategori Makanan
     //       - "pulsa" / "kuota" / "internet" / "wifi" / "listrik" / "air PDAM" / "gas" → kategori Tagihan/Utilitas
     //       - "laundry" / "salon" / "cukur" / "servis HP" / "reparasi" → kategori Layanan
     //       - "sedekah" / "infaq" / "zakat" / "donasi" / "sumbangan" → kategori Donasi/Amal
     //       - "tabungan" / "investasi" / "deposito" / "saham" / "reksadana" → kategori Tabungan/Investasi
     //
     //       CONTOH SALAH → BENAR (PELAJARI!):
     //       ❌ "beli rokok" → "Layanan"          ✅ "beli rokok" → "Tembakau, Alkohol"
     //       ❌ "iuran makrab" → "Makanan dan Minuman" ✅ "iuran makrab" → kategori Sosial/Acara/Hiburan (cari yang paling dekat di daftar!)
     //       ❌ "bayar grab" → "Layanan"           ✅ "bayar grab" → "Transportasi"
     //       ❌ "beli liquid vape" → "Belanja"      ✅ "beli liquid vape" → "Tembakau, Alkohol"
     //   → METODE PEMBAYARAN (field "payment_method"): Ekstrak HANYA jika user secara eksplisit menyebutkan atau sangat jelas tersirat. Gunakan inferensi cerdas:
     //     - "pakai QRIS", "scan QR", "bayar QR", "pake QR", "via QRIS" → "QRIS"
     //     - "transfer", "TF", "kirim ke rekening", "via ATM", "mobile banking", "via BCA/Mandiri/BRI/BNI" (tanpa QRIS) → "Transfer bank"
     //     - "kartu kredit", "gesek kartu", "pake kartu", "tap kartu", "cicil", "kredit", "pakai CC" → "Kartu Kredit"
     //     - "tunai", "cash", "uang cash", "bayar cash", "uang fisik", "bayar langsung", "pegang uang" → "Tunai"
     //     - Jika TIDAK disebutkan sama sekali oleh user: isi null (sistem akan gunakan default QRIS)
     //   → AKUN (field "account"): Ekstrak persis sesuai nama di daftar [AKUN KEUANGAN AKTIF]. Jika pengguna menyebutkan akun yang TIDAK ADA di daftar (misal akun fiktif), atau tidak menyebutkan sama sekali, KOSONGKAN field "account" dan TETAP gunakan intent "FINANCE" dengan action "RECORD". JANGAN PERNAH gunakan "INCOMPLETE_INFO" untuk transaksi keuangan yang informasinya kurang (biarkan backend yang bertanya).
     //   → Gunakan action "READ_LATEST" jika pengguna meminta melihat/menampilkan data transaksi. WAJIB sertakan: "date_text" (misal: "kemarin", "hari ini", "tanggal 14"), "search_keyword" (kata kunci nama/merchant), "type" ("INCOME"|"EXPENSE"), dan "category" JIKA disebutkan oleh pengguna. Jika pengguna meminta spesifik jumlah (misal "terakhir", "1 saja", "3 transaksi"), WAJIB isi field "limit" dengan angka (1, 3, dst). Jika tidak, biarkan null.
     //   → Gunakan action "READ_ANALYTICS" jika pengguna meminta laporan total pemasukan, pengeluaran, saldo akhir, atau "analitik keuangan".
     //   → Gunakan action "CATEGORY_BREAKDOWN" jika pengguna menanyakan pengeluaran per kategori, kategori terbesar, atau "paling banyak dibelanjakan untuk apa". Sertakan "date_text" jika disebutkan.
     //   → Gunakan action "PERIOD_COMPARISON" jika pengguna meminta perbandingan periode ("bulan ini vs bulan lalu", "minggu ini vs minggu lalu", dll). Sertakan "date_text".
     //   → Gunakan action "TOP_EXPENSES" jika pengguna meminta pengeluaran terbesar/terbanyak ("apa saja pengeluaran terbesar", "top 5 pengeluaran"). Sertakan "date_text" dan "limit" jika disebutkan.
     //   → Gunakan action "ACCOUNT_BALANCES" jika pengguna menanyakan saldo semua akun, kekayaan bersih, atau "saldo di masing-masing dompet".
     //   → Gunakan action "DAILY_TREND" jika pengguna menanyakan tren harian, pola belanja harian, hari paling boros, atau grafik harian. Sertakan "date_text".
     //   → Gunakan action "SMART_SUMMARY" jika pengguna meminta ringkasan keuangan, kondisi keuangan, atau laporan lengkap ("gimana keuanganku?", "kasih ringkasan", "rekap keuangan"). Sertakan "date_text".
     //   → Gunakan action "MONTHLY_SUMMARY" jika pengguna meminta tren bulanan, grafik 7 bulan, atau histori bulanan keuangan ("tren bulanku", "7 bulan terakhir").
     //   → Gunakan action "SAVING_RATE" jika pengguna menanyakan tingkat tabungan, saving rate, seberapa banyak yang ditabung, atau persentase hemat ("berapa saving rate aku?", "seberapa boros aku?"). Sertakan "date_text".
     //   → Gunakan action "BALANCE_TREND" jika pengguna menanyakan grafik/tren saldo harian suatu akun, atau pergerakan saldo hari per hari. Sertakan "date_text".
     //   → Gunakan action "EDIT" jika pengguna meminta mengubah/mengedit transaksi lama. WAJIB isi search_keyword dengan KATA KUNCI PENCARIAN (bisa berupa nominal lama seperti "9500" atau nama merchant). Jika pengguna hanya merujuk pada transaksi paling akhir (misal: "ubah yang barusan", "edit yang tadi"), WAJIB set search_keyword="LATEST". JANGAN MENGOSONGKAN search_keyword.
     //   → Gunakan action "DELETE" jika pengguna meminta menghapus transaksi. Sama seperti edit, jika pengguna bilang "hapus yang tadi" atau "hapus transaksi terakhir", WAJIB set search_keyword="LATEST".
     //   → Gunakan action "UNDO_DELETE" jika pengguna meminta membatalkan/mengembalikan transaksi yang baru dihapus ("batalkan hapus", "undo", "kembalikan yang dihapus").
     //   → Gunakan action "IMPORT_FROM_EMAIL" jika user meminta mengambil/memasukkan transaksi dari email Livin ke catatan keuangan.
     // CALENDAR: { action: "CREATE"|"DELETE"|"UPDATE"|"READ"|"READ_TODAY"|"READ_UPCOMING", summary: string, start: string (ISO 8601 +07:00), end: string (ISO 8601 +07:00), description: string, eventId: string, location: string, reminder_minutes: number[], recurrence: string, color_id: string }
     //   → color_id: ID warna event Google Calendar (WAJIB diisi jika user menyebutkan warna). Mapping:
     //     "merah"/"penting banget"/"kritis" → "11" | "biru" → "9" | "hijau" → "2" | "kuning"/"perhatian" → "5"
     //     "ungu" → "3" | "pink" → "4" | "oranye" → "6" | "abu-abu"/"santai" → "8"
     //     Jika tidak disebutkan warna atau urgensinya, biarkan kosong "" (string kosong).
     //   → FORMAT WAJIB: 'start' dan 'end' HARUS ISO 8601 LENGKAP dengan offset +07:00.
     //     Contoh BENAR: "2026-05-07T19:00:00+07:00" | Contoh SALAH: "19:00", "jam 7 malam", null
     //
     //   → CREATE: Buat jadwal baru. Wajib: summary + start. Kosongkan 'end' jika durasi tidak disebutkan.
     //     Tanggal default = HARI INI. Jika user menyebut "besok", "Senin", "tanggal 20" → hitung dari tanggal saat ini.
     //     Field opsional:
     //     - location: "di Gedung A lt 3", "online via Zoom" → isi field location jika ada informasi tempat
     //     - reminder_minutes: array angka menit sebelum event → [30, 10] = ingatkan 30 menit dan 10 menit sebelum
     //       Default jika tidak disebutkan: [] (gunakan default kalender)
     //       Contoh: "ingatkan saya 1 jam sebelumnya" → reminder_minutes: [60]
     //     - recurrence: RRULE string untuk jadwal berulang.
     //       Contoh: "setiap Senin" → "RRULE:FREQ=WEEKLY;BYDAY=MO"
     //               "setiap Selasa dan Kamis" → "RRULE:FREQ=WEEKLY;BYDAY=TU,TH"
     //               "setiap hari kerja" → "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
     //               "setiap hari" → "RRULE:FREQ=DAILY"
     //               "setiap bulan tanggal 15" → "RRULE:FREQ=MONTHLY;BYMONTHDAY=15"
     //
     //   → READ: Baca jadwal kalender. Isi sesuai konteks:
     //     - "jadwal hari ini" → tidak perlu isi start/end (default ke hari ini)
     //     - "jadwal besok" / "jadwal Jumat" → isi start = awal hari itu, end = akhir hari itu (23:59:59)
     //     - "jadwal minggu ini" / "minggu depan" → isi start = Senin, end = Minggu rentang tersebut
     //     - "jadwal bulan ini" / "bulan Juni" → isi start = tgl 1 bulan itu, end = tgl terakhir bulan itu
     //     - "jam berapa matkul X?" / "matkul X sampai jam berapa?" → isi summary = "X" (kata kunci nama acara), TIDAK perlu start/end
     //     - "cari jadwal X" → isi summary = kata kunci nama acara
     //
     //   → UPDATE: Ubah jadwal yang sudah ada. Isi summary = nama acara untuk dicari, plus field yang diubah (start/end/description/location).
     //     Jika hanya ganti jam mulai → isi start baru saja. Jika hanya ganti nama → isi summary baru saja.
     //
     //   → DELETE: Hapus jadwal (termasuk semua perulangan jika jadwal recurring). Wajib: summary = nama acara.
     //   → READ_TODAY: KHUSUS untuk "hari ini apa saja?", "agenda hari ini" — GABUNGAN kalender + tugas satu dashboard.
     //   → READ_UPCOMING: Untuk "minggu ini apa aja?", "7 hari ke depan" — GABUNGAN kalender + tugas 7 hari.
     // 2ND_BRAIN: { action: "APPEND"|"READ"|"EDIT"|"DELETE", title: string, content: string, search_keyword: string }
     //   → Gunakan untuk menyimpan ide, draft, ringkasan, atau catatan kerja yang akan disinkronkan dengan Google Docs.
     // USER_PROFILE: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Gunakan INI HANYA jika pengguna SECARA EKSPLISIT menyuruh Anda ("ingat bahwa...", "lupakan bahwa...").
     //   → Untuk penemuan fakta secara OTOMATIS/PASIF dari obrolan, JANGAN gunakan intent ini. Gunakan array "learned_user_facts" di *root* JSON agar Anda tetap bisa mengeksekusi intent utama (misalnya FINANCE).
     // CORE_IDENTITY: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Sama seperti atas, gunakan HANYA jika disuruh eksplisit. Untuk pembelajaran pasif, gunakan array "learned_core_identities" di *root* JSON.
     // TASK: { action: "CREATE"|"CREATE_SUBTASK"|"CREATE_MULTIPLE"|"READ"|"READ_LIST"|"READ_LISTS"|"READ_TODAY"|"READ_UPCOMING"|"READ_OVERDUE"|"READ_DONE"|"COMPLETE"|"DELETE"|"EDIT"|"MOVE"|"CLEAR_DONE"|"SET_PRIORITY", title: string, due_date: string (ISO 8601 +07:00 atau null), notes: string, search_keyword: string, list_name: string, parent_task_keyword: string, priority: "HIGH"|"NORMAL", duration_minutes: number|null, tasks: [{title, notes, due_date, list_name, duration_minutes}] }
     //   → duration_minutes: Estimasi durasi pengerjaan tugas DALAM MENIT. Ekstrak secara natural dari pesan user.
     //     Contoh inferensi cerdas:
     //     - "buat tugas review dokumen 2 jam besok" → duration_minutes: 120
     //     - "catat tugas kerjakan essay sekitar 90 menit" → duration_minutes: 90
     //     - "tugas rapat tim 1.5 jam" → duration_minutes: 90
     //     - "buat tugas baca jurnal setengah jam" → duration_minutes: 30
     //     - "buat tugas presentasi, butuh waktu 45 menit" → duration_minutes: 45
     //     - "tugas kerjakan laporan #durasi:2j" → duration_minutes: 120 (tag legacy tetap didukung)
     //     Jika user TIDAK menyebutkan durasi sama sekali, isi null. N.E.X.A akan menanyakan langsung.
     //   → SET_PRIORITY: Tandai tugas YANG SUDAH ADA sebagai prioritas tinggi ("ini sangat penting", "prioritaskan", "bintangi"). Wajib isi search_keyword = kata kunci nama tugas. JANGAN gunakan CREATE jika pengguna hanya meminta memprioritaskan.
     //   → COMPLETE: Selesaikan tugas yang SUDAH ADA ("selesaikan tugas", "tandai selesai", "sudah dikerjakan", "centang"). Wajib isi search_keyword = kata kunci nama tugas.
     //   → CREATE: Buat tugas BARU ("Catat tugas: kerjakan essay", "tambahkan ke daftar belanja: beras"). JANGAN gunakan ini untuk mengubah prioritas atau menyelesaikan tugas yang sudah ada.
     //   → CREATE_MULTIPLE: Buat BEBERAPA tugas sekaligus. Gunakan HANYA jika ada lebih dari 1 tugas yang jelas disebutkan (misal: setelah saran proaktif "1. Siapkan materi 2. Review slides"). Wajib isi array "tasks": [{"title": "...", "notes": "...", "due_date": null, "list_name": "..."}]
     //     Field opsional:
     //     - list_name: Nama list Google Tasks jika disebutkan eksplisit (misal: "masukkan ke list Kuliah").
     //       Jika tidak disebutkan, N.E.X.A akan auto-kategorikan dan konfirmasi ke Tuan.
     //   → CREATE_SUBTASK: Buat sub-tugas di bawah tugas lain.
     //     - title: nama sub-tugas baru
     //     - parent_task_keyword: kata kunci nama tugas utama (akan dicari di Google Tasks)
     //     Contoh: "tambahkan sub-tugas 'buat PPT' ke dalam tugas 'persiapan seminar'"
     //   → READ: "tampilkan tugasku" (SEMUA task aktif, dikelompokkan: terlambat/hari ini/mendatang)
     //   → READ_LIST: "tampilkan list Tugas Kuliah", "apa isi list Belanja?" → isi list_name
     //   → READ_LISTS: "tampilkan semua list tugasku", "daftar list apa saja?"
     //   → READ_TODAY: "tugas hari ini", "apa yang harus saya kerjakan hari ini?" (hanya task jatuh tempo hari ini)
     //   → READ_UPCOMING: "tugas minggu ini", "apa saja deadline minggu depan?" (task 7 hari ke depan, dikelompokkan per tanggal)
     //   → READ_OVERDUE: "tugas apa yang terlambat?", "overdue task" (task melewati deadline)
     //   → READ_DONE: "tugas apa yang sudah selesai?"
     //   → COMPLETE: "tandai tugas essay sebagai selesai" (gunakan search_keyword)
     //   → DELETE: "hapus tugas essay Arab" (gunakan search_keyword)
     //   → EDIT: "ubah deadline tugas essay jadi Senin" (gunakan search_keyword untuk cari, due_date/title/notes untuk nilai baru)
     //   → MOVE: "pindahkan tugas essay ke list Tugas Kuliah" (gunakan search_keyword untuk cari tugas, list_name untuk tujuan)
     //   → CLEAR_DONE: "bersihkan semua tugas selesai"
     // WEB_SEARCH: { query: string, type: "search"|"news" }
     //   → Gunakan jika pengguna menanyakan fakta real-time, berita terkini, nilai tukar, cuaca, atau informasi yang butuh penelusuran internet.
     //   → type "news": jika eksplisit minta berita terbaru. type "search": untuk semua pencarian umum.
     //   → Contoh: "siapa presiden Indonesia?", "berita terbaru UGM", "kurs dolar hari ini"
     // EMAIL: { action: "READ" | "SEND" | "DELETE", search_keyword: string, max_results: number, to: string, subject: string, content: string }
     //   → Gunakan action "READ" jika pengguna meminta mengecek kotak masuk (sertakan search_keyword jika mencari email tertentu).
     //   → Isi max_results sesuai jumlah yang diminta user (contoh: "satu saja" => 1, "3 email terbaru" => 3). Default 5 jika tidak disebut.
     //   → Gunakan action "SEND" jika pengguna meminta mengirim email (wajib ada "to", "subject", dan "content").
     //   → Gunakan action "DELETE" jika meminta menghapus email (sertakan search_keyword).
     // DATABASE: { action: "LIST_TABLES"|"READ_TABLE"|"INSERT_ROW"|"UPDATE_ROW"|"DELETE_ROW"|"DELETE_ALL_ROWS"|"DELETE_ALL_ROWS_CONFIRMED"|"CANCEL_ACTION", table_name: string, row_id: number, search_keyword: string, max_results: number, row_data: object, update_data: object }
     //   → Gunakan intent DATABASE HANYA untuk perintah terkait Supabase (cek tabel, lihat data tabel, tambah/edit/hapus baris di nexa_vault_items, nexa_behavior_log, dll).
     //   → PENTING: DILARANG KERAS menggunakan intent DATABASE untuk kata kunci "Tabel keuangan" atau "Buku kas". Gunakan intent FINANCE untuk hal tersebut.
     //   → PENTING: DILARANG MENGARANG ACTION. "DELETE_ROWS" (jamak) TIDAK ADA. Jika diminta menghapus banyak baris, gunakan "DELETE_ROW" untuk satu, atau tolak.
     //   → Jika user secara eksplisit meminta menghapus "seluruh" atau "semua" data di sebuah tabel Supabase, gunakan action "DELETE_ALL_ROWS".
     //   → PENTING: Jika asisten sebelumnya telah meminta konfirmasi untuk menghapus seluruh tabel (PERINGATAN), dan jawaban terbaru user bermakna MENYETUJUI (misal: "ya", "gas", "lakukan", "oke", "silakan"), Anda WAJIB mempertahankan intent DATABASE dan menggunakan action "DELETE_ALL_ROWS_CONFIRMED".
     //   → Jika jawaban user bermakna MENOLAK/MEMBATALKAN (misal: "tidak", "batal", "jangan", "cancel"), gunakan action "CANCEL_ACTION".
     //   → PENTING: Jika user meminta menghapus atau mengelola "nexa vault", "folder vault", atau "metadata vault", WAJIB gunakan intent DATABASE dengan table_name "nexa_vault_items". JANGAN PERNAH mengarang intent seperti "FILE_MANAGEMENT".
     //   → PENTING: Jika user meminta menghapus/membersihkan "riwayat chat", "memori obrolan", atau "ingatan", WAJIB gunakan intent DATABASE dengan action "DELETE_ALL_ROWS" dan table_name "nexa_chat_memories".
     //   → Jika user berkata umum seperti "periksa database" TANPA menyebut tabel/aksi, WAJIB pakai INCOMPLETE_INFO dan tanya tabel mana: nexa_chat_memories / nexa_finance_dedup / nexa_user_profile / nexa_core_identity / nexa_2nd_brain / nexa_vault_items.
     // DEVICE_CONTROL: { action: "ALARM"|"FLASHLIGHT"|"VOLUME"|"LOCK", params: apa saja }
     // Jika intent kustom: { ...buat struktur data JSON relevan berdasarkan logika Anda... }
  },
  "reply_message": "Respon natural, profesional, dan lincah. PENTING: Anda SEKARANG BISA mengakses Gmail langsung. Gunakan intent EMAIL untuk membaca, mengirim, atau menghapus email (Jangan halusinasi lagi).",
  "god_mode_trigger": false // true khusus DISCIPLINE jika terjadi pelanggaran ekstrem
}
`;

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
  // If it contains rush words, lots of typos (heuristic: repeated letters/caps), or exclamation marks
  const rushWords = ['cepet', 'buruan', 'darurat', 'penting', 'sekarang', 'urgent', 'gawat'];
  const hasRush = rushWords.some(w => str.includes(w));
  const hasExclamation = (text.match(/!/g) || []).length >= 2;
  const isAllCaps = text.length > 5 && text === text.toUpperCase();

  if (hasRush || hasExclamation || isAllCaps) return 'STRESSED';

  const casualWords = ['santai', 'nggak buru', 'nanti aja', 'kalo sempet', 'haha', 'wkwk'];
  const isCasual = casualWords.some(w => str.includes(w));
  if (isCasual) return 'CASUAL';

  return 'NEUTRAL';
}

/**
 * Zero-latency pre-flight domain classifier.
 * Detects whether the user message contains time/date references
 * or calendar-specific keywords.
 */
function _preflightClassify(text) {
  const t = text.toLowerCase();
  const hasTime = _CAL_TIME_KWS.some(kw => t.includes(kw)) || /\d{1,2}:\d{2}/.test(text);
  const hasCal  = _CAL_DOMAIN_KWS.some(kw => t.includes(kw));
  return { hasTime, hasCal };
}

/**
 * Progressive userProfile fact injection
 */
function _selectUserProfileFacts(userProfile, userMessage) {
  if (!userProfile || userProfile.length === 0) return [];

  // Oldest PROFILE_CORE_COUNT facts → always included (no filter)
  const core      = userProfile.slice(0, PROFILE_CORE_COUNT);
  const remaining = userProfile.slice(PROFILE_CORE_COUNT);
  if (remaining.length === 0) return core;

  const t = userMessage.toLowerCase();
  const activeKws = FACT_KEYWORD_GROUPS
    .filter(group => group.some(kw => t.includes(kw)))
    .flat();

  if (activeKws.length === 0) return core;

  // fact is a plain string — use fact.toLowerCase(), NOT fact.content.toLowerCase()
  const relevant = remaining.filter(fact =>
    activeKws.some(kw => fact.toLowerCase().includes(kw))
  );

  return [...core, ...relevant.slice(0, PROFILE_KW_LIMIT)];
}

async function _fetchRecentFinanceSummary(limit) {
  try {
    const financeEngine = require('../domain/Finance_Engine');
    const summary = await financeEngine.getRecentTransactions(limit);
    if (!summary || summary.includes('(Tidak ada transaksi')) return null;
    return summary;
  } catch (e) {
    return null;
  }
}

async function _fetchUpcomingEventsSummary(limit) {
  try {
    const googleWorkspace = require('../infrastructure/Google_Workspace');
    // Using getTodaysEvents and taking the next 'limit' events
    const todayStr = await googleWorkspace.getTodaysEvents();
    if (!todayStr || todayStr.includes('Tidak ada jadwal')) return null;
    
    // Just parse the first few lines
    const lines = todayStr.split('\n').filter(l => l.trim().length > 0);
    // Take up to `limit` lines that look like events (ignoring the header)
    const eventLines = lines.slice(1, limit + 1);
    if (eventLines.length === 0) return null;
    return eventLines.join(', ');
  } catch (e) {
    return null;
  }
}

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput, runtimeHints = {}) {
  // ── Sentiment Detection (Empathy Layer) ──────────────────────────────────
  // Silently score user's stress/urgency from writing style.
  // We do NOT call AI for this — it's pure heuristic (zero latency).
  const _sentimentScore = _detectSentiment(textInput);

  // ── Pre-flight Domain Classifier (0 tokens, 0ms) ─────────────────────────
  const { hasTime, hasCal } = _preflightClassify(textInput);
  const _hasContextRef = CONTEXTUAL_REF_WORDS.some(kw => textInput.toLowerCase().includes(kw));

  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // 2. Contextual Retrieval — dynamic limit (Step 3: Adaptive History)
  const _fetchLimit = _hasContextRef ? 20 : 12;
  const _rawMemories = await supabaseMemories.getRecentMemories(_fetchLimit);

  // Character safety net — trim oldest messages if total exceeds HISTORY_CHAR_CAP.
  let _memories = _rawMemories;
  const _totalHistChars = _rawMemories.reduce((s, m) => s + (m.content || '').length, 0);
  if (_totalHistChars > HISTORY_CHAR_CAP) {
    let _chars = 0;
    const _kept = [];
    for (let i = _rawMemories.length - 1; i >= 0; i--) {
      const _len = (_rawMemories[i].content || '').length;
      if (_chars + _len <= HISTORY_CHAR_CAP) {
        _kept.unshift(_rawMemories[i]);
        _chars += _len;
      } else { continue; } // FIX BUG 2: Menggunakan continue agar tidak membuang pesan pendek yang lebih lama
    }
    // Pastikan tidak mulai dengan pesan 'nexa' tanpa pasangan user-nya
    if (_kept.length > 0 && _kept[0].role === 'nexa') _kept.shift();
    _memories = _kept;
    console.log(`[ROUTER] History trimmed by char cap: ${_rawMemories.length}msg/${_totalHistChars}ch → ${_memories.length}msg/${_chars}ch`);
  }

  const contextStr = _memories.length > 0
    ? _memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';

  // 3. Build personal facts context block (Step 4: Progressive userProfile injection)
  let factsContext = '';
  const _selectedProfile = _selectUserProfileFacts(personalFacts.userProfile, textInput);
  if (_selectedProfile.length > 0) {
    factsContext += `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${_selectedProfile.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }
  if (personalFacts.coreIdentity && personalFacts.coreIdentity.length > 0) {
    factsContext += `\n[CORE IDENTITY & ATURAN SIKAP N.E.X.A — PATUHI INI]\n${personalFacts.coreIdentity.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`;
  }

  // 3.5. Inject Current Jakarta Time — manually built to be runtime-safe on any Node/Bun version
  const _now = new Date();
  // Offset UTC→WIB (+7h) using en-US locale (guaranteed to work everywhere)
  const _jkt = new Date(_now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const _DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const _MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const currentJakartaTime =
    `${_DAYS[_jkt.getDay()]}, ${_jkt.getDate()} ${_MONTHS[_jkt.getMonth()]} ${_jkt.getFullYear()} ` +
    `pukul ${String(_jkt.getHours()).padStart(2, '0')}:${String(_jkt.getMinutes()).padStart(2, '0')} WIB`;
  // ISO date string in Jakarta (for AI date arithmetic in TASK/CALENDAR intents)
  const currentJakartaISO = `${_jkt.getFullYear()}-${String(_jkt.getMonth() + 1).padStart(2, '0')}-${String(_jkt.getDate()).padStart(2, '0')}`;

  // Build mini-calendar — conditionally gated by pre-flight classifier (Step 2)
  const _calDays = hasCal ? 7 : (hasTime ? 3 : 0);
  const _miniCal = [];
  for (let i = 0; i <= _calDays; i++) {
    const d = new Date(_jkt.getTime() + i * 86400000);
    const ds = `${_jkt.getFullYear() === d.getFullYear() ? '' : d.getFullYear() + '-'}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayFull = `${_DAYS[d.getDay()]}, ${d.getDate()} ${_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    _miniCal.push(`  +${i} hari: ${dayFull} (ISO: ${ds})`);
  }
  const miniCalStr = _miniCal.join('\n');

  // ── Cross-Domain Fusion + Accounts Context ─────────────────────────────────
  // Silently pull recent finance + upcoming calendar data + active accounts list.
  // Runs in parallel — zero sequential latency penalty.
  let crossDomainBlock = '';
  let activeAccountsBlock = '';
  let activeCategoriesBlock = '';
  try {
    const [recentTxResult, upcomingEvResult, accountsResult, categoriesResult] = await Promise.allSettled([
      _fetchRecentFinanceSummary(3),
      _fetchUpcomingEventsSummary(3),
      // Load daftar akun aktif dari Supabase Finance (dengan cache)
      (async () => {
        try {
          const supabaseFinance = require('../infrastructure/Supabase_Finance');
          return await supabaseFinance.getAccountsList();
        } catch (_) { return []; }
      })(),
      // Load daftar kategori aktif dari Supabase Finance
      (async () => {
        try {
          const supabaseFinance = require('../infrastructure/Supabase_Finance');
          return await supabaseFinance.getCategoriesList();
        } catch (_) { return []; }
      })()
    ]);
    const finLines = [];
    if (recentTxResult.status === 'fulfilled' && recentTxResult.value) {
      finLines.push(`Keuangan Terkini (3 terakhir): ${recentTxResult.value}`);
    }
    if (upcomingEvResult.status === 'fulfilled' && upcomingEvResult.value) {
      finLines.push(`Jadwal Mendatang: ${upcomingEvResult.value}`);
    }
    if (finLines.length > 0) {
      crossDomainBlock = `\n[DATA LINTAS DOMAIN — GUNAKAN UNTUK KONEKSI KONTEKS CERDAS]\n${finLines.join('\n')}\n`;
    }

    // Bangun blok akun aktif jika ada data
    if (accountsResult.status === 'fulfilled' && accountsResult.value && accountsResult.value.length > 0) {
      const accountLines = accountsResult.value.map(a => `- ${a.name} (${a.type})`).join('\n');
      activeAccountsBlock = `\n[AKUN KEUANGAN AKTIF — PAKAI NAMA PERSIS INI UNTUK FIELD "account" DI FINANCE]\n${accountLines}\nCatatan: Jika user menyebut nama akun/dompet/bank yang mirip salah satu di atas, petakan ke nama yang paling cocok.\n`;
    }

    // Bangun blok kategori aktif jika ada data
    if (categoriesResult.status === 'fulfilled' && categoriesResult.value && categoriesResult.value.length > 0) {
      const _cats = categoriesResult.value;
      const _income  = _cats.filter(c => c.type === 'income').map(c => c.name).join(', '); // FIX BUG 1: lowercase 'income'
      const _expense = _cats.filter(c => c.type === 'expense').map(c => c.name).join(', '); // FIX BUG 1: lowercase 'expense'
      const _catLines = [];
      if (_income)  _catLines.push(`PEMASUKAN: ${_income}`);
      if (_expense) _catLines.push(`PENGELUARAN: ${_expense}`);
      
      activeCategoriesBlock = `\n[KATEGORI TRANSAKSI AKTIF — PAKAI NAMA PERSIS INI UNTUK FIELD "category" DI FINANCE]\n${_catLines.join('\n')}\n\n[PANDUAN PEMILIHAN KATEGORI]\nJANGAN mencocokkan kategori berdasarkan substring/kata kunci permukaan saja!\nGunakan PENALARAN SEMANTIK: tanyakan "Apa SUBSTANSI/OBJEK yang dibayar?" bukan "Kata apa yang mirip?".\nContoh penalaran benar:\n- "beli rokok" → objek = rokok (tembakau) → cari kategori yang mengandung tembakau/alkohol\n- "iuran makrab angkatan" → objek = iuran/kontribusi untuk acara sosial kampus → cari kategori sosial/hiburan/acara, BUKAN makanan\n- "bayar laundry" → objek = jasa cuci pakaian → kategori layanan/jasa\n- "grab ke kampus" → objek = transportasi → kategori transportasi\n`;
    }
  } catch (_) { /* Non-critical — never crash routing */ }

  let runtimeContextBlock = '';
  if (runtimeHints && Object.keys(runtimeHints).length > 0) {
    const lines = [];
    if (runtimeHints.pendingEmailContext) {
      lines.push(`- Status: Sedang membaca kotak masuk Email Livin. Kata kunci: "${runtimeHints.pendingEmailContext.searchKeyword || 'Semua'}".`);
    }
    if (runtimeHints.pendingDatabaseContext) {
      lines.push(`- Status: Sedang memanipulasi tabel database Supabase "${runtimeHints.pendingDatabaseContext.tableName}". Aksi terakhir: ${runtimeHints.pendingDatabaseContext.lastAction}.`);
    }
    if (runtimeHints.pendingCalendarContext) {
      lines.push(`- Status: Sedang memproses pembuatan jadwal kalender "${runtimeHints.pendingCalendarContext.summary}".`);
    }
    if (runtimeHints.pendingVaultContext) {
      lines.push(`- Status: Sedang memproses unggahan dokumen/gambar ke 2nd Brain Vault.`);
    }
    if (runtimeHints.conversationContext && runtimeHints.conversationContext.lastAssistantReply) {
      lines.push(`- INGAT BAIK-BAIK, pesan N.E.X.A yang paling terakhir dikirim ke user adalah:\n  "${runtimeHints.conversationContext.lastAssistantReply}"`);
    }
    if (lines.length > 0) {
      runtimeContextBlock = `\n[STATUS AKTIF N.E.X.A SAAT INI (SANGAT PENTING UNTUK FOLLOW-UP)]\n${lines.join('\n')}\n`;
    }
  }

  // ── Build Sentiment Instruction Block ─────────────────────────────────────
  let sentimentBlock = '';
  if (_sentimentScore === 'STRESSED') {
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH — WAJIB DIPATUHI]\nAnalisis gaya penulisan menunjukkan Tuan sedang TERBURU-BURU atau STRES. Respons N.E.X.A harus: (1) SUPER SINGKAT — max 3 kalimat, (2) Tidak ada basa-basi panjang, (3) Langsung ke inti, (4) Nada hangat dan suportif.\n`;
  } else if (_sentimentScore === 'CASUAL') {
    sentimentBlock = `\n[DETEKSI EMOSI TUAN FAQIH]\nTuan sedang santai. Boleh sedikit lebih hangat dan conversational dalam respons.\n`;
  }

  const prompt = `
[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}
ISO Date Hari Ini: ${currentJakartaISO}
${miniCalStr ? `
[KALENDER REFERENSI${hasCal ? ' — 7 HARI KE DEPAN' : ''}]
${miniCalStr}
(Gunakan tabel di atas sebagai acuan mutlak. Jika user menyebut nama hari seperti "Jumat" atau "Senin depan", cocokkan dengan baris yang tepat.)
` : ''}
${factsContext}${activeAccountsBlock}${activeCategoriesBlock}${sentimentBlock}${crossDomainBlock}
[RIWAYAT KONTEKS RUNTIME]
${runtimeContextBlock || '[Tidak ada konteks runtime tambahan]'}

[RIWAYAT OBROLAN]
${contextStr}

[PESAN TERBARU TUAN FAQIH]
${textInput}

Tentukan intent dan ekstrak data!
`;

  // 4. Execute Cognitive Routing (Medium Temperature = 0.3)
  let resultJsonStr = await executeWithFallback(prompt, ROUTER_SYSTEM_PROMPT, 0.3);

  // Clean markdown block if GenAI decides to return it despite instructions
  let cleanStr = resultJsonStr.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleanStr.indexOf('{');
  const lastBrace = cleanStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const routingData = JSON.parse(cleanStr);

    // 5. Save new memory ONLY after successful parse (symmetric context)
    // We only save the user's input here. The final reply (domainReply or reply_message)
    // will be saved by the caller (e.g. webhook.js) to ensure we don't save duplicate "draft" messages.

    return routingData;
  } catch (err) {
    console.error('[ROUTER] JSON Parse Error:', err.message, resultJsonStr);
    return {
      intent: 'ERROR',
      reply_message: 'Maaf Tuan, saya mengalami disonansi kognitif saat memproses instruksi tersebut.'
    };
  }
}

/**
 * Lightweight one-shot AI call for synthesis tasks (non-JSON).
 * Used by: cron.js (Midday Pulse, Evening Debrief, Tomorrow Prep, Weekly Review),
 * and any module that needs a plain-text AI response.
 * @param {string} prompt - The task/user prompt
 * @returns {Promise<string>} - Plain text response from AI
 */
const PLAIN_TEXT_SYSTEM_PROMPT = `Anda adalah N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh.
Jawab dengan bahasa Indonesia yang natural, cerdas, luwes, sopan, dan hangat (gaya asisten premium ala Jarvis).
Balas HANYA dengan teks biasa. JANGAN gunakan format JSON. JANGAN gunakan markdown **bold** atau *italic*.
Berikan jawaban yang informatif dan ringkas.`;

async function callAI(prompt) {
  const result = await executeWithFallback(prompt, PLAIN_TEXT_SYSTEM_PROMPT, 0.5);
  let text = String(result).trim();
  // If the model wrapped its answer in JSON anyway, extract the first string value
  try {
    const parsed = JSON.parse(text);
    const firstVal = Object.values(parsed).find(v => typeof v === 'string');
    if (firstVal) text = firstVal;
  } catch (_) { /* Not JSON, already plain text — good */ }
  return text;
}

/**
 * Lightweight AI classifier for Finance Interceptor.
 * When there's a pending transaction waiting for user confirmation,
 * this determines the user's INTENT from their reply without regex.
 *
 * Returns one of:
 *   'CONFIRM'      — user wants to save/confirm the transaction
 *   'CANCEL'       — user wants to cancel/discard the transaction
 *   'DESCRIPTION'  — user is providing a new description or category for the transaction
 *   'AMBIGUOUS'    — unclear, ask for clarification
 *
 * @param {string} userText - The raw message from the user
 * @param {object} pendingTx - The pending transaction context { nominal, destination, type }
 * @returns {Promise<'CONFIRM'|'CANCEL'|'DESCRIPTION'|'AMBIGUOUS'>}
 */
async function classifyPendingTransactionIntent(userText, pendingTx = {}) {
  const txSummary = pendingTx.nominal && pendingTx.destination
    ? `Rp${pendingTx.nominal} ke/dari ${pendingTx.destination}`
    : '(transaksi tidak diketahui)';

  const systemPrompt = `Kamu adalah classifier dan parser niat yang sangat akurat.
User baru saja menerima notifikasi transaksi keuangan senilai ${txSummary} yang MENUNGGU KONFIRMASI.
User kemudian membalas dengan pesan singkat. Tugasmu: Tentukan NIAT user dan ekstrak data yang relevan.

Aturan Niat (intent):
- CONFIRM  → user ingin MENYIMPAN / mengkonfirmasi transaksi tersebut.
  Contoh: "ya", "oke", "masukkan", "masukan", "catat", "simpan", "lanjut", "gas", "done", "save", "acc"
- CANCEL   → user ingin MEMBATALKAN / menolak transaksi tersebut.
  Contoh: "batal", "jangan", "tidak", "ga", "gak", "hapus", "cancel", "skip"
- UPDATE   → user memberikan deskripsi, keterangan transaksi, tujuan pengeluaran, metode pembayaran, akun, atau kategori BARU untuk transaksi tersebut. JIKA user hanya merespons dengan kalimat atau frasa pendek (misal: "berangkat ke takom", "beli bensin", "buat bayar utang", "makan siang"), anggap itu sebagai UPDATE untuk diisi ke field "description"!
  Contoh: "untuk beli makan siang", "pake tunai", "bayar qris", "kategori makanan", "bank bca", "berangkat ke takom"
- AMBIGUOUS → sama sekali tidak jelas / tidak relevan.

PENTING: Balas HARUS dengan format JSON valid seperti berikut:
{
  "reasoning": "Tuliskan 1 kalimat analisis mengapa memilih intent ini.",
  "intent": "CONFIRM" | "CANCEL" | "UPDATE" | "AMBIGUOUS",
  "updates": {
    "description": "isi jika user memberi deskripsi/catatan/tujuan pengeluaran (contoh: 'beli rokok dua batang', 'berangkat ke takom')",
    "category": "isi jika user menyebut kategori",
    "payment_method": "isi jika user menyebut metode pembayaran (contoh: 'tunai', 'qris', 'transfer')",
    "account": "isi jika user menyebut nama bank/dompet (contoh: 'bank livin', 'bca', 'dana')"
  }
}
Biarkan field di dalam 'updates' bernilai null jika user tidak menyebutkannya.`;

  try {
    const result = await executeWithFallback(userText, systemPrompt, 0.1, true); // jsonMode=true
    let clean = String(result).replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    
    if (!['CONFIRM', 'CANCEL', 'UPDATE', 'AMBIGUOUS'].includes(parsed.intent)) {
       parsed.intent = 'AMBIGUOUS';
    }
    return parsed;
  } catch (e) {
    console.error('[CLASSIFIER] classifyPendingTransactionIntent failed:', e.message);
    return { intent: 'AMBIGUOUS', updates: {} };
  }
}

/**
 * Lightweight AI binary classifier (YES / NO / AMBIGUOUS).
 * General-purpose: used for deletion confirmation, calendar conflict,
 * task category confirmation, and any other yes/no flow.
 *
 * @param {string} userText      - The raw reply from the user
 * @param {string} contextString - Plain-text description of what is being confirmed
 * @returns {Promise<'YES'|'NO'|'AMBIGUOUS'>}
 */
async function classifyYesNo(userText, contextString = '') {
  const systemPrompt = `Kamu adalah classifier niat biner yang sangat akurat.
Konteks: user baru saja menerima pertanyaan konfirmasi untuk: "${contextString}".
User membalas dengan teks berikut. Tugasmu: tentukan apakah user MENYETUJUI atau MENOLAK.

- YES      → user menyetujui / mengkonfirmasi / mau lanjut.
  Contoh afirmatif: "ya", "iya", "yap", "oke", "ok", "lanjut", "gas", "setuju", "hapus", "benar",
  "lakukan", "siap", "betul", "confirm", "acc", "yoi", "yes", "do it", "lanjutkan", dll.
- NO       → user menolak / membatalkan / tidak mau.
  Contoh negatif: "tidak", "jangan", "batal", "batalkan", "ga", "gak", "nggak", "cancel",
  "skip", "no", "ngga", "tolak", "stop", dll.
- AMBIGUOUS → tidak jelas, pertanyaan baru, atau tidak relevan dengan konfirmasi di atas.

BALAS HANYA dengan satu kata: YES, NO, atau AMBIGUOUS. Tanpa penjelasan apapun.`;

  try {
    const result = await executeWithFallback(userText, systemPrompt, 0.0, false); // jsonMode=false: classifiers return plain text, not JSON
    const clean = String(result).trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (['YES', 'NO', 'AMBIGUOUS'].includes(clean)) return clean;
    console.warn(`[CLASSIFIER] classifyYesNo unexpected result: "${result}". Defaulting to AMBIGUOUS.`);
    return 'AMBIGUOUS';
  } catch (e) {
    console.error('[CLASSIFIER] classifyYesNo failed:', e.message);
    return 'AMBIGUOUS';
  }
}

module.exports = { routeUserMessage, invalidatePersonalFactsCache, callAI, classifyPendingTransactionIntent, classifyYesNo };
