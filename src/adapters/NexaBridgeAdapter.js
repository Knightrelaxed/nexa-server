// ============================================================
// N.E.X.A 3.0 — NEXA MOBILE BRIDGE ADAPTER
// Master Neural-Peripheral Adapter linking N.E.X.A Cloud Server (Azure VPS)
// to Physical Android Hardware (Samsung Galaxy A33 5G - Android 16 / One UI 8).
// ============================================================
'use strict';

const mobileBridgeWs = require('../interfaces/mobile_bridge/MobileBridge_WS');
const locationEngine = require('../infrastructure/Location_Engine');
const taskerClient = require('../infrastructure/Tasker_Client');
const env = require('../config/env');

class NexaBridgeAdapter {
  constructor() {
    this.latestContext = null;
    this.latestTelemetry = null;
    this.contextListeners = new Set();
    this.callEventListeners = new Set();

    // Hook WebSocket telemetry & context listeners on initialization
    this._initWsListeners();
  }

  // ─────────────────────────────────────────────────────────────
  // 1. INGESTION ENGINE (Mata & Sensor Listener)
  // ─────────────────────────────────────────────────────────────

  _initWsListeners() {
    mobileBridgeWs.setOnTelemetryListener((telemetry) => {
      this.handleIncomingTelemetry(telemetry);
    });
  }

  /**
   * Handle incoming periodic TELEMETRY_REPORT from device.
   * @param {Object} telemetry 
   */
  handleIncomingTelemetry(telemetry) {
    this.latestTelemetry = {
      ...telemetry,
      updated_at: new Date().toISOString()
    };

    // Update location engine / battery telemetry if present
    if (telemetry.battery_level !== undefined) {
      // Broadcast to any registered listener
      this.contextListeners.forEach(listener => {
        try { listener('TELEMETRY_UPDATED', this.latestTelemetry); } catch (_) {}
      });
    }
  }

  /**
   * Handle incoming high-level CONTEXT_UPDATE from Android Sensor ContextEngine.
   * Events: USER_ARRIVED_HOME, USER_ARRIVED_WORK, PHONE_PICKUP_MORNING, ROOM_DARK_NIGHT, etc.
   * @param {Object} report 
   */
  handleIncomingContextUpdate(report) {
    this.latestContext = {
      ...report,
      received_at: new Date().toISOString()
    };

    console.log(`[NEXA-ADAPTER] 📡 Context Event Received: [${report.event}] - ${report.summary || ''}`);

    // 1. Geofence & Location Sync
    if (report.event === 'USER_ARRIVED_HOME' || report.event === 'USER_LEFT_HOME' ||
        report.event === 'USER_ARRIVED_WORK' || report.event === 'USER_LEFT_WORK') {
      try {
        const isHome = report.event === 'USER_ARRIVED_HOME';
        console.log(`[NEXA-ADAPTER] 📍 Geofence status updated: isHome=${isHome}`);
      } catch (err) {
        console.error('[NEXA-ADAPTER] Location sync error:', err.message);
      }
    }

    // 2. Morning Pickup & Alarm Dismiss Trigger
    if (report.event === 'PHONE_PICKUP_MORNING' || report.event === 'ALARM_DISMISSED') {
      console.log(`[NEXA-ADAPTER] 🌅 Morning activation trigger detected: ${report.event}`);
    }

    // Notify registered context listeners
    this.contextListeners.forEach(listener => {
      try { listener(report.event, report); } catch (err) {
        console.error('[NEXA-ADAPTER] Context listener error:', err.message);
      }
    });
  }

