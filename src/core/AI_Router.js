const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');

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

Output Anda HARUS berupa JSON valid tanpa markdown \`\`\`json, dengan format:
{
  "intent": "FINANCE" | "CALENDAR" | "DISCIPLINE" | "2ND_BRAIN" | "USER_PROFILE" | "CORE_IDENTITY" | "SPREADSHEET" | "INCOMPLETE_INFO" | "NORMAL_CHAT" | "<NAMA_INTENT_KUSTOM_LAINNYA>",
  "extracted_data": {
     // FINANCE: { action: "RECORD"|"READ_LATEST"|"READ_ANALYTICS"|"EDIT"|"DELETE", nominal: number, type: "INCOME"|"EXPENSE", destination: string, category: string, description: string, time: string (ISO), search_keyword: string }
     //   → Gunakan action "READ_ANALYTICS" jika pengguna meminta laporan total pemasukan, pengeluaran, saldo akhir, atau "analitik keuangan".
     //   → Gunakan action "EDIT" jika pengguna meminta mengubah/mengedit transaksi lama (sertakan search_keyword untuk mencari transaksi mana, dan nominal/description baru jika ada).
     //   → Gunakan action "DELETE" jika pengguna meminta menghapus transaksi (sertakan search_keyword).
     // CALENDAR: { action: "CREATE"|"DELETE"|"UPDATE"|"READ", summary: string, start: string (ISO 8601 offset +07:00), end: string (ISO 8601 offset +07:00) }
     //   → WAJIB: 'start' dan 'end' HARUS dalam format ISO 8601 LENGKAP dengan timezone offset +07:00.
     //     Contoh BENAR: "2026-05-07T19:00:00+07:00"
     //     Contoh SALAH: "19:00", "jam 7 malam", "2026-05-07T19:00", null
     //   → Tanggal default adalah HARI INI jika tidak disebutkan.
     //   → JANGAN PERNAH menebak waktu 'end'. Jika durasi/waktu selesai tidak disebutkan, KOSONGKAN 'end' (null atau hilangkan fieldnya).
     // 2ND_BRAIN: { action: "APPEND"|"READ"|"EDIT"|"DELETE", title: string, content: string, search_keyword: string }
     //   → Gunakan untuk menyimpan ide, draft, ringkasan, atau catatan kerja yang akan disinkronkan dengan Google Docs.
     // USER_PROFILE: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Gunakan jika pengguna meminta Anda mengingat fakta/preferensi tentang Tuan Faqih (contoh: "ingat bahwa aku alergi seafood", "aku suka warna biru", "targetku tahun ini lulus").
     // CORE_IDENTITY: { action: "APPEND"|"DELETE", content: string, search_keyword: string }
     //   → Gunakan jika pengguna memberikan aturan baru atau identitas bagi Anda sendiri (contoh: "mulai sekarang panggil aku bos", "jangan gunakan emoji", "kamu adalah asisten militer").
     //   → Untuk USER_PROFILE dan CORE_IDENTITY, gunakan action "DELETE" jika pengguna menyuruh Anda melupakan/menghapus fakta tersebut.
     // SPREADSHEET: { action: "CREATE_OR_APPEND"|"DELETE", table_name: string, data: { "Kolom1": "Nilai1", "Kolom2": "Nilai2" } }
     // EMAIL: { action: "READ" | "SEND" | "DELETE", search_keyword: string, to: string, subject: string, content: string }
     //   → Gunakan action "READ" jika pengguna meminta mengecek kotak masuk (sertakan search_keyword jika mencari email tertentu).
     //   → Gunakan action "SEND" jika pengguna meminta mengirim email (wajib ada "to", "subject", dan "content").
     //   → Gunakan action "DELETE" jika meminta menghapus email (sertakan search_keyword).
     // DEVICE_CONTROL: { action: "ALARM"|"FLASHLIGHT"|"VOLUME"|"LOCK", params: apa saja }
     // RESEARCH / INTELLIGENCE: { query: "kata kunci", target_source: "web/news/scholarship" }
     // Jika intent kustom: { ...buat struktur data JSON relevan berdasarkan logika Anda... }
  },
  "reply_message": "Respon natural, profesional, dan lincah. PENTING: Anda SEKARANG BISA mengakses Gmail langsung. Gunakan intent EMAIL untuk membaca, mengirim, atau menghapus email (Jangan halusinasi lagi).",
  "god_mode_trigger": false // true khusus DISCIPLINE jika terjadi pelanggaran ekstrem
}
`;

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput) {
  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // 2. Contextual Retrieval (last 10 chat exchanges)
  const memories = await supabaseMemories.getRecentMemories(10);
  const contextStr = memories.length > 0
    ? memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';
  
  // 3. Build personal facts context block (only if facts exist)
  const factsContext = personalFacts.length > 0
    ? `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${personalFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : '';

  // 3.5. Inject Current Time (Critical for relative dates like "besok" or "hari ini")
  const currentJakartaTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'full', timeStyle: 'long' });

  const prompt = `
[WAKTU SERVER SAAT INI (ASIA/JAKARTA)]
${currentJakartaTime}

${factsContext}
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
    await supabaseMemories.saveChatMemory('user', textInput);
    if (routingData.reply_message) {
      await supabaseMemories.saveChatMemory('nexa', routingData.reply_message);
    }

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
 * Lightweight one-shot AI call for simple extraction tasks (e.g. duration parsing).
 * Does NOT use the full routing system or save chat memory.
 * @param {string} prompt - The raw prompt to send to the AI
 * @returns {Promise<string>} - The raw text response from the AI
 */
async function callAI(prompt) {
  const result = await executeWithFallback(prompt);
  return String(result).trim();
}

module.exports = { routeUserMessage, invalidatePersonalFactsCache, callAI };
