/**
 * Supabase_Finance.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Layer integrasi N.E.X.A ↔ Nexa Finance Web (Supabase)
 *
 * Tanggung jawab:
 *  1. Resolver akun  → mengubah nama akun (string) menjadi UUID di tabel `accounts`
 *  2. Resolver kategori → mengubah nama kategori (string) menjadi UUID di tabel `categories`
 *  3. writeTransaction()  → INSERT ke tabel `transactions` (dual-write dari Finance_Engine)
 *  4. getAccountsList()   → Ambil daftar akun aktif untuk di-inject ke AI Router sebagai konteks
 *
 * POLA: Setiap resolver menggunakan in-memory cache sehingga query DB hanya terjadi
 * sekali per session server. Cache dapat di-invalidate manual saat data berubah.
 *
 * KEAMANAN ERROR: Seluruh fungsi publik bersifat non-fatal.
 * Catatan: Ini adalah modul penyimpanan keuangan utama (Single Source of Truth).
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');

// ── Inisialisasi Supabase Finance Client ──────────────────────────────────────
// Menggunakan SUPABASE_URL dan SUPABASE_KEY yang sudah ada di .env N.E.X.A
// (Keduanya terhubung ke project Supabase yang sama, tanpa RLS)
const supabaseFinance = (() => {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_KEY;
  if (!url || !key) {
    console.warn('[SUPABASE_FINANCE] Konfigurasi belum ada (SUPABASE_URL / SUPABASE_KEY). Dual-write dinonaktifkan.');
    return null;
  }
  return createClient(url, key);
})();

// ── In-Memory Cache ───────────────────────────────────────────────────────────
// Mencegah query DB berulang setiap transaksi masuk.
// Di-refresh otomatis setiap 30 menit atau saat invalidateCache() dipanggil.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit
let _categoryCache = null;
let _categoryFetchedAt = 0;
let _accountCache = null;
let _accountFetchedAt = 0;

// ── Private: Load & Cache Categories ─────────────────────────────────────────
async function _loadCategories() {
  const now = Date.now();
  if (_categoryCache && (now - _categoryFetchedAt) < CACHE_TTL_MS) {
    return _categoryCache;
  }
  if (!supabaseFinance) return [];

  const { data, error } = await supabaseFinance
    .from('categories')
    .select('id, name, type')
    .eq('is_archived', false)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[SUPABASE_FINANCE] Gagal load categories:', error.message);
    return _categoryCache || []; // Gunakan cache lama jika ada
  }

  _categoryCache = data || [];
  _categoryFetchedAt = now;
  console.log(`[SUPABASE_FINANCE] Categories cache refreshed: ${_categoryCache.length} kategori.`);
  return _categoryCache;
}

/**
 * Mendapatkan daftar kategori aktif dari cache/database
 */
async function getCategoriesList() {
  return await _loadCategories();
}

// ── Private: Load & Cache Accounts ───────────────────────────────────────────
async function _loadAccounts() {
  const now = Date.now();
  if (_accountCache && (now - _accountFetchedAt) < CACHE_TTL_MS) {
    return _accountCache;
  }
  if (!supabaseFinance) return [];

  const { data, error } = await supabaseFinance
    .from('accounts')
    .select('id, name, type, color')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE_FINANCE] Gagal load accounts:', error.message);
    return _accountCache || [];
  }

  _accountCache = data || [];
  _accountFetchedAt = now;
  console.log(`[SUPABASE_FINANCE] Accounts cache refreshed: ${_accountCache.length} akun.`);
  return _accountCache;
}

