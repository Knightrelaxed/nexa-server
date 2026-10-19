#!/usr/bin/env node
/**
 * AST splitter: memecah src/infrastructure/Supabase_Memories.js menjadi src/infrastructure/memories/*
 * dan menjadikan file asli facade tipis dengan kontrak ekspor identik (nama + urutan).
 *
 *   node scripts/refactor/split_supabase_memories.js            # --plan: dry-run, cetak rencana + graf dependensi
 *   node scripts/refactor/split_supabase_memories.js --apply    # tulis modul + facade
 *   node scripts/refactor/split_supabase_memories.js --verify   # bandingkan hasil dengan kode asli (git HEAD / --orig-rev / --orig)
 *
 * Prinsip: potongan kode dipindahkan VERBATIM (byte-per-byte, termasuk komentar di atasnya); satu-satunya
 * perubahan adalah jalur require relatif (+1 level karena file turun satu folder). Tanpa state mutable
 * (let/var) di file asli, jadi pemisahan aman. Butuh devDependency:  npm i -D acorn@8
 */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
let acorn; try { acorn = require('acorn'); } catch (_) { console.error('Butuh acorn:  npm i -D acorn@8'); process.exit(2); }

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f), opt = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const SRC = opt('--src', 'src/infrastructure/Supabase_Memories.js');
const OUT = opt('--out', 'src/infrastructure/memories');
const MODE = flag('--apply') ? 'apply' : flag('--verify') ? 'verify' : 'plan';
const MAX_LINES = Number(opt('--max-lines', 600));

// ── Peta modul → anggota (HANYA non-import). Urutan = urutan require di facade. ──────────────────
const MODULES = {
  Memory_Client: { desc: 'Klien Supabase + helper tabel/ID bersama (lapisan terbawah, tanpa dependensi internal)',
    names: ['supabase', 'SUPABASE_TABLES', 'resolveAllowedTableName', 'findMatchingIds'] },
  Memory_Living: { desc: 'Living memory & hygiene: simpan dengan metadata, arsip, reinforce, kandidat pruning',
    names: ['saveMemoryWithMeta', 'getAllActiveMemories', 'archiveMemoryById', 'bulkArchiveMemories', 'reinforceMemoryById', 'getStagedForPruning'] },
  Memory_Chat: { desc: 'Obrolan & memori temporal (hari ini/kemarin) + pencarian chat historis',
    names: ['saveChatMemory', 'getRecentMemories', 'getTodayMemories', 'getYesterdayMemories', 'searchPastChats'] },
  Memory_Finance_Dedup: { desc: 'Dedup transaksi keuangan & transaksi pending',
    names: ['isDuplicateTransaction', 'logTransactionKey', 'cleanupOldFinanceDedup', 'savePendingTransaction', 'getPendingTransactions', 'deletePendingTransaction', 'markPendingTransactionSent'] },
  Memory_Vault: { desc: '2nd Brain vault: ide dan item vault',
    names: ['saveIdeaToVault', 'deleteIdeaFromVault', 'editIdeaInVault', 'saveVaultItem', 'updateVaultItemById'] },
  Memory_Identity: { desc: 'Profil pengguna, identitas kognitif, dan proposal identitas',
    names: ['saveUserProfile', 'deleteFromUserProfile', 'saveCoreIdentity', 'deleteFromCoreIdentity', 'getPersonalFacts', 'getIdentityModel',
      'buildIdentityTraitPayload', 'upsertIdentityTrait', 'deleteIdentityTrait', 'saveIdentityProposal', 'getPendingIdentityProposals',
      'getStagedIdentityProposals', 'setProposalTelegramMessageId', 'approveIdentityProposal', 'rejectIdentityProposal', 'getIdentityProposalById'] },
  Memory_Self_Model: { desc: 'Self-learning model N.E.X.A (capabilities, limitations, rules, corrections)',
    names: ['upsertSelfModelTrait', 'updateSelfModelTraitByKey', 'getSelfModel', 'getSelfModelByLayer', 'deleteFromSelfModel'] },
  Memory_Learning: { desc: 'Closed learning loop: event pembelajaran, playbook, micro-reviewer',
    names: ['recordLearningEvent', 'getUnprocessedLearningEvents', 'markLearningEventsProcessed', 'incrementLearningEventAttempts',
      'countMicroReviewRunsToday', 'recordMicroReviewRun', 'bumpPlaybookCounters', 'getActivePlaybook', 'getAllActivePlaybooks', 'upsertPlaybook'] },
  Memory_Chrono: { desc: 'Chrono-episodic: narasi harian 90 hari & konsolidasi',
    names: ['toWibDateString', 'getCandidateDatesToConsolidate', 'getChatsForDateWib', 'saveDailyNarrative', 'pruneRawChatsByIds',
      'getDailyNarrativeByDate', 'searchDailyNarratives', 'searchRawChats'] },
  Memory_Db_Browser: { desc: 'Operasi CRUD generik untuk database browser',
    names: ['getDatabaseOverview', 'readDatabaseTable', 'insertDatabaseRow', 'updateDatabaseRows', 'deleteDatabaseRows', 'deleteAllDatabaseRows'] }
};

