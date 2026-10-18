'use strict';
// ============================================================
// N.E.X.A — TELEGRAM INTERFACE ADAPTER (Modular v3.4)
// Central orchestrator for the Telegram Webhook interface.
// Coordinates:
// - Dedup & Chat Queueing
// - Typing Indicator & Message Delivery
// - Inline Callback Queries (callback_handler.js)
// - Direct Slash Commands (command_handler.js)
// - Document & Image Vault (vault_handler.js)
// - Voice & Photo Processing (media_handler.js)
// - Pending Context State Loops (interceptors.js)
// - Domain Intent Dispatching (intent_dispatcher.js)
// - Signal Detector & Micro-Reviewer Hooks
// ============================================================

const env = require('../../config/env');
const aiRouter = require('../../core/AI_Router');
const { invalidatePersonalFactsCache, invalidateSelfModelCache } = aiRouter;
const supabaseMemories = require('../../infrastructure/Supabase_Memories');
const { stripSurroundingQuotes } = require('./actions');
const { startTypingLoop, sendTelegramMessage } = require('../../utils/telegram_network');

const callbackHandler = require('./callback_handler');
const commandHandler = require('./command_handler');
const vaultHandler = require('./vault_handler');
const mediaHandler = require('./media_handler');
const interceptors = require('./interceptors');
const intentDispatcher = require('./intent_dispatcher');
const emailHelpers = require('../common/follow_up_resolver');

// ── State Contexts ───────────────────────────────────────────
let pendingCalendarContext = null;
let pendingConflictEvent = null;
let pendingProactiveTasks = null;
let pendingEmailContext = null;
let pendingDatabaseContext = null;
let pendingVaultContext = null;
let conversationContext = null;
let lastTurnMeta = null;

// ── Advice Session Counter (Overthinking Tracker) ────────────
const _adviceSessionMap = new Map();
const ADVICE_SESSION_TTL_MS = 60 * 60 * 1000; // 1 jam

function _trackAdviceSession(chatId) {
  const key = String(chatId || 'default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) {
    _adviceSessionMap.set(key, { count: 1, lastAt: now });
    return 1;
  }
  const newCount = session.count + 1;
  _adviceSessionMap.set(key, { count: newCount, lastAt: now });
  return newCount;
}

function _getAdviceSessionCount(chatId) {
  const key = String(chatId || 'default');
  const now = Date.now();
  const session = _adviceSessionMap.get(key);
  if (!session || (now - session.lastAt) > ADVICE_SESSION_TTL_MS) return 0;
  return session.count;
}

// ── FIFO Chat Execution Queue ────────────────────────────────
const _chatQueues = new Map();

function enqueueChat(chatId, fn) {
  const key = String(chatId || 'default');
  const prev = _chatQueues.get(key) || Promise.resolve();

  const executeWithTimeout = async () => {
    let timer;
    const ac = new AbortController();
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new Error(`[QUEUE_TIMEOUT] Message processing on chat ${key} exceeded 120s timeout`));
      }, 120_000);
      if (timer && timer.unref) timer.unref();
    });

    try {
      return await Promise.race([fn(ac.signal), timeoutPromise]);
    } catch (err) {
      ac.abort();
      console.error(`[TELEGRAM-QUEUE] Error or timeout on chat ${key}:`, err.message);
    } finally {
      clearTimeout(timer);
    }
  };

  const next = prev.then(executeWithTimeout, executeWithTimeout).finally(() => {
    if (_chatQueues.get(key) === next) {
      _chatQueues.delete(key);
    }
  });
  _chatQueues.set(key, next);
  return next;
}

// ── Update ID Deduplication Cache ────────────────────────────
const _processedUpdateIds = new Set();
const MAX_UPDATE_ID_CACHE = 1000;

function isDuplicateUpdate(updateId) {
  if (!updateId) return false;
  const idStr = String(updateId);
  if (_processedUpdateIds.has(idStr)) {
    return true;
  }
  _processedUpdateIds.add(idStr);
  if (_processedUpdateIds.size > MAX_UPDATE_ID_CACHE) {
    const oldest = _processedUpdateIds.values().next().value;
    _processedUpdateIds.delete(oldest);
  }
  return false;
}

