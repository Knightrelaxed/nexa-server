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

const STANDARD_PAYMENT_METHODS = ['QRIS', 'Direct Debit', 'Transfer bank', 'Kartu Kredit', 'Tunai'];

function _formatTxTimeWib(rawTime) {
  const d = rawTime ? new Date(rawTime) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  const datePart = safe.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short'
  });
  const timePart = safe.toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).replace('.', ':');
  return `${datePart} · ${timePart} WIB`;
}

function buildFinanceTxCard(tx = {}, compositeKey = '', opts = {}) {
  const key = String(compositeKey || tx.compositeKey || '').trim();
  const cardId = `fin_${key || Date.now()}`;
  const isTransfer = Boolean(tx.isSelfTransfer || String(tx.type || '').toUpperCase() === 'TRANSFER');
  const isIncome = !isTransfer && String(tx.type || '').toUpperCase() === 'INCOME';
  const heroPrefix = isTransfer ? '' : (isIncome ? '+' : '-');
  const heroTone = isTransfer ? 'TRANSFER' : (isIncome ? 'INCOME' : 'EXPENSE');
  const heroValue = `${heroPrefix}${formatIdr(tx.nominal)}`;

  const rawAccount = isTransfer
    ? `${tx.fromAccount || 'Source'} -> ${tx.account || tx.suggestedAccount || 'Target'}`
    : String(tx.account || tx.suggestedAccount || '').trim();
  const hasAccount = isTransfer || (rawAccount.length > 0 && !/^(unassigned|belum dipilih|-)$/i.test(rawAccount));
  const accountDisplay = hasAccount ? rawAccount : 'Not selected';

  const rawPaymentMethod = String(tx.payment_method || tx.paymentMethod || '').trim();
  const hasPaymentMethod = rawPaymentMethod.length > 0 && rawPaymentMethod !== '-';
  const paymentMethodDisplay = hasPaymentMethod ? rawPaymentMethod : 'Not selected';

  const subtitleParts = [];
  if (hasAccount) subtitleParts.push(accountDisplay);
  if (hasPaymentMethod) subtitleParts.push(paymentMethodDisplay);

  const noteRaw = String(tx.description || '').trim();
  const isMissingNote = !noteRaw || noteRaw === '[Menunggu Detail User]' || noteRaw === '-';
  const cleanNote = isMissingNote ? 'Pending note' : noteRaw;
  const category = String(tx.category || 'Lainnya').trim();
  const timeDisplay = _formatTxTimeWib(tx.time);

  const destRaw = String(tx.destination || '').trim();
  const hasKnownDest = isTransfer || (destRaw.length > 0 && !/^(unknown|-)$/i.test(destRaw));

  const fields = [
    { key: 'time', label: 'Time', value: timeDisplay }
  ];
  if (hasKnownDest) {
    fields.push({ key: 'merchant', label: isTransfer ? 'Route' : 'Merchant', value: isTransfer ? accountDisplay : destRaw });
  }
  fields.push({ key: 'category', label: 'Category', value: category });
  if (!isTransfer) {
    fields.push({ key: 'account', label: 'Account', value: accountDisplay, tone: hasAccount ? 'NEUTRAL' : 'AMBER' });
    fields.push({ key: 'payment_method', label: 'Method', value: paymentMethodDisplay, tone: hasPaymentMethod ? 'NEUTRAL' : 'AMBER' });
  }
  fields.push({ key: 'note', label: 'Note', value: cleanNote, tone: isMissingNote ? 'AMBER' : 'NEUTRAL' });

  const adminFeeNum = Number(tx.adminFee || tx.admin_fee || 0);
  if (Number.isFinite(adminFeeNum) && adminFeeNum > 0) {
    fields.push({ key: 'admin_fee', label: 'Admin Fee', value: formatIdr(adminFeeNum) });
  }

  const awaitingAccount = !isTransfer && !tx.isAutoSyncEmail && !hasAccount;

  // Telegram-parity proactive question when key details (note, account, or payment method) are missing
  let promptText = '';
  if (!isTransfer) {
    if (awaitingAccount && !hasPaymentMethod) {
      promptText = 'Akun bank/dompet dan metode pembayarannya belum dipilih. Auto-save ditahan sampai akun dipilih - tap Set Account di bawah atau balas lewat suara/teks.';
    } else if (awaitingAccount) {
      promptText = 'Akun bank/dompet belum dipilih. Auto-save ditahan sampai akun dipilih - tap Set Account di bawah atau balas lewat suara/teks.';
    } else if (isMissingNote) {
      promptText = isIncome
        ? 'Dana masuk ini dalam rangka apa, Tuan? Balas lewat suara/teks atau tap Edit untuk melengkapi.'
        : 'Pengeluaran ini untuk keperluan apa, Tuan? Balas lewat suara/teks atau tap Edit untuk melengkapi.';
    } else if (!hasPaymentMethod) {
      promptText = 'Satu hal lagi Tuan, metode pembayarannya apa? (QRIS/Direct Debit/Transfer/Tunai). Pilih Method di bawah atau balas lewat suara/teks.';
    }
  }

  const categories = Array.isArray(opts.categories)
    ? opts.categories.map(c => (typeof c === 'string' ? c : c && c.name)).filter(Boolean)
    : [];
  const accounts = Array.isArray(opts.accounts)
    ? opts.accounts.map(a => (typeof a === 'string' ? a : a && a.name)).filter(Boolean)
    : [];
  const paymentMethods = Array.isArray(opts.paymentMethods) && opts.paymentMethods.length > 0
    ? opts.paymentMethods
    : STANDARD_PAYMENT_METHODS;

  // Never show an auto-save countdown when awaiting required account selection
  const expiresAtMs = awaitingAccount
    ? 0
    : (Number(opts.expiresAtMs) > 0 ? Number(opts.expiresAtMs) : (Date.now() + 5 * 60 * 1000));

  const actions = [
    { id: 'confirm', label: 'Confirm', style: awaitingAccount ? 'SECONDARY' : 'PRIMARY' }
  ];
  if (!isTransfer) {
    actions.push({ id: 'account', label: hasAccount ? 'Account' : 'Set Account', style: awaitingAccount ? 'PRIMARY' : 'SECONDARY', kind: 'PICK_ACCOUNT' });
    actions.push({ id: 'payment_method', label: hasPaymentMethod ? 'Method' : 'Set Method', style: 'SECONDARY', kind: 'PICK_METHOD' });
  }
  actions.push({ id: 'category', label: 'Category', style: 'SECONDARY', kind: 'PICK_CATEGORY' });
  actions.push({ id: 'edit', label: 'Edit', style: 'SECONDARY', kind: 'EDIT_FINANCE' });
  actions.push({ id: 'cancel', label: 'Cancel', style: 'DESTRUCTIVE' });

  return {
    version: CARD_VERSION,
    card_id: cardId,
    card_type: 'FINANCE_TX',
    status: 'PENDING',
    title: isTransfer ? 'Self-Transfer Detected' : 'New Transaction Detected',
    subtitle: subtitleParts.join(' · ') || (awaitingAccount ? 'Waiting for account · Auto-save paused' : (isMissingNote || !hasPaymentMethod ? 'Details needed' : 'Ready to record')),
    badge: isTransfer ? 'Transfer' : (isIncome ? 'Income' : 'Expense'),
    accent: isIncome ? 'EMERALD' : (isTransfer ? 'PRIMARY' : 'AMBER'),
    hero_value: heroValue,
    hero_tone: heroTone,
    expires_at: expiresAtMs,
    expires_label: awaitingAccount ? '' : 'Auto-saves in',
    prompt_text: promptText,
    fields,
    categories,
    accounts,
    payment_methods: paymentMethods,
    meta: {
      composite_key: key,
      nominal: Number(tx.nominal) || 0,
      note: isMissingNote ? '' : noteRaw,
      category,
      account: hasAccount ? accountDisplay : '',
      payment_method: hasPaymentMethod ? paymentMethodDisplay : '',
      time_display: timeDisplay
    },
    actions
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
    const pendingEntry = typeof financeConfirm.getPendingTransactionByKey === 'function'
      ? financeConfirm.getPendingTransactionByKey(compositeKey)
      : null;
    const txToCheck = pendingEntry && pendingEntry.tx;
    if (txToCheck && !txToCheck.isAutoSyncEmail) {
      const rawAcc = String(txToCheck.account || txToCheck.suggestedAccount || '').trim();
      const missingAcc = txToCheck.isSelfTransfer
        ? (!txToCheck.fromAccount || !rawAcc)
        : (!rawAcc || /^(unassigned|belum dipilih|-)$/i.test(rawAcc));
      if (missingAcc) {
        _sendCardUpdate(ws, {
          card_id: cardId,
          status: 'PENDING',
          error: 'Please select an account first before confirming.'
        }, deps);
        return { ok: false, error: 'ACCOUNT_REQUIRED' };
      }
    }

    const reply = await financeConfirm.confirmPendingTransactions(true, null, null, null, null, compositeKey);
    const notFound = !reply;
    let detailSummary = '';
    if (notFound) {
      detailSummary = 'Already saved or expired.';
    } else if (txToCheck) {
      const parts = [
        txToCheck.account || txToCheck.suggestedAccount || '',
        txToCheck.payment_method || txToCheck.paymentMethod || '',
        txToCheck.category || ''
      ].map(s => String(s || '').trim()).filter(s => s && s !== '-' && !/^unassigned$/i.test(s));
      detailSummary = parts.length > 0 ? parts.join(' · ') : _cleanSingleLineDetail(reply);
    } else {
      detailSummary = _cleanSingleLineDetail(reply);
    }
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: notFound ? 'Already Resolved' : 'Recorded',
      resolved_detail: detailSummary
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

  if (actionId === 'update_category' || actionId === 'update_account' || actionId === 'update_payment_method' || actionId === 'update_fields') {
    const newCat = payload && payload.category ? String(payload.category).trim() : null;
    const newAccount = payload && payload.account ? String(payload.account).trim() : null;
    const newPaymentMethod = payload && payload.payment_method ? String(payload.payment_method).trim() : null;
    const newNote = payload && typeof payload.note === 'string' ? payload.note.trim() : null;
    const newNominal = payload && payload.nominal !== undefined && payload.nominal !== null && String(payload.nominal).trim() !== ''
      ? payload.nominal
      : null;

    let newDate = null;
    let newTime = null;
    const rawDateText = payload && typeof payload.date_text === 'string' ? payload.date_text.trim() : '';
    if (rawDateText) {
      const { _parseDateTimeExpression } = require('../../../domain/finance/Finance_Helpers');
      const parsedDt = _parseDateTimeExpression(rawDateText);
      newDate = parsedDt.dateISO || null;
      newTime = parsedDt.timeHHMM || null;
    }

    const updatedReply = await financeConfirm.updatePendingTransaction(
      newNote || null,
      newCat || null,
      newNominal,
      newAccount || null,
      newPaymentMethod || null,
      compositeKey,
      newDate,
      newTime
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
    let accounts = [];
    try {
      categories = await supabaseFinance.getCategoriesList();
    } catch (_) {}
    try {
      if (typeof supabaseFinance.getAccountsList === 'function') {
        accounts = await supabaseFinance.getAccountsList();
      }
    } catch (_) {}

    const refreshedCard = updatedTx
      ? buildFinanceTxCard(updatedTx.tx, compositeKey, {
          categories,
          accounts,
          expiresAtMs: typeof updatedTx.expiresAtMs === 'number' ? updatedTx.expiresAtMs : 0
        })
      : null;

    const detailLabel = newAccount
      ? `Account set to ${newAccount}`
      : (newPaymentMethod
        ? `Method set to ${newPaymentMethod}`
        : (newCat ? `Category updated to ${newCat}` : 'Transaction details updated.'));

    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      updated_card: refreshedCard,
      resolved_detail: detailLabel
    }, deps);
    return { ok: true, status: 'PENDING', updatedCard: refreshedCard };
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

function _humanizeVaultKey(rawKey) {
  return String(rawKey || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Phase 3: Native Vault Metadata Card (tap Edit Fields to modify key-value fields directly without typing EDIT key: value;).
 */
function buildVaultMetadataCard(vaultItem = {}) {
  const rowId = vaultItem.id || vaultItem.vaultRowId || Date.now();
  const cardId = `vault_${rowId}`;
  const rawMeta = (vaultItem.metadata_json && typeof vaultItem.metadata_json === 'object')
    ? vaultItem.metadata_json
    : (vaultItem.metadata && typeof vaultItem.metadata === 'object' ? vaultItem.metadata : {});
  const fileName = String(vaultItem.file_name || vaultItem.fileName || rawMeta.judul || 'Vault Document').trim();
  const title = String(rawMeta.judul || fileName).trim().slice(0, 72);
  const category = String(vaultItem.category || rawMeta.kategori_gambar || 'ARSIP').trim().toUpperCase();
  const rawStatus = String(vaultItem.status || 'DRAFT').trim().toUpperCase();
  const isDraft = rawStatus !== 'CONFIRMED';

  const cleanMeta = {};
  const fields = [];
  for (const [k, v] of Object.entries(rawMeta)) {
    if (k === 'source' || v === null || v === undefined) continue;
    const valStr = String(v).trim();
    if (!valStr) continue;
    cleanMeta[k] = valStr;
    fields.push({
      key: k,
      label: _humanizeVaultKey(k),
      value: valStr.slice(0, 140)
    });
  }
  if (fields.length === 0) {
    cleanMeta.judul = title;
    fields.push({ key: 'judul', label: 'Judul', value: title });
  }

  const actions = [];
  if (isDraft) {
    actions.push({ id: 'confirm', label: 'Confirm & Save', style: 'PRIMARY' });
  }
  actions.push({ id: 'edit_fields', label: 'Edit Fields', style: 'SECONDARY', kind: 'EDIT_VAULT' });
  if (vaultItem.telegram_file_id || vaultItem.telegramFileId) {
    actions.push({ id: 'reextract', label: 'Re-extract', style: 'SECONDARY' });
  }

  return {
    version: CARD_VERSION,
    card_id: cardId,
    card_type: 'VAULT_METADATA',
    presentation: 'CARD',
    status: 'PENDING',
    title,
    subtitle: `${category} · ${fileName}`,
    badge: isDraft ? 'Draft' : 'Confirmed',
    accent: isDraft ? 'AMBER' : 'EMERALD',
    fields: fields.slice(0, 12),
    meta: {
      vault_row_id: Number(rowId) || 0,
      category,
      file_name: fileName,
      drive_link: String(vaultItem.drive_web_view_link || vaultItem.driveLink || ''),
      telegram_file_id: String(vaultItem.telegram_file_id || vaultItem.telegramFileId || ''),
      vault_status: rawStatus,
      metadata: cleanMeta
    },
    actions
  };
}

/**
 * Phase 3: Rich Executive Briefing Card (Morning & Evening Briefing header dashboard).
 */
function buildBriefingCard(kind = 'MORNING', summary = {}) {
  const normKind = String(kind || 'MORNING').toUpperCase();
  const isEvening = normKind === 'EVENING';
  const dateLabel = String(summary.dateLabel || '').trim() || new Date().toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta'
  });

  if (isEvening) {
    const count = Number(summary.tomorrowAgendaCount) || 0;
    const firstEv = String(summary.tomorrowFirstEvent || '').trim();
    const metrics = [
      {
        label: "Tomorrow's Events",
        value: count > 0 ? `${count} scheduled` : 'Clear schedule',
        tone: count > 0 ? 'PRIMARY' : 'EMERALD'
      },
      {
        label: 'First Up',
        value: firstEv ? firstEv.slice(0, 38) : 'No meetings',
        tone: 'NEUTRAL'
      }
    ];
    return {
      version: CARD_VERSION,
      card_id: `brief_eve_${Date.now()}`,
      card_type: 'BRIEFING_SUMMARY',
      presentation: 'SUMMARY_CARD',
      status: 'INFO',
      title: 'Evening Reflection',
      subtitle: `${dateLabel} · Daily wrap-up`,
      badge: 'Evening',
      accent: 'PRIMARY',
      metrics,
      actions: [
        { id: 'prompt_tomorrow', label: "Tomorrow's Schedule", style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: 'cek jadwal besok' },
        { id: 'prompt_skip', label: 'Skip Reflection', style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: 'Tidak ada' }
      ]
    };
  }

  const agendaCount = Number(summary.agendaCount) || 0;
  const overdueCount = Number(summary.overdueCount) || 0;
  const dueTodayCount = Number(summary.dueTodayCount) || 0;
  const billsDue = Number(summary.billsDue) || 0;
  const safeSpend = typeof summary.safeToSpendToday === 'number' && Number.isFinite(summary.safeToSpendToday)
    ? summary.safeToSpendToday
    : null;
  const subtitleParts = [dateLabel, summary.weather ? String(summary.weather) : ''].filter(Boolean);

  const metrics = [
    {
      label: 'Agenda Today',
      value: agendaCount > 0 ? `${agendaCount} event${agendaCount > 1 ? 's' : ''}` : 'Clear',
      tone: agendaCount > 0 ? 'PRIMARY' : 'EMERALD'
    },
    {
      label: 'Tasks Due',
      value: overdueCount > 0
        ? `${dueTodayCount} today · ${overdueCount} late`
        : (dueTodayCount > 0 ? `${dueTodayCount} due today` : 'All caught up'),
      tone: overdueCount > 0 ? 'CRIMSON' : (dueTodayCount > 0 ? 'AMBER' : 'EMERALD')
    }
  ];
  if (billsDue > 0) {
    metrics.push({
      label: 'Upcoming Bills',
      value: formatIdr(billsDue),
      tone: 'AMBER'
    });
  }
  if (Number(summary.intentionsCount) > 0) {
    metrics.push({
      label: 'Active Goals',
      value: `${summary.intentionsCount} active`,
      tone: 'PRIMARY'
    });
  }

  return {
    version: CARD_VERSION,
    card_id: `brief_morn_${Date.now()}`,
    card_type: 'BRIEFING_SUMMARY',
    presentation: 'SUMMARY_CARD',
    status: 'INFO',
    title: 'Morning Executive Brief',
    subtitle: subtitleParts.join(' · '),
    badge: safeSpend !== null ? 'Safe to Spend' : 'Briefing',
    accent: 'PRIMARY',
    hero_value: safeSpend !== null ? formatIdr(safeSpend) : '',
    hero_tone: safeSpend !== null ? (safeSpend >= 0 ? 'INCOME' : 'EXPENSE') : 'NEUTRAL',
    metrics,
    actions: [
      { id: 'prompt_detail', label: 'Full Detail', style: 'PRIMARY', kind: 'SEND_PROMPT', prompt: 'Detail' },
      { id: 'prompt_tasks', label: "Today's Tasks", style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: 'cek tugas hari ini' },
      { id: 'prompt_budget', label: 'Budget Recap', style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: '/budget' }
    ]
  };
}

/**
 * Phase 3: Rich Budget Recap Card with color-coded progress bars per budget group.
 */
function buildBudgetRecapCard(recap = {}) {
  const period = String(recap.period || 'monthly').toLowerCase();
  const isWeekly = period === 'weekly';
  const totalSaved = Number(recap.totalSaved) || 0;
  const totalOver = Number(recap.totalOver) || 0;
  const netDelta = totalSaved - totalOver;
  const isOverallOver = netDelta < 0;
  const items = Array.isArray(recap.items) ? recap.items : [];

  const metrics = items.slice(0, 8).map((item) => {
    const pct = Math.max(0, Math.round(Number(item.percentage) || 0));
    const tone = item.isOver || pct >= 100
      ? 'CRIMSON'
      : (item.isWarning || pct >= 80 ? 'AMBER' : 'EMERALD');
    return {
      label: String(item.name || 'GLOBAL'),
      value: `${formatIdr(item.spent || 0)} / ${formatIdr(item.amount || 0)} (${pct}%)`,
      progress: Math.min(100, pct),
      tone
    };
  });

  return {
    version: CARD_VERSION,
    card_id: `budget_${period}_${Date.now()}`,
    card_type: 'BUDGET_RECAP',
    presentation: 'SUMMARY_CARD',
    status: 'INFO',
    title: isWeekly ? 'Weekly Budget Recap' : 'Monthly Budget Recap',
    subtitle: isOverallOver ? 'Over allocated budget' : 'Within budget target',
    badge: isOverallOver ? 'Over Limit' : 'On Track',
    accent: isOverallOver ? 'CRIMSON' : 'EMERALD',
    hero_value: `${netDelta >= 0 ? '+' : '-'}${formatIdr(Math.abs(netDelta))}`,
    hero_tone: netDelta >= 0 ? 'INCOME' : 'EXPENSE',
    metrics,
    actions: [
      { id: 'prompt_recent', label: 'Recent Transactions', style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: 'cek 10 transaksi terakhir' },
      { id: 'prompt_analytics', label: 'Monthly Analytics', style: 'SECONDARY', kind: 'SEND_PROMPT', prompt: 'analisa keuangan bulan ini' }
    ]
  };
}

async function _handleVaultMetadataAction(cardId, actionId, payload, ws, deps) {
  const memoryVault = deps.memoryVault || require('../../../infrastructure/memories/Memory_Vault');
  const supabaseMemories = deps.supabaseMemories || require('../../../infrastructure/Supabase_Memories');
  const aiRouter = deps.aiRouter || (() => { try { return require('../../../core/AI_Router'); } catch (_) { return null; } })();
  const vaultRowId = Number(payload && payload.vault_row_id) || Number(String(cardId).replace(/^vault_/, ''));

  if (!vaultRowId || !Number.isFinite(vaultRowId)) {
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      error: 'Invalid Vault document ID.'
    }, deps);
    return { ok: false, error: 'INVALID_VAULT_ID' };
  }

  let existingRow = null;
  if (memoryVault && typeof memoryVault.getVaultItemById === 'function') {
    existingRow = await memoryVault.getVaultItemById(vaultRowId);
  }
  const currentMeta = (existingRow && existingRow.metadata_json && typeof existingRow.metadata_json === 'object')
    ? { ...existingRow.metadata_json }
    : ((payload && payload.metadata && typeof payload.metadata === 'object') ? { ...payload.metadata } : {});
  const currentCategory = String(
    (payload && payload.category) || (existingRow && existingRow.category) || 'ARSIP'
  ).trim().toUpperCase();

  if (actionId === 'confirm') {
    const upd = await supabaseMemories.updateVaultItemById(vaultRowId, {
      status: 'CONFIRMED',
      category: currentCategory,
      metadata_json: currentMeta,
      confirmed_at: new Date().toISOString()
    });
    if (upd && upd.success === false) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'PENDING',
        error: upd.error || 'Failed to confirm Vault item.'
      }, deps);
      return { ok: false, error: upd.error || 'CONFIRM_FAILED' };
    }
    if (aiRouter && typeof aiRouter.invalidatePersonalFactsCache === 'function') {
      aiRouter.invalidatePersonalFactsCache();
    }
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'RESOLVED',
      resolved_badge: 'Confirmed',
      resolved_detail: `${currentMeta.judul || (existingRow && existingRow.file_name) || 'Vault document'} saved to Vault (${currentCategory}).`
    }, deps);
    return { ok: true, status: 'RESOLVED' };
  }

  if (actionId === 'update_fields') {
    const edits = (payload && payload.edits && typeof payload.edits === 'object') ? payload.edits : {};
    const mergedMeta = { ...currentMeta };
    for (const [rawK, rawV] of Object.entries(edits)) {
      const k = String(rawK || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
      if (!k || k === 'source') continue;
      const v = String(rawV ?? '').trim();
      if (v) mergedMeta[k] = v;
      else delete mergedMeta[k];
    }
    mergedMeta.source = 'MOBILE_EDIT';

    const upd = await supabaseMemories.updateVaultItemById(vaultRowId, {
      category: currentCategory,
      metadata_json: mergedMeta
    });
    if (upd && upd.success === false) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'PENDING',
        error: upd.error || 'Failed to update Vault fields.'
      }, deps);
      return { ok: false, error: upd.error || 'UPDATE_FAILED' };
    }
    if (aiRouter && typeof aiRouter.invalidatePersonalFactsCache === 'function') {
      aiRouter.invalidatePersonalFactsCache();
    }
    const refreshedRow = (upd && upd.row) || {
      ...(existingRow || {}),
      id: vaultRowId,
      category: currentCategory,
      status: (existingRow && existingRow.status) || String(payload.vault_status || 'DRAFT'),
      metadata_json: mergedMeta
    };
    const updatedCard = buildVaultMetadataCard(refreshedRow);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      updated_card: updatedCard,
      resolved_detail: 'Vault metadata updated.'
    }, deps);
    return { ok: true, status: 'PENDING', updatedCard };
  }

  if (actionId === 'reextract') {
    const telegramFileId = String(
      (existingRow && existingRow.telegram_file_id) || (payload && payload.telegram_file_id) || ''
    ).trim();
    if (!telegramFileId) {
      _sendCardUpdate(ws, {
        card_id: cardId,
        status: 'PENDING',
        error: 'Source image is not available for re-extraction.'
      }, deps);
      return { ok: false, error: 'NO_SOURCE_FILE' };
    }
    const vaultHandler = deps.vaultHandler || require('../../telegram/vault_handler');
    const reExtracted = await vaultHandler.extractVaultMetadataFromVision({
      fileId: telegramFileId,
      fileName: (existingRow && existingRow.file_name) || (payload && payload.file_name) || 'document.jpg',
      promptHint: 'Ekstrak ulang metadata dokumen ini. Fokus pada key-value yang paling akurat, lengkap, dan tidak redundan.'
    });
    const mergedMeta = {
      ...currentMeta,
      ...(reExtracted || {}),
      source: 'VISION_REEXTRACT'
    };
    const upd = await supabaseMemories.updateVaultItemById(vaultRowId, {
      category: String(mergedMeta.kategori_gambar || currentCategory).toUpperCase(),
      metadata_json: mergedMeta
    });
    const refreshedRow = (upd && upd.row) || {
      ...(existingRow || {}),
      id: vaultRowId,
      category: String(mergedMeta.kategori_gambar || currentCategory).toUpperCase(),
      status: (existingRow && existingRow.status) || 'DRAFT',
      metadata_json: mergedMeta
    };
    const updatedCard = buildVaultMetadataCard(refreshedRow);
    _sendCardUpdate(ws, {
      card_id: cardId,
      status: 'PENDING',
      updated_card: updatedCard,
      resolved_detail: 'Metadata re-extracted from document.'
    }, deps);
    return { ok: true, status: 'PENDING', updatedCard };
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
      case 'VAULT_METADATA':
        return await _handleVaultMetadataAction(cardId, actionId, payload, ws, deps);
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
  buildVaultMetadataCard,
  buildBriefingCard,
  buildBudgetRecapCard,
  registerSessionHooks,
  handleCardAction
};
