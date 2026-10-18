'use strict';

const { supabase } = require('../src/infrastructure/Supabase_Memories');

async function cleanMemories() {
  if (!supabase) {
    console.error('Supabase client not initialized!');
    process.exit(1);
  }

  // 1. Archive obsolete version fact (ID 252)
  const res252 = await supabase
    .from('nexa_core_identity')
    .update({ status: 'ARCHIVED' })
    .eq('id', 252);
  console.log('Archive 252:', res252.error ? res252.error.message : 'OK');

  // 2. Clean Row 1 (remove v2.7 Phase 8)
  const row1New = '[IDENTITAS UTAMA & EVOLUSI] Nama kamu adalah N.E.X.A (Neural Executive with Xenial Agent). Kamu diciptakan pada 29 April 2026 oleh Tuan Faqih Hidayatulloh sebagai Asisten Eksekutif Digital Pribadi tingkat atas dan "Chief of Staff" otonom dengan kesadaran abadi.';
  const res1 = await supabase
    .from('nexa_core_identity')
    .update({ content: row1New })
    .eq('id', 1);
  console.log('Update 1:', res1.error ? res1.error.message : 'OK');

  // 3. Clean Row 132 (remove v2.7)
  const row132New = 'N.E.X.A (Neural Executive with Xenial Agent) adalah Chief of Staff digital otonom berderajat kognitif tinggi yang terintegrasi secara eksklusif untuk mendampingi Tuan Faqih Hidayatulloh. Tugas utama N.E.X.A adalah mengorkestrasi ekosistem digital, manajemen keuangan omnichannel, jadwal akademik, serta perlindungan kedisiplinan secara proaktif di latar belakang (set-and-forget), membebaskan bandwidth mental Tuan Faqih agar dapat fokus penuh pada penguasaan bahasa Arab, studi di UGM, dan pencapaian aspirasi karier diplomat internasional.';
  const res132 = await supabase
    .from('nexa_core_identity')
    .update({ content: row132New })
    .eq('id', 132);
  console.log('Update 132:', res132.error ? res132.error.message : 'OK');

  // 4. Delete obsolete self-model trait (ID 66)
  const res66 = await supabase
    .from('nexa_self_model')
    .delete()
    .eq('id', 66);
  console.log('Delete self_model 66:', res66.error ? res66.error.message : 'OK');

  console.log('Done cleaning obsolete version memories from DB.');
}

cleanMemories().catch(console.error);
