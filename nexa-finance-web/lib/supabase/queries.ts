import { supabase } from './client';
import type {
  AccountWithBalance,
  DbCategory,
  TransactionWithDetails,
  MonthlySummaryRow,
  DailyBalanceTrendRow,
  TransactionFilters,
} from './types';

// ----------------------------------------------------------------
// Accounts
// ----------------------------------------------------------------

/**
 * Fetch all accounts for a user and compute their running balance.
 * balance = initial_balance + Σ income – Σ expense
 */
export async function fetchAccounts(): Promise<AccountWithBalance[]> {
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (accErr) throw accErr;
  if (!accounts || accounts.length === 0) return [];

  // Fetch income/expense aggregates grouped by account
  const { data: txAgg, error: txErr } = await supabase
    .from('transactions')
    .select('account_id, type, amount');

  if (txErr) throw txErr;

  // Build a map: accountId => { income, expense }
  const balanceMap: Record<string, { income: number; expense: number }> = {};
  for (const row of txAgg ?? []) {
    if (!balanceMap[row.account_id]) {
      balanceMap[row.account_id] = { income: 0, expense: 0 };
    }
    if (row.type === 'income') {
      balanceMap[row.account_id].income += Number(row.amount);
    } else if (row.type === 'expense') {
      balanceMap[row.account_id].expense += Number(row.amount);
    }
  }

  return accounts.map((acc) => {
    const agg = balanceMap[acc.id] ?? { income: 0, expense: 0 };
    return {
      ...acc,
      initial_balance: Number(acc.initial_balance),
      balance: Number(acc.initial_balance) + agg.income - agg.expense,
    } as AccountWithBalance;
  });
}

// ----------------------------------------------------------------
// Account Mutations
// ----------------------------------------------------------------

export async function createAccount(data: { name: string; type: string; initial_balance: number }) {
  const { error } = await supabase.from('accounts').insert([data]);
  if (error) throw error;
}

export async function updateAccount(id: string, data: { name?: string; type?: string; initial_balance?: number }) {
  const { error } = await supabase.from('accounts').update(data).eq('id', id);
  if (error) throw error;
}

export async function archiveAccount(id: string) {
  const { error } = await supabase.from('accounts').update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// Categories
// ----------------------------------------------------------------

/**
 * Fetch all categories for a user ordered by type then sort_order.
 */
export async function fetchCategories(): Promise<DbCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .eq('is_archived', false)
    .order('type', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DbCategory[];
}

// ----------------------------------------------------------------
// Category Mutations
// ----------------------------------------------------------------

export async function createCategory(data: { name: string; type: string; icon_key?: string; icon_bg?: string; icon_color?: string; group_name?: string }) {
  const { error } = await supabase.from('categories').insert([data]);
  if (error) throw error;
}

export async function updateCategory(id: string, data: Partial<{ name: string; type: string; icon_key: string; icon_bg: string; icon_color: string; group_name: string }>) {
  const { error } = await supabase.from('categories').update(data).eq('id', id);
  if (error) throw error;
}

export async function archiveCategory(id: string) {
  const { error } = await supabase.from('categories').update({ is_archived: true }).eq('id', id);
  if (error) throw error;
}

// ----------------------------------------------------------------
// Transactions
// ----------------------------------------------------------------

/**
 * Fetch transactions joined with account and category data.
 * Supports optional filters: accountId, categoryId, date range, search text.
 */
export async function fetchTransactions(
  filters?: TransactionFilters
): Promise<TransactionWithDetails[]> {
  let query = supabase
    .from('transactions')
    .select(
      `
      *,
      accounts!transactions_account_id_fkey ( name ),
      categories!transactions_category_id_fkey ( name, icon_key, icon_bg, icon_color, color_hex, group_name )
      `
    )
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false });

  if (filters?.accountId) {
    query = query.eq('account_id', filters.accountId);
  }
  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }
  if (filters?.startDate) {
    query = query.gte('transaction_date', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('transaction_date', filters.endDate);
  }
  if (filters?.search) {
    query = query.ilike('description', `%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data as any[]) ?? []).map((row) => ({
    id: row.id,
    account_id: row.account_id,
    category_id: row.category_id,
    amount: Number(row.amount),
    type: row.type,
    transaction_date: row.transaction_date,
    transaction_time: row.transaction_time,
    description: row.description,
    payment_method: row.payment_method ?? null,
    created_at: row.created_at,
    account_name: row.accounts?.name ?? '',
    category_name: row.categories?.name ?? '',
    category_icon_key: row.categories?.icon_key ?? '',
    category_icon_bg: row.categories?.icon_bg ?? null,
    category_icon_color: row.categories?.icon_color ?? null,
    category_color_hex: row.categories?.color_hex ?? null,
    category_group: row.categories?.group_name ?? null,
  })) as TransactionWithDetails[];
}

// ----------------------------------------------------------------
// RPC – Monthly Summary
// ----------------------------------------------------------------

/**
 * Call the get_monthly_summary Postgres function.
 */
export async function fetchMonthlySummary(
  months: number = 7
): Promise<MonthlySummaryRow[]> {
  const { data, error } = await supabase.rpc('get_monthly_summary', {
    p_months: months,
  });

  if (error) throw error;
  return ((data as any[]) ?? []).map((row) => ({
    month: row.month as string,
    total_income: Number(row.total_income),
    total_expense: Number(row.total_expense),
  }));
}

// ----------------------------------------------------------------
// RPC – Daily Balance Trend
// ----------------------------------------------------------------

/**
 * Call the get_daily_balance_trend Postgres function.
 */
export async function fetchDailyBalanceTrend(
  accountId: string,
  startDate: string,
  endDate: string
): Promise<DailyBalanceTrendRow[]> {
  const { data, error } = await supabase.rpc('get_daily_balance_trend', {
    p_account_id: accountId,
    p_start: startDate,
    p_end: endDate,
  });

  if (error) throw error;
  return ((data as any[]) ?? []).map((row) => ({
    day: row.day as string,
    daily_income: Number(row.daily_income),
    daily_expense: Number(row.daily_expense),
    running_balance: Number(row.running_balance),
  }));
}

// ----------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------

/**
 * Fetch the oldest transaction date to determine dynamic month ranges.
 */
export async function fetchOldestTransactionDate(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('transaction_date')
    .order('transaction_date', { ascending: true })
    .limit(1);

  if (error) {
    console.error("Error fetching oldest transaction date:", error);
    return null;
  }

  if (data && data.length > 0 && data[0].transaction_date) {
    return new Date(data[0].transaction_date);
  }

  return null;
}
