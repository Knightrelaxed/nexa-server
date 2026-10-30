'use strict';
/**
 * finance_db/analytics.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Financial Analytics, Trends, and Reporting RPCs for Supabase Nexa Finance
 * 
 * Tanggung jawab:
 * 1. getFinanceAnalytics(): Agregasi income, expense, balance, savings rate, avg daily
 * 2. getCategoryBreakdown(): Distribusi pengeluaran per kategori & persentase
 * 3. getTopExpenses(): Transaksi expense terbesar dalam rentang waktu
 * 4. getAccountBalances(): Saldo riil setiap akun (initial balance + net cashflow)
 * 5. getPeriodComparison(): Perbandingan metrik antar 2 periode waktu
 * 6. getDailyTrend(): Tren transaksi hari per hari (zero-filled untuk hari tanpa transaksi)
 * 7. getMonthlySummary(): RPC p_months untuk ringkasan bulanan
 * 8. getDailyBalanceTrend(): RPC tren saldo harian per akun
 * 9. getAllTransactionsForAnalysis(): Paginasi penuh transaksi historis aman dari batas 1.000 Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { supabaseFinance } = require('./client');
const { _loadAccounts } = require('./reference_data');

/**
 * Mendapatkan ringkasan total (Income, Expense, Balance, SavingsRate, AvgDaily) untuk rentang waktu tertentu.
 * Logika identik dengan analytics-view.tsx di Nexa Finance Web.
 * @param {Date} startDate 
 * @param {Date} endDate 
 */
async function getFinanceAnalytics(startDate, endDate) {
  // === Rumus IDENTIK dengan analytics-view.tsx baris 102-106 ===
  // daysInPeriod = Math.ceil((period.end - period.start) / (1000*60*60*24)) + 1
  const daysPassed = (startDate && endDate)
    ? Math.max(Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1, 1)
    : 1;

  if (!supabaseFinance) return { totalIncome: 0, totalExpense: 0, balance: 0, savingsRate: 0, avgDailyExpense: 0, daysPassed, totalTransactions: 0 };
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr);

  if (error) {
    console.error('[SUPABASE_FINANCE] getFinanceAnalytics error:', error.message);
    return { totalIncome: 0, totalExpense: 0, balance: 0, savingsRate: 0, avgDailyExpense: 0, daysPassed, totalTransactions: 0 };
  }

  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of (data || [])) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else if (tx.type === 'expense') totalExpense += tx.amount;
  }

  // savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

  // avgDailyExpense = totalExpense / daysPassed
  const avgDailyExpense = totalExpense / daysPassed;

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    savingsRate,
    avgDailyExpense,
    daysPassed,
    totalTransactions: (data || []).length,
  };
}

/**
 * Breakdown pengeluaran per kategori untuk rentang waktu tertentu.
 * Returns sorted array: [{ name, total, percentage, count }]
 */