const die = (m) => { console.error('✗ ' + m); process.exit(1); };
const isRequireCall = (n) => n && n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'require';
const bump = (spec) => (spec.startsWith('./') ? '../' + spec.slice(2) : spec.startsWith('../') ? '../' + spec : spec);

function walk(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k in node) { if (k === 'type') continue; const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => walk(c, fn, node)); else if (v && typeof v.type === 'string') walk(v, fn, node); }
}

function parse(src) {
  const ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script' });
  const decls = []; let exportsNode = null; let prevEnd = 0;
  for (const n of ast.body) {
    const trivia = prevEnd; prevEnd = n.end;
    if (n.type === 'ExpressionStatement' && src.startsWith('module.exports', n.start)) { exportsNode = n; continue; }
    if (n.type === 'FunctionDeclaration') { decls.push({ node: n, names: [n.id.name], importLike: false, trivia }); continue; }
    if (n.type === 'VariableDeclaration') {
      if (n.declarations.length !== 1) die(`deklarasi multi-variabel tidak didukung (baris ${src.slice(0, n.start).split('\n').length})`);
      const d = n.declarations[0];
      const init = d.init; const importLike = isRequireCall(init) || (init && init.type === 'MemberExpression' && isRequireCall(init.object));
      const names = d.id.type === 'Identifier' ? [d.id.name] : d.id.properties.map((p) => p.value.name);
      decls.push({ node: n, names, importLike, trivia }); continue;
    }
    die(`statement tingkat-atas tidak didukung: ${n.type} @ baris ${src.slice(0, n.start).split('\n').length}`);
  }
  if (!exportsNode) die('module.exports tidak ditemukan');
  const keys = exportsNode.expression.right.properties.map((p) => p.key.name || p.key.value);
  const exportedKeys = [...new Set(keys)];
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  const relReq = []; // semua require relatif (di mana pun) untuk ditulis ulang
  walk(ast, (n) => { if (isRequireCall(n) && n.arguments[0] && n.arguments[0].type === 'Literal' && /^\./.test(String(n.arguments[0].value))) relReq.push(n.arguments[0]); });
  return { ast, decls, exportedKeys, dupKeys, relReq, exportsNode };
}

function sliceOf(src, d, relReq) {
  const start = d.importLike ? d.node.start : d.trivia; // import-like: tanpa komentar pendahulu
  let text = src.slice(start, d.node.end); let delta = 0;
  for (const lit of relReq.filter((l) => l.start >= start && l.end <= d.node.end)) {
    const raw = src.slice(lit.start, lit.end); const nr = raw[0] + bump(lit.value) + raw[0];
    const s = lit.start - start + delta; text = text.slice(0, s) + nr + text.slice(s + raw.length); delta += nr.length - raw.length;
  }
  return text.replace(/^\s+/, '');
}

function refsOf(d, nameSet) {
  const out = new Set();
  walk(d.node, (n, p) => {
    if (n.type !== 'Identifier' || !nameSet.has(n.name)) return;
    if (p && p.type === 'MemberExpression' && p.property === n && !p.computed) return;               // obj.nama
    if (p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand) return;          // { nama: ... }
    out.add(n.name);
  });
  d.names.forEach((x) => out.delete(x));
  return out;
}

