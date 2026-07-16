// ============================================================
// N.E.X.A — WHATSAPP ADAPTER (Pintu 2 — Baileys Socket Engine)
// Menangani koneksi socket WhatsApp 24/7 via @whiskeysockets/baileys,
// reconnection otomatis, status composing/typing, normalisasi pesan
// menjadi UniversalMessage, dan delegasi ke otak AI N.E.X.A.
//
// ARSITEKTUR:
//   HP WhatsApp → Baileys WebSocket → whatsappIdentityLock → UniversalMessage
//   → routeUserMessage(AI_Router) → sendWhatsAppOutbound
//
// KEAMANAN:
//   Setiap pesan diverifikasi oleh whatsappIdentityLock sebelum diproses.
//   Hanya nomor milik Tuan Faqih (env.WHATSAPP_OWNER_JID / WHATSAPP_OWNER_NUMBER)
//   yang diizinkan memicu pemrosesan AI.
//
// PERSISTENT AUTH:
//   Sesi login QR disimpan ke Supabase (nexa_wa_sessions) via useSupabaseAuthState
//   sehingga N.E.X.A tidak perlu scan QR ulang setelah server restart/redeploy.
// ============================================================
'use strict';

const env = require('../../config/env');
const security = require('../../utils/security');
const { formatNexaToWhatsApp, formatWhatsAppToNexa } = require('./formatter');
const { useSupabaseAuthState, clearSupabaseAuthState } = require('./auth_storage');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');

// ── Global State ──────────────────────────────────────────────────────────────
let sock = null;          // Active Baileys socket instance
let isConnected = false;  // Current connection state
let isConnecting = false; // Mutex lock prevent socket thrashing
let reconnectTimer = null; // Debounce handle untuk reconnect

const RECONNECT_DELAY_MS = 5000;   // 5 detik jeda sebelum reconnect
const MAX_RECONNECT_DELAY_MS = 60000; // Batas atas backoff: 1 menit
let _reconnectAttempts = 0;

// ── QR Code sender reference (di-set dari Fase 4 coupling) ───────────────────
// Fungsi ini akan diisi oleh sendTelegramOutbound saat app boot
let _sendQrToTelegram = null;

/**
 * Daftarkan fungsi pengiriman QR ke Telegram untuk coupling Fase 4.
 * Dipanggil dari app.js setelah Telegram adapter siap.
 * @param {Function} fn - Fungsi async (base64ImageOrText) => void
 */
