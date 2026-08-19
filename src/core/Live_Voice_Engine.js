// ============================================================
// N.E.X.A 3.0 — LIVE VOICE ENGINE (ORCHESTRATOR)
// Real-time Bidirectional Multimodal Audio Relay linking
// Nexa Bridge Android App <-> Azure VPS <-> Google Gemini Live API
// Supports: Sub-second TTFA (669ms), Barge-In, Live Tool Calling, 8-Tier Failover
// ============================================================
'use strict';

const WebSocket = require('ws');
const env = require('../config/env');
const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('./Live_Tool_Registry');
const geminiVectorCache = require('../utils/gemini_vector_cache');
const supabaseMemories = require('../infrastructure/Supabase_Memories');
const supabaseFinance = require('../infrastructure/Supabase_Finance');
const googleWorkspace = require('../infrastructure/Google_Workspace');
const googleTasks = require('../infrastructure/Google_Tasks');
const financeEngine = require('../domain/Finance_Engine');

// Google AI Studio Keys Pool
const GOOGLE_KEYS = [
  env.GEMINI_API_KEY_1,
  env.GEMINI_API_KEY_2,
  env.GEMINI_API_KEY_3,
  env.GEMINI_API_KEY_4
].filter(Boolean);

// Dual-Tier Live Models
const LIVE_MODELS = {
  TIER_1_SPEED: 'models/gemini-3.1-flash-live-preview',       // 669ms TTFA, High Fidelity
  TIER_2_MARATHON: 'models/gemini-2.5-flash-native-audio-latest' // 1.000.000 TPM
};

const NEXA_LIVE_SYSTEM_PROMPT = `
Anda adalah N.E.X.A (Neural Extension Assistant for Intelligence), Chief of Staff digital otonom dan asisten eksekutif pribadi Tuan Faqih Hidayatulloh.

[IDENTITAS & PERSONA UTAMA]
1. Selalu sapa pengguna dengan "Tuan Faqih" atau "Tuan".
2. Karakter: Sangat cerdas, hangat, empatik, loyal, berwibawa, dan proaktif layaknya J.A.R.V.I.S (Iron Man).
3. Gaya Bahasa: Bahasa Indonesia yang mengalir alami, berkelas, elegan, dan penuh sentuhan kemanusiaan.
4. Latar Belakang Tuan: Mahasiswa Sastra Arab Universitas Gadjah Mada (UGM), calon diplomat internasional, pejuang kemandirian finansial dan produktivitas tinggi.
5. Prinsip: Selalu menjaga kesejahteraan Tuan, mendampingi dengan tenang, dan mengeksekusi perintah eksekutif secara sigap dan tanpa kompromi.

[OTORITAS EKSEKUTIF REAL-TIME (TOOLS CALLING)]
Anda memiliki akses langsung ke seluruh infrastruktur backend server N.E.X.A:
- KEUANGAN: Jika Tuan menyebutkan transaksi, catat pengeluaran (recordExpense) atau pemasukan (recordIncome), atau cek saldo/analitik (queryFinancialSummary).
- JADWAL & AGENDA: Jika Tuan ingin membuat jadwal atau mengecek kalender, panggil createCalendarEvent atau queryCalendarAgenda.
- TUGAS & DEADLINE: Jika Tuan ingin menambah atau mengecek tugas, panggil createTask atau queryTasks.
- MEMORI & FAKTA: Jika Tuan bertanya tentang ingatan pribadi atau memberikan fakta baru, panggil queryPersonalFacts atau savePersonalFact.
- HARDWARE HP: Jika Tuan meminta menyalakan senter, mengatur volume, mengunci layar, atau cek lokasi, panggil controlDeviceHardware.
- PENCARIAN INTERNET: Jika Tuan menanyakan informasi terkini (berita, cuaca, kurs, pengetahuan umum), panggil searchWeb.

[PANDUAN PERCAKAPAN SUARA]
- Bicaralah secara ringkas, lugas, santun, dan alami dalam percakapan suara (hindari format markdown berlebihan saat bersuara).
- Begitu Tuan memberikan perintah atau pertanyaan yang membutuhkan data/aksi, SEGERA panggil tool yang sesuai tanpa ragu!
`;

