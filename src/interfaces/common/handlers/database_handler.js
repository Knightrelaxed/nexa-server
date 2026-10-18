'use strict';
// ============================================================
// N.E.X.A — COMMON DATABASE HANDLER
// Handles DATABASE CRUD on Supabase tables across interfaces
// ============================================================

const supabaseMemories = require('../../../infrastructure/Supabase_Memories');
const googleWorkspace  = require('../../../infrastructure/Google_Workspace');
const helpers          = require('../helpers');

function _getPendingDatabase(context) {
  if (context.pendingDatabaseContext) return context.pendingDatabaseContext;
  if (context.pendingDatabase && typeof context.pendingDatabase.get === 'function') {
    return context.pendingDatabase.get(context.sessionKey);
  }
  return null;
}

function _setPendingDatabase(context, val) {
  if (typeof context.setPendingDatabaseContext === 'function') {
    return context.setPendingDatabaseContext(val);
  }
  if (context.pendingDatabase && typeof context.pendingDatabase.set === 'function') {
    if (val === null) context.pendingDatabase.delete(context.sessionKey);
    else context.pendingDatabase.set(context.sessionKey, val);
  }
}

async function handleDatabaseIntent(routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const dbAction = ed.action || 'LIST_TABLES';
  const tableName = ed.table_name;
  const pendingDb = _getPendingDatabase(context);
  const isTelegram = context.platform === 'telegram' || context.isTelegram;
  const esc = isTelegram ? helpers.escapeHtml : (s) => String(s ?? '');

  if (!tableName && dbAction !== 'LIST_TABLES' && dbAction !== 'CANCEL_ACTION') {
    _setPendingDatabase(context, { tableName: '', lastAction: dbAction, askedAt: Date.now() });
    return '❓ Tabel Supabase mana yang ingin Anda kelola?\nPilih salah satu:\n- nexa_chat_memories\n- nexa_finance_dedup\n- nexa_user_profile\n- nexa_core_identity\n- nexa_2nd_brain';
  }

  if (dbAction === 'LIST_TABLES') {
    const overview = await supabaseMemories.getDatabaseOverview();
    if (!overview.success) {
      return isTelegram
        ? `❌ Gagal membaca overview database: ${esc(overview.error)}`
        : `❌ Gagal membaca overview database: ${overview.error}`;
    }
    const lines = overview.tables.map(t => {
      const info = overview.counts[t];
      if (info?.error) {
        return isTelegram ? `- <b>${esc(t)}</b>: error (${esc(info.error)})` : `- ${t}: error (${info.error})`;
      }
      return isTelegram ? `- <b>${esc(t)}</b>: ${info?.count || 0} baris` : `- ${t}: ${info?.count || 0} baris`;
    });
    _setPendingDatabase(context, { tableName: '', lastAction: dbAction, askedAt: Date.now() });
    return isTelegram
      ? `🗄️ <b>Overview Supabase (5 tabel N.E.X.A):</b>\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`
      : `🗄️ Overview Supabase (tabel N.E.X.A):\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`;
  }

  if (dbAction === 'READ_TABLE') {
    const result = await supabaseMemories.readDatabaseTable(tableName, {
      limit: ed.max_results || 5,
      searchKeyword: ed.search_keyword || ''
    });
    if (!result.success) {
      return isTelegram
        ? `❌ Gagal membaca tabel <b>${esc(tableName)}</b>: ${esc(result.error)}`
        : `❌ Gagal membaca tabel ${tableName}: ${result.error}`;
    }
    if (!result.rows?.length) {
      return isTelegram
        ? `📭 Tabel <b>${esc(result.table)}</b> tidak memiliki data yang cocok.`
        : `📭 Tabel ${result.table} tidak memiliki data yang cocok.`;
    }

    if (tableName && (tableName.toLowerCase() === 'nexa_vault_items' || result.table === 'nexa_vault_items')) {
      const rowsPreview = result.rows.map((r, idx) => {
        const category = r.category || r.metadata_json?.kategori_gambar || 'Dokumen';
        const title = r.metadata_json?.judul || r.metadata_json?.title || r.metadata_json?.nama_dokumen || (r.file_name || '').replace(/_\d+\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ');
        const link = r.drive_web_view_link;
        if (isTelegram) {
          const linkStr = link ? `\n   🔗 <a href="${esc(link)}">Buka di Google Drive</a>` : '';
          return `${idx + 1}. <b>[${esc(category)}]</b> ${esc(title)}\n   📁 <code>${esc(r.file_name)}</code>${linkStr}`;
        }
        const linkStr = link ? `\n   🔗 Link: ${link}` : '';
        return `${idx + 1}. [${category}] ${title}\n   📁 ${r.file_name}${linkStr}`;
      }).join('\n\n');
      _setPendingDatabase(context, { tableName: result.table, lastAction: dbAction, askedAt: Date.now() });
      return isTelegram
        ? `🗄️ <b>Daftar Dokumen Vault (${result.rows.length} dokumen tersimpan):</b>\n\n${rowsPreview}`
        : `🗄️ Daftar Dokumen Vault (${result.rows.length} dokumen tersimpan):\n\n${rowsPreview}`;
    }

    const rowsPreview = result.rows.map(r => {
      const summary = Object.entries(r).slice(0, 4).map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`).join(' | ');
      return isTelegram ? `• ${esc(summary)}` : `• ${summary}`;
    }).join('\n');
    _setPendingDatabase(context, { tableName: result.table, lastAction: dbAction, askedAt: Date.now() });
    return isTelegram
      ? `📚 <b>Data ${esc(result.table)} (${result.rows.length} baris):</b>\n${rowsPreview}`
      : `📚 Data ${result.table} (${result.rows.length} baris):\n${rowsPreview}`;
  }

  if (dbAction === 'INSERT_ROW') {
    const result = await supabaseMemories.insertDatabaseRow(tableName, ed.row_data || {});
    _setPendingDatabase(context, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
    if (isTelegram) {
      return result.success
        ? `✅ Insert berhasil ke <b>${esc(result.table)}</b> (id: ${esc(result.row?.id || '-')})`
        : `❌ Insert gagal ke <b>${esc(tableName)}</b>: ${esc(result.error)}`;
    }
    return result.success ? `✅ Insert berhasil ke ${result.table} (id: ${result.row?.id || '-'})` : `❌ Insert gagal ke ${tableName}: ${result.error}`;
  }

  if (dbAction === 'UPDATE_ROW') {
    const result = await supabaseMemories.updateDatabaseRows(tableName, ed.update_data || {}, {
      rowId: ed.row_id,
      searchKeyword: ed.search_keyword
    });
    _setPendingDatabase(context, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
    if (isTelegram) {
      return result.success
        ? `✅ Update berhasil di <b>${esc(result.table)}</b>. Baris terubah: ${result.updatedRows.length}`
        : `❌ Update gagal di <b>${esc(tableName)}</b>: ${esc(result.error)}`;
    }
    return result.success ? `✅ Update berhasil di ${result.table}. Baris terubah: ${result.updatedRows.length}` : `❌ Update gagal di ${tableName}: ${result.error}`;
  }

  if (dbAction === 'DELETE_ROW') {
    const result = await supabaseMemories.deleteDatabaseRows(tableName, {
      rowId: ed.row_id,
      searchKeyword: ed.search_keyword
    });
    _setPendingDatabase(context, { tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
    if (isTelegram) {
      return result.success
        ? `🗑️ Delete berhasil di <b>${esc(result.table)}</b>. Baris terhapus: ${result.deletedRows.length}`
        : `❌ Delete gagal di <b>${esc(tableName)}</b>: ${esc(result.error)}`;
    }
    return result.success ? `🗑️ Delete berhasil di ${result.table}. Baris terhapus: ${result.deletedRows.length}` : `❌ Delete gagal di ${tableName}: ${result.error}`;
  }

  if (dbAction === 'DELETE_ALL_ROWS') {
    _setPendingDatabase(context, { tableName, lastAction: dbAction, awaitingConfirmation: true, askedAt: Date.now() });
    if (isTelegram) {
      return routingData.reply_message || `⚠️ <b>PERINGATAN!</b> Anda meminta untuk menghapus SELURUH isi dari tabel <b>${esc(tableName)}</b>.\n\nApakah Anda benar-benar yakin ingin memusnahkan semua datanya? Balas <b>"YA"</b> untuk mengeksekusi, atau <b>"BATAL"</b>.`;
    }
    return routingData.reply_message || `⚠️ PERINGATAN! Anda meminta untuk menghapus SELURUH isi dari tabel ${tableName}.\n\nApakah Anda benar-benar yakin? Balas "YA" untuk mengeksekusi, atau "BATAL".`;
  }

  if (dbAction === 'DELETE_ALL_ROWS_CONFIRMED') {
    const isPending = pendingDb?.awaitingConfirmation === true;
    const isFresh = pendingDb?.askedAt && (Date.now() - pendingDb.askedAt < 120000);

    if (!isPending || !isFresh) {
      _setPendingDatabase(context, null);
      return '⛔ Keamanan Terpicu: Aksi pemusnahan massal ditolak karena tidak ada konfirmasi aktif sebelumnya.';
    }

    const targetTable = pendingDb?.tableName || tableName;
    let driveDeletedMsg = '';
    if (targetTable === 'nexa_vault_items') {
      const driveSuccess = await googleWorkspace.deleteAllVaultFiles();
      driveDeletedMsg = driveSuccess ? '\n🗑️ Semua file fisik di Google Drive Vault juga telah dimasukkan ke Trash.' : '\n⚠️ Gagal menghapus file fisik di Google Drive Vault.';
    }
    const result = await supabaseMemories.deleteAllDatabaseRows(targetTable);
    _setPendingDatabase(context, null);
    if (isTelegram) {
      return result.success
        ? `💥 Pemusnahan Massal Selesai.\nSeluruh data di tabel <b>${esc(result.table)}</b> telah dihapus. Baris terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
        : `❌ Gagal memusnahkan isi tabel <b>${esc(targetTable)}</b>: ${esc(result.error)}`;
    }
    return result.success
      ? `💥 Pemusnahan Massal Selesai.\nSeluruh data di tabel ${result.table} telah dihapus. Baris terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
      : `❌ Gagal memusnahkan isi tabel ${targetTable}: ${result.error}`;
  }

  if (dbAction === 'CANCEL_ACTION') {
    _setPendingDatabase(context, null);
    return '✅ Aksi database dibatalkan, Tuan.';
  }

  if (dbAction === 'DELETE_ROWS') {
    return '❌ Penghapusan banyak baris secara otomatis belum didukung. Hapus satu per satu menggunakan kata kunci.';
  }

  return `❌ Aksi database tidak dikenali: ${dbAction}`;
}

module.exports = {
  handleDatabaseIntent
};
