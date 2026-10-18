'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { buildIdentityTraitPayload } = require('../src/infrastructure/Supabase_Memories');

const base = { layer: 'habits', trait_key: ' Work_Pattern ', trait_value: ' Night owl ', confidence: '0.9' };

test('identity payload: approving/reinforcing a trait cannot erase its directive or reset privacy', () => {
  const p = buildIdentityTraitPayload(base);
  assert.equal(p.layer, 'HABITS');
  assert.equal(p.trait_key, 'work_pattern');
  assert.equal(p.trait_value, 'Night owl');
  assert.ok(!('directive' in p), 'no directive key => the existing directive stays untouched');
  assert.ok(!('scope' in p));
  assert.ok(!('sensitivity' in p), 'no sensitivity key => an existing private flag stays untouched');
});

test('identity payload: provided fields are written; clearDirective nulls a stale directive', () => {
  const withDir = buildIdentityTraitPayload({ ...base, directive: 'Ringkas dan langsung ke inti.', sensitivity: 'private', scope: 'intent:EMAIL_DRAFT' });
  assert.equal(withDir.directive, 'Ringkas dan langsung ke inti.');
  assert.equal(withDir.sensitivity, 'private');
  assert.equal(withDir.scope, 'intent:EMAIL_DRAFT');
  const cleared = buildIdentityTraitPayload({ ...base, clearDirective: true });
  assert.equal(cleared.directive, null);
  const capped = buildIdentityTraitPayload({ ...base, directive: 'a'.repeat(300) });
  assert.equal(capped.directive.length, 160);
});
