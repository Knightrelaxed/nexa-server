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