  /**
   * Handle incoming CALL_EVENT from FakeCallActivity (Call Interaction v2.0).
   * Events: CALL_ACCEPTED, CALL_REJECTED, CALL_AUDIO_REPLY.
   * @param {Object} callEvent 
   */
  async handleIncomingCallEvent(callEvent) {
    console.log(`[NEXA-ADAPTER] 📞 Call Event Received: [${callEvent.event}] (Command: ${callEvent.command_id || 'N/A'})`);

    // Notify registered call listeners
    this.callEventListeners.forEach(listener => {
      try { listener(callEvent.event, callEvent); } catch (err) {
        console.error('[NEXA-ADAPTER] Call listener error:', err.message);
      }
    });

    // Audio Reply Processing (Whisper STT -> AI Router -> Audio/TTS Stream)
    if (callEvent.event === 'CALL_AUDIO_REPLY' && callEvent.audio_base64) {
      try {
        console.log(`[NEXA-ADAPTER] 🎙️ Processing Voice Reply (${callEvent.audio_base64.length} chars Base64)...`);
        // Lazy-load Voice_Engine to transcribe
        const voiceEngine = require('../core/Voice_Engine');
        const transcription = await voiceEngine.transcribePcmBase64(callEvent.audio_base64);
        console.log(`[NEXA-ADAPTER] 🗣️ Whisper Transcription: "${transcription}"`);

        if (transcription && transcription.trim().length > 0) {
          // Send transcription to AI Router for response
          const aiRouter = require('../core/AI_Router');
          const aiReply = await aiRouter.routeUserMessage(transcription, {
            channel: 'MOBILE_CALL',
            caller_name: callEvent.caller_name || 'N.E.X.A'
          });

          // Reply back with TTS speech on the phone
          const replyText = typeof aiReply === 'string'
            ? aiReply
            : (aiReply?.reply_message || aiReply?.text || 'Baik Tuan Faqih.');
          await this.speakText(replyText);
        }
      } catch (err) {
        console.error('[NEXA-ADAPTER] Error processing call audio reply:', err.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. UNIFIED HARDWARE ACTION ENGINE (Tangan & Eksekusi)
  // ─────────────────────────────────────────────────────────────

  /**
   * Core execution gateway with Strict 5s Anti-Ghost Timeout & WSS Transport.
   * @param {string} action - NexaActions constant
   * @param {Object} params - Action parameters
   * @param {Object} [options] - Execution options
   * @returns {Promise<{ success: boolean, message: string, data: Object }>}
   */
  async execute(action, params = {}, options = {}) {
    const timeoutMs = options.timeoutMs || 5000;
    return await mobileBridgeWs.sendCommand(action, params, { timeoutMs });
  }

  // ── Hardware Controls ─────────────────────────────────────────

  async toggleFlashlight(enabled = true) {
    return this.execute('TOGGLE_FLASHLIGHT', { enabled });
  }

  async setVolume(stream = 'MUSIC', level = 50) {
    return this.execute('SET_VOLUME', { stream, level });
  }

  async forceDnd(enabled = true) {
    return this.execute('FORCE_DND', { enabled });
  }

  async getBatteryStatus() {
    return this.execute('GET_BATTERY_STATUS');
  }

  async getNetworkInfo() {
    return this.execute('GET_NETWORK_INFO');
  }

  async toggleWifi(enabled = true) {
    return this.execute('TOGGLE_WIFI', { enabled });
  }

  async getLocation() {
    return this.execute('GET_LOCATION');
  }

  async speakText(text) {
    return this.execute('SPEAK_TEXT', { text });
  }

  // ── Screen & Navigation ───────────────────────────────────────

  async lockScreen() {
    return this.execute('LOCK_SCREEN');
  }

  async goHomeScreen() {
    return this.execute('GO_HOME_SCREEN');
  }

  async goBack() {
    return this.execute('GO_BACK');
  }

  async showRecents() {
    return this.execute('SHOW_RECENTS');
  }

  // ── Camera & Screenshot (Visual Perception) ────────────────────

  async takePhoto(cameraFacing = 'back') {
    return this.execute('TAKE_PHOTO', { camera_facing: cameraFacing }, { timeoutMs: 10000 });
  }

  async takeScreenshot() {
    return this.execute('TAKE_SCREENSHOT', {}, { timeoutMs: 8000 });
  }

  async dumpUiHierarchy() {
    return this.execute('DUMP_UI_HIERARCHY', {}, { timeoutMs: 6000 });
  }

  // ── Accessibility & Gestures (Hands) ──────────────────────────

  async click(targetOrCoords) {
    if (typeof targetOrCoords === 'object' && targetOrCoords.x !== undefined && targetOrCoords.y !== undefined) {
      return this.execute('ACCESSIBILITY_CLICK', { x: targetOrCoords.x, y: targetOrCoords.y });
    }
    return this.execute('ACCESSIBILITY_CLICK', { target: String(targetOrCoords) });
  }

  async inputText(text, target = null) {
    const params = { text };
    if (target) params.target = target;
    return this.execute('ACCESSIBILITY_INPUT_TEXT', params);
  }

  async scroll(direction = 'FORWARD') {
    return this.execute('ACCESSIBILITY_SCROLL', { direction });
  }

  async getClipboard() {
    return this.execute('GET_CLIPBOARD');
  }

  async setClipboard(text) {
    return this.execute('SET_CLIPBOARD', { text });
  }

  // ── App Launching & Intent ────────────────────────────────────

  async launchApp(packageName) {
    return this.execute('LAUNCH_APP', { package_name: packageName });
  }

  async openUrl(url) {
    return this.execute('OPEN_INTENT', { type: 'OPEN_URL', url });
  }

  async openMaps(lat, lng) {
    return this.execute('OPEN_INTENT', { type: 'OPEN_MAPS', url: `geo:${lat},${lng}` });
  }

  async showOverlay(title, message, options = []) {
    return this.execute('SHOW_OVERLAY_MSG', {
      title,
      message,
      options: options.length > 0 ? options : undefined
    }, { timeoutMs: 15000 });
  }

  // ── Emergency Audio & Call Simulation ─────────────────────────

  async playRingtone() {
    return this.execute('PLAY_RINGTONE', {}, { timeoutMs: 5000 });
  }

  async stopMedia() {
    return this.execute('STOP_MEDIA', {}, { timeoutMs: 3000 });
  }

  async simulateIncomingCall(callerName = 'N.E.X.A Assistant', message = 'Tuan Faqih, ada interupsi penting.', playRingtone = true) {
    return this.execute('SIMULATE_INCOMING_CALL', {
      caller_name: callerName,
      message: message,
      play_ringtone: playRingtone
    }, { timeoutMs: 12000 });
  }

  async playAudioStream(audioBase64, format = 'PCM_16BIT_16KHZ_MONO') {
    return this.execute('PLAY_AUDIO_STREAM', {
      audio_base64: audioBase64,
      audio_format: format
    }, { timeoutMs: 10000 });
  }

  // ─────────────────────────────────────────────────────────────
  // 3. EVENT SUBSCRIPTION & HEALTH
  // ─────────────────────────────────────────────────────────────

  onContextUpdate(callback) {
    if (typeof callback === 'function') {
      this.contextListeners.add(callback);
    }
  }

  onCallEvent(callback) {
    if (typeof callback === 'function') {
      this.callEventListeners.add(callback);
    }
  }

  isOnline() {
    const wsStatus = mobileBridgeWs.getLatestTelemetry();
    return Boolean(wsStatus);
  }

  getSnapshot() {
    return {
      is_online: this.isOnline(),
      telemetry: this.latestTelemetry,
      context: this.latestContext
    };
  }
}

// Export Singleton Instance
module.exports = new NexaBridgeAdapter();
