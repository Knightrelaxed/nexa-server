require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const env = require('../src/config/env.js');

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY);

async function updateCoreIdentity() {
  console.log('='.repeat(90));
  console.log('🧠 MEMPERBARUI N.E.X.A CORE IDENTITY DI DATABASE SUPABASE');
  console.log('='.repeat(90));

  // 1. Update ID 215 (jika ada) ke 16-Tier
  const { data: row215 } = await supabase.from('nexa_core_identity').select('id').eq('id', 215).single();
  if (row215) {
    await supabase.from('nexa_core_identity').update({
      content: 'Jika seluruh 16 tier AI N.E.X.A mengalami kegagalan simultan, fungsi executeWithFallback() tidak akan menghentikan sistem dan secara aman mengembalikan respons DUMB_MODE kepada Tuan Faqih.',
      last_reinforced_at: new Date().toISOString()
    }).eq('id', 215);
    console.log('✅ Updated ID 215 to 16-Tier DUMB_MODE rule.');
  }

  // 2. Tambahkan / Update Fakta Inti SACR Dual-Mode (LIGHT & HEAVY)
  const sacrFact = `[SACR DUAL-MODE ROUTING (LIGHT & HEAVY)] Kamu beroperasi dengan arsitektur Smart Adaptive Context Routing (SACR) v2.0 yang membagi beban kerja secara otomatis:
1. MODE LIGHT ⚡ (Chat Harian & Refleks Cepat): Aktif untuk pesan normal (< 1000 karakter). Susunan tier: Tier 1-4 Cerebras Gemma 4 31B (~1.5s respon kilat, hangat, empatik sahabat), Tier 5-8 Google Gemini 3.7 Flash, Tier 9-12 Google Gemini 3.6 Flash (1M TPM), Tier 13-16 HF, Mistral, Puter, OpenRouter.
2. MODE HEAVY 🧠 (Berpikir Kritis, Analisis, & Cron): Aktif untuk pesan > 1000 karakter, kata kunci analitik (rekap, audit keuangan, strategi diplomasi, riset, dokumen), dan seluruh Cron Job eksekutif (Morning Briefing 05:30, Weekly Cognitive Inference Minggu 21:00, Evening Reflective Diary 20:00). Susunan tier: Tier 1-4 Google Gemini 3.7 Flash (High-EQ Consigliere & Critical Thinking), Tier 5-8 Google Gemini 3.6 Flash (1M Token Window & 100% Uptime), Tier 9-12 Google AI Studio Gemma 4 31B dengan optimasi Skip-CoT (Anti-Thinking), Tier 13-16 HF, Mistral, Puter, OpenRouter.`;

  const backupFact = `[16-TIER FALLBACK & GOOGLE GEMMA 4 REPLACEMENT PLAN] Fallback Engine kamu memiliki 16 lapisan redundansi tanpa batas sempit Groq. Mulai September 2026 saat masa bakti shared-tier Cerebras berakhir, posisi Tier 1-4 akan digantikan secara mulus oleh Google AI Studio Gemma 4 31B menggunakan teknik Dual-Layer Anti-CoT ([NO THINKING]) yang memangkas latensi menjadi 4-8 detik dengan kuota raksasa 57.600 chat/hari dan bebas batas token harian (No TPD).`;

  // Cek apakah sudah ada fakta serupa
  const { data: existing } = await supabase
    .from('nexa_core_identity')
    .select('id, content')
    .ilike('content', '%[SACR DUAL-MODE ROUTING%');

  if (existing && existing.length > 0) {
    await supabase.from('nexa_core_identity').update({
      content: sacrFact,
      status: 'ACTIVE',
      last_reinforced_at: new Date().toISOString()
    }).eq('id', existing[0].id);
    console.log(`✅ Updated existing SACR fact ID #${existing[0].id}.`);
  } else {
    const { data: inserted } = await supabase.from('nexa_core_identity').insert([{
      content: sacrFact,
      category_type: 'RULE',
      status: 'ACTIVE',
      evidence_count: 1,
      last_reinforced_at: new Date().toISOString()
    }]).select('id');
    console.log(`✅ Inserted new SACR fact with ID #${inserted?.[0]?.id}.`);
  }

  // Cek apakah sudah ada backup fact
  const { data: existingBackup } = await supabase
    .from('nexa_core_identity')
    .select('id, content')
    .ilike('content', '%[16-TIER FALLBACK & GOOGLE GEMMA 4%');

  if (existingBackup && existingBackup.length > 0) {
    await supabase.from('nexa_core_identity').update({
      content: backupFact,
      status: 'ACTIVE',
      last_reinforced_at: new Date().toISOString()
    }).eq('id', existingBackup[0].id);
    console.log(`✅ Updated existing backup fact ID #${existingBackup[0].id}.`);
  } else {
    const { data: insertedBackup } = await supabase.from('nexa_core_identity').insert([{
      content: backupFact,
      category_type: 'RULE',
      status: 'ACTIVE',
      evidence_count: 1,
      last_reinforced_at: new Date().toISOString()
    }]).select('id');
    console.log(`✅ Inserted new Backup fact with ID #${insertedBackup?.[0]?.id}.`);
  }

  console.log('\n' + '='.repeat(90));
  console.log('🎉 N.E.X.A CORE IDENTITY BERHASIL DIMUTAKHIRKAN DI SUPABASE!');
  console.log('='.repeat(90));
}

updateCoreIdentity().catch(console.error);
