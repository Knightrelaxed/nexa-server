/**
 * ============================================================
 * [N.E.X.A v3.3] PROCEDURAL MEMORY ENGINE — Playbook_Engine.js
 * ============================================================
 * Mesin Memori Prosedural N.E.X.A: Playbooks per Intent
 *
 * TUGAS UTAMA:
 *   1. Menyimpan dan mengelola panduan prosedural (cara mengerjakan
 *      tugas spesifik untuk Tuan Faqih) per kelas intent.
 *   2. Memastikan hard cap karakter (rendered <= 700 chars, ~150 token).
 *   3. In-memory caching (RAM) berkecepatan tinggi (0 ms overhead).
 *   4. Menyediakan antarmuka audit & rollback (/playbook, /playbook undo).
 * ============================================================
 */

'use strict';

const supabaseMemories = require('../infrastructure/Supabase_Memories');

// [v3.3.1] Injectable store: tests pass a fake so they never depend on production data.
let _store = supabaseMemories;
function setStore(store) {
  _store = store || supabaseMemories;
  _playbookCache = null;
  _playbookCacheTime = 0;
}

// ── PLAYBOOK INTENT MAPPING ──────────────────────────────────
const INTENT_TO_PLAYBOOK_MAP = {
  // Email
  EMAIL: 'EMAIL_DRAFT',
  EMAIL_DRAFT: 'EMAIL_DRAFT',
  // Jadwal & Tugas
  SCHEDULING: 'SCHEDULING',
  CALENDAR: 'SCHEDULING',
  TASK: 'SCHEDULING',
  // Keuangan
  FINANCE: 'FINANCE',
  FINANCE_REPLY: 'FINANCE',
  // Briefing
  BRIEFING_MORNING: 'BRIEFING_MORNING',
  // Disiplin
  DISCIPLINE: 'DISCIPLINE_NUDGE',
  DISCIPLINE_NUDGE: 'DISCIPLINE_NUDGE',
  // Riset & Pencarian
  RESEARCH: 'RESEARCH',
  WEB_SEARCH: 'RESEARCH',
  // Obrolan Santai
  NORMAL_CHAT: 'NORMAL_CHAT',
  CASUAL: 'NORMAL_CHAT',
  DEFAULT: 'NORMAL_CHAT'
};

// ── 7 DEFAULT STANDARD PLAYBOOKS ─────────────────────────────
const DEFAULT_PLAYBOOKS = [
  {
    intent: 'EMAIL_DRAFT',
    rules: {
      length: 'short (max 5 sentences)',
      format: ['prose', 'no_bullets'],
      tone: ['formal_warm'],
      pitfalls: ['jangan buka dengan basa-basi panjang']
    },
    rendered: 'Panduan Email Tuan: Ringkas (maks 5 kalimat), format prosa mengalir tanpa bullet points, nada formal-hangat, langsung sampaikan esensi tujuan tanpa basa-basi pembuka.'
  },
  {
    intent: 'BRIEFING_MORNING',
    rules: {
      length: 'concise',
      format: ['structured_blocks'],
      tone: ['crisp_executive'],
      pitfalls: ['jangan ceramah motivasi klise']
    },
    rendered: 'Panduan Morning Briefing: Awali sapaan satu baris ramah WIB, sajikan ringkasan agenda & prioritas terpenting hari ini, status kas ringkas, tanpa ceramah motivasi klise.'
  },
  {
    intent: 'FINANCE',
    rules: {
      length: 'compact',
      format: ['exact_figures'],
      tone: ['accurate_neutral'],
      pitfalls: ['jangan bulatkan angka sembarangan', 'jangan asumsikan saldo tanpa data']
    },
    rendered: 'Panduan Respon Keuangan: Sebutkan angka rupiah secara presisi (contoh: Rp50.000), konfirmasi mutasi/kategori secara tegas, hemat kata, hindari pembulatan liar dan spekulasi saldo.'
  },
  {
    intent: 'SCHEDULING',
    rules: {
      length: 'structured',
      format: ['time_context_first'],
      tone: ['practical_prompt'],
      pitfalls: ['jangan buat janji tanpa jam pasti']
    },
    rendered: 'Panduan Penjadwalan & Tugas: Pastikan tanggal & jam dalam WIB jelas, konfirmasi ketersediaan waktu, sajikan ringkasan aksi (tambahkan/ingatkan), hindari ambiguitas waktu.'
  },
  {
    intent: 'DISCIPLINE_NUDGE',
    rules: {
      length: 'punchy',
      format: ['single_call_to_action'],
      tone: ['supportive_firm'],
      pitfalls: ['jangan menghakimi', 'jangan sebut kata malas/menunda']
    },
    rendered: 'Panduan Disiplin & Fokus: Berikan dorongan tegas nan suportif (1 aksi nyata 10 menit), jangan pernah menghakimi atau menyebut kata malas/menunda, fokus ke langkah awal termudah.'
  },
  {
    intent: 'NORMAL_CHAT',
    rules: {
      length: 'proportional',
      format: ['natural_chat'],
      tone: ['warm_intelligent'],
      pitfalls: ['jangan over-formal', 'jangan sebut nama berulang-ulang', 'jangan sok tahu fakta pribadi']
    },
    rendered: 'Panduan Obrolan Santai: Respon natural sepadan panjang pesan Tuan, santai-elegan, hangat, jangan mengulang sapaan kaku di setiap kalimat, jangan ungkit data pribadi tanpa ditanya.'
  },
  {
    intent: 'RESEARCH',
    rules: {
      length: 'structured',
      format: ['key_findings_first'],
      tone: ['objective_analytical'],
      pitfalls: ['jangan spekulasi fakta yang belum diverifikasi']
    },
    rendered: 'Panduan Riset & Pencarian: Sajikan kesimpulan/fakta utama terlebih dahulu, sertakan sumber atau konteks valid, jelaskan pro-kontra secara objektif tanpa spekulasi liar.'
  }
];

