#!/usr/bin/env node
'use strict';
// =====================================================================
// backfill_directives.js - [v3.3.2] one-off backfill of nexa_identity_model.directive
//
//   node scripts/backfill_directives.js                 dry run (default): prints what WOULD change
//   node scripts/backfill_directives.js --apply         writes directives (never overwrites an existing one)
//   options: --limit 400  --batch 15  --no-private-weaknesses
//
// Writes ONLY the 'directive' column (and sensitivity='private' for WEAKNESSES unless disabled).
// Confidence, evidence and decay are never touched.
// =====================================================================
const { validateDirective, defaultSensitivityForLayer, DIRECTIVE_PROMPT_RULES } = require('../src/utils/directive_utils');

function parseArgs(argv = []) {
  const out = { apply: false, limit: 400, batch: 15, privateWeaknesses: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--no-private-weaknesses') out.privateWeaknesses = false;
    else if (a === '--limit') out.limit = Math.max(1, parseInt(argv[++i], 10) || out.limit);
    else if (a === '--batch') out.batch = Math.min(30, Math.max(1, parseInt(argv[++i], 10) || out.batch));
  }
  return out;
}

function buildBackfillPrompts(items) {
  const systemPrompt = `Anda adalah penyusun arahan operasional untuk asisten pribadi N.E.X.A.
Untuk setiap trait identitas pengguna, tulis directive: cara N.E.X.A harus bersikap atau menyusun jawaban karena trait itu.

${DIRECTIVE_PROMPT_RULES}

FORMAT OUTPUT (JSON MURNI, tanpa markdown): [{"id": 12, "directive": "..."}]
Satu objek per trait yang diberikan, dengan id yang sama persis.`;
  const lines = items.map(it =>
    `- id=${it.id} | layer=${it.layer} | sensitivitas=${(it.sensitivity === 'private' || defaultSensitivityForLayer(it.layer) === 'private') ? 'private' : 'normal'} | ${it.trait_key}: "${it.trait_value}"`
  ).join('\n');
  return { systemPrompt, userPrompt: `Trait yang perlu directive:\n${lines}` };
}

function parseBackfillResponse(raw, items) {
  const byId = new Map(items.map(it => [Number(it.id), it]));
  const result = { accepted: [], skipped: [], rejected: [] };
  let clean = String(raw || '').replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = clean.indexOf('[');
  const b = clean.lastIndexOf(']');
  if (a === -1 || b <= a) return { ...result, rejected: [{ id: null, reason: 'no_json_array' }] };
  let parsed;
  try { parsed = JSON.parse(clean.slice(a, b + 1)); } catch (_) { return { ...result, rejected: [{ id: null, reason: 'invalid_json' }] }; }
  if (!Array.isArray(parsed)) return { ...result, rejected: [{ id: null, reason: 'not_an_array' }] };
  for (const row of parsed) {
    const item = row && byId.get(Number(row.id));
    if (!item) { result.rejected.push({ id: row ? row.id : null, reason: 'unknown_id' }); continue; }
    if (typeof row.directive === 'string' && row.directive.trim() === '') {
      result.skipped.push({ id: item.id, reason: 'no_behavioral_implication' });
      continue;
    }
    const sensitivity = item.sensitivity === 'private' ? 'private' : defaultSensitivityForLayer(item.layer);
    const v = validateDirective(row.directive, { traitValue: item.trait_value, sensitivity });
    if (v.ok) result.accepted.push({ id: item.id, layer: item.layer, trait_key: item.trait_key, directive: v.directive });
    else result.rejected.push({ id: item.id, reason: v.reason });
  }
  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { createClient } = require('@supabase/supabase-js');
  const env = require('../src/config/env');
  const { executeWithFallback } = require('../src/core/Fallback_Engine');
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  const { data: rows, error } = await sb.from('nexa_identity_model')
    .select('id, layer, trait_key, trait_value, sensitivity')
    .is('directive', null).order('layer').order('trait_key').limit(opts.limit);
  if (error) throw new Error(error.message);
  console.log(`Mode: ${opts.apply ? 'APPLY' : 'DRY RUN'} | traits without directive: ${rows.length}`);

  const totals = { accepted: 0, skipped: 0, rejected: 0, written: 0 };
  for (let i = 0; i < rows.length; i += opts.batch) {
    const items = rows.slice(i, i + opts.batch);
    const { systemPrompt, userPrompt } = buildBackfillPrompts(items);
    let raw;
    try { raw = await executeWithFallback(userPrompt, systemPrompt, 0.2, true, { forceHeavy: false }); }
    catch (err) { console.warn(`Batch ${i / opts.batch + 1} failed: ${err.message}`); totals.rejected += items.length; continue; }
    const res = parseBackfillResponse(raw, items);
    totals.accepted += res.accepted.length; totals.skipped += res.skipped.length; totals.rejected += res.rejected.length;
    for (const a of res.accepted) console.log(`  + [${a.layer}] ${a.trait_key}: ${a.directive}`);
    for (const r of res.rejected) console.log(`  - rejected id=${r.id}: ${r.reason}`);
    if (!opts.apply) continue;
    for (const a of res.accepted) {
      const patch = { directive: a.directive };
      if (opts.privateWeaknesses && a.layer === 'WEAKNESSES') patch.sensitivity = 'private';
      const { error: upErr } = await sb.from('nexa_identity_model').update(patch).eq('id', a.id).is('directive', null);
      if (upErr) console.warn(`  ! update failed id=${a.id}: ${upErr.message}`); else totals.written += 1;
    }
  }
  console.log('Summary:', JSON.stringify(totals));
  if (!opts.apply) console.log('Dry run only. Re-run with --apply to write.');
}

module.exports = { parseArgs, buildBackfillPrompts, parseBackfillResponse };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
