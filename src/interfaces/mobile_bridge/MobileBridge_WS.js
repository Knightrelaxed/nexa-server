// ============================================================
// N.E.X.A 3.3 — MOBILE BRIDGE WEBSOCKET (BACKWARD-COMPATIBILITY SHIM)
// Delegates all calls to the modularized Unified Bridge Gateway:
//   src/interfaces/bridge/gateway.js
//   src/interfaces/bridge/mobile_bridge/client.js
//   src/interfaces/bridge/windows_bridge/client.js
// ============================================================
'use strict';

const bridge = require('../bridge');
const mobileClient = bridge.mobile.client;
const windowsClient = bridge.windows.client;
const gateway = bridge.gateway;

function isDesktopAction(action) {
  const act = String(action || '').toUpperCase();
  return act.startsWith('DESKTOP_') ||
         act === 'HIGHLIGHT_ELEMENT' ||
         act === 'POINT_CURSOR' ||
         act === 'CLEAR_HIGHLIGHTS' ||
         act === 'CAPTURE_WINDOW' ||
         act === 'GET_SYSTEM_METRICS';
}

function sendCommand(action, params = {}, options = {}) {
  const target = options.target || (isDesktopAction(action) ? 'desktop' : 'mobile');
  if (target === 'desktop') {
    return windowsClient.sendCommand(action, params, options);
  }
  return mobileClient.sendCommand(action, params, options);
}

function isConnected(deviceType = null) {
  if (deviceType === 'desktop') {
    return windowsClient.isConnected();
  }
  if (deviceType === 'mobile') {
    return mobileClient.isConnected();
  }
  return mobileClient.isConnected() || windowsClient.isConnected();
}

module.exports = {
  initWebSocket: gateway.initWebSocket,
  closeWebSocket: gateway.closeWebSocket,
  sendCommand,
  setOnTelemetryListener: mobileClient.setOnTelemetryListener,
  getLatestTelemetry: mobileClient.getLatestTelemetry,
  requestOverlay: mobileClient.requestOverlay,
  isConnected,
  getActiveClient: () => mobileClient.getClient() || windowsClient.getClient() || null,
  getClient: (deviceType = 'mobile') => deviceType === 'desktop' ? windowsClient.getClient() : mobileClient.getClient(),
  getActiveClients: () => ({
    mobile: mobileClient.getClient(),
    desktop: windowsClient.getClient()
  })
};