// ── IN-MEMORY PLAYBOOK CACHE ─────────────────────────────────
let _playbookCache = null; // Map<intent, playbookObject>
let _playbookCacheTime = 0;
const PLAYBOOK_CACHE_TTL_MS = 15 * 60 * 1000; // 15 menit

/**
 * Normalisasi intent ke kelas playbook yang valid
 * @param {string} intentOrTopic - Intent atau nama topik
 * @param {boolean} [allowFallback=true] - Jika false, return null bila intent tidak dikenal
 */
function resolvePlaybookIntent(intentOrTopic, allowFallback = true) {
  if (!intentOrTopic) return allowFallback ? 'NORMAL_CHAT' : null;
  const clean = String(intentOrTopic).toUpperCase().trim();
  if (INTENT_TO_PLAYBOOK_MAP[clean]) {
    return INTENT_TO_PLAYBOOK_MAP[clean];
  }
  return allowFallback ? 'NORMAL_CHAT' : null;
}

/**
 * Muat semua playbook aktif ke cache RAM dengan inisialisasi otomatis jika kosong
 */
async function loadPlaybooksCache(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _playbookCache !== null && (now - _playbookCacheTime) < PLAYBOOK_CACHE_TTL_MS) {
    return _playbookCache;
  }

  try {
    let playbooks = await _store.getAllActivePlaybooks();

    // Auto-seed default jika tabel di database masih kosong
    if (!playbooks || playbooks.length === 0) {
      console.log('[PLAYBOOK] nexa_playbooks kosong. Menjalankan auto-seed playbook standar...');
      await seedDefaultPlaybooks();
      playbooks = await _store.getAllActivePlaybooks();
    }

    const map = new Map();
    for (const pb of (playbooks || [])) {
      map.set(pb.intent.toUpperCase(), pb);
    }

    _playbookCache = map;
    _playbookCacheTime = now;
    console.log(`[PLAYBOOK] Cache diperbarui. ${map.size} playbook aktif termuat.`);
    return _playbookCache;
  } catch (err) {
    console.warn('[PLAYBOOK] Gagal memuat cache playbook:', err.message);
    if (!_playbookCache) _playbookCache = new Map();
    return _playbookCache;
  }
}

/**
 * Invalidate cache RAM setelah update playbook
 */
function invalidatePlaybooksCache() {
  _playbookCache = null;
  _playbookCacheTime = 0;
  console.log('[PLAYBOOK] Cache playbook di-reset.');
}

/**
 * Ambil playbook aktif untuk intent tertentu
 */
async function getPlaybookForIntent(intentOrTopic) {
  const targetIntent = resolvePlaybookIntent(intentOrTopic);
  const cache = await loadPlaybooksCache();
  return cache.get(targetIntent) || null;
}

/**
 * Format string konteks playbook untuk diinjeksi ke System Prompt
 */
async function formatPlaybookContextBlock(intentOrTopic) {
  const playbook = await getPlaybookForIntent(intentOrTopic);
  if (!playbook || !playbook.rendered) return '';

  return `\n[PROCEDURAL PLAYBOOK — ATURAN EKSEKUSI TUAN FAQIH]\n` +
    `Ikuti panduan prosedural ini untuk merumuskan panjang, format, dan gaya respon Anda:\n` +
    `• ${playbook.intent} (v${playbook.version}): ${playbook.rendered}\n`;
}

/**
 * Seed daftar playbook standar ke database Supabase
 */
async function seedDefaultPlaybooks() {
  for (const pb of DEFAULT_PLAYBOOKS) {
    try {
      await _store.upsertPlaybook(pb);
    } catch (e) {
      console.warn(`[PLAYBOOK] Gagal seed ${pb.intent}:`, e.message);
    }
  }
  invalidatePlaybooksCache();
}

/**
 * Rollback playbook ke versi sebelumnya (parent_id)
 */
