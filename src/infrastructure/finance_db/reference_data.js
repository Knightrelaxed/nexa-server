'use strict';
/**
 * finance_db/reference_data.js
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory Cache & Resolvers untuk Akun dan Kategori Keuangan
 * 
 * Tanggung jawab:
 * 1. Cache akun dan kategori aktif dengan TTL 30 menit
 * 2. Normalisasi string & fuzzy score matching
 * 3. Resolusi nama akun -> UUID akun di Supabase
 * 4. Resolusi nama kategori -> UUID kategori di Supabase
 * 5. Ekspor daftar akun dan kategori untuk prompt injection / sinkronisasi
 * 6. Invalidasi cache manual
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { supabaseFinance } = require('./client');

// ── In-Memory Cache ───────────────────────────────────────────────────────────
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit
let _categoryCache = null;
let _categoryFetchedAt = 0;
let _accountCache = null;
let _accountFetchedAt = 0;

// Default in-memory accounts fallback saat Supabase offline / null client (CI/local fallback)
const DEFAULT_FALLBACK_ACCOUNTS = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Bank Mandiri', type: 'bank', color: '#0047cc' },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Bank Jago', type: 'bank', color: '#f59e0b' }
];

// Default in-memory categories fallback saat Supabase offline / null client
const DEFAULT_FALLBACK_CATEGORIES = [
  { id: '5cb57143-9cb0-42de-8e65-9f8f99e7f130', name: 'Lainnya', type: 'expense', group_name: 'Penyesuaian (Sistem)' },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Pendapatan (umum)', type: 'income', group_name: 'Pendapatan' }
];

// ── Private: Load & Cache Categories ─────────────────────────────────────────
async function _loadCategories() {
  const now = Date.now();
  if (_categoryCache && (now - _categoryFetchedAt) < CACHE_TTL_MS) {
    return _categoryCache;
  }
  if (!supabaseFinance) {
    if (!_categoryCache) {
      _categoryCache = [...DEFAULT_FALLBACK_CATEGORIES];
      _categoryFetchedAt = now;
    }
    return _categoryCache;
  }

  const { data, error } = await supabaseFinance
    .from('categories')
    .select('id, name, type, group_name')
    .eq('is_archived', false)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[SUPABASE_FINANCE] Gagal load categories:', error.message);
    return _categoryCache || [...DEFAULT_FALLBACK_CATEGORIES];
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
  if (!supabaseFinance) {
    if (!_accountCache) {
      _accountCache = [...DEFAULT_FALLBACK_ACCOUNTS];
      _accountFetchedAt = now;
    }
    return _accountCache;
  }

  const { data, error } = await supabaseFinance
    .from('accounts')
    .select('id, name, type, color, initial_balance')
    .eq('is_archived', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE_FINANCE] Gagal load accounts:', error.message);
    return _accountCache || [...DEFAULT_FALLBACK_ACCOUNTS];
  }

  _accountCache = data || [];
  _accountFetchedAt = now;
  console.log(`[SUPABASE_FINANCE] Accounts cache refreshed: ${_accountCache.length} akun.`);
  return _accountCache;
}

// ── Private: Normalize String untuk Fuzzy Match ───────────────────────────────
function _normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Private: Fuzzy Score antara dua string ────────────────────────────────────
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

  // FALLBACK FIX: Jangan pernah mengembalikan null jika gagal mencocokkan.
  // Kembalikan akun pertama (default) agar transaksi tidak hangus saat auto-save.
  console.warn(`[SUPABASE_FINANCE] resolveAccountId: Tidak ada akun yang cocok dengan "${accountName}". Fallback paksa ke akun pertama "${accounts[0].name}"`);
  return accounts[0].id;
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

  // Fallback: cari kategori catch-all sesuai tipe transaksi
  // Untuk expense: 'Lainnya'
  // Untuk income: 'Pendapatan (umum)' atau varian pendapatan lain
  const fallback = categories.find(c => {
    if (c.type !== dbType) return false;
    if (dbType === 'income') {
      return c.name === 'Pendapatan (umum)' || c.name.toLowerCase().includes('pendapatan') || c.name === 'Lainnya';
    }
    return c.name === 'Lainnya' || c.name.toLowerCase().includes('lain');
  }) || filtered[0] || categories[0];

  if (fallback) {
    console.warn(`[SUPABASE_FINANCE] resolveCategoryId: Fallback ke "${fallback.name}" (${fallback.type}) untuk "${categoryName}"`);
    return fallback.id;
  }

  console.warn(`[SUPABASE_FINANCE] resolveCategoryId: Tidak ada kategori yang cocok dan tidak ada fallback.`);
  return null;
}

/**
 * Ambil daftar akun aktif untuk di-inject ke prompt AI Router.
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
 * Memastikan sebuah akun ada di tabel `accounts` Supabase Finance.
 * Jika belum ada, otomatis membuat baris baru secara idempotent.
 *
 * @param {string} accountName - Contoh: "Bank Jago", "Bank Mandiri"
 * @param {object} [metadata] - Opsional { type: 'bank', color: '#f59e0b', icon_key: 'landmark' }
 * @returns {Promise<string|null>} UUID akun
 */
async function ensureAccountExists(accountName, metadata = {}) {
  if (!accountName) return null;
  const accounts = await _loadAccounts();
  const existing = accounts.find(a => _normalize(a.name) === _normalize(accountName));
  if (existing) {
    return existing.id;
  }

  if (!supabaseFinance) {
    const mockId = `mock-acc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAcc = {
      id: mockId,
      name: accountName.trim(),
      type: metadata.type || 'bank',
      color: metadata.color || '#f59e0b'
    };
    if (!_accountCache) _accountCache = [];
    _accountCache.push(newAcc);
    return mockId;
  }

  const payload = {
    name: accountName.trim(),
    type: metadata.type || 'bank',
    currency: metadata.currency || 'IDR',
    initial_balance: metadata.initial_balance || 0,
    color: metadata.color || '#f59e0b',
    icon_key: metadata.icon_key || 'landmark',
    is_archived: false,
    exclude_from_stats: false
  };

  const { data, error } = await supabaseFinance
    .from('accounts')
    .insert([payload])
    .select('id, name, type, color')
    .single();

  if (error) {
    console.error(`[SUPABASE_FINANCE] Gagal auto-provision akun "${accountName}":`, error.message);
    return null;
  }

  invalidateCache();
  return data?.id || null;
}

module.exports = {
  _loadCategories,
  getCategoriesList,
  _loadAccounts,
  getAccountsList,
  ensureAccountExists,
  _normalize,
  _fuzzyScore,
  resolveAccountId,
  resolveCategoryId,
  invalidateCache
};