// ── Private: Normalize String untuk Fuzzy Match ───────────────────────────────
// Menghapus spasi ekstra, tanda baca, dan mengubah ke lowercase
// sehingga "bank mandiri livin" ≈ "Bank Mandiri Livin" ≈ "LIVIN"
function _normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Private: Fuzzy Score antara dua string ────────────────────────────────────
// Mengembalikan nilai 0–100 berdasarkan seberapa banyak token yang cocok.
function _fuzzyScore(query, target) {
  const qNorm = _normalize(query);
  const tNorm = _normalize(target);

  // Exact match → skor tertinggi
  if (qNorm === tNorm) return 100;

  // Cek apakah target mengandung query atau sebaliknya
  if (tNorm.includes(qNorm)) return 80;
  if (qNorm.includes(tNorm)) return 70;

  // Token matching: hitung berapa token query ada di target
  const qTokens = qNorm.split(' ').filter(t => t.length > 1);
  const tTokens = tNorm.split(' ').filter(t => t.length > 1);

  let matched = 0;
  for (const qt of qTokens) {
    if (tTokens.some(tt => tt.includes(qt) || qt.includes(tt))) {
      matched++;
    }
  }

  if (qTokens.length === 0) return 0;
  return Math.round((matched / qTokens.length) * 60);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve nama akun (string bebas) menjadi UUID di tabel `accounts`.
 *
 * Prioritas pencocokan:
 *   1. Exact match (case-insensitive)
 *   2. Fuzzy match (skor tertinggi dari semua akun)
 *
 * @param {string} accountName - Contoh: "Gopay", "BCA", "livin", "mandiri"
 * @returns {Promise<string|null>} UUID akun, atau null jika tidak ditemukan
 */
async function resolveAccountId(accountName) {
  if (!accountName) return null;
  const accounts = await _loadAccounts();
  if (!accounts.length) return null;

  // Cari skor terbaik
  let best = { score: 0, id: null };
  for (const acc of accounts) {
    const score = _fuzzyScore(accountName, acc.name);
    if (score > best.score) {
      best = { score, id: acc.id, name: acc.name };
    }
  }

  // Hanya return jika skor cukup meyakinkan (> 30%)
  if (best.score >= 30) {
    console.log(`[SUPABASE_FINANCE] resolveAccountId: "${accountName}" → "${best.name}" (skor: ${best.score})`);
    return best.id;
  }

  console.warn(`[SUPABASE_FINANCE] resolveAccountId: Tidak ada akun yang cocok dengan "${accountName}"`);
  return null;
}

/**
 * Resolve nama kategori (string bebas) menjadi UUID di tabel `categories`.
 *
 * Memperhitungkan `type` transaksi (income/expense) agar tidak
 * mencocokkan kategori pemasukan untuk pengeluaran.
 *
 * @param {string} categoryName - Contoh: "Restoran, makanan cepat saji", "Transportasi"
 * @param {string} txType       - "INCOME" atau "EXPENSE"
 * @returns {Promise<string|null>} UUID kategori, atau null jika tidak ditemukan
 */
async function resolveCategoryId(categoryName, txType) {
  if (!categoryName) return null;
  const categories = await _loadCategories();
  if (!categories.length) return null;

  const dbType = (txType || '').toUpperCase() === 'INCOME' ? 'income' : 'expense';

  // Filter hanya kategori dengan tipe yang sesuai
  const filtered = categories.filter(c => c.type === dbType);

  // Cari skor terbaik di kategori yang relevan
  let best = { score: 0, id: null, name: null };
  for (const cat of filtered) {
    const score = _fuzzyScore(categoryName, cat.name);
    if (score > best.score) {
      best = { score, id: cat.id, name: cat.name };
    }
  }

  // Threshold 40 untuk kategori (lebih ketat dari akun)
  if (best.score >= 40) {
    console.log(`[SUPABASE_FINANCE] resolveCategoryId: "${categoryName}" → "${best.name}" (skor: ${best.score})`);
    return best.id;
  }

  // Fallback: cari kategori "Lainnya" sebagai catch-all
  const fallback = categories.find(c => c.name === 'Lainnya' && c.type === dbType);
  if (fallback) {
    console.warn(`[SUPABASE_FINANCE] resolveCategoryId: Fallback ke "Lainnya" untuk "${categoryName}"`);
    return fallback.id;
  }

  console.warn(`[SUPABASE_FINANCE] resolveCategoryId: Tidak ada kategori yang cocok dan tidak ada fallback "Lainnya".`);
  return null;
}

/**
 * Tulis satu transaksi ke tabel `transactions` di Supabase Nexa Finance.
 *
 * Fungsi ini adalah core dari dual-write pattern.
 * Dipanggil dari Finance_Engine.processTransaction().
 *
 * @param {object} params
 * @param {string} params.txType      - "INCOME" atau "EXPENSE"
 * @param {number} params.nominal     - Nominal positif (contoh: 50000)
 * @param {string} params.categoryName- Nama kategori teks bebas (akan di-resolve ke UUID)
 * @param {string} params.accountName - Nama akun teks bebas (akan di-resolve ke UUID)
 * @param {string} params.description - Catatan/deskripsi transaksi
 * @param {string} params.dateISO     - Tanggal format YYYY-MM-DD
 * @param {string} params.timeHHMM    - Waktu format HH:MM (opsional)
 * @param {string} params.paymentMethod - Metode pembayaran: QRIS|Transfer bank|Kartu Kredit|Tunai (opsional)
 *
 * @returns {Promise<{status: 'SUCCESS'|'SKIPPED'|'ERROR', id?: string, reason?: string}>}
 */
async function writeTransaction({ txType, nominal, categoryName, accountName, description, dateISO, timeHHMM, paymentMethod }) {
  if (!supabaseFinance) {
    return { status: 'SKIPPED', reason: 'Supabase Finance tidak dikonfigurasi' };
  }

  // Resolve secara paralel untuk efisiensi
  const [accountId, categoryId] = await Promise.all([
    resolveAccountId(accountName),
    resolveCategoryId(categoryName, txType)
  ]);

  if (!accountId) {
    return {
      status: 'SKIPPED',
      reason: `Akun "${accountName}" tidak ditemukan di database. Buat akun terlebih dahulu di Nexa Finance Web.`
    };
  }

  if (!categoryId) {
    return {
      status: 'SKIPPED',
      reason: `Kategori "${categoryName}" tidak dapat dipetakan ke database.`
    };
  }

  const dbType = txType.toUpperCase() === 'INCOME' ? 'income' : 'expense';

  const { data, error } = await supabaseFinance
    .from('transactions')
    .insert({
      account_id:       accountId,
      category_id:      categoryId,
      amount:           Math.abs(nominal),   // SELALU positif di DB
      type:             dbType,
      transaction_date: dateISO,             // YYYY-MM-DD
      transaction_time: timeHHMM || null,    // HH:MM atau null
      description:      description || null,
      payment_method:   paymentMethod || null, // QRIS | Transfer bank | Kartu Kredit | Tunai
    })
    .select('id')
    .single();

  if (error) {
    console.error('[SUPABASE_FINANCE] writeTransaction INSERT error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }

  return { status: 'SUCCESS', id: data.id };
}

/**
 * Ambil daftar akun aktif untuk di-inject ke prompt AI Router.
 * Digunakan agar AI tahu nama-nama akun yang valid saat mengekstrak
 * data dari pesan user.
 *
 * @returns {Promise<Array<{name: string, type: string}>>}
 */
async function getAccountsList() {
  const accounts = await _loadAccounts();
  return accounts.map(a => ({ name: a.name, type: a.type }));
}

/**
 * Invalidate semua cache (akun & kategori).
 * Panggil ini setelah user menambah/mengubah akun atau kategori
 * di Nexa Finance Web agar N.E.X.A langsung mengenali perubahan.
 */
function invalidateCache() {
  _categoryCache = null;
  _categoryFetchedAt = 0;
  _accountCache = null;
  _accountFetchedAt = 0;
  console.log('[SUPABASE_FINANCE] Cache di-invalidate. Akan re-fetch pada transaksi berikutnya.');
}

/**
 * Membaca data transaksi dari Supabase dengan berbagai opsi filter.
 * 
 * @param {object} options
 * @param {number} options.limit
 * @param {string} options.keyword (Mencari di description, category.name, atau account.name)
 * @param {string} options.txType "INCOME" atau "EXPENSE"
 * @param {number} options.month Bulan 1-12 (opsional)
 * @param {number} options.year Tahun (opsional)
 * @returns {Promise<Array>}
 */
async function readTransactions({ limit = 5, keyword = '', txType = null, month = null, year = null } = {}) {
  if (!supabaseFinance) return [];

  let query = supabaseFinance
    .from('transactions')
    .select(`
      id,
      amount,
      type,
      transaction_date,
      transaction_time,
      description,
      payment_method,
      created_at,
      no,
      categories ( name ),
      accounts ( name )
    `)
    .order('transaction_date', { ascending: false })
    .order('transaction_time', { ascending: false });

  if (limit) query = query.limit(limit);

  if (txType) {
    query = query.eq('type', txType.toUpperCase() === 'INCOME' ? 'income' : 'expense');
  }

  // Filter bulan & tahun
  if (year) {
    const startDate = new Date(year, (month || 1) - 1, 1);
    const endDate = month ? new Date(year, month, 0) : new Date(year, 11, 31);
    
    // Format YYYY-MM-DD
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    query = query.gte('transaction_date', startStr).lte('transaction_date', endStr);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[SUPABASE_FINANCE] readTransactions error:', error.message);
    return [];
  }

  // Filter keyword di level aplikasi karena Supabase foreign table search butuh syntax khusus
  // yang bisa rumit jika kita ingin mencari di 3 tempat sekaligus dengan 'or'.
  let results = data;
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = data.filter(tx => 
      (tx.description && tx.description.toLowerCase().includes(kw)) ||
      (tx.categories?.name && tx.categories.name.toLowerCase().includes(kw)) ||
      (tx.accounts?.name && tx.accounts.name.toLowerCase().includes(kw)) ||
      (tx.amount.toString().includes(kw))
    );
  }

  return results;
}

/**
 * Mengupdate transaksi berdasarkan UUID
 * @param {string} uuid
 * @param {object} patchData { nominal, description, categoryName, accountName, txType, dateISO, timeHHMM }
 */
async function updateTransaction(uuid, patchData) {
  if (!supabaseFinance) return { status: 'ERROR', reason: 'Supabase tidak dikonfigurasi' };
  
  const payload = {};
  
  if (patchData.nominal !== undefined) payload.amount = Math.abs(patchData.nominal);
  if (patchData.description !== undefined) payload.description = patchData.description;
  if (patchData.txType !== undefined) payload.type = patchData.txType.toUpperCase() === 'INCOME' ? 'income' : 'expense';
  if (patchData.dateISO !== undefined) payload.transaction_date = patchData.dateISO;
  if (patchData.timeHHMM !== undefined) payload.transaction_time = patchData.timeHHMM;
  if (patchData.paymentMethod !== undefined) payload.payment_method = patchData.paymentMethod;
  
  // Resolve relations if provided
  if (patchData.accountName) {
    const accId = await resolveAccountId(patchData.accountName);
    if (accId) payload.account_id = accId;
  }
  
  if (patchData.categoryName) {
    // Determine type for category resolution (use patched type if exists, else we'd need to fetch existing, but let's assume it's passed)
    const typeToResolve = patchData.txType || 'EXPENSE'; // Default fallback
    const catId = await resolveCategoryId(patchData.categoryName, typeToResolve);
    if (catId) payload.category_id = catId;
  }

  if (Object.keys(payload).length === 0) return { status: 'SUCCESS' };

  const { error } = await supabaseFinance
    .from('transactions')
    .update(payload)
    .eq('id', uuid);

  if (error) {
    console.error('[SUPABASE_FINANCE] updateTransaction error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }
  
  return { status: 'SUCCESS' };
}

/**
 * Menghapus transaksi berdasarkan UUID
 * @param {string} uuid
 */
async function deleteTransaction(uuid) {
  if (!supabaseFinance) return { status: 'ERROR', reason: 'Supabase tidak dikonfigurasi' };
  
  const { error } = await supabaseFinance
    .from('transactions')
    .delete()
    .eq('id', uuid);

  if (error) {
    console.error('[SUPABASE_FINANCE] deleteTransaction error:', error.message);
    return { status: 'ERROR', reason: error.message };
  }
  
  return { status: 'SUCCESS' };
}

/**
 * Mendapatkan ringkasan total (Income, Expense, Balance) untuk rentang waktu tertentu
 * @param {Date} startDate 
 * @param {Date} endDate 
 */
async function getFinanceAnalytics(startDate, endDate) {
  if (!supabaseFinance) return { totalIncome: 0, totalExpense: 0, balance: 0 };
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr);

  if (error) {
    console.error('[SUPABASE_FINANCE] getFinanceAnalytics error:', error.message);
    return { totalIncome: 0, totalExpense: 0, balance: 0 };
  }

  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of data) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else if (tx.type === 'expense') totalExpense += tx.amount;
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense
  };
}

/**
 * Breakdown pengeluaran per kategori untuk rentang waktu tertentu.
 * Returns sorted array: [{ name, total, percentage, count }]
 */
async function getCategoryBreakdown(startDate, endDate) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type, categories ( name )')
    .eq('type', 'expense')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr);

  if (error || !data) return [];

  const map = {};
  let grandTotal = 0;
  for (const tx of data) {
    const cat = tx.categories?.name || 'Lainnya';
    if (!map[cat]) map[cat] = { name: cat, total: 0, count: 0 };
    map[cat].total += tx.amount;
    map[cat].count += 1;
    grandTotal += tx.amount;
  }

  return Object.values(map)
    .map(c => ({ ...c, percentage: grandTotal > 0 ? (c.total / grandTotal * 100) : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * N transaksi expense terbesar dalam rentang waktu tertentu.
 */
async function getTopExpenses(startDate, endDate, limit = 5) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('id, amount, description, transaction_date, transaction_time, categories ( name ), accounts ( name )')
    .eq('type', 'expense')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr)
    .order('amount', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

/**
 * Saldo real-time per akun (total income - total expense per account_id).
 */
async function getAccountBalances() {
  if (!supabaseFinance) return [];
  const accounts = await _loadAccounts();
  if (!accounts.length) return [];

  const results = [];
  for (const acc of accounts) {
    const { data, error } = await supabaseFinance
      .from('transactions')
      .select('amount, type')
      .eq('account_id', acc.id);

    if (error) continue;

    let income = 0, expense = 0;
    for (const tx of (data || [])) {
      if (tx.type === 'income') income += tx.amount;
      else expense += tx.amount;
    }
    results.push({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      initial_balance: acc.initial_balance || 0,
      totalIncome: income,
      totalExpense: expense,
      balance: (acc.initial_balance || 0) + income - expense,
    });
  }
  return results;
}

/**
 * Bandingkan analytics dua periode berbeda.
 * Returns { current, previous }
 */
async function getPeriodComparison(currentStart, currentEnd, prevStart, prevEnd) {
  const [current, previous] = await Promise.all([
    getFinanceAnalytics(currentStart, currentEnd),
    getFinanceAnalytics(prevStart, prevEnd),
  ]);
  return { current, previous };
}

/**
 * Tren pengeluaran harian dalam rentang waktu.
 * Returns [{ date: 'YYYY-MM-DD', expense: number, income: number }]
 */
async function getDailyTrend(startDate, endDate) {
  if (!supabaseFinance) return [];
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const { data, error } = await supabaseFinance
    .from('transactions')
    .select('amount, type, transaction_date')
    .gte('transaction_date', startStr)
    .lte('transaction_date', endStr)
    .order('transaction_date', { ascending: true });

  if (error || !data) return [];

  const map = {};
  for (const tx of data) {
    const d = tx.transaction_date;
    if (!map[d]) map[d] = { date: d, expense: 0, income: 0 };
    if (tx.type === 'expense') map[d].expense += tx.amount;
    else map[d].income += tx.amount;
  }
  return Object.values(map);
}

/**
 * Ringkasan bulanan via RPC get_monthly_summary (sama persis dengan Web).
 * Returns [{ month: 'YYYY-MM', total_income, total_expense }]
 */
async function getMonthlySummary(months = 7) {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance.rpc('get_monthly_summary', { p_months: months });
  if (error) { console.error('[SUPABASE_FINANCE] getMonthlySummary error:', error.message); return []; }
  return (data || []).map(r => ({
    month: r.month,
    total_income: Number(r.total_income),
    total_expense: Number(r.total_expense),
  }));
}

/**
 * Tren saldo harian per akun via RPC get_daily_balance_trend (sama persis dengan Web).
 * @param {string} accountId - UUID akun
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate   - YYYY-MM-DD
 */
async function getDailyBalanceTrend(accountId, startDate, endDate) {
  if (!supabaseFinance) return [];
  const { data, error } = await supabaseFinance.rpc('get_daily_balance_trend', {
    p_account_id: accountId,
    p_start: startDate,
    p_end: endDate,
  });
  if (error) { console.error('[SUPABASE_FINANCE] getDailyBalanceTrend error:', error.message); return []; }
  return (data || []).map(r => ({
    day: r.day,
    daily_income: Number(r.daily_income),
    daily_expense: Number(r.daily_expense),
    running_balance: Number(r.running_balance),
  }));
}

module.exports = {
  writeTransaction,
  readTransactions,
  updateTransaction,
  deleteTransaction,
  getFinanceAnalytics,
  getCategoryBreakdown,
  getTopExpenses,
  getAccountBalances,
  getPeriodComparison,
  getDailyTrend,
  getMonthlySummary,
  getDailyBalanceTrend,
  resolveAccountId,
  resolveCategoryId,
  getAccountsList,
  getCategoriesList,
  invalidateCache,
};