async function undoPlaybook(intent) {
  const targetIntent = resolvePlaybookIntent(intent, false);
  if (!targetIntent) {
    return { success: false, message: `❌ Intent <b>${String(intent || '').trim()}</b> tidak dikenal.` };
  }
  const current = await _store.getActivePlaybook(targetIntent);
  if (!current) {
    return { success: false, message: `Playbook untuk intent ${targetIntent} tidak ditemukan.` };
  }

  if (!current.parent_id) {
    return { success: false, message: `Playbook ${targetIntent} (v${current.version}) tidak memiliki versi sebelumnya untuk di-undo.` };
  }

  const sb = _store.supabase;
  if (!sb) return { success: false, message: 'Supabase tidak terhubung.' };

  // 1. Ambil parent record
  const { data: parent, error: pErr } = await sb
    .from('nexa_playbooks')
    .select('*')
    .eq('id', current.parent_id)
    .single();

  if (pErr || !parent) {
    return { success: false, message: `Gagal memuat versi sebelumnya (${current.parent_id}): ${pErr?.message}` };
  }

  // 2. Arsipkan versi sekarang
  await sb
    .from('nexa_playbooks')
    .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
    .eq('id', current.id);

  // 3. Aktifkan kembali parent
  await sb
    .from('nexa_playbooks')
    .update({ status: 'ACTIVE', updated_at: new Date().toISOString() })
    .eq('id', parent.id);

  invalidatePlaybooksCache();
  return {
    success: true,
    message: `✅ Playbook <b>${targetIntent}</b> berhasil di-rollback dari v${current.version} kembali ke v${parent.version}.`,
    previousVersion: parent.version,
    restoredRendered: parent.rendered
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format ringkasan seluruh playbook untuk perintah Telegram /playbook
 */
async function formatPlaybooksSummary() {
  const cache = await loadPlaybooksCache();
  if (!cache || cache.size === 0) {
    return '📋 <b>N.E.X.A Playbooks (Memori Prosedural)</b>\n\nBelum ada playbook aktif di database. Jalankan inisialisasi ulang.';
  }

  const lines = [];
  for (const [intent, pb] of cache.entries()) {
    const pinnedBadge = pb.pinned ? ' 📌' : '';
    lines.push(`• <b>${escapeHtml(intent)}</b> (v${pb.version}${pinnedBadge})\n  <i>"${escapeHtml(pb.rendered)}"</i>`);
  }

  return `📋 <b>N.E.X.A Playbooks — Memori Prosedural Aktif</b>\n\n` +
    lines.join('\n\n') +
    `\n\n━━━━━━━━━━━━━━━━━━━━\n` +
    `💡 <i>Ketik <code>/playbook &lt;INTENT&gt;</code> untuk detail atau <code>/playbook undo &lt;INTENT&gt;</code> untuk membatalkan perubahan terakhir.</i>`;
}

/**
 * Format detail satu playbook untuk perintah Telegram /playbook <INTENT>
 */
async function formatPlaybookDetail(intent) {
  const targetIntent = resolvePlaybookIntent(intent, false);
  if (!targetIntent) {
    return `❌ Intent <b>${escapeHtml(String(intent || '').trim())}</b> tidak dikenal.\n\n` +
      `<b>Pilihan intent yang tersedia:</b>\n` +
      `• <code>EMAIL</code> (EMAIL_DRAFT)\n` +
      `• <code>FINANCE</code>\n` +
      `• <code>SCHEDULING</code> (CALENDAR/TASK)\n` +
      `• <code>RESEARCH</code> (WEB_SEARCH)\n` +
      `• <code>BRIEFING_MORNING</code>\n` +
      `• <code>DISCIPLINE</code> (DISCIPLINE_NUDGE)\n` +
      `• <code>NORMAL_CHAT</code>\n\n` +
      `💡 <i>Ketik <code>/playbook</code> untuk melihat ringkasan semua playbook.</i>`;
  }
  const pb = await getPlaybookForIntent(targetIntent);
  if (!pb) {
    return `❌ Playbook untuk intent <b>${escapeHtml(targetIntent)}</b> tidak ditemukan.`;
  }

  const rulesFormatted = JSON.stringify(pb.rules || {}, null, 2);
  return `📖 <b>Detail Playbook: ${escapeHtml(pb.intent)} (v${pb.version})</b>\n\n` +
    `<b>Panduan Rendered:</b>\n<i>"${escapeHtml(pb.rendered)}"</i>\n\n` +
    `<b>Aturan Terstruktur:</b>\n<code>${escapeHtml(rulesFormatted)}</code>\n\n` +
    `• Dipakai: <b>${pb.use_count || 0} kali</b>\n` +
    `• Koreksi diterima: <b>${pb.correction_count || 0} kali</b>\n` +
    `• Status: <b>${escapeHtml(pb.status)}</b>${pb.pinned ? ' (PINNED)' : ''}\n` +
    `• Terakhir diupdate: <b>${new Date(pb.updated_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</b>\n\n` +
    `💡 <i>Ketik <code>/playbook undo ${escapeHtml(pb.intent)}</code> jika ingin kembali ke versi sebelumnya.</i>`;
}

module.exports = {
  resolvePlaybookIntent,
  loadPlaybooksCache,
  invalidatePlaybooksCache,
  getPlaybookForIntent,
  formatPlaybookContextBlock,
  seedDefaultPlaybooks,
  undoPlaybook,
  setStore,
  formatPlaybooksSummary,
  formatPlaybookDetail,
  DEFAULT_PLAYBOOKS
};
