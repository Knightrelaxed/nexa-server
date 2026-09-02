const intentionEngine = require('../src/domain/Intention_Engine');
const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function testReconcile() {
  console.log('Testing auto-reconcile with text: "Alhamdulillah kemarin udah daftar MUN nih bro"');
  await intentionEngine.autoReconcileIntentions('Alhamdulillah kemarin udah daftar MUN nih bro');
  
  const { data } = await sb.from('nexa_pending_intentions').select('id, intention, status, reconciled_at').eq('id', 33);
  console.log('Intention #33 status after reconcile:', data?.[0]);

  // Reset back to ACTIVE for Tuan
  await sb.from('nexa_pending_intentions').update({ status: 'ACTIVE', reconciled_at: null }).eq('id', 33);
  console.log('Reset #33 back to ACTIVE.');
}
testReconcile();
