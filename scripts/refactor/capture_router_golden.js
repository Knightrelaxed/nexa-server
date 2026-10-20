#!/usr/bin/env node
/**
 * Menangkap golden master AI_Router (jalankan SEKALI pada monolit, SEBELUM split, lalu commit fixture-nya):
 *   node scripts/refactor/capture_router_golden.js [--out tests/fixtures/router_golden.json] [--force]
 */
'use strict';
const fs = require('fs'); const path = require('path');
const { loadRouter, discoverInternals, captureAll, ROOT } = require('../../tests/helpers/router_harness');
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'tests/fixtures/router_golden.json';
(async () => {
  const names = discoverInternals(fs.readFileSync(path.join(ROOT, 'src/core/AI_Router.js'), 'utf8'));
  if (fs.existsSync(path.join(ROOT, 'src/core/router')) && !process.argv.includes('--force')) { console.error('✗ src/core/router sudah ada: capture harus dari monolit (pakai --force untuk menimpa).'); process.exit(1); }
  const ctx = loadRouter(); const snap = await captureAll(ctx, names); ctx.restore();
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(snap, null, 1) + '\n');
  console.log(`golden router (${ctx.mode}): ${snap.publicExports.length} ekspor publik, ${Object.keys(snap.pure).length} fungsi murni, ${Object.keys(snap.consts).length} konstanta, ${Object.keys(snap.scenarios).length} skenario -> ${out}`);
  process.exit(0);
})();
