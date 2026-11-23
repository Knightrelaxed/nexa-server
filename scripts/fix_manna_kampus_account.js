/**
 * One-time fix: Koreksi 13 transaksi split Manna Kampus (Rp102.586, 22 Nov 2026)
 * dari akun Bank Mandiri → Bank Jago
 * 
 * Split group ID: 8bbf575b-e5db-49db-b0e8-9b9af72b8605
 * Run: node scripts/fix_manna_kampus_account.js
 */

require('dotenv').config({ path: '.env' });

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const SPLIT_GROUP_ID = '8bbf575b-e5db-49db-b0e8-9b9af72b8605';
const WRONG_ACCOUNT_NAME = 'Bank Mandiri';
const CORRECT_ACCOUNT_NAME = 'Bank Jago';

async function main() {
  console.log('=== Fix Manna Kampus Transactions ===');

  // 1. Ambil account_id Bank Jago
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, name')
    .ilike('name', '%jago%');

  if (accErr || !accounts?.length) {
    console.error('❌ Gagal mengambil akun Bank Jago:', accErr?.message);
    process.exit(1);
  }

  const jagoAccount = accounts[0];
  console.log(`✅ Bank Jago ditemukan: id=${jagoAccount.id}, name="${jagoAccount.name}"`);

  // 2. Cek transaksi yang akan diupdate
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('id, description, amount, account_id')
    .eq('split_group_id', SPLIT_GROUP_ID);

  if (txErr) {
    console.error('❌ Gagal mengambil transaksi:', txErr.message);
    process.exit(1);
  }

  console.log(`\n📋 Ditemukan ${txs.length} transaksi dengan split_group_id="${SPLIT_GROUP_ID}":`);
  txs.forEach((tx, i) => {
    console.log(`  ${i+1}. [${tx.id}] "${tx.description}" Rp${Number(tx.amount).toLocaleString('id-ID')} | account_id: ${tx.account_id}`);
  });

  if (txs.length === 0) {
    console.log('⚠️  Tidak ada transaksi ditemukan. Keluar.');
    process.exit(0);
  }

  // 3. Update semua ke Bank Jago
  const { data: updated, error: updateErr } = await supabase
    .from('transactions')
    .update({ account_id: jagoAccount.id })
    .eq('split_group_id', SPLIT_GROUP_ID)
    .select('id');

  if (updateErr) {
    console.error('❌ Update gagal:', updateErr.message);
    process.exit(1);
  }

  console.log(`\n✅ Berhasil update ${updated.length} transaksi dari "${WRONG_ACCOUNT_NAME}" → "${CORRECT_ACCOUNT_NAME}".`);
  console.log('=== Selesai ===');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
