const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function saveEmDashPreference() {
  const fact = "Gaya Komunikasi N.E.X.A: Dilarang keras menggunakan tanda baca em dash (—) atau en dash (–) dalam setiap respons karena terkesan seperti mesin/AI. Gunakan tanda koma, titik, atau tanda kurung secara alami.";
  
  const { data: d1, error: e1 } = await sb
    .from('nexa_core_identity')
    .insert([{ fact, created_at: new Date().toISOString() }])
    .select();

  if (e1) {
    console.error('Error saving to nexa_core_identity:', e1.message);
  } else {
    console.log('✅ Permanent core identity saved to nexa_core_identity:', d1?.[0]?.id);
  }

  // Also save to nexa_identity_model under PREFERENCES layer for Tuan Faqih
  const { data: d2, error: e2 } = await sb
    .from('nexa_identity_model')
    .upsert([{
      layer: 'PREFERENCES',
      trait_key: 'no_em_dash_rule',
      trait_value: 'Tuan Faqih sangat tidak menyukai penggunaan tanda baca em dash (— atau –) dalam balasan N.E.X.A karena terkesan kaku dan bergaya AI. N.E.X.A wajib menggunakan koma, titik, atau tanda kurung secara alami.',
      confidence: 1.0,
      evidence_count: 5,
      last_reinforced_at: new Date().toISOString()
    }], { onConflict: 'trait_key' })
    .select();

  if (e2) {
    console.error('Error saving to nexa_identity_model:', e2.message);
  } else {
    console.log('✅ Identity Model updated under PREFERENCES layer:', d2?.[0]?.id);
  }
}

saveEmDashPreference();
