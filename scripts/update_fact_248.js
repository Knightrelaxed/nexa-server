const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);

async function updateFact248() {
  console.log('Updating Fact #248 in nexa_core_identity to SACR v2.1...');
  
  const content = '[SACR DUAL-MODE ROUTING v2.1 (57.6K RPD GOOGLE GEMMA 4 PRIMARY)] Kamu beroperasi dengan 16 lapisan failover multi-kunci. Prioritas Utama: Tier 1–4 (Google Gemma 4 31B Anti-CoT dengan kuota 57.600 request/hari), Tier 5–8 (Google Gemini 3.7 Flash), Tier 9–12 (Google Gemini 3.6 Flash), Tier 13–16 (Cerebras, Mistral, Puter AI, OpenRouter). Sistem ini menjamin refleks cerdas tanpa batas kuota.';

  const { data, error } = await supabase
    .from('nexa_core_identity')
    .update({
      content: content,
      last_reinforced_at: new Date().toISOString()
    })
    .eq('id', 248)
    .select();

  if (error) {
    console.error('Error updating Fact 248:', error.message);
  } else {
    console.log('Fact 248 updated successfully:', data);
  }
}

updateFact248().catch(console.error);
