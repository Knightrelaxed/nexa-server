// ============================================================
// N.E.X.A 3.3 — MOBILE BRIDGE ADAPTER (BACKWARD-COMPATIBILITY SHIM)
// Delegates all calls to the modularized Mobile Bridge Adapter:
//   src/interfaces/bridge/mobile_bridge/adapter.js
// ============================================================
'use strict';

const mobileAdapter = require('../bridge/mobile_bridge/adapter');

module.exports = mobileAdapter;
