'use strict';
/**
 * Supabase_Finance.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Compatibility Facade for Supabase Nexa Finance Database Subsystem
 * 
 * Modul ini dipertahankan sebagai backward-compatible entrypoint agar modul-modul
 * lain (Live_Tool_Registry, Live_Voice_Engine, Split_Engine, cron.js, dll.)
 * tidak perlu mengubah import mereka.
 * 
 * Seluruh implementasi telah dimodularisasi ke dalam direktori:
 * `src/infrastructure/finance_db/`
 *   ├── client.js           (Inisialisasi & konfigurasi Supabase Finance Client)
 *   ├── reference_data.js   (Cache akun/kategori, normalizer & fuzzy resolver)
 *   ├── transactions.js     (CRUD transaksi & fallback dual-write)
 *   ├── analytics.js        (Metrik, perbandingan periode, tren & paginasi transaksi)
 *   ├── budgets.js          (Kelompok anggaran & akumulasi expense per kategori)
 *   ├── recurring.js        (Aturan & kandidat pengeluaran rutin/langganan)
 *   └── index.js            (Ekspor agregat publik & helper _getClient)
 * ─────────────────────────────────────────────────────────────────────────────
 */

module.exports = require('./finance_db');
