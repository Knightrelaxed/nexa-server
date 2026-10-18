'use strict';
// ============================================================
// N.E.X.A — CLI FOLLOW-UP & CLARIFICATION HELPERS
// Handles ambiguous user follow-ups and intent clarification
// ============================================================

/**
 * Check if the input text is an ambiguous follow-up
 * e.g. "lanjut", "yang tadi", "hapus itu", "ubah itu"
 */
function isAmbiguousFollowUp(text) {
  const norm = String(text || '').toLowerCase().trim();
  return /^(lanjut|teruskan|yang tadi|yang itu|itu|itu aja|itu saja|sebelumnya|sebelum itu|lagi|next|berikutnya|lanjutkan|hapus itu|ubah itu|edit itu)$/.test(norm) ||
    /^(hapus|delete|selesai|selesaikan|complete|done|ubah|edit|update|ganti)\s*(itu|ini|tadi)?$/.test(norm);
}

/**
 * Check if the input text contains a strong explicit domain keyword
 */
function hasStrongNewIntentCue(text) {
  return /(email|gmail|database|supabase|kalender|agenda|jadwal|task|tugas|keuangan|pengeluaran|pemasukan|search|cari|berita|dokumen|2nd brain|profil|identitas)/.test(String(text || '').toLowerCase());
}

/**
 * Resolves an ambiguous follow-up request against the previous conversation context
 * Returns synthetic routingData if resolved, or null
 */
