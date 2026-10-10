'use strict';
// =====================================================================
// Notifier.js - Centralized Notification Gateway for N.E.X.A
//   P0  Immediate (money confirmations, security alerts, emergency)
//   P1  Respects quiet hours (23:00 - 05:00 WIB), daily cap (3 msgs/day), per-key cooldown
//   P2  Never immediate: queued into a digest (noon & evening)
// Integrates with Supabase (nexa_notifications table) or in-memory fallback.
// =====================================================================

const DEFAULT_POLICY = {
  timezone: 'Asia/Jakarta',
  utcOffset: '+07:00',                       // Indonesia has no DST
  quiet: { startHour: 23, endHour: 5 },      // [23:00, 05:00) WIB Quiet Hours
  p1DailyCap: 3,
  cooldownMs: { P0: 5 * 60e3, P1: 6 * 3600e3, P2: 12 * 3600e3 },
  digestMaxItems: 6,
  engagementWindowMs: 30 * 60e3,
  lowEngagementRate: 0.2,
  minSamples: 7
};

function hourIn(date, tz) {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(date));
}
function isQuietHour(date, P) {
  const h = hourIn(date, P.timezone);
  const { startHour: s, endHour: e } = P.quiet;
  return s > e ? (h >= s || h < e) : (h >= s && h < e);
}
function startOfDayIso(date, P) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: P.timezone }).format(date); // YYYY-MM-DD
  return new Date(`${ymd}T00:00:00${P.utcOffset}`).toISOString();
}

const CORRUPTED_CONTENT_REGEX = /\[object Object\]|\bNaN\b|\bundefined\b/i;

function createNotifier({ store, send, policy = {}, now = () => new Date() }) {
  const P = {
    ...DEFAULT_POLICY, ...policy,
    quiet: { ...DEFAULT_POLICY.quiet, ...(policy.quiet || {}) },
    cooldownMs: { ...DEFAULT_POLICY.cooldownMs, ...(policy.cooldownMs || {}) }
  };

  async function _deliver(n, extra = {}) {
    const id = await store.record({ ...n, status: 'SENT', sentAt: now().toISOString(), ...extra });
    try {
      await send(n.text, { id, kind: n.kind, priority: n.priority });
      return { status: 'SENT', id };
    } catch (err) {
      await store.setStatus(id, 'FAILED', String(err && err.message || err));
      return { status: 'FAILED', id, error: String(err && err.message || err) };
    }
  }
  async function _drop(n, reason) {
    await store.record({ ...n, status: 'DROPPED', reason });
    return { status: 'DROPPED', reason };
  }
  async function _queue(n, status, reason) {
    if (n.dedupeKey && await store.hasQueued(n.dedupeKey)) return _drop(n, 'already-queued');
    const id = await store.record({ ...n, status, reason });
    return { status, id };
  }

  /** n = { kind, priority, text, dedupeKey?, expiresAt?, isScheduled?, timeSensitive? } */
  async function notify(n) {
    if (!n || !n.text) return _drop(n || {}, 'empty_text');
    if (CORRUPTED_CONTENT_REGEX.test(n.text)) {
      console.error(`[NOTIFIER] Corrupted outbound content rejected: "${String(n.text).slice(0, 100)}"`);
      return _drop(n, 'corrupted_content');
    }

    let priority = ['P0', 'P1', 'P2'].includes(n.priority) ? n.priority : 'P2';
    if (n.timeSensitive) priority = 'P0';

    const note = { ...n, priority };
    const t = now();
    if (note.expiresAt && new Date(note.expiresAt) <= t) return _drop(note, 'expired');
    if (note.dedupeKey) {
      const last = await store.lastSentAt(note.dedupeKey);
      if (last && t - new Date(last) < P.cooldownMs[note.priority]) return _drop(note, 'dedupe');
    }
    if (note.priority === 'P0') return _deliver(note);
    if (note.priority === 'P2') return _queue(note, 'QUEUED_DIGEST');
    if (isQuietHour(t, P)) return _queue(note, 'QUEUED_DEFERRED', 'quiet-hours');

    // Scheduled pulses (morning/evening briefings) do NOT consume discretionary nudge cap
    const isScheduledReport = Boolean(note.isScheduled || String(note.kind || '').toUpperCase().startsWith('SCHEDULED_'));
    if (!isScheduledReport) {
      const sent = await store.countSentSince('P1', startOfDayIso(t, P));
      if (sent >= P.p1DailyCap) return _queue({ ...note, priority: 'P2' }, 'QUEUED_DIGEST', 'p1-cap');
    }
    return _deliver(note);
  }

  const _compose = (title, rows) =>
    `${title}\n${rows.map(r => `• ${String(r.text).split('\n')[0].slice(0, 160)}`).join('\n')}`;

  /** Cron at e.g. 12:30 and 19:30 WIB. One message instead of many. */
  async function flushDigest() {
    const rows = await store.claimQueued('QUEUED_DIGEST', P.digestMaxItems, now().toISOString());
    if (!rows.length) return { status: 'EMPTY' };
    return _deliver({ kind: 'DIGEST', priority: 'P2', text: _compose('Ringkasan', rows) },
      { reason: `digest:${rows.map(r => r.id).join(',')}` });
  }

  /** Cron right after quiet hours end (e.g. 05:30 WIB, before the morning briefing). */
  async function flushDeferred() {
    if (isQuietHour(now(), P)) return { status: 'STILL_QUIET' };
    const rows = await store.claimQueued('QUEUED_DEFERRED', P.digestMaxItems, now().toISOString());
    if (!rows.length) return { status: 'EMPTY' };
    return _deliver({ kind: 'SCHEDULED_DEFERRED', priority: 'P1', isScheduled: true, text: _compose('Ditunda semalam', rows) });
  }

  /** Call from the Telegram adapter on any user message or button tap. */
  function markEngaged(how = 'REPLY') {
    return store.markEngagedLatest(P.engagementWindowMs, how, now().toISOString());
  }

  async function engagementReport(days = 14) {
    const since = new Date(now().getTime() - days * 86400e3).toISOString();
    const rows = await store.statsSince(since);
    const agg = {};
    for (const r of rows) {
      const a = (agg[r.kind] ||= { sent: 0, engaged: 0 });
      a.sent += 1;
      if (r.engaged_at) a.engaged += 1;
    }
    return Object.entries(agg).map(([kind, a]) => {
      const rate = a.sent ? a.engaged / a.sent : 0;
      return { kind, sent: a.sent, engaged: a.engaged, rate: Math.round(rate * 100) / 100,
        suggestion: a.sent >= P.minSamples && rate < P.lowEngagementRate ? 'REDUCE' : 'KEEP' };
    }).sort((x, y) => x.rate - y.rate);
  }

  return { notify, flushDigest, flushDeferred, markEngaged, engagementReport };
}

