// ============================================================
// N.E.X.A 3.3 — MOBILE BRIDGE ADAPTER
// Master Neural-Peripheral Adapter linking N.E.X.A Cloud Server
// to Physical Android Hardware (Samsung Galaxy A33 5G - Android 16 / One UI 8).
// ============================================================
'use strict';

const mobileClient = require('./client');
const locationEngine = require('../../../infrastructure/Location_Engine');
const presenceModel = require('../../../domain/Presence_Model');
const env = require('../../../config/env');

class NexaBridgeAdapter {
  constructor() {
    this.latestContext = null;
    this.latestTelemetry = null;
    this.contextListeners = new Set();
    this.callEventListeners = new Set();
    this.lastMorningBriefingDate = null;

    // Hook WebSocket telemetry & context listeners on initialization
    this._initWsListeners();
  }

  // ─────────────────────────────────────────────────────────────
  // 1. INGESTION ENGINE (Mata & Sensor Listener)
  // ─────────────────────────────────────────────────────────────

  _initWsListeners() {
    mobileClient.setOnTelemetryListener((telemetry) => {
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

    if (telemetry.battery_level !== undefined) {
      presenceModel.batteryLevel = telemetry.battery_level;
    }
    if (telemetry.screen_on !== undefined) {
      presenceModel.isScreenOn = Boolean(telemetry.screen_on);
    }

    // Broadcast to any registered listener
    if (telemetry.battery_level !== undefined) {
      this.contextListeners.forEach(listener => {
        try { listener('TELEMETRY_UPDATED', this.latestTelemetry); } catch (_) {}
      });
    }
  }

  /**
   * Handle incoming high-level CONTEXT_UPDATE from Android Sensor ContextEngine.
   * @param {Object} report 
   */
  handleIncomingContextUpdate(report) {
    this.latestContext = {
      ...report,
      received_at: new Date().toISOString()
    };

    // Feed physical telemetry to centralized Presence Model
    presenceModel.updateFromContextEvent(report.event, report);

    console.log(`[NEXA-ADAPTER-MOBILE] Context Event Received: [${report.event}] - ${report.summary || ''}`);

    // 1. Geofence & Location Sync
    if (report.event === 'USER_ARRIVED_HOME' || report.event === 'USER_LEFT_HOME' ||
        report.event === 'USER_ARRIVED_WORK' || report.event === 'USER_LEFT_WORK') {
      try {
        const isHome = report.event === 'USER_ARRIVED_HOME';
        console.log(`[NEXA-ADAPTER-MOBILE] Geofence status updated: isHome=${isHome}`);
      } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Location sync error:', err.message);
      }
    }

    // 2. Morning Pickup & Alarm Dismiss Trigger (Safe once-per-day guard)
    if (report.event === 'PICKUP_MORNING' || report.event === 'PHONE_PICKUP_MORNING' || report.event === 'ALARM_DISMISSED') {
      const todayStr = new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' });
      if (this.lastMorningBriefingDate !== todayStr) {
        this.lastMorningBriefingDate = todayStr;
        console.log(`[NEXA-ADAPTER-MOBILE] Morning activation trigger detected: ${report.event} for ${todayStr}.`);
      } else {
        console.log(`[NEXA-ADAPTER-MOBILE] Morning trigger already executed for ${todayStr}. Skipping duplicate.`);
      }
    }

    // Notify registered context listeners
    this.contextListeners.forEach(listener => {
      try { listener(report.event, report); } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Context listener error:', err.message);
      }
    });
  }

  /**
   * Handle incoming CALL_EVENT from FakeCallActivity.
   * @param {Object} callEvent 
   * @param {WebSocket} clientWs
   */
  async handleIncomingCallEvent(callEvent, clientWs) {
    console.log(`[NEXA-ADAPTER-MOBILE] 📞 Call Event Received: [${callEvent.event}] (Command: ${callEvent.command_id || 'N/A'})`);

    // Notify registered call listeners
    this.callEventListeners.forEach(listener => {
      try { listener(callEvent.event, callEvent); } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Call listener error:', err.message);
      }
    });

