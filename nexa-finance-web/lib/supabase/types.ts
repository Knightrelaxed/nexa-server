// ============================================================
// Nexa Finance – Database TypeScript Types
// ============================================================

// ----------------------------------------------------------------
// Raw database row types (mirror the SQL schema)
// ----------------------------------------------------------------

export interface DbAccount {
  id: string;
  name: string;
  type: 'cash' | 'bank' | 'e-wallet';
  initial_balance: number;
  currency: string;
  color: string;
  icon_key: string;
  is_archived: boolean;
  exclude_from_stats: boolean;
  created_at: string;
}

export interface DbCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  group_name: string | null;
  icon_key: string;
  icon_bg: string | null;
  icon_color: string | null;
  color_hex: string | null;
  sort_order: number;
  is_archived?: boolean;
  created_at: string;
}

export type PaymentMethod = 'QRIS' | 'Transfer bank' | 'Kartu Kredit' | 'Tunai';

export interface DbTransaction {
  id: string;
  account_id: string;
  category_id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  transaction_date: string; // ISO date string (YYYY-MM-DD)
  transaction_time: string | null;
  description: string | null;
  payment_method: PaymentMethod | null;
  created_at: string;
}

// ----------------------------------------------------------------
// Extended / computed types
// ----------------------------------------------------------------

/** Account with computed running balance */
export interface AccountWithBalance extends DbAccount {
  balance: number;
}

/** Transaction row joined with account and category details */
export interface TransactionWithDetails extends DbTransaction {
  account_name: string;
  category_name: string;
  category_icon_key: string;
  category_icon_bg: string | null;
  category_icon_color: string | null;
  category_color_hex: string | null;
  category_group: string | null;
}

// ----------------------------------------------------------------
// RPC return types
// ----------------------------------------------------------------

export interface MonthlySummaryRow {
  month: string;          // 'YYYY-MM'
  total_income: number;
  total_expense: number;
}

export interface DailyBalanceTrendRow {
  day: string;            // ISO date string
  daily_income: number;
  daily_expense: number;
  running_balance: number;
}

// ----------------------------------------------------------------
// Utility input types
// ----------------------------------------------------------------

export type TransactionType = 'income' | 'expense' | 'transfer';
export type AccountType = 'cash' | 'bank' | 'e-wallet';
export type CategoryType = 'income' | 'expense';

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  search?: string;
  sortBy?: 'waktu_terbaru' | 'waktu_terlama';
  type?: 'all' | 'income' | 'expense' | 'transfer';
  minAmount?: number;
  maxAmount?: number;
  paymentMethod?: string;
  transferFilter?: 'include' | 'only' | 'exclude';
}
