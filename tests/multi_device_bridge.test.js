'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('../src/core/Live_Tool_Registry');
const mobileBridgeWs = require('../src/interfaces/mobile_bridge/MobileBridge_WS');
const legacyAdapter = require('../src/interfaces/mobile_bridge/adapter');
const bridge = require('../src/interfaces/bridge');

test('Multi-Device Tools: All 8 desktop automation and cognitive tools are declared', () => {
  const toolNames = LIVE_TOOL_DECLARATIONS.map(t => t.name);

  const expectedTools = [
    'desktopClick',
    'desktopScroll',
    'desktopTypeText',
    'desktopPressKey',
    'highlightElement',
    'pointCursor',
    'clearHighlights',
    'escalateToDeepThinking'
  ];

  for (const name of expectedTools) {
    assert.ok(toolNames.includes(name), `LIVE_TOOL_DECLARATIONS must include '${name}'`);
    const decl = LIVE_TOOL_DECLARATIONS.find(t => t.name === name);
    assert.ok(decl.description, `'${name}' must have a descriptive documentation string`);
    assert.ok(decl.parameters, `'${name}' must define parameters schema`);
  }
});

test('Desktop Automation Tools: desktopClick parameter validation', async () => {
  // Invalid coordinates
  const resInvalid = await executeLiveTool('desktopClick', { x: -10, y: 500 });
  assert.equal(resInvalid.status, 'ERROR');

  const resNan = await executeLiveTool('desktopClick', { x: 'abc', y: 500 });
  assert.equal(resNan.status, 'ERROR');
});

test('Desktop Automation Tools: highlightElement parameter validation', async () => {
  const resInvalid = await executeLiveTool('highlightElement', { ymin: 1200, xmin: 0, ymax: 500, xmax: 500 });
  assert.equal(resInvalid.status, 'ERROR');
});

test('Cognitive Tools: escalateToDeepThinking returns Extended Thinking status', async () => {
  const res = await executeLiveTool('escalateToDeepThinking', {
    reason: 'Analisis gramatikal teks Arab klasik dan dialektika retorika.',
    context: 'Surat Al-Baqarah ayat 255'
  });

  assert.equal(res.status, 'SUCCESS');
  assert.equal(res.action, 'escalateToDeepThinking');
  assert.equal(res.mode, 'DEEP_THINKING_ACTIVE');
  assert.equal(res.model, 'models/gemini-3.8-live-extended-thinking');
});

test('MobileBridge_WS: multi-device sendCommand handles offline routing cleanly', async () => {
  // When no device is connected, sendCommand returns OFFLINE status cleanly without throwing
  const resMobile = await mobileBridgeWs.sendCommand('flashlight.on', {});
  assert.equal(resMobile.success, false);
  assert.equal(resMobile.status, 'OFFLINE');

  const resDesktop = await mobileBridgeWs.sendCommand('DESKTOP_CLICK', { x: 500, y: 500 });
  assert.equal(resDesktop.success, false);
  assert.equal(resDesktop.status, 'OFFLINE');
  assert.match(resDesktop.message, /desktop bridge is offline/i);
});

test('MobileBridge_WS: isConnected supports device-specific checks', () => {
  assert.equal(mobileBridgeWs.isConnected('desktop'), false);
  assert.equal(mobileBridgeWs.isConnected('mobile'), false);
  assert.equal(mobileBridgeWs.isConnected(), false);
});

