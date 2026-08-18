const dns = require('dns');
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}

require('dotenv').config();
const { generateAndSaveSnapshot } = require('../src/utils/gemini_vector_cache');

async function main() {
  console.log('='.repeat(95));
  console.log('📦 GENERATING GEMINI VECTOR SNAPSHOT (data/facts_vectors.json)');
  console.log('='.repeat(95));
  
  const res = await generateAndSaveSnapshot();
  console.log(`\n🎉 SELESAI! Total ${res.total_profiles} Profil + ${res.total_identities} Identitas telah di-embed dan disimpan.`);
}

main().catch(console.error);