async function getCategoryBreakdown(startDate, endDate) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type, categories ( name )')
    .eq('type', 'expense')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr);

  if (error || !data) return [];

  const map = {};
  let grandTotal = 0;
  for (const tx of data) {
    const cat = tx.categories?.name || 'Lainnya';
    if (!map[cat]) map[cat] = { name: cat, total: 0, count: 0 };
    map[cat].total += tx.amount;
    map[cat].count += 1;
    grandTotal += tx.amount;
  }

  return Object.values(map)
    .map(c => ({ ...c, percentage: grandTotal > 0 ? (c.total / grandTotal * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * N transaksi expense terbesar dalam rentang waktu tertentu.
 */
async function getTopExpenses(startDate, endDate, limit = 5) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('id, amount, description, transaction_date, transaction_time, categories ( name ), accounts ( name )')
    .eq('type', 'expense')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr)
    .order('amount', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

/**
 * Saldo real-time per akun (total income - total expense per account_id).
 */
async function getAccountBalances() {
  if (!supabaseFinance) return [];
  const accounts = await _loadAccounts();
  if (!accounts.length) return [];

  const results = [];
  for (const acc of accounts) {
    const { data, error } = await supabaseFinance
      .from('transactions')
      .select('amount, type, split_label')
      .eq('account_id', acc.id);

    if (error) continue;

    let income = 0, expense = 0;
    for (const tx of (data || [])) {
      if (tx.type === 'income') {
        income += tx.amount;
      } else if (tx.type === 'expense') {
        expense += tx.amount;
      } else if (tx.type === 'transfer') {
        if (tx.split_label === 'transfer_out') {
          expense += tx.amount;
        } else if (tx.split_label === 'transfer_in') {
          income += tx.amount;
        }
      }
    }
    results.push({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      initial_balance: acc.initial_balance || 0,
      totalIncome: income,
      totalExpense: expense,
      balance: (acc.initial_balance || 0) + income - expense,
    });
  }
  return results;
}

/**
 * Bandingkan analytics dua periode berbeda.
 * Returns { current, previous }
 */
async function getPeriodComparison(currentStart, currentEnd, prevStart, prevEnd) {
  const [current, previous] = await Promise.all([
    getFinanceAnalytics(currentStart, currentEnd),
    getFinanceAnalytics(prevStart, prevEnd),
  ]);
  return { current, previous };
}

/**
 * Tren pengeluaran harian dalam rentang waktu.
 * Returns array LENGKAP hari per hari (termasuk hari kosong = 0).
 * Logika identik dengan dailySpending di analytics-view.tsx (baris 108-141):
 * menggunakan iter.setDate(iter.getDate() + 1) agar aman lintas bulan.
 * @returns {Array<{ date: string, expense: number, income: number }>}
 */
async function getDailyTrend(startDate, endDate) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type, transaction_date')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr)
    .order('transaction_date', { ascending: true });

  if (error) {
    console.error('[SUPABASE_FINANCE] getDailyTrend error:', error.message);
    return [];
  }

  // Bangun lookup map dari data DB
  const map = {};
  for (const tx of (data || [])) {
    const d = tx.transaction_date;
    if (!map[d]) map[d] = { date: d, expense: 0, income: 0 };
    if (tx.type === 'expense') map[d].expense += tx.amount;
    else if (tx.type === 'income') map[d].income += tx.amount;
  }

  // === Algoritma IDENTIK dengan analytics-view.tsx ===
  // Iterasi hari per hari dari start ke end, tanpa melewati hari kosong.
  // iter.setDate(iter.getDate() + 1) adalah cara aman untuk lintas bulan.
  const trendArray = [];
  const iter = new Date(startDate);
  iter.setHours(0, 0, 0, 0);
  const endIter = new Date(endDate);
  endIter.setHours(0, 0, 0, 0);

  let safetyCount = 0;
  while (iter <= endIter && safetyCount < 366) {
    // Format tanggal lokal (bukan UTC) persis seperti transaction_date di DB
    const y = iter.getFullYear();
    const m = String(iter.getMonth() + 1).padStart(2, '0');
    const d = String(iter.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;

    trendArray.push(
      map[dateStr] || { date: dateStr, expense: 0, income: 0 }
    );

    iter.setDate(iter.getDate() + 1); // Aman lintas bulan
    safetyCount++;
  }

  return trendArray;
}

/**
 * Ringkasan bulanan via RPC get_monthly_summary (sama persis dengan Web).
 * Returns [{ month: 'YYYY-MM', total_income, total_expense }]
 */
async function getMonthlySummary(months = 7) {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance.rpc('get_monthly_summary', { p_months: months });
  if (error) { console.error('[SUPABASE_FINANCE] getMonthlySummary error:', error.message); return []; }
  return (data || []).map(r => ({
    month: r.month,
    total_income: Number(r.total_income),
    total_expense: Number(r.total_expense),
  }));
}

/**
 * Tren saldo harian per akun via RPC get_daily_balance_trend (sama persis dengan Web).
 * @param {string} accountId - UUID akun
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 */
async function getDailyBalanceTrend(accountId, startDate, endDate) {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance.rpc('get_daily_balance_trend', {
    p_account_id: accountId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) { console.error('[SUPABASE_FINANCE] getDailyBalanceTrend error:', error.message); return []; }
  return (data || []).map(r => ({
    day: r.day,
    daily_income: Number(r.daily_income),
    daily_expense: Number(r.daily_expense),
    running_balance: Number(r.running_balance),
  }));
}

/**
 * Ambil seluruh transaksi dalam rentang hari tertentu secara aman tanpa terpotong limit 1.000 Supabase
 */
async function getAllTransactionsForAnalysis(days = 180) {
  if (!supabaseFinance) return [];
  try {
    const cutoffDate = new Date(Date.now() - days * 24 * 3600 * 1000)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    
    let allRows = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabaseFinance
        .from('transactions')
        .select('id, amount, type, transaction_date, description')
        .gte('transaction_date', cutoffDate)
        .order('transaction_date', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('[SUPABASE_FINANCE] getAllTransactionsForAnalysis error:', error.message);
        break;
      }

      if (data && data.length > 0) {
        allRows = allRows.concat(data);
        from += PAGE_SIZE;
        if (data.length < PAGE_SIZE) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    return allRows.map(tx => ({
      merchant: tx.description || 'Pengeluaran',
      nominal: Number(tx.amount),
      date: tx.transaction_date,
      type: (tx.type || 'EXPENSE').toUpperCase()
    }));
  } catch (err) {
    console.error('[SUPABASE_FINANCE] getAllTransactionsForAnalysis exception:', err.message);
    return [];
  }
}

module.exports = {
  getFinanceAnalytics,
  getCategoryBreakdown,
  getTopExpenses,
  getAccountBalances,
  getPeriodComparison,
  getDailyTrend,
  getMonthlySummary,
  getDailyBalanceTrend,
  getAllTransactionsForAnalysis
};
