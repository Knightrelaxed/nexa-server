/**
 * ============================================================
 * [N.E.X.A] memories/Memory_Chrono.js
 * Chrono-episodic: narasi harian 90 hari & konsolidasi
 *
 * Bagian dari modularisasi Supabase_Memories.js (facade: ../Supabase_Memories.js).
 * Kode dipindahkan verbatim oleh scripts/refactor/split_supabase_memories.js;
 * satu-satunya perubahan adalah jalur require relatif (+1 level).
 * ============================================================
 */

const { supabase } = require('./Memory_Client');

/**
 * Helper to convert UTC timestamp to YYYY-MM-DD in Asia/Jakarta timezone.
 */
function toWibDateString(dateInput) {
  const d = new Date(dateInput);
  const jakartaOffset = 7 * 60 * 60 * 1000;
  const jakartaDate = new Date(d.getTime() + jakartaOffset);
  return jakartaDate.toISOString().split('T')[0];
}

/**
 * Get distinct candidate dates from nexa_chat_memories older than `olderThanDays` (default: 90)
 * that have not yet been consolidated into nexa_daily_narratives.
 */
async function getCandidateDatesToConsolidate(olderThanDays = 90) {
  if (!supabase) return [];
  const now = Date.now();
  const cutoffTime = new Date(now - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  // Fetch raw memories older than cutoff
  const { data: rawMemories, error: rawErr } = await supabase
    .from('nexa_chat_memories')
    .select('id, created_at')
    .lt('created_at', cutoffTime)
    .order('created_at', { ascending: true })
    .limit(2000);

  if (rawErr || !rawMemories || rawMemories.length === 0) {
    if (rawErr) console.error('[SUPABASE-CHRONO] Error fetching raw memory candidates:', rawErr.message);
    return [];
  }

  // Extract unique WIB date strings
  const dateSet = new Set();
  rawMemories.forEach(m => {
    if (m.created_at) {
      dateSet.add(toWibDateString(m.created_at));
    }
  });

  const candidateDates = Array.from(dateSet).sort();
  if (candidateDates.length === 0) return [];

  // Check which dates are already consolidated in nexa_daily_narratives
  const { data: existingRows, error: existErr } = await supabase
    .from('nexa_daily_narratives')
    .select('narrative_date')
    .in('narrative_date', candidateDates);

  if (existErr) {
    console.error('[SUPABASE-CHRONO] Error checking existing narratives:', existErr.message);
  }

  const existingSet = new Set((existingRows || []).map(r => r.narrative_date));
  return candidateDates.filter(d => !existingSet.has(d));
}

/**
 * Get all chat messages for a specific date in Asia/Jakarta (WIB) timezone.
 */
async function getChatsForDateWib(targetDateStr) {
  if (!supabase) return { messages: [], messageIds: [], targetDateStr };
  
  // Start of day in WIB: targetDateStr + 'T00:00:00+07:00'
  const startWib = new Date(`${targetDateStr}T00:00:00+07:00`);
  const endWib = new Date(`${targetDateStr}T23:59:59.999+07:00`);

  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('id, role, content, platform, created_at')
    .gte('created_at', startWib.toISOString())
    .lte('created_at', endWib.toISOString())
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[SUPABASE-CHRONO] Error fetching chats for ${targetDateStr}:`, error.message);
    return { messages: [], messageIds: [], targetDateStr };
  }

  const messages = data || [];
  const messageIds = messages.map(m => m.id);
  return { messages, messageIds, targetDateStr };
}

/**
 * Save consolidated daily narrative into nexa_daily_narratives.
 */
async function saveDailyNarrative(payload) {
  if (!supabase) throw new Error('Supabase client is not initialized');
  const { data, error } = await supabase
    .from('nexa_daily_narratives')
    .upsert([payload], { onConflict: 'narrative_date' })
    .select();

  if (error) {
    console.error('[SUPABASE-CHRONO] Error saving daily narrative:', error.message);
    throw error;
  }
  return data?.[0] || null;
}

/**
 * Atomically prune/delete raw chat messages by their IDs after successful narrative insertion.
 */
async function pruneRawChatsByIds(messageIds) {
  if (!supabase || !Array.isArray(messageIds) || messageIds.length === 0) return 0;
  
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .delete()
    .in('id', messageIds)
    .select('id');

  if (error) {
    console.error('[SUPABASE-CHRONO] Error pruning raw chats:', error.message);
    throw error;
  }
  return data ? data.length : messageIds.length;
}

/**
 * Get daily narrative by exact date (YYYY-MM-DD).
 */
async function getDailyNarrativeByDate(targetDateStr) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('nexa_daily_narratives')
    .select('*')
    .eq('narrative_date', targetDateStr)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // not found code in PostgREST
      console.error(`[SUPABASE-CHRONO] Error getting narrative for ${targetDateStr}:`, error.message);
    }
    return null;
  }
  return data;
}

/**
 * Search daily narratives by keyword / tokens across narrative text.
 * Supports string keyword or array of extracted semantic tokens.
 */
async function searchDailyNarratives(queryOrTokens, limit = 5) {
  if (!supabase || !queryOrTokens) return [];
  
  let tokens = [];
  if (Array.isArray(queryOrTokens)) {
    tokens = queryOrTokens.map(t => String(t).trim()).filter(t => t.length >= 2);
  } else if (typeof queryOrTokens === 'string') {
    const raw = queryOrTokens.trim();
    if (raw.length >= 2) tokens = [raw];
  }

  if (tokens.length === 0) return [];

  let queryBuilder = supabase
    .from('nexa_daily_narratives')
    .select('*');

  if (tokens.length === 1) {
    queryBuilder = queryBuilder.ilike('narrative', `%${tokens[0]}%`);
  } else {
    const orCondition = tokens.map(t => `narrative.ilike.%${t}%`).join(',');
    queryBuilder = queryBuilder.or(orCondition);
  }

  const { data, error } = await queryBuilder
    .order('narrative_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[SUPABASE-CHRONO] Error searching daily narratives:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Search raw chat memories (0-90 days buffer) by keyword / tokens when not yet consolidated.
 */
async function searchRawChats(queryOrTokens, limit = 3) {
  if (!supabase || !queryOrTokens) return [];
  let tokens = [];
  if (Array.isArray(queryOrTokens)) {
    tokens = queryOrTokens.map(t => String(t).trim()).filter(t => t.length >= 2);
  } else if (typeof queryOrTokens === 'string') {
    const raw = queryOrTokens.trim();
    if (raw.length >= 2) tokens = [raw];
  }
  if (tokens.length === 0) return [];

  const orCondition = tokens.map(t => `content.ilike.%${t}%`).join(',');
  const { data, error } = await supabase
    .from('nexa_chat_memories')
    .select('id, role, content, created_at, platform')
    .or(orCondition)
    .order('created_at', { ascending: false })
    .limit(limit * 4);

  if (error || !data || data.length === 0) return [];

  const groupedByDate = {};
  for (const m of data) {
    const dStr = toWibDateString(m.created_at);
    if (!groupedByDate[dStr]) groupedByDate[dStr] = [];
    groupedByDate[dStr].push(m);
  }

  const out = [];
  for (const [dStr, msgs] of Object.entries(groupedByDate)) {
    const userSnippets = msgs.filter(m => (m.role || '').toLowerCase() === 'user').map(m => m.content);
    if (userSnippets.length === 0) continue;
    const dayName = new Date(`${dStr}T12:00:00+07:00`).toLocaleDateString('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' });
    out.push({
      narrative_date: dStr,
      day_name: dayName,
      narrative: `Tercatat pada riwayat percakapan tanggal ${dStr}, Tuan berinteraksi mengenai: ${userSnippets.slice(0, 4).map(s => `"${s}"`).join(', ')}.`,
      key_events: userSnippets.slice(0, 3).map(s => ({ category: 'CHAT', detail: s })),
      total_chat_count: msgs.length,
      is_raw_buffer: true
    });
    if (out.length >= limit) break;
  }
  return out;
}

module.exports = {
  toWibDateString,
  getCandidateDatesToConsolidate,
  getChatsForDateWib,
  saveDailyNarrative,
  pruneRawChatsByIds,
  getDailyNarrativeByDate,
  searchDailyNarratives,
  searchRawChats
};