function resolveAmbiguousFollowUp(textInput, conversationContext) {
  if (!conversationContext || !isAmbiguousFollowUp(textInput) || hasStrongNewIntentCue(textInput)) {
    return null;
  }

  const ctx = conversationContext;
  const ctxAgeMs = Date.now() - (ctx.askedAt || 0);
  if (ctxAgeMs >= 10 * 60 * 1000) {
    return null;
  }

  const norm = textInput.toLowerCase().trim();
  const kw = norm.replace(/^(hapus|delete|ubah|edit|update|ganti|selesaikan|complete)\s*/g, '').replace(/^(itu|yang itu|yang tadi)\s*/g, '').trim();
  const fbKw = ctx.extractedData?.search_keyword || ctx.extractedData?.summary || ctx.extractedData?.title || ctx.extractedData?.destination || '';
  const mergedKw = kw || fbKw;

  let earlyRoutingData = null;

  if (ctx.intent === 'FINANCE') {
    if (/(hapus|delete)/.test(norm)) {
      earlyRoutingData = { intent: 'FINANCE', extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      earlyRoutingData = { intent: 'FINANCE', extracted_data: { action: 'EDIT', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else {
      earlyRoutingData = { intent: 'FINANCE', extracted_data: { action: 'READ_LATEST' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'TASK') {
    if (/(hapus|delete)/.test(norm)) {
      earlyRoutingData = { intent: 'TASK', extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(selesai|complete|done)/.test(norm)) {
      earlyRoutingData = { intent: 'TASK', extracted_data: { action: 'COMPLETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      earlyRoutingData = { intent: 'TASK', extracted_data: { action: 'EDIT', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    } else {
      earlyRoutingData = { intent: 'TASK', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'CALENDAR') {
    if (/(hapus|delete)/.test(norm)) {
      earlyRoutingData = { intent: 'CALENDAR', extracted_data: { action: 'DELETE', summary: mergedKw || ctx.extractedData?.summary }, reply_message: '', god_mode_trigger: false };
    } else if (/(ubah|edit|update|ganti)/.test(norm)) {
      earlyRoutingData = { intent: 'CALENDAR', extracted_data: { action: 'UPDATE', summary: mergedKw || ctx.extractedData?.summary }, reply_message: '', god_mode_trigger: false };
    } else {
      earlyRoutingData = { intent: 'CALENDAR', extracted_data: { action: 'READ' }, reply_message: '', god_mode_trigger: false };
    }
  } else if (['2ND_BRAIN', 'USER_PROFILE', 'CORE_IDENTITY'].includes(ctx.intent)) {
    if (/(hapus|delete)/.test(norm)) {
      earlyRoutingData = { intent: ctx.intent, extracted_data: { action: 'DELETE', search_keyword: mergedKw }, reply_message: '', god_mode_trigger: false };
    }
  } else if (ctx.intent === 'WEB_SEARCH') {
    earlyRoutingData = {
      intent: 'WEB_SEARCH',
      extracted_data: { query: ctx.extractedData?.query || ctx.lastUserText || '', type: ctx.extractedData?.type || 'search' },
      reply_message: '',
      god_mode_trigger: false
    };
  }

  if (earlyRoutingData) {
    console.log(`[CLI FOLLOW-UP] Ambiguous follow-up resolved to: ${earlyRoutingData.intent} (${earlyRoutingData.extracted_data?.action || ''})`);
  }

  return earlyRoutingData;
}

/**
 * Validates intent data completeness before execution
 * Returns a polite clarification question if data is incomplete, or null if complete
 */
function getClarificationMessage(routingData, textInput) {
  const data = routingData?.extracted_data || {};
  const it = String(routingData?.intent || '').toUpperCase();

  if (it === 'INCOMPLETE_INFO') {
    return routingData.reply_message || '❓ Instruksi belum lengkap, Tuan. Mohon tambahkan detailnya.';
  }

  if (it === 'FINANCE') {
    if ((data.action === 'RECORD') && (isNaN(parseFloat(data.nominal)) || parseFloat(data.nominal) <= 0)) {
      return '❓ Nominal transaksi belum valid. Mohon sebutkan angka positifnya, Tuan.';
    }
  }

  if (it === 'CALENDAR' && data.action === 'CREATE') {
    if (!data.summary) return '❓ Nama agendanya apa, Tuan?';
    if (!data.start) return `❓ Jadwal "${data.summary}" dimulai kapan, Tuan?`;
  }

  if (it === 'TASK') {
    if (data.action === 'CREATE' && !data.title) return '❓ Nama tugas yang ingin dibuat apa, Tuan?';
    if (['DELETE', 'COMPLETE', 'EDIT'].includes(data.action) && !data.search_keyword && !data.title) {
      return '❓ Tugas mana yang dimaksud, Tuan? Sebutkan kata kunci judulnya.';
    }
  }

  if (it === 'EMAIL') {
    if (data.action === 'SEND' && (!data.to || !data.subject || !data.content)) {
      return '❓ Untuk kirim email, mohon lengkapi penerima, subjek, dan isi emailnya, Tuan.';
    }
    if (data.action === 'DELETE' && !data.search_keyword) {
      return '❓ Email mana yang ingin dihapus, Tuan? Beri kata kunci subjek/pengirim.';
    }
  }

  if (it === '2ND_BRAIN') {
    const action = data.action || 'READ';
    if (['EDIT', 'DELETE'].includes(action) && !data.search_keyword) {
      return '❓ Arsip mana yang dimaksud, Tuan? Mohon beri kata kunci.';
    }
    if (['APPEND', 'EDIT'].includes(action) && !data.content) {
      return '❓ Konten arsip yang ingin disimpan/diubah belum ada, Tuan.';
    }
  }

  if (['USER_PROFILE', 'CORE_IDENTITY'].includes(it)) {
    const action = data.action || (data.content ? 'APPEND' : 'READ');
    if (action === 'APPEND' && !data.content) return '❓ Fakta/aturan yang ingin ditambahkan apa, Tuan?';
    if (action === 'DELETE' && !data.search_keyword) return '❓ Item mana yang ingin dihapus dari memori, Tuan?';
  }

  return null;
}

module.exports = {
  isAmbiguousFollowUp,
  hasStrongNewIntentCue,
  resolveAmbiguousFollowUp,
  getClarificationMessage,
  _isAmbiguousFollowUp: isAmbiguousFollowUp,
  _hasStrongNewIntentCue: hasStrongNewIntentCue,
  _getClarificationMessage: getClarificationMessage
};
