import { supabase } from './client';
import type { DbAccount, DbTransaction, PaymentMethod } from './types';

// ----------------------------------------------------------------
// Cross-Component & Realtime Sync Event Dispatcher
// ----------------------------------------------------------------

/**
 * Notifies all active hooks (useTransactions, useAccounts, useDashboardData, etc.)
 * across the application that finance data has changed, triggering instant auto-refresh
 * without requiring the user to reload the browser.
 */
export function notifyFinanceChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('nexa-finance-changed'));
  }
}


// ----------------------------------------------------------------
// Account mutations
// ----------------------------------------------------------------

export interface CreateAccountInput {
  name: string;
  type: 'cash' | 'bank' | 'e-wallet';
  initial_balance?: number;
  currency?: string;
  color?: string;
  icon_key?: string;
  exclude_from_stats?: boolean;
}

/**
 * Insert a new account for the given user.
 */
export async function createAccount(
  data: CreateAccountInput
): Promise<DbAccount> {
  const { data: result, error } = await supabase
    .from('accounts')
    .insert({
      name: data.name,
      type: data.type,
      initial_balance: data.initial_balance ?? 0,
      currency: data.currency ?? 'IDR',
      color: data.color ?? '#22d3ee',
      icon_key: data.icon_key ?? 'wallet',
      exclude_from_stats: data.exclude_from_stats ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return result as DbAccount;
}

/**
 * Update an existing account by id.
 */
export async function updateAccount(
  accountId: string,
  data: Partial<Omit<DbAccount, 'id' | 'user_id' | 'created_at'>>
): Promise<DbAccount> {
  const { data: result, error } = await supabase
    .from('accounts')
    .update(data)
    .eq('id', accountId)
    .select()
    .single();

  if (error) throw error;
  return result as DbAccount;
}

/**
 * Delete an account by id (cascades to its transactions).
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const { error } = await supabase
    .from('accounts')
    .delete()
    .eq('id', accountId);

  if (error) throw error;
}

// ----------------------------------------------------------------
// Transaction mutations
// ----------------------------------------------------------------

export interface CreateTransactionInput {
  account_id: string;
  category_id: string;
  amount: number;
  type: 'income' | 'expense' | 'transfer';
  transaction_date: string; // YYYY-MM-DD
  transaction_time?: string;
  description?: string;
  payment_method?: PaymentMethod | null;
}

/**
 * Insert a new transaction for the given user.
 */
export async function createTransaction(
  data: CreateTransactionInput
): Promise<DbTransaction> {
  const { data: result, error } = await supabase
    .from('transactions')
    .insert({
      account_id: data.account_id,
      category_id: data.category_id,
      amount: data.amount,
      type: data.type,
      transaction_date: data.transaction_date,
      transaction_time: data.transaction_time ?? null,
      description: data.description ?? null,
      payment_method: data.payment_method ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result as DbTransaction;
}

// ----------------------------------------------------------------
// Transfer pair mutations
// ----------------------------------------------------------------

export interface CreateTransferInput {
  from_account_id: string;
  to_account_id: string;
  category_id: string;
  amount: number;
  transaction_date: string; // YYYY-MM-DD
  transaction_time?: string;
  description?: string;
}

/**
 * Create an inter-account transfer as two linked transactions:
 *   split_label="transfer_out" → type="transfer" on from_account (reduces balance)
 *   split_label="transfer_in"  → type="transfer" on to_account   (increases balance)
 * Both rows share the same split_group_id so the UI can track them as a pair.
 *
 * Balance calculation: fetchAccounts() treats transfer_out as expense and
 * transfer_in as income when computing running balance per account.
 */
export async function createTransferPair(
  data: CreateTransferInput
): Promise<{ from: DbTransaction; to: DbTransaction }> {
  const pairId = crypto.randomUUID();

  const base = {
    category_id:      data.category_id,
    amount:           data.amount,
    type:             'transfer' as const,
    transaction_date: data.transaction_date,
    transaction_time: data.transaction_time ?? null,
    description:      data.description ?? null,
    payment_method:   null,
    split_group_id:   pairId,
  };

  const { data: rows, error } = await supabase
    .from('transactions')
    .insert([
      { ...base, account_id: data.from_account_id, split_label: 'transfer_out' },
      { ...base, account_id: data.to_account_id,   split_label: 'transfer_in'  },
    ])
    .select();

  if (error) throw error;
  if (!rows || rows.length < 2) throw new Error('Transfer insert returned fewer than 2 rows');

  const outRow = (rows as any[]).find((r) => r.split_label === 'transfer_out') as DbTransaction;
  const inRow  = (rows as any[]).find((r) => r.split_label === 'transfer_in')  as DbTransaction;
  notifyFinanceChanged();
  return { from: outRow, to: inRow };
}

/**
 * Update both legs of a transfer pair (identified by pairGroupId = split_group_id).
 * Call this when editing a transfer; pass only the fields that changed.
 */
export async function updateTransferPair(
  pairGroupId: string,
  data: {
    from_account_id?: string;
    to_account_id?: string;
    amount?: number;
    transaction_date?: string;
    transaction_time?: string;
    description?: string;
    category_id?: string;
  }
): Promise<void> {
  const commonFields: Record<string, unknown> = {};
  if (data.amount           !== undefined) commonFields.amount           = data.amount;
  if (data.transaction_date !== undefined) commonFields.transaction_date = data.transaction_date;
  if (data.transaction_time !== undefined) commonFields.transaction_time = data.transaction_time;
  if (data.description      !== undefined) commonFields.description      = data.description;
  if (data.category_id      !== undefined) commonFields.category_id      = data.category_id;

  const outPatch: Record<string, unknown> = { ...commonFields };
  if (data.from_account_id) outPatch.account_id = data.from_account_id;

  const inPatch: Record<string, unknown> = { ...commonFields };
  if (data.to_account_id) inPatch.account_id = data.to_account_id;

  const [r1, r2] = await Promise.all([
    supabase
      .from('transactions')
      .update(outPatch)
      .eq('split_group_id', pairGroupId)
      .eq('split_label', 'transfer_out'),
    supabase
      .from('transactions')
      .update(inPatch)
      .eq('split_group_id', pairGroupId)
      .eq('split_label', 'transfer_in'),
  ]);

  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;
}

// ----------------------------------------------------------------
// Generic transaction update / delete
// ----------------------------------------------------------------

/**
 * Update an existing transaction by id.
 */
export async function updateTransaction(
  txId: string,
  data: Partial<Omit<DbTransaction, 'id' | 'user_id' | 'created_at'>>
): Promise<DbTransaction> {
  const { data: result, error } = await supabase
    .from('transactions')
    .update(data)
    .eq('id', txId)
    .select()
    .single();

  if (error) throw error;
  return result as DbTransaction;
}

/**
 * Delete a single transaction by id.
 */
export async function deleteTransaction(txId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', txId);

  if (error) throw error;
}

/**
 * Bulk delete multiple transactions by id.
 */
export async function deleteTransactions(txIds: string[]): Promise<void> {
  if (txIds.length === 0) return;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .in('id', txIds);

  if (error) throw error;
}

/**
 * Delete all transactions in a transfer pair by split_group_id.
 */
export async function deleteTransferPair(pairGroupId: string): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('split_group_id', pairGroupId);

  if (error) throw error;
}
