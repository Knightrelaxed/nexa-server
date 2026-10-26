'use strict';
/**
 * finance_db/client.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Supabase Finance Client Initialization
 * Menggunakan SUPABASE_URL dan SUPABASE_KEY dari konfigurasi environment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('../../config/env');

const supabaseFinance = (() => {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY;
  if (!url || !key) {
    console.warn('[SUPABASE_FINANCE] Konfigurasi belum ada (SUPABASE_URL / SUPABASE_KEY). Dual-write dinonaktifkan.');
    return null;
  }
  return createClient(url, key);
})();

module.exports = {
  supabaseFinance
};
