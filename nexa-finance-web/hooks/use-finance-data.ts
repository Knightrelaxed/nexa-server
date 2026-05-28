'use client';

import { useState, useEffect, useCallback } from 'react';
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

export interface UseCategoriesReturn {
  categories: DbCategory[];
  loading: boolean;
  error: string | null;
}

export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<DbCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupabaseConfigured) { setLoading(false); return; }
      try {
        const data = await fetchCategories();
        if (!cancelled) setCategories(data);
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load categories');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { categories, loading, error };
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
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // Group by date
  const grouped = transactions.reduce<GroupedTransactions>((acc, tx) => {
    const key = tx.transaction_date;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tx);
    return acc;
  }, {});

  const totalAmount = transactions.reduce((sum, tx) => {
    return tx.type === 'income' ? sum + tx.amount : sum - tx.amount;
  }, 0);

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
  dailyNeedsWants: { day: number; harus: number; butuh: number; ingin: number }[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboardData(selectedMonth: Date = new Date()): UseDashboardDataReturn {
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryRow[]>([]);
  const [balanceTrend, setBalanceTrend] = useState<DailyBalanceTrendRow[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithDetails[]>([]);
  const [expenseByCategory, setExpenseByCategory] = useState<ExpenseByCategory[]>([]);
  const [dailyCategoryExpenses, setDailyCategoryExpenses] = useState<any[]>([]);
  const [dailyNeedsWants, setDailyNeedsWants] = useState<{ day: number; harus: number; butuh: number; ingin: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (!isSupabaseConfigured) { setLoading(false); return; }

      // Get date range for the selected month
      const startOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1).toISOString().slice(0, 10);
      const endOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).toISOString().slice(0, 10);

      // Run independent fetches in parallel
      const [accounts, transactions, summary] = await Promise.all([
        fetchAccounts(),
        fetchTransactions({ startDate: startOfMonth, endDate: endOfMonth }),
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
      const dailyNeedsWantsMap: Record<string, { day: number; harus: number; butuh: number; ingin: number }> = {};

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
          
          // BUGFIX: Parsing YYYY-MM-DD string dengan new Date() di JS memperlakukan
          // tanggal sebagai UTC midnight. Di timezone WIB (UTC+7), ini bisa menyebabkan
          // getDate() mengembalikan hari sebelumnya. Gunakan string split yang aman.
          const day = parseInt(tx.transaction_date.split('-')[2], 10);
          if (!dailyCatMap[day]) dailyCatMap[day] = {};
          if (!dailyCatMap[day][tx.category_name]) dailyCatMap[day][tx.category_name] = 0;
          dailyCatMap[day][tx.category_name] += tx.amount;

          const sifat = getSifat(tx.category_group);
          if (!dailyNeedsWantsMap[day]) dailyNeedsWantsMap[day] = { day, harus: 0, butuh: 0, ingin: 0 };
          dailyNeedsWantsMap[day][sifat] += tx.amount;
        }
      }

      setTotalIncome(income);
      setTotalExpense(expense);
      setMonthlySummary(summary);
      setRecentTransactions(transactions.slice(0, 10));
      setExpenseByCategory(
        Object.values(categoryMap).sort((a, b) => b.total - a.total)
      );

      // Build daily category expenses array from 1 to days in month
      const daysInMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate();
      const dailyCatArr = [];
      const dailyNeedsArr = [];
      for (let i = 1; i <= daysInMonth; i++) {
        dailyCatArr.push({ day: i, ...dailyCatMap[i] });
        dailyNeedsArr.push(dailyNeedsWantsMap[i] || { day: i, harus: 0, butuh: 0, ingin: 0 });
      }
      setDailyCategoryExpenses(dailyCatArr);
      setDailyNeedsWants(dailyNeedsArr);

      // Balance trend for the first (primary) account over the selected month
      if (accounts.length > 0) {
        const trend = await fetchDailyBalanceTrend(
          accounts[0].id,
          startOfMonth,
          endOfMonth
        );
        setBalanceTrend(trend);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
    // Gunakan key bulan+tahun yang stabil untuk menghindari re-fetch yang tidak perlu
    // akibat perbedaan millisecond pada toISOString()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [`${selectedMonth.getFullYear()}-${selectedMonth.getMonth()}`]);

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
