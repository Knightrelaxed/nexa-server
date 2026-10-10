'use strict';
const test = require('node:test');
const assert = require('node:assert');
const health = require('../src/core/Provider_Health');
const { createNotifier, createMemoryStore, isQuietHour, DEFAULT_POLICY } = require('../src/core/Notifier');
const fi = require('../src/domain/Finance_Intel');

// ---------------- Provider_Health ----------------
test('group opens after repeated SERVER failures, half-open allows one probe, success closes', () => {
  health._reset();
  let t = 1_000_000; health._setClock(() => t);
  const boom = Object.assign(new Error('503 overloaded'), { status: 503 });
  assert.ok(health.acquire('gemini', 'k1'));
  health.reportFailure('gemini', 'k1', boom);
  assert.ok(health.acquire('gemini', 'k2'));           // 1 failure: still closed
  health.reportFailure('gemini', 'k2', boom);
  assert.equal(health.acquire('gemini', 'k3'), false); // open
  t += 91_000;                                         // window elapsed
  assert.equal(health.acquire('gemini', 'k3'), true);  // the single probe
  assert.equal(health.acquire('gemini', 'k4'), false); // second caller blocked
  health.reportSuccess('gemini', 'k3');
  assert.equal(health.acquire('gemini', 'k4'), true);
  assert.equal(health.snapshot().groups.gemini.state, 'CLOSED');
});

test('reopen window doubles on a failed probe', () => {
  health._reset();
  let t = 0; health._setClock(() => t);
  const boom = Object.assign(new Error('timeout'), { status: 504 });
  health.reportFailure('g', '0', boom); health.reportFailure('g', '0', boom);
  t += 91_000; assert.ok(health.acquire('g', '0'));
  health.reportFailure('g', '0', boom);
  assert.ok(health.snapshot().groups.g.reopenInMs > 50_000);
});

test('429 cools down only that key and honours Retry-After; validation errors never open a group', () => {
  health._reset();
  let t = 0; health._setClock(() => t);
  const rl = Object.assign(new Error('429 Please retry in 12.3s'), { status: 429 });
  assert.equal(health.reportFailure('g', 'k1', rl), 'RATE_LIMIT');
  assert.equal(health.acquire('g', 'k1'), false);
  assert.equal(health.acquire('g', 'k2'), true);
  t += 13_500; assert.equal(health.acquire('g', 'k1'), true);
  const bad = Object.assign(new Error('bad json'), { isValidation: true });
  for (let i = 0; i < 5; i++) health.reportFailure('g', 'k2', bad);
  assert.equal(health.acquire('g', 'k2'), true);
  assert.equal(health.classifyError(new Error('Quota exceeded per day')), 'QUOTA_DAILY');
});

test('orderKeys rotates the starting key', () => {
  health._reset();
  assert.deepEqual(health.orderKeys('g', 3), [0, 1, 2]);
  assert.deepEqual(health.orderKeys('g', 3), [1, 2, 0]);
  assert.deepEqual(health.orderKeys('g', 3), [2, 0, 1]);
});

// ---------------- Notifier ----------------
function setup(iso) {
  const sent = []; let clock = new Date(iso);
  const store = createMemoryStore();
  const n = createNotifier({ store, send: async (text, meta) => { sent.push({ text, ...meta }); }, now: () => clock });
  return { n, sent, store, setNow: d => { clock = new Date(d); } };
}

test('quiet hours detection (WIB)', () => {
  assert.equal(isQuietHour(new Date('2026-10-12T01:00:00+07:00'), DEFAULT_POLICY), true);
  assert.equal(isQuietHour(new Date('2026-10-12T05:00:00+07:00'), DEFAULT_POLICY), false);
  assert.equal(isQuietHour(new Date('2026-10-12T23:30:00+07:00'), DEFAULT_POLICY), true);
});

test('P0 passes at night, P1 is deferred at night then flushed after quiet hours', async () => {
  const { n, sent, setNow } = setup('2026-10-12T01:00:00+07:00');
  assert.equal((await n.notify({ kind: 'TX_CONFIRM', priority: 'P0', text: 'Konfirmasi Rp50.000' })).status, 'SENT');
  assert.equal((await n.notify({ kind: 'BUDGET', priority: 'P1', text: 'Budget makan 80%' })).status, 'QUEUED_DEFERRED');
  assert.equal(sent.length, 1);
  assert.equal((await n.flushDeferred()).status, 'STILL_QUIET');
  setNow('2026-10-12T05:30:00+07:00');
  assert.equal((await n.flushDeferred()).status, 'SENT');
  assert.match(sent[1].text, /Ditunda semalam/);
});

test('P1 daily cap demotes to digest; P2 always queues; digest merges into one message', async () => {
  const { n, sent } = setup('2026-10-12T10:00:00+07:00');
  for (let i = 0; i < 3; i++) assert.equal((await n.notify({ kind: 'K' + i, priority: 'P1', text: 'p1 ' + i })).status, 'SENT');
  assert.equal((await n.notify({ kind: 'K9', priority: 'P1', text: 'p1 over cap' })).status, 'QUEUED_DIGEST');
  assert.equal((await n.notify({ kind: 'PULSE', priority: 'P2', text: 'pulse siang' })).status, 'QUEUED_DIGEST');
  const before = sent.length;
  assert.equal((await n.flushDigest()).status, 'SENT');
  assert.equal(sent.length, before + 1);
  assert.equal((await n.flushDigest()).status, 'EMPTY');
});

