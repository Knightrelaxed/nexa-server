'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const {
  HistoryStore,
  HEADER_BYTES,
  RECORD_BYTES,
  DEFAULT_CAPACITY,
  FLAG_MOBILE_ONLINE,
  FLAG_WINDOWS_ONLINE,
  FLAG_RESTARTED
} = require('../src/monitor/history_store');
const { MetricsCollector } = require('../src/monitor/metrics_collector');
const { SystemdInspector, parseSystemctlShow } = require('../src/monitor/systemd_inspector');
const { AlertEngine } = require('../src/monitor/alert_engine');
const { createMonitor } = require('../src/monitor');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('HistoryStore maintains exact fixed file size (725,784 bytes at 7d capacity) and survives wraparound reload', () => {
  const tmpDir = makeTmpDir('nexa-hist-fixed-');
  try {
    // 1. Verify default 7-day fixed ceiling size
    const defaultPath = path.join(tmpDir, 'default_7d.bin');
    const fullStore = new HistoryStore({ filePath: defaultPath });
    assert.equal(fullStore.expectedFileSize, HEADER_BYTES + (DEFAULT_CAPACITY * RECORD_BYTES));
    assert.equal(fullStore.expectedFileSize, 725784);
    assert.equal(fs.statSync(defaultPath).size, 725784);

    // 2. Verify circular wraparound with small capacity=20
    const ringPath = path.join(tmpDir, 'ring_20.bin');
    const cap = 20;
    const expectedRingSize = HEADER_BYTES + (cap * RECORD_BYTES);
    const store = new HistoryStore({ filePath: ringPath, capacity: cap, hotRingMax: 10 });
    assert.equal(fs.statSync(ringPath).size, expectedRingSize);

    const baseTs = 1_760_000_000;
    for (let i = 0; i < 15; i++) {
      store.append({
        tsSec: baseTs + (i * 60),
        cpuPct: i * 1.5,
        vpsCpuPct: i * 2,
        vpsAvailMb: 340 - i,
        rssMb: 180 + i,
        heapUsedMb: 90 + i,
        heapTotalMb: 120 + i,
        elMeanMs: 0.4,
        elP95Ms: 1.5,
        httpReqMin: i,
        httpMeanMs: 1.2,
        httpP95Ms: 5.5,
        activeHandles: 5 + i,
        activeReqs: 0,
        issuesDelta: 0,
        flags: FLAG_MOBILE_ONLINE | FLAG_WINDOWS_ONLINE,
        aiReqMin: 2.5,
        aiMeanMs: 800
      });
    }
    assert.equal(store.flush(), 15);
    for (let i = 15; i < 35; i++) {
      store.append({
        tsSec: baseTs + (i * 60),
        cpuPct: i * 1.5,
        vpsCpuPct: i * 2,
        vpsAvailMb: 340 - i,
        rssMb: 180 + i,
        heapUsedMb: 90 + i,
        heapTotalMb: 120 + i,
        elMeanMs: 0.4,
        elP95Ms: 1.5 + (i === 30 ? 45 : 0),
        httpReqMin: i,
        httpMeanMs: 1.2,
        httpP95Ms: 5.5,
        activeHandles: 5 + i,
        activeReqs: 0,
        issuesDelta: i === 30 ? 2 : 0,
        flags: FLAG_MOBILE_ONLINE | FLAG_WINDOWS_ONLINE,
        aiReqMin: 2.5,
        aiMeanMs: 800
      });
    }
    assert.equal(store.flush(), 20);
    // File size MUST remain strictly constant after wraparound
    assert.equal(fs.statSync(ringPath).size, expectedRingSize);

    // Reload into fresh instance and verify oldest 15 records were overwritten, newest 20 remain in order
    const reloaded = new HistoryStore({ filePath: ringPath, capacity: cap, hotRingMax: 10 });
    const nowSec = baseTs + (35 * 60);
    const all = reloaded.queryRange(7 * 86400, 100, nowSec);
    assert.equal(all.length, 20);
    assert.equal(all[0].tsSec, baseTs + (15 * 60));
    assert.equal(all[19].tsSec, baseTs + (34 * 60));
    assert.equal(all[15].issuesDelta, 2);
    assert.equal(all[15].mobileOnline, true);
    assert.equal(all[15].windowsOnline, true);

    // Downsampling preserves max spikes (elP95Ms) and sums issuesDelta
    const downsampled = reloaded.queryRange(7 * 86400, 10, nowSec);
    assert.equal(downsampled.length, 10);
    const maxElP95 = Math.max(...downsampled.map(p => p.elP95Ms));
    const totalIssues = downsampled.reduce((acc, p) => acc + p.issuesDelta, 0);
    assert.ok(maxElP95 >= 46, `Expected spike preserved in downsampling, got ${maxElP95}`);
    assert.equal(totalIssues, 2);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HistoryStore.getHealthHeatmap classifies nodata, healthy, degraded, and incident hours accurately', () => {
  const store = new HistoryStore({ filePath: null, capacity: 500, hotRingMax: 500 });
  const nowHour = Math.floor(1_760_500_000 / 3600) * 3600;

  // Hour -3: healthy
  store.append({ tsSec: nowHour - 3 * 3600 + 60, rssMb: 185, heapUsedMb: 90, heapTotalMb: 120, cpuPct: 2, elP95Ms: 1.4, issuesDelta: 0, flags: 0 });
  // Hour -2: degraded (elP95 > 50ms)
  store.append({ tsSec: nowHour - 2 * 3600 + 60, rssMb: 190, heapUsedMb: 92, heapTotalMb: 120, cpuPct: 5, elP95Ms: 65, issuesDelta: 0, flags: 0 });
  // Hour -1: incident (restarted flag)
  store.append({ tsSec: nowHour - 1 * 3600 + 60, rssMb: 180, heapUsedMb: 85, heapTotalMb: 120, cpuPct: 3, elP95Ms: 1.0, issuesDelta: 0, flags: FLAG_RESTARTED });
  // Hour 0 (current): healthy
  store.append({ tsSec: nowHour + 60, rssMb: 182, heapUsedMb: 88, heapTotalMb: 120, cpuPct: 1.5, elP95Ms: 1.2, issuesDelta: 0, flags: 0 });

  const heatmap = store.getHealthHeatmap(24, nowHour + 120);
  assert.equal(heatmap.cells.length, 24);
  assert.equal(heatmap.observedHours, 4);
  assert.equal(heatmap.healthyPct, 50); // 2 healthy out of 4 observed

  const byHour = new Map(heatmap.cells.map(c => [c.hourStartSec, c]));
  assert.equal(byHour.get(nowHour - 4 * 3600).status, 'nodata');
  assert.equal(byHour.get(nowHour - 3 * 3600).status, 'healthy');
  assert.equal(byHour.get(nowHour - 2 * 3600).status, 'degraded');
  assert.equal(byHour.get(nowHour - 1 * 3600).status, 'incident');
  assert.equal(byHour.get(nowHour).status, 'healthy');
});

test('MetricsCollector HTTP middleware tracks concurrency/latency, excludes /monitor/, and resetMonit clears histograms', () => {
  let fakeNow = 1_760_000_000_000;
  const collector = new MetricsCollector({ nowFn: () => fakeNow });
  try {
    const mw = collector.httpMetricsMiddleware();

    // 1. /monitor/ paths are excluded from app HTTP metrics
    let nextCalled = false;
    const resMon = new EventEmitter();
    mw({ originalUrl: '/monitor/api/overview' }, resMon, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(collector.getHttpStats().activeRequests, 0);
    resMon.emit('finish');
    assert.equal(collector.getHttpStats().sampleCount, 0);

    // 2. Normal endpoint increments activeRequests and settles ONCE even if both finish & close fire
    const resApp = new EventEmitter();
    mw({ originalUrl: '/health' }, resApp, () => {});
    assert.equal(collector.getHttpStats().activeRequests, 1);
    resApp.emit('finish');
    resApp.emit('close');
    assert.equal(collector.getHttpStats().activeRequests, 0);
    assert.equal(collector.getHttpStats().sampleCount, 1);

    // 3. Direct latency samples & AI calls + resetMonit
    collector.recordHttpRequest(10, fakeNow);
    collector.recordHttpRequest(20, fakeNow);
    collector.recordHttpRequest(100, fakeNow);
    const httpStats = collector.getHttpStats(fakeNow);
    assert.equal(httpStats.reqPerMin, 4);
    assert.ok(httpStats.p95Ms >= 100);

    collector.recordAiCall(820, { ok: true }, fakeNow);
    collector.recordAiCall(1180, { ok: false }, fakeNow);
    const aiStats = collector.getAiStats(fakeNow);
    assert.equal(aiStats.reqPerMin, 2);
    assert.equal(aiStats.meanMs, 1000);
    assert.equal(aiStats.errorsTotal, 1);

    const snap = collector.collectSnapshot();
    assert.ok(snap.memory.rssMb > 0);
    assert.ok(snap.runtime.activeHandles >= 0);
    assert.equal(typeof snap.git.branch, 'string');

    collector.resetMonit();
    assert.equal(collector.getHttpStats(fakeNow).sampleCount, 0);
    assert.equal(collector.getAiStats(fakeNow).sampleCount, 0);
    assert.equal(collector.getAiStats(fakeNow).errorsTotal, 0);
  } finally {
    collector.destroy();
  }
});

test('SystemdInspector enforces strict allowlist, parses systemctl show, and executes narrow Polkit restart', async () => {
  const parsed = parseSystemctlShow([
    'LoadState=loaded',
    'ActiveState=active',
    'SubState=running',
    'MainPID=14829',
    'MemoryCurrent=195035136',
    'NRestarts=2',
    'ActiveEnterTimestamp=Sat 2026-11-21 00:00:00 UTC'
  ].join('\n'));
  assert.equal(parsed.installed, true);
  assert.equal(parsed.activeState, 'active');
  assert.equal(parsed.pid, 14829);
  assert.equal(parsed.memoryMb, 186);
  assert.equal(parsed.restarts, 2);

  const calls = [];
  const fakeExec = (bin, args, opts, cb) => {
    calls.push({ bin, args });
    if (args[0] === '--version') return cb(null, 'systemd 255 (255.4-1ubuntu8.18)\n', '');
    if (args[0] === 'show' && args[1] === 'nexa-server.service') {
      return cb(null, 'LoadState=loaded\nActiveState=active\nSubState=running\nMainPID=999\nMemoryCurrent=157286400\nNRestarts=1\n', '');
    }
    if (args[0] === 'show') {
      return cb(null, 'LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\nMemoryCurrent=[not set]\nNRestarts=0\n', '');
    }
    if (args[0] === '--no-block' && args[1] === 'restart' && args[2] === 'nexa-server.service') {
      return cb(null, '', '');
    }
    return cb(new Error('unexpected command'));
  };

  const inspector = new SystemdInspector({
    platform: 'linux',
    execFileFn: fakeExec,
    termKillSwitchFile: path.join(os.tmpdir(), 'nonexistent-term-flag-xyz')
  });

  // Allowlist check
  await assert.rejects(() => inspector._inspectUnit('sshd.service'), /FORBIDDEN_UNIT/);

  const status = await inspector.getServicesStatus({ cpuPct: 1.4, rssMb: 186 });
  assert.equal(status.manager, 'systemd');
  assert.equal(status.systemdVersion, 'systemd 255');
  assert.equal(status.canPolkitRestart, true);
  assert.equal(status.units.length, 4);
  assert.equal(status.units[0].name, 'nexa-server.service');
  assert.equal(status.units[0].memoryMb, 150);

  const restartRes = await inspector.restartNexaServer();
  assert.equal(restartRes.ok, true);
  assert.equal(restartRes.code, 'RESTART_SCHEDULED');
  const restartCall = calls.find(c => c.args[0] === '--no-block');
  assert.deepEqual(restartCall, { bin: 'systemctl', args: ['--no-block', 'restart', 'nexa-server.service'] });
});

test('AlertEngine enforces sustained breach streaks, 15m cooldown, and rule persistence', async () => {
  const tmpDir = makeTmpDir('nexa-alerts-');
  try {
    const configPath = path.join(tmpDir, 'alerts.json');
    let fakeNow = 1_760_000_000_000;
    const sent = [];
    const engine = new AlertEngine({
      configPath,
      nowFn: () => fakeNow,
      cooldownMs: 15 * 60_000,
      notifyFn: async (p) => { sent.push(p); }
    });

    // High RSS needs 3 consecutive minutes > 300 MiB
    await engine.evaluateSample({ rssMb: 315, vpsAvailMb: 300, elP95Ms: 2 });
    await engine.evaluateSample({ rssMb: 320, vpsAvailMb: 300, elP95Ms: 2 });
    assert.equal(sent.length, 0, '2-minute spike must NOT trigger 3-minute sustained alert');

    // Dip below threshold resets streak
    await engine.evaluateSample({ rssMb: 280, vpsAvailMb: 300, elP95Ms: 2 });
    await engine.evaluateSample({ rssMb: 310, vpsAvailMb: 300, elP95Ms: 2 });
    await engine.evaluateSample({ rssMb: 312, vpsAvailMb: 300, elP95Ms: 2 });
    assert.equal(sent.length, 0);

    // 3rd consecutive breach fires!
    const fired = await engine.evaluateSample({ rssMb: 325, vpsAvailMb: 300, elP95Ms: 2 });
    assert.equal(fired.length, 1);
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /High Node RSS Memory: 325 MiB/);

    // Immediate next minute must be suppressed by 15m cooldown
    fakeNow += 60_000;
    await engine.evaluateSample({ rssMb: 330, vpsAvailMb: 300, elP95Ms: 2 });
    assert.equal(sent.length, 1);

    // After 15m cooldown expires, fires again
    fakeNow += 15 * 60_000;
    await engine.evaluateSample({ rssMb: 335, vpsAvailMb: 300, elP95Ms: 2 });
    assert.equal(sent.length, 2);

    // Rule toggle persistence
    engine.setRuleEnabled('http_5xx_spike', true);
    engine.setRuleEnabled('high_rss', false);
    const reloaded = new AlertEngine({ configPath });
    const ruleMap = new Map(reloaded.getRules().map(r => [r.id, r.enabled]));
    assert.equal(ruleMap.get('http_5xx_spike'), true);
    assert.equal(ruleMap.get('high_rss'), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createMonitor facade wires overview, sampleOnce, and clean destroy', async () => {
  const tmpDir = makeTmpDir('nexa-mon-facade-');
  const mon = createMonitor({
    dataDir: tmpDir,
    historyCapacity: 60,
    notifyFn: async () => {},
    domainStatsProvider: () => ({
      mobile: { connected: true, rttMs: 36, uptimeSec: 1200, pendingProactive: 0 },
      windows: { connected: false, rttMs: null, uptimeSec: 0 },
      activeLiveCalls: 0,
      enrolledDevices: 1
    })
  });
  try {
    mon.recordAiCall(450, { ok: true });
    mon.registerCronJob('finance_auto_sync', '*/3 * * * *');
    mon.recordCronRun('finance_auto_sync', 'ok', 142);
    await mon.sampleOnce();
    const overview = await mon.getOverview();
    assert.ok(overview.snapshot.memory.rssMb > 0);
    assert.ok(overview.snapshot.disk && overview.snapshot.disk.totalGb >= 0);
    assert.ok(overview.snapshot.runtime.hostname && overview.snapshot.runtime.privateIp);
    assert.equal(overview.snapshot.domain.mobile.connected, true);
    assert.equal(overview.cronJobs.length, 1);
    assert.equal(overview.cronJobs[0].lastStatus, 'ok');
    assert.equal(overview.cronJobs[0].lastDurationMs, 142);
    assert.equal(overview.spark1h.length, 1);
    assert.equal(overview.heatmap.cells.length, 168);
    assert.equal(overview.services.units.length, 4);
  } finally {
    mon.destroy();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Paket B: AlertEngine editable thresholds, cooldown persistence, sendTestAlert, and Provider_Health resetBreakers', async () => {
  const tmpDir = makeTmpDir('nexa-mon-paketb-');
  const configPath = path.join(tmpDir, 'alerts.json');
  const sent = [];
  const providerHealth = require('../src/core/Provider_Health');
  providerHealth._reset();

  try {
    const engine = new AlertEngine({
      configPath,
      notifyFn: async (p) => { sent.push(p); }
    });

    const updated = engine.updateRule('high_rss', { enabled: true, thresholdMb: 340, sustainedMinutes: 5 });
    assert.equal(updated.thresholdMb, 340);
    assert.equal(updated.sustainedMinutes, 5);
    assert.match(updated.description, /340 MiB/);
    assert.equal(engine.setCooldownMinutes(30), 30);

    // Reload from disk and verify thresholds + cooldown persisted
    const reloaded = new AlertEngine({ configPath, notifyFn: async (p) => { sent.push(p); } });
    assert.equal(reloaded.getCooldownMinutes(), 30);
    const reloadedRss = reloaded.getRules().find(r => r.id === 'high_rss');
    assert.equal(reloadedRss.thresholdMb, 340);
    assert.equal(reloadedRss.sustainedMinutes, 5);

    // Send Test Alert
    const testRes = await reloaded.sendTestAlert({ mobileConnected: true });
    assert.equal(testRes.ok, true);
    assert.equal(testRes.channel, 'mobile_bridge');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, 'SERVER_ALERT_TEST');

    // Provider_Health snapshot + resetBreakers
    providerHealth.reportFailure('gemini-flash', 'k1', { status: 503, message: '503' });
    providerHealth.reportFailure('gemini-flash', 'k1', { status: 503, message: '503' });
    providerHealth.reportFailure('gemma-26b', 'k2', { status: 429, message: '429 rate limit' });
    const snapBefore = providerHealth.snapshot();
    assert.equal(snapBefore.groups['gemini-flash'].state, 'OPEN');
    assert.equal(snapBefore.keysCoolingDown.length, 1);

    const cleared = providerHealth.resetBreakers();
    assert.equal(cleared.clearedGroups, 2);
    assert.equal(cleared.clearedKeys, 1);
    const snapAfter = providerHealth.snapshot();
    assert.equal(Object.keys(snapAfter.groups).length, 0);
    assert.equal(snapAfter.keysCoolingDown.length, 0);
  } finally {
    providerHealth._reset();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
