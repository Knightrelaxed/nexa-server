// ============================================================
// N.E.X.A 3.0 — DEVICE CONTROL ENGINE
// Domain Layer Dispatcher bridging AI Cognitive Router with NexaBridgeAdapter.
// Handles parameter normalization, execution routing, result formatting,
// and media generation for Telegram / Webhook interfaces.
// ============================================================
'use strict';

const bridge = require('../interfaces/mobile_bridge/adapter');
const env = require('../config/env');

class DeviceControlEngine {
  /**
   * Main entry point for executing DEVICE_CONTROL intent.
   * @param {Object} routingData - Output from AI_Router { intent: 'DEVICE_CONTROL', extracted_data, reply_message }
   * @param {Object} [context] - Context containing chatId, platform, etc.
   * @returns {Promise<{ message: string, photoBase64?: string, success: boolean, rawResult?: Object }>}
   */
  async executeDeviceAction(routingData, context = {}) {
    const data = routingData?.extracted_data || {};
    const rawAction = String(data.action || '').toUpperCase().trim();

    if (!rawAction) {
      return {
        success: false,
        message: routingData?.reply_message || '⚠️ Mohon maaf Tuan, aksi kontrol perangkat tidak dikenali.'
      };
    }

    console.log(`[DEVICE-ENGINE] 📱 Executing Action: [${rawAction}] with params:`, JSON.stringify(data));

    try {
      let result;

      switch (rawAction) {
        // ── 1. Flashlight & Hardware Controls ─────────────────────────
        case 'TOGGLE_FLASHLIGHT':
        case 'FLASHLIGHT': {
          const enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
          result = await bridge.toggleFlashlight(enabled);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔦 Lampu senter HP telah <b>${enabled ? 'DINYALAKAN' : 'DIMATIKAN'}</b>.`
          };
        }

        case 'SET_VOLUME':
        case 'VOLUME': {
          const stream = String(data.stream || 'MUSIC').toUpperCase();
          const level = Number(data.level !== undefined ? data.level : 70);
          result = await bridge.setVolume(stream, level);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔊 Volume [${stream}] diatur ke <b>${level}%</b>.`
          };
        }

        case 'FORCE_DND':
        case 'DND': {
          const enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
          result = await bridge.forceDnd(enabled);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔕 Mode Jangan Ganggu (DND) <b>${enabled ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}</b>.`
          };
        }

        case 'GET_BATTERY_STATUS':
        case 'BATTERY': {
          result = await bridge.getBatteryStatus();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          const batData = result.data || {};
          const level = batData.battery_level !== undefined ? batData.battery_level : 'Unknown';
          const charging = batData.charging ? '⚡ (Sedang Mengisi Daya)' : '🔋 (Menggunakan Baterai)';
          return {
            success: true,
            message: `🔋 <b>Status Baterai HP Tuan Faqih:</b> <b>${level}%</b> ${charging}`
          };
        }

        case 'GET_NETWORK_INFO':
        case 'WIFI_INFO': {
          result = await bridge.getNetworkInfo();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          const netData = result.data || {};
          const ssidStr = netData.ssid ? `(SSID: <b>${netData.ssid}</b>)` : '';
          const rssiStr = netData.rssi ? `| Kekuatan: <b>${netData.rssi} dBm</b>` : '';
          return {
            success: true,
            message: `📶 <b>Status Jaringan HP:</b> ${netData.type || 'WIFI'} ${ssidStr} ${rssiStr}`
          };
        }

        case 'TOGGLE_WIFI': {
          const enabled = data.enabled !== undefined ? Boolean(data.enabled) : true;
          result = await bridge.toggleWifi(enabled);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📶 Modul Wi-Fi HP telah <b>${enabled ? 'DIAKTIFKAN' : 'DIMATIKAN'}</b>.`
          };
        }

        case 'GET_LOCATION':
        case 'LOCATION': {
          result = await bridge.getLocation();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          const loc = result.data || {};
          if (loc.latitude && loc.longitude) {
            const address = loc.address ? `\n\n📌 <b>Alamat Terdeteksi:</b>\n<i>${loc.address}</i>` : '';
            const mapLink = `\n\n🗺️ <a href="https://www.google.com/maps?q=${loc.latitude},${loc.longitude}">Buka Lokasi di Google Maps</a>`;
            return {
              success: true,
              message: `📍 <b>Lokasi GPS HP Tuan Faqih:</b>\nKoordinat: <code>${loc.latitude}, ${loc.longitude}</code> (Akurasi: ±${Math.round(loc.accuracy || 0)}m)${address}${mapLink}`
            };
          }
          return {
            success: true,
            message: result.message || '📍 Lokasi GPS berhasil diperbarui.'
          };
        }

        case 'SPEAK_TEXT':
        case 'TTS': {
          const textToSpeak = data.text || routingData?.reply_message || 'Halo Tuan Faqih';
          result = await bridge.speakText(textToSpeak);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🗣️ <b>Suara Disuarakan di HP:</b>\n<i>"${textToSpeak}"</i>`
          };
        }

        // ── 2. Screen & Navigation ────────────────────────────────────
        case 'LOCK_SCREEN':
        case 'LOCK': {
          result = await bridge.lockScreen();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔒 Layar HP Samsung A33 5G telah <b>berhasil dikunci</b>.`
          };
        }

