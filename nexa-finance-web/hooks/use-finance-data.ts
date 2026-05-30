'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchAccounts,
  fetchCategories,
  fetchTransactions,
  fetchMonthlySummary,
  fetchDailyBalanceTrend,
} from '@/lib/supabase/queries';
import {
  createAccount as apiCreateAccount,
  deleteAccount as apiDeleteAccount,
  CreateAccountInput,
} from '@/lib/supabase/mutations';
import type {
  AccountWithBalance,
  DbCategory,
  TransactionWithDetails,
  MonthlySummaryRow,
  DailyBalanceTrendRow,
  TransactionFilters,
} from '@/lib/supabase/types';
import { isSupabaseConfigured } from '@/lib/supabase/client';

// No Auth Required - Single User Mode

// ----------------------------------------------------------------
// useAccounts
// ----------------------------------------------------------------

export interface UseAccountsReturn {
  accounts: AccountWithBalance[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createAccount: (data: CreateAccountInput) => Promise<AccountWithBalance | null>;
  deleteAccount: (accountId: string) => Promise<void>;
}

export function useAccounts(): UseAccountsReturn {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured) { setLoading(false); return; }
      const data = await fetchAccounts();
      setAccounts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createAccount = useCallback(
    async (data: CreateAccountInput): Promise<AccountWithBalance | null> => {
      try {
        if (!isSupabaseConfigured) return null;
        const created = await apiCreateAccount(data);
        await load();
        return { ...created, balance: created.initial_balance } as AccountWithBalance;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create account');
        return null;
      }
    },
    [load]
  );

  const deleteAccount = useCallback(
    async (accountId: string): Promise<void> => {
      try {
        await apiDeleteAccount(accountId);
        await load();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete account');
      }
    },
    [load]
  );

  return { accounts, loading, error, refetch: load, createAccount, deleteAccount };
}

// ----------------------------------------------------------------
// useCategories
// ----------------------------------------------------------------

// Module-level cache: kategori sangat jarang berubah, cukup fetch sekali
// per-session sehingga tidak perlu hit Supabase setiap kali komponen mount.
let _categoriesCache: DbCategory[] | null = null
let _categoriesFetchPromise: Promise<DbCategory[]> | null = null

