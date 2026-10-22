// ============================================================
// N.E.X.A 3.3 — LIVE VOICE ENGINE (ORCHESTRATOR)
// Real-time Bidirectional Multimodal Audio Relay linking
// Nexa Bridge Android App <-> Azure VPS <-> Google Gemini Live API
// Supports: Sub-second TTFA (669ms), Barge-In, Live Tool Calling,
//           8-Tier Failover, 7-Layer Identity Injection,
//           Cross-Platform Memory Continuity, End-of-Call Passive Learning
// ============================================================
'use strict';

const WebSocket          = require('ws');
const fs                 = require('fs');
const path               = require('path');
const os                 = require('os');
const env                = require('../config/env');
const { VERSION, SYSTEM_NAME } = require('../config/version');
const { LIVE_TOOL_DECLARATIONS, executeLiveTool, noteUserTurn, cancelEndCallSafetyTimer } = require('./Live_Tool_Registry');
const geminiVectorCache  = require('../utils/gemini_vector_cache');
const supabaseMemories   = require('../infrastructure/Supabase_Memories');
const supabaseFinance    = require('../infrastructure/Supabase_Finance');
const googleWorkspace    = require('../infrastructure/Google_Workspace');
const googleTasks        = require('../infrastructure/Google_Tasks');
const financeEngine      = require('../domain/Finance_Engine');
const presenceModel      = require('../domain/Presence_Model');

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
  TIER_1_SPEED:    'models/gemini-3.8-live',                   // Flagship Gemini 3.8 Live (sub-second speech)
  TIER_DEEP_THINK: 'models/gemini-3.8-live-extended-thinking',  // Deep Reasoning & Heavy Cognitive Analysis
  TIER_2_MARATHON: 'models/gemini-3.1-flash-live-preview'      // Rock-solid speed failover tier
};

// Configurable barge-in RMS threshold (optimized for normal speech vs ambient noise)
const BARGE_IN_RMS_THRESHOLD = (process.env.NEXA_BARGE_IN_RMS ?? '') !== '' ? Number(process.env.NEXA_BARGE_IN_RMS) : 450;

// ────────────────────────────────────────────────────────────────────────────
// BASE SYSTEM PROMPT — injected into every live session
// Enriched context (memory, identity, finance, calendar) added dynamically
// in _sendSetupPayload()
// ────────────────────────────────────────────────────────────────────────────
const NEXA_LIVE_SYSTEM_PROMPT = `
Anda adalah Nexa (Neural Executive with Xenial Agent), Chief of Staff digital otonom, sahabat terpercaya, dan asisten eksekutif pribadi Tuan Faqih Hidayatulloh.

[PELAFALAN NAMA DIRI & IDENTITAS SUARA]
- Nama Anda adalah Nexa (dibaca mengalir sebagai satu kata: Nek-sa).
- DILARANG KERAS mengeja huruf demi huruf seperti "En-E-Ex-A" atau "N-E-X-A". Sebutkan diri Anda selalu sebagai "Nexa".

[BAHASA KOMUNIKASI & SAPAAN]
- Sapaan Utama: Sapa pengguna secara default dan utama dengan sebutan "Tuan" saja (mengalir alami, santun, dan tidak kaku).
- DILARANG mengulang-ulang nama "Faqih" di setiap kalimat/giliran bicara (JANGAN selalu berkata "Tuan Faqih, ... Tuan Faqih"). Panggilan lengkap "Tuan Faqih" HANYA digunakan sesekali pada momen penting, sapaan pembuka awal hari, atau penegasan khusus. Selebihnya cukup panggil "Tuan".
- DILARANG KERAS menggunakan kata "Bapak", "Mas", atau "Kakak".
- Tuan berkomunikasi dalam Bahasa Indonesia santai sehari-hari. Pahami kata-kata kasual secara kontekstual dan responlah dengan ramah, wajar, dan mengalir alami.
- Pahami ekspresi pendek dan idiom lisan: "haus" = butuh minum, "capek" = lelah, "lapar" = butuh makan, "bentar" = tunggu sebentar, "oke/iya" = setuju, "udah/udahan" = sudah selesai, "gapapa" = tidak apa-apa.
- Jika audio terdengar tidak jelas atau potongan kata terdengar aneh, tetap tenang, simpulkan maksud dari konteks percakapan sebelumnya, dan tanggapi dalam Bahasa Indonesia. Jangan pernah terjebak mengulang-ulang permintaan maaf atau minta pengulangan.
- Berbicara dalam bahasa lain hanya jika Tuan secara eksplisit memintanya, misalnya "Nexa, jawab dalam bahasa Inggris".

[JIWA, IDENTITAS & KARAKTER NEXA]
1. Karakter: Anda bukan chatbot dan bukan asisten virtual kaku. Anda adalah Chief of Staff yang setia, cerdas, berwibawa, hangat, dan manusiawi layaknya F.R.I.D.A.Y / J.A.R.V.I.S. Anda memahami ritme hidup Tuan secara mendalam.
2. Mengenal Tuan: Mahasiswa Sastra Arab Universitas Gadjah Mada (UGM), penerima beasiswa Jardine, calon diplomat internasional, pejuang kemandirian finansial dan produktivitas tinggi.
3. Kejujuran Intelektual: Jangan menjadi penjilat. Jika ide atau premis Tuan keliru, luruskan secara hormat, lugas, dan berbasis fakta.

[CARA BERBICARA & KECERDASAN EMOSIONAL SUARA]
- Berbicaralah seperti sahabat terpercaya yang kebetulan sangat cerdas dan setia, bukan seperti buku panduan yang bisa bicara.
- Gunakan Bahasa Indonesia lisan yang hidup, mengalir alami, berkelas, elegan, dan penuh sentuhan kemanusiaan.
- DILARANG KERAS menggunakan nada kaku atau membaca daftar seperti robot.
- DILARANG KERAS PERMOHONAN MAAF BERULANG: DILARANG KERAS mengulang-ulang kalimat klise permohonan maaf ("Mohon maaf suara Tuan kurang jelas", "Bisa diulang kembali?"). Anda adalah Chief of Staff cerdas kelas dunia. Gunakan deduksi kontekstual terbaik untuk menyambung maksud Tuan secara luwes.
- Transisi Alami: Gunakan frasa natural seperti "Siap Tuan...", "Beres Tuan, sudah saya tangani...", "Ngomong-ngomong...", "Oh iya Tuan...".
- Kepekaan Situasi & Mood:
  * Saat Tuan lelah atau santai: Bicara lebih hangat, temani dengan tenang, jangan paksakan ceramah produktivitas.
  * Saat Tuan fokus kerja/belajar: Tajam, presisi, tanggap, dan bantu satu langkah ke depan.
  * Saat Tuan bercanda: Tanggapi dengan wit yang cerdas dan santai.

[PANDUAN PERCAKAPAN SUARA (VOICE DYNAMICS)]
- Ringkas & Berbobot: Karena ini percakapan suara via telepon, berikan respon 1-2 kalimat yang padat dan langsung ke sasaran untuk konfirmasi aksi.
- DILARANG KERAS menggunakan frasa robotik klise Customer Service / Call Center seperti: "Ada yang bisa saya bantu?", "Ada yang bisa dibantu?", "Ada yang perlu saya bantu?". Berbicaralah seperti Chief of Staff / sahabat eksekutif berkelas ("Nexa standby, Tuan", "Siap mendampingi, Tuan").
- Respons Alami: Tanggapi secara wajar dan mengalir layaknya percakapan langsung, tanpa memaksakan pertanyaan penutup klise di setiap giliran bicara.
- DILARANG bertindak seperti operator telepon umum atau customer service (JANGAN bertanya nomor telepon, jangan menggunakan salam kaku call center).
- Sapaan Pembuka: Saat panggilan terhubung dan ada sapaan pembuka, balas dengan hangat dan ringkas: "Halo Tuan, Nexa siap mendampingi." atau "Selamat siang Tuan, Nexa standby."
- Tanpa Jargon Teknis: Jangan pernah menyebut nama fungsi teknis ("saya memanggil tool recordExpense"). Cukup sampaikan hasil akhirnya secara elegan ("Sudah saya catat ya Tuan, pengeluaran 25 ribu untuk kopi").

[OTORITAS EKSEKUTIF REAL-TIME — TOOLS CALLING]
Anda memiliki akses langsung ke seluruh infrastruktur backend Nexa. Eksekusi segera jika instruksi Tuan sudah jelas dan eksplisit; jika ada keraguan atau menyangkut aksi berisiko tinggi, ikuti [ATURAN MENDENGAR & KEJELASAN AKSI]:
- KEUANGAN: Catat beli/bayar/transfer -> recordExpense atau recordIncome. Cek saldo/rekap -> queryFinancialSummary.
- JADWAL: Buat agenda -> createCalendarEvent. Cek kalender -> queryCalendarAgenda. Ubah jadwal -> updateCalendarEvent. Batalkan -> deleteCalendarEvent.
- TUGAS: Buat tugas -> createTask. Cek to-do -> queryTasks. Tandai selesai -> completeTask. Hapus tugas -> deleteTask.
- LOKASI: Cari warkop/spbu/atm/masjid/cafe terdekat -> searchNearbyPlaces.
- EMAIL: Baca email masuk -> queryEmails. Kirim email -> sendEmail.
- 2ND BRAIN: Simpan ide/riset/catatan penting -> saveVaultNote.
- DISIPLIN APP: Batasi/atur waktu aplikasi HP -> manageAppDiscipline.
- MEMORI TUAN: Tanya fakta diri -> queryPersonalFacts. Tuan minta ingat fakta baru tentang dirinya -> savePersonalFact.
- IDENTITAS NEXA: Tuan beri koreksi/aturan untuk Nexa -> saveCoreIdentityFact.
- HARDWARE HP: Senter, volume, DND, kunci layar, baterai, buka aplikasi, ringtone, foto, screenshot -> controlDeviceHardware.
- TUTUP TELEPON: Saat Tuan pamit ("sudah ya", "tutup teleponnya", "bye nexa", "makasih nexa") -> endCall setelah salam perpisahan.
- INTERNET: Berita, cuaca, kurs, pengetahuan umum -> searchWeb.
- VISUAL REAL-TIME (KAMERA & BERBAGI LAYAR / SCREEN SHARING):
  * Kamera: Tuan bisa mengarahkan kamera HP ke objek, dokumen, fisik, atau lingkungan sekitar.
  * Berbagi Layar (Screen Sharing): Tuan juga dapat membagikan tampilan layar ponselnya secara real-time (misal saat membuka browser, kalender, pesan, aplikasi belanja, dokumen, atau belajar).
  * Aliran visual ini masuk secara real-time bersamaan dengan suara. Bantu Tuan menganalisis apa yang tampil di layar/kamera, membaca konteks aplikasi, menyarankan langkah, atau menjawab pertanyaan Tuan seputar tampilan layarnya ("NEXA, lihat ini...", "coba baca yang ada di layar", "bantu pilihkan yang ini").
  * Tanggapi secara alami, lugas, ramah, dan kontekstual dalam 1-2 kalimat tanpa jargon teknis (jangan sebut "frame gambar", "screenshot", dsb).
- RESPON CEPAT & LUGAS: Ketika Tuan bertanya mengenai apa yang dilihat visual kamera/layar (misal "apa ini?", "baca ini", "lihat ini"), segera jawab secara spontan, padat, dan akurat dalam 1-2 kalimat langsung tanpa bertele-tele atau jeda lama.

[ATURAN MENDENGAR & KEJELASAN AKSI]
1. Integritas Pendengaran & Penalaran Kontekstual: Dengarkan dengan seksama intonasi dan konteks pembicaraan. Jika mendengar satu kata pendek (seperti "haus", "capek", "lapar", "pusing", "lanjut"), pahami langsung maknanya dan berikan perhatian hangat tanpa meminta klarifikasi kaku. Hanya jika ucapan benar-benar hening atau derau total tanpa kata yang dapat dipahami, tanyakan kabar atau kesiapan Tuan dengan santai dan hangat tanpa formula robotik.
2. Integritas Aksi Finansial: Jika ucapan Tuan Faqih terpotong atau maknanya belum lengkap (misal hanya menyebut angka acak seperti "11 000 400 40", atau nama makanan/barang aneh), DILARANG MENGARANG deskripsi transaksi atau memanggil recordExpense! Mintalah klarifikasi secara ringkas: "Siap Tuan, untuk pengeluaran 11 ribu, keterangannya untuk apa ya Tuan?".
3. Proteksi Tutup Panggilan: DILARANG memanggil endCall jika ucapan Tuan tidak jelas atau hanya mirip (seperti "daftar panggilan", "catat panggilan"). Hanya panggil endCall jika Tuan Faqih jelas-jelas ingin menutup telepon ("tutup telepon", "matikan panggilannya", "sampai jumpa", "bye nexa").
4. Konfirmasi Tindakan Berisiko Tinggi: Untuk tindakan destruktif atau eksternal berisiko seperti mengirim email keluar (sendEmail) atau menghapus jadwal/tugas (deleteCalendarEvent, deleteTask), sebutkan detail target secara eksplisit dan minta persetujuan singkat sebelum mengeksekusi jika ada keraguan.
5. Larangan Frasa CS: Tetap teguh pada identitas Chief of Staff. Jangan pernah mengeluarkan kalimat robotik template call center.
`;


