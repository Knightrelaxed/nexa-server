'use strict';
// ============================================================
// N.E.X.A - MOBILE BRIDGE INTERACTIVE CARD ENGINE
// Unified native card builders and CARD_ACTION -> CARD_UPDATE
// dispatcher for N.E.X.A Mobile Bridge (Phase 1):
//   1. FINANCE_TX         (Confirm, Change Category, Quick Edit, Cancel)
//   2. RECURRING_BILL     (Approve, Reject)
//   3. IDENTITY_PROPOSAL  (Approve & Commit, Reject + optional reason)
//   4. MEMORY_HYGIENE     (Archive Selected, Archive All, Keep All)
//   5. DISCIPLINE_CHECK   (Valid Research, +10 Min, Lock Focus)
// ============================================================

const CARD_VERSION = 1;

function formatIdr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount || 'Rp 0');
  return `Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
}

function buildFinanceTxCard(tx = {}, compositeKey = '', opts = {}) {
  const key = String(compositeKey || tx.compositeKey || '').trim();
  const cardId = `fin_${key || Date.now()}`;
  const isTransfer = Boolean(tx.isSelfTransfer || String(tx.type || '').toUpperCase() === 'TRANSFER');
  const isIncome = !isTransfer && String(tx.type || '').toUpperCase() === 'INCOME';
  const heroPrefix = isTransfer ? '' : (isIncome ? '+' : '-');
  const heroTone = isTransfer ? 'TRANSFER' : (isIncome ? 'INCOME' : 'EXPENSE');
  const heroValue = `${heroPrefix}${formatIdr(tx.nominal)}`;

  const account = isTransfer
    ? `${tx.fromAccount || 'Source'} -> ${tx.account || tx.suggestedAccount || 'Target'}`
    : (tx.account || tx.suggestedAccount || 'Unassigned');
  const paymentMethod = tx.payment_method || tx.paymentMethod || '';
  const subtitleParts = [account, paymentMethod].filter(Boolean);
  const noteRaw = String(tx.description || '').trim();
  const cleanNote = (!noteRaw || noteRaw === '[Menunggu Detail User]') ? 'Pending note' : noteRaw;
  const category = String(tx.category || 'Lainnya').trim();

  const fields = [
    { key: 'merchant', label: isTransfer ? 'Route' : 'Merchant', value: String(tx.destination || account || '-') },
    { key: 'category', label: 'Category', value: category },
    { key: 'account', label: 'Account', value: account },
    { key: 'note', label: 'Note', value: cleanNote }
  ];

  const categories = Array.isArray(opts.categories)
    ? opts.categories.map(c => (typeof c === 'string' ? c : c && c.name)).filter(Boolean)
    : [];

  const expiresAtMs = Number(opts.expiresAtMs) > 0
    ? Number(opts.expiresAtMs)
    : (Date.now() + 5 * 60 * 1000);

  return {
    version: CARD_VERSION,
    card_id: cardId,
    card_type: 'FINANCE_TX',
    status: 'PENDING',
    title: isTransfer ? 'Self-Transfer Detected' : 'New Transaction Detected',
    subtitle: subtitleParts.join(' · ') || 'Finance Auto-Sync',
    badge: isTransfer ? 'Transfer' : (isIncome ? 'Income' : 'Expense'),
    accent: isIncome ? 'EMERALD' : (isTransfer ? 'PRIMARY' : 'AMBER'),
    hero_value: heroValue,
    hero_tone: heroTone,
    expires_at: expiresAtMs,
    expires_label: 'Auto-saves in',
    fields,
    categories,
    meta: {
      composite_key: key,
      nominal: Number(tx.nominal) || 0,
      note: noteRaw === '[Menunggu Detail User]' ? '' : noteRaw,
      category
    },
    actions: [
      { id: 'confirm', label: 'Confirm', style: 'PRIMARY' },
      { id: 'category', label: 'Category', style: 'SECONDARY', kind: 'PICK_CATEGORY' },
      { id: 'edit', label: 'Edit', style: 'SECONDARY', kind: 'EDIT_FINANCE' },
      { id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' }
    ]
  };
}

function buildRecurringBillCard(candidate = {}) {
  const ruleId = String(candidate.id || '').trim();
  const merchant = String(candidate.display_name || candidate.merchant_key || 'Unknown Merchant');
  const cadence = String(candidate.cadence || 'MONTHLY');
  const amount = formatIdr(candidate.amount_median || 0);

  return {
    version: CARD_VERSION,
    card_id: `rec_${ruleId || Date.now()}`,
    card_type: 'RECURRING_BILL',
    status: 'PENDING',
    title: 'Recurring Bill Detected',
    subtitle: `${cadence} pattern`,
    badge: 'Review',
    accent: 'PRIMARY',
    hero_value: amount,
    hero_tone: 'EXPENSE',
    fields: [
      { key: 'merchant', label: 'Merchant', value: merchant },
      { key: 'cadence', label: 'Frequency', value: cadence },
      { key: 'estimate', label: 'Estimated', value: amount }
    ],
    meta: { rule_id: ruleId },
    actions: [
      { id: 'approve', label: 'Approve', style: 'PRIMARY' },
      { id: 'reject', label: 'Reject', style: 'DESTRUCTIVE' }
    ]
  };
}

function buildIdentityProposalCard(proposal = {}) {
  const proposalId = String(proposal.id || '').trim();
  const layer = String(proposal.layer || 'FACTS').toUpperCase();
  const traitKey = String(proposal.trait_key || 'trait');
  const confidencePct = Math.max(0, Math.min(100, Math.round((parseFloat(proposal.confidence) || 0) * 100)));
  const isUpdate = Boolean(proposal.old_value);

  return {
    version: CARD_VERSION,
    card_id: `idprop_${proposalId || Date.now()}`,
    card_type: 'IDENTITY_PROPOSAL',
    status: 'PENDING',
    title: isUpdate ? 'Identity Model Revision' : 'New Identity Proposal',
    subtitle: `${layer} · ${traitKey}`,
    badge: `${confidencePct}% match`,
    accent: 'PRIMARY',
    confidence: confidencePct,
    diff: {
      old_value: isUpdate ? String(proposal.old_value) : '',
      new_value: String(proposal.proposed_value || '')
    },
    fields: [
      { key: 'reasoning', label: 'Observation', value: String(proposal.reasoning || 'Weekly behavioral pattern') }
    ],
    meta: { proposal_id: proposalId },
    actions: [
      { id: 'approve', label: 'Approve & Commit', style: 'PRIMARY' },
      { id: 'reject', label: 'Reject', style: 'DESTRUCTIVE', kind: 'REJECT_WITH_REASON' }
    ]
  };
}

function buildMemoryHygieneCard(allStaged = [], stats = {}) {
  const now = Date.now();
  const items = (Array.isArray(allStaged) ? allStaged : []).map((row) => {
    const table = String(row.table || 'USER_PROFILE').toUpperCase();
    const daysSince = row.last_reinforced_at
      ? Math.max(1, Math.round((now - new Date(row.last_reinforced_at).getTime()) / (1000 * 60 * 60 * 24)))
      : null;
    return {
      id: `${table}:${row.id}`,
      label: String(row.content || '').trim().slice(0, 140),
      meta: daysSince !== null ? `${daysSince}d ago` : 'Stale',
      selected: true
    };
  });

  const totalAutoArchived = (Number(stats.ephemeralArchived) || 0) + (Number(stats.decayAutoArchived) || 0);
  const summaryParts = [];
  if (totalAutoArchived > 0) summaryParts.push(`${totalAutoArchived} auto-archived`);
  if (Number(stats.merged) > 0) summaryParts.push(`${stats.merged} merged`);

  return {
    version: CARD_VERSION,
    card_id: `hygiene_${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })}_${Date.now()}`,
    card_type: 'MEMORY_HYGIENE',
    status: 'PENDING',
    title: 'Memory Hygiene Review',
    subtitle: summaryParts.length > 0 ? summaryParts.join(' · ') : `${items.length} fading facts need review`,
    badge: `${items.length} items`,
    accent: 'AMBER',
    selectable_items: items,
    fields: [],
    actions: [
      { id: 'archive_selected', label: 'Archive Selected', style: 'PRIMARY', kind: 'MULTI_SELECT_SUBMIT' },
      { id: 'archive_all', label: 'Archive All', style: 'SECONDARY' },
      { id: 'hold_all', label: 'Keep All', style: 'DESTRUCTIVE' }
    ]
  };
}

function buildDisciplineCheckCard({
  sessionKey = '',
  appName = 'App',
  messageTone = 'firm',
  usedCount = 0,
  maxExtensions = 2,
  expiresAtMs = 0
} = {}) {
  const remainingExt = Math.max(0, maxExtensions - (Number(usedCount) || 0));
  const actions = [
    { id: 'valid_research', label: 'Valid Research', style: 'PRIMARY' }
  ];
  if (remainingExt > 0) {
    actions.push({ id: 'extend_10m', label: `+10 Min (${remainingExt} left)`, style: 'SECONDARY' });
  }
  actions.push({ id: 'lock_focus', label: 'Lock Focus', style: 'DESTRUCTIVE' });

  return {
    version: CARD_VERSION,
    card_id: `disc_${sessionKey || Date.now()}`,
    card_type: 'DISCIPLINE_CHECK',
    status: 'PENDING',
    title: 'Focus Accountability Check',
    subtitle: `${appName} · Level 2`,
    badge: 'Check-in',
    accent: 'AMBER',
    expires_at: Number(expiresAtMs) > 0 ? Number(expiresAtMs) : 0,
    expires_label: 'Escalates in',
    fields: [
      { key: 'app', label: 'Active App', value: String(appName || 'App') },
      { key: 'tone', label: 'Mode', value: String(messageTone || 'firm') }
    ],
    meta: { session_key: String(sessionKey || '') },
    actions
  };
}

function _sendCardUpdate(ws, frame, deps = {}) {
  const out = { type: 'CARD_UPDATE', ts: Date.now(), ...frame };
  if (typeof deps.sendFrame === 'function') {
    deps.sendFrame(out);
    return;
  }
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(out));
      return;
    } catch (err) {
      console.warn('[BRIDGE-CARD] Direct ws send failed:', err.message);
    }
  }
  try {
    const mobileClient = require('./client');
    if (typeof mobileClient.sendCardUpdate === 'function') {
      mobileClient.sendCardUpdate(out);
    }
  } catch (_) {}
}

function _extractCompositeKey(cardId, payload = {}) {
  if (payload && payload.composite_key) return String(payload.composite_key);
  if (typeof cardId === 'string' && cardId.startsWith('fin_')) return cardId.slice(4);
  return '';
}

function _extractNumericId(cardId, prefix, payloadField, payload = {}) {
  if (payload && payload[payloadField] !== undefined && payload[payloadField] !== null) {
    return String(payload[payloadField]);
  }
  if (typeof cardId === 'string' && cardId.startsWith(prefix)) {
    return cardId.slice(prefix.length);
  }
  return '';
}

async function _handleFinanceCardAction(cardId, actionId, payload, ws, deps) {
  const financeConfirm = deps.financeConfirmations || require('../../../domain/finance/Finance_Confirmations');
  const supabaseFinance = deps.supabaseFinance || require('../../../infrastructure/Supabase_Finance');
  const compositeKey = _extractCompositeKey(cardId, payload);

  if (!compositeKey) {
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      error: 'Missing transaction reference.'
    }, deps);
    return { ok: false, error: 'MISSING_KEY' };
  }

  if (actionId === 'confirm') {
    const reply = await financeConfirm.confirmPendingTransactions(true, null, null, null, null, compositeKey);
    const notFound = !reply;
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: notFound ? 'Already Resolved' : 'Recorded',
      resolved_detail: notFound
        ? 'This transaction was already saved or expired.'
        : _cleanSingleLineDetail(reply)
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'cancel') {
    const reply = await financeConfirm.confirmPendingTransactions(false, null, null, null, null, compositeKey);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Cancelled',
      resolved_detail: reply ? _cleanSingleLineDetail(reply) : 'Transaction discarded.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'update_category' || actionId === 'update_fields') {
    const newCat = payload && payload.category ? String(payload.category).trim() : null;
    const newNote = payload && typeof payload.note === 'string' ? payload.note.trim() : null;
    const newNominal = payload && payload.nominal !== undefined && payload.nominal !== null && String(payload.nominal).trim() !== ''
      ? payload.nominal
      : null;

    const updatedReply = await financeConfirm.updatePendingTransaction(
      newNote || null,
      newCat || null,
      newNominal,
      null,
      null,
      compositeKey
    );

    if (!updatedReply) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'EXPIRED',
        resolved_badge: 'Expired',
        resolved_detail: 'Pending transaction already saved or expired.'
      }, deps);
      return { ok: false, status: 'EXPIRED' };
    }

    const updatedTx = typeof financeConfirm.getPendingTransactionByKey === 'function'
      ? financeConfirm.getPendingTransactionByKey(compositeKey)
      : null;

    let categories = [];
    try {
      categories = await supabaseFinance.getCategoriesList();
    } catch (_) {}

    const refreshedCard = updatedTx
      ? buildFinanceTxCard(updatedTx.tx, compositeKey, {
          categories,
          expiresAtMs: updatedTx.expiresAtMs || (Date.now() + 4 * 60 * 1000)
        })
      : null;

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      updated_card: refreshedCard,
      resolved_detail: newCat ? `Category updated to ${newCat}` : 'Transaction details updated.'
    }, deps);
    return { ok: true, status: 'PENDING' };
  }

  _sendCardUpdate(ws, { card_id: cardId, status: 'PENDING', error: `Unknown action: ${actionId}` }, deps);
  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleRecurringBillAction(cardId, actionId, payload, ws, deps) {
  const supabaseFinance = deps.supabaseFinance || require('../../../infrastructure/Supabase_Finance');
  const ruleId = _extractNumericId(cardId, 'rec_', 'rule_id', payload);
  const isApprove = actionId === 'approve';
  const newStatus = isApprove ? 'ACTIVE' : 'REJECTED';

  const ok = await supabaseFinance.updateRecurringRuleStatus(ruleId, newStatus);
  if (!ok) {
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      error: 'Failed to update recurring bill rule.'
    }, deps);
    return { ok: false };
  }

  _sendCardUpdate(ws, {
    card_id: cardId,
    status: 'RESOLVED',
    resolved_badge: isApprove ? 'Approved' : 'Rejected',
    resolved_detail: isApprove
      ? 'Active recurring rule added to bill projections.'
      : 'Recurring rule rejected and disabled.'
  }, deps);
  return { ok: true, status: 'RESOLVED' };
}

async function _handleIdentityProposalAction(cardId, actionId, payload, ws, deps) {
  const supabaseMemories = deps.supabaseMemories || require('../../../infrastructure/Supabase_Memories');
  const aiRouter = deps.aiRouter || require('../../../core/AI_Router');
  const proposalId = parseInt(_extractNumericId(cardId, 'idprop_', 'proposal_id', payload), 10);

  if (!Number.isFinite(proposalId)) {
    _sendCardUpdate(ws, { card_id: cardId, status: 'PENDING', error: 'Invalid proposal ID.' }, deps);
    return { ok: false };
  }

  if (actionId === 'approve') {
    const result = await supabaseMemories.approveIdentityProposal(proposalId).catch(e => ({
      success: false,
      error: e.message
    }));
    if (result && result.success) {
      if (typeof aiRouter.invalidatePersonalFactsCache === 'function') aiRouter.invalidatePersonalFactsCache();
      if (typeof aiRouter.invalidateIdentityModelCache === 'function') aiRouter.invalidateIdentityModelCache();
      const row = result.identityRow;
      const detail = row ? `Committed: ${row.layer} -> ${row.trait_value}` : `Proposal #${proposalId} committed.`;
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'RESOLVED',
        resolved_badge: 'Committed',
        resolved_detail: detail
      }, deps);
      return { ok: true, status: 'RESOLVED' };
    }
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      error: (result && result.error) || 'Failed to commit identity proposal.'
    }, deps);
    return { ok: false };
  }

  if (actionId === 'reject') {
    const reason = payload && typeof payload.reason === 'string' && payload.reason.trim()
      ? payload.reason.trim().slice(0, 300)
      : null;
    await supabaseMemories.rejectIdentityProposal(proposalId, reason).catch(() => {});
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Rejected',
      resolved_detail: reason
        ? `Proposal rejected. Note recorded: "${reason}"`
        : 'Proposal rejected and skipped.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleMemoryHygieneAction(cardId, actionId, payload, ws, deps) {
  const supabaseMemories = deps.supabaseMemories || require('../../../infrastructure/Supabase_Memories');
  const aiRouter = deps.aiRouter || require('../../../core/AI_Router');

  if (actionId === 'archive_all') {
    const staged = await supabaseMemories.getStagedForPruning();
    const upIds = (staged.userProfile || []).map(r => r.id);
    const ciIds = (staged.coreIdentity || []).map(r => r.id);
    let totalArchived = 0;

    if (upIds.length > 0) {
      const res = await supabaseMemories.bulkArchiveMemories(upIds, 'USER_PROFILE');
      totalArchived += Number(res && res.archived) || 0;
    }
    if (ciIds.length > 0) {
      const res = await supabaseMemories.bulkArchiveMemories(ciIds, 'CORE_IDENTITY');
      totalArchived += Number(res && res.archived) || 0;
    }
    if (typeof aiRouter.invalidatePersonalFactsCache === 'function') {
      aiRouter.invalidatePersonalFactsCache();
    }

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: `Archived ${totalArchived}`,
      resolved_detail: `${totalArchived} fading fact(s) moved to archive.`
    }, deps);
    return { ok: true, status: 'RESOLVED', totalArchived };
  }

  if (actionId === 'hold_all') {
    const sb = supabaseMemories.supabase;
    if (sb) {
      await sb.from('nexa_user_profile').update({ status: 'ACTIVE' }).eq('status', 'STAGED_FOR_PRUNING');
      await sb.from('nexa_core_identity').update({ status: 'ACTIVE' }).eq('status', 'STAGED_FOR_PRUNING');
    }
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Kept All',
      resolved_detail: 'All staged facts restored to Active status.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'archive_selected') {
    const selectedRaw = Array.isArray(payload && payload.selected_ids) ? payload.selected_ids : [];
    const selectedSet = new Set(selectedRaw.map(s => String(s)));
    const staged = await supabaseMemories.getStagedForPruning();

    const upArchive = [];
    const upKeep = [];
    for (const r of (staged.userProfile || [])) {
      if (selectedSet.has(`USER_PROFILE:${r.id}`)) upArchive.push(r.id);
      else upKeep.push(r.id);
    }

    const ciArchive = [];
    const ciKeep = [];
    for (const r of (staged.coreIdentity || [])) {
      if (selectedSet.has(`CORE_IDENTITY:${r.id}`)) ciArchive.push(r.id);
      else ciKeep.push(r.id);
    }

    let totalArchived = 0;
    if (upArchive.length > 0) {
      const res = await supabaseMemories.bulkArchiveMemories(upArchive, 'USER_PROFILE');
      totalArchived += Number(res && res.archived) || 0;
    }
    if (ciArchive.length > 0) {
      const res = await supabaseMemories.bulkArchiveMemories(ciArchive, 'CORE_IDENTITY');
      totalArchived += Number(res && res.archived) || 0;
    }

    const sb = supabaseMemories.supabase;
    if (sb) {
      if (upKeep.length > 0) {
        await sb.from('nexa_user_profile').update({ status: 'ACTIVE' }).in('id', upKeep);
      }
      if (ciKeep.length > 0) {
        await sb.from('nexa_core_identity').update({ status: 'ACTIVE' }).in('id', ciKeep);
      }
    }
    if (typeof aiRouter.invalidatePersonalFactsCache === 'function') {
      aiRouter.invalidatePersonalFactsCache();
    }

    const keptTotal = upKeep.length + ciKeep.length;
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: `Archived ${totalArchived}`,
      resolved_detail: `Archived ${totalArchived} fact(s) · Kept ${keptTotal} active.`
    }, deps);
    return { ok: true, status: 'RESOLVED', totalArchived, keptTotal };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleDisciplineCardAction(cardId, actionId, payload, ws, deps) {
  const supabaseMemories = deps.supabaseMemories || require('../../../infrastructure/Supabase_Memories');
  const godMode = deps.godMode || require('../../../domain/Discipline_GodMode');
  const sb = supabaseMemories.supabase;
  const sessionKey = _extractNumericId(cardId, 'disc_', 'session_key', payload);

  if (!sb || !sessionKey) {
    _sendCardUpdate(ws, { card_id: cardId, status: 'PENDING', error: 'Discipline session unavailable.' }, deps);
    return { ok: false };
  }

  const { data: session } = await sb
    .from('nexa_discipline_state')
    .select('*')
    .eq('session_key', sessionKey)
    .maybeSingle();

  if (!session || !session.pending_callback) {
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'EXPIRED',
      resolved_badge: 'Expired',
      resolved_detail: 'This check-in session is no longer active.'
    }, deps);
    return { ok: true, status: 'EXPIRED' };
  }

  if (actionId === 'valid_research') {
    await sb.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level: 0
    }).eq('session_key', sessionKey);

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Valid Research',
      resolved_detail: 'Logged as a valid research session.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'lock_focus') {
    await sb.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level: 3
    }).eq('session_key', sessionKey);

    await godMode.triggerGodMode(3, {
      violation_app: session.app_name,
      message_tone: session.message_tone,
      session_key: sessionKey
    });

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Focus Locked',
      resolved_detail: 'Level 3 focus enforcement activated.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'extend_10m') {
    const usedCount = Number(session.ten_min_used_count) || 0;
    if (usedCount >= 2) {
      await sb.from('nexa_discipline_state').update({
        pending_callback: false,
        current_level: 3
      }).eq('session_key', sessionKey);

      await godMode.triggerGodMode(3, {
        violation_app: session.app_name,
        message_tone: session.message_tone,
        session_key: sessionKey
      });

      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'RESOLVED',
        resolved_badge: 'Limit Reached',
        resolved_detail: 'Daily +10m limit used (2/2). Level 3 activated.'
      }, deps);
      return { ok: true, status: 'RESOLVED' };
    }

    const newUsedCount = usedCount + 1;
    const extensionUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await sb.from('nexa_discipline_state').update({
      pending_callback: false,
      current_level: 1,
      extension_until: extensionUntil,
      ten_min_used_count: newUsedCount
    }).eq('session_key', sessionKey);

    const remaining = 2 - newUsedCount;
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: '+10 Min Granted',
      resolved_detail: `10-minute grace window active (${remaining} left today).`
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

