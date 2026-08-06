// ============================================================
// N.E.X.A — MOBILE BRIDGE WEBSOCKET SERVER
// Menangani koneksi persisten 24/7 dengan aplikasi Android.
// Digunakan untuk mengirim perintah GodMode, menerima telemetri,
// serta menyerap real-time context updates dari ContextEngine.
// ============================================================
'use strict';

const WebSocket = require('ws');
const env = require('../../config/env');
const security = require('../../utils/security'); // untuk generateTaskerSignature

let wss = null;
let activeClient = null; // Hanya ekspektasi 1 perangkat Android yang terhubung
let latestTelemetry = null;

// Map untuk melacak async promise command execution
const pendingCommands = new Map();
let contextUpdateListener = null;

/**
 * Inisialisasi WebSocket server, menempel pada instance http.Server Express
 * @param {import('http').Server} server 
 */
function initWebSocket(server) {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // 1. Autentikasi via Header Authorization (Bearer Token)
    const authHeader = req.headers.authorization;
    const configuredSecret = String(env.NEXA_GODMODE_SECRET || '').trim();

    let isAuthorized = false;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (token === configuredSecret && configuredSecret.length > 0) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      console.warn('[MOBILE-BRIDGE-WS] ⚠️ Unauthorized connection attempt blocked.');
      ws.close(4001, 'Unauthorized');
      return;
    }

    console.log('[MOBILE-BRIDGE-WS] 📱 Mobile Bridge terhubung dengan aman.');
    
    // 2. Manajemen Koneksi Tunggal (Ganti koneksi lama jika ada)
    if (activeClient && activeClient !== ws) {
      console.log('[MOBILE-BRIDGE-WS] Menutup koneksi lama (digantikan oleh koneksi baru).');
      try { activeClient.close(4009, 'Replaced by new connection'); } catch (e) {}
    }
    activeClient = ws;

    // 3. Listener Pesan dari Android
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        
        if (data.type === 'PING') {
           ws.send(JSON.stringify({ type: 'PONG' }));
           return;
        }

        if (data.type === 'TELEMETRY_REPORT') {
           latestTelemetry = data;
        } else if (data.type === 'COMMAND_RESULT') {
           const emoji = data.status === 'SUCCESS' ? '✅' : '❌';
           console.log(`[MOBILE-BRIDGE-WS] ${emoji} Command Result [${data.command_id}]: ${data.status} - ${data.message}`);
           
           // Resolve pending command promise jika ada listener yang menunggu
           if (pendingCommands.has(data.command_id)) {
               const { resolve, timer } = pendingCommands.get(data.command_id);
               clearTimeout(timer);
               pendingCommands.delete(data.command_id);
               resolve(data);
           }
        } else if (data.type === 'CONTEXT_UPDATE') {
           console.log(`[MOBILE-BRIDGE-WS] ⚡ Context Update: ${data.event} - ${data.summary}`);
           if (typeof contextUpdateListener === 'function') {
               contextUpdateListener(data);
           }
        } else {
           console.log('[MOBILE-BRIDGE-WS] Pesan tidak dikenal:', data.type);
        }
      } catch (err) {
        console.error('[MOBILE-BRIDGE-WS] Gagal memparsing pesan:', err.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.log(`[MOBILE-BRIDGE-WS] Koneksi terputus: ${code} - ${reason}`);
      if (activeClient === ws) {
        activeClient = null;
      }
      // Resolve semua pending commands yang belum selesai agar tidak ada Promise yang menggantung selamanya
      if (pendingCommands.size > 0) {
        console.warn(`[MOBILE-BRIDGE-WS] ⚠️ Membersihkan ${pendingCommands.size} pending command(s) akibat disconnect.`);
        for (const [cmdId, { resolve, timer }] of pendingCommands.entries()) {
          clearTimeout(timer);
          resolve({ status: 'DISCONNECTED', message: 'Mobile Bridge disconnected before command completed' });
        }
        pendingCommands.clear();
      }
    });
    
    ws.on('error', (err) => {
       console.error('[MOBILE-BRIDGE-WS] Error:', err.message);
    });
  });
}

/**
 * Mengirim perintah ke perangkat Android yang terhubung.
 * Otomatis melampirkan HMAC-SHA256 signature sesuai format server.
 * Mengembalikan Promise yang resolve saat CommandResult dikembalikan oleh HP.
 * 
 * @param {string} action - Nama aksi (misal: 'TOGGLE_FLASHLIGHT', 'DUMP_UI_HIERARCHY', 'ACCESSIBILITY_CLICK')
 * @param {object} params - Parameter (misal: { x: 500, y: 1000 })
 * @param {number} level - Level eskalasi GodMode (1-4)
 * @param {number} timeoutMs - Batas waktu tunggu respon (default 10 detik)
 * @returns {Promise<object>} Objek CommandResult dari Android
 */
function sendCommand(action, params = {}, level = 1, timeoutMs = 10000) {
    return new Promise((resolve) => {
        if (!activeClient || activeClient.readyState !== WebSocket.OPEN) {
            console.warn(`[MOBILE-BRIDGE-WS] Gagal mengirim ${action} — Mobile Bridge OFFLINE.`);
            return resolve({ status: 'OFFLINE', message: 'Mobile Bridge is not connected' });
        }

        const timestamp = Date.now();
        const signature = security.generateTaskerSignature(timestamp, level);
        const commandId = `cmd_${timestamp}_${Math.random().toString(36).substring(2, 9)}`;

        const payload = {
            type: 'EXECUTE_COMMAND',
            command_id: commandId,
            action: action,
            params: params,
            signature: signature,
            timestamp: timestamp
        };

        const timer = setTimeout(() => {
            if (pendingCommands.has(commandId)) {
                pendingCommands.delete(commandId);
                resolve({ status: 'TIMEOUT', message: `Command ${action} timed out after ${timeoutMs}ms` });
            }
        }, timeoutMs);

        pendingCommands.set(commandId, { resolve, timer });

        try {
            activeClient.send(JSON.stringify(payload));
            console.log(`[MOBILE-BRIDGE-WS] 🚀 Command ${action} terkirim [${commandId}].`);
        } catch (e) {
            clearTimeout(timer);
            pendingCommands.delete(commandId);
            console.error(`[MOBILE-BRIDGE-WS] Error mengirim perintah:`, e.message);
            resolve({ status: 'ERROR', message: e.message });
        }
    });
}

/**
 * Mendaftarkan callbacklistener untuk event Context Engine (real-time events) dari Android
 */
function setOnContextUpdateListener(callback) {
    contextUpdateListener = callback;
}

/**
 * Mendapatkan data telemetri terakhir yang dilaporkan Android.
 */
function getLatestTelemetry() {
    return latestTelemetry;
}

/**
 * Meminta HP untuk memunculkan Pop-Up Overlay Interaktif.
 * @param {string} title 
 * @param {string} message 
 * @param {Array} buttons - Array objek tombol { id, text, color }
 * @param {number} timeoutMs - Lama popup bertahan (ms) sebelum tertutup otomatis
 * @returns {Promise<object>}
 */
function requestOverlay(title, message, buttons = [], timeoutMs = 15000) {
    return sendCommand('SHOW_OVERLAY_MSG', {
        title,
        message,
        timeout: timeoutMs,
        buttons
    }, 1, timeoutMs);
}

module.exports = {
    initWebSocket,
    sendCommand,
    setOnContextUpdateListener,
    getLatestTelemetry,
    requestOverlay
};
