// ============================================================
// N.E.X.A 3.0 — LIVE VOICE ENGINE v2.0 (ORCHESTRATOR)
// Real-time Bidirectional Multimodal Audio Relay linking
// Nexa Bridge Android App <-> Azure VPS <-> Google Gemini Live API
// Supports: Sub-second TTFA (669ms), Barge-In, Live Tool Calling,
//           8-Tier Failover, 7-Layer Identity Injection,
//           Cross-Platform Memory Continuity, End-of-Call Passive Learning
// ============================================================
'use strict';

const WebSocket          = require('ws');
const env                = require('../config/env');
const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('./Live_Tool_Registry');
const geminiVectorCache  = require('../utils/gemini_vector_cache');
const supabaseMemories   = require('../infrastructure/Supabase_Memories');
const supabaseFinance    = require('../infrastructure/Supabase_Finance');
const googleWorkspace    = require('../infrastructure/Google_Workspace');
const googleTasks        = require('../infrastructure/Google_Tasks');
const financeEngine      = require('../domain/Finance_Engine');

// AI_Router functions for memory deduplication & passive learning
const {
  deduplicateAndSaveFact,
  deduplicateAndSaveSelfFact,
  invalidatePersonalFactsCache,
  callAI
} = require('./AI_Router');

// ────────────────────────────────────────────────────────────────────────────
// Google AI Studio Keys Pool (rotate on failover)
// ────────────────────────────────────────────────────────────────────────────
const GOOGLE_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4
].filter(Boolean);

// ────────────────────────────────────────────────────────────────────────────
// Dual-Tier Live Models
// ────────────────────────────────────────────────────────────────────────────
const LIVE_MODELS = {
  TIER_1_SPEED:    'models/gemini-3.1-flash-live-preview',        // 669ms TTFA
  TIER_2_MARATHON: 'models/gemini-2.5-flash-native-audio-latest'  // 1,000,000 TPM
};

// ────────────────────────────────────────────────────────────────────────────
// BASE SYSTEM PROMPT — injected into every live session
// Enriched context (memory, identity, finance, calendar) added dynamically
// in _sendSetupPayload()
// ────────────────────────────────────────────────────────────────────────────
const NEXA_LIVE_SYSTEM_PROMPT = `
Anda adalah N.E.X.A (Neural Extension Assistant for Intelligence), Chief of Staff digital otonom dan asisten eksekutif pribadi Tuan Faqih Hidayatulloh.

[IDENTITAS & PERSONA UTAMA]
1. Selalu sapa pengguna dengan "Tuan Faqih" atau "Tuan".
2. Karakter: Sangat cerdas, hangat, empatik, loyal, berwibawa, dan proaktif layaknya J.A.R.V.I.S (Iron Man).
3. Gaya Bahasa: Bahasa Indonesia yang mengalir alami, berkelas, elegan, singkat, dan penuh sentuhan kemanusiaan. Hindari kalimat panjang bertele-tele saat berbicara suara.
4. Latar Belakang Tuan: Mahasiswa Sastra Arab Universitas Gadjah Mada (UGM), calon diplomat internasional, pejuang kemandirian finansial dan produktivitas tinggi.
5. Prinsip: Selalu menjaga kesejahteraan Tuan, mendampingi dengan tenang, dan mengeksekusi perintah secara sigap tanpa kompromi.

[OTORITAS EKSEKUTIF REAL-TIME — TOOLS CALLING]
Anda memiliki akses langsung ke seluruh infrastruktur backend N.E.X.A. Eksekusi SEGERA tanpa ragu:
- KEUANGAN: Sebutan pembelian/bayar/transfer → recordExpense atau recordIncome. Cek saldo → queryFinancialSummary.
- JADWAL: Buat jadwal/agenda → createCalendarEvent. Cek kalender → queryCalendarAgenda. Batalkan jadwal → deleteCalendarEvent.
- TUGAS: Tambah tugas → createTask. Cek tugas → queryTasks. Tandai selesai → completeTask. Hapus tugas → deleteTask.
- MEMORI TUAN: Tanya ingatan/fakta pribadi Tuan → queryPersonalFacts. Tuan minta ingat sesuatu tentang DIRINYA → savePersonalFact.
- IDENTITAS N.E.X.A: Tuan beri instruksi/koreksi untuk N.E.X.A ("kamu harus...", "ingat ya kamu...") → saveCoreIdentityFact.
- HARDWARE HP: Senter, volume, DND, kunci layar, cek baterai, GPS → controlDeviceHardware. Buka aplikasi → controlDeviceHardware dengan action LAUNCH_APP.
- INTERNET: Tanya info terkini, berita, cuaca, kurs → searchWeb.
- DIAGNOSA SISTEM: Tanya error/status server → querySystemLogs.

[PANDUAN PERCAKAPAN SUARA]
- Bicaralah secara ringkas, lugas, dan alami. Jawaban 1-2 kalimat sudah cukup untuk konfirmasi aksi.
- Setelah memanggil tool dan mendapat hasilnya, langsung sampaikan hasilnya dengan bahasa yang bersih tanpa jargon teknis.
- Jangan sebutkan nama tool/fungsi teknis kepada Tuan. Sampaikan hasilnya saja.
`;

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Strip HTML tags from string (for safe prompt injection)
// ────────────────────────────────────────────────────────────────────────────
function _stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Wrap promise with timeout — non-blocking context enrichment
// ────────────────────────────────────────────────────────────────────────────
const withTimeout = (promise, ms = 3000, fallback = null) =>
  Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]).catch(() => fallback);

