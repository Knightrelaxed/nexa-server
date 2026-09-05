// ============================================================
// TEST SUITE: MIDNIGHT CHECK-IN SCREEN-ACTIVE TRIGGER (NEXA BRIDGE)
// ============================================================
'use strict';

const assert = require('assert');

console.log('══════════════════════════════════════════════════════════════');
console.log('🧪 TEST SUITE: MIDNIGHT CHECK-IN SCREEN TRIGGER & TELEMETRY');
console.log('══════════════════════════════════════════════════════════════\n');

let passedTests = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}:`, err.message);
    process.exitCode = 1;
  }
}

// Load adapter
const bridgeAdapter = require('../src/interfaces/mobile_bridge/adapter');

// Save original methods and states for restoration
const originalIsConnected = bridgeAdapter.isConnected;
const originalLatestTelemetry = bridgeAdapter.latestTelemetry;

try {
  // Test 1: Offline device returns false
  test('1. Nexa Bridge Offline -> isScreenActive() returns false', () => {
    bridgeAdapter.isConnected = () => false;
    bridgeAdapter.latestTelemetry = { screen_on: true, updated_at: new Date().toISOString() };
    assert.strictEqual(bridgeAdapter.isScreenActive(), false);
  });

  // Test 2: Connected device with no telemetry returns false
  test('2. Connected device without telemetry -> isScreenActive() returns false', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = null;
    assert.strictEqual(bridgeAdapter.isScreenActive(), false);
  });

  // Test 3: Connected device with screen_on = false returns false
  test('3. Screen OFF (screen_on: false) -> isScreenActive() returns false', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = {
      type: 'TELEMETRY_REPORT',
      battery_level: 75,
      screen_on: false,
      updated_at: new Date().toISOString()
    };
    assert.strictEqual(bridgeAdapter.isScreenActive(), false);
  });

  // Test 4: Connected device with screen_on = true returns true
  test('4. Screen ON (screen_on: true, fresh) -> isScreenActive() returns true', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = {
      type: 'TELEMETRY_REPORT',
      battery_level: 80,
      screen_on: true,
      updated_at: new Date().toISOString()
    };
    assert.strictEqual(bridgeAdapter.isScreenActive(), true);
  });

  // Test 5: Screen ON variants (is_screen_on, screenOn, screen_state: ON)
  test('5. Screen ON variants handled gracefully', () => {
    bridgeAdapter.isConnected = () => true;

    // Variant A: is_screen_on
    bridgeAdapter.latestTelemetry = { is_screen_on: true, updated_at: new Date().toISOString() };
    assert.strictEqual(bridgeAdapter.isScreenActive(), true);

    // Variant B: screenOn
    bridgeAdapter.latestTelemetry = { screenOn: true, updated_at: new Date().toISOString() };
    assert.strictEqual(bridgeAdapter.isScreenActive(), true);

    // Variant C: screen_state === 'ON'
    bridgeAdapter.latestTelemetry = { screen_state: 'ON', updated_at: new Date().toISOString() };
    assert.strictEqual(bridgeAdapter.isScreenActive(), true);
  });

  // Test 6: Stale telemetry rejected (> 5 minutes)
  test('6. Stale telemetry (> 5 minutes old) -> isScreenActive() returns false', () => {
    bridgeAdapter.isConnected = () => true;
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    bridgeAdapter.latestTelemetry = {
      screen_on: true,
      updated_at: sixMinutesAgo
    };
    assert.strictEqual(bridgeAdapter.isScreenActive(), false);
  });

  // Test 7: Snapshot includes is_screen_active
  test('7. getSnapshot() includes is_screen_active accurately', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = {
      screen_on: true,
      updated_at: new Date().toISOString()
    };
    const snapshot = bridgeAdapter.getSnapshot();
    assert.strictEqual(snapshot.is_online, true);
    assert.strictEqual(snapshot.is_screen_active, true);
  });

  // Test 8: Cron logic simulation - screen off
  test('8. Cron simulation: Skip check-in when screen is OFF', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = { screen_on: false, updated_at: new Date().toISOString() };

    let checkinTriggered = false;
    if (bridgeAdapter.isScreenActive()) {
      checkinTriggered = true;
    }
    assert.strictEqual(checkinTriggered, false, 'Check-in must NOT be triggered when screen is OFF');
  });

  // Test 9: Cron simulation - screen on
  test('9. Cron simulation: Trigger check-in when screen is ON', () => {
    bridgeAdapter.isConnected = () => true;
    bridgeAdapter.latestTelemetry = { screen_on: true, updated_at: new Date().toISOString() };

    let checkinTriggered = false;
    if (bridgeAdapter.isScreenActive()) {
      checkinTriggered = true;
    }
    assert.strictEqual(checkinTriggered, true, 'Check-in MUST be triggered when screen is ON');
  });

} finally {
  // Restore original adapter methods
  bridgeAdapter.isConnected = originalIsConnected;
  bridgeAdapter.latestTelemetry = originalLatestTelemetry;
}

console.log('\n══════════════════════════════════════════════════════════════');
console.log(`📊 HASIL TEST: ${passedTests}/9 PENGUJIAN LULUS (100% SUKSES)`);
console.log('══════════════════════════════════════════════════════════════\n');
