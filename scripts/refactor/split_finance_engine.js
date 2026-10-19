#!/usr/bin/env node
'use strict';
// =====================================================================
// split_finance_engine.js - behaviour-preserving split of Finance_Engine.js
//
// Moves top-level declarations (by NAME) into focused modules under src/domain/finance/ and turns
// Finance_Engine.js into a thin facade with the SAME module.exports block, so no caller changes.
//
//   npm i --no-save acorn eslint-scope        (one-off, does not touch package.json / lockfile)
//   node scripts/refactor/split_finance_engine.js            dry run: prints the plan, writes nothing
//   node scripts/refactor/split_finance_engine.js --write    performs the split
//
// Safety nets (each aborts BEFORE anything is written):
//   * every top-level declaration must be assigned to exactly one module (nothing silently dropped)
//   * unexpected top-level statements are refused
//   * relative require() paths inside moved code (including inline, lazy ones) are re-based
//   * every generated file is scope-analysed: a reference that resolves to nothing = missing import = abort
//   * mutable `let` bindings may not be shared across modules
//   * the module graph must be acyclic (no circular require at load time)
// =====================================================================
const fs = require('fs');
const path = require('path');
let acorn, escope;
try { acorn = require('acorn'); escope = require('eslint-scope'); }
catch (_) { console.error('Missing tooling. Run once:  npm i --no-save acorn eslint-scope'); process.exit(2); }

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const SRC = path.resolve(opt('--src', 'src/domain/Finance_Engine.js'));
const OUT = path.resolve(opt('--out', path.join(path.dirname(SRC), 'finance')));
const WRITE = flag('--write');
const SRC_DIR = path.dirname(SRC);

// ---------------------------------------------------------------------
// Target layout. Layers only depend downward, so the require graph has no cycles.
// ---------------------------------------------------------------------
const MODULES = [
  { file: 'Finance_State.js', title: 'Finance_State', about: 'Shared in-memory state for pending confirmations (single source of truth).',
    names: ['pendingConfirmations', 'processingKeys'] },
  { file: 'Finance_Helpers.js', title: 'Finance_Helpers', about: 'Pure parsing/formatting helpers and the AI merchant categoriser.',
    names: ['_normalizePaymentMethod', '_autoCategorizeMerchant', '_parseFlexibleCurrency', '_parseRelativeDateFilter',
            '_parseIndonesianDateString', '_formatTxAsCard'] },
  { file: 'Finance_Ledger.js', title: 'Finance_Ledger', about: 'Core transaction write path and read queries.',
    names: ['processTransaction', 'getRecentTransactions', 'searchTransactions'] },
  { file: 'Finance_Analytics.js', title: 'Finance_Analytics', about: 'Financial reports: KPIs, period comparison, trends, saving rate.',
    names: ['getFinanceAnalytics', '_parseAnalyticsPeriod', 'CATEGORY_EMOJI', '_catEmoji', 'getCategoryInsight',
            'getPeriodComparisonReport', 'getTopExpensesReport', 'getAccountBalancesReport', 'getDailyTrendReport',
            'getSmartFinanceSummary', 'getMonthlySummaryReport', 'getSavingRateReport', 'getDailyBalanceTrendReport'] },
  { file: 'Finance_Corrections.js', title: 'Finance_Corrections', about: 'Edit, delete (with confirmation) and undo of recorded transactions.',
    names: ['pendingDeletions', 'lastDeletedTransaction', '_findBestTransactionMatch', 'getPendingDeletionsContext',
            'requestDeleteConfirmation', 'confirmDeleteTransaction', 'undoDeleteTransaction', 'editTransaction'] },
  { file: 'Finance_Confirmations.js', title: 'Finance_Confirmations', about: 'Pending-confirmation lifecycle: request, edit, confirm, auto-save, recovery.',
    names: ['_resolveTargetKeyFromSnippet', 'confirmPendingTransactions', 'updatePendingTransaction', '_buildConfirmationMessage',
            '_autoSavePending', 'requestTransactionConfirmation', 'autoSaveFromWatchdog', 'resolveTargetKeyFromSnippet',
            'getPendingConfirmationsContext', 'recoverPendingTransactions'] },
  { file: 'Finance_Email_Sync.js', title: 'Finance_Email_Sync', about: 'Gmail (Mandiri) mutation email polling and import.',
    names: ['isPollingFinance', 'pollFinanceEmails'] }
];

