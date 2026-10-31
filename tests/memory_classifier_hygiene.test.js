'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeClassification, MEMORY_LABELS } = require('../src/core/router/Memory_Classifier');

test('Taxonomy: MEMORY_LABELS must contain exactly the 5 official tiers', () => {
  assert.deepEqual(Array.from(MEMORY_LABELS).sort(), ['CORE', 'EPHEMERAL', 'PHASE', 'PREFERENCE', 'RULE'].sort());
});

test('Guardrail 1: Demote CORE to PHASE if an end_event exists', () => {
  const raw = {
    label: 'CORE',
    end_event: 'semester ends',
    completed_past: false,
    valid_days: 120,
    confidence: 0.95,
  };
  const res = normalizeClassification(raw);
  assert.equal(res.label, 'PHASE');
  assert.equal(res.valid_days, 120);
  assert.equal(res.end_event, 'semester ends');
  assert.ok(res.guardrails.includes('core_has_end_event->PHASE'));
});

test('Guardrail 2: Low-confidence CORE is demoted to PHASE', () => {
  const raw = {
    label: 'CORE',
    end_event: 'none',
    completed_past: false,
    valid_days: null,
    confidence: 0.60, // Below 0.75 threshold
  };
  const res = normalizeClassification(raw);
  assert.equal(res.label, 'PHASE');
  assert.ok(res.guardrails.includes('core_low_confidence->PHASE'));
});

test('Guardrail 3: Completed past event stays CORE with null valid_days', () => {
  const raw = {
    label: 'CORE',
    end_event: 'none',
    completed_past: true,
    valid_days: 365, // Must be cleared to null for CORE
    confidence: 0.95,
  };
  const res = normalizeClassification(raw);
  assert.equal(res.label, 'CORE');
  assert.equal(res.valid_days, null);
  assert.equal(res.completed_past, true);
});

test('Guardrail 4: Tier alignment between EPHEMERAL and PHASE based on valid_days', () => {
  // If model says PHASE but valid_days is short (<= 30), align to EPHEMERAL
  const shortPhase = normalizeClassification({
    label: 'PHASE',
    end_event: 'fever subsides',
    valid_days: 7,
    confidence: 0.9,
  });
  assert.equal(shortPhase.label, 'EPHEMERAL');
  assert.equal(shortPhase.valid_days, 7);
  assert.ok(shortPhase.guardrails.some(g => g.includes('tier_aligned:PHASE->EPHEMERAL')));

  // If model says EPHEMERAL but valid_days is long (> 30), align to PHASE
  const longEphemeral = normalizeClassification({
    label: 'EPHEMERAL',
    end_event: 'internship contract ends',
    valid_days: 180,
    confidence: 0.9,
  });
  assert.equal(longEphemeral.label, 'PHASE');
  assert.equal(longEphemeral.valid_days, 180);
  assert.ok(longEphemeral.guardrails.some(g => g.includes('tier_aligned:EPHEMERAL->PHASE')));
});

test('Guardrail 5: Backward compatibility - PERMANENT_FACT maps to CORE', () => {
  const raw = {
    label: 'PERMANENT_FACT',
    end_event: 'none',
    completed_past: false,
    confidence: 0.95,
  };
  const res = normalizeClassification(raw);
  assert.equal(res.label, 'CORE');
});

test('Guardrail 6: Unknown chapter slug is dropped unless present in activeChapters', () => {
  const ctx = {
    activeChapters: ['university', 'career'],
    related: [{ id: 101, content: 'Student fact' }],
  };

  // Unknown chapter should be ignored
  const resUnknown = normalizeClassification({
    label: 'PHASE',
    valid_days: 120,
    chapter: 'university',
    closes_chapter: 'hallucinated_phase',
    supersedes: [101, 999], // 999 is not in related
  }, ctx);

  assert.equal(resUnknown.chapter, 'university');
  assert.equal(resUnknown.closes_chapter, null);
  assert.deepEqual(resUnknown.supersedes, [101]);
  assert.ok(resUnknown.guardrails.includes('closes_chapter_unknown_ignored'));

  // Known chapter to close is accepted
  const resKnown = normalizeClassification({
    label: 'PHASE',
    valid_days: 120,
    closes_chapter: 'university',
  }, ctx);
  assert.equal(resKnown.closes_chapter, 'university');
});

test('Hygiene Engine Math: Dynamic lambda derivation for PHASE', () => {
  const STAGED_THRESHOLD = 0.60;
  const ARCHIVED_THRESHOLD = 0.30;
  const validDays = 120; // 1 semester

  const lambda = -Math.log(STAGED_THRESHOLD) / validDays;

  // Day 0: R = 1.0 (Full retention)
  const r0 = Math.exp(-lambda * 0);
  assert.equal(Math.round(r0 * 100) / 100, 1.00);

  // Day 60: Halfway through semester (Still ACTIVE)
  const r60 = Math.exp(-lambda * 60);
  assert.ok(r60 > STAGED_THRESHOLD, 'At half-time, retention must be above staged threshold');

  // Day 120: Semester ends (Hits STAGED_FOR_PRUNING exactly at 0.60)
  const r120 = Math.exp(-lambda * 120);
  assert.equal(Math.round(r120 * 1000) / 1000, STAGED_THRESHOLD);

  // Day ~282: Inactivity without reinforcement (Reaches auto-archival threshold 0.30)
  const daysToArchive = -Math.log(ARCHIVED_THRESHOLD) / lambda;
  const rArchive = Math.exp(-lambda * daysToArchive);
  assert.equal(Math.round(rArchive * 100) / 100, ARCHIVED_THRESHOLD);
  assert.ok(daysToArchive > validDays * 2, 'Archival happens at ~2.35x valid_days');
});

test('Hygiene Engine Math: Ephemeral expiry window calculation', () => {
  const EPHEMERAL_GRACE = 1.5;
  const EPHEMERAL_MIN_DAYS = 3;
  const EPHEMERAL_MAX_DAYS = 30;

  // Flu with 7 days -> expires at ~10.5 days
  const fluTtl = Math.max(EPHEMERAL_MIN_DAYS, 7 * EPHEMERAL_GRACE);
  assert.equal(fluTtl, 10.5);

  // Very short event with 1 day -> clamped to minimum 3 days
  const shortTtl = Math.max(EPHEMERAL_MIN_DAYS, 1 * EPHEMERAL_GRACE);
  assert.equal(shortTtl, 3);

  // Ephemeral without valid_days -> defaults to 30 days
  const defaultTtl = EPHEMERAL_MAX_DAYS;
  assert.equal(defaultTtl, 30);
});
