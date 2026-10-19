#!/usr/bin/env node
'use strict';
// =====================================================================
// verify_finance_split.js - static + load-time checks for src/domain/finance/*
//   npm i --no-save acorn eslint-scope        (one-off)
//   node scripts/refactor/verify_finance_split.js
//
// 1. every file parses, and every identifier resolves (a missing import shows up as an unresolved name)
// 2. every module loads on its own in a fresh process (catches circular requires and wrong relative paths)
// 3. no module imports a module from the same or a higher layer than itself (keeps the graph acyclic)
// =====================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let acorn, escope;
try { acorn = require('acorn'); escope = require('eslint-scope'); }
catch (_) { console.error('Missing tooling. Run once:  npm i --no-save acorn eslint-scope'); process.exit(2); }

const root = path.resolve(__dirname, '..', '..');
const dir = path.join(root, 'src', 'domain', 'finance');
const facade = path.join(root, 'src', 'domain', 'Finance_Engine.js');
if (!fs.existsSync(dir)) { console.error('src/domain/finance/ not found - run the split first.'); process.exit(1); }
const LAYERS = ['Finance_State', 'Finance_Helpers', 'Finance_Ledger', 'Finance_Analytics', 'Finance_Corrections', 'Finance_Confirmations', 'Finance_Email_Sync'];
const BUILTINS = new Set([...Object.getOwnPropertyNames(globalThis), 'require', 'module', 'exports', '__dirname', '__filename']);

let problems = 0;
const bad = (m) => { problems++; console.error('  FAIL ' + m); };
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f)).concat(facade);

for (const f of files) {
  const rel = path.relative(root, f);
  const code = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', ranges: true }); } catch (e) { bad(`${rel}: parse error: ${e.message}`); continue; }
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script', nodejsScope: true });
  const un = [...new Set(sm.globalScope.through.map(r => r.identifier.name))].filter(n => !BUILTINS.has(n));
  if (un.length) bad(`${rel}: unresolved identifiers: ${un.join(', ')}`);
  // layer rule: sibling requires must point to a LOWER layer
  const me = LAYERS.indexOf(path.basename(f, '.js'));
  for (const m of code.matchAll(/require\('\.\/(Finance_[A-Za-z_]+)'\)/g)) {
    const dep = LAYERS.indexOf(m[1]);
    if (me >= 0 && dep >= me) bad(`${rel}: imports ${m[1]} (same or higher layer) - would risk a circular require`);
  }
  console.log(`  ok   ${rel} (${code.split('\n').length} lines)`);
}

for (const f of files) {
  try {
    execFileSync(process.execPath, ['-e', `require(${JSON.stringify(f)})`], { cwd: root, stdio: 'pipe', timeout: 30000 });
  } catch (e) {
    bad(`${path.relative(root, f)}: fails to load alone: ${String(e.stderr || e.message).split('\n').find(l => /Error/.test(l)) || e.message}`);
  }
}
console.log(problems ? `\n${problems} problem(s) found.` : '\nAll checks passed.');
process.exit(problems ? 1 : 0);