    // 1. Live Voice Stream Session Trigger (Gemini Multimodal Live API)
    if (callEvent.event === 'CALL_ACCEPTED') {
      try {
        const liveVoice = require('../../../core/Live_Voice_Engine');
        const sessionId = callEvent.command_id || `LIVE_CALL_${Date.now()}`;

        const existingSession = liveVoice.getLiveSession(sessionId);
        if (existingSession && existingSession.isActive) {
          console.log(`[NEXA-ADAPTER-MOBILE] ⚠️ Ignoring duplicate CALL_ACCEPTED for active session [${sessionId}]`);
          return;
        }

        console.log(`[NEXA-ADAPTER-MOBILE] ⚡ Starting Gemini Live Voice Session: [${sessionId}] with active client socket`);
        liveVoice.startLiveSession(sessionId, clientWs);
      } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Failed to start live voice session:', err.message);
      }
      return;
    }

    // 2. Call Finished / Rejected Cleanup
    if (callEvent.event === 'CALL_FINISHED' || callEvent.event === 'CALL_REJECTED') {
      try {
        const liveVoice = require('../../../core/Live_Voice_Engine');
        const sessionId = callEvent.command_id || '';
        if (sessionId) {
          liveVoice.closeLiveSession(sessionId);
        }
        if (clientWs) {
          const session = liveVoice.getActiveSessionForClient(clientWs);
          if (session) session.close();
        }
      } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Failed to close live voice session:', err.message);
      }
      return;
    }

    // 3. Audio Reply Processing (Legacy Turn-Based Fallback)
    if (callEvent.event === 'CALL_AUDIO_REPLY' && callEvent.audio_base64) {
      try {
        console.log(`[NEXA-ADAPTER-MOBILE] 🎙️ Processing Legacy Voice Reply (${callEvent.audio_base64.length} chars Base64)...`);
        const voiceEngine = require('../../../core/Voice_Engine');
        const transcription = await voiceEngine.transcribePcmBase64(callEvent.audio_base64);
        console.log(`[NEXA-ADAPTER-MOBILE] 🗣️ Whisper Transcription: "${transcription}"`);

        if (transcription && transcription.trim().length > 0) {
          const aiRouter = require('../../../core/AI_Router');
          const aiReply = await aiRouter.routeUserMessage(transcription, {
            channel: 'MOBILE_CALL',
            caller_name: callEvent.caller_name || 'N.E.X.A'
          });

          let rawReply = typeof aiReply === 'string'
            ? aiReply
            : (aiReply?.reply_message || aiReply?.text || 'Baik Tuan Faqih.');
          const replyText = rawReply.replace(/<[^>]*>/g, '').replace(/[*_`#]/g, '').trim();
          console.log(`[NEXA-ADAPTER-MOBILE] 🗣️ Speaking reply on phone: "${replyText}"`);
          await this.speakText(replyText);
        }
      } catch (err) {
        console.error('[NEXA-ADAPTER-MOBILE] Error processing legacy call audio reply:', err.message);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. UNIFIED HARDWARE ACTION ENGINE (Tangan & Eksekusi)
  // ─────────────────────────────────────────────────────────────

  /**
   * Core execution gateway with Strict 5s Anti-Ghost Timeout.
   * @param {string} action
   * @param {Object} params
   * @param {Object} [options]
   * @returns {Promise<{ success: boolean, message: string, data: Object }>}
   */
  async execute(action, params = {}, options = {}) {
    const timeoutMs = options.timeoutMs || 5000;
    const res = await mobileClient.sendCommand(action, params, { timeoutMs });
    if (res && res.success && res.data) {
      const act = String(action).toUpperCase();
      if (act === 'GET_SCREEN_STATUS' && typeof res.data.screen_on === 'boolean') {
        if (!this.latestTelemetry) this.latestTelemetry = {};
        this.latestTelemetry.screen_on = res.data.screen_on;
        this.latestTelemetry.is_screen_on = res.data.screen_on;
        this.latestTelemetry.screen_state = res.data.screen_state || (res.data.screen_on ? 'ON' : 'OFF');
        this.latestTelemetry.updated_at = new Date().toISOString();
        presenceModel.isScreenOn = res.data.screen_on;
      } else if (act === 'GET_LIGHT_STATUS' && (typeof res.data.lux === 'number' || res.data.state)) {
        presenceModel.updateFromContextEvent('LIGHT_CHANGED', {
          lux: typeof res.data.lux === 'number' ? res.data.lux : null,
          state: res.data.state || 'NORMAL'
        });
      } else if (act === 'GET_BATTERY_STATUS' && typeof res.data.battery_level === 'number') {
        presenceModel.batteryLevel = res.data.battery_level;
      }
    }
    return res;
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

  async getLocation(options = {}) {
    const timeoutMs = options.timeoutMs || 8000;
    return this.execute('GET_LOCATION', {}, { timeoutMs });
  }

  async speakText(text) {
    return this.execute('SPEAK_TEXT', { text });
  }

  // ── Screen & Navigation ───────────────────────────────────────

  async lockScreen() {
    return this.execute('LOCK_SCREEN');
  }

  async getScreenStatus() {
    const res = await this.execute('GET_SCREEN_STATUS');
    if (res && res.success && res.data && typeof res.data.screen_on === 'boolean') {
      if (!this.latestTelemetry) this.latestTelemetry = {};
      this.latestTelemetry.screen_on = res.data.screen_on;
      this.latestTelemetry.is_screen_on = res.data.screen_on;
      this.latestTelemetry.screen_state = res.data.screen_state || (res.data.screen_on ? 'ON' : 'OFF');
      this.latestTelemetry.updated_at = new Date().toISOString();
      presenceModel.isScreenOn = res.data.screen_on;
    }
    return res;
  }

  async getLightStatus() {
    const res = await this.execute('GET_LIGHT_STATUS');
    if (res && res.success && res.data && (typeof res.data.lux === 'number' || res.data.state)) {
      presenceModel.updateFromContextEvent('LIGHT_CHANGED', {
        lux: typeof res.data.lux === 'number' ? res.data.lux : null,
        state: res.data.state || 'NORMAL'
      });
    }
    return res;
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

  async endCall() {
    try {
      const liveVoice = require('../../../core/Live_Voice_Engine');
      liveVoice.closeAllLiveSessions();
    } catch (_) {}
    return this.execute('END_CALL', {}, { timeoutMs: 3000 });
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

  isConnected() {
    return mobileClient.isConnected();
  }

  isOnline() {
    return this.isConnected();
  }

  isScreenActive(maxStaleMs = 300000) {
    if (!this.isConnected()) {
      return false;
    }

    const telemetry = this.latestTelemetry;
    if (!telemetry || typeof telemetry !== 'object') {
      return false;
    }

    const timestampStr = telemetry.updated_at || telemetry.received_at;
    if (timestampStr) {
      const ageMs = Date.now() - new Date(timestampStr).getTime();
      if (ageMs > maxStaleMs) {
        return false;
      }
    }

    const isScreenOn = telemetry.screen_on === true || 
                       telemetry.is_screen_on === true || 
                       telemetry.screenOn === true ||
                       telemetry.screen_state === 'ON';

    return Boolean(isScreenOn);
  }

  getSnapshot() {
    return {
      is_online: this.isOnline(),
      is_screen_active: this.isScreenActive(),
      telemetry: this.latestTelemetry,
      context: this.latestContext
    };
  }
}

module.exports = new NexaBridgeAdapter();