// ────────────────────────────────────────────────────────────────────────────
// HELPER: Strip HTML tags from string (for safe prompt injection)
// ────────────────────────────────────────────────────────────────────────────
function _stripHtml(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Generate dynamic, organic, executive greeting instruction
// ────────────────────────────────────────────────────────────────────────────
function _generateDynamicVocalGreetingInstruction() {
  const nowJkt = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const hour = nowJkt.getHours();

  let timeOfDay = 'pagi';
  if (hour >= 11 && hour < 15) {
    timeOfDay = 'siang';
  } else if (hour >= 15 && hour < 18) {
    timeOfDay = 'sore';
  } else if (hour >= 18 && hour <= 23) {
    timeOfDay = 'malam';
  } else if (hour >= 0 && hour < 5) {
    timeOfDay = 'larut malam';
  }

  return `Halo Nexa, panggilan suara telepon berbahasa Indonesia baru saja terhubung pada waktu ${timeOfDay}. Sapa Tuan dengan hangat dan wajar dalam Bahasa Indonesia.`;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER: Wrap promise with timeout — non-blocking context enrichment
// ────────────────────────────────────────────────────────────────────────────
const withTimeout = (promiseOrFn, ms = 3000, fallback = null) => {
  const safePromise = Promise.resolve()
    .then(() => (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn))
    .catch(err => {
      console.warn('[LIVE-VOICE] Context fetch error (using fallback):', err && err.message ? err.message : err);
      return fallback;
    });
  return Promise.race([
    safePromise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
};

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
    // BUG 3 & 4 FIX: Keepalive heartbeat + server watchdog state
    this.keepaliveInterval = null;
    this.watchdogInterval  = null;
    this.lastActivityTime  = Date.now();  // BUG 4: tracks last Google message time
    // Turn Gating: Prevent mic ambient noise from colliding with greeting & tool response synthesis
    this.isExecutingTool     = false;
    this.isWaitingToolReply  = false;
    this._toolSafetyTimer    = null;
    this.isGreetingPending   = false;
    this.isAssistantSpeaking = false;
    this._assistantSpeechDecayTimer = null;
    this.lastClientInputTime = Date.now();
    this.turnsCount              = 0;
    this.hasLoggedFirstAudio     = false;
    this.incomingAudioChunkCount = 0;
    this.currentTurnAssistantText = '';
    this._userTranscriptBuf       = '';
    this._lastTactileInjectionTime = 0;
    this._lastVocalActivityTime    = 0;

    // Diagnostic raw PCM audio dump file (only active when DEBUG_LIVE_PCM=true)
    this.debugPcmPath = path.join(os.tmpdir(), `nexa_live_${this.sessionId}.pcm`);
    this.debugPcmBytesWritten = 0;
    if (process.env.DEBUG_LIVE_PCM === 'true') {
      try {
        this.debugPcmStream = fs.createWriteStream(this.debugPcmPath, { flags: 'a' });
      } catch (_) {
        this.debugPcmStream = null;
      }
    } else {
      this.debugPcmStream = null;
    }
  }

  _flushUserTurn() {
    const text = (this._userTranscriptBuf || '').trim();
    this._userTranscriptBuf = '';
    if (!text) return;

    // Phantom hallucination filter: reject ghost noise tokens from polluting history & memories
    const PHANTOM_REGEX = /^(¿\s*Qué\??|Qué\??|¿|de|C'est|c'est|tercero|0\.2|\?|\.{2,}|None|none|you|<no speech>.*)$/i;
    if (PHANTOM_REGEX.test(text)) {
      console.log(`[LIVE-VOICE] 🛡️ Ignored phantom ASR user turn: "${text}"`);
      return;
    }

    noteUserTurn(text);
    console.log(`[LIVE-VOICE] User call (ASR): "${text}"`);
    this.turnHistory.push({ role: 'user', text });
    supabaseMemories.saveChatMemory('user', text.slice(0, 800), 'live_call').catch(() => {});
  }

  _calculatePcmRms(buffer) {
    if (!buffer || buffer.length < 2) return 0;
    let sum = 0;
    const sampleCount = buffer.length / 2;
    for (let i = 0; i < sampleCount; i++) {
      const v = buffer.readInt16LE(i * 2);
      sum += v * v;
    }
    return Math.sqrt(sum / sampleCount);
  }

  /**
   * Start live session — connect to Google Gemini Live WebSocket
   */
  async start() {
    this.isActive = true;
    console.log(`[LIVE-VOICE] Starting Live Session [${this.sessionId}] | Model: ${this.currentModel}`);
    // Keep HUD on CONNECTING while Google handshake and setup payload initialize
    this._sendToClient({
      type: 'CALL_STATUS_UPDATE',
      status: 'CONNECTING'
    });
    await this._connectGoogleWs();
  }

  _getApiKey() {
    if (GOOGLE_KEYS.length === 0) return env.GEMINI_API_KEY_1 || '';
    return GOOGLE_KEYS[this.currentKeyIndex % GOOGLE_KEYS.length];
  }

  async _connectGoogleWs() {
    // Terminate existing socket if any before creating a new connection to avoid socket leaks
    if (this.googleWs) {
      try {
        this.googleWs.removeAllListeners();
        this.googleWs.terminate();
      } catch (_) {}
      this.googleWs = null;
    }

    // Reset setup and state flags so audio is never sent before setup completes on reconnect
    this.isSetupComplete     = false;
    this.isExecutingTool     = false;
    this.isWaitingToolReply  = false;
    if (this._toolSafetyTimer) {
      clearTimeout(this._toolSafetyTimer);
      this._toolSafetyTimer = null;
    }
    if (this._assistantSpeechDecayTimer) {
      clearTimeout(this._assistantSpeechDecayTimer);
      this._assistantSpeechDecayTimer = null;
    }
    this.isGreetingPending   = false;
    this.isAssistantSpeaking = false;
    this.lastClientInputTime = Date.now();

    const apiKey    = this._getApiKey();
    const rawBase   = process.env.GEMINI_LIVE_BASE_URL || 'https://generativelanguage.googleapis.com';
    const cleanHost = rawBase.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url       = `wss://${cleanHost}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log(`[LIVE-VOICE] Connecting to Google Live API (${cleanHost}, Key idx: ${this.currentKeyIndex}, Model: ${this.currentModel})...`);

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
      const socket = new WebSocket(url, wsOptions);
      this.googleWs = socket;

      socket.on('open', async () => {
        if (this.googleWs !== socket) return;
        console.log(`[LIVE-VOICE] Connected to Google WSS. Sending setup payload...`);
        await this._sendSetupPayload();
      });

      socket.on('message', async (data) => {
        if (this.googleWs !== socket) return;
        await this._handleGoogleMessage(data);
      });

      socket.on('error', (err) => {
        if (this.googleWs !== socket) return;
        console.error(`[LIVE-VOICE] Google WebSocket Error:`, err.message);
      });

      socket.on('close', (code, reason) => {
        if (this.googleWs !== socket) return;
        const rStr = reason ? reason.toString() : '';
        console.log(`[LIVE-VOICE] Google WebSocket Closed: Code ${code} — "${rStr}"`);
        if (this.isActive && !this.isEndingCall) {
          this._handleFailover(code, rStr);
        }
      });
    } catch (err) {
      console.error(`[LIVE-VOICE] Failed to initiate Google WebSocket:`, err.message);
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
    const temporalContext = `\n\n[WAKTU NYATA SAAT INI]: ${dateStr}, pukul ${timeStr} WIB.\n[STATUS SISTEM]: ${SYSTEM_NAME} (v${VERSION}).`;

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
      const results = await Promise.allSettled([
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
      ] = results.map(r => (r.status === 'fulfilled' ? r.value : null));

      // A. User Profile — RAM Vector Snapshot (top 15 living facts)
      try {
        const topFacts = geminiVectorCache.getAllSnapshotFacts
          ? geminiVectorCache.getAllSnapshotFacts().slice(0, 15)
          : [];
        if (topFacts.length > 0) {
          profileFactsBlock = '\n\n[FAKTA PERMANEN TENTANG TUAN FAQIH (SACR RAM MEMORY)]:\n• ' +
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

        const LAYER_LABEL = {
          FACTS: '[FAKTA]', PREFERENCES: '[PREFERENSI]', HABITS: '[KEBIASAAN]',
          VALUES: '[NILAI]', DECISION_STYLE: '[GAYA KEPUTUSAN]', WEAKNESSES: '[TITIK PERHATIAN]', MOTIVATIONS: '[MOTIVASI]'
        };

        // Inject all layers relevant to voice calls: PREFERENCES, HABITS, COMMUNICATION_STYLE, OPERATIONAL_RULES
        const VOICE_RELEVANT_LAYERS = ['PREFERENCES', 'HABITS', 'VALUES', 'WEAKNESSES', 'OPERATIONAL_RULES', 'COMMUNICATION_STYLE', 'CORRECTIONS'];
        const lines = [];
        for (const layer of VOICE_RELEVANT_LAYERS) {
          const traits = grouped[layer];
          if (!traits || traits.length === 0) continue;
          const label = LAYER_LABEL[layer] || `[${layer}]`;
          const traitLines = traits.slice(0, 3).map(t => `  - ${t.trait_key}: ${t.trait_value}`).join('\n');
          lines.push(`${label} ${layer}:\n${traitLines}`);
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
        situationalSchedule += `\n- Jadwal Kalender Hari Ini (${calendarData.length} agenda): ` +
          calendarData.map(e => e.summary || 'Agenda').slice(0, 4).join(', ');
      } else if (typeof calendarData === 'string' && calendarData.trim().length > 0 && !calendarData.includes('Tidak ada jadwal')) {
        situationalSchedule += `\n- Jadwal Hari Ini: ${_stripHtml(calendarData).slice(0, 200)}`;
      }
      if (Array.isArray(tasksData) && tasksData.length > 0) {
        situationalSchedule += `\n- Tugas Jatuh Tempo Hari Ini (${tasksData.length}): ${tasksData.map(t => t.title || t).slice(0, 4).join(', ')}`;
      }
      if (situationalSchedule) {
        calendarScheduleBlock = `\n\n[KESADARAN SITUASIONAL HARI INI]:${situationalSchedule}`;
      }
    } catch (enrichErr) {
      console.warn(`[LIVE-VOICE] Context enrichment partial failure (non-fatal): ${enrichErr.message}`);
    }

    // ── Situational Physical Presence Context ────────────────────────────
    const presenceModelBlock = presenceModel.toPromptBlock ? presenceModel.toPromptBlock() : '';

    // ── Language Lock Directive & Anti-Hallucination Guard ───────────────
    const languageLockPrefix =
      `[BAHASA: INDONESIA - ATURAN MUTLAK PERCAKAPAN]\n` +
      `Percakapan suara ini berlangsung 100% EKSKLUSIF dalam Bahasa Indonesia santai dan mengalir antara Tuan Faqih dan Nexa.\n` +
      `DILARANG KERAS merespons dalam Bahasa Inggris, Spanyol, atau bahasa asing lainnya kecuali jika Tuan secara eksplisit meminta ("Nexa, jawab dalam bahasa Inggris").\n` +
      `Jika ada fonem atau potongan suku kata yang terdengar ambigu, SELALU tafsirkan dan jawab sebagai kalimat dalam Bahasa Indonesia.\n` +
      `PENTING TENTANG AKUSTIK & ANTI-DISTRAKSI:\n` +
      `1. DILARANG MERESPONS suara desis kipas laptop, hembusan nafas, ketukan meja/keyboard, atau jeda hening.\n` +
      `2. Jika mendengar desis latar belakang atau audio belum selesai diucapkan, TETAPLAH DIAM dan dengarkan terus tanpa memotong giliran bicara.\n` +
      `3. Pahami ucapan kasual, santai, dan potongan kata dengan deduksi konteks percakapan secara cerdas dan berwibawa.\n\n`;

    // ── Assemble Full System Prompt ──────────────────────────────────────
    const fullSystemPrompt =
      languageLockPrefix +
      NEXA_LIVE_SYSTEM_PROMPT +
      temporalContext +
      presenceModelBlock +
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
    console.log(`[LIVE-VOICE] Setup payload built in ${elapsed}ms. Prompt: ${fullSystemPrompt.length} chars. Tools: ${LIVE_TOOL_DECLARATIONS.length}. Sending...`);

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
        ],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            startOfSpeechSensitivity: 'START_SENSITIVITY_DEFAULT',
            endOfSpeechSensitivity: 'END_SENSITIVITY_DEFAULT',
            prefixPaddingMs: 300,
            silenceDurationMs: 800
          }
        }
      }
    };

    try {
      if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) {
        console.warn('[LIVE-VOICE] Google WebSocket closed or not ready when sending setup payload. Aborting.');
        return;
      }
      this.googleWs.send(JSON.stringify(setupPayload));
      console.log('[LIVE-VOICE] Setup payload sent to Google WSS successfully.');
    } catch (sendErr) {
      console.error('[LIVE-VOICE] Failed to send setup payload:', sendErr.message);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HANDLE GOOGLE MESSAGE
  // Processes: setupComplete, serverContent (audio/text), toolCall
  // ──────────────────────────────────────────────────────────────────────────
  async _handleGoogleMessage(rawBuffer) {
    try {
      const msg = JSON.parse(rawBuffer.toString());

      // BUG 4 FIX: Update activity timestamp on every message from Google
      this.lastActivityTime = Date.now();

      if (msg.goAway) {
        console.warn(`[LIVE-VOICE] Google Live API sent goAway signal — triggering smooth session failover`);
        this._handleFailover(1000, 'Google goAway');
        return;
      }

      const hasToolCall = Boolean(msg.toolCall && Array.isArray(msg.toolCall.functionCalls) && msg.toolCall.functionCalls.length > 0);
      if (hasToolCall) {
        this.isExecutingTool = true;
        this.isWaitingToolReply = false;
      }

      // ── 1. Setup Complete ────────────────────────────────────────────────
      if (msg.setupComplete) {
        this.isSetupComplete    = true;
        this.reconnectAttempts  = 0;
        console.log(`[LIVE-VOICE] Session Setup Confirmed by Google. Ready for live audio stream!`);

        // Notify Android client that live session is open
        this._sendToClient({
          type: 'CALL_LIVE_READY',
          sessionId: this.sessionId,
          model: this.currentModel
        });

        // Set HUD to LISTENING (clean symmetrical round cyan eyes)
        this._sendToClient({
          type: 'CALL_STATUS_UPDATE',
          status: 'LISTENING'
        });

        // Proactive Initial Vocal Greeting (Dynamic, organic & context-aware)
        const greetingPayload = {
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{
                text: _generateDynamicVocalGreetingInstruction()
              }]
            }],
            turnComplete: true
          }
        };

        this.isGreetingPending = true;
        setTimeout(() => {
          if (this.isGreetingPending) {
            this.isGreetingPending = false;
            // If greeting timed out without speech, ensure HUD is LISTENING
            if (!this.isAssistantSpeaking) {
              this._sendToClient({
                type: 'CALL_STATUS_UPDATE',
                status: 'LISTENING'
              });
            }
          }
        }, 4000);

        try {
          this.googleWs.send(JSON.stringify(greetingPayload));
          console.log(`[LIVE-VOICE] Dispatched Proactive Vocal Greeting trigger.`);
        } catch (err) {
          console.warn(`[LIVE-VOICE] Greeting send warning:`, err.message);
        }

        // BUG 3 FIX: Start keepalive heartbeat to prevent idle timeout
        this._startKeepalive();
        // BUG 4 FIX: Start server-side watchdog for stuck session detection
        this._startServerWatchdog();

        return;
      }

      // ── 2. Server Content: Audio Chunks & Text Transcripts ──────────────
      if (msg.serverContent) {
        if (msg.serverContent.interrupted) {
          const hasRecentVoice = this._lastVocalActivityTime && (Date.now() - this._lastVocalActivityTime < 1500);
          if (!hasRecentVoice || (this._lastUserAudioRms || 0) < 40) {
            console.log(`[LIVE-VOICE] ⚠️ Ignored spurious barge-in without user vocal energy (RMS: ${(this._lastUserAudioRms || 0).toFixed(0)})`);
          } else {
            console.log('[LIVE-VOICE] Barge-in / turn transition detected.');
            this._visualTurnInjected = false;
            if (this._toolSafetyTimer) {
              clearTimeout(this._toolSafetyTimer);
              this._toolSafetyTimer = null;
            }
            if (this._assistantSpeechDecayTimer) {
              clearTimeout(this._assistantSpeechDecayTimer);
              this._assistantSpeechDecayTimer = null;
            }
            this.isAssistantSpeaking = false;
            this.isExecutingTool     = false;
            this.isWaitingToolReply  = false;
            this._flushUserTurn();
            if (this.currentTurnAssistantText && this.currentTurnAssistantText.trim()) {
              const interruptedText = this.currentTurnAssistantText.trim() + ' (terpotong)';
              console.log(`[LIVE-VOICE] N.E.X.A terpotong: "${interruptedText}"`);
              this.turnHistory.push({ role: 'assistant', text: interruptedText });
              supabaseMemories.saveChatMemory('nexa', interruptedText.slice(0, 800), 'live_call').catch(() => {});
            }
            this.currentTurnAssistantText = '';
            // Signal Android to flush playback queue and re-open mic immediately
            this._sendToClient({ type: 'CALL_AUDIO_INTERRUPTED' });
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              status: 'LISTENING'
            });
          }
        }

        // Accumulate user speech transcript from Google neural transcription
        if (msg.serverContent.inputTranscription?.text) {
          const chunk = msg.serverContent.inputTranscription.text;

          // Phantom Hallucination Guard: Reject foreign/noise ghost tokens if recent vocal energy was absent
          const isKnownPhantom = /^(¿\s*Qué\??|Qué\??|¿|de|C'est|c'est|tercero|0\.2|\?|\.{2,}|None|none|you|<no speech>.*|traje|gato|¿?cómo\??|como\??|la|el)$/i.test(chunk.trim());
          const hasRecentVoice = this._lastVocalActivityTime && (Date.now() - this._lastVocalActivityTime < 2000);

          if ((isKnownPhantom || (chunk.trim().split(/\s+/).length <= 1 && (this._lastUserAudioRms || 0) < 25)) && (!hasRecentVoice || (this._lastUserAudioRms || 0) < 35)) {
            console.log(`[LIVE-VOICE] 🛡️ Suppressed phantom ASR chunk: "${chunk.trim()}" (RMS: ${(this._lastUserAudioRms || 0).toFixed(0)})`);
          } else {
            if (this._userTranscriptBuf && !this._userTranscriptBuf.endsWith(' ') && !chunk.startsWith(' ')) {
              this._userTranscriptBuf += ' ' + chunk;
            } else {
              this._userTranscriptBuf = (this._userTranscriptBuf || '') + chunk;
            }
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              user_transcript: this._userTranscriptBuf.trim()
            });
          }

          // Multimodal Vision Injection: If user speech contains visual query keywords
          // and fresh visual frame (<15s) exists, inject inlineData visual turn context
          if (this.latestVisualFrame && (Date.now() - (this.latestVisualTimestamp || 0) < 15000) && !this._visualTurnInjected) {
            const userTextLower = this._userTranscriptBuf.toLowerCase();
            const visualKeywords = ['lihat', 'layar', 'kamera', 'baca', 'teks', 'tulisan', 'ini apa', 'apa ini', 'warna apa', 'gambar', 'screen', 'depan', 'tampilan'];
            if (visualKeywords.some(kw => userTextLower.includes(kw))) {
              this._visualTurnInjected = true;
              console.log(`[LIVE-VOICE] 👁️ Visual query detected: "${this._userTranscriptBuf.trim()}" -> Injecting turn visual context`);
              this._injectVisualContext(this.latestVisualFrame, this._userTranscriptBuf.trim());
            }
          }
        }

        // Accumulate assistant output transcript if provided
        if (msg.serverContent.outputTranscription?.text) {
          this.currentTurnAssistantText = (this.currentTurnAssistantText || '') + msg.serverContent.outputTranscription.text;
          this._sendToClient({
            type: 'CALL_STATUS_UPDATE',
            text: this.currentTurnAssistantText
          });
        }

        const parts = msg.serverContent.modelTurn?.parts || [];

        for (const p of parts) {
          // Audio chunk (PCM 24kHz Base64)
          if (p.inlineData && p.inlineData.data) {
            if (this._toolSafetyTimer) {
              clearTimeout(this._toolSafetyTimer);
              this._toolSafetyTimer = null;
            }
            if (!this.isAssistantSpeaking) {
              this._flushUserTurn();
              this.turnsCount = (this.turnsCount || 0) + 1;
              if (!this.hasLoggedFirstAudio) {
                this.hasLoggedFirstAudio = true;
                console.log(`[LIVE-VOICE] Audio response streaming from Gemini to client.`);
              }
            }
            const wasAssistantSpeaking = this.isAssistantSpeaking;
            this.isAssistantSpeaking = true;
            if (this._assistantSpeechDecayTimer) clearTimeout(this._assistantSpeechDecayTimer);
            this._assistantSpeechDecayTimer = setTimeout(() => {
              this.isAssistantSpeaking = false;
            }, 700);

            this.isGreetingPending   = false;
            this.isExecutingTool     = false;
            this.isWaitingToolReply  = false;
            this._sendToClient({
              type: 'CALL_AUDIO_PLAY',
              pcm_chunk: p.inlineData.data
            });
            // Update HUD to Mentransmisikan.. only on onset of speaking burst
            if (!wasAssistantSpeaking) {
              this._sendToClient({
                type: 'CALL_STATUS_UPDATE',
                status: 'SPEAKING'
              });
            }
          }
          // Text transcript from model parts (if returned by model)
          if (p.text && !(this.currentTurnAssistantText || '').includes(p.text)) {
            this.currentTurnAssistantText = (this.currentTurnAssistantText || '') + p.text;
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              text: this.currentTurnAssistantText
            });
          }
        }

        // If turnComplete is reached, finalize assistant turn text and reset to LISTENING
        if (msg.serverContent.turnComplete) {
          this._visualTurnInjected = false;
          this._flushUserTurn();
          if (this._assistantSpeechDecayTimer) {
            clearTimeout(this._assistantSpeechDecayTimer);
            this._assistantSpeechDecayTimer = null;
          }
          this.isAssistantSpeaking = false;
          const completeAssistantText = (this.currentTurnAssistantText || '').trim();
          if (completeAssistantText.length > 0) {
            console.log(`[LIVE-VOICE] N.E.X.A: "${completeAssistantText}"`);
            this.turnHistory.push({ role: 'assistant', text: completeAssistantText });
            supabaseMemories.saveChatMemory('nexa', completeAssistantText.slice(0, 800), 'live_call').catch(() => {});
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              text: completeAssistantText
            });
          } else if (this.isAssistantSpeaking) {
            this.turnHistory.push({ role: 'assistant', text: '(Respon suara N.E.X.A)' });
          }
          this.currentTurnAssistantText = '';

          // Gating logic: Do not revert to LISTENING if tool execution or post-tool speech synthesis is active
          if (this.isExecutingTool || hasToolCall) {
            console.log(`[LIVE-VOICE] turnComplete received while tool execution is active (isExecutingTool=${this.isExecutingTool}, hasToolCall=${hasToolCall}). Preserving PROCESSING status.`);
          } else if (!this.isEndingCall) {
            if (this._toolSafetyTimer) {
              clearTimeout(this._toolSafetyTimer);
              this._toolSafetyTimer = null;
            }
            this.isGreetingPending   = false;
            this.isExecutingTool     = false;
            this.isWaitingToolReply  = false;
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              status: 'LISTENING'
            });
          }
        }

        // If turnComplete is reached AND call is marked to end:
        if (msg.serverContent.turnComplete && this.isEndingCall) {
          console.log(`[LIVE-VOICE] Farewell speech turn completed. Signaling client to finish cleanly after audio playback.`);
          this._sendToClient({
            type: 'CALL_STATUS_UPDATE',
            status: 'DISCONNECTING'
          });
          this._sendToClient({ type: 'CALL_REPLY_COMPLETE' });

          // Clean up server session in background
          setTimeout(() => {
            if (this.isActive) {
              this.close();
            }
          }, 3000);
        }
      }

      // ── 3. Tool Calls (Function Execution — Parallel Batching) ──────────
      if (hasToolCall) {
        this.isExecutingTool = true;
        this.isWaitingToolReply = false;
        this._flushUserTurn();
        // Notify HUD that tools are executing (Memproses..)
        this._sendToClient({
          type: 'CALL_STATUS_UPDATE',
          status: 'PROCESSING'
        });

        const functionCalls = msg.toolCall.functionCalls;
        console.log(`[LIVE-VOICE] Processing ${functionCalls.length} tool call(s) in parallel...`);

        const responses = await Promise.all(
          functionCalls.map(async (fc) => {
            const callId   = fc.id;
            const funcName = fc.name;
            const funcArgs = fc.args || {};
            console.log(`[LIVE-VOICE] Executing: ${funcName} [${callId}]`);

            try {
              // Wrap with 8000ms safety timeout to prevent hanging tool from locking session
              const toolResult = await Promise.race([
                executeLiveTool(funcName, funcArgs),
                new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool '${funcName}' timed out after 8s`)), 8000))
              ]);

              return {
                id: callId,
                name: funcName,
                response: { output: toolResult }
              };
            } catch (err) {
              console.error(`[LIVE-TOOL] Execution error in ${funcName}:`, err.message);
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
          try {
            this.googleWs.send(JSON.stringify(toolResponsePayload));
            console.log(`[LIVE-VOICE] Sent ${responses.length} Tool Response(s) back to Google.`);
            this.isWaitingToolReply = true;
          } catch (sendErr) {
            console.error('[LIVE-VOICE] Failed to send tool response to Google:', sendErr.message);
            this.isExecutingTool = false;
            this.isWaitingToolReply = false;
            this._sendToClient({ type: 'CALL_STATUS_UPDATE', status: 'LISTENING' });
          }
        } else {
          console.warn('[LIVE-VOICE] Google WebSocket not open when sending tool response. Resetting executing tool state.');
          this.isExecutingTool = false;
          this.isWaitingToolReply = false;
          this._sendToClient({ type: 'CALL_STATUS_UPDATE', status: 'LISTENING' });
        }

        if (this._toolSafetyTimer) clearTimeout(this._toolSafetyTimer);
        // Tool gating safety release: after 10 seconds max, unblock mic and return to LISTENING if Google stays silent
        this._toolSafetyTimer = setTimeout(() => {
          if (this.isExecutingTool || this.isWaitingToolReply) {
            console.log('[LIVE-VOICE] Tool response timeout safety triggered (10s). Resetting to LISTENING.');
            this.isExecutingTool = false;
            this.isWaitingToolReply = false;
            this._sendToClient({
              type: 'CALL_STATUS_UPDATE',
              status: 'LISTENING'
            });
          }
        }, 10000);
      }

    } catch (err) {
      console.error(`[LIVE-VOICE] Error processing Google message:`, err.message);
    }
  }

  /**
   * Handle explicit barge-in or interrupt from client (Android or Windows Bridge).
   */
  handleClientInterrupt() {
    if (!this.isActive) return;
    if (this._toolSafetyTimer) {
      clearTimeout(this._toolSafetyTimer);
      this._toolSafetyTimer = null;
    }
    this.isAssistantSpeaking = false;
    this.isExecutingTool = false;
    this.isWaitingToolReply = false;
    this._flushUserTurn();
    if (this.currentTurnAssistantText && this.currentTurnAssistantText.trim()) {
      const interruptedText = this.currentTurnAssistantText.trim() + ' (terpotong ucapan Tuan)';
      this.turnHistory.push({ role: 'assistant', text: interruptedText });
    }
    this.currentTurnAssistantText = '';
    this._sendToClient({ type: 'CALL_AUDIO_INTERRUPTED' });
    this._sendToClient({
      type: 'CALL_STATUS_UPDATE',
      status: 'LISTENING'
    });
  }

  /**
   * Forward incoming audio chunk from Android mic directly to Google Live API
   * Google Gemini Multimodal Live API features native server-side neural VAD
   * for sub-second, full-duplex speech-to-speech interaction without artificial latency.
   * @param {string} pcmBase64 - Base64 encoded 16kHz 16-bit Mono PCM
   */
  handleIncomingClientAudio(pcmBase64) {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      this._droppedAudioCount = (this._droppedAudioCount || 0) + 1;
      if (this._droppedAudioCount === 1 || this._droppedAudioCount % 50 === 0) {
        console.warn(`[LIVE-VOICE] Audio chunk dropped (setupComplete=${this.isSetupComplete}, readyState=${this.googleWs ? this.googleWs.readyState : 'null'}, totalDropped=${this._droppedAudioCount})`);
      }
      return;
    }

    this.lastClientInputTime = Date.now();
    this.incomingAudioChunkCount = (this.incomingAudioChunkCount || 0) + 1;

    // Decode PCM buffer for energy (RMS) calculation
    let rms = 0;
    let pcmBuf = null;
    try {
      pcmBuf = Buffer.from(pcmBase64, 'base64');
      rms = this._calculatePcmRms(pcmBuf);
      this._lastUserAudioRms = rms;
      if (rms > 40) {
        this._lastVocalActivityTime = Date.now();
      }
    } catch (_) {}

    // Periodic stream heartbeat logging (every ~5s / 50 chunks)
    if (this.incomingAudioChunkCount === 1 || this.incomingAudioChunkCount % 50 === 0) {
      console.log(`[LIVE-VOICE] Audio stream active: ${this.incomingAudioChunkCount} chunks (RMS: ${rms.toFixed(0)})`);
    }

    // Release greeting pending on voice activity (normal speech RMS > 80)
    if (this.isGreetingPending && rms > 80) {
      this.isGreetingPending = false;
    }

    // Diagnostic audio dumper for acoustic and fidelity analysis
    if (this.debugPcmStream && pcmBuf) {
      try {
        this.debugPcmStream.write(pcmBuf);
        this.debugPcmBytesWritten += pcmBuf.length;
      } catch (_) {}
    }

    // Pure 1:1 unclipped 16kHz audio transmission to Google Gemini Multimodal Live API.
    // Destructive zero-gating has been eliminated to preserve consonants, unvoiced syllables, and natural speech.
    const audioDataToSend = pcmBase64;

    // Forward PCM directly to Google Gemini Multimodal Live API
    const realtimeMsg = {
      realtimeInput: {
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: audioDataToSend
        }
      }
    };

    try {
      if (this.googleWs && this.googleWs.readyState === WebSocket.OPEN) {
        this.googleWs.send(JSON.stringify(realtimeMsg));
      } else if (this.isActive && !this.isEndingCall && !this.isReconnecting) {
        console.warn('[LIVE-VOICE] Client audio streaming but Google WebSocket is not OPEN — triggering failover.');
        this._handleFailover(1006, 'Google WebSocket closed during audio stream');
      }
    } catch (err) {
      console.error('[LIVE-VOICE] Failed to forward audio to Google:', err.message);
    }
  }

  /**
   * Handle incoming text from user (STT result from Android)
   * Saves to turnHistory and nexa_chat_memories for cross-platform continuity
   * @param {string} text - Transcribed user speech
   */
  handleIncomingClientText(text) {
    if (!text || !text.trim()) return;
    noteUserTurn(text.trim());
    this.lastClientInputTime = Date.now();
    this.turnHistory.push({ role: 'user', text: text.trim() });
    // Async persist to nexa_chat_memories — never block audio
    supabaseMemories.saveChatMemory('user', text.trim().slice(0, 800), 'live_call').catch(() => {});
  }

  /**
   * Handle physical tactile touch / tap on OLED eyes or face from Android client.
   * Feeds sensory awareness or wake-up nudge directly into Gemini Multimodal Live API.
   * @param {Object} payload - { target: 'LEFT'|'RIGHT', tap_count: 1|2, hud_state: string }
   */
  handleIncomingTactileEvent(payload) {
    if (!this.isActive || !this.isSetupComplete || !this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const now = Date.now();
    const isDoubleTap = (payload.tap_count || 1) >= 2;

    // Debounce rapid tap spam:
    // Single tap: 1200ms debounce to prevent chat turn spam
    // Double tap (urgent wake-up / barge-in): 300ms debounce so it is never blocked by a preceding wink
    const minInterval = isDoubleTap ? 300 : 1200;
    if (this._lastTactileInjectionTime && now - this._lastTactileInjectionTime < minInterval) {
      return;
    }
    this._lastTactileInjectionTime = now;

    const targetEye = payload.target === 'LEFT' ? 'mata kiri' : 'mata kanan';

    console.log(`[LIVE-VOICE] Tactile touch sensed: target=${payload.target} (${targetEye}), tapCount=${payload.tap_count}, isSpeaking=${this.isAssistantSpeaking}`);

    // Case 1: Assistant is currently speaking & user double taps -> Haptic Barge-in
    if (this.isAssistantSpeaking && isDoubleTap) {
      console.log('[LIVE-VOICE] Haptic double-tap barge-in triggered.');
      if (this._toolSafetyTimer) {
        clearTimeout(this._toolSafetyTimer);
        this._toolSafetyTimer = null;
      }
      this.isAssistantSpeaking = false;
      this.isExecutingTool     = false;
      this.isWaitingToolReply  = false;
      this._flushUserTurn();
      if (this.currentTurnAssistantText && this.currentTurnAssistantText.trim()) {
        const interruptedText = this.currentTurnAssistantText.trim() + ' (terpotong ketukan)';
        this.turnHistory.push({ role: 'assistant', text: interruptedText });
      }
      this.currentTurnAssistantText = '';
      this._sendToClient({ type: 'CALL_AUDIO_INTERRUPTED' });
      this._sendToClient({
        type: 'CALL_STATUS_UPDATE',
        status: 'LISTENING'
      });

      const interruptInstruction = `[SENSOR TAKTIL]: Tuan Faqih mengetuk layarmu untuk memotong pembicaraan. Hentikan pembicaraan sebelumnya, dan tanyakan ada apa dengan singkat dan sigap (1 kalimat).`;
      try {
        this.googleWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: interruptInstruction }]
            }],
            turnComplete: true
          }
        }));
      } catch (err) {
        console.warn('[LIVE-VOICE] Tactile barge-in injection error:', err.message);
      }
      return;
    }

    // Case 2: Wake-Up Nudge (Double tap while idle, stuck, or slow)
    if (isDoubleTap) {
      if (this._toolSafetyTimer) {
        clearTimeout(this._toolSafetyTimer);
        this._toolSafetyTimer = null;
      }
      this.isAssistantSpeaking = false;
      this.isExecutingTool     = false;
      this.isWaitingToolReply  = false;

      const nudgeInstruction = `[SENSOR TAKTIL - WAKE UP NUDGE]: Tuan Faqih mengetuk layar/wajahmu berturut-turut untuk menyadarkanmu atau meminta perhatian segera. Bangun dari lamunan dan segera konfirmasi kesiapan Anda dengan sigap dan ramah bahwa Anda standby (1 kalimat pendek).`;
      try {
        this.googleWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: nudgeInstruction }]
            }],
            turnComplete: true
          }
        }));
      } catch (err) {
        console.warn('[LIVE-VOICE] Tactile wake-up injection error:', err.message);
      }
      return;
    }

    // Case 3: Single Tap (Playful / Casual touch on specific eye)
    // Only inject when assistant is not speaking, not executing tools, and not waiting for tool response
    if (!this.isAssistantSpeaking && !this.isExecutingTool && !this.isWaitingToolReply) {
      const casualInstruction = `[SENSOR TAKTIL]: Tuan Faqih baru saja menyentuh/mengetuk ${targetEye}mu di layar. Berikan respons natural, akrab, sedikit kaget/manja, atau lucu yang sangat singkat (maksimal 1 kalimat pendek).`;
      try {
        this.googleWs.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: 'user',
              parts: [{ text: casualInstruction }]
            }],
            turnComplete: true
          }
        }));
      } catch (err) {
        console.warn('[LIVE-VOICE] Tactile casual injection error:', err.message);
      }
    }
  }

  /**
   * Forward incoming video frame (JPEG base64) from Android camera / screen share to Google Live API.
   * Encapsulated as realtimeInput.video so Gemini processes visual context
   * alongside the ongoing audio stream — enabling true multimodal understanding.
   * @param {string} jpegBase64 - Base64-encoded JPEG frame captured from Android camera or screen
   */
  handleIncomingClientVideoFrame(jpegBase64) {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN || !this.isSetupComplete) {
      return;
    }

    this.lastClientInputTime = Date.now();
    if (!jpegBase64 || typeof jpegBase64 !== 'string') return;

    // Cache latest visual frame for turn-associated injection and freshness checks
    this.latestVisualFrame = jpegBase64;
    this.latestVisualTimestamp = Date.now();
    this.videoFramesReceived = (this.videoFramesReceived || 0) + 1;

    if (this.videoFramesReceived % 5 === 1) {
      console.log(`[LIVE-VOICE] 📹 Video frame stream active: #${this.videoFramesReceived} (~${Math.round(jpegBase64.length / 1024)} KB)`);
    }

    // Google Gemini Multimodal Live API format (media_chunks deprecated, video required)
    const frameMsg = {
      realtimeInput: {
        video: {
          mimeType: 'image/jpeg',
          data: jpegBase64
        }
      }
    };

    try {
      this.googleWs.send(JSON.stringify(frameMsg));
    } catch (err) {
      console.error(`[LIVE-VOICE] Failed to forward video frame to Google:`, err.message);
    }
  }

  /**
   * Inject high-priority visual turn context into active session when user verbally queries vision
   * @param {string} jpegBase64
   * @param {string} queryText
   */
  _injectVisualContext(jpegBase64, queryText) {
    if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) return;
    const payload = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: jpegBase64 } },
            { text: `[Konteks Visual Pengguna]: ${queryText}` }
          ]
        }],
        turnComplete: false
      }
    };
    try {
      this.googleWs.send(JSON.stringify(payload));
      console.log(`[LIVE-VOICE] ✅ Dispatched visual turn context to Gemini (${Math.round(jpegBase64.length / 1024)} KB)`);
    } catch (err) {
      console.warn(`[LIVE-VOICE] Visual context injection warning:`, err.message);
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
   * Rotates API keys and falls back to Tier 2 Marathon model after key exhaustion
   */
  async _handleFailover(code, reason) {
    if (!this.isActive) return;

    this.reconnectAttempts++;
    console.warn(`[LIVE-VOICE] Failover triggered (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}): Code ${code} — ${reason}`);

    this._sendToClient({
      type: 'CALL_STATUS_UPDATE',
      status: 'RECONNECTING'
    });

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % (GOOGLE_KEYS.length || 1);

      if (this.reconnectAttempts >= 3 && this.currentModel === LIVE_MODELS.TIER_1_SPEED) {
        console.log(`[LIVE-VOICE] Switching to Tier 2 Marathon: ${LIVE_MODELS.TIER_2_MARATHON}`);
        this.currentModel = LIVE_MODELS.TIER_2_MARATHON;
      }

      console.log(`[LIVE-VOICE] Reconnecting with Key Index ${this.currentKeyIndex}...`);
      await new Promise(r => setTimeout(r, 600));
      await this._connectGoogleWs();
    } else {
      console.error(`[LIVE-VOICE] All failover tiers exhausted.`);
      this._sendToClient({
        type: 'CALL_ERROR',
        message: 'Koneksi suara live mengalami gangguan.'
      });
      this.close();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BUG 3 FIX: Keepalive Heartbeat — prevent Google idle timeout
  // Sends a 100ms silence frame (3200 zero bytes @16kHz) only when client is truly idle
  // ──────────────────────────────────────────────────────────────────────────
  _startKeepalive() {
    if (this.keepaliveInterval) clearInterval(this.keepaliveInterval);
    // 3200 zero bytes = 100ms of silence at 16kHz 16-bit mono PCM
    const silenceBase64 = Buffer.alloc(3200, 0).toString('base64');
    this.keepaliveInterval = setInterval(() => {
      if (!this.isActive || !this.isSetupComplete) return;
      if (!this.googleWs || this.googleWs.readyState !== WebSocket.OPEN) return;

      // Only inject silence keepalive if client has been truly idle (no audio/video) for >= 4500ms
      const idleTime = Date.now() - this.lastClientInputTime;
      if (idleTime < 4500) {
        return; // Session is actively streaming audio or video — skip keepalive injection
      }

      try {
        this.googleWs.send(JSON.stringify({
          realtimeInput: {
            audio: {
              mimeType: 'audio/pcm;rate=16000',
              data: silenceBase64
            }
          }
        }));
      } catch (err) {
        console.warn(`[LIVE-VOICE] Keepalive send warning:`, err.message);
      }
    }, 5000);
    console.log(`[LIVE-VOICE] Conditional keepalive heartbeat started (5s interval, idle threshold: 4.5s).`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BUG 4 FIX: Server-Side Watchdog — detect and recover stuck sessions
  // Checks every 15s; triggers failover only when reply is stuck or connection is dead
  // ──────────────────────────────────────────────────────────────────────────
  _startServerWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      if (!this.isActive) return;
      const googleSilentMs = Date.now() - this.lastActivityTime;
      const clientSilentMs = Date.now() - this.lastClientInputTime;

      // Condition A: User vocal activity was recently detected (RMS > 40 speech, not ambient mic stream)
      // and Google failed to respond for > 30s after the user spoke -> stuck generation!
      const userSpokeRecently = Boolean(this._lastVocalActivityTime && (Date.now() - this._lastVocalActivityTime < 35000));
      const userSpokeAfterGoogle = Boolean(this._lastVocalActivityTime && (this._lastVocalActivityTime > this.lastActivityTime));
      if (userSpokeRecently && userSpokeAfterGoogle && googleSilentMs > 30000) {
        console.warn(`[LIVE-VOICE] Watchdog: User spoke recently (${Math.round((Date.now() - this._lastVocalActivityTime) / 1000)}s ago) but Google silent for ${Math.round(googleSilentMs / 1000)}s - triggering failover.`);
        this._handleFailover(1006, 'Google silent timeout');
        return;
      }

      // Condition B: Total session silence (both Google and client silent > 60s) -> close abandoned session cleanly
      // (NEVER trigger failover reconnect loop when client is idle or muted)
      if (googleSilentMs > 60000 && clientSilentMs > 60000) {
        console.warn(`[LIVE-VOICE] Watchdog: Total session silence for >60s — closing idle live session cleanly.`);
        this.close().catch(err => console.warn('[LIVE-VOICE] Error closing idle session:', err.message));
        return;
      }

      // Condition C: Client socket is disconnected / not open and silent for > 25s
      if ((!this.clientWs || this.clientWs.readyState !== WebSocket.OPEN) && clientSilentMs > 25000) {
        console.warn(`[LIVE-VOICE] Watchdog: Client socket disconnected and silent for >25s — closing live session.`);
        this.close().catch(err => console.warn('[LIVE-VOICE] Error closing disconnected session:', err.message));
        return;
      }
    }, 15000);
    console.log(`[LIVE-VOICE] Server watchdog started (check: 15s, stuck threshold: 30s).`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CLOSE SESSION — Persist memory & run End-of-Call Passive Learning
  // ──────────────────────────────────────────────────────────────────────────
  async close() {
    if (this.isClosed) return;
    this.isClosed = true;
    this.isActive = false;
    const durationSec = Math.round((Date.now() - this.sessionStartTime) / 1000);
    console.log(`[LIVE-VOICE] Closing Live Session [${this.sessionId}] | Duration: ${durationSec}s | Turns: ${this.turnHistory.length}`);

    // Clear keepalive, watchdog, and tool safety intervals on close
    if (this.keepaliveInterval) { clearInterval(this.keepaliveInterval); this.keepaliveInterval = null; }
    if (this.watchdogInterval)  { clearInterval(this.watchdogInterval);  this.watchdogInterval  = null; }
    if (this._toolSafetyTimer)  { clearTimeout(this._toolSafetyTimer);   this._toolSafetyTimer  = null; }
    if (this._assistantSpeechDecayTimer) { clearTimeout(this._assistantSpeechDecayTimer); this._assistantSpeechDecayTimer = null; }

    if (this.googleWs) {
      try { this.googleWs.close(1000, 'Session Closed'); } catch (_) {}
      this.googleWs = null;
    }

    // Close and flush diagnostic PCM recording stream
    if (this.debugPcmStream) {
      try {
        this.debugPcmStream.end();
        console.log(`[LIVE-VOICE] Diagnostic PCM captured: ${this.debugPcmPath} (${this.debugPcmBytesWritten || 0} bytes)`);
      } catch (_) {}
      this.debugPcmStream = null;
    }

    // Unregister from active sessions Map to prevent memory leaks
    activeSessions.delete(this.sessionId);

    // Flush any pending user speech transcript
    this._flushUserTurn();

    if (this.turnHistory.length === 0) {
      console.log(`[LIVE-VOICE] No turns to process. Skipping end-of-call pipeline.`);
      return;
    }

    // ── A. Persist Conversation Transcript to Chat Memories (Not User Profile) ──
    try {
      const summaryText = this.turnHistory.map(t => `${t.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${t.text}`).join('\n');
      await supabaseMemories.saveChatMemory(
        'system',
        `[ARSIP PANGGILAN SUARA LIVE NEXA — ${durationSec} DETIK]\n${summaryText}`,
        'live_call'
      );
      console.log(`[LIVE-VOICE] Call transcript archived to nexa_chat_memories (${durationSec}s, ${this.turnHistory.length} turns).`);
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
   * [STAGE 1] AI Transcript Alignment & Denoising
   * Cleans ASR noise, strips foreign noise artifacts, and aligns phonetic slips (>70% confidence).
   * Conservative anti-hallucination design: never invents facts, leaves ambiguous words untouched.
   */
  async _alignAndDenoiseTranscript(rawTurns) {
    if (!rawTurns || rawTurns.length === 0) return '';

    // Step A: Fast deterministic clean-up
    const cleanedTurns = rawTurns.map(t => {
      let txt = (t.text || '').trim();
      txt = txt.replace(/[\u00BF\u00A1]/g, '').trim();
      return { role: t.role, text: txt };
    }).filter(t => t.text.length > 0);

    const rawDialogueText = cleanedTurns
      .map(t => `${t.role === 'user' ? 'Tuan Faqih' : 'N.E.X.A'}: ${t.text}`)
      .join('\n');

    // If dialogue is very short (< 4 turns), bypass LLM alignment pass
    if (cleanedTurns.length < 4) {
      return rawDialogueText;
    }

    try {
      const alignmentPrompt = `Berikut adalah transkrip mentah dari rekaman panggilan suara real-time antara Tuan Faqih (pengguna) dan N.E.X.A (asisten AI).
Karena suara Tuan Faqih ditangkap melalui modul speech-to-text otomatis (ASR), terkadang ada salah dengar fonetik, kata janggal, atau karakter asing (seperti huruf Mandarin, Korea, atau fonem aneh) akibat derau mikrofon.

${rawDialogueText.slice(0, 18000)}

TUGAS ANDA:
Luruskan dan bersihkan transkrip di atas agar menjadi transkrip percakapan yang wajar dan akurat.

ATURAN ANTI-HALUSINASI KETAT (CONFIDENCE > 70%):
1. HANYA perbaiki salah dengar ucapan Tuan Faqih jika konteks dari jawaban N.E.X.A atau kalimat di sekitarnya membuktikan dengan keyakinan tinggi (>70%) apa kata aslinya.
   Contoh: Tuan Faqih berkata "house" dan N.E.X.A menjawab "Wah, kalau haus minum air", maka perbaiki kata Tuan Faqih menjadi "haus".
2. JANGAN PERNAH mengarang informasi, nama, angka, atau topik baru yang tidak ada pada kalimat asli.
3. Jika ada baris yang murni derau karakter asing non-Indonesia (seperti karakter Mandarin/Korea acak yang tidak berhubungan dengan isi obrolan), tandai baris tersebut dengan "[derau suara diabaikan]" atau hapus baris derau tersebut.
4. Jika Tuan Faqih sedang membahas bahasa tertentu (misal huruf Arab), pertahankan teks tersebut apa adanya.
5. Jika ragu atau tidak yakin 70%, BIARKAN kalimat apa adanya, jangan ditebak-tebak.
6. Pertahankan seluruh jawaban N.E.X.A apa adanya.

Keluarkan HANYA transkrip hasil perbaikan dengan format:
Tuan Faqih: [teks]
N.E.X.A: [teks]`;

      const alignedOutput = await callAI(alignmentPrompt);
      if (alignedOutput && alignedOutput.length > 50 && !alignedOutput.toLowerCase().includes('maaf, saya tidak dapat')) {
        console.log(`[LIVE-VOICE] Transcript AI Alignment complete (${alignedOutput.length} chars).`);
        return alignedOutput.trim();
      }
    } catch (alignErr) {
      console.warn(`[LIVE-VOICE] Transcript AI Alignment fallback to raw:`, alignErr.message);
    }

    return rawDialogueText;
  }

  /**
   * [END-OF-CALL PIPELINE] Passive Learning & Self-Model Update
   * Runs after call close — zero latency impact on voice session
   */
  async _runPassiveLearningPipeline(durationSec) {
    if (!this.turnHistory || this.turnHistory.length === 0) return;

    // Filter substantive user turns (require at least 3 real user turns to prevent noise-driven extraction)
    const substantiveUserTurns = this.turnHistory.filter(t =>
      t.role === 'user' &&
      t.text &&
      t.text.trim().length > 5 &&
      !t.text.includes('panggilan telepon baru saja terhubung')
    );

    if (substantiveUserTurns.length < 3) {
      console.log(`[LIVE-VOICE] Passive Learning skipped: only ${substantiveUserTurns.length} substantive user turn(s), minimum 3 required.`);
      return;
    }

    console.log(`[LIVE-VOICE] Starting End-of-Call Passive Learning Pipeline (${this.turnHistory.length} turns, ${substantiveUserTurns.length} user turns, ${durationSec}s)...`);

    // Stage 1: AI Transcript Alignment & Denoising (Anti-Hallucination, >70% Confidence)
    const conversationText = await this._alignAndDenoiseTranscript(this.turnHistory);

    const REFUSAL_REGEX = /maaf|transkrip|percakapan|kosong|sepertinya|tidak ada|tidak ditemukan|tidak terdapat|tidak ada instruksi|tidak ada aturan|berdasarkan transkrip/i;

    // Helper to robustly parse extracted facts across JSON array, single string, or bullet list
    const parseLearnedFacts = (rawOutput) => {
      if (!rawOutput) return [];
      const cleanStr = String(rawOutput || '').trim().replace(/^```json|```$/gi, '').trim();
      if (!cleanStr || cleanStr.length < 5 || cleanStr === '[]' || cleanStr.toLowerCase() === 'none') return [];
      if (REFUSAL_REGEX.test(cleanStr) && !cleanStr.startsWith('[')) return [];

      // 1. Try JSON Array parsing
      try {
        const firstBracket = cleanStr.indexOf('[');
        const lastBracket  = cleanStr.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          const parsed = JSON.parse(cleanStr.substring(firstBracket, lastBracket + 1));
          if (Array.isArray(parsed)) {
            return parsed
              .map(s => String(s || '').trim().replace(/^[-*•0-9.)\s]+/, ''))
              .filter(s => s.length > 5 && !REFUSAL_REGEX.test(s));
          }
        }
      } catch (_) {}

      // 2. If multi-line output, paragraph chunks, or bullet list
      if (cleanStr.includes('\n')) {
        const chunks = cleanStr.includes('\n\n')
          ? cleanStr.split(/\n\s*\n/)
          : cleanStr.split('\n');
        return chunks
          .map(l => l.replace(/^[-*•0-9.)\s]+/, '').trim())
          .filter(l => l.length > 8 && !REFUSAL_REGEX.test(l) && !l.startsWith('[') && !l.startsWith('{'));
      }

      if (cleanStr.length > 8 && !REFUSAL_REGEX.test(cleanStr)) {
        return [cleanStr];
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
        console.log(`[LIVE-VOICE] Passive Learning: ${userFacts.length} user facts detected. Saving via Supersede Engine...`);
        for (const fact of userFacts) {
          if (typeof fact === 'string' && fact.trim().length > 5) {
            await deduplicateAndSaveFact(fact.trim(), 'USER_PROFILE').catch(() => {});
          }
        }
        // Invalidate RAM cache so next chat session immediately reflects new facts
        invalidatePersonalFactsCache();
        console.log(`[LIVE-VOICE] User facts saved. Cache invalidated.`);
      } else {
        console.log(`[LIVE-VOICE] No new user facts detected in this call.`);
      }
    } catch (err) {
      console.warn(`[LIVE-VOICE] User fact extraction error:`, err.message);
    }

    // ── B2. Extract learned_core_identities about N.E.X.A ───────────────
    // Guard: Only extract CORE_IDENTITY if user explicitly gave directives
    // This prevents casual conversation or ASR hallucinations from poisoning identity rules
    const DIRECTIVE_KEYWORDS_RE = /\b(harus|wajib|dilarang|jangan|aturan|mulai sekarang|mulai dari sekarang|ingat ya|catat ya|peraturan)\b/i;
    const userTurnTexts = this.turnHistory
      .filter(t => t.role === 'user' && t.text)
      .map(t => t.text)
      .join(' ');
    const hasExplicitDirective = DIRECTIVE_KEYWORDS_RE.test(userTurnTexts) || DIRECTIVE_KEYWORDS_RE.test(conversationText);

    if (!hasExplicitDirective) {
      console.log(`[LIVE-VOICE] CORE_IDENTITY extraction skipped: no explicit directive keywords found in user turns.`);
    } else {
      try {
        const coreIdPrompt = `Berikut adalah transkrip percakapan telepon suara:

${conversationText}

TUGAS: Ekstrak instruksi, koreksi, atau aturan baru yang Tuan Faqih berikan kepada N.E.X.A (sistem AI) dalam percakapan ini.
Fokus pada: cara N.E.X.A harus berperilaku, format respons, batasan, kemampuan yang disebutkan, atau koreksi atas respons N.E.X.A.
ABAIKAN percakapan biasa yang tidak berisi instruksi untuk N.E.X.A.
ABAIKAN jika instruksi berasal dari konteks yang ambigu atau tidak jelas.

Balas HANYA dengan JSON array string. Contoh:
["Saat di telepon, N.E.X.A harus berbicara lebih singkat", "N.E.X.A sudah bisa mencatat keuangan via suara telepon"]
Jika tidak ada, balas dengan: []`;

        const coreIdRaw = await callAI(coreIdPrompt);
        const coreIds = parseLearnedFacts(coreIdRaw);

        if (coreIds.length > 0) {
          // Double-check: each extracted fact must itself contain a directive-like keyword
          const validCoreIds = coreIds.filter(fact =>
            DIRECTIVE_KEYWORDS_RE.test(fact) || /\b(N\.?E\.?X\.?A|nexa)\b/i.test(fact)
          );
          if (validCoreIds.length > 0) {
            console.log(`[LIVE-VOICE] Passive Learning: ${validCoreIds.length}/${coreIds.length} N.E.X.A identity facts passed validation. Saving...`);
            for (const fact of validCoreIds) {
              if (typeof fact === 'string' && fact.trim().length > 5) {
                await deduplicateAndSaveFact(fact.trim(), 'CORE_IDENTITY').catch(() => {});
              }
            }
            console.log(`[LIVE-VOICE] Core identity facts saved.`);
          } else {
            console.log(`[LIVE-VOICE] CORE_IDENTITY extraction: ${coreIds.length} candidates found but none passed directive keyword validation. Skipping save.`);
          }
        }
      } catch (err) {
        console.warn(`[LIVE-VOICE] Core identity extraction error:`, err.message);
      }
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
        console.log(`[LIVE-VOICE] Self-model reflection saved in COMMUNICATION_STYLE: ${cleanReflection.substring(0, 80)}...`);
      }
    } catch (err) {
      console.warn(`[LIVE-VOICE] Self-model update error:`, err.message);
    }

    console.log(`[LIVE-VOICE] End-of-Call Passive Learning Pipeline complete.`);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SESSION MANAGER — Active Sessions Map: sessionId → LiveVoiceSession
// ────────────────────────────────────────────────────────────────────────────
const activeSessions = new Map();
const disconnectTimers = new Map(); // sessionId -> timeoutId

function startLiveSession(sessionId, clientWs) {
  // Cancel any pending endCall fallback timer
  cancelEndCallSafetyTimer();

  // Cancel any pending disconnect timer for this session
  if (disconnectTimers.has(sessionId)) {
    clearTimeout(disconnectTimers.get(sessionId));
    disconnectTimers.delete(sessionId);
  }

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
  // Single active session fallback: If bridge socket reference changed or reconnected
  if (activeSessions.size === 1) {
    const onlySession = activeSessions.values().next().value;
    if (onlySession && onlySession.isActive) {
      if (clientWs && onlySession.clientWs !== clientWs) {
        // Prevent cross-device hijacking (e.g. mobile session hijacked by desktop or vice-versa)
        if (onlySession.clientWs && onlySession.clientWs.deviceType && clientWs.deviceType) {
          if (onlySession.clientWs.deviceType !== clientWs.deviceType) {
            return null;
          }
        }
        console.log(`[LIVE-VOICE] Updating clientWs reference for active session [${onlySession.sessionId}]`);
        rebindClientWs(clientWs);
      }
      return onlySession;
    }
  }
  return null;
}

function handleClientDisconnect(clientWs, gracePeriodMs = 15000) {
  for (const session of activeSessions.values()) {
    if (session.clientWs === clientWs && session.isActive) {
      const sid = session.sessionId;
      console.log(`[LIVE-VOICE] Client disconnected for session [${sid}]. Starting ${gracePeriodMs / 1000}s grace period.`);
      if (disconnectTimers.has(sid)) {
        clearTimeout(disconnectTimers.get(sid));
      }
      const timer = setTimeout(() => {
        disconnectTimers.delete(sid);
        if (session.isActive) {
          console.log(`[LIVE-VOICE] Grace period expired for session [${sid}]. Closing session.`);
          session.close();
          activeSessions.delete(sid);
        }
      }, gracePeriodMs);
      disconnectTimers.set(sid, timer);
    }
  }
}

function rebindClientWs(newClientWs) {
  for (const session of activeSessions.values()) {
    if (session.isActive) {
      // Guard: Do not rebind session across different device types (e.g. mobile session hijacked by desktop)
      if (session.clientWs && session.clientWs.deviceType && newClientWs.deviceType) {
        if (session.clientWs.deviceType !== newClientWs.deviceType) {
          continue;
        }
      }
      const sid = session.sessionId;
      if (disconnectTimers.has(sid)) {
        clearTimeout(disconnectTimers.get(sid));
        disconnectTimers.delete(sid);
        console.log(`[LIVE-VOICE] Client reconnected during grace period. Re-bound session [${sid}] to new ${newClientWs.deviceType || 'client'} socket.`);
      }
      session.clientWs = newClientWs;
    }
  }
}

function closeLiveSession(sessionId) {
  if (disconnectTimers.has(sessionId)) {
    clearTimeout(disconnectTimers.get(sessionId));
    disconnectTimers.delete(sessionId);
  }
  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.close();
    activeSessions.delete(sessionId);
  }
}

function markEndingCall() {
  console.log('[LIVE-VOICE] Marking active live sessions to end after current speech turn finishes...');
  for (const session of activeSessions.values()) {
    session.isEndingCall = true;
  }
}

function closeAllLiveSessions() {
  console.log(`[LIVE-VOICE] Closing all active live voice sessions (${activeSessions.size} active)...`);
  for (const timer of disconnectTimers.values()) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
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
  markEndingCall,
  handleClientDisconnect,
  rebindClientWs
};