function _cleanSingleLineDetail(htmlText) {
  return String(htmlText || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

/**
 * Master dispatcher for incoming Mobile Bridge CARD_ACTION frames.
 */
async function handleCardAction(frame, ws, deps = {}) {
  const cardId = String(frame && frame.card_id || '').trim();
  const cardType = String(frame && frame.card_type || '').trim().toUpperCase();
  const actionId = String(frame && frame.action_id || '').trim().toLowerCase();
  const payload = (frame && frame.payload && typeof frame.payload === 'object') ? frame.payload : {};

  if (!cardId || !cardType || !actionId) {
    _sendCardUpdate(ws, {
      card_id: cardId || 'unknown',
      status: 'PENDING',
      error: 'Invalid card action payload.'
    }, deps);
    return { ok: false, error: 'INVALID_PAYLOAD' };
  }

  // Mark Notifier engagement on every native card interaction
  try {
    const notifierMod = deps.notifier || require('../../../core/Notifier').getNotifier();
    if (notifierMod && typeof notifierMod.markEngaged === 'function') {
      Promise.resolve(notifierMod.markEngaged('BUTTON_TAP')).catch(() => {});
    }
  } catch (_) {}

  try {
    switch (cardType) {
      case 'FINANCE_TX':
        return await _handleFinanceCardAction(cardId, actionId, payload, ws, deps);
      case 'RECURRING_BILL':
        return await _handleRecurringBillAction(cardId, actionId, payload, ws, deps);
      case 'IDENTITY_PROPOSAL':
        return await _handleIdentityProposalAction(cardId, actionId, payload, ws, deps);
      case 'MEMORY_HYGIENE':
        return await _handleMemoryHygieneAction(cardId, actionId, payload, ws, deps);
      case 'DISCIPLINE_CHECK':
        return await _handleDisciplineCardAction(cardId, actionId, payload, ws, deps);
      default:
        _sendCardUpdate(ws, {
          card_id: cardId,
          status: 'PENDING',
          error: `Unsupported card type: ${cardType}`
        }, deps);
        return { ok: false, error: 'UNSUPPORTED_CARD_TYPE' };
    }
  } catch (err) {
    console.error(`[BRIDGE-CARD] Action error (${cardType}/${actionId}):`, err.message);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      error: 'Action failed on server. Please try again.'
    }, deps);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  CARD_VERSION,
  buildFinanceTxCard,
  buildRecurringBillCard,
  buildIdentityProposalCard,
  buildMemoryHygieneCard,
  buildDisciplineCheckCard,
  handleCardAction
};
