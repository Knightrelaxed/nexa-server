-- ================================================================
-- Migration: Add exclude_from_stats column to accounts table
-- Feature:   Vault / Tabungan Tersembunyi
-- Date:      2026-11-15
-- ================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ================================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS exclude_from_stats boolean NOT NULL DEFAULT false;

-- Verify the column was added:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'accounts' AND column_name = 'exclude_from_stats';
