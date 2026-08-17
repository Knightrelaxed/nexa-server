const router = require('../src/core/AI_Router');
const memories = require('../src/infrastructure/Supabase_Memories');

async function testSelectors() {
  const facts = await memories.getPersonalFacts();
  console.log('Core identity count in DB:', facts.coreIdentity.length);
  
  const test1 = router.selectCoreIdentityFacts(facts.coreIdentity, 'Nexa, coba telepon HP saya');
  console.log('\n[Test 1] Query: "Nexa, coba telepon HP saya"');
  console.log('Selected count:', test1.length);
  test1.forEach((f, i) => console.log(' ' + (i+1) + '. ' + f.substring(0, 80) + '...'));

  const test2 = router.selectCoreIdentityFacts(facts.coreIdentity, 'ada pom bensin terdekat di sleman?');
  console.log('\n[Test 2] Query: "ada pom bensin terdekat di sleman?"');
  console.log('Selected count:', test2.length);
  test2.forEach((f, i) => console.log(' ' + (i+1) + '. ' + f.substring(0, 80) + '...'));
}

testSelectors();