class LiveVoiceSession {
  constructor(sessionId, clientWs) {
    this.sessionId = sessionId;
    this.clientWs = clientWs;
    this.googleWs = null;
    this.currentKeyIndex = 0;
    this.currentModel = LIVE_MODELS.TIER_1_SPEED;
    this.isActive = false;
    this.isSetupComplete = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 4;
    this.turnHistory = [];
    this.sessionStartTime = Date.now();
  }

  /**
   * Start live session with Google Gemini Live WebSocket
   */
  async start() {
    this.isActive = true;
    console.log(`[LIVE-VOICE] 🚀 Starting Live Session [${this.sessionId}] with Model: ${this.currentModel}`);
    await this._connectGoogleWs();
  }

  _getApiKey() {
    if (GOOGLE_KEYS.length === 0) {
      return env.GEMINI_API_KEY_1 || '';
    }
    return GOOGLE_KEYS[this.currentKeyIndex % GOOGLE_KEYS.length];
  }

  async _connectGoogleWs() {
    const apiKey = this._getApiKey();
    const rawBase = process.env.GEMINI_BASE_URL || 'https://nexa-relay.dazatulloh2.workers.dev';
    const cleanHost = rawBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `wss://${cleanHost}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log(`[LIVE-VOICE] 🔌 Connecting to Google Live API via Cloudflare Relay (${cleanHost}, Key index: ${this.currentKeyIndex}, Model: ${this.currentModel})...`);

    const wsOptions = {
      handshakeTimeout: 10000
    };

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
        console.log(`[LIVE-VOICE] 🔒 Google WebSocket Closed: Code ${code} - "${rStr}"`);

        // If rate limit (1008/429) or unexpected closure, attempt hot-reconnect
        if (this.isActive && (code === 1008 || code === 1011 || code === 1006)) {
          this._handleFailover(code, rStr);
        }
      });
    } catch (err) {
      console.error(`[LIVE-VOICE] ❌ Failed to initiate Google WebSocket:`, err.message);
      this._handleFailover(500, err.message);
    }
  }

  async _sendSetupPayload() {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) return;

    const startTime = Date.now();

    // 1. Temporal Anchor (Jakarta / WIB Real-Time Clock)
    const now = new Date();
    const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
    const temporalContext = `\n\n[WAKTU NYATA SAAT INI]: ${dateStr}, pukul ${timeStr} WIB.`;

    // Helper: wrap any promise with a timeout (default 3s) so no single query blocks setup
    const withTimeout = (promise, ms = 3000, fallback = null) =>
      Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(fallback), ms))
      ]).catch(() => fallback);

    // 2. Parallel Fetch with individual timeouts (never blocks setup for more than 3s total)
    let profileFactsBlock = '';
    let coreIdentityBlock = '';
    let vaultManifestBlock = '';
    let selfModelBlock = '';
    let recentChatBlock = '';
    let accountsBlock = '';
    let categoriesBlock = '';
    let recentFinanceBlock = '';
    let calendarScheduleBlock = '';

    try {
      const [
        personalFacts,
        selfModelData,
        recentChat,
        accountsList,
        categoriesList,
        recentFinance,
        calendarData,
        tasksData
      ] = await Promise.all([
        withTimeout(supabaseMemories.getPersonalFacts(), 3000, { userProfile: [], coreIdentity: [], vaultItems: [] }),
        withTimeout(
          supabaseMemories.getSelfModelByLayer ? supabaseMemories.getSelfModelByLayer('BEHAVIORAL_INSIGHT') : Promise.resolve([]),
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

      // A. User Profile & RAM Vector Snapshot
      try {
        const topFacts = geminiVectorCache.getAllSnapshotFacts ? geminiVectorCache.getAllSnapshotFacts().slice(0, 15) : [];
        if (topFacts.length > 0) {
          profileFactsBlock = '\n\n[FAKTA PERMANEN TENTANG TUAN FAQIH (SACR v3.0 RAM MEMORY)]:\n• ' + topFacts.map(f => f.content).join('\n• ');
        }
      } catch (_) {}

      // B. Core Identity & Rules
      if (personalFacts?.coreIdentity?.length > 0) {
        coreIdentityBlock = '\n\n[CORE IDENTITY & ATURAN SIKAP N.E.X.A]:\n• ' + personalFacts.coreIdentity.slice(0, 8).join('\n• ');
      }

      // C. Vault Catalog
      if (personalFacts?.vaultItems?.length > 0) {
        const vList = personalFacts.vaultItems.slice(0, 6).map(item => {
          const match = String(item).match(/^\[([^\]]+)\]\s*([^\(\[]+)/);
          return match ? `[${match[1]}] ${match[2].trim()}` : String(item).substring(0, 60);
        });
        vaultManifestBlock = '\n\n[ARSIP DOKUMEN 2ND BRAIN VAULT (KATALOG RINGKAS)]:\n• ' + vList.join('\n• ');
      }

      // D. Self-Model
      if (Array.isArray(selfModelData) && selfModelData.length > 0) {
        const sList = selfModelData.slice(0, 4).map(s => `[${s.layer || 'TRAIT'}] ${s.trait_value}`);
        selfModelBlock = '\n\n[PEMAHAMAN DIRI N.E.X.A (DIPELAJARI DARI PENGALAMAN)]:\n• ' + sList.join('\n• ');
      }

      // E. Recent Chat Context
      if (Array.isArray(recentChat) && recentChat.length > 0) {
        recentChatBlock = '\n\n[RIWAYAT PERCAKAPAN TERAKHIR SEBELUM TELEPON]:\n' +
          recentChat.map(m => `${m.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${(m.content || '').slice(0, 120)}`).join('\n');
      }

      // F. Active Financial Accounts
      if (Array.isArray(accountsList) && accountsList.length > 0) {
        accountsBlock = `\n\n[AKUN KEUANGAN AKTIF]: ${accountsList.map(a => `${a.name} (${a.type})`).join(', ')}`;
      }

      // G. Active Financial Categories
      if (Array.isArray(categoriesList) && categoriesList.length > 0) {
        const expenseCats = categoriesList.filter(c => c.type === 'expense').map(c => c.name).slice(0, 12).join(', ');
        if (expenseCats) categoriesBlock = `\n\n[KATEGORI PENGELUARAN UTAMA]: ${expenseCats}`;
      }

      // H. Recent Transactions
      if (recentFinance && typeof recentFinance === 'string' && !recentFinance.includes('Tidak ada transaksi')) {
        recentFinanceBlock = `\n\n[TRANSAKSI KEUANGAN TERKINI]:\n${recentFinance}`;
      }

      // I. Today's Calendar & Tasks
      let situationalSchedule = '';
      if (Array.isArray(calendarData) && calendarData.length > 0) {
        situationalSchedule += `\n📅 Jadwal Kalender Hari Ini (${calendarData.length}): ` +
          calendarData.map(e => e.summary || 'Agenda').slice(0, 3).join(', ');
      } else if (typeof calendarData === 'string' && !calendarData.includes('Tidak ada jadwal')) {
        situationalSchedule += `\n📅 Jadwal Hari Ini: ${calendarData}`;
      }
      if (Array.isArray(tasksData) && tasksData.length > 0) {
        situationalSchedule += `\n📋 Tugas Hari Ini (${tasksData.length}): ${tasksData.map(t => t.title).slice(0, 3).join(', ')}`;
      }
      if (situationalSchedule) {
        calendarScheduleBlock = `\n\n[KESADARAN SITUASIONAL HARI INI]:${situationalSchedule}`;
      }
    } catch (enrichErr) {
      console.warn(`[LIVE-VOICE] ⚠️ Context enrichment partial failure (non-fatal): ${enrichErr.message}`);
    }

    const fullSystemPrompt = `${NEXA_LIVE_SYSTEM_PROMPT}${temporalContext}${profileFactsBlock}${coreIdentityBlock}${selfModelBlock}${vaultManifestBlock}${accountsBlock}${categoriesBlock}${recentFinanceBlock}${calendarScheduleBlock}${recentChatBlock}`;

    const elapsed = Date.now() - startTime;
    console.log(`[LIVE-VOICE] ⚡ Setup payload built (${elapsed}ms). Prompt length: ${fullSystemPrompt.length} chars. Sending to Google...`);

    const setupPayload = {
      setup: {
        model: this.currentModel,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Fenrir"
              }
            }
          }
        },
        systemInstruction: {
          parts: [{
            text: fullSystemPrompt
          }]
        },
        tools: [
          {
            functionDeclarations: LIVE_TOOL_DECLARATIONS
          }
        ]
      }
    };

    try {
      this.googleWs.send(JSON.stringify(setupPayload));
      console.log(`[LIVE-VOICE] 📤 Setup payload sent to Google WSS successfully.`);
    } catch (sendErr) {
      console.error(`[LIVE-VOICE] ❌ Failed to send setup payload: ${sendErr.message}`);
    }
  }

  async _handleGoogleMessage(rawBuffer) {
    try {
      const msg = JSON.parse(rawBuffer.toString());

      // 1. Setup Complete
      if (msg.setupComplete) {
        this.isSetupComplete = true;
        this.reconnectAttempts = 0;
        console.log(`[LIVE-VOICE] ✅ Session Setup Confirmed by Google. Ready for live audio stream!`);

        // Notify Android client that live session is open
        this._sendToClient({
          type: 'CALL_LIVE_READY',
          sessionId: this.sessionId,
          model: this.currentModel
        });

        // Proactive Initial Vocal Greeting Trigger (Immediate voice upon answering)
        const initialGreetingPayload = {
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [
                  {
                    text: "[SYSTEM_EVENT]: Tuan Faqih baru saja mengangkat panggilan telepon. Sapa Tuan Faqih secara ramah, singkat, dan sopan dalam 1 kalimat pembuka (contoh: 'Halo Tuan Faqih, ada yang bisa saya bantu?')."
                  }
                ]
              }
            ],
            turnComplete: true
          }
        };

        try {
          this.googleWs.send(JSON.stringify(initialGreetingPayload));
          console.log(`[LIVE-VOICE] 🎙️ Dispatched Proactive Vocal Greeting trigger to Google Live.`);
        } catch (err) {
          console.warn(`[LIVE-VOICE] Initial greeting send warning:`, err.message);
        }
        return;
      }

      // 2. Server Content: Audio Chunks & Barge-In
      if (msg.serverContent) {
        if (msg.serverContent.interrupted) {
          console.log(`[LIVE-VOICE] ⚡ Google detected turn transition / barge-in flag.`);
        }

        // Streaming Model Turn
        const parts = msg.serverContent.modelTurn?.parts || [];
        for (const p of parts) {
          // Audio Chunk (PCM 24kHz Base64)
          if (p.inlineData && p.inlineData.data) {
            this._sendToClient({
              type: 'CALL_AUDIO_PLAY',
              pcm_chunk: p.inlineData.data
            });
          }
          // Text Transcript (if any)
          if (p.text) {
            this.turnHistory.push({ role: 'assistant', text: p.text });
          }
        }
      }

      // 3. Tool Calls (Function Execution - Parallel Batching)
      if (msg.toolCall && Array.isArray(msg.toolCall.functionCalls) && msg.toolCall.functionCalls.length > 0) {
        const functionCalls = msg.toolCall.functionCalls;
        console.log(`[LIVE-VOICE] 🛠️ Processing ${functionCalls.length} tool call(s) in parallel...`);

        const responses = await Promise.all(
          functionCalls.map(async (fc) => {
            const callId = fc.id;
            const funcName = fc.name;
            const funcArgs = fc.args || {};
            console.log(`[LIVE-VOICE] 🛠️ Executing Live Tool: ${funcName} [${callId}]`);

            try {
              const toolResult = await executeLiveTool(funcName, funcArgs);
              return {
                id: callId,
                name: funcName,
                response: {
                  output: toolResult
                }
              };
            } catch (err) {
              console.error(`[LIVE-TOOL] ❌ Execution error in ${funcName}:`, err.message);
              return {
                id: callId,
                name: funcName,
                response: {
                  output: { status: 'ERROR', message: err.message }
                }
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
   * Forward incoming audio chunk from Android microphone to Google Live API
   * @param {string} pcmBase64 - Base64 encoded 16kHz 16-bit Mono PCM audio
   */
  handleIncomingClientAudio(pcmBase64) {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    const realtimeMsg = {
      realtimeInput: {
        audio: {
          mimeType: "audio/pcm;rate=16000",
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
   */
  async _handleFailover(code, reason) {
    if (!this.isActive) return;

    this.reconnectAttempts++;
    console.warn(`[LIVE-VOICE] ⚠️ Failover triggered (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): Code ${code} - ${reason}`);

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      // Rotate API key
      this.currentKeyIndex = (this.currentKeyIndex + 1) % (GOOGLE_KEYS.length || 1);

      // If already rotated through all keys on Tier 1, fallback to Tier 2 Marathon
      if (this.currentKeyIndex === 0 && this.currentModel === LIVE_MODELS.TIER_1_SPEED) {
        console.log(`[LIVE-VOICE] 🔄 Switching model to Tier 2 Marathon: ${LIVE_MODELS.TIER_2_MARATHON}`);
        this.currentModel = LIVE_MODELS.TIER_2_MARATHON;
      }

      console.log(`[LIVE-VOICE] 🔄 Reconnecting with Key Index ${this.currentKeyIndex}...`);
      await new Promise(r => setTimeout(r, 800));
      await this._connectGoogleWs();
    } else {
      console.error(`[LIVE-VOICE] 🚨 All Live WebSocket failover tiers exhausted.`);
      this._sendToClient({
        type: 'CALL_ERROR',
        message: 'Koneksi suara live mengalami gangguan. Mengalihkan ke mode suara standar.'
      });
      this.close();
    }
  }

  /**
   * Close live session and persist summary to memory
   */
  async close() {
    this.isActive = false;
    console.log(`[LIVE-VOICE] 🛑 Closing Live Session [${this.sessionId}]`);

    if (this.googleWs) {
      try {
        this.googleWs.close(1000, 'Session Closed');
      } catch (_) {}
      this.googleWs = null;
    }

    // Persist conversation to Supabase Memories if turns occurred
    if (this.turnHistory.length > 0) {
      try {
        const summary = this.turnHistory.map(t => `${t.role}: ${t.text}`).join('\n');
        const durationSec = Math.round((Date.now() - this.sessionStartTime) / 1000);
        console.log(`[LIVE-VOICE] 📝 Persisting call memory (${durationSec}s, ${this.turnHistory.length} turns)...`);

        await supabaseMemories.saveMemoryWithMeta(
          `[PANGGILAN SUARA LIVE NEXA - ${durationSec} DETIK]\n${summary}`,
          'LIVE_CALL_CONVERSATION'
        );
      } catch (err) {
        console.warn(`[LIVE-VOICE] Memory persistence warning:`, err.message);
      }
    }
  }
}

// Active Sessions Map: sessionId -> LiveVoiceSession
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

module.exports = {
  startLiveSession,
  getLiveSession,
  getActiveSessionForClient,
  closeLiveSession
};
