/**
 * Golden-master / characterization test untuk Supabase_Memories (facade + sub-modul memories/*).
 * Membuktikan setiap ekspor menghasilkan urutan query Supabase & nilai kembali yang IDENTIK dengan
 * versi monolit (fixture tests/fixtures/memories_golden.json, dibuat oleh
 * scripts/refactor/capture_memories_golden.js sebelum refactor). Klien Supabase diganti perekam palsu:
 * tidak ada akses DB/jaringan.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadFacade, runCase } = require('./helpers/memories_harness');

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/memories_golden.json'), 'utf8'));
const ctx = loadFacade(path.join(__dirname, '../src/infrastructure/Supabase_Memories.js'));
test.after(() => ctx.restore());

test('kontrak ekspor: nama, urutan, dan tipe identik dengan golden master', () => {
  const now = Object.keys(ctx.mod).map((n) => [n, ctx.mod[n] === null ? 'null' : typeof ctx.mod[n]]);
  assert.deepStrictEqual(now, golden.exports);
});

for (const name of Object.keys(golden.cases)) {
  test(`golden: ${name} (query + hasil pada skenario A/B/C)`, async () => {
    for (const sc of ['A', 'B', 'C']) {
      const got = await runCase(ctx, name, golden.args[name], sc);
      assert.deepStrictEqual(got, golden.cases[name][sc], `${name} berbeda pada skenario ${sc}`);
    }
  });
}
