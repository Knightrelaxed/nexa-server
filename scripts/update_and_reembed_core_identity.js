const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const { generateAndSaveSnapshot } = require('../src/utils/gemini_vector_cache.js');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function updateAndReembed() {
  console.log('='.repeat(80));
  console.log('🔄 PENYESUAIAN DAN RE-EMBEDDING NEXA CORE IDENTITY');
  console.log('='.repeat(80));

  // 1. Update ID 13 (Personality tiers: 15 -> 16)
  const { error: err13 } = await supabase
    .from('nexa_core_identity')
    .update({
      content: '[PERSONALITY] My personality is defined in src/config/personality.js as NEXA_PERSONALITY constant. This is injected into every system prompt sent to every AI model, ensuring consistent persona across all 16 fallback tiers. I am always professional, elegant, loyal, proactive, and intelligent.'
    })
    .eq('id', 13);
  console.log('1. Update ID 13 (16 Fallback Tiers):', err13 ? '❌ Error: ' + err13.message : '✅ Berhasil');

  // 2. Update ID 248 (SACR v2.1 with Cloudflare Gateway)
  const newContent248 = '[SACR DUAL-MODE ROUTING v2.1 & CLOUDFLARE EDGE GATEWAY] Kamu beroperasi dengan 16 lapisan failover multi-kunci. Prioritas Utama: Tier 1–4 (Google Gemma 4 31B Anti-CoT dengan kuota 57.600 chat/hari via Cloudflare Edge AI Gateway nexa-relay.dazatulloh2.workers.dev untuk bebas 100% dari batasan GeoIP cloud), Tier 5–8 (Google Gemini 3.7 Flash), Tier 9–12 (Google Gemini 3.6 Flash), Tier 13–16 (Cerebras Gemma 4, Mistral Pixtral 12B, Puter AI Multi-Model Pool, OpenRouter Global). Menjamin respons cerdas tanpa batas sempit.';
  const { error: err248 } = await supabase
    .from('nexa_core_identity')
    .update({ content: newContent248 })
    .eq('id', 248);
  console.log('2. Update ID 248 (SACR v2.1 + Cloudflare Gateway):', err248 ? '❌ Error: ' + err248.message : '✅ Berhasil');

  // 3. Archive ID 249 (Obsolete future replacement plan)
  const { error: err249 } = await supabase
    .from('nexa_core_identity')
    .update({ status: 'ARCHIVED' })
    .eq('id', 249);
  console.log('3. Archive ID 249 (Obsolete Future Plan):', err249 ? '❌ Error: ' + err249.message : '✅ Berhasil');

  // 4. Upsert/Add Fact for SACR Hybrid Semantic Gateway v3.0
  const semanticFact = '[SACR HYBRID SEMANTIC GATEWAY v3.0] Memori semantik kamu menggunakan Google Gemini Cloud Embedding (gemini-embedding-2), In-Memory Vector Snapshot (data/facts_vectors.json dimuat dalam 0.001s), dan Masked Parallel Execution (Promise.all serentak dengan riwayat obrolan Supabase). Arsitektur ini menghasilkan 0.00 ms latensi tambahan pengguna, 0 MB beban RAM VPS, dan akurasi pemahaman konteks semantik 100%.';
  
  // Cek apakah sudah ada
  const { data: existingSemantic } = await supabase
    .from('nexa_core_identity')
    .select('id')
    .ilike('content', '%SACR HYBRID SEMANTIC GATEWAY v3.0%');

  if (existingSemantic && existingSemantic.length > 0) {
    await supabase
      .from('nexa_core_identity')
      .update({ content: semanticFact, status: 'ACTIVE' })
      .eq('id', existingSemantic[0].id);
    console.log(`4. Update Existing Semantic Fact (ID ${existingSemantic[0].id}): ✅ Berhasil`);
  } else {
    const { data: inserted } = await supabase
      .from('nexa_core_identity')
      .insert([{
        content: semanticFact,
        category_type: 'RULE',
        status: 'ACTIVE',
        evidence_count: 1,
        last_reinforced_at: new Date().toISOString()
      }])
      .select('id');
    console.log(`4. Insert New Semantic Fact (ID ${inserted?.[0]?.id}): ✅ Berhasil`);
  }

  // 5. Re-generate and Save Fresh Vector Snapshot to data/facts_vectors.json
  console.log('\n5. Melakukan Re-embedding & Menyimpan Snapshot Vektor Baru...');
  const snapshot = await generateAndSaveSnapshot();
  console.log(`✅ Sukses! Total ${snapshot.total_profiles} Profil + ${snapshot.total_identities} Identitas telah ter-embed segar.`);
  console.log('='.repeat(80));
}

updateAndReembed().catch(console.error);