// ============================================================
// MAIN TELEGRAM WEBHOOK ROUTE HANDLER
// ============================================================
async function handleTelegramWebhook(req, res) {
  const updateId = req.body?.update_id;
  if (isDuplicateUpdate(updateId)) {
    console.warn(`[TELEGRAM-DEDUP] ⚠️ Duplicate update_id ${updateId} received. Acknowledging with 200 OK.`);
    return res.status(200).send('OK');
  }

  // 1. Inline Keyboard Callbacks
  const callbackQuery = req.body?.callback_query;
  if (callbackQuery) {
    res.status(200).send('OK');
    await callbackHandler.handleCallbackQuery(callbackQuery, {
      setConversationContext: (ctx) => { conversationContext = ctx; }
    });
    return;
  }

  // 2. Incoming Messages (Text, Audio, Media)
  const message = req.body?.message || req.body?.edited_message;
  if (!message) {
    return res.status(200).send('OK');
  }

  // Immediate Webhook Ack with typing action
  res.status(200).json({
    method: 'sendChatAction',
    chat_id: message.chat.id,
    action: 'typing'
  });

  enqueueChat(message.chat.id, async (abortSignal) => {
    // Snapshot Turn N-1 context before processing
    const previousTurnContext = (lastTurnMeta && (Date.now() - lastTurnMeta.at < 15 * 60 * 1000))
      ? {
          intent: lastTurnMeta.intent,
          topic: lastTurnMeta.topic,
          injectedPlaybook: lastTurnMeta.injectedPlaybook,
          injectedTraits: lastTurnMeta.injectedTraits,
          lastAssistantReply: lastTurnMeta.reply,
          askedAt: lastTurnMeta.at
        }
      : null;
    lastTurnMeta = null;

    try {
      const { getNotifier } = require('../../core/Notifier');
      getNotifier().markEngaged('REPLY').catch(() => {});
    } catch (_) {}

    const stopTyping = startTypingLoop(message.chat?.id, env.TELEGRAM_BOT_TOKEN?.trim());
    let webhookReply = null;

    const escapeHtml = (str) => String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const respondToTelegram = async (text, skipMemory = false) => {
      if (abortSignal && abortSignal.aborted) return;
      const cleanText = stripSurroundingQuotes(String(text));
      if (!skipMemory) {
        await supabaseMemories.saveChatMemory('nexa', cleanText.substring(0, 4000)).catch(() => {});
      }
      webhookReply = cleanText.substring(0, 4000);
    };

    const deliverWebhookReply = async () => {
      stopTyping();
      if (abortSignal && abortSignal.aborted) {
        console.warn(`[TELEGRAM] Suppressed late reply due to queue timeout on chat ${message.chat.id}`);
        return;
      }
      if (webhookReply) {
        const replyToSend = webhookReply;
        webhookReply = null;
        console.log('[TELEGRAM] Delivering via outbound API (webhook already acked)');
        await sendTelegramMessage(replyToSend, message.chat.id, env.TELEGRAM_BOT_TOKEN?.trim());
      }
    };

    let textInput = message.text;

    // Reply-Awareness context injection
    if (textInput && message.reply_to_message && message.reply_to_message.text) {
      const originalMsg = message.reply_to_message.text;
      const snippet = originalMsg.length > 600 ? originalMsg.substring(0, 600) + '...' : originalMsg;
      const ACTION_VERBS = /\b(hapus|ubah|edit|perbaiki|catat|konfirmasi|batalkan|ganti|update|delete|simpan|sesuaikan|koreksi|tambah|undo)\b/i;
      const isAction = ACTION_VERBS.test(textInput);
      const label = isAction ? 'KONTEKS_AKSI' : 'KONTEKS_REFERENSI';
      textInput = `[${label} — Menanggapi pesan N.E.X.A: "${snippet}"]\n${textInput}`;
    }

    const captionText = message.caption || '';
    const vaultTriggerText = `${textInput || ''} ${captionText || ''}`.toLowerCase();

    // Centralized incoming message save
    const rawInputStr = (textInput || captionText || '[Attachment/Media]').substring(0, 4000);
    await supabaseMemories.saveChatMemory('user', rawInputStr).catch(() => {});

    try {
      // ── Step 1: Direct Slash Commands ──────────────────────────
      const commandHandled = await commandHandler.handleDirectCommand(textInput, {
        respondToTelegram,
        deliverWebhookReply
      });
      if (commandHandled) return;

      // ── Step 2: Identity Rejection Reason Interceptor ─────────
      const idReasonResult = await interceptors.handleAwaitingIdentityReason(
        conversationContext,
        textInput,
        { respondToTelegram, deliverWebhookReply }
      );
      if (idReasonResult.handled) {
        conversationContext = idReasonResult.updatedContext;
        return;
      }

      // ── Step 3: Morning Check-In & Detail Interceptor ──────────
      const checkInHandled = await interceptors.handleMorningCheckIn(textInput, {
        respondToTelegram,
        deliverWebhookReply
      });
      if (checkInHandled) return;

      // ── Step 4: Vault Confirmation Loop ────────────────────────
      const vaultConfirmResult = await vaultHandler.handleVaultConfirmation(
        textInput,
        pendingVaultContext,
        respondToTelegram
      );
      if (vaultConfirmResult.handled) {
        pendingVaultContext = vaultConfirmResult.updatedContext;
        return;
      }

      // ── Step 5: Vault Upload ───────────────────────────────────
      const vaultUploadResult = await vaultHandler.handleVaultUpload(
        message,
        vaultTriggerText,
        { respondToTelegram }
      );
      if (vaultUploadResult.handled) {
        if (vaultUploadResult.newContext) pendingVaultContext = vaultUploadResult.newContext;
        return;
      }

      // ── Step 6: Voice Note & Photo Processing ──────────────────
      if (message.voice) {
        const voiceResult = await mediaHandler.processVoiceNote(message, respondToTelegram);
        if (voiceResult.transcribedText) {
          textInput = voiceResult.transcribedText;
        } else {
          return;
        }
      }

      if (message.photo && message.photo.length > 0) {
        const photoResult = await mediaHandler.processPhoto(message, respondToTelegram);
        if (photoResult.photoPrompt) {
          textInput = photoResult.photoPrompt;
        } else if (photoResult.error) {
          return;
        }
      } else if (message.caption && !textInput) {
        textInput = message.caption;
      }

      if (!textInput || textInput.trim() === '') {
        return;
      }

      console.log('[TELEGRAM] Received message:', textInput.substring(0, 100));

      // ── Step 7: Pending Calendar Duration Interceptor ──────────
      const calPendingRes = await interceptors.handlePendingCalendar(textInput, pendingCalendarContext, { respondToTelegram });
      if (calPendingRes.handled) {
        pendingCalendarContext = calPendingRes.updatedPendingCalendar;
        if (calPendingRes.newConflict) pendingConflictEvent = calPendingRes.newConflict;
        return;
      }

      // ── Step 8: Pending Finance Deletion Confirmation ──────────
      if (await interceptors.handlePendingDeletions(textInput, { respondToTelegram })) {
        return;
      }

      // ── Step 9: Pending Split Remainder & Receipts ─────────────
      if (await interceptors.handlePendingSplitRemainder(message.chat.id, textInput, { respondToTelegram })) {
        return;
      }
      if (await interceptors.handlePendingSplitReceiptPhoto(message, message.chat.id, { respondToTelegram })) {
        return;
      }

      // ── Step 10: Pending Finance Confirmations ─────────────────
      if (await interceptors.handlePendingFinanceConfirmation(message, textInput, message.chat.id, { respondToTelegram })) {
        return;
      }

      // ── Step 11: Pending Tasks Interceptor ─────────────────────
      if (await interceptors.handlePendingTasks(message.chat.id, textInput, { respondToTelegram })) {
        return;
      }

      // ── Step 12: Pending Conflict Confirmation ─────────────────
      const confRes = await interceptors.handlePendingConflict(textInput, pendingConflictEvent, { respondToTelegram });
      if (confRes.handled) {
        pendingConflictEvent = confRes.updatedConflict;
        return;
      }

      // ── Step 13: Pending Proactive Tasks Confirmation ──────────
      const proRes = await interceptors.handlePendingProactiveTasks(textInput, pendingProactiveTasks, message.chat.id, { respondToTelegram });
      if (proRes.handled) {
        pendingProactiveTasks = proRes.updatedProactiveTasks;
        return;
      }

      // ── Step 14: Context & Follow-up Routing ───────────────────
      let routingData;
      if (pendingEmailContext && emailHelpers.isEmailHistoryFollowUp(textInput)) {
        routingData = {
          intent: 'EMAIL',
          extracted_data: { action: 'READ', search_keyword: pendingEmailContext.searchKeyword || '', max_results: 1, before_current: true },
          reply_message: '',
          god_mode_trigger: false
        };
        console.log('[ROUTER] Email follow-up context override activated.');
      } else if (
        pendingEmailContext &&
        emailHelpers.isGenericContinuation(textInput) &&
        Date.now() - pendingEmailContext.askedAt < 10 * 60 * 1000
      ) {
        routingData = {
          intent: 'EMAIL',
          extracted_data: { action: 'READ', search_keyword: pendingEmailContext.searchKeyword || '', max_results: 1, before_current: true },
          reply_message: '',
          god_mode_trigger: false
        };
        console.log('[ROUTER] Generic continuation mapped to EMAIL follow-up.');
      } else {
        if (conversationContext) {
          const globalFollowUp = emailHelpers.buildGlobalFollowUpRouting(textInput, conversationContext);
          if (globalFollowUp) {
            routingData = globalFollowUp;
            console.log('[ROUTER] Global follow-up context override activated for intent:', routingData.intent);
          }
        }
        if (!routingData) {
          routingData = await aiRouter.routeUserMessage(textInput, {
            conversationContext,
            pendingCalendarContext,
            pendingEmailContext,
            pendingDatabaseContext,
            pendingVaultContext
          });
        }
      }

      console.log('[ROUTER] Intent identified:', routingData.intent);
      if (routingData.actions && routingData.actions.length > 1) {
        console.log('[ROUTER] ⚡ Multi-action detected (' + routingData.actions.length + ' actions):', routingData.actions.map(a => a.intent).join(', '));
      }

      conversationContext = {
        intent: routingData.intent,
        actions: routingData.actions || null,
        extractedData: routingData.extracted_data || null,
        lastUserText: textInput,
        lastAssistantReply: conversationContext?.lastAssistantReply || '',
        askedAt: Date.now()
      };

      // ── Step 15: Background Passive Learning & Logging ─────────
      const behaviorEngine = require('../../domain/Behavior_Engine');
      behaviorEngine.logUserInteraction(routingData.intent, textInput, routingData.mood || 'NEUTRAL').catch(() => {});
      if (routingData.mood && routingData.mood !== 'NEUTRAL') {
        behaviorEngine.logMood(routingData.mood, textInput).catch(() => {});
      }

      // Learned User Facts
      if (Array.isArray(routingData.learned_user_facts) && routingData.learned_user_facts.length > 0) {
        for (const fact of routingData.learned_user_facts) {
          if (typeof fact === 'string' && fact.trim().length > 0) {
            if (intentDispatcher.isFactAboutNexa(fact)) {
              console.log('[SELF-MODEL] Passive Learning → Self-Model (rerouted):', fact.substring(0, 80));
              const selfLayer = intentDispatcher.classifySelfModelLayer(fact);
              aiRouter.deduplicateAndSaveSelfFact(fact, selfLayer, 'PASSIVE_LEARNING', fact).catch(() => {});
            } else {
              console.log('[ROUTER] Passive Learning - User Fact:', fact);
              await aiRouter.deduplicateAndSaveFact(fact, 'USER_PROFILE');
              behaviorEngine.logPassiveLearning(fact, 'USER_PROFILE').catch(() => {});
            }
          }
        }
        invalidatePersonalFactsCache();
      }

      // Learned Core Identities
      if (Array.isArray(routingData.learned_core_identities) && routingData.learned_core_identities.length > 0) {
        for (const fact of routingData.learned_core_identities) {
          if (typeof fact === 'string' && fact.trim().length > 0) {
            console.log('[SELF-MODEL] Passive Learning → Self-Model (core):', fact.substring(0, 80));
            const selfLayer = intentDispatcher.classifySelfModelLayer(fact);
            aiRouter.deduplicateAndSaveSelfFact(fact, selfLayer, 'PASSIVE_LEARNING', fact).catch(() => {});
          }
        }
        if (typeof invalidateSelfModelCache === 'function') invalidateSelfModelCache();
      }

      // Intention Engine & Decision Journal
      if (textInput && textInput.length >= 10) {
        const intentionEngine = require('../../domain/Intention_Engine');
        intentionEngine.detectAndSaveIntention(textInput, routingData).catch(() => {});
        intentionEngine.autoReconcileIntentions(textInput).catch(() => {});

        const DECISION_INTENTS = new Set(['DISCIPLINE', 'CALENDAR', 'ADVICE', 'NORMAL_CHAT']);
        if (DECISION_INTENTS.has(String(routingData.intent || '').toUpperCase())) {
          const detectedMood = routingData.detected_mood || 'NEUTRAL';
          intentionEngine.detectAndSaveDecision(textInput, routingData, detectedMood).catch(() => {});
        }
      }

      // Anticipatory Engine
      {
        const anticipatoryEngine = require('../../domain/Anticipatory_Engine');
        const jakartaHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).getHours();
        const currentChatId = message?.chat?.id || 'default';
        const currentIntent = String(routingData.intent || 'NORMAL_CHAT').toUpperCase();
        const sessionAdviceCount = currentIntent === 'ADVICE'
          ? _trackAdviceSession(currentChatId)
          : _getAdviceSessionCount(currentChatId);

        (async () => {
          try {
            const moodCtx = await anticipatoryEngine.getLatestMoodContext();
            await anticipatoryEngine.runAnticipationPass({
              intent: routingData.intent || 'NORMAL_CHAT',
              mood: routingData.detected_mood || 'NEUTRAL',
              hour: jakartaHour,
              mood_7d_trend: moodCtx.mood_7d_trend,
              mood_7d_variance: moodCtx.mood_7d_variance,
              sessionAdviceCount
            });
          } catch (_) {}
        })();
      }

      // ── Step 16: Intent Execution ──────────────────────────────
      let domainReply = null;

      // [SPLIT] TITIK 3: Perintah split pada transaksi existing
      const isReplyToBotReceipt = message.reply_to_message &&
        message.reply_to_message.from &&
        message.reply_to_message.from.is_bot === true &&
        /(?:Nominal|Berhasil mencatat|Pengeluaran|Pemasukan)/i.test(message.reply_to_message.text || '');

      if (routingData.intent === 'FINANCE' && isReplyToBotReceipt) {
        const splitEngine = require('../../domain/Split_Engine');
        if (/\bsplit\b|\bpecah\b|\brincian\b/i.test(textInput)) {
          try {
            const replyTxt = message.reply_to_message.text || '';
            let kw = 'latest';
            const catatanMatch = replyTxt.match(/(?:Deskripsi|Catatan|Tujuan|Merchant)\s*:\s*([^\n\r,]{2,80})/i);
            const nominalLabelMatch = replyTxt.match(/Nominal\s*\([Rr][Pp]\)\s*:\s*[Rr][Pp][.\s]*([0-9][0-9.,]+)/i);
            const nominalRpMatch = replyTxt.match(/[Rr][Pp]\.?\s*([0-9][0-9.,]+)/);
            if (catatanMatch && catatanMatch[1] && catatanMatch[1].trim().length > 1) {
              kw = catatanMatch[1].trim();
            } else if (nominalLabelMatch && nominalLabelMatch[1]) {
              kw = nominalLabelMatch[1].replace(/[^0-9]/g, '');
            } else if (nominalRpMatch && nominalRpMatch[1]) {
              kw = nominalRpMatch[1].replace(/[^0-9]/g, '');
            }

            const existingRows = await require('../../infrastructure/Supabase_Finance').readTransactions({ limit: 50 });
            const financeEngineMod = require('../../domain/Finance_Engine');
            const matchIndex = financeEngineMod._findBestTransactionMatch ? financeEngineMod._findBestTransactionMatch(existingRows, kw) : -1;

            if (matchIndex !== -1) {
              const targetTx = existingRows[matchIndex];
              const nomMatch = replyTxt.match(/[Rr][Pp][.\s]*([0-9][0-9.,]+)/);
              const totalNomForSplit = nomMatch ? Number(nomMatch[1].replace(/[^0-9]/g, '')) : Math.abs(targetTx.amount || 0);

              const splitItems = await splitEngine.parseSplitFromText(textInput, totalNomForSplit, targetTx.description || '');
              if (splitItems && splitItems.length >= 2) {
                const baseTx = {
                  type: targetTx.type || 'expense',
                  account: targetTx.accounts?.name || null,
                  dateISO: targetTx.transaction_date,
                  timeHHMM: targetTx.transaction_time ? targetTx.transaction_time.slice(0, 5) : null,
                  paymentMethod: targetTx.payment_method || null,
                };
                domainReply = await splitEngine.handleSplitWithRemainder(String(message.chat.id), splitItems, totalNomForSplit, baseTx, targetTx.description || '', targetTx.id, respondToTelegram);
              }
            }
          } catch (splitErr) {
            console.error('[SPLIT] Error universal priority split existing tx:', splitErr.message);
          }
        }
      }

      // [SPLIT] TITIK 4: Universal text split
      if (routingData.intent === 'FINANCE' && !domainReply && routingData.extracted_data && (
        routingData.extracted_data.is_split === true ||
        require('../../domain/Split_Engine').isSplitIntent(textInput)
      )) {
        const splitEngine = require('../../domain/Split_Engine');
        const ed = routingData.extracted_data;
        const isAiSplit = ed.is_split === true && Array.isArray(ed.items) && ed.items.length >= 2;
        try {
          const nowJakarta = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
          const timeNow = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
          const baseTx = {
            type: ed.type || 'EXPENSE',
            account: ed.account || null,
            dateISO: ed.time ? ed.time.substring(0, 10) : nowJakarta,
            timeHHMM: ed.time ? ed.time.substring(11, 16) : timeNow,
            paymentMethod: ed.payment_method || null,
          };
          const storeName = ed.store_name || ed.destination || '';
          let itemsToSplit = isAiSplit ? ed.items : null;

          if (!itemsToSplit || itemsToSplit.length < 2) {
            itemsToSplit = await splitEngine.parseSplitFromText(textInput, ed.total_nominal || ed.nominal || null, storeName);
          }

          if (itemsToSplit && itemsToSplit.length >= 2) {
            let totalNom = ed.total_nominal || null;
            if (!totalNom) {
              const totMatch = textInput.match(/([0-9]+[.,]?[0-9]*)\s*(?:rb|ribu|k|000)\b/i);
              if (totMatch) {
                let rawNum = parseFloat(totMatch[1].replace(',', '.'));
                totalNom = rawNum < 1000 ? rawNum * 1000 : rawNum;
              } else {
                totalNom = itemsToSplit.reduce((s, i) => s + (i.nominal || 0), 0);
              }
            }
            domainReply = await splitEngine.handleSplitWithRemainder(String(message.chat.id), itemsToSplit, totalNom, baseTx, storeName, null, respondToTelegram);
          }
        } catch (splitErr) {
          console.error('[SPLIT] Error saat universal text split:', splitErr.message);
        }
      }

      // Dispatch single or multi-action
      const dispatchContext = {
        textInput,
        message,
        chatId: String(message.chat.id),
        pendingEmailContext,
        setPendingEmailContext: (ctx) => { pendingEmailContext = ctx; },
        pendingDatabaseContext,
        setPendingDatabaseContext: (ctx) => { pendingDatabaseContext = ctx; },
        setPendingCalendarContext: (ctx) => { pendingCalendarContext = ctx; },
        setPendingConflictEvent: (ctx) => { pendingConflictEvent = ctx; },
        setPendingProactiveTasks: (ctx) => { pendingProactiveTasks = ctx; },
        respondToTelegram
      };

      if (!domainReply) {
        const actionsToExecute = (Array.isArray(routingData.actions) && routingData.actions.length > 0)
          ? routingData.actions
          : [{ intent: routingData.intent, extracted_data: routingData.extracted_data }];

        const collectedReplies = [];

        for (let actIdx = 0; actIdx < actionsToExecute.length; actIdx++) {
          const act = actionsToExecute[actIdx];
          if (act.intent === 'NORMAL_CHAT') continue;

          const actionPayload = {
            ...routingData,
            intent: act.intent,
            extracted_data: act.extracted_data || {}
          };

          const actReply = await intentDispatcher.dispatchSingleIntent(actionPayload, dispatchContext);
          if (actReply && typeof actReply === 'string' && actReply.trim().length > 0) {
            collectedReplies.push(actReply.trim());
          }
        }

        if (collectedReplies.length > 0) {
          domainReply = collectedReplies.join('\n\n━━━━━━━━━━━━━━━━━━━━\n\n');
        }
      }

      // Deliver reply
      let aiDraftReply = routingData.reply_message;
      if (aiDraftReply && typeof aiDraftReply === 'object') {
        aiDraftReply = aiDraftReply.text || aiDraftReply.message || JSON.stringify(aiDraftReply);
      }
      const finalReply = domainReply || aiDraftReply;

      if (finalReply) {
        console.log('[TELEGRAM] Replying with intent:', routingData.intent);
        conversationContext = {
          ...(conversationContext || {}),
          intent: routingData.intent,
          topic: routingData._topicContext || 'DEFAULT',
          injectedTraits: routingData._injectedTraits || [],
          injectedPlaybook: routingData._injectedPlaybook || null,
          lastAssistantReply: finalReply,
          askedAt: Date.now()
        };

        lastTurnMeta = {
          intent: routingData.intent,
          topic: routingData._topicContext || 'DEFAULT',
          injectedTraits: routingData._injectedTraits || [],
          injectedPlaybook: routingData._injectedPlaybook || null,
          reply: finalReply,
          at: Date.now()
        };

        await respondToTelegram(finalReply, false);

        // Post-turn hooks: Signal Detector & Micro-Reviewer
        setImmediate(() => {
          try {
            const signalDetector = require('../../domain/Signal_Detector');
            signalDetector.evaluateTurn({
              userText: textInput,
              assistantReply: finalReply,
              intent: routingData.intent,
              topic: routingData._topicContext || 'DEFAULT',
              injectedTraits: routingData._injectedTraits || [],
              injectedPlaybook: routingData._injectedPlaybook || null,
              previousContext: previousTurnContext,
              sessionKey: `tg:${message.chat?.id || 'default'}`
            }).catch(err => {
              console.warn('[TELEGRAM] Signal Detector background evaluation error:', err.message);
            });

            const microReviewer = require('../../domain/Micro_Reviewer');
            microReviewer.handlePostTurn({
              userText: textInput,
              intent: routingData.intent,
              sessionKey: `tg:${message.chat?.id || 'default'}`
            });
          } catch (hookErr) {
            console.warn('[TELEGRAM] Failed to trigger Signal Detector / Micro-Reviewer hook:', hookErr.message);
          }
        });
      }
    } catch (error) {
      console.error('[TELEGRAM] Error processing message:', error.message);
      webhookReply = `⚠️ N.E.X.A mengalami gangguan internal:\n<code>${escapeHtml(error.message)}</code>\n\nSilakan cek log server di PM2 Dashboard atau jalankan: <code>pm2 logs nexa-server</code>`;
    } finally {
      stopTyping();
      await deliverWebhookReply();
    }
  });
}

module.exports = { handleTelegramWebhook };
