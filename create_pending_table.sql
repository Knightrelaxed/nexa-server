-- Run this in Supabase SQL Editor to create the persistent pending transactions table
-- Go to: https://supabase.com → Your Project → SQL Editor → New query

CREATE TABLE IF NOT EXISTS nexa_pending_transactions (
  id bigserial PRIMARY KEY,
  composite_key text UNIQUE NOT NULL,
  tx_data jsonb NOT NULL,
  telegram_sent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookup and cleanup
CREATE INDEX IF NOT EXISTS idx_pending_tx_composite_key ON nexa_pending_transactions(composite_key);
CREATE INDEX IF NOT EXISTS idx_pending_tx_telegram_sent ON nexa_pending_transactions(telegram_sent);