function setQrDeliveryFn(fn) {
  _sendQrToTelegram = fn;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ekstrak teks bersih dari berbagai jenis pesan WhatsApp (text, extended, list reply, etc.)
 * @param {Object} msg - Baileys message object
 * @returns {string}
 */
function _extractMessageText(msg) {
  const m = msg.message;
  if (!m) return '';

  // Handle disappearing messages (ephemeral / viewOnce)
  const actualMessage = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m;

  return (
    actualMessage.conversation ||
    actualMessage.extendedTextMessage?.text ||
    actualMessage.imageMessage?.caption ||
    actualMessage.videoMessage?.caption ||
    actualMessage.documentMessage?.caption ||
    actualMessage.buttonsResponseMessage?.selectedDisplayText ||
    actualMessage.listResponseMessage?.title ||
    actualMessage.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

/**
 * Tentukan apakah sebuah pesan sebaiknya diabaikan (key from own device, broadcast, dll.)
 * @param {Object} msg - Baileys message object
 * @returns {boolean} True jika pesan harus diabaikan
 */
function _shouldIgnoreMessage(msg) {
  if (!msg.message) return true;
  if (msg.key.fromMe) return true; // Pesan dari N.E.X.A sendiri — abaikan
  const jid = msg.key.remoteJid || '';
  if (jid.includes('@broadcast')) return true;  // Status broadcast
  if (jid.endsWith('@g.us')) return true;        // Pesan grup — abaikan
  return false;
}

// ── Core Engine ───────────────────────────────────────────────────────────────

/**
 * Memulai koneksi WebSocket WhatsApp menggunakan Baileys.
 * Dilengkapi dengan reconnection logic eksponensial, QR delivery ke Telegram,
 * dan integrasi ke otak AI N.E.X.A via routeUserMessage.
 *
 * @param {Object} [opts={}] - Opsi opsional
 * @param {boolean} [opts.forceNewSession=false] - Paksa mulai sesi baru (hapus creds lama)
 */
async function startWhatsAppSocket(opts = {}) {
  if (isConnecting) {
    console.log('[WHATSAPP] Socket sedang dalam proses koneksi, abaikan permintaan duplikat.');
    return;
  }
  isConnecting = true;

  // Lazy require Baileys agar server tetap boot meski paket belum terinstall
  let makeWASocket, DisconnectReason, fetchLatestBaileysVersion, Browsers;
  try {
    const baileys = require('@whiskeysockets/baileys');
    makeWASocket = baileys.makeWASocket;
    DisconnectReason = baileys.DisconnectReason;
    fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
    Browsers = baileys.Browsers;
  } catch (err) {
    console.error('[WHATSAPP] @whiskeysockets/baileys belum terinstall:', err.message);
    isConnecting = false;
    return;
  }

  // Pastikan hanya ada satu socket aktif pada satu waktu
  if (sock) {
    try { sock.end(); } catch (_) {}
    sock = null;
  }

  console.log('[WHATSAPP] 🚀 Memulai koneksi socket Pintu 2 (Baileys)...');

  // Ambil versi WhatsApp Web terbaru agar tidak terkena banned
  let version;
  try {
    const latestVersion = await fetchLatestBaileysVersion();
    version = latestVersion.version;
    console.log(`[WHATSAPP] Menggunakan WhatsApp Web versi: ${version.join('.')}`);
  } catch (err) {
    version = [2, 3000, 1019000820]; // Fallback version yang diketahui stabil
    console.warn('[WHATSAPP] Gagal fetch versi terbaru, menggunakan fallback:', version.join('.'));
  }

  // Jika forceNewSession=true, bersihkan kredensial lama di Supabase dulu
  if (opts.forceNewSession) {
    console.log('[WHATSAPP] 🧹 forceNewSession=true -> Membersihkan sesi lama di Supabase sebelum boot...');
    await clearSupabaseAuthState('nexa_wa_main');
  }

  // Muat sesi persisten dari Supabase
  const { state, saveCreds } = await useSupabaseAuthState('nexa_wa_main');

  // Buat socket Baileys
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,  // Tetap print ke terminal sebagai backup debugging
    browser: Browsers ? Browsers.macOS('Desktop') : ['Mac OS', 'Desktop', '14.4.1'],
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 10000,
    markOnlineOnConnect: false,   // Hemat baterai HP sekunder
    syncFullHistory: false,       // Tidak perlu sinkron riwayat lama
    generateHighQualityLinkPreview: false,
    getMessage: async () => ({ conversation: '' }), // Hindari error saat pesan lama diminta ulang
    options: {
      origin: 'https://web.whatsapp.com',
      headers: {
        'Origin': 'https://web.whatsapp.com',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://web.whatsapp.com/',
        'Host': 'web.whatsapp.com'
      }
    }
  });

  // ── Event: Simpan kredensial sesi setiap kali berubah ────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Event: Status koneksi (connected / disconnected / QR) ─────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan dan kirim QR Code saat perlu scan ulang
    if (qr) {
      console.log('[WHATSAPP] 📱 QR Code siap! Silakan scan dari HP sekunder Tuan Faqih.');
      await _deliverQrCode(qr);
    }

    if (connection === 'open') {
      isConnected = true;
      isConnecting = false;
      _reconnectAttempts = 0;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      console.log('[WHATSAPP] ✅ Pintu 2 WhatsApp TERHUBUNG dan aktif!');

      // Kirim notifikasi ke Telegram bahwa WhatsApp sudah online
      _notifyTelegramStatus('✅ *Pintu 2 WhatsApp AKTIF* — N.E.X.A kini bisa menerima pesan dari WhatsApp nomor sekunder Tuan Faqih.');
    }

    if (connection === 'close') {
      isConnected = false;
      isConnecting = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      console.warn(`[WHATSAPP] ⚠️ Koneksi terputus (code: ${statusCode || 'unknown'}, loggedOut: ${loggedOut})`);

      if (loggedOut) {
        // Sesi tidak valid — butuh scan QR ulang, tidak bisa reconnect otomatis
        console.error('[WHATSAPP] ❌ Sesi WhatsApp telah di-logout. Scan QR ulang diperlukan.');
        _notifyTelegramStatus('⚠️ *Pintu 2 WhatsApp di-logout.* Sesi habis — N.E.X.A perlu di-restart untuk scan QR ulang, Tuan Faqih.');
        sock = null;
        return;
      }

      // Reconnect dengan exponential backoff
      _scheduleReconnect();
    }
  });

  // ── Event: Pesan Masuk ────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Abaikan pesan yang tidak relevan
      if (_shouldIgnoreMessage(msg)) continue;

      // 1. ── Benteng Identitas (Security Guard) ─────────────────────────────
      if (!security.whatsappIdentityLock(msg)) {
        const blockedJid = msg.key?.remoteJid || 'UNKNOWN';
        console.warn(`[WHATSAPP-SECURITY] Pesan dari nomor tidak diizinkan diabaikan: ${blockedJid}`);
        continue;
      }

      const remoteJid = msg.key.remoteJid;
      const rawText = _extractMessageText(msg);
      const cleanInput = formatWhatsAppToNexa(rawText);

      if (!cleanInput) {
        // Mungkin media tanpa caption, atau pesan sistem — abaikan
        console.log(`[WHATSAPP] Pesan tanpa teks diterima dari ${remoteJid}, diabaikan.`);
        continue;
      }

      console.log(`[WHATSAPP] 📩 Pesan masuk dari ${remoteJid}: "${cleanInput.substring(0, 80)}..."`);

      // 2. ── Indikator "Mengetik..." (Composing State) ──────────────────────
      try {
        await sock.sendPresenceUpdate('composing', remoteJid);
      } catch (_) {}

      // 3. ── Simpan Memori Masuk (Unified Consciousness) ────────────────────
      await supabaseMemories.saveChatMemory('user', cleanInput, 'whatsapp').catch(() => {});

      // 4. ── Standarisasi UniversalMessage ──────────────────────────────────
      const universalMessage = {
        text: cleanInput,
        senderId: remoteJid,
        platform: 'whatsapp',
        rawPayload: msg,
        reply: async (replyText) => sendWhatsAppOutbound(replyText, remoteJid, false, 'whatsapp')
      };

      // 5. ── Delegasi ke Otak AI N.E.X.A (AI_Router) ───────────────────────
      try {
        const aiRouter = require('../../core/AI_Router');
        const aiReply = await aiRouter.routeUserMessage(universalMessage.text, {
          platform: 'whatsapp',
          senderId: remoteJid,
          replyFn: universalMessage.reply
        });

        // Jika AI_Router mengembalikan teks langsung, kirim via outbound
        if (aiReply && typeof aiReply === 'string' && aiReply.trim()) {
          await universalMessage.reply(aiReply);
        }
      } catch (err) {
        console.error('[WHATSAPP-ADAPTER] Error saat memproses pesan di AI Router:', err.message);
        try {
          await universalMessage.reply('⚠️ Maaf Tuan, terjadi gangguan teknis saat memproses pesan WhatsApp. Coba ulangi dalam beberapa detik.');
        } catch (replyErr) {
          console.error('[WHATSAPP-ADAPTER] Gagal mengirim pesan fallback:', replyErr.message);
        }
      } finally {
        // Kembalikan status ke 'available' setelah selesai membalas
        try {
          await sock.sendPresenceUpdate('available', remoteJid);
        } catch (_) {}
      }
    }
  });
}