function plan(src) {
  const P = parse(src);
  const homeOf = {}; for (const [m, def] of Object.entries(MODULES)) for (const n of def.names) { if (homeOf[n]) die(`${n} terdaftar di dua modul`); homeOf[n] = m; }
  const nameSet = new Set(P.decls.flatMap((d) => d.names));
  for (const n of Object.keys(homeOf)) if (!nameSet.has(n)) die(`MODULES menyebut "${n}" yang tidak ada di file asli`);
  const unmapped = P.decls.filter((d) => !d.importLike).flatMap((d) => d.names).filter((n) => !homeOf[n]);
  if (unmapped.length) die(`deklarasi belum dipetakan ke modul: ${unmapped.join(', ')}  → tambahkan ke MODULES`);
  const missingExport = P.exportedKeys.filter((k) => !nameSet.has(k)); if (missingExport.length) die(`ekspor tanpa deklarasi: ${missingExport.join(', ')}`);

  const mods = {}; for (const m of Object.keys(MODULES)) mods[m] = { decls: [], imports: [], deps: new Set(), cross: {} };
  for (const d of P.decls) {
    if (d.importLike) continue;
    const m = homeOf[d.names[0]]; mods[m].decls.push(d);
    for (const r of refsOf(d, nameSet)) {
      const imp = P.decls.find((x) => x.importLike && x.names.includes(r));
      if (imp) { if (!mods[m].imports.includes(imp)) mods[m].imports.push(imp); continue; }
      const h = homeOf[r]; if (h && h !== m) { mods[m].deps.add(h); (mods[m].cross[h] = mods[m].cross[h] || new Set()).add(r); }
    }
  }
  // graf acyclic?
  const state = {}; const order = [];
  const visit = (m, stack) => { if (state[m] === 2) return; if (state[m] === 1) die('siklus dependensi: ' + [...stack, m].join(' → '));
    state[m] = 1; for (const d of mods[m].deps) visit(d, [...stack, m]); state[m] = 2; order.push(m); };
  Object.keys(mods).forEach((m) => visit(m, []));
  return { P, homeOf, mods, order };
}

