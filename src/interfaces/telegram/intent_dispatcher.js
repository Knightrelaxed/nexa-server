'use strict';
// ============================================================
// N.E.X.A — TELEGRAM INTENT DISPATCHER
// Dispatches identified intents to domain modules:
// FINANCE, CALENDAR, TASK, WEB_SEARCH, LOCATION, MEMORY/2ND_BRAIN,
// USER_PROFILE, CORE_IDENTITY, EMAIL, DATABASE, DEVICE_CONTROL,
// DISCIPLINE, DIAGNOSE_SYSTEM
// ============================================================

const env = require('../../config/env');
const aiRouter = require('../../core/AI_Router');
const { invalidatePersonalFactsCache, invalidateSelfModelCache } = aiRouter;
const financeEngine = require('../../domain/Finance_Engine');
const godMode = require('../../domain/Discipline_GodMode');
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const taskManager = require('../../domain/Task_Manager');
const webSearch = require('../../infrastructure/Web_Search');
const locationOrchestrator = require('../../domain/Location_Orchestrator');
const googleWorkspace = require('../../infrastructure/Google_Workspace');
const emailHelpers = require('./email_helpers');
const { triggerConversationalSynthesis } = require('./interceptors');

const escapeHtml = (str) => String(str || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function isFactAboutNexa(fact) {
  const f = fact.toLowerCase().trim();
  let score = 0;

  if (/\b(aku|saya|gue|gw)\b/.test(f)) score -= 2;
  const hasTuanName = /\b(tuan|faqih|hidayatulloh)\b/.test(f);
  const tuanIsSubject = /^(tuan|faqih)/.test(f) || /\b(tuan faqih|faqih)\s+(punya|memiliki|suka|biasa|kuliah|adalah)\b/.test(f);
  if (hasTuanName && tuanIsSubject) score -= 2;
  else if (hasTuanName) score -= 1;
  if (/\w+ku\b/.test(f) && !/\b(namaku|diriku sebagai)\b/.test(f)) score -= 1;

  if (/\b(nexa|n\.e\.x\.a)\b/.test(f)) score += 3;
  if (/^(kamu|anda|kau)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(adalah|itu|merupakan|diciptakan|dibuat|diluncurkan|punya|memiliki|bernama|disebut|bisa|dapat|mampu|tidak bisa|tidak mampu|sering|selalu|harus|jangan)\b/.test(f)) score += 2;
  if (/\b(diciptakan|dibuat|diluncurkan|lahir|dirancang|diprogram|dibangun)\b/.test(f)) score += 1;
  if (/\b(namamu|nama kamu|nama asisten|versimu|versi kamu|kemampuanmu|kemampuan kamu|identitasmu)\b/.test(f)) score += 2;
  if (/\b(kamu|anda|kau)\s+(bisa|dapat|mampu|tidak bisa|tidak mampu|belum bisa)\b/.test(f)) score += 1;
  if (/^(bot|asisten|ai)\b/.test(f)) score += 2;
  if (/\b(bot|asisten ai|model ai|sistem ai|ai asisten|kecerdasan buatan)\b/.test(f)) score += 1;
  if (/\b(dirimu|diri kamu|diri anda)\b/.test(f)) score += 2;

  if (/\b(ingat ya|catat ini|harap|tolong jangan|jangan terlalu|sebaiknya kamu|kamu seharusnya|kamu perlu|kamu harus|kamu sebaiknya)\b/.test(f)) score += 1;
  if (/\b(ternyata kamu|kamu ternyata|sebenarnya kamu|rupanya kamu)\b/.test(f)) score += 2;
  if (/\b(format (jawaban|balasan|respons)|gaya (bahasa|bicara|komunikasi)|responsmu|balasanmu|jawabanmu)\b/.test(f)) score += 1;

  return score > 0;
}

function classifySelfModelLayer(fact) {
  const f = fact.toLowerCase();
  if (/\b(tidak bisa|tidak mampu|belum bisa|belum mampu|gagal|lupa|terbatas|kendala|kesulitan|error|bug|lambat|keterbatasan|kelemahan)\b/.test(f)) return 'LIMITATIONS';
  if (/\b(ingat ya|catat ini|jangan|tolong jangan|seharusnya|harap|perbaiki|salah|keliru|koreksi|ralat)\b/.test(f)) return 'CORRECTIONS';
  if (/\b(ternyata kamu|kamu ternyata)\b/.test(f) && !/\b(bisa|mampu|dapat|berhasil)\b/.test(f)) return 'CORRECTIONS';
  if (/\b(format (jawaban|balasan|respons)|gaya bahasa|gaya bicara|gaya komunikasi|nada (bicara|respons)|responsmu|balasanmu|jawabanmu)\b/.test(f)) return 'COMMUNICATION_STYLE';
  if (/\b(bisa|dapat|mampu|berhasil|fitur|fungsi|kemampuan|kapabilitas|dukungan|mendukung|otomatis|sinkronisasi)\b/.test(f)) return 'CAPABILITIES';
  return 'OPERATIONAL_RULES';
}

function extractFinanceTransactionsFromEmails(emails) {
  if (!Array.isArray(emails)) return [];
  const results = [];
  for (const e of emails) {
    const text = `${e.subject || ''} ${e.snippet || ''}`;
    const nominal = emailHelpers.extractNominalFromEmail(e);
    if (!nominal) continue;

    const merchantMatch = text.match(/(?:ke|di|merchant|tujuan|dari)\s+([A-Za-z0-9\s._-]{2,40})/i);
    const destination = merchantMatch?.[1] ? merchantMatch[1].trim() : 'Transaksi Mandiri';
    const isExpense = !/(masuk|inflow|cr|kredit|setoran)/i.test(text);

    let isoDate = null;
    const emailDate = emailHelpers.parseEmailDateSafe(e.date);
    if (emailDate && !isNaN(emailDate.getTime())) {
      isoDate = emailDate.toISOString();
    }

    results.push({
      nominal,
      type: isExpense ? 'EXPENSE' : 'INCOME',
      destination,
      category: isExpense ? 'Belanja' : 'Pendapatan',
      description: e.subject || 'Notifikasi Livin Mandiri',
      time: isoDate || new Date().toISOString(),
      account: 'Mandiri',
      payment_method: 'Debit'
    });
  }
  return results;
}

/**
 * Dispatch single routing intent to appropriate domain logic.
 * @param {object} routingData 
 * @param {object} context 
 * @returns {Promise<string|null>}
 */
async function dispatchSingleIntent(routingData, context) {
  const {
    textInput,
    message,
    chatId,
    pendingEmailContext,
    setPendingEmailContext,
    pendingDatabaseContext,
    setPendingDatabaseContext,
    setPendingCalendarContext,
    setPendingConflictEvent,
    setPendingProactiveTasks,
    respondToTelegram
  } = context;

  let domainReply = null;

  const clarificationMessage = emailHelpers.getClarificationMessage(routingData, textInput);
  if (clarificationMessage) {
    return clarificationMessage;
  }

  switch (routingData.intent) {
    case 'FINANCE': {
      if (routingData.extracted_data && routingData.extracted_data.action === 'IMPORT_FROM_EMAIL') {
        const gmailClient = require('../../infrastructure/Gmail_Client');
        const candidateEmails = pendingEmailContext?.lastBatch?.length
          ? pendingEmailContext.lastBatch
          : await gmailClient.getLatestEmails('livin OR from:noreply.livin@bankmandiri.co.id', 30);
        const temporalHint = emailHelpers.getEmailTemporalFilterFromText(textInput);
        const dayHint = emailHelpers.parseDayOfMonthHint(textInput);
        let scopedEmails = emailHelpers.filterEmailsByTemporalHint(candidateEmails, temporalHint);
        if (dayHint) scopedEmails = emailHelpers.filterEmailsByDayOfMonth(scopedEmails, dayHint);
        const txRows = extractFinanceTransactionsFromEmails(scopedEmails);

        if (txRows.length === 0) {
          domainReply = '📭 Data transaksi keuangan otomatis tidak ditemukan di email yang dianalisis. Coba sebutkan rentang waktu yang lebih jelas, Tuan.';
          break;
        }

        let success = 0;
        let duplicate = 0;
        for (const tx of txRows.slice(0, 20)) {
          try {
            const result = await financeEngine.processTransaction(tx, 'GMAIL_POLLING');
            if (result?.status === 'DUPLICATE') duplicate += 1;
            else success += 1;
          } catch (_) { }
        }
        domainReply = `✅ Sinkronisasi Keuangan selesai.\n- Berhasil dicatat: <b>${success}</b>\n- Duplikasi diabaikan: <b>${duplicate}</b>\n- Sumber dianalisis: <b>${txRows.length}</b> transaksi email`;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_LATEST') {
        const ed = routingData.extracted_data;
        const hasFilter = ed.date_text || ed.search_keyword || ed.type || ed.category;
        let recentData;
        if (hasFilter) {
          recentData = await financeEngine.searchTransactions({
            date_text: ed.date_text || ed.time || null,
            keyword:   ed.search_keyword || null,
            type:      ed.type        || null,
            category:  ed.category    || null,
            limit:     ed.limit       || 30
          });
        } else {
          recentData = await financeEngine.getRecentTransactions(5);
        }
        domainReply = recentData;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'READ_ANALYTICS') {
        const analyticsData = await financeEngine.getFinanceAnalytics(routingData.extracted_data.date_text);
        domainReply = (routingData.reply_message ? routingData.reply_message + '\n\n' : '') + analyticsData;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'DELETE') {
        const result = await financeEngine.deleteTransaction(routingData.extracted_data.search_keyword);
        domainReply = result.message;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'UNDO_DELETE') {
        const result = await financeEngine.undoDeleteTransaction();
        domainReply = result.message;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'CONFIRM_TRANSACTION') {
        const replySnippetFin = message.reply_to_message && message.reply_to_message.text
          ? message.reply_to_message.text.substring(0, 500)
          : null;
        const targetKeyFin = replySnippetFin ? financeEngine.resolveTargetKeyFromSnippet(replySnippetFin) : null;
        const confirmationReply = await financeEngine.confirmPendingTransactions(
          true,
          routingData.extracted_data.description || null,
          routingData.extracted_data.category || null,
          null,
          null,
          targetKeyFin
        );
        domainReply = confirmationReply || '✅ Tidak ada transaksi yang tertunda. Kemungkinan transaksi telah disimpan otomatis karena melewati batas waktu 5 menit. Jika ingin mengubahnya, silakan gunakan perintah Edit (contoh: "Ubah transaksi 50rb menjadi...").';
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'UPDATE_PENDING') {
        const replySnippetUpd = message.reply_to_message && message.reply_to_message.text
          ? message.reply_to_message.text.substring(0, 500)
          : null;
        const targetKeyUpd = replySnippetUpd ? financeEngine.resolveTargetKeyFromSnippet(replySnippetUpd) : null;
        const updatedMsg = await financeEngine.updatePendingTransaction(
          routingData.extracted_data.description || null,
          routingData.extracted_data.category || null,
          routingData.extracted_data.nominal || null,
          routingData.extracted_data.account || null,
          routingData.extracted_data.payment_method || null,
          targetKeyUpd
        );
        domainReply = updatedMsg || '❌ Tidak ada transaksi yang tertunda untuk diubah. Kemungkinan transaksi telah disimpan otomatis. Silakan gunakan perintah Edit dengan menyebut nominal (contoh: "Edit transaksi 50rb menjadi...").';
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'CANCEL_TRANSACTION') {
        const replySnippetCan = message.reply_to_message && message.reply_to_message.text
          ? message.reply_to_message.text.substring(0, 500)
          : null;
        const targetKeyCan = replySnippetCan ? financeEngine.resolveTargetKeyFromSnippet(replySnippetCan) : null;
        const confirmationReply = await financeEngine.confirmPendingTransactions(false, null, null, null, null, targetKeyCan);
        domainReply = confirmationReply || 'Tidak ada transaksi yang tertunda.';
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'EDIT') {
        let kw = routingData.extracted_data.search_keyword;
        if (!kw || /^(ini|itu|transaksi|kategori|kategoriny|kategorinya|perbaiki|ubah|sesuaikan|yang|saya|balas|\s)*$/i.test(String(kw).trim())) {
          const replyTxt = message.reply_to_message && message.reply_to_message.text
            ? message.reply_to_message.text
            : null;
          if (replyTxt) {
            const catatanMatch = replyTxt.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
            const nominalLabelMatch = replyTxt.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
            const nominalRpMatch = replyTxt.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
            if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
              kw = catatanMatch[1].trim();
            } else if (nominalLabelMatch && nominalLabelMatch[1]) {
              kw = nominalLabelMatch[1].replace(/[^0-9]/g, '');
            } else if (nominalRpMatch && nominalRpMatch[1]) {
              kw = nominalRpMatch[1].replace(/[^0-9]/g, '');
            } else {
              kw = 'latest';
            }
          }
        }

        const result = await financeEngine.editTransaction(
          kw,
          routingData.extracted_data.nominal,
          routingData.extracted_data.description || routingData.extracted_data.destination,
          routingData.extracted_data.category,
          routingData.extracted_data.account,
          routingData.extracted_data.payment_method
        );
        domainReply = result.message;
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'CATEGORY_BREAKDOWN') {
        domainReply = await financeEngine.getCategoryInsight(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'PERIOD_COMPARISON') {
        domainReply = await financeEngine.getPeriodComparisonReport(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'TOP_EXPENSES') {
        const topLimit = routingData.extracted_data.limit || 5;
        domainReply = await financeEngine.getTopExpensesReport(routingData.extracted_data.date_text || null, topLimit);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'ACCOUNT_BALANCES') {
        domainReply = await financeEngine.getAccountBalancesReport();
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'DAILY_TREND') {
        domainReply = await financeEngine.getDailyTrendReport(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'SMART_SUMMARY') {
        domainReply = await financeEngine.getSmartFinanceSummary(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'MONTHLY_SUMMARY') {
        domainReply = await financeEngine.getMonthlySummaryReport();
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'SAVING_RATE') {
        domainReply = await financeEngine.getSavingRateReport(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'BALANCE_TREND') {
        domainReply = await financeEngine.getDailyBalanceTrendReport(routingData.extracted_data.date_text || null);
      } else if (routingData.extracted_data && routingData.extracted_data.action === 'RECORD_MULTIPLE' && Array.isArray(routingData.extracted_data.transactions)) {
        let replies = [];
        for (const tx of routingData.extracted_data.transactions) {
          const txData = {
            nominal: tx.nominal,
            type: tx.type || 'EXPENSE',
            destination: tx.destination || tx.merchant || 'Unknown',
            category: tx.category || 'Uncategorized',
            description: tx.description || '-',
            time: tx.time || new Date().toISOString(),
            account: tx.account || null,
            payment_method: tx.payment_method || null
          };
          const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
          if (confirmMsg) {
            replies.push(confirmMsg);
            const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cKey = `${txData.nominal}_${cleanMerch}`;
            supabaseMemories.markPendingTransactionSent(cKey).catch(() => { });
          } else {
            replies.push(`⚠️ Transaksi ${txData.nominal} ke ${txData.destination} tampaknya sudah dicatat atau tertunda.`);
          }
        }
        domainReply = replies.join('\n\n---\n\n');
      } else if (routingData.extracted_data && (routingData.extracted_data.nominal || routingData.extracted_data.action === 'RECORD')) {
        const txData = {
          nominal: routingData.extracted_data.nominal,
          type: routingData.extracted_data.type || 'EXPENSE',
          destination: routingData.extracted_data.destination || routingData.extracted_data.merchant || 'Unknown',
          category: routingData.extracted_data.category || 'Uncategorized',
          description: routingData.extracted_data.description || '-',
          time: routingData.extracted_data.time || new Date().toISOString(),
          account: routingData.extracted_data.account || null,
          payment_method: routingData.extracted_data.payment_method || null
        };
        const confirmMsg = await financeEngine.requestTransactionConfirmation(txData, 'PENCATATAN KEUANGAN BARU');
        if (confirmMsg) {
          domainReply = confirmMsg;
          const cleanMerch = (txData.destination || txData.merchant || 'Unknown').toLowerCase().replace(/[^a-z0-9]/g, '');
          const cKey = `${txData.nominal}_${cleanMerch}`;
          supabaseMemories.markPendingTransactionSent(cKey).catch(() => { });
        } else {
          domainReply = '⚠️ Transaksi ini tampaknya sudah pernah dicatat sebelumnya (duplikat) atau sedang menunggu konfirmasi.';
        }
      }
      break;
    }

    case 'DISCIPLINE': {
      if (routingData.god_mode_trigger) {
        await godMode.triggerGodMode(3, { source: 'Telegram Instruction' });
      }
      const appDiscipline = require('../../domain/App_Discipline_Engine');
      domainReply = await appDiscipline.handleDisciplineChatIntent(
        routingData.extracted_data || {},
        textInput
      );
      break;
    }

    case 'CALENDAR': {
      const agendaManager = require('../../domain/Agenda_Manager');
      const action = routingData.extracted_data?.action || 'READ';
      const result = await agendaManager.handleCalendarIntent(routingData.extracted_data);

      if (action === 'CREATE' && result) {
        if (result.status === 'NEED_INFO') {
          setPendingCalendarContext(result.pendingContext);
        } else if (result.status === 'CONFLICT_DETECTED') {
          setPendingConflictEvent({ ...result.pendingEvent, askedAt: Date.now() });
        } else if (result.status === 'SUCCESS' && Array.isArray(result.proactiveTasks) && result.proactiveTasks.length > 0) {
          setPendingProactiveTasks({
            summary: routingData.extracted_data.summary,
            start: routingData.extracted_data.start,
            tasks: result.proactiveTasks,
            askedAt: Date.now()
          });
        }
      }
      domainReply = result?.message || result;
      if (action === 'CREATE' && result?.status === 'SUCCESS') {
        triggerConversationalSynthesis(textInput, result.message, 'CREATE');
      }
      break;
    }

    case 'TASK': {
      const action = routingData.extracted_data?.action || 'READ';
      const result = await taskManager.handleTaskIntent(routingData.extracted_data, chatId);
      domainReply = result?.message || result;
      if (action === 'CREATE' && result?.status === 'SUCCESS') {
        triggerConversationalSynthesis(textInput, result.message, 'CREATE');
      }
      break;
    }

    case 'WEB_SEARCH': {
      const query = routingData.extracted_data?.query || textInput;
      const results = await webSearch.search(query);
      if (results && results.length > 0) {
        const searchContext = results.map(r => `Title: ${r.title}\nSnippet: ${r.snippet}\nLink: ${r.link}`).join('\n\n');
        const synthesizePrompt = `User Query: "${textInput}"\n\nSearch Results:\n${searchContext}\n\nTask: Synthesize a concise, helpful answer in Indonesian based on the search results. Include relevant links as HTML anchors (<a href="...">Title</a>).`;
        const { executeWithFallback } = require('../../core/Fallback_Engine');
        const { NEXA_PERSONALITY } = require('../../config/personality');
        domainReply = await executeWithFallback(synthesizePrompt, NEXA_PERSONALITY, 0.7, false);
      } else {
        domainReply = '🔍 Tidak ada hasil pencarian web yang relevan untuk pertanyaan tersebut.';
      }
      break;
    }

    case 'LOCATION': {
      domainReply = await locationOrchestrator.handleLocationIntent(routingData.extracted_data);
      break;
    }

    case '2ND_BRAIN': {
      const ed = routingData.extracted_data || {};
      const action = ed.action || 'SAVE';
      if (action === 'SAVE') {
        const saved = await supabaseMemories.saveIdeaToVault(ed.content || textInput);
        domainReply = saved.success ? `💡 Ide berhasil dicatat di Vault: "${ed.content || textInput}"` : `❌ Gagal menyimpan ide: ${saved.error}`;
      } else if (action === 'DELETE') {
        const deleted = await supabaseMemories.deleteIdeaFromVault(ed.search_keyword);
        domainReply = deleted.message;
      } else if (action === 'EDIT') {
        const edited = await supabaseMemories.editIdeaInVault(ed.search_keyword, ed.new_content);
        domainReply = edited.message;
      }
      break;
    }

    case 'USER_PROFILE': {
      const ed = routingData.extracted_data || {};
      const action = ed.action || 'SAVE';
      if (action === 'SAVE') {
        const fact = ed.fact || textInput;
        if (isFactAboutNexa(fact)) {
          const selfLayer = classifySelfModelLayer(fact);
          await aiRouter.deduplicateAndSaveSelfFact(fact, selfLayer, 'DIRECT_CONVERSATION', fact);
          domainReply = `🧠 Dicatat sebagai aturan/identitas N.E.X.A [${selfLayer}]: "${fact}"`;
          if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
        } else {
          await aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE');
          domainReply = `👤 Dicatat di Profil Tuan Faqih: "${fact}"`;
          invalidatePersonalFactsCache();
        }
      } else if (action === 'DELETE') {
        const deleted = await supabaseMemories.deleteFromUserProfile(ed.search_keyword);
        domainReply = deleted.message;
        invalidatePersonalFactsCache();
      }
      break;
    }

    case 'CORE_IDENTITY': {
      const ed = routingData.extracted_data || {};
      const action = ed.action || 'SAVE';
      if (action === 'SAVE') {
        const fact = ed.fact || textInput;
        const selfLayer = classifySelfModelLayer(fact);
        await aiRouter.deduplicateAndSaveSelfFact(fact, selfLayer, 'DIRECT_CONVERSATION', fact);
        domainReply = `🤖 Dicatat di Model Diri N.E.X.A [${selfLayer}]: "${fact}"`;
        if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      } else if (action === 'DELETE') {
        const deleted = await supabaseMemories.deleteFromSelfModel(ed.search_keyword);
        domainReply = deleted.message;
        if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      }
      break;
    }

    case 'EMAIL': {
      const gmailClient = require('../../infrastructure/Gmail_Client');
      const action = routingData.extracted_data?.action || 'READ';
      if (action === 'READ') {
        const searchKeyword = routingData.extracted_data.search_keyword || '';
        const requestedLimit = routingData.extracted_data.max_results || 5;
        const candidateEmails = await gmailClient.getLatestEmails(searchKeyword, 30);
        const temporalHint = emailHelpers.getEmailTemporalFilterFromText(textInput);
        const dayHint = emailHelpers.parseDayOfMonthHint(textInput);
        let scopedEmails = emailHelpers.filterEmailsByTemporalHint(candidateEmails, temporalHint);
        if (dayHint) scopedEmails = emailHelpers.filterEmailsByDayOfMonth(scopedEmails, dayHint);

        const emails = scopedEmails.slice(0, requestedLimit);
        if (emails.length === 0) {
          domainReply = '📭 Tidak ada email yang cocok dengan kriteria pencarian.';
        } else {
          domainReply = `📧 <b>Email Terbaru Anda (${emails.length}):</b>\n\n` + emails.map(e => {
            const parsedNominal = emailHelpers.extractNominalFromEmail(e);
            const nominalLine = parsedNominal ? `\n<b>Nominal:</b> Rp${parsedNominal.toLocaleString('id-ID')}` : '';
            return `[${escapeHtml(e.date)}]\n<b>Dari:</b> ${escapeHtml(e.from)}\n<b>Subjek:</b> ${escapeHtml(e.subject)}${nominalLine}\n<b>Snippet:</b> <i>${escapeHtml(e.snippet)}</i>\n`;
          }).join('\n---\n');
          setPendingEmailContext({
            searchKeyword,
            lastLimit: requestedLimit,
            cursorIndex: 0,
            lastBatch: candidateEmails.slice(0, 50),
            askedAt: Date.now()
          });
        }
      } else if (action === 'SEND') {
        const success = await gmailClient.sendEmail(
          routingData.extracted_data.to,
          routingData.extracted_data.subject,
          routingData.extracted_data.content
        );
        setPendingEmailContext(null);
        domainReply = success ? `✅ Email berhasil dikirim ke ${routingData.extracted_data.to}.` : `❌ Gagal mengirim email.`;
      } else if (action === 'DELETE') {
        const emails = await gmailClient.getLatestEmails(routingData.extracted_data.search_keyword, 1);
        if (emails.length > 0) {
          const success = await gmailClient.deleteEmail(emails[0].id);
          domainReply = success ? `🗑️ Email dengan subjek "${emails[0].subject}" berhasil dihapus.` : `❌ Gagal menghapus email.`;
        } else {
          domainReply = `Tidak ditemukan email dengan kata kunci tersebut untuk dihapus.`;
        }
        setPendingEmailContext(null);
      }
      break;
    }

    case 'DATABASE': {
      const dbData = routingData.extracted_data || {};
      const dbAction = dbData.action || 'LIST_TABLES';
      const tableName = dbData.table_name;

      if (!tableName && dbAction !== 'LIST_TABLES') {
        domainReply = `❓ Tabel Supabase mana yang ingin Anda kelola?\nPilih salah satu:\n- nexa_chat_memories\n- nexa_finance_dedup\n- nexa_user_profile\n- nexa_core_identity\n- nexa_2nd_brain`;
        setPendingDatabaseContext({ tableName: '', lastAction: dbAction, askedAt: Date.now() });
        break;
      }

      if (dbAction === 'LIST_TABLES') {
        const overview = await supabaseMemories.getDatabaseOverview();
        if (!overview.success) {
          domainReply = `❌ Gagal membaca overview database: ${escapeHtml(overview.error)}`;
          break;
        }
        const lines = overview.tables.map((t) => {
          const info = overview.counts[t];
          if (info?.error) return `- <b>${t}</b>: error (${escapeHtml(info.error)})`;
          return `- <b>${t}</b>: ${info?.count || 0} baris`;
        });
        domainReply = `🗄️ <b>Overview Supabase (5 tabel N.E.X.A):</b>\n${lines.join('\n')}\n\nBalas dengan aksi jelas, misalnya:\n- "baca nexa_core_identity 5 data"\n- "tambah nexa_user_profile: aku suka teh"\n- "hapus nexa_2nd_brain id 12"`;
        setPendingDatabaseContext({ tableName: '', lastAction: dbAction, askedAt: Date.now() });
      } else if (dbAction === 'READ_TABLE') {
        const result = await supabaseMemories.readDatabaseTable(tableName, {
          limit: dbData.max_results || 5,
          searchKeyword: dbData.search_keyword || ''
        });
        if (!result.success) {
          domainReply = `❌ Gagal membaca tabel <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
          break;
        }
        if (!result.rows || result.rows.length === 0) {
          domainReply = `📭 Tabel <b>${escapeHtml(result.table)}</b> tidak memiliki data yang cocok.`;
          break;
        }
        if (tableName && (tableName.toLowerCase() === 'nexa_vault_items' || result.table === 'nexa_vault_items')) {
          const rowsPreview = result.rows.map((r, idx) => {
            const category = r.category || r.metadata_json?.kategori_gambar || 'Dokumen';
            const title = r.metadata_json?.judul || r.metadata_json?.title || r.metadata_json?.nama_dokumen || r.file_name.replace(/_\d+\.[a-zA-Z0-9]+$/, '').replace(/_/g, ' ');
            const link = r.drive_web_view_link;
            const linkStr = link ? `\n   🔗 <a href="${escapeHtml(link)}">Buka di Google Drive</a>` : '';
            return `${idx + 1}. <b>[${escapeHtml(category)}]</b> ${escapeHtml(title)}\n   📁 <code>${escapeHtml(r.file_name)}</code>${linkStr}`;
          }).join('\n\n');
          domainReply = `🗄️ <b>Daftar Dokumen Vault (${result.rows.length} dokumen tersimpan):</b>\n\n${rowsPreview}`;
        } else {
          const rowsPreview = result.rows.map((r) => {
            const summary = Object.entries(r)
              .slice(0, 4)
              .map(([k, v]) => `${k}: ${String(v).substring(0, 80)}`)
              .join(' | ');
            return `• ${escapeHtml(summary)}`;
          }).join('\n');
          domainReply = `📚 <b>Data ${escapeHtml(result.table)} (${result.rows.length} baris):</b>\n${rowsPreview}`;
        }
        setPendingDatabaseContext({ tableName: result.table, lastAction: dbAction, askedAt: Date.now() });
      } else if (dbAction === 'INSERT_ROW') {
        const result = await supabaseMemories.insertDatabaseRow(tableName, dbData.row_data || {});
        domainReply = result.success
          ? `✅ Insert berhasil ke <b>${escapeHtml(result.table)}</b> (id: ${result.row?.id || '-'})`
          : `❌ Insert gagal ke <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
        setPendingDatabaseContext({ tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
      } else if (dbAction === 'UPDATE_ROW') {
        const result = await supabaseMemories.updateDatabaseRows(
          tableName,
          dbData.update_data || {},
          { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
        );
        domainReply = result.success
          ? `✅ Update berhasil di <b>${escapeHtml(result.table)}</b>. Baris terubah: ${result.updatedRows.length}`
          : `❌ Update gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
        setPendingDatabaseContext({ tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
      } else if (dbAction === 'DELETE_ROW') {
        const result = await supabaseMemories.deleteDatabaseRows(
          tableName,
          { rowId: dbData.row_id, searchKeyword: dbData.search_keyword }
        );
        domainReply = result.success
          ? `🗑️ Delete berhasil di <b>${escapeHtml(result.table)}</b>. Baris terhapus: ${result.deletedRows.length}`
          : `❌ Delete gagal di <b>${escapeHtml(tableName)}</b>: ${escapeHtml(result.error)}`;
        setPendingDatabaseContext({ tableName: result.table || tableName, lastAction: dbAction, askedAt: Date.now() });
      } else if (dbAction === 'DELETE_ALL_ROWS') {
        domainReply = routingData.reply_message || `⚠️ <b>PERINGATAN!</b> Anda meminta untuk menghapus SELURUH isi dari tabel <b>${escapeHtml(tableName)}</b>.\n\nApakah Anda benar-benar yakin ingin memusnahkan semua datanya? Balas <b>"YA"</b> untuk mengeksekusi, atau <b>"BATAL"</b>.`;
        setPendingDatabaseContext({ tableName, lastAction: dbAction, awaitingConfirmation: true, askedAt: Date.now() });
      } else if (dbAction === 'DELETE_ALL_ROWS_CONFIRMED') {
        const isPending = pendingDatabaseContext?.awaitingConfirmation === true;
        const isFresh = pendingDatabaseContext?.askedAt && (Date.now() - pendingDatabaseContext.askedAt < 120000);

        if (!isPending || !isFresh) {
          domainReply = `⛔ <b>Keamanan Terpicu</b>: Aksi pemusnahan massal ditolak karena tidak ada konfirmasi aktif sebelumnya. Silakan ajukan perintah hapus dari awal.`;
          setPendingDatabaseContext(null);
        } else {
          const targetTable = pendingDatabaseContext?.tableName || tableName;
          let driveDeletedMsg = '';
          if (targetTable === 'nexa_vault_items') {
            const driveSuccess = await googleWorkspace.deleteAllVaultFiles();
            driveDeletedMsg = driveSuccess
              ? '\n🗑️ Semua file fisik di Google Drive Vault juga telah dimasukkan ke Trash.'
              : '\n⚠️ Gagal menghapus file fisik di Google Drive Vault.';
          }

          const result = await supabaseMemories.deleteAllDatabaseRows(targetTable);
          domainReply = result.success
            ? `💥 <b>Pemusnahan Massal Selesai</b>.\nSeluruh data di tabel <b>${escapeHtml(result.table)}</b> telah dihapus. Jumlah baris yang terdampak: ${result.deletedRows.length}${driveDeletedMsg}`
            : `❌ Gagal memusnahkan isi tabel <b>${escapeHtml(targetTable)}</b>: ${escapeHtml(result.error)}`;
          setPendingDatabaseContext(null);
        }
      } else if (dbAction === 'CANCEL_ACTION') {
        domainReply = '✅ Aksi database dibatalkan, Tuan.';
        setPendingDatabaseContext(null);
      } else if (dbAction === 'DELETE_ROWS') {
        domainReply = `❌ Penghapusan banyak baris secara otomatis belum didukung. Hapus satu per satu menggunakan kata kunci (contoh: "Hapus transaksi 150000"). Jika ini tabel Supabase, silakan buat skrip khusus.`;
      } else {
        domainReply = `❌ Aksi database tidak dikenali: ${escapeHtml(dbAction)}`;
      }
      break;
    }

    case 'EDIT': {
      let editKw = routingData.extracted_data?.search_keyword || null;
      if (!editKw || /^(ini|itu|transaksi|perbaiki|ubah|sesuaikan|\s)*$/i.test(String(editKw).trim())) {
        const replyTxtEdit = message.reply_to_message && message.reply_to_message.text
          ? message.reply_to_message.text
          : null;
        if (replyTxtEdit) {
          const cMatch = replyTxtEdit.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
          const nLabelMatch = replyTxtEdit.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
          const nRpMatch = replyTxtEdit.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
          if (cMatch && cMatch[1] && cMatch[1].trim().length > 1) {
            editKw = cMatch[1].trim();
          } else if (nLabelMatch && nLabelMatch[1]) {
            editKw = nLabelMatch[1].replace(/[^0-9]/g, '');
          } else if (nRpMatch && nRpMatch[1]) {
            editKw = nRpMatch[1].replace(/[^0-9]/g, '');
          } else {
            editKw = 'latest';
          }
        } else {
          editKw = 'latest';
        }
      }
      const editResult = await financeEngine.editTransaction(
        editKw,
        routingData.extracted_data?.nominal,
        routingData.extracted_data?.description || routingData.extracted_data?.destination,
        routingData.extracted_data?.category,
        routingData.extracted_data?.account,
        routingData.extracted_data?.payment_method
      );
      domainReply = editResult.message;
      break;
    }

    case 'DEVICE_CONTROL': {
      const deviceControlEngine = require('../../domain/Device_Control_Engine');
      const devResult = await deviceControlEngine.executeDeviceAction(routingData, {
        chatId: message.chat?.id,
        platform: 'telegram'
      });

      if (devResult && devResult.photoBase64) {
        try {
          const botToken = env.TELEGRAM_BOT_TOKEN?.trim();
          const targetChatId = (message.chat?.id || env.TELEGRAM_CHAT_ID)?.toString().trim();
          if (botToken && targetChatId) {
            const buffer = Buffer.from(devResult.photoBase64, 'base64');
            const formData = new FormData();
            formData.append('chat_id', targetChatId);
            formData.append('photo', new Blob([buffer], { type: 'image/jpeg' }), 'capture.jpg');
            formData.append('caption', devResult.message || '📸 Tangkapan Kamera / Layar HP');
            formData.append('parse_mode', 'HTML');

            const directUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
            const resp = await fetch(directUrl, { method: 'POST', body: formData });
            const photoData = await resp.json().catch(() => ({}));
            if (photoData.ok) {
              console.log('[TELEGRAM] Direct photo send SUCCESS.');
              return null; // Photo already sent directly
            }
          }
        } catch (photoErr) {
          console.error('[TELEGRAM] Failed to send photo buffer:', photoErr.message);
        }
      }
      domainReply = devResult?.message || '⚠️ Perintah kontrol perangkat telah diproses.';
      break;
    }

    case 'DIAGNOSE_SYSTEM': {
      const logger = require('../../utils/logger');
      const recentLogs = logger.getRecentLogs();
      if (!recentLogs || recentLogs.trim() === '') {
        domainReply = '✅ Sistem berjalan normal. Belum ada log baru yang terekam di memori saat ini.';
      } else {
        domainReply = await aiRouter.analyzeSystemLogs(textInput, recentLogs);
      }
      break;
    }

    default:
      domainReply = null;
      break;
  }

  return domainReply;
}

module.exports = {
  isFactAboutNexa,
  classifySelfModelLayer,
  extractFinanceTransactionsFromEmails,
  dispatchSingleIntent
};
