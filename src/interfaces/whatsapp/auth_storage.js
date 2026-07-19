// ============================================================
// N.E.X.A — WHATSAPP SUPABASE PERSISTENT AUTH STORAGE
// Menggantikan useMultiFileAuthState lokal dengan penyimpanan
// ke tabel Supabase (nexa_wa_sessions) agar tahan restart/redeploy
// di lingkungan serverless atau Hugging Face Space.
//
// Skema tabel Supabase yang dibutuhkan (sudah dibuat oleh migration SQL Fase 2):
//   nexa_wa_sessions (
//     session_id  VARCHAR(100),
//     key_name    VARCHAR(255),
//     value       JSONB,
//     updated_at  TIMESTAMP WITH TIME ZONE,
//     PRIMARY KEY (session_id, key_name)
//   )
// ============================================================
'use strict';

const { supabase } = require('../../infrastructure/Supabase_Memories');

/**
 * Adaptor penyimpanan status otentikasi Baileys ke Supabase.
 * Menggantikan `useMultiFileAuthState` bawaan Baileys agar sesi persisten
 * walaupun server di-restart atau di-redeploy di Hugging Face Space.
 *
 * @param {string} sessionId - Identifier sesi unik (misal: 'nexa_wa_main')
 * @returns {Promise<{state: {creds: Object, keys: Object}, saveCreds: Function}>}
 */
async function useSupabaseAuthState(sessionId = 'nexa_wa_main') {
  // Lazy require Baileys to avoid crashing if package is not yet installed
  let BufferJSON, initAuthCreds;
  try {
    const baileys = require('@whiskeysockets/baileys');
    // BufferJSON is inside baileys.BufferJSON in newer versions, or we fallback to standard serialization if undefined (though Baileys exports it)
    BufferJSON = baileys.BufferJSON || {
      replacer: (k, v) => v,
      reviver: (k, v) => v
    };
    initAuthCreds = baileys.initAuthCreds;
  } catch (err) {
    console.error('[WA-AUTH] @whiskeysockets/baileys belum terinstall:', err.message);
    BufferJSON = { replacer: null, reviver: null };
  }

  // Fallback creds: generate initial cryptographic keys (noiseKey, pairingEphemeralKeyPair, etc.) via initAuthCreds()
  let creds = initAuthCreds ? initAuthCreds() : {};

  // ── KEY STORE: get & set dari tabel Supabase ──────────────────────────
  const keys = {
    /**
     * Ambil beberapa key dari Supabase berdasarkan type dan id-list
     */
    get: async (type, ids) => {
      if (!supabase) return {};
      const result = {};
      try {
        const keyNames = ids.map(id => `${type}__${id}`);
        const { data: rows, error } = await supabase
          .from('nexa_wa_sessions')
          .select('key_name, value')
          .eq('session_id', sessionId)
          .in('key_name', keyNames);

        if (!error && rows) {
          for (const row of rows) {
            const id = row.key_name.slice(type.length + 2); // panjang `type__`
            result[id] = typeof row.value === 'string'
              ? JSON.parse(row.value, BufferJSON.reviver)
              : JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
          }
        }
      } catch (err) {
        console.error(`[WA-AUTH] Error getting keys (${type}):`, err.message);
      }
      return result;
    },

    /**
     * Simpan/hapus serangkaian key ke Supabase
     */
    set: async (data) => {
      if (!supabase) return;
      const upsertRows = [];
      const deleteKeys = [];

      for (const category in data) {
        for (const id in data[category]) {
          const value = data[category][id];
          const key_name = `${category}__${id}`;

          if (value !== null && value !== undefined) {
            upsertRows.push({
              session_id: sessionId,
              key_name,
              value: JSON.stringify(value, BufferJSON.replacer),
              updated_at: new Date().toISOString()
            });
          } else {
            deleteKeys.push(key_name);
          }
        }
      }

      // Upsert yang masih valid
      if (upsertRows.length > 0) {
        const { error: upsertErr } = await supabase
          .from('nexa_wa_sessions')
          .upsert(upsertRows, { onConflict: 'session_id,key_name' });
        if (upsertErr) console.error('[WA-AUTH] Upsert error:', upsertErr.message);
      }

      // Hapus yang sudah di-null-kan (key kadaluarsa)
      if (deleteKeys.length > 0) {
        const { error: delErr } = await supabase
          .from('nexa_wa_sessions')
          .delete()
          .eq('session_id', sessionId)
          .in('key_name', deleteKeys);
        if (delErr) console.error('[WA-AUTH] Delete error:', delErr.message);
      }
    }
  };

  // ── Muat creds tersimpan dari Supabase ────────────────────────────────
  if (supabase) {
    try {
      const { data: row, error } = await supabase
        .from('nexa_wa_sessions')
        .select('value')
        .eq('session_id', sessionId)
        .eq('key_name', 'creds__main')
        .single();

      if (!error && row?.value) {
        creds = typeof row.value === 'string'
          ? JSON.parse(row.value, BufferJSON.reviver)
          : JSON.parse(JSON.stringify(row.value), BufferJSON.reviver);
        console.log(`[WA-AUTH] Sesi '${sessionId}' berhasil dimuat dari Supabase.`);
      } else {
        console.log(`[WA-AUTH] Belum ada sesi tersimpan untuk '${sessionId}' — membuat sesi baru (initAuthCreds).`);
        if ((!creds || !creds.noiseKey) && initAuthCreds) {
          creds = initAuthCreds();
        }
      }
    } catch (err) {
      console.log('[WA-AUTH] Sesi baru (tabel kosong atau belum dibuat):', err.message);
      if ((!creds || !creds.noiseKey) && initAuthCreds) {
        creds = initAuthCreds();
      }
    }
  } else {
    console.warn('[WA-AUTH] Supabase tidak terkonfigurasi — sesi tidak akan tersimpan setelah restart!');
  }

  /**
   * Simpan creds (kunci enkripsi sesi utama) setiap kali ada perubahan.
   */
  const saveCreds = async () => {
    if (!supabase) return;
    try {
      await supabase
        .from('nexa_wa_sessions')
        .upsert([{
          session_id: sessionId,
          key_name: 'creds__main',
          value: JSON.stringify(creds, BufferJSON.replacer),
          updated_at: new Date().toISOString()
        }], { onConflict: 'session_id,key_name' });
    } catch (err) {
      console.error('[WA-AUTH] Error saving creds:', err.message);
    }
  };

  return { state: { creds, keys }, saveCreds };
}

/**
 * Menghapus seluruh data sesi (creds dan keys) untuk session_id tertentu dari Supabase.
 * Dipanggil saat forceNewSession=true atau saat logout untuk membersihkan sisa sesi lama.
 *
 * @param {string} sessionId - Identifier sesi unik (default: 'nexa_wa_main')
 */
async function clearSupabaseAuthState(sessionId = 'nexa_wa_main') {
  if (!supabase) {
    console.warn('[WA-AUTH] Supabase tidak terkonfigurasi, tidak ada sesi di cloud untuk dihapus.');
    return;
  }
  try {
    const { error } = await supabase
      .from('nexa_wa_sessions')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      console.error(`[WA-AUTH] Gagal menghapus sesi '${sessionId}' dari Supabase:`, error.message);
    } else {
      console.log(`[WA-AUTH] 🧹 Berhasil membersihkan seluruh data sesi '${sessionId}' dari Supabase.`);
    }
  } catch (err) {
    console.error(`[WA-AUTH] Error clearing auth state for '${sessionId}':`, err.message);
  }
}

module.exports = { useSupabaseAuthState, clearSupabaseAuthState };
