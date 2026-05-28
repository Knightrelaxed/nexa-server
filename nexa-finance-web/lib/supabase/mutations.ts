import { supabase } from './client';
import type { DbAccount, DbTransaction } from './types';

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
    })
    .select()
    .single();

  if (error) throw error;
  return result as DbTransaction;
}

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
