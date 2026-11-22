'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Deduplicated Error & Issue Tracker
 *
 * - Groups runtime exceptions, HTTP 5xx, and subsystem errors by
 *   normalized fingerprint (subsystem + normalized message + culprit frame).
 * - FR-SEC-04: Redacts all secrets/tokens/keys BEFORE storing in memory or disk.
 * - Bounded to MAX_ISSUES (200) unique groups and 7-day rolling event timestamps
 *   for exact -1h / -24h / -7d counters.
 * - Atomic JSON persistence (tmp + rename) with debounced writes + sync flush
 *   hook for fatal uncaughtException durability.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { redactSecrets, sanitizeLogToken } = require('../utils/logger');

const MAX_ISSUES = 200;
const MAX_RECENT_OCCURRENCES = 10;
const MAX_EVENT_TIMESTAMPS_PER_ISSUE = 500;
const SEVEN_DAYS_MS = 7 * 24 * 3600 * 1000;
const ONE_DAY_MS = 24 * 3600 * 1000;
const ONE_HOUR_MS = 3600 * 1000;

function normalizeMessageForFingerprint(rawMsg) {
  return String(rawMsg || 'Unknown error')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, '<ts>')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, '<ip>')
    .replace(/\b0x[0-9a-f]+\b/gi, '<hex>')
    .replace(/\b\d{2,}\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function extractCulpritFrame(stackStr) {
  if (!stackStr || typeof stackStr !== 'string') return '';
  const lines = stackStr.split(/\r?\n/).map(l => l.trim());
  // Prefer first application frame inside src/ (skipping node: internal & node_modules)
  for (const line of lines) {
    if (!line.startsWith('at ')) continue;
    if (/node_modules|node:internal|internal\//i.test(line)) continue;
    const m = /([A-Za-z0-9_./\\-]+\.(?:js|cjs|mjs|ts):\d+(?::\d+)?)/.exec(line);
    if (m) return m[1].replace(/\\/g, '/').replace(/^.*\/(src\/.*)$/, '$1');
  }
  // Fallback to first stack frame if no app frame matched
  for (const line of lines) {
    if (line.startsWith('at ')) return line.slice(0, 120);
  }
  return '';
}

function computeFingerprint(subsystem, message, culprit) {
  const normMsg = normalizeMessageForFingerprint(message);
  const basis = `${String(subsystem || 'CORE').toUpperCase()}|${normMsg}|${culprit || ''}`;
  const hash = crypto.createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 8);
  return `fp_${hash}`;
}

function sanitizeRoute(rawRoute) {
  if (!rawRoute) return '';
  const clean = String(rawRoute).split('?')[0].replace(/[\r\n\t]+/g, '').trim();
  return redactSecrets(clean).slice(0, 160);
}

class IssueTracker {
  /**
   * @param {object} [options]
   * @param {string} [options.filePath] - Path to persistent JSON store
   * @param {number} [options.maxIssues=200]
   * @param {() => number} [options.nowFn]
   * @param {() => string} [options.getCommitFn]
   * @param {number} [options.saveDebounceMs=1500]
   */
  constructor(options = {}) {
    this.filePath = options.filePath || null;
    this.maxIssues = Math.max(10, Number(options.maxIssues) || MAX_ISSUES);
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this.getCommitFn = typeof options.getCommitFn === 'function' ? options.getCommitFn : () => '';
    this.saveDebounceMs = Number.isFinite(options.saveDebounceMs) ? options.saveDebounceMs : 1500;

    this.issues = new Map(); // fingerprint -> issue object
    this._deltaSinceLastSample = 0;
    this._saveTimer = null;
    this._dirty = false;

    if (this.filePath) {
      this._loadFromDisk();
    }
  }

  _loadFromDisk() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.issues)) return;
      const now = this.nowFn();
      for (const item of parsed.issues) {
        if (!item || typeof item.fingerprint !== 'string') continue;
        const tsList = Array.isArray(item.eventTimestamps)
          ? item.eventTimestamps.filter(t => Number.isFinite(t) && now - t <= SEVEN_DAYS_MS).slice(-MAX_EVENT_TIMESTAMPS_PER_ISSUE)
          : [];
        this.issues.set(item.fingerprint, {
          fingerprint: item.fingerprint,
          subsystem: String(item.subsystem || 'CORE'),
          severity: item.severity || 'error',
          title: String(item.title || 'Unknown error'),
          culprit: String(item.culprit || ''),
          stack: String(item.stack || ''),
          route: String(item.route || ''),
          commit: String(item.commit || ''),
          status: item.status === 'resolved' ? 'resolved' : 'unresolved',
          count: Math.max(1, Number(item.count) || 1),
          firstSeenAt: Number(item.firstSeenAt) || now,
          lastSeenAt: Number(item.lastSeenAt) || now,
          resolvedAt: item.resolvedAt ? Number(item.resolvedAt) : null,
          eventTimestamps: tsList,
          recentOccurrences: Array.isArray(item.recentOccurrences)
            ? item.recentOccurrences.slice(-MAX_RECENT_OCCURRENCES)
            : []
        });
      }
      this._enforceCap();
    } catch (err) {
      console.warn(`[MONITOR-ISSUES] Could not load persisted issues: ${err.message}`);
    }
  }

  _scheduleSave() {
    if (!this.filePath) return;
    this._dirty = true;
    if (this.saveDebounceMs <= 0) {
      this.flushSync();
      return;
    }
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this.flushSync();
    }, this.saveDebounceMs);
    if (typeof this._saveTimer.unref === 'function') {
      this._saveTimer.unref();
    }
  }

  flushSync() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (!this.filePath || !this._dirty) return false;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const payload = JSON.stringify({
        version: 1,
        updatedAt: this.nowFn(),
        issues: Array.from(this.issues.values())
      });
      const tmpPath = `${this.filePath}.tmp.${process.pid}`;
      fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
      this._dirty = false;
      return true;
    } catch (err) {
      console.warn(`[MONITOR-ISSUES] Failed to persist issues: ${err.message}`);
      return false;
    }
  }

  _enforceCap() {
    if (this.issues.size <= this.maxIssues) return;
    const entries = Array.from(this.issues.values()).sort((a, b) => {
      // Evict resolved issues first, then oldest lastSeenAt
      if (a.status !== b.status) return a.status === 'resolved' ? -1 : 1;
      return a.lastSeenAt - b.lastSeenAt;
    });
    const toRemove = entries.length - this.maxIssues;
    for (let i = 0; i < toRemove; i++) {
      this.issues.delete(entries[i].fingerprint);
    }
  }

  /**
   * Record a runtime/subsystem error with automatic deduplication & secret redaction.
   * @param {string} subsystem - e.g. 'SAFETY-NET' | 'HTTP-5XX' | 'LIVE-VOICE' | 'FINANCE' | 'BRIDGE' | 'CRON'
   * @param {Error|string} errorOrMessage
   * @param {object} [meta] - { severity, route, method, statusCode, source, commit, syncFlush }
   */
  recordIssue(subsystem, errorOrMessage, meta = {}) {
    const now = this.nowFn();
    const cleanSub = sanitizeLogToken(String(subsystem || 'CORE').toUpperCase(), 24);
    const isErr = errorOrMessage instanceof Error;
    const rawMsg = isErr
      ? (errorOrMessage.message || errorOrMessage.name || 'Error')
      : String(errorOrMessage || 'Unknown error');
    const rawStack = isErr && typeof errorOrMessage.stack === 'string'
      ? errorOrMessage.stack
      : (typeof meta.stack === 'string' ? meta.stack : '');

    // FR-SEC-04: Redact ALL secrets before indexing or saving
    const safeTitle = redactSecrets(rawMsg).replace(/[\r\n]+/g, ' ').trim().slice(0, 260) || 'Unknown error';
    const safeStack = redactSecrets(rawStack).slice(0, 4096);
    const culprit = extractCulpritFrame(safeStack);
    const safeRoute = meta.route
      ? `${meta.method ? String(meta.method).toUpperCase().slice(0, 8) + ' ' : ''}${sanitizeRoute(meta.route)}`
      : '';
    const severity = ['fatal', 'error', 'warn'].includes(meta.severity) ? meta.severity : 'error';
    const commit = String(meta.commit || this.getCommitFn() || '').slice(0, 32);

    const fp = computeFingerprint(cleanSub, safeTitle, culprit);
    const occurrence = {
      ts: now,
      statusCode: Number.isFinite(Number(meta.statusCode)) ? Number(meta.statusCode) : null,
      route: safeRoute || null,
      source: meta.source ? sanitizeLogToken(meta.source, 48) : null
    };

    const existing = this.issues.get(fp);
    if (existing) {
      existing.count += 1;
      existing.lastSeenAt = now;
      existing.title = safeTitle;
      if (safeStack) existing.stack = safeStack;
      if (safeRoute) existing.route = safeRoute;
      if (commit) existing.commit = commit;
      if (severity === 'fatal') existing.severity = 'fatal';
      // Re-open automatically if a previously resolved issue recurs
      if (existing.status === 'resolved') {
        existing.status = 'unresolved';
        existing.resolvedAt = null;
      }
      existing.eventTimestamps.push(now);
      if (existing.eventTimestamps.length > MAX_EVENT_TIMESTAMPS_PER_ISSUE) {
        existing.eventTimestamps = existing.eventTimestamps
          .filter(t => now - t <= SEVEN_DAYS_MS)
          .slice(-MAX_EVENT_TIMESTAMPS_PER_ISSUE);
      }
      existing.recentOccurrences.push(occurrence);
      if (existing.recentOccurrences.length > MAX_RECENT_OCCURRENCES) {
        existing.recentOccurrences.splice(0, existing.recentOccurrences.length - MAX_RECENT_OCCURRENCES);
      }
    } else {
      this.issues.set(fp, {
        fingerprint: fp,
        subsystem: cleanSub,
        severity,
        title: safeTitle,
        culprit,
        stack: safeStack,
        route: safeRoute,
        commit,
        status: 'unresolved',
        count: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        eventTimestamps: [now],
        recentOccurrences: [occurrence]
      });
      this._enforceCap();
    }

    this._deltaSinceLastSample += 1;
    if (meta.syncFlush) {
      this._dirty = true;
      this.flushSync();
    } else {
      this._scheduleSave();
    }
    return this.issues.get(fp);
  }

  /**
   * Consume the count of issue events since the previous 1-minute history tick.
   */
  consumeIntervalDelta() {
    const d = this._deltaSinceLastSample;
    this._deltaSinceLastSample = 0;
    return d;
  }

  /**
   * Count total error occurrences matching an optional subsystem over `windowMs`.
   */
  countEventsInWindow(windowMs, subsystem = null, now = this.nowFn()) {
    const cutoff = now - windowMs;
    let total = 0;
    const filterSub = subsystem ? String(subsystem).toUpperCase() : null;
    for (const issue of this.issues.values()) {
      if (filterSub && issue.subsystem !== filterSub) continue;
      for (let i = issue.eventTimestamps.length - 1; i >= 0; i--) {
        if (issue.eventTimestamps[i] >= cutoff) total += 1;
        else break;
      }
    }
    return total;
  }

  getSummary(now = this.nowFn()) {
    let unresolved = 0;
    let resolved = 0;
    let last1h = 0;
    let last24h = 0;
    let last7d = 0;
    const c1h = now - ONE_HOUR_MS;
    const c24h = now - ONE_DAY_MS;
    const c7d = now - SEVEN_DAYS_MS;

    for (const issue of this.issues.values()) {
      if (issue.status === 'resolved') resolved += 1;
      else unresolved += 1;
      for (let i = issue.eventTimestamps.length - 1; i >= 0; i--) {
        const ts = issue.eventTimestamps[i];
        if (ts < c7d) break;
        last7d += 1;
        if (ts >= c24h) last24h += 1;
        if (ts >= c1h) last1h += 1;
      }
    }

    return {
      last1h,
      last24h,
      last7d,
      unresolved,
      resolved,
      totalGroups: this.issues.size
    };
  }

  listIssues(filter = {}) {
    const status = String(filter.status || 'all').toLowerCase();
    const subsystem = filter.subsystem ? String(filter.subsystem).toUpperCase() : '';
    const search = filter.search ? String(filter.search).toLowerCase().trim() : '';
    const now = this.nowFn();
    const c24h = now - ONE_DAY_MS;

    const results = [];
    for (const issue of this.issues.values()) {
      if (status === 'unresolved' && issue.status !== 'unresolved') continue;
      if (status === 'resolved' && issue.status !== 'resolved') continue;
      if (subsystem && issue.subsystem !== subsystem) continue;
      if (search) {
        const hay = `${issue.title} ${issue.subsystem} ${issue.culprit} ${issue.route} ${issue.fingerprint}`.toLowerCase();
        if (!hay.includes(search)) continue;
      }

      // Compute 8-bucket 24h mini sparkbars for table row display
      const spark24h = new Array(8).fill(0);
      for (let i = issue.eventTimestamps.length - 1; i >= 0; i--) {
        const ts = issue.eventTimestamps[i];
        if (ts < c24h) break;
        const idx = Math.min(7, Math.max(0, Math.floor(((ts - c24h) / ONE_DAY_MS) * 8)));
        spark24h[idx] += 1;
      }

      results.push({
        fingerprint: issue.fingerprint,
        subsystem: issue.subsystem,
        severity: issue.severity,
        title: issue.title,
        culprit: issue.culprit,
        route: issue.route,
        commit: issue.commit,
        status: issue.status,
        count: issue.count,
        firstSeenAt: issue.firstSeenAt,
        lastSeenAt: issue.lastSeenAt,
        resolvedAt: issue.resolvedAt,
        spark24h
      });
    }

    results.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return results;
  }

  getIssue(fingerprint) {
    const issue = this.issues.get(String(fingerprint || '').trim());
    if (!issue) return null;
    return {
      fingerprint: issue.fingerprint,
      subsystem: issue.subsystem,
      severity: issue.severity,
      title: issue.title,
      culprit: issue.culprit,
      stack: issue.stack,
      route: issue.route,
      commit: issue.commit,
      status: issue.status,
      count: issue.count,
      firstSeenAt: issue.firstSeenAt,
      lastSeenAt: issue.lastSeenAt,
      resolvedAt: issue.resolvedAt,
      recentOccurrences: issue.recentOccurrences.slice().reverse()
    };
  }

  resolveIssue(fingerprint) {
    const issue = this.issues.get(String(fingerprint || '').trim());
    if (!issue) return null;
    issue.status = 'resolved';
    issue.resolvedAt = this.nowFn();
    this._scheduleSave();
    return this.getIssue(issue.fingerprint);
  }

  reopenIssue(fingerprint) {
    const issue = this.issues.get(String(fingerprint || '').trim());
    if (!issue) return null;
    issue.status = 'unresolved';
    issue.resolvedAt = null;
    this._scheduleSave();
    return this.getIssue(issue.fingerprint);
  }

  clearResolved() {
    let removed = 0;
    for (const [fp, issue] of this.issues.entries()) {
      if (issue.status === 'resolved') {
        this.issues.delete(fp);
        removed += 1;
      }
    }
    if (removed > 0) this._scheduleSave();
    return removed;
  }

  destroy() {
    this.flushSync();
  }
}

module.exports = {
  IssueTracker,
  computeFingerprint,
  normalizeMessageForFingerprint,
  extractCulpritFrame,
  MAX_ISSUES
};
