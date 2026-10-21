// ============================================================
// N.E.X.A 3.3 — WINDOWS BRIDGE ADAPTER
// High-Level Desktop Automation & AR Guidance Adapter
// Companion for Lenovo ThinkPad X380 Yoga
// ============================================================
'use strict';

const windowsClient = require('./client');

class WindowsBridgeAdapter {
  constructor() {
    this.latestTelemetry = null;
    this.telemetryListeners = new Set();

    windowsClient.setOnTelemetryListener((telemetry) => {
      this.latestTelemetry = telemetry;
      this.telemetryListeners.forEach(fn => {
        try { fn(telemetry); } catch (_) {}
      });
    });
  }

  /**
   * Execute desktop action via Windows Bridge Client.
   * @param {string} action
   * @param {object} params
   * @param {object} options
   */
  async execute(action, params = {}, options = {}) {
    return windowsClient.sendCommand(action, params, options);
  }

  // ── Desktop Automation ────────────────────────────────────────

  async click(x, y, button = 'left', clickType = 'single') {
    return this.execute('DESKTOP_CLICK', { x, y, button, click_type: clickType });
  }

  async scroll(deltaX = 0, deltaY = 0) {
    return this.execute('DESKTOP_SCROLL', { delta_x: deltaX, delta_y: deltaY });
  }

  async typeText(text) {
    return this.execute('DESKTOP_TYPE_TEXT', { text });
  }

  async pressKey(key, modifiers = []) {
    return this.execute('DESKTOP_PRESS_KEY', { key, modifiers });
  }

  // ── AR Visual Guidance & Highlighting ─────────────────────────

  async highlightElement(selector, durationMs = 4000, style = {}) {
    return this.execute('HIGHLIGHT_ELEMENT', {
      ...selector,
      duration_ms: durationMs,
      style: {
        color: style.color || '#00E5FF',
        glow: style.glow !== false,
        pulse: style.pulse !== false,
        border_radius: style.border_radius || 6,
        border_width: style.border_width || 2,
        ...style
      }
    });
  }

  async pointCursor(x, y, label = '', durationMs = 3000) {
    return this.execute('POINT_CURSOR', {
      x,
      y,
      label,
      duration_ms: durationMs
    });
  }

  async clearHighlights() {
    return this.execute('CLEAR_HIGHLIGHTS');
  }

  // ── System Perception ─────────────────────────────────────────

  async captureScreen(windowHandle = null) {
    return this.execute('CAPTURE_WINDOW', { window_handle: windowHandle }, { timeoutMs: 8000 });
  }

  async getSystemMetrics() {
    return this.execute('GET_SYSTEM_METRICS');
  }

  // ── Status & Telemetry ────────────────────────────────────────

  isConnected() {
    return windowsClient.isConnected();
  }

  isOnline() {
    return this.isConnected();
  }

  onTelemetry(callback) {
    if (typeof callback === 'function') {
      this.telemetryListeners.add(callback);
    }
  }

  getSnapshot() {
    return {
      is_online: this.isOnline(),
      telemetry: this.latestTelemetry || windowsClient.getLatestTelemetry()
    };
  }
}

module.exports = new WindowsBridgeAdapter();
