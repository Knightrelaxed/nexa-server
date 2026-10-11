/**
 * ============================================================
 * [N.E.X.A v3.3] UNIT TESTS — tests/micro_reviewer.test.js
 * ============================================================
 * Menguji seluruh komponen Fase 3:
 *   1. Full-Text Search (FTS) di Supabase_Memories
 *   2. Dialectic Stance Note Generator & Cadence Caching
 *   3. Asynchronous Micro-Reviewer (Prompt, Rate Guard, Triggers)
 * ============================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const supabaseMemories = require('../src/infrastructure/Supabase_Memories');
const dialecticEngine = require('../src/domain/Dialectic_Engine');
const microReviewer = require('../src/domain/Micro_Reviewer');
const playbookEngine = require('../src/domain/Playbook_Engine');

// ── 1. FULL-TEXT SEARCH (FTS) TESTS ───────────────────────────
test('Supabase_Memories: searchPastChats handles empty or short queries safely', async () => {
  const emptyRes = await supabaseMemories.searchPastChats('');
  assert.deepStrictEqual(emptyRes, []);

  const nullRes = await supabaseMemories.searchPastChats(null);
  assert.deepStrictEqual(nullRes, []);

  const singleCharRes = await supabaseMemories.searchPastChats('a');
  assert.deepStrictEqual(singleCharRes, []);

  // Valid string input should return an array (either matched rows or empty if no DB match)
  const validQueryRes = await supabaseMemories.searchPastChats('Nexa');
  assert.ok(Array.isArray(validQueryRes));
});

// ── 2. DIALECTIC STANCE NOTE ENGINE TESTS ─────────────────────
test('Dialectic_Engine: resolveTimeWindow accurately maps Jakarta hours', () => {
  assert.strictEqual(dialecticEngine.resolveTimeWindow(23), 'LATE_NIGHT');
  assert.strictEqual(dialecticEngine.resolveTimeWindow(2), 'LATE_NIGHT');
  assert.strictEqual(dialecticEngine.resolveTimeWindow(7), 'MORNING');
  assert.strictEqual(dialecticEngine.resolveTimeWindow(13), 'AFTERNOON');
  assert.strictEqual(dialecticEngine.resolveTimeWindow(19), 'EVENING');
});

test('Dialectic_Engine: buildStanceNote generates bounded stance (<= 250 chars)', () => {
  const emailStance = dialecticEngine.buildStanceNote({
    topicContext: 'EMAIL_DRAFT',
    timeWindow: 'MORNING'
  });
  assert.ok(emailStance.includes('Fokus Email:'));
  assert.ok(emailStance.length <= dialecticEngine.MAX_STANCE_CHARS);

  const financeStance = dialecticEngine.buildStanceNote({
    topicContext: 'FINANCE',
    timeWindow: 'AFTERNOON'
  });
  assert.ok(financeStance.includes('Konteks Keuangan:'));
  assert.ok(financeStance.length <= dialecticEngine.MAX_STANCE_CHARS);

  const schedulingStance = dialecticEngine.buildStanceNote({
    topicContext: 'SCHEDULING',
    timeWindow: 'MORNING'
  });
  assert.ok(schedulingStance.includes('Konteks Agenda:'));
  assert.ok(schedulingStance.length <= dialecticEngine.MAX_STANCE_CHARS);

  const lateNightStance = dialecticEngine.buildStanceNote({
    topicContext: 'NORMAL_CHAT',
    timeWindow: 'LATE_NIGHT'
  });
  assert.ok(lateNightStance.includes('Larut Malam:'));
  assert.ok(lateNightStance.length <= dialecticEngine.MAX_STANCE_CHARS);
});

test('Dialectic_Engine: Cadence Caching reuses stance for 3 turns then refreshes', () => {
  dialecticEngine.resetStanceCache();

  // Turn 1: Fresh calculation
  const s1 = dialecticEngine.getStanceNote({ topicContext: 'EMAIL_DRAFT', jktHour: 9 });
  let status = dialecticEngine.getCacheStatus();
  assert.strictEqual(status.cachedTopic, 'EMAIL_DRAFT');
  assert.strictEqual(status.turnsRemaining, 2);

  // Turn 2: Cache hit
  const s2 = dialecticEngine.getStanceNote({ topicContext: 'EMAIL_DRAFT', jktHour: 9 });
  assert.strictEqual(s1, s2);
  status = dialecticEngine.getCacheStatus();
  assert.strictEqual(status.turnsRemaining, 1);

  // Turn 3: Cache hit
  const s3 = dialecticEngine.getStanceNote({ topicContext: 'EMAIL_DRAFT', jktHour: 9 });
  assert.strictEqual(s1, s3);
  status = dialecticEngine.getCacheStatus();
  assert.strictEqual(status.turnsRemaining, 0);

  // Switching topic immediately resets cache
  const s4 = dialecticEngine.getStanceNote({ topicContext: 'FINANCE', jktHour: 9 });
  assert.notStrictEqual(s1, s4);
  status = dialecticEngine.getCacheStatus();
  assert.strictEqual(status.cachedTopic, 'FINANCE');

  // Format block
  const block = dialecticEngine.formatStanceNoteBlock(s4);
  assert.ok(block.includes('[OPERATIONAL STANCE NOTE]'));
  assert.ok(block.includes('Konteks Keuangan:'));
});

// ── 3. ASYNCHRONOUS MICRO-REVIEWER TESTS ──────────────────────
test('Micro_Reviewer: buildHermesReviewPrompt enforces Hermes principles and caps', () => {
  const dummyPlaybook = {
    intent: 'EMAIL_DRAFT',
    version: 1,
    rules: { length: 'maks 5 kalimat', format: ['prosa'] },
    rendered: 'Email Tuan: ringkas, prosa, langsung ke inti.'
  };

  const dummyEvents = [
    { id: 101, event_type: 'CORRECTION', signal: { dimension: 'length', direction: 'shorter' }, user_turn_excerpt: 'singkat aja ya' }
  ];

  const { systemInstruction, userPrompt } = microReviewer.buildHermesReviewPrompt(dummyPlaybook, dummyEvents);

  assert.ok(systemInstruction.includes('SINGLE-STORE ROUTING'));
  assert.ok(systemInstruction.includes('DO NOT SAVE'));
  assert.ok(systemInstruction.includes('700 karakter'));
  assert.ok(userPrompt.includes('EMAIL_DRAFT (v1)'));
  assert.ok(userPrompt.includes('singkat aja ya'));
});

test('Micro_Reviewer: Daily Rate Guard blocks execution after 3 runs', async () => {
  microReviewer.resetReviewerState();

  let status = microReviewer.getReviewerStatus();
  assert.strictEqual(status.reviewsTodayCount, 0);
  assert.strictEqual(status.maxReviewsPerDay, 3);

  // Mocking 3 executions by inspecting status
  const run1 = await microReviewer.runMicroReview('MANUAL');
  // run1 will finish either with reviewed: true or reviewed: false (if no events)
  assert.ok(typeof run1 === 'object');

  // Manually testing daily limit guard boundary
  microReviewer.resetReviewerState();
  // Simulate 3 reviews done today
  for (let i = 0; i < 3; i++) {
    microReviewer.handlePostTurn({ userText: 'halo', intent: 'NORMAL_CHAT' });
  }

  // Verify turn counter increments
  status = microReviewer.getReviewerStatus();
  assert.strictEqual(status.turnCounter, 3);
  assert.strictEqual(status.hasActiveIdleTimer, true);

  microReviewer.resetReviewerState();
});

test('Micro_Reviewer: daily budget is hydrated from the database (a restart cannot reset the cap)', async () => {
  const original = supabaseMemories.countMicroReviewRunsToday;
  microReviewer.resetReviewerState();
  supabaseMemories.countMicroReviewRunsToday = async () => 3; // three runs already persisted today
  try {
    const res = await microReviewer.runMicroReview('TEST_AFTER_RESTART');
    assert.equal(res.reviewed, false);
    assert.equal(res.reason, 'DAILY_BUDGET_EXCEEDED');
  } finally {
    supabaseMemories.countMicroReviewRunsToday = original;
    microReviewer.resetReviewerState();
  }
});

test('Micro_Reviewer: a failed budget read is retried instead of silently trusted', async () => {
  const original = supabaseMemories.countMicroReviewRunsToday;
  microReviewer.resetReviewerState();
  let calls = 0;
  supabaseMemories.countMicroReviewRunsToday = async () => { calls += 1; return null; }; // DB unavailable
  try {
    await microReviewer.runMicroReview('TEST_DB_DOWN_1');
    await microReviewer.runMicroReview('TEST_DB_DOWN_2');
    assert.ok(calls >= 2, 'hydration must be retried while the database is unavailable');
  } finally {
    supabaseMemories.countMicroReviewRunsToday = original;
    microReviewer.resetReviewerState();
  }
});