const fail = (m) => { console.error('\nABORT: ' + m); process.exit(1); };
const warn = (m) => console.warn('WARN: ' + m);
const BUILTINS = new Set([...Object.getOwnPropertyNames(globalThis), 'require', 'module', 'exports', '__dirname', '__filename']);

// ---------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------
const src = fs.readFileSync(SRC, 'utf8');
const comments = [];
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true, locations: true, onComment: comments });

function leadStart(i) {
  const node = ast.body[i];
  const prevEndLine = i > 0 ? ast.body[i - 1].loc.end.line : 0;
  const cs = comments.filter(c => c.end <= node.start && c.loc.start.line > prevEndLine);
  let start = node.start;
  for (let k = cs.length - 1; k >= 0; k--) {
    if (/^\s*$/.test(src.slice(cs[k].end, start))) start = cs[k].start; else break;
  }
  return start;
}
function trailEnd(i) {
  const node = ast.body[i];
  const c = comments.find(c => c.loc.start.line === node.loc.end.line && c.start >= node.end);
  return c && /^[ \t]*$/.test(src.slice(node.end, c.start)) ? c.end : node.end;
}

const decls = [];      // { names, kind, text, stmtIndex, isImport, importSpec }
let exportStmt = null;
const unknown = [];
ast.body.forEach((n, i) => {
  if (n.type === 'ExpressionStatement' && n.directive) return;
  if (n.type === 'FunctionDeclaration') {
    decls.push({ names: [n.id.name], kind: 'fn', i });
  } else if (n.type === 'VariableDeclaration') {
    const names = [];
    n.declarations.forEach(d => { if (d.id.type === 'Identifier') names.push(d.id.name); else d.id.properties && d.id.properties.forEach(p => p.value && p.value.name && names.push(p.value.name)); });
    const d0 = n.declarations[0];
    const isImport = n.declarations.length === 1 && d0.init && d0.init.type === 'CallExpression' &&
      d0.init.callee.name === 'require' && d0.init.arguments[0] && d0.init.arguments[0].type === 'Literal';
    decls.push({ names, kind: n.kind, i, isImport });
  } else if (n.type === 'ExpressionStatement' && src.slice(n.start, n.end).startsWith('module.exports')) {
    exportStmt = { i };
  } else {
    unknown.push(`line ${n.loc.start.line}: ${n.type}`);
  }
});
if (unknown.length) fail('unexpected top-level statements (decide where they belong first):\n  ' + unknown.join('\n  '));
if (!exportStmt) fail('no top-level `module.exports = {...}` found');
decls.forEach(d => { d.text = src.slice(leadStart(d.i), trailEnd(d.i)); });
exportStmt.text = src.slice(leadStart(exportStmt.i), trailEnd(exportStmt.i));

