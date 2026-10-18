'use strict';
const test = require('node:test');
const assert = require('node:assert');
const playbookEngine = require('../src/domain/Playbook_Engine');
const signalDetector = require('../src/domain/Signal_Detector');

function fakeStore(extra = {}) {
  const bumps = [];
  const rows = playbookEngine.DEFAULT_PLAYBOOKS.map((pb, i) => ({
    ...pb, id: `pb-${i}`, version: 1, status: 'ACTIVE', pinned: false,
    use_count: 20, correction_count: 3, updated_at: new Date().toISOString()
  }));
  return {
    bumps,
    store: {
      getAllActivePlaybooks: async () => rows,
      getActivePlaybook: async (intent) => rows.find(r => r.intent === intent) || null,
      upsertPlaybook: async () => ({}),
      bumpPlaybookCounters: async (args) => { bumps.push(args); return true; },
      recordLearningEvent: async (p) => ({ success: true, data: p }),
      ...extra
    }
  };
}

test('recordPlaybookUse bumps the usage counter once and swallows store failures', async () => {
  const { store, bumps } = fakeStore();
  playbookEngine.setStore(store);
  try {
    playbookEngine.recordPlaybookUse({ intent: 'FINANCE', version: 2 });
    assert.deepEqual(bumps, [{ intent: 'FINANCE', version: 2, use: 1 }]);
    playbookEngine.recordPlaybookUse(null);                        // no playbook: no call, no throw
    assert.equal(bumps.length, 1);
    playbookEngine.setStore({ bumpPlaybookCounters: async () => { throw new Error('db down'); } });
    assert.doesNotThrow(() => playbookEngine.recordPlaybookUse({ intent: 'FINANCE', version: 1 }));
    await new Promise(r => setImmediate(r));                       // a rejected promise must not surface
  } finally { playbookEngine.setStore(null); }
});

test('formatCorrectionRate and the /playbook detail show corrections per use from fresh data', async () => {
  assert.equal(playbookEngine.formatCorrectionRate({ use_count: 0, correction_count: 0 }), '-');
  assert.equal(playbookEngine.formatCorrectionRate({ use_count: 20, correction_count: 3 }), '15% (3 dari 20 pemakaian)');
  const { store } = fakeStore();
  playbookEngine.setStore(store);
  try {
    const detail = await playbookEngine.formatPlaybookDetail('FINANCE');
    assert.match(detail, /Tingkat koreksi: <b>15% \(3 dari 20 pemakaian\)<\/b>/);
  } finally { playbookEngine.setStore(null); }
});

test('Signal_Detector counts a correction once per utterance and playbook version; ACCEPT never counts', async () => {
  const { store, bumps } = fakeStore();
  signalDetector.setStore(store);
  try {
    const previousContext = {
      intent: 'FINANCE', topic: 'FINANCE',
      injectedPlaybook: { intent: 'FINANCE', version: 2 },
      lastAssistantReply: 'Berikut rincian:\n• Bensin 50rb\n• Makan 25rb\n• Parkir 2rb\n' + 'Detail tambahan. '.repeat(20)
    };
    const events = await signalDetector.evaluateTurn({
      userText: 'terlalu panjang, jangan pakai bullet', assistantReply: 'Baik.', intent: 'NORMAL_CHAT',
      previousContext, sessionKey: 'test:counters'
    });
    assert.ok(events.filter(e => e.event_type === 'CORRECTION').length >= 1);
    assert.deepEqual(bumps, [{ intent: 'FINANCE', version: 2, correction: 1 }]);

    bumps.length = 0;
    await signalDetector.evaluateTurn({ userText: 'makasih ya, mantap', assistantReply: 'Sama-sama.', intent: 'NORMAL_CHAT',
      previousContext, sessionKey: 'test:counters' });
    assert.equal(bumps.length, 0, 'ACCEPT must not count as a correction');

    await signalDetector.evaluateTurn({ userText: 'terlalu panjang', assistantReply: 'Baik.', intent: 'NORMAL_CHAT',
      sessionKey: 'test:counters' });
    assert.equal(bumps.length, 0, 'no attributed playbook => nothing to count');
  } finally { signalDetector.setStore(null); }
});
