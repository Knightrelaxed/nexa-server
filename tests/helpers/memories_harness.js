/**
 * Harness karakterisasi untuk Supabase_Memories (golden master).
 * Mengganti @supabase/supabase-js dengan klien palsu yang MEREKAM setiap panggilan query-builder,
 * membekukan Date/random/uuid, lalu memanggil setiap ekspor pada 3 skenario DB:
 *   A = ada baris, B = kosong, C = error.  Hasil (log query + nilai kembali/error) dibandingkan
 * antara versi monolit (sebelum) dan facade (sesudah). Tidak ada akses jaringan/DB sungguhan.
 */
'use strict';
const Module = require('module');
const path = require('path');

const FIXED = Date.parse('2026-10-12T03:00:00.000Z');
const ROW = {
  id: 'id-1', content: 'isi', text: 'isi', role: 'user', session_key: 'tg:1', created_at: '2026-10-12T03:00:00.000Z',
  updated_at: '2026-10-12T03:00:00.000Z', trait_key: 'k', trait_value: 'v', layer: 'PREFERENCES', status: 'ACTIVE',
  confidence: 0.8, directive: 'gunakan nada tenang', intent: 'FINANCE', version: 2, rules: {}, rendered: 'aturan',
  is_active: true, pinned: false, event_type: 'CORRECTION', signal: {}, injected_refs: {}, user_turn_excerpt: 'x',
  processed_at: null, attempts: 0, key: 'k', value: 'v', category: 'KTP', file_name: 'f.jpg', metadata_json: {},
  nominal: 1000, tx_key: 'tx-1', narrative: 'ringkasan', date_wib: '2026-10-12', importance: 3, access_count: 1,
  memory_type: 'FACT', drive_file_id: 'drive-1', drive_web_view_link: 'https://drive.example/x', mime_type: 'image/jpeg', archived: false, proposed_value: 'p', old_value: 'o', reasoning: 'r', telegram_message_id: 1
};

function safe(v) {
  try {
    return JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'function' ? '[fn]' : x === undefined ? '[undef]'
      : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)));
  } catch (e) { return '[unserializable]'; }
}

function makeClient(state) {
  const settle = (b) => {
    const sc = state.scenario;
    if (sc === 'C') return { data: null, error: { message: 'boom', code: 'XX000' }, count: null };
    const rows = sc === 'A' ? [ROW, { ...ROW, id: 'id-2' }] : [];
    if (b.single) return { data: rows[0] || null, error: sc === 'B' ? { message: 'no rows', code: 'PGRST116' } : null, count: rows.length };
    return { data: rows, error: null, count: rows.length };
  };
  const builder = () => {
    const b = { single: false };
    const p = new Proxy(function () {}, {
      get(_, prop) {
        if (prop === 'then') return (res, rej) => { state.log.push(['await']); return Promise.resolve(settle(b)).then(res, rej); };
        if (typeof prop === 'symbol') return undefined;
        return (...args) => { state.log.push([prop, safe(args)]); if (prop === 'single' || prop === 'maybeSingle') b.single = true; return p; };
      }
    });
    return p;
  };
  return new Proxy({}, {
    get(_, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined;
      return (...args) => { state.log.push([prop, safe(args)]); return builder(); };
    }
  });
}

function install(state) {
  const origLoad = Module._load, RealDate = Date, origRandom = Math.random, crypto = require('crypto');
  const origUUID = crypto.randomUUID, origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  const client = makeClient(state);
  Module._load = function (req, parent, isMain) {
    if (req === '@supabase/supabase-js') return { createClient: () => client };
    if (/gemini_vector_cache/.test(req)) return new Proxy({}, { get: (_, n) => (typeof n === 'symbol' ? undefined : async (...a) => { state.log.push(['vectorCache.' + String(n), safe(a)]); }) });
    return origLoad.apply(this, arguments);
  };
  process.env.SUPABASE_URL = 'http://fake.supabase.local'; process.env.SUPABASE_KEY = 'fake-key';
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [FIXED])); } static now() { return FIXED; } };
  Math.random = () => 0.5; crypto.randomUUID = () => 'uuid-1';
  console.log = console.warn = console.error = console.info = () => {};
  return function restore() {
    Module._load = origLoad; global.Date = RealDate; Math.random = origRandom; crypto.randomUUID = origUUID; Object.assign(console, origConsole);
  };
}

