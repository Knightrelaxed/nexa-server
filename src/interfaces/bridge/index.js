// ============================================================
// N.E.X.A 3.3 — BRIDGE SUBSYSTEM FACADE
// Unified entry point for all device bridges (Mobile & Windows)
// ============================================================
'use strict';

const gateway = require('./gateway');
const mobileClient = require('./mobile_bridge/client');
const mobileAdapter = require('./mobile_bridge/adapter');
const windowsClient = require('./windows_bridge/client');
const windowsAdapter = require('./windows_bridge/adapter');

module.exports = {
  gateway,
  initWebSocket: gateway.initWebSocket,
  closeWebSocket: gateway.closeWebSocket,
  getWss: gateway.getWss,

  // Device submodules
  mobile: {
    client: mobileClient,
    adapter: mobileAdapter
  },
  windows: {
    client: windowsClient,
    adapter: windowsAdapter
  },

  // Direct accessors
  mobileClient,
  mobileAdapter,
  windowsClient,
  windowsAdapter,

  // Status helpers
  isMobileConnected: () => mobileClient.isConnected(),
  isWindowsConnected: () => windowsClient.isConnected(),
  getConnectedDevices: () => {
    const devices = [];
    if (mobileClient.isConnected()) devices.push('mobile');
    if (windowsClient.isConnected()) devices.push('desktop');
    return devices;
  }
};
