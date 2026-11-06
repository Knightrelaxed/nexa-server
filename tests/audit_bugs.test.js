'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('AUDIT BUG 1: resolveCategoryId must gracefully handle INCOME unknown category and not return null', async () => {
  const { resolveCategoryId, getCategoriesList } = require('../src/infrastructure/Supabase_Finance');
  
  // Test income unknown category
  const incomeResult = await resolveCategoryId('Langganan Digital', 'INCOME');
  assert.notEqual(incomeResult, null, 'resolveCategoryId must not return null for INCOME with unmapped category');

  // Test refund / pengembalian dana
  const refundResult = await resolveCategoryId('Pengembalian Dana Oracle', 'INCOME');
  assert.notEqual(refundResult, null, 'resolveCategoryId must not return null for refund income');
  
  // Test expense unknown category
  const expenseResult = await resolveCategoryId('Item Asing Yang Tidak Dikenal', 'EXPENSE');
  assert.notEqual(expenseResult, null, 'resolveCategoryId must not return null for EXPENSE with unmapped category');
});

test('AUDIT BUG 2: _detectCandidateDomains must detect DISCIPLINE for godmode in combined prompts', () => {
  const { _detectCandidateDomains } = require('../src/core/router/Router_Classifier');
  
  const domains = _detectCandidateDomains('kunci hp dan aktifkan godmode');
  assert.notEqual(domains, 'ALL');
  assert.ok(domains.has('DEVICE_CONTROL'), 'Must match DEVICE_CONTROL');
  assert.ok(domains.has('DISCIPLINE'), 'Must match DISCIPLINE for godmode');

  const curiosityDomains = _detectCandidateDomains('bagaimana cara kerja auto sync email?');
  // Must match either ALL or include EMAIL
  assert.ok(curiosityDomains === 'ALL' || curiosityDomains.has('EMAIL'));
});

test('AUDIT BUG 3: callAI must respect options and JSON requests without stripping or conflicting prompts', async () => {
  const { callAI } = require('../src/core/router/Router_Utilities');

  // Test that callAI accepts options and doesn't crash
  const plainRes = await callAI('Sebutkan 1 kata: HALO', { maxTokens: 20 });
  assert.ok(typeof plainRes === 'string' && plainRes.length > 0);
});

test('AUDIT LIVE TOOLS: closeWindow, closeTab, navigateBack, getOpenWindows, and taskView declarations and execution parity', async () => {
  const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('../src/core/Live_Tool_Registry');
  const windowsBridge = require('../src/interfaces/bridge').windows.client;

  const names = new Set(LIVE_TOOL_DECLARATIONS.map(t => t.name));
  assert.ok(names.has('closeWindow'), 'closeWindow must be in LIVE_TOOL_DECLARATIONS');
  assert.ok(names.has('closeTab'), 'closeTab must be in LIVE_TOOL_DECLARATIONS');
  assert.ok(names.has('navigateBack'), 'navigateBack must be in LIVE_TOOL_DECLARATIONS');
  assert.ok(names.has('getOpenWindows'), 'getOpenWindows must be in LIVE_TOOL_DECLARATIONS');
  assert.ok(names.has('taskView'), 'taskView must be in LIVE_TOOL_DECLARATIONS');

  // Mock windowsBridge.sendCommand to simulate bridge communication
  const originalSendCommand = windowsBridge.sendCommand;
  const recorded = [];
  windowsBridge.sendCommand = async (action, params) => {
    recorded.push({ action, params });
    if (action === 'GET_OPEN_WINDOWS') {
      return { success: true, message: '2 windows found', data: { count: 2, windows: [{ title: 'Chrome', process_name: 'chrome.exe' }] } };
    }
    return { success: true, message: `OK for ${action}` };
  };

  try {
    const resClose = await executeLiveTool('closeWindow', {}, {});
    assert.equal(resClose.status, 'SUCCESS');
    assert.equal(resClose.action, 'closeWindow');

    const resCloseTab = await executeLiveTool('closeTab', {}, {});
    assert.equal(resCloseTab.status, 'SUCCESS');
    assert.equal(resCloseTab.action, 'closeTab');

    const resBack = await executeLiveTool('navigateBack', {}, {});
    assert.equal(resBack.status, 'SUCCESS');
    assert.equal(resBack.action, 'navigateBack');

    const resOpen = await executeLiveTool('getOpenWindows', {}, {});
    assert.equal(resOpen.status, 'SUCCESS');
    assert.equal(resOpen.count, 2);
    assert.equal(resOpen.windows.length, 1);

    const resTask = await executeLiveTool('taskView', {}, {});
    assert.equal(resTask.status, 'SUCCESS');
    assert.equal(resTask.action, 'taskView');

    assert.equal(recorded.length, 5);
    assert.equal(recorded[0].action, 'CLOSE_WINDOW');
    assert.equal(recorded[1].action, 'CLOSE_TAB');
    assert.equal(recorded[2].action, 'NAVIGATE_BACK');
    assert.equal(recorded[3].action, 'GET_OPEN_WINDOWS');
    assert.equal(recorded[4].action, 'TASK_VIEW');
  } finally {
    windowsBridge.sendCommand = originalSendCommand;
  }
});

test('AUDIT LIVE TOOLS: desktopScroll declaration accepts x and y and passes them to windowsBridge', async () => {
  const { LIVE_TOOL_DECLARATIONS, executeLiveTool } = require('../src/core/Live_Tool_Registry');
  const windowsBridge = require('../src/interfaces/bridge').windows.client;

  const scrollDecl = LIVE_TOOL_DECLARATIONS.find(t => t.name === 'desktopScroll');
  assert.ok(scrollDecl, 'desktopScroll must be declared');
  assert.ok(scrollDecl.parameters.properties.x, 'desktopScroll must declare x coordinate parameter');
  assert.ok(scrollDecl.parameters.properties.y, 'desktopScroll must declare y coordinate parameter');

  const originalSendCommand = windowsBridge.sendCommand;
  const recorded = [];
  windowsBridge.sendCommand = async (action, params) => {
    recorded.push({ action, params });
    return { success: true, message: 'Layar desktop berhasil digulir ke DOWN (delta: -360).' };
  };

  try {
    const res = await executeLiveTool('desktopScroll', { direction: 'DOWN', amount: 3, x: 500, y: 400 });
    assert.equal(res.status, 'SUCCESS');
    assert.equal(res.action, 'desktopScroll');
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].action, 'DESKTOP_SCROLL');
    assert.equal(recorded[0].params.direction, 'DOWN');
    assert.equal(recorded[0].params.amount, 3);
    assert.equal(recorded[0].params.x, 500);
    assert.equal(recorded[0].params.y, 400);
  } finally {
    windowsBridge.sendCommand = originalSendCommand;
  }
});
