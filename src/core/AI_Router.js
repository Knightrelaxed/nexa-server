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
  "intent": "FINANCE" | "CALENDAR" | "DISCIPLINE" | "2ND_BRAIN" | "SPREADSHEET" | "INCOMPLETE_INFO" | "NORMAL_CHAT" | "<NAMA_INTENT_KUSTOM_LAINNYA>",
  "extracted_data": {
     // FINANCE: { nominal: number, type: "INCOME"|"EXPENSE", destination: string, category: string, description: string, time: string (ISO) }
     // CALENDAR: { action: "CREATE"|"DELETE"|"UPDATE"|"READ", summary: string, start: string, end: string }
     // 2ND_BRAIN: { title: string, content: string, type: "PERSONAL_FACT" | "IDEA" }
     //   → PERSONAL_FACT: fakta permanen tentang Tuan Faqih (kesehatan, preferensi, jadwal, target, relasi, kebiasaan)
     //     Kata kunci pemicu: "simpan ini", "ingat bahwa", "catat bahwa", "perlu kamu tahu", "fakta tentang saya", "aku suka/tidak suka", "aku alergi", "kebiasaanku", dll.
     //   → IDEA: gagasan kreatif, catatan riset, rencana proyek, apapun yang bukan fakta personal
     // SPREADSHEET: { action: "CREATE_OR_APPEND"|"DELETE", table_name: string, data: { "Kolom1": "Nilai1", "Kolom2": "Nilai2" } }
     // DEVICE_CONTROL: { action: "ALARM"|"FLASHLIGHT"|"VOLUME"|"LOCK", params: apa saja }
     // RESEARCH / INTELLIGENCE: { query: "kata kunci", target_source: "web/news/scholarship" }
     // Jika intent kustom: { ...buat struktur data JSON relevan berdasarkan logika Anda... }
  },
  "reply_message": "Respon natural, profesional, dan loyal sebagai asisten cerdas untuk membalas pengguna",
  "god_mode_trigger": false // true khusus DISCIPLINE jika terjadi pelanggaran ekstrem
}
`;

/**
 * Route incoming natural language (text) from user
 */
async function routeUserMessage(textInput) {
  // 1. Load personal facts (from cache — zero overhead after first call)
  const personalFacts = await loadPersonalFactsWithCache();

  // 2. Contextual Retrieval (last 7 chat exchanges)
  const memories = await supabaseMemories.getRecentMemories(7);
  const contextStr = memories.length > 0
    ? memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';
  
  // 3. Build personal facts context block (only if facts exist)
  const factsContext = personalFacts.length > 0
    ? `\n[FAKTA PERMANEN TENTANG TUAN FAQIH — SELALU INGAT INI]\n${personalFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n`
    : '';

  const prompt = `
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

module.exports = { routeUserMessage, invalidatePersonalFactsCache };
