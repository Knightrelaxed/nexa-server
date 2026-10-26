'use strict';
/**
 * finance_db/budgets.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Budget and Spending Limits Integration with Supabase Nexa Finance
 * 
 * Tanggung jawab:
 * 1. getBudgetGroups(): Ambil grup budget yang tidak diarsipkan
 * 2. getBudgets(): Ambil budget aktif dan filter yang grupnya diarsipkan
 * 3. getExpenseSumByCategories(): Akumulasi real-time pengeluaran untuk budget tracking
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { supabaseFinance } = require('./client');

/**
 * Ambil daftar kelompok kategori (budget_groups)
 */
async function getBudgetGroups() {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance
    .from('budget_groups')
    .select('*')
    .eq('is_archived', false);
  if (error) {
    console.error('[SUPABASE_FINANCE] getBudgetGroups error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Ambil daftar anggaran (budgets) — hanya yang aktif dan kelompok yang belum diarsipkan
 */
async function getBudgets() {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance
    .from('budgets')
    .select('*, budget_groups!left(*)')
    .eq('is_active', true);
  if (error) {
    console.error('[SUPABASE_FINANCE] getBudgets error:', error.message);
    return [];
  }
  // Filter out budgets yang merujuk ke grup yang sudah diarsipkan
  return (data || []).filter(b =>
    b.budget_group_id === null || // Global budgets selalu lolos
    (b.budget_groups && !b.budget_groups.is_archived)
  );
}

/**
 * Ambil total transaksi expense berdasarkan list category_ids dan rentang waktu.
 * Jika categoryIds kosong atau null, hitung global (semua expense).
 * PENTING: startDate dan endDate harus berupa Date object dalam UTC yang merepresentasikan
 * waktu WIB dengan benar (gunakan getStartAndEndOf() dari Budget_Engine).
 */
async function getExpenseSumByCategories(categoryIds, startDate, endDate) {
  if (!supabaseFinance) return 0;
  
  // Gunakan format tanggal lokal WIB (Asia/Jakarta) bukan toISOString() yang UTC
  // agar query `.gte('transaction_date', ...)` cocok dengan data yang disimpan dalam WIB
  const toWIBDateStr = (d) => new Date(d.getTime()).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  const startStr = toWIBDateStr(startDate);
  const endStr = toWIBDateStr(endDate);

  let query = supabaseFinance
    .from('transactions')
    .select('amount')
    .eq('type', 'expense')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr);
    
  if (categoryIds && categoryIds.length > 0) {
    query = query.in('category_id', categoryIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE_FINANCE] getExpenseSumByCategories error:', error.message);
    return 0;
  }
  
  return (data || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
}

module.exports = {
  getBudgetGroups,
  getBudgets,
  getExpenseSumByCategories
};
