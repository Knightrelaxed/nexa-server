const { executeWithFallback } = require('./Fallback_Engine');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const { NEXA_PERSONALITY } = require('../config/personality');

const ROUTER_SYSTEM_PROMPT = `
${NEXA_PERSONALITY}

[TUGAS KOGNITIF & ROUTING]
Tugas Anda adalah membaca pesan, menganalisis riwayat obrolan (jika ada), dan menentukan INTENT secara absolut.
Sebagai sistem cerdas multiguna, kapabilitas Anda tidak terbatas.

LOGIKA PELENGKAPAN (SANGAT PENTING):
Jika instruksi Tuan Faqih tidak detail atau kekurangan data esensial (contoh: "catat pengeluaran 50 ribu" tanpa menyebut tujuan/kategori, atau "geser rapat" tanpa menyebut jam), Anda WAJIB menahan eksekusi. Atur intent menjadi "INCOMPLETE_INFO" dan gunakan \`reply_message\` untuk secara spesifik menanyakan kembali detail data yang masih kurang tersebut. Eksekusi intent utama HANYA JIKA seluruh data krusial sudah jelas dari riwayat obrolan.

Output Anda HARUS berupa JSON valid tanpa markdown \`\`\`json, dengan format:
{
  "intent": "FINANCE" | "CALENDAR" | "DISCIPLINE" | "2ND_BRAIN" | "INCOMPLETE_INFO" | "NORMAL_CHAT" | "<NAMA_INTENT_KUSTOM_LAINNYA>",
  "extracted_data": {
     // FINANCE: { nominal: number, type: "INCOME"|"EXPENSE", destination: string, category: string, description: string, time: string (ISO) }
     // CALENDAR: { action: "CREATE"|"DELETE"|"UPDATE"|"READ", summary: string, start: string, end: string }
     // 2ND_BRAIN: { title: string, content: string }
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
  // 1. Contextual Retrieval
  const memories = await supabaseMemories.getRecentMemories(7);
  // Show placeholder if no history yet — prevents AI from hallucinating previous context
  const contextStr = memories.length > 0
    ? memories.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join('\n')
    : '[Tidak ada riwayat obrolan sebelumnya]';
  
  const prompt = `
[RIWAYAT OBROLAN]
${contextStr}

[PESAN TERBARU TUAN FAQIH]
${textInput}

Tentukan intent dan ekstrak data!
`;

  // 2. Execute Cognitive Routing (Medium Temperature = 0.3)
  let resultJsonStr = await executeWithFallback(prompt, ROUTER_SYSTEM_PROMPT, 0.3);
  
  // Clean markdown block if GenAI decides to return it despite instructions
  resultJsonStr = resultJsonStr.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const routingData = JSON.parse(resultJsonStr);
    
    // 3. Save new memory ONLY after successful parse (symmetric context)
    await supabaseMemories.saveChatMemory('user', textInput);
    if (routingData.reply_message) {
      await supabaseMemories.saveChatMemory('nexa', routingData.reply_message);
    }

    return routingData;
  } catch (err) {
    console.error('[ROUTER] JSON Parse Error:', err.message, resultJsonStr);
    // Do NOT save memory on parse failure to keep context clean
    return {
      intent: 'ERROR',
      reply_message: 'Maaf Tuan, saya mengalami disonansi kognitif saat memproses instruksi tersebut.'
    };
  }
}

module.exports = { routeUserMessage };