test('dedupe by key, expiry, and engagement report', async () => {
  const { n, setNow } = setup('2026-10-12T10:00:00+07:00');
  assert.equal((await n.notify({ kind: 'B', priority: 'P0', text: 'a', dedupeKey: 'x' })).status, 'SENT');
  assert.equal((await n.notify({ kind: 'B', priority: 'P0', text: 'a', dedupeKey: 'x' })).reason, 'dedupe');
  assert.equal((await n.notify({ kind: 'B', priority: 'P0', text: 'old', expiresAt: '2026-10-12T09:00:00+07:00' })).reason, 'expired');
  assert.equal(await n.markEngaged('REPLY'), true);
  setNow('2026-10-12T11:00:00+07:00');
  const rep = await n.engagementReport(14);
  assert.equal(rep[0].kind, 'B');
  assert.equal(rep[0].engaged, 1);
});

// ---------------- Finance_Intel ----------------
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 3)).toISOString();

test('detects a monthly subscription, ignores irregular merchants, collapses same-day repeats', () => {
  const txs = [
    ...[ [2026,5,5],[2026,6,5],[2026,7,6],[2026,8,5],[2026,9,5] ].map(([y, m, d]) => ({ merchant: 'NETFLIX.COM 8821', nominal: 54000, date: iso(y, m, d), type: 'EXPENSE' })),
    { merchant: 'NETFLIX.COM 8821', nominal: 54000, date: iso(2026, 9, 5), type: 'EXPENSE' },
    ...[ [2026,5,2],[2026,5,19],[2026,8,30],[2026,9,1] ].map(([y, m, d]) => ({ merchant: 'Warung Bu Tini', nominal: 15000, date: iso(y, m, d), type: 'EXPENSE' })),
    { merchant: 'Gaji', nominal: 1500000, date: iso(2026, 9, 1), type: 'INCOME' }
  ];
  const found = fi.detectRecurring(txs, { now: new Date('2026-10-01T00:00:00Z').getTime() });
  assert.equal(found.length, 1);
  assert.equal(found[0].cadence, 'MONTHLY');
  assert.equal(found[0].occurrences, 5);
  assert.equal(found[0].amountMedian, 54000);
  assert.equal(found[0].health, 'ON_TRACK');
  assert.ok(found[0].confidence > 0.8);
  const missed = fi.detectRecurring(txs, { now: new Date('2026-11-20T00:00:00Z').getTime() });
  assert.equal(missed[0].health, 'MISSED');
});

test('upcomingBills expands only ACTIVE rules; month-end clamping works', () => {
  const rules = [
    { status: 'ACTIVE', cadence: 'MONTHLY', displayName: 'Kos', amountMedian: 600000, nextExpected: iso(2026, 10, 31) },
    { status: 'CANDIDATE', cadence: 'MONTHLY', displayName: 'X', amountMedian: 1, nextExpected: iso(2026, 10, 15) }
  ];
  const bills = fi.upcomingBills(rules, new Date('2026-10-10T00:00:00Z').getTime(), new Date('2026-12-31T00:00:00Z').getTime());
  assert.equal(bills.length, 3);
  assert.ok(bills[1].due.startsWith('2026-11-30'));   // 31st clamps to 30 Nov
  assert.ok(bills.every(b => b.name === 'Kos'));
});

test('safeToSpendToday and projectMonthEnd', () => {
  const s = fi.safeToSpendToday({ budgetRemainingBeforeToday: 900000, upcomingBillsTotal: 300000, daysLeftInclusive: 20, spentToday: 10000 });
  assert.equal(s.perDay, 30000);
  assert.equal(s.remainingToday, 20000);
  assert.equal(s.status, 'OK');
  assert.equal(fi.safeToSpendToday({ budgetRemainingBeforeToday: 100000, upcomingBillsTotal: 300000, daysLeftInclusive: 5 }).status, 'OVER');
  const p = fi.projectMonthEnd({ spentSoFar: 500000, recurringPaidSoFar: 200000, recurringStillDue: 100000, dayOfMonth: 10, daysInMonth: 30 });
  assert.equal(p.variableRunRate, 30000);
  assert.equal(p.projected, 500000 + 100000 + 30000 * 20);
});

test('createResilientStore retries DB after 60s cooldown instead of permanent memory latch', async () => {
  const { createResilientStore } = require('../src/core/Notifier');
  let dbCalls = 0;
  const mockDb = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            dbCalls++;
            if (dbCalls === 1) {
              const err = new Error('relation "nexa_notifications" does not exist');
              err.code = '42P01';
              return { data: null, error: err };
            }
            return { data: { id: 99 }, error: null };
          }
        })
      })
    })
  };

  const store = createResilientStore(mockDb);
  // First call should failover to memory because table is missing
  const id1 = await store.record({ kind: 'k1', priority: 'P1', text: 't1', status: 'SENT' });
  assert.equal(dbCalls, 1);
  assert.ok(id1 > 0); // Memory store assigned an id

  // Call immediately after: should still be in 60s cooldown, so db is not hammered
  const id2 = await store.record({ kind: 'k2', priority: 'P1', text: 't2', status: 'SENT' });
  assert.equal(dbCalls, 1);
  assert.ok(id2 > id1);
});

test('notifyProactive validates and queues or delivers', async () => {
  const { notifyProactive } = require('../src/core/Notifier');
  const uniqueKey = 'test_alert_' + Date.now();
  const res = await notifyProactive({ kind: 'test_alert', priority: 'P0', dedupeKey: uniqueKey, text: 'Test alert' });
  assert.ok(res);
  assert.ok(['SENT', 'QUEUED_DEFERRED', 'QUEUED_DIGEST'].includes(res.status));
});
