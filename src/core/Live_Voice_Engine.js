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
3. Gaya Bahasa: Bahasa Indonesia yang mengalir alami, berkelas, tidak kaku, dan penuh sentuhan kemanusiaan.
4. Latar Belakang Tuan: Mahasiswa Sastra Arab Universitas Gadjah Mada (UGM), calon diplomat internasional.
5. Prinsip: Selalu menjaga kesejahteraan Tuan, mendampingi dengan tenang, dan mengeksekusi perintah eksekutif secara sigap.

[PANDUAN BICARA LIVE]
- Bicaralah secara ringkas, to the point, dan alami dalam percakapan suara.
- Jika Tuan meminta mencatat pengeluaran, mengecek saldo, atau mencari informasi memori, panggil alat (tools) yang tersedia.
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

      this.googleWs.on('open', () => {
        console.log(`[LIVE-VOICE] 🌐 Connected to Google WSS. Sending setup payload...`);
        this._sendSetupPayload();
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

  _sendSetupPayload() {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) return;

    // Get snapshot facts from SACR v3.0 memory
    let memoryFacts = '';
    try {
      const topFacts = geminiVectorCache.getAllSnapshotFacts ? geminiVectorCache.getAllSnapshotFacts().slice(0, 10) : [];
      if (topFacts.length > 0) {
        memoryFacts = '\n\n[MEMORI LIVING FACTS SACR v3.0 TUAN FAQIH]:\n• ' + topFacts.map(f => f.content).join('\n• ');
      }
    } catch (_) {}

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
            text: `${NEXA_LIVE_SYSTEM_PROMPT}${memoryFacts}`
          }]
        },
        tools: [
          {
            functionDeclarations: LIVE_TOOL_DECLARATIONS
          }
        ]
      }
    };

    this.googleWs.send(JSON.stringify(setupPayload));
  }

  async _handleGoogleMessage(rawBuffer) {
    try {
      const msg = JSON.parse(rawBuffer.toString());

      // 1. Setup Complete
      if (msg.setupComplete) {
        this.isSetupComplete = true;
        this.reconnectAttempts = 0;
        console.log(`[LIVE-VOICE] ✅ Session Setup Confirmed by Google. Triggering initial vocal greeting...`);

        // Trigger immediate vocal greeting from N.E.X.A
        try {
          const greetingTrigger = {
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "Halo Nexa! Saya mengangkat telepon."
                    }
                  ]
                }
              ],
              turnComplete: true
            }
          };
          this.googleWs.send(JSON.stringify(greetingTrigger));
        } catch (_) {}

        // Notify Android client that live session is open
        this._sendToClient({
          type: 'CALL_LIVE_READY',
          sessionId: this.sessionId,
          model: this.currentModel
        });
        return;
      }

      // 2. Server Content: Audio Chunks & Barge-In
      if (msg.serverContent) {
        // Interruption Event (Barge-In)
        if (msg.serverContent.interrupted) {
          console.log(`[LIVE-VOICE] ⚡ Google Detected User Interruption (Barge-In). Muting client buffer.`);
          this._sendToClient({
            type: 'CALL_AUDIO_INTERRUPTED'
          });
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

      // 3. Tool Calls (Function Execution)
      if (msg.toolCall && msg.toolCall.functionCalls) {
        for (const fc of msg.toolCall.functionCalls) {
          const callId = fc.id;
          const funcName = fc.name;
          const funcArgs = fc.args || {};

          console.log(`[LIVE-VOICE] 🛠️ Received Live Tool Call: ${funcName} [${callId}]`);
          const toolResult = await executeLiveTool(funcName, funcArgs);

          // Send toolResponse back to Google
          const toolResponsePayload = {
            toolResponse: {
              functionResponses: [
                {
                  id: callId,
                  name: funcName,
                  response: {
                    output: toolResult
                  }
                }
              ]
            }
          };

          if (this.googleWs && this.googleWs.readyState === WebSocket.OPEN) {
            this.googleWs.send(JSON.stringify(toolResponsePayload));
            console.log(`[LIVE-VOICE] 📤 Sent Tool Response back to Google for [${funcName}]`);
          }
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
        mediaChunks: [
          {
            mimeType: "audio/pcm;rate=16000",
            data: pcmBase64
          }
        ]
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