// ---------------------------------------------------------------------
// Storage Adapters
// ---------------------------------------------------------------------
function createMemoryStore() {
  const rows = []; let seq = 0;
  return {
    rows,
    async record(r) { const row = { id: ++seq, engagedAt: null, ...r }; rows.push(row); return row.id; },
    async setStatus(id, status, reason) { const r = rows.find(x => x.id === id); if (r) { r.status = status; r.reason = reason; } },
    async lastSentAt(key) { return rows.filter(r => r.dedupeKey === key && r.status === 'SENT').map(r => r.sentAt).sort().pop() || null; },
    async countSentSince(priority, sinceIso) {
      return rows.filter(r => r.status === 'SENT' && r.priority === priority && r.sentAt >= sinceIso && !r.isScheduled && !String(r.kind || '').toUpperCase().startsWith('SCHEDULED_') && r.kind !== 'DEFERRED').length;
    },
    async hasQueued(key) { return rows.some(r => r.dedupeKey === key && String(r.status).startsWith('QUEUED')); },
    async claimQueued(status, limit, nowIso) {
      const picked = rows.filter(r => r.status === status && (!r.expiresAt || r.expiresAt > nowIso)).slice(0, limit);
      picked.forEach(r => { r.status = 'DIGESTED'; });
      return picked.map(r => ({ id: r.id, text: r.text, kind: r.kind }));
    },
    async markEngagedLatest(windowMs, how, nowIso) {
      const since = new Date(new Date(nowIso).getTime() - windowMs).toISOString();
      const r = rows.filter(x => x.status === 'SENT' && !x.engagedAt && x.sentAt >= since).sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))[0];
      if (!r) return false;
      r.engagedAt = nowIso; r.engagement = how; return true;
    },
    async statsSince(sinceIso) {
      return rows.filter(r => r.status === 'SENT' && r.sentAt >= sinceIso && r.kind !== 'DIGEST')
        .map(r => ({ kind: r.kind, engaged_at: r.engagedAt }));
    }
  };
}