export interface UseCategoriesReturn {
  categories: DbCategory[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<DbCategory[]>(_categoriesCache ?? []);
  const [loading, setLoading] = useState(_categoriesCache === null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured) { setLoading(false); return; }
      const data = await fetchCategories();
      _categoriesCache = data;
      setCategories(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Jika cache sudah ada, tidak perlu fetch sama sekali
    if (_categoriesCache !== null) {
      setCategories(_categoriesCache)
      setLoading(false)
      return
    }

    let cancelled = false

    // Jika sedang dalam proses fetch (dipanggil dari komponen lain bersamaan),
    // tunggu promise yang sudah berjalan — tidak membuat request ganda
    if (!_categoriesFetchPromise) {
      if (!isSupabaseConfigured) { setLoading(false); return; }
      _categoriesFetchPromise = fetchCategories()
    }

    _categoriesFetchPromise
      .then((data) => {
        _categoriesCache = data
        _categoriesFetchPromise = null
        if (!cancelled) {
          setCategories(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        _categoriesFetchPromise = null
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load categories')
          setLoading(false)
        }
      })

    return () => { cancelled = true }
  }, []);

  return { categories, loading, error, refetch: load };
}

// ----------------------------------------------------------------
// useTransactions
// ----------------------------------------------------------------

/** Transactions grouped by date */
export type GroupedTransactions = Record<string, TransactionWithDetails[]>;

export interface UseTransactionsReturn {
  transactions: TransactionWithDetails[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  grouped: GroupedTransactions;
  totalAmount: number;
  totalCount: number;
}

export function useTransactions(filters?: TransactionFilters): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured) { setLoading(false); return; }
      const data = await fetchTransactions(filters);
      setTransactions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filters?.accountId,
    filters?.categoryId,
    filters?.startDate,
    filters?.endDate,
    filters?.search,
    filters?.sortBy,
    filters?.type,
    filters?.minAmount,
    filters?.maxAmount,
    filters?.paymentMethod,
    filters?.transferFilter,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by date
  const grouped = useMemo(() => transactions.reduce<GroupedTransactions>((acc, tx) => {
    const key = tx.transaction_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {}), [transactions]);

  const totalAmount = useMemo(() => transactions.reduce((sum, tx) => {
    if (tx.type === 'transfer') return sum;
    return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
  }, 0), [transactions]);

  return {
    transactions,
    loading,
    error,
    refetch: load,
    grouped,
    totalAmount,
    totalCount: transactions.length,
  };
}

// ----------------------------------------------------------------
// useDashboardData
// ----------------------------------------------------------------

export interface ExpenseByCategory {
  category_name: string;
  category_icon_key: string;
  category_icon_bg: string | null;
  category_icon_color: string | null;
  total: number;
}

export interface UseDashboardDataReturn {
  monthlySummary: MonthlySummaryRow[];
  balanceTrend: DailyBalanceTrendRow[];
  totalBalance: number;
  totalIncome: number;
  totalExpense: number;
  cashFlow: number;
  recentTransactions: TransactionWithDetails[];
  expenseByCategory: ExpenseByCategory[];
  dailyCategoryExpenses: any[];
  dailyNeedsWants: { day: string | number; harus: number; butuh: number; ingin: number }[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(period: { start: Date; end: Date }): UseDashboardDataReturn {
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryRow[]>([]);
  const [balanceTrend, setBalanceTrend] = useState<DailyBalanceTrendRow[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithDetails[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategory[]>([]);
  const [dailyCategoryExpenses, setDailyCategoryExpenses] = useState<any[]>([]);
  const [dailyNeedsWants, setDailyNeedsWants] = useState<{ day: string | number; harus: number; butuh: number; ingin: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured) { setLoading(false); return; }

      // Get date range from period
      const startStr = new Date(period.start.getTime() - period.start.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const endStr = new Date(period.end.getTime() - period.end.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

      // Run independent fetches in parallel
      const [accounts, transactions, summary] = await Promise.all([
        fetchAccounts(),
        fetchTransactions({ startDate: startStr, endDate: endStr }),
        fetchMonthlySummary(7),
      ]);

      // Total balance across all accounts
      const totalBal = accounts.reduce((sum, acc) => sum + acc.balance, 0);
      setTotalBalance(totalBal);

      // Income / expense aggregates from all transactions
      let income = 0;
      let expense = 0;
      const categoryMap: Record<
        string,
        {
          category_name: string;
          category_icon_key: string;
          category_icon_bg: string | null;
          category_icon_color: string | null;
          total: number;
        }
      > = {};

      const dailyCatMap: Record<string, Record<string, number>> = {};
      const dailyNeedsWantsMap: Record<string, { harus: number; butuh: number; ingin: number }> = {};

      const getSifat = (group: string | null) => {
        if (!group) return 'butuh';
        if (['Perumahan', 'Transportasi', 'Kendaraan', 'Makanan & Minuman'].includes(group)) return 'harus';
        if (['Hiburan & Kehidupan', 'Belanja'].includes(group)) return 'ingin';
        return 'butuh';
      };

      for (const tx of transactions) {
        if (tx.type === 'income') income += tx.amount;
        if (tx.type === 'expense') {
          expense += tx.amount;
          if (!categoryMap[tx.category_id]) {
            categoryMap[tx.category_id] = {
              category_name: tx.category_name,
              category_icon_key: tx.category_icon_key,
              category_icon_bg: tx.category_icon_bg,
              category_icon_color: tx.category_icon_color,
              total: 0,
            };
          }
          categoryMap[tx.category_id].total += tx.amount;
          
          const dateStr = tx.transaction_date; // YYYY-MM-DD
          if (!dailyCatMap[dateStr]) dailyCatMap[dateStr] = {};
          if (!dailyCatMap[dateStr][tx.category_name]) dailyCatMap[dateStr][tx.category_name] = 0;
          dailyCatMap[dateStr][tx.category_name] += tx.amount;

          const sifat = getSifat(tx.category_group);
          if (!dailyNeedsWantsMap[dateStr]) dailyNeedsWantsMap[dateStr] = { harus: 0, butuh: 0, ingin: 0 };
          dailyNeedsWantsMap[dateStr][sifat] += tx.amount;
        }
      }

      setTotalIncome(income);
      setTotalExpense(expense);
      setMonthlySummary(summary);
      setRecentTransactions(transactions.slice(0, 10));
      setExpenseByCategory(
        Object.values(categoryMap).sort((a, b) => b.total - a.total)
      );

      // Build daily arrays from start to end date
      const dailyCatArr = [];
      const dailyNeedsArr = [];
      const iter = new Date(period.start);
      iter.setHours(0,0,0,0);
      const endIter = new Date(period.end);
      endIter.setHours(0,0,0,0);
      
      let safetyCount = 0;
      while (iter <= endIter && safetyCount < 366) { // max 1 year for safety
        const y = iter.getFullYear();
        const m = String(iter.getMonth() + 1).padStart(2, '0');
        const d = String(iter.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        
        // short format like "5 Mei" or "24" depending on length of period
        const dayLabel = (endIter.getTime() - period.start.getTime()) > 35 * 86400000 
            ? new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(iter) + ' ' + y.toString().substring(2)
            : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(iter);

        dailyCatArr.push({ day: dayLabel, ...dailyCatMap[dateStr] });
        dailyNeedsArr.push({ 
           day: dayLabel, 
           harus: dailyNeedsWantsMap[dateStr]?.harus || 0,
           butuh: dailyNeedsWantsMap[dateStr]?.butuh || 0,
           ingin: dailyNeedsWantsMap[dateStr]?.ingin || 0,
        });
        
        iter.setDate(iter.getDate() + 1);
        safetyCount++;
      }
      setDailyCategoryExpenses(dailyCatArr);
      setDailyNeedsWants(dailyNeedsArr);

      // Balance trend for the first (primary) account over the selected period
      if (accounts.length > 0) {
        const trend = await fetchDailyBalanceTrend(
          accounts[0].id,
          startStr,
          endStr
        );
        setBalanceTrend(trend);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.start.toISOString(), period.end.toISOString()]);

  useEffect(() => {
    load();
  }, [load]);

  const cashFlow = totalIncome - totalExpense;

  return {
    monthlySummary,
    balanceTrend,
    totalBalance,
    totalIncome,
    totalExpense,
    cashFlow,
    recentTransactions,
    expenseByCategory,
    dailyCategoryExpenses,
    dailyNeedsWants,
    loading,
    error,
    refetch: load,
  };
}