function loadFacade(facadePath) {
  const state = { log: [], scenario: 'A' };
  const restore = install(state);
  for (const k of Object.keys(require.cache)) if (/infrastructure[\\/](Supabase_Memories|memories[\\/])/.test(k)) delete require.cache[k];
  try { return { mod: require(path.resolve(facadePath)), state, restore }; } catch (e) { restore(); throw e; }
}

// Argumen khusus untuk fungsi yang punya guard validasi ketat (agar jalur query ikut teruji).
const OVERRIDES = {
  updateDatabaseRows: ['nexa_chat_memories', { role: 'user', content: 'baru' }, { rowId: 1 }],
  updateVaultItemById: [5, { file_name: 'a.jpg', category: 'KTP', status: 'ACTIVE', metadata_json: {} }]
};

function valueFor(name) {
  const n = String(name || '');
  if (/^layer$/i.test(n)) return 'CAPABILITIES';
  if (/(time|timestamp)$/i.test(n)) return { __date: '2026-10-12T03:00:00.000Z' };
  if (/ids$|^ids|list$|items$|rows$|keys$|tags$|^dates$|entries$/i.test(n)) return ['id-1', 'id-2'];
  if (/^(id|rowid|.*id)$/i.test(n)) return 'id-1';
  if (/(limit|count|days|hours|minutes|max|min|offset|page|size|threshold|top|num|number|score|confidence|version|ttl)/i.test(n)) return 3;
  if (/^(is|has|should|force|dry|include|only)/.test(n)) return true;
  if (/date|day$|wib/i.test(n)) return '2026-10-12';
  if (/table/i.test(n)) return 'nexa_core_identity';
  if (/(data|payload|opts|options|updates|patch|row|proposal|trait|meta|metadata|filters|criteria|event|record|params|input|obj|fields|values|signal|refs|where|match|entry|item|playbook|profile|identity|model|result|context)$/i.test(n)) return { ...ROW };
  return 'sample';
}

function splitTopLevel(str) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of str) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++; if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Tanpa dependensi: baca daftar parameter dari fn.toString() dan bangun argumen heuristik berdasarkan nama.
function buildArgs(fn) {
  const src = fn.toString().replace(/^async\s+/, '');
  let list;
  const m = src.match(/^(?:function\s*\*?\s*[\w$]*\s*)?\(/);
  if (m) {
    let i = m[0].length, depth = 1;
    for (; i < src.length && depth > 0; i++) { if (src[i] === '(') depth++; else if (src[i] === ')') depth--; }
    list = src.slice(m[0].length, i - 1);
  } else list = (src.match(/^([\w$]+)\s*=>/) || [, ''])[1];
  return splitTopLevel(list).map((p) => {
    if (p.startsWith('...')) return [];
    if (p.startsWith('{')) {
      let d = 0, end = p.length;
      for (let i = 0; i < p.length; i++) { if (p[i] === '{') d++; else if (p[i] === '}' && --d === 0) { end = i; break; } }
      return Object.fromEntries(splitTopLevel(p.slice(1, end)).map((x) => x.split(/[:=]/)[0].trim()).filter(Boolean).map((k) => [k, valueFor(k)]));
    }
    return valueFor(p.split('=')[0].trim());   // parameter ber-default tetap diberi nilai agar jalur utama ikut teruji
  });
}

function revive(v) {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.__date) return new Date(v.__date);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
}

async function runCase(ctx, name, args, scenario) {
  ctx.state.log = []; ctx.state.scenario = scenario;
  let ret, err = null;
  try { ret = await Promise.race([ctx.mod[name](...revive(args)), new Promise((_, rj) => setTimeout(() => rj(new Error('TIMEOUT')), 3000))]); }
  catch (e) { err = String((e && e.message) || e).slice(0, 200); }
  return { log: safe(ctx.state.log), ret: safe(ret === undefined ? '[undef]' : ret), err };
}

async function captureAll(ctx) {
  const names = Object.keys(ctx.mod);
  const out = { version: 1, exports: names.map((n) => [n, ctx.mod[n] === null ? 'null' : typeof ctx.mod[n]]), args: {}, cases: {} };
  for (const n of names) {
    if (typeof ctx.mod[n] !== 'function') continue;
    out.args[n] = OVERRIDES[n] || buildArgs(ctx.mod[n]);
    out.cases[n] = {};
    for (const sc of ['A', 'B', 'C']) out.cases[n][sc] = await runCase(ctx, n, out.args[n], sc);
  }
  return out;
}

module.exports = { loadFacade, captureAll, runCase, safe };