function createSupabaseStore(sb) {
  const T = 'nexa_notifications';
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  const toRow = r => ({
    kind: r.kind, priority: r.priority, dedupe_key: r.dedupeKey || null, text: r.text,
    status: r.status, reason: r.reason || null, sent_at: r.sentAt || null, expires_at: r.expiresAt || null
  });
  const countOf = async q => { const { count, error } = await q; if (error) throw new Error(error.message); return count || 0; };
  return {
    async record(r) { return must(await sb.from(T).insert(toRow(r)).select('id').single()).id; },
    async setStatus(id, status, reason) { must(await sb.from(T).update({ status, reason }).eq('id', id)); },
    async lastSentAt(key) {
      const d = must(await sb.from(T).select('sent_at').eq('dedupe_key', key).eq('status', 'SENT').order('sent_at', { ascending: false }).limit(1));
      return d && d[0] ? d[0].sent_at : null;
    },
    countSentSince: (priority, sinceIso) =>
      countOf(sb.from(T).select('id', { count: 'exact', head: true }).eq('status', 'SENT').eq('priority', priority).gte('sent_at', sinceIso).not('kind', 'ilike', 'SCHEDULED_%').neq('kind', 'DEFERRED')),
    async hasQueued(key) {
      return (await countOf(sb.from(T).select('id', { count: 'exact', head: true }).eq('dedupe_key', key).in('status', ['QUEUED_DIGEST', 'QUEUED_DEFERRED']))) > 0;
    },
    async claimQueued(status, limit, nowIso) {
      const cand = must(await sb.from(T).select('id').eq('status', status)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`).order('created_at').limit(limit));
      if (!cand || !cand.length) return [];
      return must(await sb.from(T).update({ status: 'DIGESTED' }).in('id', cand.map(c => c.id)).eq('status', status).select('id,text,kind')) || [];
    },
    async markEngagedLatest(windowMs, how, nowIso) {
      const since = new Date(new Date(nowIso).getTime() - windowMs).toISOString();
      const d = must(await sb.from(T).select('id').eq('status', 'SENT').is('engaged_at', null).gte('sent_at', since).order('sent_at', { ascending: false }).limit(1));
      if (!d || !d.length) return false;
      must(await sb.from(T).update({ engaged_at: nowIso, engagement: how }).eq('id', d[0].id));
      return true;
    },
    async statsSince(sinceIso) {
      return must(await sb.from(T).select('kind,engaged_at').eq('status', 'SENT').gte('sent_at', sinceIso).neq('kind', 'DIGEST')) || [];
    }
  };
}

function createResilientStore(sb) {
  const mem = createMemoryStore();
  if (!sb) return mem;
  const db = createSupabaseStore(sb);
  let tableMissingUntil = 0;

  async function wrap(dbFn, memFn) {
    const now = Date.now();
    if (now < tableMissingUntil) return memFn();
    try {
      return await dbFn();
    } catch (err) {
      const msg = String(err && err.message || '');
      const code = String(err && err.code || '');
      // Only treat genuine missing relation / missing table as missing, not all PGRST codes
      if (code === '42P01' || code === 'PGRST205' || /schema cache|does not exist|42P01/i.test(msg)) {
        if (tableMissingUntil < now) {
          console.warn('[NOTIFIER] ℹ️ Table nexa_notifications belum terbaca di Supabase. Menggunakan memory fallback (retry 60s).');
        }
        tableMissingUntil = now + 60_000;
        return memFn();
      }
      throw err;
    }
  }

  return {
    record: r => wrap(() => db.record(r), () => mem.record(r)),
    setStatus: (id, s, r) => wrap(() => db.setStatus(id, s, r), () => mem.setStatus(id, s, r)),
    lastSentAt: k => wrap(() => db.lastSentAt(k), () => mem.lastSentAt(k)),
    countSentSince: (p, s) => wrap(() => db.countSentSince(p, s), () => mem.countSentSince(p, s)),
    hasQueued: k => wrap(() => db.hasQueued(k), () => mem.hasQueued(k)),
    claimQueued: (st, lim, n) => wrap(() => db.claimQueued(st, lim, n), () => mem.claimQueued(st, lim, n)),
    markEngagedLatest: (w, h, n) => wrap(() => db.markEngagedLatest(w, h, n), () => mem.markEngagedLatest(w, h, n)),
    statsSince: s => wrap(() => db.statsSince(s), () => mem.statsSince(s))
  };
}

let _defaultNotifier = null;
function getNotifier() {
  if (!_defaultNotifier) {
    let store;
    try {
      const supabaseMemories = require('../infrastructure/Supabase_Memories');
      store = createResilientStore(supabaseMemories.supabase);
    } catch (_) {
      store = createMemoryStore();
    }
    let sendFn;
    try {
      const { sendTelegramOutbound } = require('../interfaces/telegram/actions');
      sendFn = async (text) => sendTelegramOutbound(text, false);
    } catch (_) {
      sendFn = async () => {};
    }
    _defaultNotifier = createNotifier({
      store,
      send: sendFn
    });
  }
  return _defaultNotifier;
}

/**
 * Proactive notification entry point for all background tasks and cron jobs.
 * Enforces Quiet Hours (22:00 - 06:00 WIB), deduplication, and rate limiting.
 */
async function notifyProactive({
  kind = 'general',
  priority = 'P1',
  dedupeKey = null,
  text,
  expiresAt = null,
  isScheduled = false,
  timeSensitive = false
}) {
  if (!text) return null;
  const notifier = getNotifier();
  return notifier.notify({
    kind,
    priority,
    dedupeKey,
    text,
    expiresAt,
    isScheduled,
    timeSensitive
  });
}

module.exports = {
  createNotifier,
  createMemoryStore,
  createSupabaseStore,
  createResilientStore,
  getNotifier,
  _setNotifier: (n) => { _defaultNotifier = n; },
  notifyProactive,
  isQuietHour,
  startOfDayIso,
  DEFAULT_POLICY
};
