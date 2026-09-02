const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env');
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function inspectDecisions() {
  const { data, error } = await sb.from('nexa_decision_journal').select('*');
  if (error) {
    console.error(error);
  } else {
    console.log('Total decisions:', data.length);
    data.forEach(r => {
      console.log(`ID:${r.id} | Decision: "${r.decision}" | OutcomeDue: ${r.outcome_check_at?.substring(0,10)} | Received: ${r.outcome_received_at}`);
    });
  }
}
inspectDecisions();
