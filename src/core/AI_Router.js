const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');

const CONTEXT_EXCHANGES = 10;
const CONTEXT_MESSAGES_LIMIT = CONTEXT_EXCHANGES * 2; // 10 exchange = 20 messages (user+nexa)

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
  console.log(`[ROUTER] Personal facts cache refreshed. Count: ${facts.length}`);
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
Jika instruksi Tuan Faqih tidak detail atau kekurangan data esensial (contoh: "catat pengeluaran 50 ribu" tanpa menyebut tujuan/kategori, atau "geser rapat" tanpa menyebut jam), Anda WAJIB menahan eksekusi. Atur intent menjadi "INCOMPLETE_INFO" dan gunakan \`reply_message\` untuk secara spesifik menanyakan kembali detail data yang masih kurang tersebut. Eksekusi intent utama HANYA JIKA seluruh data krusial sudah jelas dari riwayat obrolan.

LOGIKA KONTEKS LANJUTAN (WAJIB):
- Jika pesan terbaru berupa follow-up singkat seperti "yang tadi", "sebelumnya", "lanjut", "yang itu", "hapus itu", "ubah itu", MAKA Anda HARUS mengikatnya ke intent aktif pada riwayat terdekat, bukan pindah ke intent lain yang tidak relevan.
- Prioritas konteks: EMAIL → DATABASE → TASK → CALENDAR jika frasa follow-up ambigu.
- Frasa "sebelum itu/sebelumnya" setelah membaca email HARUS tetap menjadi intent EMAIL (minta email yang lebih lama), bukan intent lain.
- Jika user bilang "periksa database" tanpa tabel/aksi rinci, gunakan INCOMPLETE_INFO dan tanya tabel Supabase yang dimaksud.

Output Anda HARUS berupa JSON valid tanpa markdown \`\`\`json, dengan format:
{
  "intent": "FINANCE" | "CALENDAR" | "TASK" | "WEB_SEARCH" | "DISCIPLINE" | "2ND_BRAIN" | "USER_PROFILE" | "CORE_IDENTITY" | "SPREADSHEET" | "EMAIL" | "DATABASE" | "INCOMPLETE_INFO" | "NORMAL_CHAT" | "<NAMA_INTENT_KUSTOM_LAINNYA>",
  "reply_message": "String balasan natural dan luwes untuk Tuan Faqih (wajib ada jika intent NORMAL_CHAT, INCOMPLETE_INFO, atau DISCIPLINE)",
  "learned_user_facts": ["Fakta baru tentang preferensi/kebiasaan Tuan Faqih (opsional, hanya jika ada)"],
  "learned_core_identities": ["Aturan baru tentang kepribadian N.E.X.A (opsional, hanya jika ada)"],
  "extracted_data": {
     // FINANCE: { action: "RECORD"|"READ_LATEST"|"READ_ANALYTICS"|"EDIT"|"DELETE"|"UNDO_DELETE"|"IMPORT_FROM_EMAIL"|"CONFIRM_TRANSACTION"|"UPDATE_PENDING"|"CANCEL_TRANSACTION", nominal: number, type: "INCOME"|"EXPENSE", destination: string, category: string, description: string, time: string (ISO), search_keyword: string }
     //   → Jika pengguna MENGKONFIRMASI ("masukkan", "ya", "benar", "simpan") untuk menanggapi transaksi tertunda, WAJIB gunakan "CONFIRM_TRANSACTION". Ini akan LANGSUNG menyimpan data.
     //   → Jika pengguna MENGOREKSI/MENAMBAH DETAIL/NOMINAL transaksi tertunda ("koreksi: itu buat beli sate", "kategorinya charity", "salah, harusnya 60rb"), WAJIB gunakan "UPDATE_PENDING" beserta field "description", "category", dan/atau "nominal" yang diubah. Ini akan mengupdate data tertunda.
     //   → Jika pengguna MEMBATALKAN/MENOLAK transaksi tertunda ("batalkan", "batal", "jangan"), WAJIB gunakan "CANCEL_TRANSACTION".
     //   → Jika pengguna meminta MENCATAT transaksi baru ("catat pengeluaran..."), gunakan action "RECORD".
     //     - WAKTU: Jika tidak menyebut waktu, kosongkan time (otomatis sekarang). JIKA pengguna menyebut HARI/TANGGAL ("kemarin", "lusa", "tanggal 5") TANPA menyebutkan JAM yang spesifik, Anda WAJIB mengubah root intent menjadi "INCOMPLETE_INFO" dan tanyakan jam transaksinya.
     //   → PENTING: Untuk action RECORD/EDIT/UPDATE_PENDING, pilih kategori spesifik dari opsi berikut: "Makanan dan minuman", "Bar, kafe", "Restoran, makanan cepat saji", "Bahan makanan", "Apotek, obat-obatan", "Belanja", "Waktu luang", "Alat tulis, peralatan", "Hadiah, kesenangan", "Elektronik, aksesoris", "Hewan peliharaan, hewan", "Rumah, taman", "Anak-anak", "Kesehatan dan kecantikan", "Perhiasan, aksesoris", "Pakaian dan alas kaki", "Asuransi properti", "Perumahan", "Perawatan, perbaikan", "Layanan", "Energi, utilitas", "Hipotek", "Sewa", "Transportasi", "Perjalanan dinas", "Jarak jauh", "Taksi", "Transportasi umum", "Leasing", "Asuransi kendaraan", "Kendaraan", "Sewa-menyewa", "Perawatan kendaraan", "Parkir", "Bahan bakar", "Hiburan dan kehidupan", "Lotere, judi", "Alkohol, tembakau", "Amal, hadiah", "Liburan, perjalanan, hotel", "TV, streaming", "Buku, audio, langganan", "Pendidikan, pengembangan diri", "Hobi", "Peristiwa hidup", "Budaya, acara olahraga", "Olahraga aktif, kebugaran", "Kesehatan, kecantikan", "Perawatan kesehatan, dokter", "Komunikasi, PC", "Layanan pos", "Perangkat lunak, aplikasi, permainan", "Internet", "Telepon, ponsel", "Pengeluaran keuangan", "Biaya, tarif", "Konsultasi", "Denda", "Pinjaman, bunga", "Asuransi", "Pajak", "Investasi", "Koleksi", "Tabungan", "Investasi keuangan", "Kendaraan, barang bergerak", "Properti", "Pendapatan", "Hadiah", "Tunjangan anak", "Pengembalian dana pajak, pembelian", "Cek, kupon", "Pendapatan dari meminjamkan", "Iuran & hibah", "Pendapatan sewa", "Penjualan", "Bunga, dividen", "Gaji, faktur", "Hilangan", "Lainnya".
     //     - ATURAN KATEGORI: DILARANG KERAS menggunakan kategori "Lainnya" atau "Uncategorized" kecuali benar-benar tidak ada yang mendekati. Gunakan kemampuan inferensi Anda (misal: "Spotify" -> "TV, streaming", "Gojek" -> "Transportasi", "Amira Fotocopy" -> "Layanan pos" / "Alat tulis"). Analisa tujuan/catatannya dengan cerdas!
     //   → Gunakan action "READ_ANALYTICS" jika pengguna meminta laporan total pemasukan, pengeluaran, saldo akhir, atau "analitik keuangan".
     //   → Gunakan action "EDIT" jika pengguna meminta mengubah/mengedit transaksi lama. WAJIB isi search_keyword (dengan nominal atau kata kunci unik) untuk mencari transaksi mana, dan isi nominal/description baru jika ada.
     //   → Gunakan action "DELETE" jika pengguna meminta menghapus transaksi (sertakan search_keyword).
     //   → Gunakan action "UNDO_DELETE" jika pengguna meminta membatalkan/mengembalikan transaksi yang baru dihapus ("batalkan hapus", "undo", "kembalikan yang dihapus").
     //   → Gunakan action "IMPORT_FROM_EMAIL" jika user meminta mengambil/memasukkan transaksi dari email Livin ke catatan keuangan.
     // CALENDAR: { action: "CREATE"|"DELETE"|"UPDATE"|"READ", summary: string, start: string (ISO 8601 offset +07:00), end: string (ISO 8601 offset +07:00) }
     //   → WAJIB: 'start' dan 'end' HARUS dalam format ISO 8601 LENGKAP dengan timezone offset +07:00.
     //     Contoh BENAR: "2026-05-07T19:00:00+07:00"
     //     Contoh SALAH: "19:00", "jam 7 malam", "2026-05-07T19:00", null
     //   → Tanggal default adalah HARI INI jika tidak disebutkan.
     //   → JANGAN PERNAH menebak waktu 'end'. Jika durasi/waktu selesai tidak disebutkan, KOSONGKAN 'end' (null atau hilangkan fieldnya).
     // 2ND_BRAIN: { action: "APPEND"|"READ"|"EDIT"|"DELETE", title: string, content: string, search_keyword: string }
     //   → Gunakan untuk menyimpan ide, draft, ringkasan, atau catatan kerja yang akan disinkronkan dengan Google Docs.
     // USER_PROFILE: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Gunakan INI HANYA jika pengguna SECARA EKSPLISIT menyuruh Anda ("ingat bahwa...", "lupakan bahwa...").
     //   → Untuk penemuan fakta secara OTOMATIS/PASIF dari obrolan, JANGAN gunakan intent ini. Gunakan array "learned_user_facts" di *root* JSON agar Anda tetap bisa mengeksekusi intent utama (misalnya FINANCE).
     // CORE_IDENTITY: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Sama seperti atas, gunakan HANYA jika disuruh eksplisit. Untuk pembelajaran pasif, gunakan array "learned_core_identities" di *root* JSON.
     // TASK: { action: "CREATE"|"READ"|"READ_DONE"|"COMPLETE"|"DELETE"|"EDIT"|"CLEAR_DONE", title: string, due_date: string (ISO 8601 +07:00 atau null), notes: string, search_keyword: string }
     //   → CREATE: "Catat tugas: selesaikan essay sebelum Jumat", "tambahkan ke daftar belanja: beras"
     //   → READ: "tampilkan tugasku", "apa saja task yang belum selesai?"
     //   → READ_DONE: "tugas apa yang sudah selesai?"
     //   → COMPLETE: "tandai tugas essay sebagai selesai" (gunakan search_keyword)
     //   → DELETE: "hapus tugas essay Arab" (gunakan search_keyword)
     //   → EDIT: "ubah deadline tugas essay jadi Senin" (gunakan search_keyword untuk cari, due_date untuk nilai baru)
     //   → CLEAR_DONE: "bersihkan semua tugas selesai"
     // WEB_SEARCH: { query: string, type: "search"|"news" }
     //   → Gunakan jika pengguna menanyakan fakta real-time, berita terkini, nilai tukar, cuaca, atau informasi yang butuh penelusuran internet.
     //   → type "news": jika eksplisit minta berita terbaru. type "search": untuk semua pencarian umum.
     //   → Contoh: "siapa presiden Indonesia?", "berita terbaru UGM", "kurs dolar hari ini"
     // SPREADSHEET: { action: "CREATE_OR_APPEND"|"DELETE", table_name: string, data: { "Kolom1": "Nilai1", "Kolom2": "Nilai2" } }
     // EMAIL: { action: "READ" | "SEND" | "DELETE", search_keyword: string, max_results: number, to: string, subject: string, content: string }
     //   → Gunakan action "READ" jika pengguna meminta mengecek kotak masuk (sertakan search_keyword jika mencari email tertentu).
     //   → Isi max_results sesuai jumlah yang diminta user (contoh: "satu saja" => 1, "3 email terbaru" => 3). Default 5 jika tidak disebut.
     //   → Gunakan action "SEND" jika pengguna meminta mengirim email (wajib ada "to", "subject", dan "content").
     //   → Gunakan action "DELETE" jika meminta menghapus email (sertakan search_keyword).
     // DATABASE: { action: "LIST_TABLES"|"READ_TABLE"|"INSERT_ROW"|"UPDATE_ROW"|"DELETE_ROW"|"DELETE_ALL_ROWS"|"DELETE_ALL_ROWS_CONFIRMED"|"CANCEL_ACTION", table_name: string, row_id: number, search_keyword: string, max_results: number, row_data: object, update_data: object }
     //   → Gunakan intent DATABASE untuk perintah terkait Supabase/database (cek tabel, lihat data tabel, tambah/edit/hapus baris).
     //   → Jika user secara eksplisit meminta menghapus "seluruh" atau "semua" data di sebuah tabel, gunakan action "DELETE_ALL_ROWS".
     //   → PENTING: Jika asisten sebelumnya telah meminta konfirmasi untuk menghapus seluruh tabel (PERINGATAN), dan jawaban terbaru user bermakna MENYETUJUI (misal: "ya", "gas", "lakukan", "oke", "silakan"), Anda WAJIB mempertahankan intent DATABASE dan menggunakan action "DELETE_ALL_ROWS_CONFIRMED".
     //   → Jika jawaban user bermakna MENOLAK/MEMBATALKAN (misal: "tidak", "batal", "jangan", "cancel"), gunakan action "CANCEL_ACTION".
     //   → PENTING: Jika user meminta menghapus atau mengelola "nexa vault", "folder vault", atau "metadata vault", WAJIB gunakan intent DATABASE dengan table_name "nexa_vault_items". JANGAN PERNAH mengarang intent seperti "FILE_MANAGEMENT".
     //   → Jika user berkata umum seperti "periksa database" TANPA menyebut tabel/aksi, WAJIB pakai INCOMPLETE_INFO dan tanya tabel mana: nexa_chat_memories / nexa_finance_dedup / nexa_user_profile / nexa_core_identity / nexa_2nd_brain / nexa_vault_items.
     // DEVICE_CONTROL: { action: "ALARM"|"FLASHLIGHT"|"VOLUME"|"LOCK", params: apa saja }
     // Jika intent kustom: { ...buat struktur data JSON relevan berdasarkan logika Anda... }
  },
  "reply_message": "Respon natural, profesional, dan lincah. PENTING: Anda SEKARANG BISA mengakses Gmail langsung. Gunakan intent EMAIL untuk membaca, mengirim, atau menghapus email (Jangan halusinasi lagi).",
  "god_mode_trigger": false // true khusus DISCIPLINE jika terjadi pelanggaran ekstrem
}
`;

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput, runtimeHints = {}) {
  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // 2. Contextual Retrieval (last 10 chat exchanges = 20 messages)
  const memories = await supabaseMemories.getRecentMemories(CONTEXT_MESSAGES_LIMIT);
  const contextStr = memories.length > 0
    ? memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';

  // 3. Build personal facts context block (only if facts exist)
  const factsContext = personalFacts.length > 0
    ? `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${personalFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : '';

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

  // Build next-7-days mini-calendar for reliable day→date mapping by the AI
  const _miniCal = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(_jkt.getTime() + i * 86400000);
    const ds = `${_jkt.getFullYear() === d.getFullYear() ? '' : d.getFullYear() + '-'}${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayFull = `${_DAYS[d.getDay()]}, ${d.getDate()} ${_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    _miniCal.push(`  +${i} hari: ${dayFull} (ISO: ${ds})`);
  }
  const miniCalStr = _miniCal.join('\n');
  const runtimeContextBlock = runtimeHints && Object.keys(runtimeHints).length > 0
    ? `\n[KONTEKS RUNTIME PRIORITAS]\n${JSON.stringify(runtimeHints, null, 2)}\n`
    : '';

  const prompt = `
[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}
ISO Date Hari Ini: ${currentJakartaISO}

[KALENDER REFERENSI — 7 HARI KE DEPAN]
${miniCalStr}
(Gunakan tabel di atas sebagai acuan mutlak. Jika user menyebut nama hari seperti "Jumat" atau "Senin depan", cocokkan dengan baris yang tepat.)

${factsContext}
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
  resultJsonStr = resultJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const routingData = JSON.parse(resultJsonStr);

    // 5. Save new memory ONLY after successful parse (symmetric context)
    // We only save the user's input here. The final reply (domainReply or reply_message)
    // will be saved by the caller (e.g. webhook.js) to ensure we don't save duplicate "draft" messages.
    await supabaseMemories.saveChatMemory('user', textInput);

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
 * Lightweight one-shot AI call for synthesis and extraction tasks.
 * Uses a plain-text system prompt — NOT the JSON router system prompt.
 * Safe for use in: duration parsing, web search synthesis, etc.
 * @param {string} prompt - The user/task prompt
 * @returns {Promise<string>} - Plain text response from AI
 */
const PLAIN_TEXT_SYSTEM_PROMPT = `Anda adalah N.E.X.A, asisten AI pribadi Tuan Faqih Hidayatulloh. 
Jawab dengan bahasa Indonesia yang natural, cerdas, luwes, sopan, dan hangat (gaya asisten premium ala Jarvis).
Balas HANYA dengan teks biasa. JANGAN gunakan format JSON. JANGAN gunakan markdown **bold** atau *italic*.
Berikan jawaban yang informatif dan ringkas.`;

async function callAI(prompt) {
  const result = await executeWithFallback(prompt, PLAIN_TEXT_SYSTEM_PROMPT, 0.5);
  // Strip any accidental JSON wrapping that might still appear
  let text = String(result).trim();
  // If the model wrapped its answer in JSON anyway, extract the value
  try {
    const parsed = JSON.parse(text);
    // Grab the first string value found in the object
    const firstVal = Object.values(parsed).find(v => typeof v === 'string');
    if (firstVal) text = firstVal;
  } catch (_) { /* Not JSON, already plain text — good */ }
  return text;
}

module.exports = { routeUserMessage, invalidatePersonalFactsCache, callAI };
