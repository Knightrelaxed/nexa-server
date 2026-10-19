/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Chat.js
 * Obrolan & memori temporal (hari ini/kemarin) + pencarian chat historis
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

/**
 * Save user chat memory for Contextual Retrieval
 */
async function saveChatMemory(role, content, platform = 'telegram') {
  if (!supabase) return;
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .insert([{ role, content, platform: platform || 'telegram', created_at: new Date().toISOString() }]);

  if (error) console.error('[SUPABASE] Error saving chat memory:', error.message);
  return data;
}

/**
 * Get last N chat memories for state awareness (with Historical Null Handling)
 */
async function getRecentMemories(limit = 10) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SUPABASE] Error fetching memories:', error.message);
    return [];
  }
  return (data || []).reverse().map(m => ({
    ...m,
    platform: m.platform || 'telegram'
  }));
}

/**
 * [v3.3] Search past chat memories using PostgreSQL Full-Text Search (FTS) index.
 * Ultra-fast indexed search over raw chat memories without LLM invocation.
 * @param {string} query - Search phrase / keywords
 * @param {number} [limit=5] - Maximum number of matches
 * @returns {Promise<Array<{id: string, role: string, content: string, platform: string, created_at: string}>>}
 */
async function searchPastChats(query, limit = 5) {
  if (!supabase || !query || typeof query !== 'string') return [];
  const cleanQuery = query.trim();
  if (cleanQuery.length < 2) return [];

  try {
    // 1. Coba pencarian berbasis GIN index fts dengan websearch syntax
    const { data, error } = await supabase
      .from('nexa_chat_memories')
      .select('id, role, content, platform, created_at')
      .textSearch('fts', cleanQuery, { config: 'simple', type: 'websearch' })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data) && data.length > 0) {
      return data;
    }

    // 2. Fallback jika FTS kosong atau error: gunakan ILIKE query
    const { data: fallbackData } = await supabase
      .from('nexa_chat_memories')
      .select('id, role, content, platform, created_at')
      .ilike('content', `%${cleanQuery}%`)
      .order('created_at', { ascending: false })
      .limit(limit);

    return fallbackData || [];
  } catch (err) {
    console.warn('[SUPABASE_MEMORIES] searchPastChats error:', err.message);
    return [];
  }
}

/**
 * Fetch all chat memories from yesterday (WIB timezone) for Morning Briefing context.
 * Returns messages from 00:00 to 23:59 yesterday Asia/Jakarta.
 */
async function getYesterdayMemories() {
  if (!supabase) return [];
  const nowUtc = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const jakartaNow = new Date(nowUtc.getTime() + jakartaOffset);
  
  const midnightJakartaToday = new Date(
    Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate())
    - jakartaOffset
  );
  
  const midnightJakartaYesterday = new Date(
    midnightJakartaToday.getTime() - 24 * 60 * 60 * 1000
  );

  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('role, content, created_at, platform')
    .gte('created_at', midnightJakartaYesterday.toISOString())
    .lt('created_at', midnightJakartaToday.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE] Error fetching yesterday memories:', error.message);
    return [];
  }
  return (data || []).map(m => ({
    ...m,
    platform: m.platform || 'telegram'
  }));
}

/**
 * Fetch all chat memories from today (WIB timezone) for Memory Consolidation cron.
 * Returns messages since midnight today Asia/Jakarta.
 */
async function getTodayMemories() {
  if (!supabase) return [];
  // Midnight WIB (UTC+7) = 17:00 UTC previous day
  const nowUtc = new Date();
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const jakartaNow = new Date(nowUtc.getTime() + jakartaOffset);
  const midnightJakarta = new Date(
    Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate())
    - jakartaOffset
  );

  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('role, content, created_at, platform')
    .gte('created_at', midnightJakarta.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[SUPABASE] Error fetching today memories:', error.message);
    return [];
  }
  return (data || []).map(m => ({
    ...m,
    platform: m.platform || 'telegram'
  }));
}

module.exports = {
  saveChatMemory,
  getRecentMemories,
  searchPastChats,
  getYesterdayMemories,
  getTodayMemories
};