// ---------------------------------------------------------------------
// Assign declarations to modules
// ---------------------------------------------------------------------
const home = new Map();                 // name -> module
const nameKind = new Map();
decls.forEach(d => d.names.forEach(n => nameKind.set(n, d.kind)));
MODULES.forEach(m => { m.decls = []; m.names.forEach(n => {
  if (!nameKind.has(n)) { warn(`configured name not found in source (skipped): ${n} -> ${m.file}`); return; }
  if (home.has(n)) fail(`name assigned twice: ${n}`);
  home.set(n, m);
}); });
const importDecls = decls.filter(d => d.isImport);
const importByName = new Map();
importDecls.forEach(d => d.names.forEach(n => importByName.set(n, d)));
const movable = decls.filter(d => !d.isImport);
const unassigned = movable.filter(d => !d.names.some(n => home.has(n)));
if (unassigned.length) fail('top-level declarations not assigned to any module (add them to MODULES):\n  ' + unassigned.map(d => d.names.join(',') + ` (line ${ast.body[d.i].loc.start.line})`).join('\n  '));
movable.forEach(d => {
  const mods = new Set(d.names.map(n => home.get(n)).filter(Boolean));
  if (mods.size !== 1) fail(`declaration group split across modules: ${d.names.join(', ')}`);
  [...mods][0].decls.push(d);
});

// ---------------------------------------------------------------------
// Helpers: path rebasing, unresolved-reference analysis
// ---------------------------------------------------------------------
function rebaseRequires(text) {
  return text.replace(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g, (m, q, rel) => {
    let r = path.relative(OUT, path.resolve(SRC_DIR, rel)).split(path.sep).join('/');
    if (!r.startsWith('.')) r = './' + r;
    return `require(${q}${r}${q})`;
  });
}
function unresolvedNames(code) {
  const a = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', ranges: true });
  const sm = escope.analyze(a, { ecmaVersion: 2022, sourceType: 'script', nodejsScope: true });
  return new Set(sm.globalScope.through.map(r => r.identifier.name).filter(n => !BUILTINS.has(n)));
}

// ---------------------------------------------------------------------
// Per-module dependency resolution
// ---------------------------------------------------------------------
const edges = new Map();
MODULES.forEach(m => {
  const body = m.decls.map(d => d.text).join('\n\n');
  const unresolved = unresolvedNames(body);
  m.infra = []; m.imports = new Map();
  unresolved.forEach(name => {
    if (importByName.has(name)) { const d = importByName.get(name); if (!m.infra.includes(d)) m.infra.push(d); return; }
    const h = home.get(name);
    if (!h) fail(`${m.file}: reference to "${name}" resolves to nothing (not a builtin, import, or known declaration)`);
    if (h === m) return;
    if (nameKind.get(name) === 'let') fail(`${m.file}: uses mutable binding "${name}" owned by ${h.file}; move them together or turn it into shared state`);
    if (!m.imports.has(h)) m.imports.set(h, []);
    m.imports.get(h).push(name);
  });
  edges.set(m, [...m.imports.keys()]);
});
// acyclic?
const state = new Map();
(function visit(m, stack) {
  if (state.get(m) === 2) return;
  if (state.get(m) === 1) fail('circular dependency between modules: ' + [...stack, m].map(x => x.file).join(' -> '));
  state.set(m, 1);
  edges.get(m).forEach(n => visit(n, [...stack, m]));
  state.set(m, 2);
})(MODULES[0], []);
MODULES.forEach(m => { if (!state.get(m)) { (function v(x, s) { if (state.get(x) === 2) return; if (state.get(x) === 1) fail('circular dependency: ' + [...s, x].map(y => y.file).join(' -> ')); state.set(x, 1); edges.get(x).forEach(n => v(n, [...s, x])); state.set(x, 2); })(m, []); } });

// ---------------------------------------------------------------------
// Generate files
// ---------------------------------------------------------------------
const files = new Map();
MODULES.forEach(m => {
  if (!m.decls.length) return;
  const exportNames = m.decls.filter(d => d.kind !== 'let').flatMap(d => d.names);
  const infraLines = m.infra.sort((a, b) => a.i - b.i).map(d => rebaseRequires(src.slice(leadStart(d.i), trailEnd(d.i)).replace(/^[\s\S]*?(?=(const|let|var)\s)/, '')));
  const impLines = [...m.imports].map(([h, names]) => `const { ${[...new Set(names)].sort().join(', ')} } = require('./${h.file.replace(/\.js$/, '')}');`);
  const body = m.decls.sort((a, b) => a.i - b.i).map(d => rebaseRequires(d.text)).join('\n\n');
  const text =
`'use strict';
/**
 * ${m.title} - ${m.about}
 * Extracted from Finance_Engine.js (finance split). Behaviour is unchanged; Finance_Engine.js remains the public facade.
 */
${[...infraLines, ...impLines].join('\n')}

${body}

module.exports = {
${exportNames.map(n => '  ' + n + ',').join('\n')}
};
`;
  files.set(m.file, text);
});

