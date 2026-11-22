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

function buildCalendarConflictCard(conflictEvent = {}) {
  const ev = conflictEvent && typeof conflictEvent === 'object' ? conflictEvent : {};
  const summary = String(ev.summary || 'Calendar Event');
  return {
    version: CARD_VERSION,
    card_id: `calconf_${Date.now()}`,
    card_type: 'CALENDAR_CONFLICT',
    presentation: 'CHIPS',
    status: 'PENDING',
    title: 'Calendar Conflict',
    subtitle: summary,
    accent: 'AMBER',
    expires_at: Date.now() + 10 * 60 * 1000,
    expires_label: 'Expires in',
    fields: [],
    meta: {
      summary,
      start: String(ev.start || ''),
      end: String(ev.end || ''),
      description: String(ev.description || ''),
      location: String(ev.location || ''),
      reminder_minutes: Array.isArray(ev.reminder_minutes) ? ev.reminder_minutes : [],
      recurrence: String(ev.recurrence || '')
    },
    actions: [
      { id: 'force_create', label: 'Create Anyway', style: 'PRIMARY' },
      { id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' }
    ]
  };
}

function buildFinanceDeleteCard(delKey = '', txData = {}) {
  const key = String(delKey || Date.now());
  const desc = String(txData && txData.description || 'Transaction');
  return {
    version: CARD_VERSION,
    card_id: `findel_${key}`,
    card_type: 'FINANCE_DELETE',
    presentation: 'CHIPS',
    status: 'PENDING',
    title: 'Confirm Deletion',
    subtitle: desc,
    accent: 'CRIMSON',
    expires_at: Date.now() + 3 * 60 * 1000,
    expires_label: 'Expires in',
    fields: [],
    meta: {
      del_key: key,
      tx_id: String(txData && txData.id || '')
    },
    actions: [
      { id: 'confirm_delete', label: 'Confirm Delete', style: 'DESTRUCTIVE' },
      { id: 'keep', label: 'Keep', style: 'SECONDARY' }
    ]
  };
}

function buildTaskConfirmCard(pendingTask = {}, sessionKey = 'mobile-primary') {
  const taskType = String(pendingTask && pendingTask.type || 'CONFIRM_LIST').toUpperCase();
  const title = String(pendingTask && pendingTask.title || 'New Task');
  const listName = String(pendingTask && pendingTask.listName || 'Tugas Saya');

  let actions;
  if (taskType === 'CONFIRM_SYNC') {
    actions = [
      { id: 'sync_yes', label: 'Sync to Calendar', style: 'PRIMARY' },
      { id: 'sync_no', label: 'Task Only', style: 'SECONDARY' },
      { id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' }
    ];
  } else if (taskType === 'CONFIRM_DURATION') {
    actions = [
      { id: 'dur_15', label: '15m', style: 'SECONDARY' },
      { id: 'dur_30', label: '30m', style: 'PRIMARY' },
      { id: 'dur_60', label: '1h', style: 'SECONDARY' },
      { id: 'dur_120', label: '2h', style: 'SECONDARY' },
      { id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' }
    ];
  } else {
    actions = [
      { id: 'list_yes', label: `Use ${listName}`, style: 'PRIMARY' },
      { id: 'list_default', label: 'Tugas Saya', style: 'SECONDARY' },
      { id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' }
    ];
  }

  return {
    version: CARD_VERSION,
    card_id: `taskconf_${Date.now()}`,
    card_type: 'TASK_CONFIRM',
    presentation: 'CHIPS',
    status: 'PENDING',
    title: 'Confirm Task',
    subtitle: title,
    accent: 'PRIMARY',
    expires_at: Date.now() + 5 * 60 * 1000,
    expires_label: 'Auto-saves in',
    fields: [],
    meta: {
      session_key: String(sessionKey || 'mobile-primary'),
      task_type: taskType,
      title,
      list_name: listName
    },
    actions
  };
}

function buildProactiveTasksCard(proactiveTasks = {}) {
  const summary = String(proactiveTasks && proactiveTasks.summary || 'Upcoming Event');
  const start = String(proactiveTasks && proactiveTasks.start || '');
  const tasks = Array.isArray(proactiveTasks && proactiveTasks.tasks) ? proactiveTasks.tasks : [];
  const targetDue = start ? start.split('T')[0] : '';

  const selectableItems = tasks.map((taskTitle, idx) => ({
    id: `idx_${idx}`,
    label: String(taskTitle || '').trim(),
    meta: targetDue ? `Due ${targetDue}` : 'Prep task',
    selected: true
  })).filter(it => it.label.length > 0);

  return {
    version: CARD_VERSION,
    card_id: `protask_${Date.now()}`,
    card_type: 'PROACTIVE_TASKS',
    presentation: 'INLINE_CARD',
    status: 'PENDING',
    title: 'Suggested Prep Tasks',
    subtitle: summary,
    badge: `${selectableItems.length} tasks`,
    accent: 'PRIMARY',
    expires_at: Date.now() + 15 * 60 * 1000,
    expires_label: 'Expires in',
    selectable_items: selectableItems,
    fields: [],
    meta: {
      summary,
      start,
      tasks: selectableItems.map(it => it.label)
    },
    actions: [
      { id: 'create_selected', label: 'Add Tasks', style: 'PRIMARY', kind: 'MULTI_SELECT_SUBMIT' },
      { id: 'skip', label: 'Skip', style: 'SECONDARY' }
    ]
  };
}

// Optional session cleanup callbacks registered by mobile_bridge/chat_handler.js
const _sessionHooks = {
  clearPendingConflict: null,
  clearPendingProactiveTasks: null
};

function registerSessionHooks(hooks = {}) {
  if (typeof hooks.clearPendingConflict === 'function') {
    _sessionHooks.clearPendingConflict = hooks.clearPendingConflict;
  }
  if (typeof hooks.clearPendingProactiveTasks === 'function') {
    _sessionHooks.clearPendingProactiveTasks = hooks.clearPendingProactiveTasks;
  }
}

async function _handleCalendarConflictAction(cardId, actionId, payload, ws, deps) {
  const googleWorkspace = deps.googleWorkspace || require('../../../infrastructure/Google_Workspace');
  const clearConflict = deps.clearPendingConflict || _sessionHooks.clearPendingConflict;

  if (actionId === 'cancel') {
    if (typeof clearConflict === 'function') clearConflict();
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Cancelled',
      resolved_detail: 'Conflicting event was not created.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'force_create') {
    const summary = String(payload && payload.summary || '').trim();
    const start = String(payload && payload.start || '').trim();
    const end = String(payload && payload.end || '').trim();
    if (!summary || !start || !end) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'EXPIRED',
        resolved_badge: 'Expired',
        resolved_detail: 'Event details are no longer available.'
      }, deps);
      return { ok: false, status: 'EXPIRED' };
    }

    await googleWorkspace.createCalendarEvent(
      summary,
      start,
      end,
      String(payload.description || ''),
      String(payload.location || ''),
      Array.isArray(payload.reminder_minutes) ? payload.reminder_minutes : [],
      String(payload.recurrence || '')
    );
    if (typeof clearConflict === 'function') clearConflict();

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Added to Calendar',
      resolved_detail: `"${summary}" created despite overlap.`
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleFinanceDeleteAction(cardId, actionId, _payload, ws, deps) {
  const financeEngine = deps.financeEngine || require('../../../domain/Finance_Engine');

  if (actionId === 'confirm_delete') {
    const reply = await financeEngine.confirmDeleteTransaction(true);
    if (!reply) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'EXPIRED',
        resolved_badge: 'Expired',
        resolved_detail: 'Deletion request expired or already handled.'
      }, deps);
      return { ok: true, status: 'EXPIRED' };
    }
    const isFailed = reply.includes('❌');
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: isFailed ? 'Delete Failed' : 'Deleted',
      resolved_detail: _cleanSingleLineDetail(reply)
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'keep') {
    await financeEngine.confirmDeleteTransaction(false);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Kept',
      resolved_detail: 'Transaction was kept in your ledger.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleTaskConfirmAction(cardId, actionId, payload, ws, deps) {
  const taskManager = deps.taskManager || require('../../../domain/Task_Manager');
  const googleWorkspace = deps.googleWorkspace || require('../../../infrastructure/Google_Workspace');
  const sessionKey = String(payload && payload.session_key || 'mobile-primary');

  const pendingTask = taskManager.pendingTaskCategories && taskManager.pendingTaskCategories.get(sessionKey);
  if (!pendingTask) {
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'EXPIRED',
      resolved_badge: 'Expired',
      resolved_detail: 'Task confirmation already completed or expired.'
    }, deps);
    return { ok: true, status: 'EXPIRED' };
  }

  if (actionId === 'cancel') {
    taskManager.cancelPendingTask(sessionKey);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Cancelled',
      resolved_detail: `Task "${pendingTask.title || 'New Task'}" was not created.`
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (pendingTask.type === 'CONFIRM_SYNC' && (actionId === 'sync_yes' || actionId === 'sync_no')) {
    const shouldSync = actionId === 'sync_yes';
    if (pendingTask.timerId) clearTimeout(pendingTask.timerId);
    taskManager.pendingTaskCategories.delete(sessionKey);

    const res = await taskManager.handleTaskIntent({
      action: 'CREATE',
      title: pendingTask.title,
      notes: pendingTask.notes,
      due_date: pendingTask.dueDate,
      list_name: pendingTask.listName,
      duration_minutes: pendingTask.durationMins || 60,
      sync_calendar: shouldSync,
      calendar_start_time: null
    }, null);

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: shouldSync ? 'Synced to Calendar' : 'Task Saved',
      resolved_detail: _cleanSingleLineDetail((res && res.message) || `Saved "${pendingTask.title}".`)
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (pendingTask.type === 'CONFIRM_DURATION' && actionId.startsWith('dur_')) {
    const mins = parseInt(actionId.slice(4), 10);
    const durationMins = Number.isFinite(mins) && mins > 0 ? mins : 30;
    pendingTask.durationMins = durationMins;

    if (pendingTask.dueDate && typeof googleWorkspace.findEmptySlot === 'function') {
      try {
        const targetDateMs = new Date(pendingTask.dueDate.split('T')[0] + 'T00:00:00+07:00').getTime();
        const nowMs = Date.now();
        const timeMinIso = new Date(nowMs).toISOString();
        const timeMaxIso = new Date(Math.max(nowMs + 24 * 3600000, targetDateMs + 24 * 3600000 - 1)).toISOString();
        const slot = await googleWorkspace.findEmptySlot(durationMins, timeMinIso, timeMaxIso);
        if (slot && slot.start) {
          pendingTask.dueDate = slot.start;
          const dueMs = new Date(slot.start);
          const h = dueMs.toLocaleString('en-US', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
          const timeLabel = `${h} WIB (Auto-Blocked)`;
          pendingTask.notes = pendingTask.notes ? `⏰ Jam: ${timeLabel}\n${pendingTask.notes}` : `⏰ Jam: ${timeLabel}`;
          pendingTask.hasAutonomousBlock = true;
        }
      } catch (e) {
        console.warn('[BRIDGE-CARD] Task duration findEmptySlot warning:', e.message);
      }
    }

    const resTask = await taskManager.executePendingTask(sessionKey, pendingTask.listName);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: `Scheduled (${durationMins}m)`,
      resolved_detail: _cleanSingleLineDetail((resTask && resTask.message) || `Task saved (${durationMins}m).`)
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'list_yes' || actionId === 'list_default') {
    const overrideList = actionId === 'list_default' ? 'Tugas Saya' : null;
    const targetLabel = overrideList || pendingTask.listName || 'Tugas Saya';
    const resTask = await taskManager.executePendingTask(sessionKey, overrideList);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: `Added to ${targetLabel}`,
      resolved_detail: _cleanSingleLineDetail((resTask && resTask.message) || `Saved to ${targetLabel}.`)
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  return { ok: false, error: 'UNKNOWN_ACTION' };
}

async function _handleProactiveTasksAction(cardId, actionId, payload, ws, deps) {
  const taskManager = deps.taskManager || require('../../../domain/Task_Manager');
  const clearProactive = deps.clearPendingProactiveTasks || _sessionHooks.clearPendingProactiveTasks;

  if (actionId === 'skip') {
    if (typeof clearProactive === 'function') clearProactive();
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Skipped',
      resolved_detail: 'Suggested prep tasks were skipped.'
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'create_selected') {
    const selectedIds = Array.isArray(payload && payload.selected_ids) ? payload.selected_ids : [];
    const allTasks = Array.isArray(payload && payload.tasks) ? payload.tasks : [];
    const summary = String(payload && payload.summary || 'Agenda');
    const start = String(payload && payload.start || '');
    const targetDue = start ? start.split('T')[0] : new Date(Date.now() + 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

    const chosenTitles = [];
    for (const id of selectedIds) {
      const m = String(id).match(/^idx_(\d+)$/);
      if (m) {
        const idx = parseInt(m[1], 10);
        if (allTasks[idx]) chosenTitles.push(allTasks[idx]);
      }
    }

    if (chosenTitles.length === 0) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'PENDING',
        error: 'Select at least one task or tap Skip.'
      }, deps);
      return { ok: false, error: 'NO_TASKS_SELECTED' };
    }

    for (const taskTitle of chosenTitles) {
      await taskManager.handleTaskIntent({
        action: 'CREATE',
        title: taskTitle,
        due_date: targetDue,
        notes: `Tugas persiapan proaktif untuk agenda: ${summary}`,
        sync_calendar: false,
        calendar_start_time: null
      }, 'mobile-primary');
    }

    if (typeof clearProactive === 'function') clearProactive();

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: `Added ${chosenTitles.length} Task${chosenTitles.length > 1 ? 's' : ''}`,
      resolved_detail: chosenTitles.join(' · ').slice(0, 160)
    }, deps);
    return { ok: true, status: 'RESOLVED', createdCount: chosenTitles.length };
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
      case 'CALENDAR_CONFLICT':
        return await _handleCalendarConflictAction(cardId, actionId, payload, ws, deps);
      case 'FINANCE_DELETE':
        return await _handleFinanceDeleteAction(cardId, actionId, payload, ws, deps);
      case 'TASK_CONFIRM':
        return await _handleTaskConfirmAction(cardId, actionId, payload, ws, deps);
      case 'PROACTIVE_TASKS':
        return await _handleProactiveTasksAction(cardId, actionId, payload, ws, deps);
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
  buildCalendarConflictCard,
  buildFinanceDeleteCard,
  buildTaskConfirmCard,
  buildProactiveTasksCard,
  registerSessionHooks,
  handleCardAction
};