// ── Reconnection ──────────────────────────────────────────────────────────────

/**
 * Menjadwalkan reconnect dengan exponential backoff agar tidak flood server.
 */
function _scheduleReconnect() {
  if (reconnectTimer) return; // Sudah ada reconnect yang terjadwal

  _reconnectAttempts += 1;
  const delay = Math.min(RECONNECT_DELAY_MS * Math.pow(1.5, _reconnectAttempts - 1), MAX_RECONNECT_DELAY_MS);
  const delaySeconds = Math.round(delay / 1000);

  console.log(`[WHATSAPP] 🔄 Reconnect ke-${_reconnectAttempts} dijadwalkan dalam ${delaySeconds}s...`);

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      await startWhatsAppSocket();
    } catch (err) {
      console.error('[WHATSAPP] Reconnect gagal:', err.message);
      _scheduleReconnect(); // Coba lagi
    }
  }, delay);
}

// ── QR Delivery ───────────────────────────────────────────────────────────────

/**
 * Kirim QR Code sebagai gambar ke Telegram Tuan Faqih (Fase 4 Coupling).
 * Jika belum ada fungsi pengiriman terdaftar, hanya log ke console.
 * @param {string} qrString - String QR Code dari Baileys
 */
async function _deliverQrCode(qrString) {
  try {
    // Coba generate QR sebagai gambar base64 menggunakan paket 'qrcode'
    const QRCode = require('qrcode');
    const qrImageBase64 = await QRCode.toDataURL(qrString, { errorCorrectionLevel: 'M', width: 512 });

    if (_sendQrToTelegram) {
      // Kirim pesan teks dulu agar Tuan Faqih tahu QR sudah siap
      await _sendQrToTelegram(
        '📱 *Pintu 2 WhatsApp — QR Code Siap!*\n\nSilakan scan QR ini dari HP sekunder Tuan Faqih dalam 60 detik.\nGambar QR dikirim tepat setelah pesan ini.',
        true // skipMemory
      ).catch(() => {});

      console.log('[WHATSAPP-QR] QR base64 siap, kirim via Telegram coupling (implementasi gambar Fase 4).');
      // Catatan: Pengiriman gambar via Telegram Bot (sendPhoto) akan diimplementasikan
      // pada Fase 4 setelah coupling endpoint /wa-login selesai dibuat.
    } else {
      console.log('[WHATSAPP-QR] Fungsi QR delivery ke Telegram belum terdaftar. QR tersedia di terminal.');
    }
  } catch (err) {
    console.error('[WHATSAPP-QR] Gagal men-generate QR Image:', err.message);
    console.log('[WHATSAPP-QR] QR String (scan manual dari terminal di atas):', qrString.substring(0, 60) + '...');
  }
}

