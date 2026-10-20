/**
 * Golden-master / characterization test untuk AI_Router (monolit ATAU facade + src/core/router/*).
 * Fixture tests/fixtures/router_golden.json dibuat oleh scripts/refactor/capture_router_golden.js sebelum
 * refactor. Semua dependensi (LLM, Supabase, modul domain) di-stub perekam; tidak ada jaringan/DB.
 * Mencakup: kontrak ekspor, konstanta prompt/schema, 17 fungsi internal murni (termasuk mutasi argumen),
 * dan 27 skenario end-to-end (prompt LLM lengkap, urutan panggilan dependensi, perilaku cache RAM:
 * hit / invalidasi / kedaluwarsa TTL).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadRouter, runPure, runConsts, runScenarios, computeAliases } = require('./helpers/router_harness');

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/router_golden.json'), 'utf8'));
const ctx = loadRouter();
test.after(() => ctx.restore());

test('kontrak ekspor publik: nama, urutan, dan tipe identik dengan golden master', () => {
  assert.deepStrictEqual(Object.keys(ctx.facade).map((n) => [n, typeof ctx.facade[n]]), golden.publicExports);
});

test('alias facade menunjuk fungsi internal yang sama (identitas fungsi, bukan sekadar nama)', () => {
  assert.deepStrictEqual(computeAliases(ctx), golden.aliases);
});

test('konstanta statis (prompt, schema, keyword, TTL) identik', () => {
  assert.deepStrictEqual(runConsts(ctx, golden.internals.consts), golden.consts);
});

for (const name of Object.keys(golden.pure)) {
  test(`golden murni: ${name}`, async () => {
    assert.deepStrictEqual(await runPure(ctx, name), golden.pure[name]);
  });
}

let scenarios;
for (const id of Object.keys(golden.scenarios)) {
  test(`skenario: ${id}`, async () => {
    scenarios = scenarios || (await runScenarios(ctx));   // berurutan: cache RAM dibawa antar skenario secara sengaja
    assert.deepStrictEqual(scenarios[id], golden.scenarios[id]);
  });
}
