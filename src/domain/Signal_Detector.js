/**
 * ============================================================
 * [N.E.X.A v3.3] SIGNAL DETECTOR ENGINE — Signal_Detector.js
 * ============================================================
 * Zero-Token, Non-LLM Conversational Learning Signal Detector
 *
 * TUGAS UTAMA:
 *   1. Menganalisis pesan Tuan Faqih secara real-time (0 ms latency, 0 LLM token)
 *      menggunakan regex & heuristik bahasa Indonesia untuk menangkap sinyal:
 *      - CORRECTION (panjang, format, nada, salah paham)
 *      - EXPLICIT_REMEMBER ("ingat ini", "catat ya", "mulai sekarang")
 *      - ACCEPT ("mantap", "siap laksanakan", "bagus")
 *      - OVERRIDE ("batalkan", "jangan lakukan")
 *   2. Mendeteksi OVER_CITATION (Anti-Stalker Gate):
 *      Mendeteksi apakah respons N.E.X.A mengutip sifat privat / kelemahan
 *      Tuan Faqih secara verbal tanpa ditanya.
 *   3. Menulis sinyal ke tabel `nexa_learning_events` secara asinkron.
 * ============================================================
 */

'use strict';

const supabaseMemories = require('../infrastructure/Supabase_Memories');

// ── REGEX PATTERNS UNTUK SINYAL KOREKSI (Bahasa Indonesia & Slang) ─────────

const PATTERNS = {
  // 1. KOREKSI PANJANG & KEPADATAN
  LENGTH_SHORTER: /\b(terlalu\s+(panjang|lebar|detail|banyak\s+(omong|kata|teks|penjelasan|kalimat))|kepanjangan|singkat\s+(aja|saja|dong)|ringkas\s+(aja|saja|dong)|pendek\s+(aja|saja)|to\s+the\s+point|langsung\s+(ke\s+inti|poin|jawab)|jangan\s+(bertele[- ]?tele|muter[- ]?muter|panjang[- ]?panjang))\b/i,
  LENGTH_LONGER: /\b(terlalu\s+(singkat|pendek)|kependekan|kurang\s+(jelas|lengkap|detail)|jelaskan\s+(lebih\s+detail|panjang)|tambah\s+penjelasan)\b/i,

  // 2. KOREKSI FORMAT
  FORMAT_NO_BULLETS: /\b(jangan\s+pakai\s+(bullet|poin|list|angka|nomor|daftar)|tanpa\s+(bullet|poin|list)|prosa\s+(aja|saja)|paragraf\s+(aja|saja)|nggak\s+usah\s+di[- ]?list)\b/i,
  FORMAT_BULLETS: /\b(pakai\s+(bullet|poin|list|angka|nomor|daftar)|bikin\s+(list|daftar|poin)|buatkan\s+(list|daftar)|poin[- ]?poin\s+(aja|saja))\b/i,

  // 3. KOREKSI NADA & GAYA BICARA
  TONE_CASUAL: /\b(terlalu\s+(formal|kaku)|jangan\s+(kaku|formal|serius)|santai\s+(aja|saja)|bahasa\s+santai|biasa\s+aja\s+ngomongnya)\b/i,
  TONE_FORMAL: /\b(lebih\s+(formal|sopan|profesional)|kurang\s+(sopan|formal)|bahasa\s+formal)\b/i,

  // 4. WORKFLOW / MISUNDERSTANDING REJECTION
  MISUNDERSTANDING: /\b(bukan\s+(gitu|begitu|itu\s+maksudku|maksud saya)|salah\s+paham|maksudku\s+bukan|kamu\s+salah\s+tangkap|bukan\s+itu\s+yang\s+kutanya)\b/i,

  // 5. INSTRUKSI EKSPLISIT MENYIMPAN / PERATURAN OPERASIONAL
  EXPLICIT_REMEMBER: /\b(ingat\s+(ini\s+ya|aturan\s+ini|bahwa\s+aku|preferensiku|selalu|kebiasaanku)|catat\s+(aturan\s+ini|bahwa\s+aku|preferensiku|gaya\s+ini)|mulai\s+sekarang\s+(kamu\s+harus|jangan\s+pernah|jawab|format|bicara|pakai|selalu|panggil|atur)|patenkan\s+(ini|aturan\s+ini)|simpan\s+aturan\s+ini|jangan\s+lupa\s+kalau\s+aku\s+(suka|tidak\s+suka|alergi|lebih\s+suka|prefer))\b/i,

  // 6. ACCEPT / KEPUASAN (Positive Feedback)
  ACCEPT: /\b(oke\s+mantap|mantap\s+(bro|nexa|betul)?|siap\s+laksanakan|sudah\s+pas|bagus\s+(banget|ini)?|keren|pas\s+banget|nah\s+gitu\s+dong|makasih\s+(banyak|ya|nexa)?|terima\s+kasih)\b/i,

  // 7. OVERRIDE / BATALKAN AKSI
  OVERRIDE: /\b(batalkan\s+(rencana\s+tadi|yang\s+tadi|perintah\s+tadi|eksekusi|aksi\s+tadi)|batal\s+(aja\s+yang\s+tadi|deh\s+yang\s+tadi)|jangan\s+jadi\s+(yang\s+tadi|dieksekusi)|cancel\s+(yang\s+tadi|eksekusi)|jangan\s+dieksekusi|urungkan\s+(aksi|perintah|eksekusi))\b/i
};