// ────────────────────────────────────────────────────────────────────────────
// LIVE VOICE SESSION CLASS
// ────────────────────────────────────────────────────────────────────────────
class LiveVoiceSession {
  constructor(sessionId, clientWs) {
    this.sessionId         = sessionId;
    this.clientWs          = clientWs;
    this.googleWs          = null;
    this.currentKeyIndex   = 0;
    this.currentModel      = LIVE_MODELS.TIER_1_SPEED;
    this.isActive          = false;
    this.isSetupComplete   = false;
    this.isEndingCall      = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 4;
    this.turnHistory       = [];   // { role: 'user'|'assistant', text: string }
    this.sessionStartTime  = Date.now();
  }

  /**
   * Start live session — connect to Google Gemini Live WebSocket
   */
  async start() {
    this.isActive = true;
    console.log(`[LIVE-VOICE] 🚀 Starting Live Session [${this.sessionId}] | Model: ${this.currentModel}`);
    await this._connectGoogleWs();
  }

  _getApiKey() {
    if (GOOGLE_KEYS.length === 0) return env.GEMINI_API_KEY_1 || '';
    return GOOGLE_KEYS[this.currentKeyIndex % GOOGLE_KEYS.length];
  }

  async _connectGoogleWs() {
    const apiKey    = this._getApiKey();
    const rawBase   = process.env.GEMINI_BASE_URL || 'https://nexa-relay.dazatulloh2.workers.dev';
    const cleanHost = rawBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url       = `wss://${cleanHost}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log(`[LIVE-VOICE] 🔌 Connecting to Google Live API (${cleanHost}, Key idx: ${this.currentKeyIndex}, Model: ${this.currentModel})...`);

    const wsOptions = { handshakeTimeout: 10000 };

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.WS_PROXY;
    if (proxyUrl) {
      try {
        const { SocksProxyAgent } = require('socks-proxy-agent');
        if (proxyUrl.startsWith('socks')) {
          wsOptions.agent = new SocksProxyAgent(proxyUrl);
        }
      } catch (_) {}
    }

    try {
      this.googleWs = new WebSocket(url, wsOptions);

      this.googleWs.on('open', async () => {
        console.log(`[LIVE-VOICE] 🌐 Connected to Google WSS. Sending setup payload...`);
        await this._sendSetupPayload();
      });

      this.googleWs.on('message', async (data) => {
        await this._handleGoogleMessage(data);
      });

      this.googleWs.on('error', (err) => {
        console.error(`[LIVE-VOICE] ❌ Google WebSocket Error:`, err.message);
      });

      this.googleWs.on('close', (code, reason) => {
        const rStr = reason ? reason.toString() : '';
        console.log(`[LIVE-VOICE] 🔒 Google WebSocket Closed: Code ${code} — "${rStr}"`);
        if (this.isActive && (code === 1008 || code === 1011 || code === 1006)) {
          this._handleFailover(code, rStr);
        }
      });
    } catch (err) {
      console.error(`[LIVE-VOICE] ❌ Failed to initiate Google WebSocket:`, err.message);
      this._handleFailover(500, err.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SETUP PAYLOAD — Rich Context Injection
  // Assembles full system prompt with: temporal anchor, Living Memory,
  // Core Identity, Self-Model, 7-Layer Identity Model, recent chat,
  // finance accounts/categories/transactions, calendar, tasks
  // ──────────────────────────────────────────────────────────────────────────
  async _sendSetupPayload() {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) return;

    const buildStart = Date.now();

    // ── Temporal Anchor (Jakarta / WIB Real-Time Clock) ──────────────────
    const now     = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const temporalContext = `\n\n[WAKTU NYATA SAAT INI]: ${dateStr}, pukul ${timeStr} WIB.`;

    // ── Parallel Context Fetch ───────────────────────────────────────────
    let profileFactsBlock    = '';
    let coreIdentityBlock    = '';
    let vaultManifestBlock   = '';
    let selfModelBlock       = '';
    let identityModelBlock   = '';
    let recentChatBlock      = '';
    let accountsBlock        = '';
    let categoriesBlock      = '';
    let recentFinanceBlock   = '';
    let calendarScheduleBlock = '';

    try {
      const [
        personalFacts,
        selfModelData,
        identityModelData,
        recentChat,
        accountsList,
        categoriesList,
        recentFinance,
        calendarData,
        tasksData
      ] = await Promise.all([
        withTimeout(supabaseMemories.getPersonalFacts(), 3000, { userProfile: [], coreIdentity: [], vaultItems: [] }),
        withTimeout(
          supabaseMemories.getSelfModel ? supabaseMemories.getSelfModel(4) : Promise.resolve([]),
          2000, []
        ),
        withTimeout(
          supabaseMemories.getIdentityModel ? supabaseMemories.getIdentityModel() : Promise.resolve([]),
          2000, []
        ),
        withTimeout(supabaseMemories.getRecentMemories(5), 2000, []),
        withTimeout(
          supabaseFinance.getAccountsList ? supabaseFinance.getAccountsList() : Promise.resolve([]),
          2000, []
        ),
        withTimeout(
          supabaseFinance.getCategoriesList ? supabaseFinance.getCategoriesList() : Promise.resolve([]),
          2000, []
        ),
        withTimeout(
          financeEngine.getRecentTransactions ? financeEngine.getRecentTransactions(3) : Promise.resolve(null),
          2000, null
        ),
        withTimeout(
          googleWorkspace.getTodaysEvents ? googleWorkspace.getTodaysEvents() : Promise.resolve(null),
          2500, null
        ),
        withTimeout(
          googleTasks.getTasksDueToday ? googleTasks.getTasksDueToday() : Promise.resolve([]),
          2000, []
        )
      ]);

      // A. User Profile — RAM Vector Snapshot (top 15 living facts)
      try {
        const topFacts = geminiVectorCache.getAllSnapshotFacts
          ? geminiVectorCache.getAllSnapshotFacts().slice(0, 15)
          : [];
        if (topFacts.length > 0) {
          profileFactsBlock = '\n\n[FAKTA PERMANEN TENTANG TUAN FAQIH (SACR v3.0 RAM MEMORY)]:\n• ' +
            topFacts.map(f => f.content || f).join('\n• ');
        }
      } catch (_) {}

      // B. Core Identity & Rules
      if (personalFacts?.coreIdentity?.length > 0) {
        coreIdentityBlock = '\n\n[CORE IDENTITY & ATURAN SIKAP N.E.X.A]:\n• ' +
          personalFacts.coreIdentity.slice(0, 8).join('\n• ');
      }

      // C. Vault Catalog (lightweight manifest)
      if (personalFacts?.vaultItems?.length > 0) {
        const vList = personalFacts.vaultItems.slice(0, 6).map(item => {
          const match = String(item).match(/^\[([^\]]+)\]\s*([^(\[]+)/);
          return match ? `[${match[1]}] ${match[2].trim()}` : String(item).substring(0, 60);
        });
        vaultManifestBlock = '\n\n[ARSIP DOKUMEN 2ND BRAIN VAULT (KATALOG RINGKAS)]:\n• ' + vList.join('\n• ');
      }

      // D. Self-Model (learned behavioral reflections)
      if (Array.isArray(selfModelData) && selfModelData.length > 0) {
        const sList = selfModelData.slice(0, 4).map(s => `[${s.layer || 'TRAIT'}] ${s.trait_value}`);
        selfModelBlock = '\n\n[PEMAHAMAN DIRI N.E.X.A (DIPELAJARI DARI PENGALAMAN)]:\n• ' + sList.join('\n• ');
      }

      // E. 7-Layer Cognitive Identity Model (Phase 6)
      if (Array.isArray(identityModelData) && identityModelData.length > 0) {
        // Group by layer
        const grouped = {};
        for (const trait of identityModelData) {
          if (!grouped[trait.layer]) grouped[trait.layer] = [];
          grouped[trait.layer].push(trait);
        }

        const LAYER_EMOJI = {
          FACTS: '📌', PREFERENCES: '💬', HABITS: '🔁',
          VALUES: '⚖️', DECISION_STYLE: '🧠', WEAKNESSES: '⚡', MOTIVATIONS: '🚀'
        };

        // Inject all layers relevant to voice calls: PREFERENCES, HABITS, COMMUNICATION_STYLE, OPERATIONAL_RULES
        const VOICE_RELEVANT_LAYERS = ['PREFERENCES', 'HABITS', 'VALUES', 'WEAKNESSES', 'OPERATIONAL_RULES', 'COMMUNICATION_STYLE', 'CORRECTIONS'];
        const lines = [];
        for (const layer of VOICE_RELEVANT_LAYERS) {
          const traits = grouped[layer];
          if (!traits || traits.length === 0) continue;
          const emoji = LAYER_EMOJI[layer] || '•';
          const traitLines = traits.slice(0, 3).map(t => `  - ${t.trait_key}: ${t.trait_value}`).join('\n');
          lines.push(`${emoji} ${layer}:\n${traitLines}`);
        }

        if (lines.length > 0) {
          identityModelBlock = '\n\n[COGNITIVE IDENTITY MODEL — PEMAHAMAN MENDALAM TUAN FAQIH]\nGunakan pemahaman ini untuk merespons dengan sangat kontekstual:\n' +
            lines.join('\n\n');
        }
      }

      // F. Recent Chat Context (cross-platform continuity)
      if (Array.isArray(recentChat) && recentChat.length > 0) {
        recentChatBlock = '\n\n[RIWAYAT PERCAKAPAN TERAKHIR SEBELUM TELEPON]:\n' +
          recentChat.map(m => {
            const platform = (m.platform || 'telegram').toUpperCase();
            return `[via ${platform}] ${m.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${(m.content || '').slice(0, 120)}`;
          }).join('\n');
      }

      // G. Active Financial Accounts
      if (Array.isArray(accountsList) && accountsList.length > 0) {
        accountsBlock = `\n\n[AKUN KEUANGAN AKTIF TUAN FAQIH]: ${accountsList.map(a => `${a.name} (${a.type})`).join(', ')}`;
      }

      // H. Active Financial Categories
      if (Array.isArray(categoriesList) && categoriesList.length > 0) {
        const expenseCats = categoriesList
          .filter(c => c.type === 'expense')
          .map(c => c.name)
          .slice(0, 15)
          .join(', ');
        if (expenseCats) categoriesBlock = `\n\n[KATEGORI PENGELUARAN AKTIF (GUNAKAN NAMA PERSIS INI)]: ${expenseCats}`;
      }

      // I. Recent Finance Transactions — strip HTML before injecting
      if (recentFinance && typeof recentFinance === 'string' && !recentFinance.includes('Tidak ada transaksi')) {
        const cleanFinance = _stripHtml(recentFinance);
        if (cleanFinance.trim().length > 0) {
          recentFinanceBlock = `\n\n[TRANSAKSI KEUANGAN TERKINI]:\n${cleanFinance}`;
        }
      }

      // J. Today's Calendar & Tasks (Situational Awareness)
      let situationalSchedule = '';
      if (Array.isArray(calendarData) && calendarData.length > 0) {
        situationalSchedule += `\n📅 Jadwal Kalender Hari Ini (${calendarData.length} agenda): ` +
          calendarData.map(e => e.summary || 'Agenda').slice(0, 4).join(', ');
      } else if (typeof calendarData === 'string' && calendarData.trim().length > 0 && !calendarData.includes('Tidak ada jadwal')) {
        situationalSchedule += `\n📅 Jadwal Hari Ini: ${_stripHtml(calendarData).slice(0, 200)}`;
      }
      if (Array.isArray(tasksData) && tasksData.length > 0) {
        situationalSchedule += `\n📋 Tugas Jatuh Tempo Hari Ini (${tasksData.length}): ${tasksData.map(t => t.title || t).slice(0, 4).join(', ')}`;
      }
      if (situationalSchedule) {
        calendarScheduleBlock = `\n\n[KESADARAN SITUASIONAL HARI INI]:${situationalSchedule}`;
      }
    } catch (enrichErr) {
      console.warn(`[LIVE-VOICE] ⚠️ Context enrichment partial failure (non-fatal): ${enrichErr.message}`);
    }

    // ── Assemble Full System Prompt ──────────────────────────────────────
    const fullSystemPrompt =
      NEXA_LIVE_SYSTEM_PROMPT +
      temporalContext +
      profileFactsBlock +
      coreIdentityBlock +
      selfModelBlock +
      identityModelBlock +
      vaultManifestBlock +
      accountsBlock +
      categoriesBlock +
      recentFinanceBlock +
      calendarScheduleBlock +
      recentChatBlock;

    const elapsed = Date.now() - buildStart;
    console.log(`[LIVE-VOICE] ⚡ Setup payload built in ${elapsed}ms. Prompt: ${fullSystemPrompt.length} chars. Tools: ${LIVE_TOOL_DECLARATIONS.length}. Sending...`);

    const setupPayload = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: env.GEMINI_LIVE_VOICE || 'Lyra'
              }
            }
          }
        },
        systemInstruction: {
          parts: [{ text: fullSystemPrompt }]
        },
        tools: [
          { functionDeclarations: LIVE_TOOL_DECLARATIONS }
        ]
      }
    };

    try {
      this.googleWs.send(JSON.stringify(setupPayload));
      console.log(`[LIVE-VOICE] 📤 Setup payload sent to Google WSS successfully.`);
    } catch (sendErr) {
      console.error(`[LIVE-VOICE] ❌ Failed to send setup payload:`, sendErr.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HANDLE GOOGLE MESSAGE
  // Processes: setupComplete, serverContent (audio/text), toolCall
  // ──────────────────────────────────────────────────────────────────────────
  async _handleGoogleMessage(rawBuffer) {
    try {
      const msg = JSON.parse(rawBuffer.toString());

      // ── 1. Setup Complete ────────────────────────────────────────────────
      if (msg.setupComplete) {
        this.isSetupComplete    = true;
        this.reconnectAttempts  = 0;
        console.log(`[LIVE-VOICE] ✅ Session Setup Confirmed by Google. Ready for live audio stream!`);

        // Notify Android client that live session is open
        this._sendToClient({
          type: 'CALL_LIVE_READY',
          sessionId: this.sessionId,
          model: this.currentModel
        });

        // Proactive Initial Vocal Greeting (Immediate voice upon answering)
        const greetingPayload = {
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{
                text: '[SYSTEM_EVENT]: Tuan Faqih baru saja mengangkat panggilan telepon. Sapa Tuan Faqih secara ramah, singkat, dan sopan dalam 1 kalimat pembuka (contoh: "Halo Tuan Faqih, ada yang bisa saya bantu?").'
              }]
            }],
            turnComplete: true
          }
        };

        try {
          this.googleWs.send(JSON.stringify(greetingPayload));
          console.log(`[LIVE-VOICE] 🎙️ Dispatched Proactive Vocal Greeting trigger.`);
        } catch (err) {
          console.warn(`[LIVE-VOICE] Greeting send warning:`, err.message);
        }
        return;
      }

      // ── 2. Server Content: Audio Chunks & Text Transcripts ──────────────
      if (msg.serverContent) {
        if (msg.serverContent.interrupted) {
          console.log(`[LIVE-VOICE] ⚡ Barge-in / turn transition detected.`);
        }

        const parts = msg.serverContent.modelTurn?.parts || [];
        let turnText = '';

        for (const p of parts) {
          // Audio chunk (PCM 24kHz Base64)
          if (p.inlineData && p.inlineData.data) {
            this._sendToClient({
              type: 'CALL_AUDIO_PLAY',
              pcm_chunk: p.inlineData.data
            });
            // Update HUD to Mentransmisikan..
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              status: 'SPEAKING'
            });
          }
          // Text transcript from model
          if (p.text) {
            turnText += p.text;
          }
        }

        // Save assistant text turn to history + chat memory for cross-platform continuity
        if (turnText.trim().length > 0) {
          this.turnHistory.push({ role: 'assistant', text: turnText });
          // Async persist to nexa_chat_memories (non-blocking — never delay audio)
          supabaseMemories.saveChatMemory('nexa', turnText.slice(0, 800), 'live_call').catch(() => {});
        }

        // If turnComplete is reached, return state to LISTENING
        if (msg.serverContent.turnComplete && !this.isEndingCall) {
          this._sendToClient({
            type: 'CALL_STATUS_UPDATE',
            status: 'LISTENING'
          });
        }

        // If turnComplete is reached AND call is marked to end:
        if (msg.serverContent.turnComplete && this.isEndingCall) {
          console.log(`[LIVE-VOICE] 🏁 Closing turn completed. Allowing 2.5s audio buffer drain before ending call...`);
          setTimeout(() => {
            if (this.isActive) {
              this._sendToClient({ type: 'CALL_REPLY_COMPLETE' });
              this.close();
            }
          }, 2500);
        }
      }

      // ── 3. Tool Calls (Function Execution — Parallel Batching) ──────────
      if (msg.toolCall && Array.isArray(msg.toolCall.functionCalls) && msg.toolCall.functionCalls.length > 0) {
        // Notify HUD that tools are executing (Memproses..)
        this._sendToClient({
          type: 'CALL_STATUS_UPDATE',
          status: 'PROCESSING'
        });

        const functionCalls = msg.toolCall.functionCalls;
        console.log(`[LIVE-VOICE] 🛠️ Processing ${functionCalls.length} tool call(s) in parallel...`);

        const responses = await Promise.all(
          functionCalls.map(async (fc) => {
            const callId   = fc.id;
            const funcName = fc.name;
            const funcArgs = fc.args || {};
            console.log(`[LIVE-VOICE] 🛠️ Executing: ${funcName} [${callId}]`);

            try {
              const toolResult = await executeLiveTool(funcName, funcArgs);

              // Record structured turn into turnHistory and chat memories for passive learning & Telegram continuity
              const userActionDesc = `[Aksi Tuan Faqih]: ${funcName}(${JSON.stringify(funcArgs)})`;
              const assistantReplyDesc = `[Respon N.E.X.A]: ${toolResult?.message || JSON.stringify(toolResult)}`;
              this.turnHistory.push({ role: 'user', text: userActionDesc });
              this.turnHistory.push({ role: 'assistant', text: assistantReplyDesc });

              supabaseMemories.saveChatMemory('user', userActionDesc, 'live_call').catch(() => {});
              supabaseMemories.saveChatMemory('nexa', assistantReplyDesc, 'live_call').catch(() => {});

              return {
                id: callId,
                name: funcName,
                response: { output: toolResult }
              };
            } catch (err) {
              console.error(`[LIVE-TOOL] ❌ Execution error in ${funcName}:`, err.message);
              return {
                id: callId,
                name: funcName,
                response: { output: { status: 'ERROR', message: err.message } }
              };
            }
          })
        );

        const toolResponsePayload = {
          toolResponse: {
            functionResponses: responses
          }
        };

        if (this.googleWs && this.googleWs.readyState === WebSocket.OPEN) {
          this.googleWs.send(JSON.stringify(toolResponsePayload));
          console.log(`[LIVE-VOICE] 📤 Sent ${responses.length} Tool Response(s) back to Google.`);
        }
      }

    } catch (err) {
      console.error(`[LIVE-VOICE] ❌ Error processing Google message:`, err.message);
    }
  }

  /**
   * Forward incoming audio chunk from Android mic to Google Live API
   * @param {string} pcmBase64 - Base64 encoded 16kHz 16-bit Mono PCM
   */
  handleIncomingClientAudio(pcmBase64) {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    const realtimeMsg = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: pcmBase64
        }
      }
    };

    try {
      this.googleWs.send(JSON.stringify(realtimeMsg));
    } catch (err) {
      console.error(`[LIVE-VOICE] ❌ Failed to forward audio to Google:`, err.message);
    }
  }

  /**
   * Handle incoming text from user (STT result from Android)
   * Saves to turnHistory and nexa_chat_memories for cross-platform continuity
   * @param {string} text - Transcribed user speech
   */
  handleIncomingClientText(text) {
    if (!text || !text.trim()) return;
    this.turnHistory.push({ role: 'user', text: text.trim() });
    // Async persist to nexa_chat_memories — never block audio
    supabaseMemories.saveChatMemory('user', text.trim().slice(0, 800), 'live_call').catch(() => {});
  }

  /**
   * Send JSON packet to Android Nexa Bridge WebSocket client
   */
  _sendToClient(packet) {
    if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      try {
        this.clientWs.send(JSON.stringify(packet));
      } catch (_) {}
    }
  }

  /**
   * 8-Layer Failover and Hot-Reconnection Strategy
   * Rotates API keys and falls back to Tier 2 Marathon model after key exhaustion
   */
  async _handleFailover(code, reason) {
    if (!this.isActive) return;

    this.reconnectAttempts++;
    console.warn(`[LIVE-VOICE] ⚠️ Failover triggered (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): Code ${code} — ${reason}`);

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % (GOOGLE_KEYS.length || 1);

      if (this.currentKeyIndex === 0 && this.currentModel === LIVE_MODELS.TIER_1_SPEED) {
        console.log(`[LIVE-VOICE] 🔄 Switching to Tier 2 Marathon: ${LIVE_MODELS.TIER_2_MARATHON}`);
        this.currentModel = LIVE_MODELS.TIER_2_MARATHON;
      }

      console.log(`[LIVE-VOICE] 🔄 Reconnecting with Key Index ${this.currentKeyIndex}...`);
      await new Promise(r => setTimeout(r, 800));
      await this._connectGoogleWs();
    } else {
      console.error(`[LIVE-VOICE] 🚨 All failover tiers exhausted.`);
      this._sendToClient({
        type: 'CALL_ERROR',
        message: 'Koneksi suara live mengalami gangguan. Mengalihkan ke mode suara standar.'
      });
      this.close();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CLOSE SESSION — Persist memory & run End-of-Call Passive Learning
  // ──────────────────────────────────────────────────────────────────────────
  async close() {
    this.isActive = false;
    const durationSec = Math.round((Date.now() - this.sessionStartTime) / 1000);
    console.log(`[LIVE-VOICE] 🛑 Closing Live Session [${this.sessionId}] | Duration: ${durationSec}s | Turns: ${this.turnHistory.length}`);

    if (this.googleWs) {
      try { this.googleWs.close(1000, 'Session Closed'); } catch (_) {}
      this.googleWs = null;
    }

    if (this.turnHistory.length === 0) {
      console.log(`[LIVE-VOICE] 📝 No turns to process. Skipping end-of-call pipeline.`);
      return;
    }

    // ── A. Persist Conversation Summary to Supabase Memories ────────────
    try {
      const summaryText = this.turnHistory.map(t => `${t.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${t.text}`).join('\n');
      await supabaseMemories.saveMemoryWithMeta(
        `[PANGGILAN SUARA LIVE NEXA — ${durationSec} DETIK]\n${summaryText}`,
        'LIVE_CALL_CONVERSATION'
      );
      console.log(`[LIVE-VOICE] 📝 Call transcript persisted (${durationSec}s, ${this.turnHistory.length} turns).`);
    } catch (err) {
      console.warn(`[LIVE-VOICE] Memory persistence warning:`, err.message);
    }

    // ── B. End-of-Call Passive Learning (Batch Analysis) ────────────────
    // Analyzes the full conversation for implicit facts & self-learning
    // Runs in background — does not block session close
    this._runPassiveLearningPipeline(durationSec).catch(err => {
      console.warn(`[LIVE-VOICE] Passive learning pipeline warning:`, err.message);
    });
  }

  /**
   * [END-OF-CALL PIPELINE] Passive Learning & Self-Model Update
   * Runs after call close — zero latency impact on voice session
   */
  async _runPassiveLearningPipeline(durationSec) {
    if (!this.turnHistory || this.turnHistory.length === 0) return;

    console.log(`[LIVE-VOICE] 🧠 Starting End-of-Call Passive Learning Pipeline (${this.turnHistory.length} turns, ${durationSec}s)...`);

    // Build conversation text for AI analysis
    const conversationText = this.turnHistory
      .map(t => `${t.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${t.text}`)
      .join('\n');

    // Helper to robustly parse extracted facts across JSON array, single string, or bullet list
    const parseLearnedFacts = (rawOutput) => {
      if (!rawOutput) return [];
      const cleanStr = String(rawOutput || '').trim().replace(/^```json|```$/gi, '').trim();
      if (!cleanStr || cleanStr.length < 5 || cleanStr === '[]' || cleanStr.toLowerCase() === 'none') return [];

      // 1. Try JSON Array parsing
      try {
        const firstBracket = cleanStr.indexOf('[');
        const lastBracket  = cleanStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const parsed = JSON.parse(cleanStr.substring(firstBracket, lastBracket + 1));
          if (Array.isArray(parsed)) {
            return parsed
              .map(s => String(s || '').trim().replace(/^[-*•0-9.)\s]+/, ''))
              .filter(s => s.length > 5 && !s.toLowerCase().includes('tidak ada'));
          }
        }
      } catch (_) {}

      // 2. If bullet list or multi-line output
      if (cleanStr.includes('\n')) {
        return cleanStr
          .split('\n')
          .map(l => l.replace(/^[-*•0-9.)\s]+/, '').trim())
          .filter(l => l.length > 5 && !l.toLowerCase().startsWith('tidak ada') && !l.startsWith('[') && !l.startsWith('{'));
      }

      // 3. Single fact string (e.g. from callAI)
      if (cleanStr.length > 5 && !cleanStr.startsWith('{') && !cleanStr.toLowerCase().includes('tidak ada fakta')) {
        return [cleanStr.replace(/^[-*•0-9.)\s]+/, '').trim()];
      }

      return [];
    };

    // ── B1. Extract learned_user_facts about Tuan Faqih ─────────────────
    try {
      const userFactsPrompt = `Berikut adalah transkrip percakapan telepon suara antara Tuan Faqih dan N.E.X.A:

${conversationText}

TUGAS: Ekstrak fakta-fakta baru atau perubahan status tentang TUAN FAQIH (si manusia pengguna) dari percakapan di atas.
Fokus pada: kebiasaan baru, preferensi, kondisi kesehatan, status proyek/skripsi, perubahan hidup, informasi personal.
ABAIKAN hal-hal yang sudah umum diketahui atau tidak mengandung informasi baru.

Balas HANYA dengan JSON array string. Contoh:
["Tuan Faqih sekarang rutin olahraga lari pagi", "Tuan Faqih sedang mengerjakan skripsi bab 3"]
Jika tidak ada fakta baru, balas dengan: []`;

      const userFactsRaw = await callAI(userFactsPrompt);
      const userFacts = parseLearnedFacts(userFactsRaw);

      if (userFacts.length > 0) {
        console.log(`[LIVE-VOICE] 🧠 Passive Learning: ${userFacts.length} user facts detected. Saving via Supersede Engine...`);
        for (const fact of userFacts) {
          if (typeof fact === 'string' && fact.trim().length > 5) {
            await deduplicateAndSaveFact(fact.trim(), 'USER_PROFILE').catch(() => {});
          }
        }
        // Invalidate RAM cache so next chat session immediately reflects new facts
        invalidatePersonalFactsCache();
        console.log(`[LIVE-VOICE] ✅ User facts saved. Cache invalidated.`);
      } else {
        console.log(`[LIVE-VOICE] 🧠 No new user facts detected in this call.`);
      }
    } catch (err) {
      console.warn(`[LIVE-VOICE] User fact extraction error:`, err.message);
    }

    // ── B2. Extract learned_core_identities about N.E.X.A ───────────────
    try {
      const coreIdPrompt = `Berikut adalah transkrip percakapan telepon suara:

${conversationText}

TUGAS: Ekstrak instruksi, koreksi, atau aturan baru yang Tuan Faqih berikan kepada N.E.X.A (sistem AI) dalam percakapan ini.
Fokus pada: cara N.E.X.A harus berperilaku, format respons, batasan, kemampuan yang disebutkan, atau koreksi atas respons N.E.X.A.
ABAIKAN percakapan biasa yang tidak berisi instruksi untuk N.E.X.A.

Balas HANYA dengan JSON array string. Contoh:
["Saat di telepon, N.E.X.A harus berbicara lebih singkat", "N.E.X.A sudah bisa mencatat keuangan via suara telepon"]
Jika tidak ada, balas dengan: []`;

      const coreIdRaw = await callAI(coreIdPrompt);
      const coreIds = parseLearnedFacts(coreIdRaw);

      if (coreIds.length > 0) {
        console.log(`[LIVE-VOICE] 🧠 Passive Learning: ${coreIds.length} N.E.X.A identity facts. Saving...`);
        for (const fact of coreIds) {
          if (typeof fact === 'string' && fact.trim().length > 5) {
            await deduplicateAndSaveFact(fact.trim(), 'CORE_IDENTITY').catch(() => {});
          }
        }
        console.log(`[LIVE-VOICE] ✅ Core identity facts saved.`);
      }
    } catch (err) {
      console.warn(`[LIVE-VOICE] Core identity extraction error:`, err.message);
    }

    // ── B3. Self-Model Update (N.E.X.A behavioral reflection) ───────────
    try {
      const selfModelPrompt = `Berikut adalah transkrip percakapan telepon suara antara Tuan Faqih dan N.E.X.A:

${conversationText.slice(0, 2000)}

TUGAS: Apakah ada observasi tentang cara N.E.X.A berkomunikasi atau bekerja dalam panggilan suara ini yang perlu dicatat sebagai refleksi diri?
Fokus pada: keberhasilan eksekusi, hambatan yang ditemui, pola komunikasi suara, atau area yang perlu diperbaiki.

Balas HANYA dengan 1 kalimat refleksi diri N.E.X.A (atau balas "NONE" jika tidak ada yang signifikan).
Contoh: "N.E.X.A berhasil mengeksekusi pencatatan keuangan dan kalender via suara dalam satu sesi telepon tanpa hambatan."`;

      const selfReflection = await callAI(selfModelPrompt);
      const cleanReflection = String(selfReflection || '').trim().replace(/^```json|```$/gi, '').trim();

      if (cleanReflection && cleanReflection !== 'NONE' && !cleanReflection.toLowerCase().includes('tidak ada') && cleanReflection.length > 10) {
        await deduplicateAndSaveSelfFact(
          cleanReflection,
          'COMMUNICATION_STYLE',
          'PASSIVE_LEARNING',
          `Live call session ${this.sessionId} — ${durationSec}s`
        ).catch(() => {});
        console.log(`[LIVE-VOICE] ✅ Self-model reflection saved in COMMUNICATION_STYLE: ${cleanReflection.substring(0, 80)}...`);
      }
    } catch (err) {
      console.warn(`[LIVE-VOICE] Self-model update error:`, err.message);
    }

    console.log(`[LIVE-VOICE] 🎓 End-of-Call Passive Learning Pipeline complete.`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SESSION MANAGER — Active Sessions Map: sessionId → LiveVoiceSession
// ────────────────────────────────────────────────────────────────────────────
const activeSessions = new Map();

function startLiveSession(sessionId, clientWs) {
  // Terminate any existing session for this client
  if (activeSessions.has(sessionId)) {
    activeSessions.get(sessionId).close();
    activeSessions.delete(sessionId);
  }

  const session = new LiveVoiceSession(sessionId, clientWs);
  activeSessions.set(sessionId, session);
  session.start();
  return session;
}

function getLiveSession(sessionId) {
  return activeSessions.get(sessionId);
}

function getActiveSessionForClient(clientWs) {
  for (const session of activeSessions.values()) {
    if (session.clientWs === clientWs && session.isActive) {
      return session;
    }
  }
  return null;
}

function closeLiveSession(sessionId) {
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.close();
    activeSessions.delete(sessionId);
  }
}

function markEndingCall() {
  console.log(`[LIVE-VOICE] 📞 Marking active live sessions to end after current speech turn finishes...`);
  for (const session of activeSessions.values()) {
    session.isEndingCall = true;
  }
}

function closeAllLiveSessions() {
  console.log(`[LIVE-VOICE] 🛑 Closing all active live voice sessions (${activeSessions.size} active)...`);
  for (const [id, session] of activeSessions.entries()) {
    try {
      session._sendToClient({ type: 'CALL_REPLY_COMPLETE' });
      session.close();
    } catch (_) {}
  }
  activeSessions.clear();
}

module.exports = {
  startLiveSession,
  getLiveSession,
  getActiveSessionForClient,
  closeLiveSession,
  closeAllLiveSessions,
  markEndingCall
};


