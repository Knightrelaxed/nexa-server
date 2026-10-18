'use strict';
// ============================================================
// N.E.X.A — COMMON MEMORY HANDLER
// Handles 2ND_BRAIN, USER_PROFILE, and CORE_IDENTITY across interfaces
// ============================================================

const aiRouter         = require('../../../core/AI_Router');
const { invalidatePersonalFactsCache, invalidateSelfModelCache } = aiRouter;
const supabaseMemories = require('../../../infrastructure/Supabase_Memories');
const googleWorkspace  = require('../../../infrastructure/Google_Workspace');
const helpers          = require('../helpers');

async function handleMemoryIntent(intent, routingData, context = {}) {
  const ed = routingData?.extracted_data || {};
  const textInput = context.textInput || '';

  // ────────────────────────────────────────────────────────────
  // 1. 2ND_BRAIN (Vault & Google Docs)
  // ────────────────────────────────────────────────────────────
  if (intent === '2ND_BRAIN') {
    const brainAction = (ed.action || 'APPEND').toUpperCase();
    if (brainAction === 'READ') {
      const docContent = await googleWorkspace.readIdeaDoc();
      return `📖 Isi Arsip 2nd Brain:\n\n${String(docContent).substring(0, 3000)}${String(docContent).length > 3000 ? '\n\n...(terpotong)' : ''}`;
    }

    if (brainAction === 'EDIT') {
      const targetKw = ed.search_keyword;
      const newContent = ed.content || ed.new_content;
      const vaultRes = await supabaseMemories.editIdeaInVault(targetKw, newContent).catch(e => { console.error('[COMMON-2ND_BRAIN] Supabase edit error:', e); return null; });
      let docsSuccess = false;
      if (vaultRes?.success && vaultRes.editedRows?.length > 0) {
        for (const row of vaultRes.editedRows) {
          docsSuccess = await googleWorkspace.editIdeaDoc(row.content, newContent);
        }
      } else {
        docsSuccess = await googleWorkspace.editIdeaDoc(targetKw, newContent);
      }
      invalidatePersonalFactsCache();
      return (vaultRes?.success || docsSuccess) ? '✅ Arsip berhasil diubah di Database (dan sinkronisasi Docs).' : '❌ Gagal menemukan/mengubah arsip.';
    }

    if (brainAction === 'DELETE') {
      const targetKw = ed.search_keyword;
      const vaultRes = await supabaseMemories.deleteIdeaFromVault(targetKw).catch(e => { console.error('[COMMON-2ND_BRAIN] Supabase delete error:', e); return null; });
      let docsSuccess = false;
      if (vaultRes?.success && vaultRes.deletedRows?.length > 0) {
        for (const row of vaultRes.deletedRows) {
          docsSuccess = await googleWorkspace.deleteIdeaDoc(row.content);
        }
      } else {
        docsSuccess = await googleWorkspace.deleteIdeaDoc(targetKw);
      }
      invalidatePersonalFactsCache();
      return (vaultRes?.success || docsSuccess) ? '🗑️ Arsip berhasil dihapus dari Database (dan sinkronisasi Docs).' : '❌ Gagal menemukan/menghapus arsip.';
    }

    // APPEND
    const content = ed.content || ed.fact || textInput;
    if (content) {
      await supabaseMemories.saveIdeaToVault(content).catch(e => console.error('[COMMON-2ND_BRAIN] Supabase vault save error:', e));
      const docUrl = await googleWorkspace.appendToIdeaDoc(ed.title || 'Ideation N.E.X.A', content, 'IDEA').catch(e => { console.error('[COMMON-2ND_BRAIN] Google Doc error:', e); return null; });
      if (docUrl) {
        return `✅ Ide berhasil disimpan ke arsip dan Google Docs:\n${docUrl}`;
      }
      return `✅ Ide berhasil disimpan ke arsip Vault:\n"${content}"`;
    }
  }

  // ────────────────────────────────────────────────────────────
  // 2. USER_PROFILE (Fakta Tuan Faqih)
  // ────────────────────────────────────────────────────────────
  if (intent === 'USER_PROFILE') {
    const action = ed.action || (ed.content || ed.fact ? 'APPEND' : 'READ');
    if (action === 'APPEND' || action === 'SAVE') {
      const content = ed.content || ed.fact || textInput;
      if (helpers.isFactAboutNexa(content)) {
        console.log('[COMMON] USER_PROFILE redirected to CORE_IDENTITY:', content);
        const selfLayer = helpers.classifySelfModelLayer(content);
        let saved = false;
        if (typeof aiRouter.deduplicateAndSaveSelfFact === 'function') {
          saved = await aiRouter.deduplicateAndSaveSelfFact(content, selfLayer, 'DIRECT_CONVERSATION', content);
          if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
        } else {
          saved = await aiRouter.deduplicateAndSaveFact(content, 'CORE_IDENTITY');
        }
        invalidatePersonalFactsCache();
        return helpers.formatMemoryReply(routingData.reply_message,
          saved ? `Baik Tuan Faqih, fakta mengenai diri saya (N.E.X.A) [${selfLayer}] telah saya pelajari dan saya tanamkan ke memori inti.` : 'Tentu Tuan Faqih, hal mengenai diri saya tersebut memang sudah tersimpan di dalam memori inti saya.',
          saved ? '✅ Tersimpan di Memori Inti N.E.X.A' : 'ℹ️ Sudah Tercatat di Memori Inti');
      }

      const saved = await aiRouter.deduplicateAndSaveFact(content, 'USER_PROFILE');
      invalidatePersonalFactsCache();
      return helpers.formatMemoryReply(routingData.reply_message,
        saved ? 'Siap Tuan Faqih, informasi tersebut sudah saya catat dan simpan ke dalam profil personal Anda.' : 'Tentu Tuan Faqih, fakta tersebut memang sudah ada di dalam catatan profil Anda sebelumnya.',
        saved ? '✅ Tersimpan di Memori Personal' : 'ℹ️ Sudah Tercatat di Memori Personal');
    }

    if (action === 'DELETE') {
      const kw = ed.search_keyword;
      let deletedLayer = null;
      if (await supabaseMemories.deleteFromUserProfile(kw)) deletedLayer = 'Personal';
      else if (await supabaseMemories.deleteFromCoreIdentity(kw)) deletedLayer = 'Inti N.E.X.A';
      else if (typeof supabaseMemories.deleteFromSelfModel === 'function' && await supabaseMemories.deleteFromSelfModel(kw)) deletedLayer = 'Self-Learning (Phase 8)';
      invalidatePersonalFactsCache();
      if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      return helpers.formatMemoryReply(routingData.reply_message,
        deletedLayer ? `Baik Tuan Faqih, catatan/aturan terkait telah saya hapus dari memori ${deletedLayer}.` : 'Maaf Tuan Faqih, saya tidak menemukan catatan/aturan terkait hal tersebut di seluruh sistem memori.',
        deletedLayer ? `🗑️ Dihapus dari Memori ${deletedLayer}` : '❌ Fakta Tidak Ditemukan di Seluruh Memori');
    }

    if (action === 'READ') {
      const keyword = ed.search_keyword || textInput;
      const facts = await supabaseMemories.getPersonalFacts();
      const relevantFacts = facts.userProfile ? aiRouter.selectUserProfileFacts(facts.userProfile, textInput) : [];
      const relevantVault = (facts.vaultItems && aiRouter.selectVaultFacts) ? aiRouter.selectVaultFacts(facts.vaultItems, textInput) : [];
      if (relevantFacts.length > 0 || relevantVault.length > 0) {
        const list = [...relevantFacts.map(f => `- [USER PROFILE] ${f}`), ...relevantVault.map(f => `- [VAULT DOKUMEN/ARSIP] ${f}`)].join('\n');
        const prompt = `FILTERED PERMANENT FACTS & VAULT DOCUMENTS ABOUT TUAN FAQIH:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user's question accurately using ONLY the relevant facts and vault document metadata above. If the answer (such as birth place, NIK, birth date, name, address) is found in the VAULT DOKUMEN/ARSIP metadata, answer clearly and proudly citing that it is recorded in their vaulted documents. Summarize them into a warm, natural narrative from an assistant's perspective. Do NOT use bullet points unless requested. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
        return await aiRouter.callAI(prompt);
      }
      return '🧠 Saat ini saya belum memiliki catatan fakta personal permanen maupun arsip di Vault terkait hal tersebut, Tuan Faqih.';
    }
  }

  // ────────────────────────────────────────────────────────────
  // 3. CORE_IDENTITY (Pedoman & Aturan N.E.X.A)
  // ────────────────────────────────────────────────────────────
  if (intent === 'CORE_IDENTITY') {
    const action = ed.action || (ed.content || ed.fact ? 'APPEND' : 'READ');
    if (action === 'APPEND' || action === 'SAVE') {
      const content = ed.content || ed.fact || textInput;
      const selfLayer = helpers.classifySelfModelLayer(content);
      let saved = false;
      if (typeof aiRouter.deduplicateAndSaveSelfFact === 'function') {
        saved = await aiRouter.deduplicateAndSaveSelfFact(content, selfLayer, 'DIRECT_CONVERSATION', content);
        if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      } else {
        saved = await aiRouter.deduplicateAndSaveFact(content, 'CORE_IDENTITY');
      }
      invalidatePersonalFactsCache();
      return helpers.formatMemoryReply(routingData.reply_message,
        saved ? `Dimengerti Tuan Faqih, aturan identitas dan pedoman perilaku utama N.E.X.A [${selfLayer}] telah saya perbarui.` : 'Tentu Tuan Faqih, pedoman tersebut sudah ada di memori identitas inti saya.',
        saved ? '✅ Tersimpan di Memori Inti N.E.X.A' : 'ℹ️ Sudah Tercatat di Memori Inti');
    }

    if (action === 'DELETE') {
      const kw = ed.search_keyword;
      let deletedLayer = null;
      if (await supabaseMemories.deleteFromCoreIdentity(kw)) deletedLayer = 'Inti N.E.X.A';
      else if (typeof supabaseMemories.deleteFromSelfModel === 'function' && await supabaseMemories.deleteFromSelfModel(kw)) deletedLayer = 'Self-Learning (Phase 8)';
      else if (await supabaseMemories.deleteFromUserProfile(kw)) deletedLayer = 'Personal';
      invalidatePersonalFactsCache();
      if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      return helpers.formatMemoryReply(routingData.reply_message,
        deletedLayer ? `Baik Tuan Faqih, aturan identitas/fakta terkait telah saya hapus dari memori ${deletedLayer}.` : 'Maaf Tuan Faqih, aturan/catatan tersebut tidak ditemukan di seluruh sistem memori (Inti, Self-Learning, maupun Personal).',
        deletedLayer ? `🗑️ Dihapus dari Memori ${deletedLayer}` : '❌ Aturan Tidak Ditemukan di Seluruh Memori');
    }

    if (action === 'READ') {
      const keyword = ed.search_keyword || textInput;
      const facts = await supabaseMemories.getPersonalFacts();
      if (facts.coreIdentity && facts.coreIdentity.length > 0) {
        const relevantIdentity = aiRouter.selectCoreIdentityFacts(facts.coreIdentity, textInput);
        const list = relevantIdentity.map(f => `- ${f}`).join('\n');
        const prompt = `FILTERED N.E.X.A CORE IDENTITIES & RULES:\n${list}\n\nUSER ASKED: "${keyword}"\n\nTASK: Answer the user gracefully and authoritatively based on your identity rules above. If it's a casual greeting, respond naturally as an assistant. Do NOT ask the user to specify aspects unless they requested the full list. CRITICAL RULE: ALWAYS address and refer to the user as "Tuan" or "Tuan Faqih". NEVER address or refer to the user as "Bapak", "Mas", or "Anda". MUST answer in fluent, elegant Indonesian.`;
        return await aiRouter.callAI(prompt);
      }
      return '🤖 Saat ini tidak ada aturan identitas inti khusus yang diterapkan.';
    }
  }

  return null;
}

module.exports = {
  handleMemoryIntent
};