// facade: keep the original export block verbatim, import every identifier it references
const exportSnippet = exportStmt.text;
const facadeRefs = unresolvedNames(exportSnippet);
const facadeImports = new Map();
facadeRefs.forEach(name => {
  if (name === 'module') return;
  const h = home.get(name);
  if (!h) fail(`facade: export block references "${name}" which has no home module`);
  if (nameKind.get(name) === 'let') fail(`facade: export block references mutable binding "${name}"`);
  if (!facadeImports.has(h)) facadeImports.set(h, []);
  facadeImports.get(h).push(name);
});
const facade =
`'use strict';
/**
 * Finance_Engine - public facade. The implementation now lives in ./finance/:
${MODULES.filter(m => m.decls.length).map(m => ` *   ${m.file.padEnd(26)} ${m.about}`).join('\n')}
 * The export surface below is unchanged, so no caller needs to change.
 */
${[...facadeImports].map(([h, names]) => `const { ${[...new Set(names)].sort().join(', ')} } = require('./finance/${h.file.replace(/\.js$/, '')}');`).join('\n')}

${exportSnippet}
`;

// ---------------------------------------------------------------------
// Self-verification of the generated code (before writing anything)
// ---------------------------------------------------------------------
const allGenerated = new Map(files); allGenerated.set(path.basename(SRC), facade);
for (const [name, text] of allGenerated) {
  try { acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'script' }); } catch (e) { fail(`generated ${name} does not parse: ${e.message}`); }
  const un = unresolvedNames(text);
  if (un.size) fail(`generated ${name} has unresolved references: ${[...un].join(', ')}`);
}
const declared = new Set(); files.forEach(t => { const a = acorn.parse(t, { ecmaVersion: 'latest', sourceType: 'script' }); a.body.forEach(n => { if (n.type === 'FunctionDeclaration') declared.add(n.id.name); }); });
const origFns = decls.filter(d => d.kind === 'fn').map(d => d.names[0]);
const lost = origFns.filter(n => !declared.has(n));
if (lost.length) fail('functions lost during split: ' + lost.join(', '));

// ---------------------------------------------------------------------
// Report / write
// ---------------------------------------------------------------------
const lines = t => t.split('\n').length;
console.log(`Source: ${path.relative(process.cwd(), SRC)} (${lines(src)} lines) -> ${path.relative(process.cwd(), OUT)}/`);
MODULES.forEach(m => { if (files.has(m.file)) console.log(`  ${m.file.padEnd(28)} ${String(lines(files.get(m.file))).padStart(5)} lines | ${m.decls.length} decl | imports: ${[...m.imports.keys()].map(x => x.file.replace('.js', '')).join(', ') || '-'}`); });
console.log(`  ${path.basename(SRC).padEnd(28)} ${String(lines(facade)).padStart(5)} lines | facade`);
console.log('Checks passed: all declarations assigned, no unresolved references, no mutable-state sharing, no cycles.');
if (!WRITE) { console.log('\nDry run only. Re-run with --write to apply.'); process.exit(0); }
fs.mkdirSync(OUT, { recursive: true });
files.forEach((t, f) => fs.writeFileSync(path.join(OUT, f), t));
fs.writeFileSync(SRC, facade);
console.log('\nWritten. Next: node scripts/refactor/verify_finance_split.js && node --test tests/finance_characterization.test.js');