function render(src, pl) {
  const { P, homeOf, mods } = pl; const files = {};
  const neededByOthers = new Set(); for (const m of Object.values(mods)) for (const set of Object.values(m.cross)) set.forEach((n) => neededByOthers.add(n));
  const idx = (n) => P.decls.findIndex((d) => d.names.includes(n));
  for (const [m, def] of Object.entries(MODULES)) {
    const M = mods[m]; const parts = [];
    parts.push(`/**\n * ============================================================\n * [N.E.X.A] memories/${m}.js\n * ${def.desc}\n *\n * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).\n * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;\n * satu-satunya perubahan adalah jalur require relatif (+1 level).\n * ============================================================\n */\n`);
    const imps = M.imports.sort((a, b) => P.decls.indexOf(a) - P.decls.indexOf(b)).map((d) => sliceOf(src, d, P.relReq));
    const cross = Object.entries(M.cross).sort((a, b) => Object.keys(MODULES).indexOf(a[0]) - Object.keys(MODULES).indexOf(b[0]))
      .map(([h, set]) => `const { ${[...set].sort((a, b) => idx(a) - idx(b)).join(', ')} } = require('./${h}');`);
    if (imps.length || cross.length) parts.push([...imps, ...cross].join('\n') + '\n');
    for (const d of M.decls) parts.push(sliceOf(src, d, P.relReq) + '\n');
    const exp = def.names.filter((n) => P.exportedKeys.includes(n) || neededByOthers.has(n) || m === 'Memory_Client').sort((a, b) => idx(a) - idx(b));
    parts.push(`module.exports = {\n${exp.map((n) => `  ${n}`).join(',\n')}\n};\n`);
    files[`${m}.js`] = parts.join('\n');
  }
  const aliases = Object.fromEntries(Object.keys(MODULES).map((m) => [m, m.replace('Memory_', '').replace(/_(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase())]));
  const facade = `/**
 * ============================================================
 * [N.E.X.A] Supabase_Memories.js — FACADE
 * ============================================================
 * Implementasi dipecah ke src/infrastructure/memories/*. File ini hanya mengekspor ulang seluruh simbol
 * dengan NAMA dan URUTAN identik dengan versi monolit (kontrak publik tidak berubah; ${P.exportedKeys.length} ekspor).
 * Pemanggil luar tetap memakai:  const supabaseMemories = require('.../Supabase_Memories');
 * ============================================================
 */
${Object.keys(MODULES).map((m) => `const ${aliases[m]} = require('./memories/${m}');`).join('\n')}

module.exports = {
${P.exportedKeys.map((k) => `  ${k}: ${aliases[homeOf[k]]}.${k}`).join(',\n')}
};
`;
  return { files, facade };
}

function report(pl, src, out) {
  console.log(`Sumber: ${SRC} (${src.split('\n').length} baris, ${pl.P.decls.length} deklarasi, ${pl.P.exportedKeys.length} ekspor unik)`);
  if (pl.P.dupKeys.length) console.log(`⚠ kunci ekspor duplikat di file asli (dideduplikasi di facade): ${[...new Set(pl.P.dupKeys)].join(', ')}`);
  console.log('\nModul (urutan lapisan: bawah → atas)');
  for (const m of pl.order) { const M = pl.mods[m];
    const lines = out ? out.files[`${m}.js`].split('\n').length : '?';
    console.log(`  ${m.padEnd(22)} ${String(M.decls.length).padStart(2)} deklarasi ~${lines} baris  ← ${[...M.deps].join(', ') || '(dasar)'}`); }
  console.log(`  ${'Supabase_Memories (facade)'.padEnd(22)} ${out ? out.facade.split('\n').length : '?'} baris`);
  console.log('\n✓ graf dependensi acyclic');
}

// ── mode ────────────────────────────────────────────────────────────────────────
if (MODE === 'plan' || MODE === 'apply') {
  const src = fs.readFileSync(SRC, 'utf8');
  if (/FACADE/.test(src.slice(0, 400))) die(`${SRC} sudah berupa facade (sudah di-split).`);
  const pl = plan(src); const out = render(src, pl); report(pl, src, out);
  if (MODE === 'apply') {
    if (fs.existsSync(OUT) && fs.readdirSync(OUT).length && !flag('--force')) die(`${OUT} sudah berisi file (pakai --force untuk menimpa)`);
    fs.mkdirSync(OUT, { recursive: true });
    for (const [f, t] of Object.entries(out.files)) fs.writeFileSync(path.join(OUT, f), t);
    fs.writeFileSync(SRC, out.facade);
    console.log(`\n✓ ditulis: ${Object.keys(out.files).length} modul di ${OUT} + facade ${SRC}\n  Berikutnya: node scripts/refactor/split_supabase_memories.js --verify && npm test`);
  } else console.log('\n(dry-run; tambahkan --apply untuk menulis)');
} else {
  // VERIFY: kode asli diambil dari git (default HEAD) atau --orig <file>
  const origFile = opt('--orig', null); const rev = opt('--orig-rev', 'HEAD');
  const origRaw = origFile ? fs.readFileSync(origFile, 'utf8') : cp.execFileSync('git', ['show', `${rev}:${SRC}`], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const orig = origRaw.replace(/\r\n/g, '\n');
  const pl = plan(orig); const files = {}; let fail = 0;
  const bad = (m) => { fail++; console.log('  ✗ ' + m); }; const ok = (m) => console.log('  ✓ ' + m);
  for (const m of Object.keys(MODULES)) { const f = path.join(OUT, m + '.js'); if (!fs.existsSync(f)) bad(`file hilang: ${f}`); else files[m] = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); }
  const all = Object.values(files).join('\n/*==*/\n');
  // 1) setiap deklarasi asli muncul tepat 1x (non-import) / minimal 1x (import), tanpa modifikasi
  let nDecl = 0;
  for (const d of pl.P.decls) { const text = sliceOf(orig, d, pl.P.relReq); const count = all.split(text).length - 1; nDecl++;
    if (d.importLike ? count < 1 : count !== 1) bad(`deklarasi ${d.names.join('+')}: ditemukan ${count}x (harus ${d.importLike ? '≥1' : '1'})`); }
  ok(`${nDecl} deklarasi asli diperiksa (verbatim, tanpa hilang/ganda)`);
  // 2) tidak ada modul yang me-require facade; graf antar-modul acyclic; syntax valid; ukuran
  const edges = {};
  for (const [m, t] of Object.entries(files)) {
    if (/require\(['"]\.\.?\/(\.\.\/infrastructure\/)?Supabase_Memories['"]\)/.test(t)) bad(`${m} me-require facade (siklus)`);
    edges[m] = [...t.matchAll(/require\('\.\/(Memory_\w+)'\)/g)].map((x) => x[1]);
    try { cp.execFileSync(process.execPath, ['--check', path.join(OUT, m + '.js')], { stdio: 'pipe' }); } catch (e) { bad(`syntax error di ${m}`); }
    const n = t.split('\n').length; if (n > MAX_LINES) bad(`${m} ${n} baris > ${MAX_LINES}`);
  }
  const st = {}; const dfs = (m, s) => { if (st[m] === 2) return; if (st[m] === 1) { bad('siklus: ' + [...s, m].join('→')); return; } st[m] = 1; (edges[m] || []).forEach((d) => dfs(d, [...s, m])); st[m] = 2; };
  Object.keys(edges).forEach((m) => dfs(m, [])); ok('graf antar-modul acyclic, tidak ada require ke facade, syntax valid');
  // 3) kontrak facade: nama + urutan
  const fac = parse(fs.readFileSync(SRC, 'utf8'));
  const same = JSON.stringify(fac.exportedKeys) === JSON.stringify(pl.P.exportedKeys);
  same ? ok(`kontrak ekspor facade identik dengan aslinya (${fac.exportedKeys.length} nama, urutan sama)`) : bad('kontrak ekspor facade BERBEDA dari aslinya');
  const fl = fs.readFileSync(SRC, 'utf8').split('\n').length; ok(`facade ${fl} baris`);
  console.log(fail ? `\nGAGAL: ${fail} masalah` : '\nLULUS: integritas pemisahan terverifikasi (jalankan juga npm test untuk golden master)');
  process.exit(fail ? 1 : 0);
}