/**
 * Kirim notifikasi status koneksi ke Telegram jika fungsi delivery tersedia.
 * @param {string} text - Pesan notifikasi
 */
function _notifyTelegramStatus(text) {
  if (_sendQrToTelegram) {
    _sendQrToTelegram(text, true).catch(() => {}); // skipMemory=true untuk pesan sistem
  }
}

// ── Outbound ──────────────────────────────────────────────────────────────────

/**
 * Mengirim pesan teks keluar dari N.E.X.A ke nomor WhatsApp tujuan.
 * Memformat teks dengan formatNexaToWhatsApp sebelum dikirim,
 * dan menyimpan balasan ke Supabase (Unified Consciousness).
 *
 * @param {string} text - Teks balasan dari otak N.E.X.A
 * @param {string} [recipientJid] - JID tujuan (default: env.WHATSAPP_OWNER_JID)
 * @param {boolean} [skipMemory=false] - Jangan simpan ke memori (untuk pesan sistem)
 * @param {string} [platform='whatsapp'] - Tag platform untuk Supabase
 */
async function sendWhatsAppOutbound(text, recipientJid, skipMemory = false, platform = 'whatsapp') {
  if (!sock || !isConnected) {
    console.warn('[WHATSAPP-OUTBOUND] Socket tidak aktif — pesan tidak terkirim:', String(text).substring(0, 80));
    return;
  }

  const targetJid = recipientJid || env.WHATSAPP_OWNER_JID;
  if (!targetJid) {
    console.warn('[WHATSAPP-OUTBOUND] Tidak ada target JID — set WHATSAPP_OWNER_JID di .env');
    return;
  }

  try {
    const formattedText = formatNexaToWhatsApp(String(text));

    // Simpan balasan N.E.X.A ke memori Supabase (Unified Consciousness)
    if (!skipMemory) {
      await supabaseMemories.saveChatMemory('nexa', formattedText.substring(0, 4000), platform).catch(() => {});
    }

    await sock.sendMessage(targetJid, { text: formattedText });
    console.log(`[WHATSAPP-OUTBOUND] ✅ Pesan terkirim ke ${targetJid}: "${formattedText.substring(0, 60)}..."`);
  } catch (err) {
    console.error('[WHATSAPP-OUTBOUND] ❌ Gagal mengirim pesan:', err.message);
    throw err;
  }
}

// ── Status & Accessors ────────────────────────────────────────────────────────

/**
 * @returns {boolean} True jika socket WhatsApp sedang aktif dan terhubung
 */
function isWhatsAppConnected() {
  return isConnected && sock !== null;
}

/**
 * @returns {Object|null} Instans socket Baileys aktif (untuk penggunaan lanjutan)
 */
function getSocket() {
  return sock;
}

/**
 * Memutuskan dan membersihkan sesi WhatsApp yang sedang aktif maupun tersimpan di Supabase.
 * Dipanggil saat perintah /wa_logout atau endpoint /wa-logout diakses.
 */
async function logoutWhatsAppSession() {
  console.log('[WHATSAPP] 🛑 Melakukan logout dan pembersihan sesi WhatsApp...');
  try {
    if (sock) {
      try { await sock.logout(); } catch (_) {}
      try { sock.end(); } catch (_) {}
      sock = null;
    }
    isConnected = false;
    isConnecting = false;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    await clearSupabaseAuthState('nexa_wa_main');
    _notifyTelegramStatus('🛑 *Sesi WhatsApp Berhasil Dihapus* — Pintu 2 telah diputuskan dan data kredensial di cloud telah dibersihkan.');
    console.log('[WHATSAPP] ✅ Logout dan pembersihan sesi selesai.');
  } catch (err) {
    console.error('[WHATSAPP] Error saat logoutWhatsAppSession:', err.message);
  }
}

module.exports = {
  startWhatsAppSocket,
  sendWhatsAppOutbound,
  setQrDeliveryFn,
  isWhatsAppConnected,
  getSocket,
  logoutWhatsAppSession
};
