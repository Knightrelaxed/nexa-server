'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('../src/core/Live_Tool_Registry');
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

test('Device Clients: multi-device sendCommand handles offline routing cleanly', async () => {
  // When no device is connected, sendCommand returns OFFLINE status cleanly without throwing
  const resMobile = await bridge.mobile.client.sendCommand('flashlight.on', {});
  assert.equal(resMobile.success, false);
  assert.equal(resMobile.status, 'OFFLINE');

  const resDesktop = await bridge.windows.client.sendCommand('DESKTOP_CLICK', { x: 500, y: 500 });
  assert.equal(resDesktop.success, false);
  assert.equal(resDesktop.status, 'OFFLINE');
  assert.match(resDesktop.message, /desktop bridge is offline/i);
});

test('Device Clients: isConnected supports device-specific checks', () => {
  assert.equal(bridge.windows.client.isConnected(), false);
  assert.equal(bridge.mobile.client.isConnected(), false);
  assert.equal(bridge.isWindowsConnected(), false);
  assert.equal(bridge.isMobileConnected(), false);
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

test('Mobile Adapter: methods are exposed and functional', () => {
  const adapter = bridge.mobile.adapter;
  assert.equal(typeof adapter.execute, 'function');
  assert.equal(typeof adapter.toggleFlashlight, 'function');
  assert.equal(typeof adapter.simulateIncomingCall, 'function');
  assert.equal(typeof adapter.isScreenActive, 'function');
  assert.equal(typeof adapter.getSnapshot, 'function');
});

test('Bridge Gateway: Real WebSocket text JSON frame routing (Regression Test for buffer/text misclassification)', async () => {
  const http = require('http');
  const WebSocket = require('ws');
  const env = require('../src/config/env');

  const secret = String(env.NEXA_DEVICE_SECRET || env.NEXA_BRIDGE_SECRET || 'test-secret').trim();
  env.NEXA_DEVICE_SECRET = secret;

  // Create temporary HTTP server
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  bridge.gateway.initWebSocket(server);

  try {
    // 1. Verify unauthorized connection rejected
    const unauthWs = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const unauthRejected = await new Promise(resolve => {
      unauthWs.on('error', () => resolve(true));
      unauthWs.on('unexpected-response', (req, res) => {
        resolve(res.statusCode === 401);
      });
      setTimeout(() => resolve(false), 2000);
    });
    assert.equal(unauthRejected, true, 'Unauthenticated connection must be rejected with 401');

    // 2. Connect authorized client
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?device=android`, {
      headers: {
        Authorization: `Bearer ${secret}`
      }
    });

    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    assert.equal(bridge.mobile.client.isConnected(), true, 'Mobile client should be connected');

    // 3. Send text JSON frame: PING -> Expect PONG (Must NOT be swallowed as binary audio!)
    const pongPromise = new Promise(resolve => {
      ws.on('message', (data, isBinary) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'PONG') {
            resolve(msg);
          }
        } catch (_) {}
      });
    });

    ws.send(JSON.stringify({ type: 'PING' }));

    const pong = await Promise.race([
      pongPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('PING timed out - text frame swallowed as audio!')), 3000))
    ]);

    assert.ok(pong, 'Should receive PONG response');
    assert.equal(pong.type, 'PONG');

    // Clean up client
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  } finally {
    bridge.gateway.closeWebSocket();
    await new Promise(resolve => server.close(resolve));
  }
});