/**
 * Tokenize string ke set kata unik (lowercase, alphanumeric saja)
 */
function tokenize(text) {
  if (!text) return new Set();
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
  );
}

/**
 * Analisis pesan teks pengguna untuk menemukan sinyal koreksi / preferensi
 * @param {string} userText - Teks pesan user saat ini
 * @param {string} lastAssistantReply - Balasan asisten sebelumnya (opsional)
 * @returns {Array<object>} Daftar sinyal terdeteksi
 */
function detectUserSignals(userText, lastAssistantReply = '') {
  if (!userText || typeof userText !== 'string') return [];
  const text = userText.trim();
  const signals = [];

  // 1. Cek Koreksi Panjang
  if (PATTERNS.LENGTH_SHORTER.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'length', direction: 'shorter' }
    });
  } else if (PATTERNS.LENGTH_LONGER.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'length', direction: 'longer' }
    });
  }

  // 2. Cek Koreksi Format
  if (PATTERNS.FORMAT_NO_BULLETS.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'format', rule: 'no_bullets' }
    });
  } else if (PATTERNS.FORMAT_BULLETS.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'format', rule: 'bullets' }
    });
  }

  // 3. Cek Koreksi Nada
  if (PATTERNS.TONE_CASUAL.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'tone', preference: 'casual' }
    });
  } else if (PATTERNS.TONE_FORMAL.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'tone', preference: 'formal' }
    });
  }

  // 4. Cek Kesalahpahaman / Workflow
  if (PATTERNS.MISUNDERSTANDING.test(text)) {
    signals.push({
      event_type: 'CORRECTION',
      signal: { dimension: 'workflow', issue: 'misunderstanding' }
    });
  }

  // 5. Cek Explicit Remember
  if (PATTERNS.EXPLICIT_REMEMBER.test(text)) {
    // Abaikan jika ini sebenarnya perintah pengingat agenda harian
    const isDailyReminder = /\b(ingatkan\s+aku|set\s+alarm|besok\s+ada|hari\s+ini\s+ada|lusa\s+ada|jam\s+\d+|kuis|tugas|rapat|meeting|minum\s+obat)\b/i.test(text);
    if (!isDailyReminder) {
      signals.push({
        event_type: 'EXPLICIT_REMEMBER',
        signal: { trigger: 'explicit_command' }
      });
    }
  }

  // 6. Cek Override
  if (PATTERNS.OVERRIDE.test(text)) {
    signals.push({
      event_type: 'OVERRIDE',
      signal: { action: 'cancel_proposed' }
    });
  }

  // 7. Cek Accept (hanya jika bukan koreksi)
  if (signals.length === 0 && PATTERNS.ACCEPT.test(text)) {
    signals.push({
      event_type: 'ACCEPT',
      signal: { feedback: 'positive' }
    });
  }

  return signals;
}

/**
 * Deteksi Over-Citation (Anti-Stalker Gate)
 * Memeriksa apakah balasan N.E.X.A mengutip sifat privat / kelemahan Tuan Faqih
 * secara verbal padahal Tuan Faqih tidak sedang bertanya tentang data tersebut.
 *
 * @param {string} assistantReply - Jawaban N.E.X.A yang dikirim ke user
 * @param {Array<object>} injectedTraits - Daftar trait identitas yang disuntikkan ke prompt
 * @param {string} userText - Pertanyaan user
 * @returns {Array<object>} Sinyal over-citation jika ada pelanggaran
 */
function detectOverCitation(assistantReply, injectedTraits = [], userText = '') {
  if (!assistantReply || !Array.isArray(injectedTraits) || injectedTraits.length === 0) {
    return [];
  }

  const replyLower = assistantReply.toLowerCase();
  const userLower = (userText || '').toLowerCase();

  // Jika user secara eksplisit menanyakan kelemahannya sendiri, over-citation tidak dihitung
  const userAskedAboutSelf = /\b(kelemahan|kekurangan|kebiasaan\s+buruk|sifatku|profilku|data\s+pribadi)\b/i.test(userLower);
  if (userAskedAboutSelf) return [];

  const userWords = tokenize(userText);
  const violations = [];

  for (const trait of injectedTraits) {
    // Sifat yang diawasi: layer WEAKNESSES atau yang bertanda sensitivity === 'private'
    const isSensitive = (trait.layer === 'WEAKNESSES') || (trait.sensitivity === 'private');
    if (!isSensitive) continue;

    // Ambil kata kunci dari trait_value atau directive
    const combinedText = `${trait.trait_value || ''} ${trait.directive || ''}`;
    const valueWords = combinedText
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !['sering', 'selalu', 'tuan', 'faqih', 'suka', 'dalam', 'tanpa', 'harus', 'bukan'].includes(w));

    if (valueWords.length === 0) continue;

    // Cek jika balasan mengandung 2 atau lebih kata kunci sensitif dari trait ini secara berdekatan,
    // KECUALI jika kata tersebut sudah disebutkan oleh Tuan Faqih sendiri dalam pesannya.
    const matchedWords = valueWords.filter(word => replyLower.includes(word) && !userWords.has(word));
    if (matchedWords.length >= 2 || (valueWords.length === 1 && matchedWords.length === 1 && valueWords[0].length >= 7 && !userWords.has(valueWords[0]))) {
      violations.push({
        event_type: 'OVER_CITATION',
        signal: {
          violation: 'verbalized_private_trait',
          layer: trait.layer,
          trait_key: trait.trait_key,
          matched_words: matchedWords
        }
      });
    }
  }

  return violations;
}