        case 'GO_HOME_SCREEN':
        case 'HOME': {
          result = await bridge.goHomeScreen();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🏠 HP telah diarahkan kembali ke <b>Home Screen</b>.`
          };
        }

        case 'GO_BACK':
        case 'BACK': {
          result = await bridge.goBack();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔙 Navigasi tombol <b>Kembali (Back)</b> telah dieksekusi di HP.`
          };
        }

        case 'SHOW_RECENTS':
        case 'RECENTS': {
          result = await bridge.showRecents();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📑 Menu <b>Recent Apps</b> telah dibuka di layar HP.`
          };
        }

        // ── 3. Visual Eyes (Camera & Screenshot) ──────────────────────
        case 'TAKE_PHOTO':
        case 'PHOTO': {
          const facing = (data.camera_facing || data.facing || 'back').toLowerCase().includes('front') ? 'front' : 'back';
          result = await bridge.takePhoto(facing);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);

          const photoBase64 = result.data?.image_base64;
          if (photoBase64) {
            return {
              success: true,
              photoBase64: photoBase64,
              message: `📸 <b>Foto Kamera ${facing === 'front' ? 'Depan' : 'Belakang'} Berhasil Diambil</b>`
            };
          }
          return {
            success: false,
            message: `❌ Gagal mengambil foto: ${result.message || 'Tidak ada data gambar yang diterima.'}`
          };
        }

        case 'TAKE_SCREENSHOT':
        case 'SCREENSHOT': {
          result = await bridge.takeScreenshot();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);

          const shotBase64 = result.data?.image_base64;
          if (shotBase64) {
            return {
              success: true,
              photoBase64: shotBase64,
              message: `📱 <b>Tangkapan Layar (Screenshot) HP Tuan Faqih</b>`
            };
          }
          return {
            success: false,
            message: `❌ Gagal mengambil screenshot: ${result.message || 'Tidak ada data gambar.'}`
          };
        }

        case 'DUMP_UI_HIERARCHY':
        case 'DUMP_UI': {
          result = await bridge.dumpUiHierarchy();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          const nodes = result.data?.nodes || [];
          const topNodes = nodes.slice(0, 10).map(n => `- [${n.class || 'View'}] ${n.text || n.desc || n.id || '(no text)'}`).join('\n');
          return {
            success: true,
            message: `👁️ <b>Pohon UI Layar HP Terdeteksi (${nodes.length} elemen):</b>\n${topNodes || '(Layar kosong/privat)'}`
          };
        }

        // ── 4. Accessibility & Gestures (Hands) ────────────────────────
        case 'ACCESSIBILITY_CLICK':
        case 'CLICK': {
          let target = data.target || data.id || data.text;
          if (data.x !== undefined && data.y !== undefined) {
            target = { x: Number(data.x), y: Number(data.y) };
          }
          result = await bridge.click(target || { x: 500, y: 500 });
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `👆 Gestur klik berhasil dieksekusi di HP pada target: <code>${JSON.stringify(target)}</code>`
          };
        }

        case 'ACCESSIBILITY_INPUT_TEXT':
        case 'INPUT_TEXT': {
          const textInput = data.text || '';
          const target = data.target || null;
          result = await bridge.inputText(textInput, target);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `⌨️ Teks berhasil diketikkan ke form HP: <i>"${textInput}"</i>`
          };
        }

        case 'ACCESSIBILITY_SCROLL':
        case 'SCROLL': {
          const direction = String(data.direction || 'FORWARD').toUpperCase();
          result = await bridge.scroll(direction);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📜 Layar HP telah digulir (${direction}).`
          };
        }

        case 'GET_CLIPBOARD': {
          result = await bridge.getClipboard();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          const clipText = result.data?.text || '(Kosong)';
          return {
            success: true,
            message: `📋 <b>Isi Clipboard HP:</b>\n<code>${clipText}</code>`
          };
        }

        case 'SET_CLIPBOARD': {
          const textToCopy = data.text || '';
          result = await bridge.setClipboard(textToCopy);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📋 Teks berhasil disalin ke Clipboard HP: <i>"${textToCopy}"</i>`
          };
        }

        // ── 5. App Launching & Intent ──────────────────────────────────
        case 'LAUNCH_APP': {
          const pkg = data.package_name || data.package || 'com.android.chrome';
          result = await bridge.launchApp(pkg);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🚀 Aplikasi <code>${pkg}</code> berhasil diluncurkan di HP.`
          };
        }

        case 'OPEN_INTENT':
        case 'OPEN_URL': {
          const url = data.url || 'https://google.com';
          result = await bridge.openUrl(url);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🌐 Membuka tautan di browser HP:\n${url}`
          };
        }

        case 'SHOW_OVERLAY_MSG':
        case 'SHOW_OVERLAY': {
          const title = data.title || 'N.E.X.A Assistant';
          const msg = data.message || data.text || 'Pemberitahuan Sistem';
          const options = Array.isArray(data.options) ? data.options : [];
          result = await bridge.showOverlay(title, msg, options);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🪟 Dialog pop-up berhasil dimunculkan di layar HP:\n<i>"${msg}"</i>`
          };
        }

        // ── 6. Audio & Interactive Call ────────────────────────────────
        case 'PLAY_RINGTONE':
        case 'RING': {
          result = await bridge.playRingtone();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `🔔 <b>Ringtone Alarm Darurat dinyalakan</b> pada volume 100% di HP.`
          };
        }

        case 'STOP_MEDIA':
        case 'STOP_AUDIO': {
          result = await bridge.stopMedia();
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `⏹️ Pemutaran audio di HP telah dihentikan.`
          };
        }

        case 'SIMULATE_INCOMING_CALL':
        case 'CALL': {
          const caller = data.caller_name || 'N.E.X.A Assistant';
          const callMsg = data.message || 'Tuan Faqih, ada panggilan interaktif dari N.E.X.A.';
          result = await bridge.simulateIncomingCall(caller, callMsg, true);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📞 <b>Panggilan Masuk Interaktif</b> telah diluncurkan ke layar HP Tuan Faqih.`
          };
        }

        // ── 7. Geofencing ──────────────────────────────────────────────
        case 'SET_GEOFENCE': {
          result = await bridge.execute('SET_GEOFENCE', data);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📍 Pagar virtual Geofence [${data.id || 'ZONE'}] berhasil didaftarkan di HP.`
          };
        }

        case 'MARK_GEOFENCE_HERE': {
          result = await bridge.execute('MARK_GEOFENCE_HERE', data);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: `📍 Titik koordinat GPS saat ini berhasil disimpan sebagai Geofence [${data.id || 'HOME'}].`
          };
        }

        default:
          // Passthrough to generic executor
          result = await bridge.execute(rawAction, data);
          if (!result.success && result.status === 'OFFLINE') return this._formatOfflineResult(rawAction);
          if (!result.success) return this._formatFailureResult(rawAction, result.message);
          return {
            success: true,
            message: result.message || `Aksi [${rawAction}] selesai dieksekusi di HP.`
          };
      }
    } catch (err) {
      console.error(`[DEVICE-ENGINE] ❌ Error executing [${rawAction}]:`, err.message);
      return {
        success: false,
        message: `⚠️ Terjadi kendala saat mengeksekusi perintah hardware: ${err.message}`
      };
    }
  }

  _formatOfflineResult(action) {
    return {
      success: false,
      message: `⚠️ <b>Nexa Mobile Bridge Offline:</b> Perangkat HP Samsung A33 5G Tuan Faqih saat ini belum tersambung ke WebSocket server. Perintah <code>${action}</code> tidak dapat dieksekusi.`
    };
  }

  _formatFailureResult(action, detail) {
    return {
      success: false,
      message: `❌ <b>Gagal Mengeksekusi ${action}:</b> ${detail || 'Perangkat menolak atau gagal menjalankan perintah.'}`
    };
  }
}

module.exports = new DeviceControlEngine();
