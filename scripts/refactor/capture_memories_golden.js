#!/usr/bin/env node
/**
 * Menangkap "golden master" perilaku Supabase_Memories (SEBELUM refactor).
 *   node scripts/refactor/capture_memories_golden.js [--out tests/fixtures/memories_golden.json]
 * Jalankan SEKALI pada kode monolit, commit file fixture-nya, baru jalankan splitter.
 */
'use strict';
const fs = require('fs'); const path = require('path');
const { loadFacade, captureAll } = require('../../tests/helpers/memories_harness');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'tests/fixtures/memories_golden.json';
(async () => {
  const ctx = loadFacade('src/infrastructure/Supabase_Memories.js');
  const snap = await captureAll(ctx);
  ctx.restore();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
  const fns = Object.keys(snap.cases).length;
  console.log(`golden master: ${snap.exports.length} ekspor, ${fns} fungsi x 3 skenario -> ${out}`);
  process.exit(0);
})();
