const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { generateAndSaveSnapshot } = require('../src/utils/gemini_vector_cache');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function main() {
  console.log('='.repeat(95));
  console.log('🔄 MEMPERBARUI FAKTA SUPABASE #248 (SACR v2.1: GEMMA 4 ANTI-COT TIER 1-4)');
  console.log('='.repeat(95));

  const updatedFact248 = `[SACR v2.1 DUAL-MODE ROUTING (57.6K DAILY FREE POOL)] Kamu beroperasi dengan 16 lapisan failover multi-tier: Tier 1–4 adalah Google Gemma 4 31B (Anti-CoT) dengan kuota raksasa 57.600 chat/hari di 4 kunci API, Tier 5–8 adalah Google Gemini 3.7 Flash, Tier 9–12 adalah Google Gemini 3.6 Flash, Tier 13 adalah Cerebras Gemma 4 (Backup), Tier 14 adalah Mistral Pixtral, Tier 15 adalah Puter AI Multi-Model Pool (Codestral/GPT-4o), dan Tier 16 adalah OpenRouter Free.`;

  const { error } = await supabase
    .from('nexa_core_identity')
    .update({
      content: updatedFact248,
      status: 'ACTIVE'
    })
    .eq('id', 248);

  if (error) {
    console.error('❌ Gagal update fakta #248:', error.message);
  } else {
    console.log('✅ Fakta #248 berhasil diperbarui di Supabase!');
  }

  // Re-generate vector snapshot
  console.log('\n📦 Memperbarui snapshot fakta_vectors.json...');
  await generateAndSaveSnapshot();
  console.log('🎉 Selesai 100%!');
}

main().catch(console.error);