test('Bridge Subsystem: exports full modular interface structure', () => {
  assert.ok(bridge.gateway, 'gateway must be defined');
  assert.ok(bridge.mobile, 'mobile submodule must be defined');
  assert.ok(bridge.mobile.client, 'mobile.client must be defined');
  assert.ok(bridge.mobile.adapter, 'mobile.adapter must be defined');
  assert.ok(bridge.windows, 'windows submodule must be defined');
  assert.ok(bridge.windows.client, 'windows.client must be defined');
  assert.ok(bridge.windows.adapter, 'windows.adapter must be defined');

  assert.equal(typeof bridge.initWebSocket, 'function');
  assert.equal(typeof bridge.closeWebSocket, 'function');
  assert.equal(typeof bridge.isMobileConnected, 'function');
  assert.equal(typeof bridge.isWindowsConnected, 'function');
  assert.equal(typeof bridge.getConnectedDevices, 'function');

  assert.deepEqual(bridge.getConnectedDevices(), []);
  assert.equal(bridge.isMobileConnected(), false);
  assert.equal(bridge.isWindowsConnected(), false);
});

test('Bridge Gateway: resolveDeviceType correctly detects headers and query params', () => {
  const { resolveDeviceType } = bridge.gateway;

  // Header detection
  assert.equal(resolveDeviceType({ headers: { 'x-device-type': 'windows' }, url: '/ws' }), 'desktop');
  assert.equal(resolveDeviceType({ headers: { 'x-device-type': 'desktop' }, url: '/ws' }), 'desktop');
  assert.equal(resolveDeviceType({ headers: { 'x-device-type': 'thinkpad' }, url: '/ws' }), 'desktop');
  assert.equal(resolveDeviceType({ headers: { 'x-device-type': 'android' }, url: '/ws' }), 'mobile');

  // Query parameter detection
  assert.equal(resolveDeviceType({ headers: {}, url: '/ws?device=windows' }), 'desktop');
  assert.equal(resolveDeviceType({ headers: {}, url: '/ws?device_type=desktop' }), 'desktop');
  assert.equal(resolveDeviceType({ headers: {}, url: '/ws?device_type=mobile' }), 'mobile');

  // Default fallback
  assert.equal(resolveDeviceType({ headers: {}, url: '/ws' }), 'mobile');
});

test('Windows Bridge Adapter: high-level methods return clean offline status', async () => {
  const adapter = bridge.windows.adapter;

  const resClick = await adapter.click(100, 200);
  assert.equal(resClick.success, false);
  assert.equal(resClick.status, 'OFFLINE');

  const resScroll = await adapter.scroll(0, -3);
  assert.equal(resScroll.success, false);
  assert.equal(resScroll.status, 'OFFLINE');

  const resType = await adapter.typeText('Hello Nexa');
  assert.equal(resType.success, false);
  assert.equal(resType.status, 'OFFLINE');

  const resKey = await adapter.pressKey('ENTER');
  assert.equal(resKey.success, false);
  assert.equal(resKey.status, 'OFFLINE');

  const resHl = await adapter.highlightElement({ ymin: 100, xmin: 100, ymax: 200, xmax: 200 });
  assert.equal(resHl.success, false);
  assert.equal(resHl.status, 'OFFLINE');

  const resPt = await adapter.pointCursor(500, 500);
  assert.equal(resPt.success, false);
  assert.equal(resPt.status, 'OFFLINE');

  const resClr = await adapter.clearHighlights();
  assert.equal(resClr.success, false);
  assert.equal(resClr.status, 'OFFLINE');

  assert.equal(adapter.isConnected(), false);
  assert.equal(adapter.isOnline(), false);
  const snap = adapter.getSnapshot();
  assert.equal(snap.is_online, false);
});

test('Legacy Adapters: backward-compatibility shims retain identity and parity', () => {
  assert.equal(legacyAdapter, bridge.mobile.adapter, 'legacy adapter must equal modular mobile adapter singleton');
  assert.equal(typeof legacyAdapter.execute, 'function');
  assert.equal(typeof legacyAdapter.toggleFlashlight, 'function');
  assert.equal(typeof legacyAdapter.simulateIncomingCall, 'function');
  assert.equal(typeof legacyAdapter.isScreenActive, 'function');
  assert.equal(typeof legacyAdapter.getSnapshot, 'function');
});
