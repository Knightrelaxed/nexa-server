/**
 * ============================================================
 * [TEST SUITE] N.E.X.A v3.3 Procedural Memory (Playbook Engine)
 * ============================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const playbookEngine = require('../src/domain/Playbook_Engine');

// [v3.3.1] Hermetic store: the formatting tests run against the built-in defaults, not production rows.
function installFakeStore() {
  const rows = playbookEngine.DEFAULT_PLAYBOOKS.map((pb, i) => ({
    ...pb, id: `pb-${i}`, version: 1, status: 'ACTIVE', pinned: false,
    use_count: 0, correction_count: 0, updated_at: new Date().toISOString()
  }));
  playbookEngine.setStore({
    getAllActivePlaybooks: async () => rows,
    upsertPlaybook: async () => ({}),
    getActivePlaybook: async (intent) => rows.find(r => r.intent === intent) || null
  });
}
function restoreStore() { playbookEngine.setStore(null); }

test('Playbook_Engine: resolvePlaybookIntent maps aliases to canonical intent classes', () => {
  assert.equal(playbookEngine.resolvePlaybookIntent('EMAIL'), 'EMAIL_DRAFT');
  assert.equal(playbookEngine.resolvePlaybookIntent('email_draft'), 'EMAIL_DRAFT');
  assert.equal(playbookEngine.resolvePlaybookIntent('CALENDAR'), 'SCHEDULING');
  assert.equal(playbookEngine.resolvePlaybookIntent('TASK'), 'SCHEDULING');
  assert.equal(playbookEngine.resolvePlaybookIntent('FINANCE'), 'FINANCE');
  assert.equal(playbookEngine.resolvePlaybookIntent('BRIEFING_MORNING'), 'BRIEFING_MORNING');
  assert.equal(playbookEngine.resolvePlaybookIntent('DISCIPLINE'), 'DISCIPLINE_NUDGE');
  assert.equal(playbookEngine.resolvePlaybookIntent('WEB_SEARCH'), 'RESEARCH');
  assert.equal(playbookEngine.resolvePlaybookIntent('CASUAL'), 'NORMAL_CHAT');
  assert.equal(playbookEngine.resolvePlaybookIntent('UNKNOWN_INTENT'), 'NORMAL_CHAT');
  // With allowFallback = false
  assert.equal(playbookEngine.resolvePlaybookIntent('UNKNOWN_INTENT', false), null);
  assert.equal(playbookEngine.resolvePlaybookIntent('FINANCE', false), 'FINANCE');
});

test('Playbook_Engine: DEFAULT_PLAYBOOKS satisfy schema and character caps (<= 700 chars)', () => {
  assert.ok(playbookEngine.DEFAULT_PLAYBOOKS.length >= 6);

  for (const pb of playbookEngine.DEFAULT_PLAYBOOKS) {
    assert.ok(pb.intent, 'Playbook must have intent');
    assert.ok(pb.rules, 'Playbook must have rules');
    assert.ok(pb.rendered, 'Playbook must have rendered text');
    assert.ok(
      pb.rendered.length <= 700,
      `Playbook ${pb.intent} rendered length (${pb.rendered.length}) must be <= 700 chars`
    );
  }
});

test('Playbook_Engine: formatPlaybookContextBlock injects valid procedural guidance', async () => {
  installFakeStore();
  try {
  const block = await playbookEngine.formatPlaybookContextBlock('EMAIL');
  assert.ok(block.includes('[PROCEDURAL PLAYBOOK — ATURAN EKSEKUSI TUAN FAQIH]'));
  assert.ok(block.includes('EMAIL_DRAFT'));
  assert.ok(block.includes('Ringkas'));
  } finally { restoreStore(); }
});

test('Playbook_Engine: formatPlaybooksSummary and formatPlaybookDetail return valid Telegram HTML', async () => {
  installFakeStore();
  try {
  const summary = await playbookEngine.formatPlaybooksSummary();
  assert.ok(summary.includes('Playbooks'));
  assert.ok(summary.includes('EMAIL_DRAFT'));
  assert.ok(summary.includes('SCHEDULING'));

  const detail = await playbookEngine.formatPlaybookDetail('FINANCE');
  assert.ok(detail.includes('Detail Playbook: FINANCE'));
  assert.ok(detail.includes('Panduan Rendered:'));
  assert.ok(detail.includes('Aturan Terstruktur:'));

  const unknownDetail = await playbookEngine.formatPlaybookDetail('INVALID_INTENT');
  assert.ok(unknownDetail.includes('tidak dikenal'));
  assert.ok(unknownDetail.includes('Pilihan intent yang tersedia:'));

  const xssDetail = await playbookEngine.formatPlaybookDetail('<script>alert("hack")</script>');
  assert.ok(xssDetail.includes('&lt;script&gt;'));
  assert.ok(!xssDetail.includes('<script>'));
  } finally { restoreStore(); }
});