/**
 * Evaluasi satu giliran percakapan secara menyeluruh (Post-Turn Hook)
 * Dipanggil via setImmediate() setelah respons dikirim ke user (0 ms overhead).
 *
 * @param {object} params
 * @param {string} params.userText - Pesan user
 * @param {string} params.assistantReply - Jawaban asisten
 * @param {string} params.intent - Intent yang terdeteksi
 * @param {string} params.topic - Topik pesan
 * @param {Array<object>} params.injectedTraits - Trait yang diinjeksi ke prompt
 * @param {object} params.injectedPlaybook - Playbook yang diinjeksi
 * @param {object} [params.previousContext] - Konteks giliran sebelumnya (lastAssistantReply, intent, topic, injectedPlaybook, injectedTraits)
 * @param {string} params.sessionKey - Kunci sesi (e.g. '2026-10-11:tg:1')
 * @returns {Promise<Array<object>>} Daftar event yang disimpan
 */
async function evaluateTurn(params = {}) {
  const {
    userText = '',
    assistantReply = '',
    intent = 'NORMAL_CHAT',
    topic = 'DEFAULT',
    injectedTraits = [],
    injectedPlaybook = null,
    previousContext = null,
    sessionKey = `session:${new Date().toISOString().slice(0, 10)}`
  } = params;

  if (!userText && !assistantReply) return [];

  // 1. Deteksi sinyal user (evaluasi terhadap balasan turn sebelumnya jika ada)
  const previousAssistantReply = previousContext?.lastAssistantReply || assistantReply;
  const userSignals = detectUserSignals(userText, previousAssistantReply);

  // 2. Deteksi over-citation pada balasan saat ini
  const citationViolations = detectOverCitation(assistantReply, injectedTraits, userText);

  const allEvents = [...userSignals, ...citationViolations];
  if (allEvents.length === 0) return [];

  const excerpt = String(userText || '').slice(0, 300);

  // 3. Simpan ke database via Supabase_Memories dengan Turn Attribution
  const recorded = [];
  for (const ev of allEvents) {
    // [TURN ATTRIBUTION] Koreksi pengguna selalu merujuk pada respons turn sebelumnya (N-1)!
    const isCorrection = ev.event_type === 'CORRECTION';
    const targetIntent = (isCorrection && previousContext?.intent) ? previousContext.intent : (intent || 'NORMAL_CHAT');
    const targetTopic = (isCorrection && previousContext?.topic) ? previousContext.topic : (topic || 'DEFAULT');
    const targetPlaybook = (isCorrection && previousContext?.injectedPlaybook) ? previousContext.injectedPlaybook : injectedPlaybook;
    const targetTraits = (isCorrection && previousContext?.injectedTraits) ? previousContext.injectedTraits : injectedTraits;

    // Susun referensi injeksi yang diatribusikan
    const injectedRefs = {};
    if (targetPlaybook) {
      injectedRefs.playbook = `${targetPlaybook.intent}@${targetPlaybook.version || 1}`;
    }
    if (targetTraits && targetTraits.length > 0) {
      injectedRefs.traits = targetTraits.map(t => `${t.layer}/${t.trait_key}`);
    }

    const eventPayload = {
      session_key: sessionKey,
      event_type: ev.event_type,
      intent: targetIntent,
      topic: targetTopic,
      signal: ev.signal || {},
      injected_refs: injectedRefs,
      user_turn_excerpt: excerpt
    };

    try {
      const res = await supabaseMemories.recordLearningEvent(eventPayload);
      if (res && res.success) recorded.push(res.data);
    } catch (err) {
      console.warn('[SIGNAL_DETECTOR] Failed to write event:', err.message);
    }
  }

  if (recorded.length > 0) {
    console.log(`[SIGNAL_DETECTOR] 🎯 Recorded ${recorded.length} learning event(s): ${recorded.map(r => `${r.event_type}->${r.intent}`).join(', ')}`);
  }

  return recorded;
}

module.exports = {
  detectUserSignals,
  detectOverCitation,
  evaluateTurn,
  PATTERNS
};
