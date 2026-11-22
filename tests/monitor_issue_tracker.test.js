'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { IssueTracker } = require('../src/monitor/issue_tracker');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('IssueTracker deduplicates dynamic errors, redacts secrets (FR-SEC-04), and computes -1h/-24h/-7d windows', () => {
  const tmpDir = makeTmpDir('nexa-issues-');
  try {
    const filePath = path.join(tmpDir, 'monitor_issues.json');
    let fakeNow = 1_760_500_000_000;
    const tracker = new IssueTracker({
      filePath,
      nowFn: () => fakeNow,
      getCommitFn: () => '7c511ed',
      saveDebounceMs: 0
    });

    // 1. Dynamic IDs & timestamps normalize to the same fingerprint
    const err1 = new Error('Timeout fetching request 123456 for user 550e8400-e29b-41d4-a716-446655440000');
    err1.stack = 'Error: Timeout fetching request 123456\n    at syncBridgePayload (c:/workspace/nexa-server/src/interfaces/webhook.js:104:19)';
    const g1 = tracker.recordIssue('HTTP-5XX', err1, { method: 'POST', route: '/webhook/bridge/sync?token=super_secret_token_value', statusCode: 502 });

    fakeNow += 10 * 60_000; // +10 min
    const err2 = new Error('Timeout fetching request 987654 for user 660e8400-e29b-41d4-a716-446655440099');
    err2.stack = 'Error: Timeout fetching request 987654\n    at syncBridgePayload (c:/workspace/nexa-server/src/interfaces/webhook.js:104:19)';
    const g2 = tracker.recordIssue('HTTP-5XX', err2, { method: 'POST', route: '/webhook/bridge/sync', statusCode: 502 });

    assert.equal(g1.fingerprint, g2.fingerprint);
    assert.equal(g2.count, 2);
    assert.equal(g2.culprit, 'src/interfaces/webhook.js:104:19');
    assert.equal(g2.commit, '7c511ed');

    // 2. FR-SEC-04 redaction in message, stack, and disk file
    const secretErr = new Error('Upstream failed with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123def456ghi789 and key AIzaSyB1234567890abcdefghijklmno');
    secretErr.stack = 'Error: secret leak\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n-----END PRIVATE KEY-----\n    at badFn (src/core/test.js:10:5)';
    const gSecret = tracker.recordIssue('SAFETY-NET', secretErr, { severity: 'fatal' });
    assert.ok(!gSecret.title.includes('eyJhbGciOiJIUzI1NiJ9'), 'JWT must be redacted');
    assert.ok(!gSecret.title.includes('AIzaSyB1234567890'), 'API key must be redacted');
    assert.ok(!gSecret.stack.includes('MIIEvQIBADAN'), 'PEM key must be redacted');

    const rawDisk = fs.readFileSync(filePath, 'utf8');
    assert.ok(!rawDisk.includes('super_secret_token_value'), 'Query token must not persist');
    assert.ok(!rawDisk.includes('AIzaSyB1234567890'), 'API key must not persist on disk');
    assert.ok(!rawDisk.includes('MIIEvQIBADAN'), 'PEM key must not persist on disk');

    // 3. Time-window summary accuracy
    const summaryNow = tracker.getSummary(fakeNow);
    assert.equal(summaryNow.last1h, 3);
    assert.equal(summaryNow.last24h, 3);
    assert.equal(summaryNow.last7d, 3);
    assert.equal(summaryNow.unresolved, 2);

    // Advance 2 hours -> last1h becomes 0, last24h still 3
    const summaryLater = tracker.getSummary(fakeNow + 2 * 3600_000);
    assert.equal(summaryLater.last1h, 0);
    assert.equal(summaryLater.last24h, 3);
    assert.equal(summaryLater.last7d, 3);

    // 4. Resolve & auto-reopen on recurrence
    tracker.resolveIssue(g1.fingerprint);
    assert.equal(tracker.getSummary(fakeNow).unresolved, 1);
    assert.equal(tracker.getSummary(fakeNow).resolved, 1);

    tracker.recordIssue('HTTP-5XX', err1);
    assert.equal(tracker.getIssue(g1.fingerprint).status, 'unresolved');
    assert.equal(tracker.getIssue(g1.fingerprint).count, 3);

    // 5. Persistence across reload + clearResolved
    tracker.resolveIssue(gSecret.fingerprint);
    tracker.flushSync();
    const reloaded = new IssueTracker({ filePath, nowFn: () => fakeNow });
    assert.equal(reloaded.listIssues().length, 2);
    assert.equal(reloaded.clearResolved(), 1);
    assert.equal(reloaded.listIssues().length, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('IssueTracker enforces maxIssues cap by evicting resolved issues before unresolved', () => {
  let fakeNow = 1_760_000_000_000;
  const tracker = new IssueTracker({ filePath: null, maxIssues: 10, nowFn: () => fakeNow });

  const resolvedFps = [];
  for (let i = 0; i < 10; i++) {
    fakeNow += 1000;
    const item = tracker.recordIssue('CORE', `Distinct error alpha_${String.fromCharCode(65 + i)}`);
    if (i < 3) {
      tracker.resolveIssue(item.fingerprint);
      resolvedFps.push(item.fingerprint);
    }
  }
  assert.equal(tracker.issues.size, 10);

  // Adding 2 new unresolved issues must evict from the 3 resolved ones first
  fakeNow += 1000;
  tracker.recordIssue('CORE', 'Brand new critical error omega_X');
  fakeNow += 1000;
  tracker.recordIssue('CORE', 'Brand new critical error omega_Y');

  assert.equal(tracker.issues.size, 10);
  const remaining = new Set(tracker.listIssues().map(i => i.fingerprint));
  assert.equal(remaining.has(resolvedFps[0]), false);
  assert.equal(remaining.has(resolvedFps[1]), false);
});
