'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Proactive Alert Engine
 *
 * - Evaluates 5 server health alert rules on 1-minute telemetry ticks
 *   and immediate fatal exception events.
 * - Enforces sustained breach streaks (no transient 1s false alarms)
 *   and 15-minute cooldown deduplication per rule.
 * - Delivers alerts directly to N.E.X.A Mobile Bridge (via Notifier.js
 *   mobile_primary routing, with Telegram fallback).
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const { redactSecrets } = require('../utils/logger');

const DEFAULT_COOLDOWN_MS = 15 * 60_000;

const DEFAULT_RULES = Object.freeze({
  fatal_exception: {
    id: 'fatal_exception',
    label: 'Fatal Exception / Unexpected Restart',
    description: 'Immediate push on uncaughtException or unexpected restart',
    enabled: true,
    priority: 'P0',
    sustainedMinutes: 0
  },
  high_rss: {
    id: 'high_rss',
    label: 'High Node RSS Memory',
    description: 'Trigger when RSS > 300 MiB sustained for 3 minutes',
    enabled: true,
    priority: 'P1',
    thresholdMb: 300,
    sustainedMinutes: 3
  },
  low_vps_ram: {
    id: 'low_vps_ram',
    label: 'Low VPS Available RAM',
    description: 'Trigger when MemAvailable < 120 MiB sustained for 3 minutes',
    enabled: true,
    priority: 'P0',
    thresholdMb: 120,
    sustainedMinutes: 3
  },
  event_loop_stall: {
    id: 'event_loop_stall',
    label: 'Event Loop Stall',
    description: 'Trigger when P95 latency > 100 ms sustained for 1 minute',
    enabled: true,
    priority: 'P1',
    thresholdMs: 100,
    sustainedMinutes: 1
  },
  http_5xx_spike: {
    id: 'http_5xx_spike',
    label: 'HTTP 5xx Spike',
    description: 'Trigger when >= 5 HTTP 5xx errors occur within 5 minutes',
    enabled: false,
    priority: 'P1',
    thresholdCount: 5,
    windowMs: 5 * 60_000,
    sustainedMinutes: 1
  }
});

const RULE_BOUNDS = Object.freeze({
  high_rss: { thresholdField: 'thresholdMb', min: 128, max: 400, unit: 'MiB', sustainedMin: 1, sustainedMax: 15 },
  low_vps_ram: { thresholdField: 'thresholdMb', min: 64, max: 512, unit: 'MiB', sustainedMin: 1, sustainedMax: 15 },
  event_loop_stall: { thresholdField: 'thresholdMs', min: 20, max: 1000, unit: 'ms', sustainedMin: 1, sustainedMax: 15 },
  http_5xx_spike: { thresholdField: 'thresholdCount', min: 1, max: 100, unit: 'errors', sustainedMin: 1, sustainedMax: 5 }
});

function formatRuleDescription(rule) {
  if (!rule) return '';
  switch (rule.id) {
    case 'high_rss':
      return `Trigger when RSS > ${rule.thresholdMb} MiB sustained for ${rule.sustainedMinutes} min`;
    case 'low_vps_ram':
      return `Trigger when MemAvailable < ${rule.thresholdMb} MiB sustained for ${rule.sustainedMinutes} min`;
    case 'event_loop_stall':
      return `Trigger when P95 latency > ${rule.thresholdMs} ms sustained for ${rule.sustainedMinutes} min`;
    case 'http_5xx_spike':
      return `Trigger when >= ${rule.thresholdCount} HTTP 5xx errors occur within 5 minutes`;
    default:
      return rule.description || '';
  }
}

function clampInt(val, min, max, fallback) {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cloneDefaultRules() {
  const out = {};
  for (const [k, v] of Object.entries(DEFAULT_RULES)) {
    out[k] = { ...v };
    out[k].description = formatRuleDescription(out[k]);
  }
  return out;
}

class AlertEngine {
  /**
   * @param {object} [options]
   * @param {string} [options.configPath] - Optional JSON file persisting rule enabled toggles
   * @param {Function} [options.notifyFn] - Injectable async ({ kind, priority, dedupeKey, text, bypassQuietHours }) => any
   * @param {number} [options.cooldownMs=900000]
   * @param {() => number} [options.nowFn]
   */
  constructor(options = {}) {
    this.configPath = options.configPath || null;
    this.cooldownMs = Number.isFinite(options.cooldownMs) ? options.cooldownMs : DEFAULT_COOLDOWN_MS;
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this.notifyFn = typeof options.notifyFn === 'function' ? options.notifyFn : null;

    this.rules = cloneDefaultRules();
    this._streaks = {
      high_rss: 0,
      low_vps_ram: 0,
      event_loop_stall: 0,
      http_5xx_spike: 0
    };
    this._lastFiredAt = new Map(); // ruleId -> epoch ms

    if (this.configPath) {
      this._loadConfig();
    }
  }

  _loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return;
      if (Number.isFinite(Number(parsed.cooldownMinutes))) {
        this.cooldownMs = clampInt(parsed.cooldownMinutes, 1, 120, 15) * 60_000;
      }
      if (parsed.rules && typeof parsed.rules === 'object') {
        for (const [id, cfg] of Object.entries(parsed.rules)) {
          const rule = this.rules[id];
          if (!rule || !cfg || typeof cfg !== 'object') continue;
          if (typeof cfg.enabled === 'boolean') rule.enabled = cfg.enabled;
          const b = RULE_BOUNDS[id];
          if (b) {
            if (cfg[b.thresholdField] !== undefined) {
              rule[b.thresholdField] = clampInt(cfg[b.thresholdField], b.min, b.max, rule[b.thresholdField]);
            }
            if (cfg.sustainedMinutes !== undefined) {
              rule.sustainedMinutes = clampInt(cfg.sustainedMinutes, b.sustainedMin, b.sustainedMax, rule.sustainedMinutes);
            }
            rule.description = formatRuleDescription(rule);
          }
        }
      }
    } catch (err) {
      console.warn(`[MONITOR-ALERTS] Could not load alert config: ${err.message}`);
    }
  }

  _saveConfig() {
    if (!this.configPath) return;
    try {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
      const minimal = {};
      for (const [id, rule] of Object.entries(this.rules)) {
        const entry = { enabled: Boolean(rule.enabled) };
        const b = RULE_BOUNDS[id];
        if (b) {
          entry[b.thresholdField] = rule[b.thresholdField];
          entry.sustainedMinutes = rule.sustainedMinutes;
        }
        minimal[id] = entry;
      }
      const tmp = `${this.configPath}.tmp.${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify({
        version: 2,
        cooldownMinutes: this.getCooldownMinutes(),
        rules: minimal
      }, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, this.configPath);
    } catch (err) {
      console.warn(`[MONITOR-ALERTS] Failed to save alert config: ${err.message}`);
    }
  }

  getCooldownMinutes() {
    return Math.max(1, Math.round(this.cooldownMs / 60_000));
  }

  setCooldownMinutes(minutes) {
    const clamped = clampInt(minutes, 1, 120, this.getCooldownMinutes());
    this.cooldownMs = clamped * 60_000;
    this._saveConfig();
    return clamped;
  }

  getRules() {
    return Object.values(this.rules).map(r => {
      const b = RULE_BOUNDS[r.id];
      return {
        ...r,
        editable: b ? {
          field: b.thresholdField,
          value: r[b.thresholdField],
          min: b.min,
          max: b.max,
          unit: b.unit,
          sustainedMin: b.sustainedMin,
          sustainedMax: b.sustainedMax
        } : null,
        lastFiredAt: this._lastFiredAt.get(r.id) || null
      };
    });
  }

  updateRule(ruleId, patch = {}) {
    const rule = this.rules[ruleId];
    if (!rule) return null;
    if (typeof patch.enabled === 'boolean') {
      rule.enabled = patch.enabled;
      if (!rule.enabled && Object.prototype.hasOwnProperty.call(this._streaks, ruleId)) {
        this._streaks[ruleId] = 0;
      }
    }
    const b = RULE_BOUNDS[ruleId];
    if (b) {
      if (patch[b.thresholdField] !== undefined) {
        rule[b.thresholdField] = clampInt(patch[b.thresholdField], b.min, b.max, rule[b.thresholdField]);
      }
      if (patch.threshold !== undefined) {
        rule[b.thresholdField] = clampInt(patch.threshold, b.min, b.max, rule[b.thresholdField]);
      }
      if (patch.sustainedMinutes !== undefined) {
        rule.sustainedMinutes = clampInt(patch.sustainedMinutes, b.sustainedMin, b.sustainedMax, rule.sustainedMinutes);
      }
      rule.description = formatRuleDescription(rule);
    }
    this._saveConfig();
    return this.getRules().find(r => r.id === ruleId);
  }

  setRuleEnabled(ruleId, enabled) {
    return this.updateRule(ruleId, { enabled: Boolean(enabled) });
  }

  async sendTestAlert(meta = {}) {
    const now = this.nowFn();
    const channel = meta.mobileConnected ? 'mobile_bridge' : 'telegram_fallback';
    const text = `[N.E.X.A Pulse Monitor] Test alert verified (${new Date(now).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' })} WIB · route: ${channel}).`;
    const payload = {
      kind: 'SERVER_ALERT_TEST',
      priority: 'P0',
      dedupeKey: `pulse_alert:test:${now}`,
      text,
      bypassQuietHours: true,
      timeSensitive: true
    };
    try {
      if (this.notifyFn) {
        await this.notifyFn(payload);
      } else {
        const { notifyProactive } = require('../core/Notifier');
        await notifyProactive(payload);
      }
      return { ok: true, channel, sentAt: now };
    } catch (err) {
      return { ok: false, channel, error: err.message };
    }
  }

  _canFire(ruleId, now) {
    const rule = this.rules[ruleId];
    if (!rule || !rule.enabled) return false;
    const last = this._lastFiredAt.get(ruleId) || 0;
    return (now - last) >= this.cooldownMs;
  }

  async _dispatch(ruleId, text, priorityOverride = null) {
    const now = this.nowFn();
    const rule = this.rules[ruleId];
    if (!rule || !this._canFire(ruleId, now)) return { fired: false, reason: 'disabled_or_cooldown' };

    this._lastFiredAt.set(ruleId, now);
    const priority = priorityOverride || rule.priority || 'P1';
    const payload = {
      kind: 'SERVER_ALERT',
      priority,
      dedupeKey: `pulse_alert:${ruleId}`,
      text: redactSecrets(String(text || '')).slice(0, 800),
      bypassQuietHours: priority === 'P0',
      timeSensitive: priority === 'P0'
    };

    try {
      if (this.notifyFn) {
        await this.notifyFn(payload);
      } else {
        const { notifyProactive } = require('../core/Notifier');
        await notifyProactive(payload);
      }
      return { fired: true, ruleId, priority };
    } catch (err) {
      console.warn(`[MONITOR-ALERTS] Failed to dispatch alert '${ruleId}': ${err.message}`);
      return { fired: false, reason: 'dispatch_error', error: err.message };
    }
  }

  /**
   * Immediate alert for fatal uncaughtException or security brute-force lockout.
   */
  async notifyImmediate(ruleId, text, priority = 'P0') {
    if (this.rules[ruleId]) {
      return this._dispatch(ruleId, text, priority);
    }
    // Ad-hoc security alert (e.g. brute-force lockout) with its own 15m cooldown
    const now = this.nowFn();
    const last = this._lastFiredAt.get(ruleId) || 0;
    if ((now - last) < this.cooldownMs) return { fired: false, reason: 'cooldown' };
    this._lastFiredAt.set(ruleId, now);
    const payload = {
      kind: 'SECURITY_ALERT',
      priority,
      dedupeKey: `pulse_alert:${ruleId}`,
      text: redactSecrets(String(text || '')).slice(0, 800),
      bypassQuietHours: true,
      timeSensitive: true
    };
    try {
      if (this.notifyFn) await this.notifyFn(payload);
      else await require('../core/Notifier').notifyProactive(payload);
      return { fired: true, ruleId, priority };
    } catch (err) {
      return { fired: false, reason: 'dispatch_error', error: err.message };
    }
  }

  /**
   * Evaluate 1-minute sample against all sustained threshold rules.
   * @param {{ rssMb: number, vpsAvailMb: number, vpsTotalMb?: number, elP95Ms: number }} sample
   * @param {{ http5xxLast5m?: number }} [extra]
   */
  async evaluateSample(sample, extra = {}) {
    if (!sample || typeof sample !== 'object') return [];
    const results = [];

    // 1. High Node RSS Memory (> 300 MiB sustained 3 min)
    const highRss = this.rules.high_rss;
    if (highRss.enabled && Number(sample.rssMb) > highRss.thresholdMb) {
      this._streaks.high_rss += 1;
      if (this._streaks.high_rss >= highRss.sustainedMinutes) {
        results.push(await this._dispatch(
          'high_rss',
          `[N.E.X.A Pulse Alert] High Node RSS Memory: ${sample.rssMb} MiB (threshold > ${highRss.thresholdMb} MiB sustained ${this._streaks.high_rss}m).`
        ));
      }
    } else {
      this._streaks.high_rss = 0;
    }

    // 2. Low VPS Available RAM (< 120 MiB sustained 3 min; skip if vpsAvailMb === 0 meaning unavailable)
    const lowRam = this.rules.low_vps_ram;
    if (lowRam.enabled && Number(sample.vpsAvailMb) > 0 && Number(sample.vpsAvailMb) < lowRam.thresholdMb) {
      this._streaks.low_vps_ram += 1;
      if (this._streaks.low_vps_ram >= lowRam.sustainedMinutes) {
        results.push(await this._dispatch(
          'low_vps_ram',
          `[N.E.X.A Pulse Alert] Low VPS Available RAM: ${sample.vpsAvailMb} MiB remaining (threshold < ${lowRam.thresholdMb} MiB sustained ${this._streaks.low_vps_ram}m).`
        ));
      }
    } else {
      this._streaks.low_vps_ram = 0;
    }

    // 3. Event Loop Stall (P95 > 100 ms sustained 1 min)
    const elRule = this.rules.event_loop_stall;
    if (elRule.enabled && Number(sample.elP95Ms) > elRule.thresholdMs) {
      this._streaks.event_loop_stall += 1;
      if (this._streaks.event_loop_stall >= elRule.sustainedMinutes) {
        results.push(await this._dispatch(
          'event_loop_stall',
          `[N.E.X.A Pulse Alert] Event Loop Stall detected: P95 latency ${sample.elP95Ms} ms (threshold > ${elRule.thresholdMs} ms).`
        ));
      }
    } else {
      this._streaks.event_loop_stall = 0;
    }

    // 4. HTTP 5xx Spike (>= 5 errors in last 5 minutes)
    const spikeRule = this.rules.http_5xx_spike;
    const count5xx = Number(extra.http5xxLast5m) || 0;
    if (spikeRule.enabled && count5xx >= spikeRule.thresholdCount) {
      this._streaks.http_5xx_spike += 1;
      if (this._streaks.http_5xx_spike >= spikeRule.sustainedMinutes) {
        results.push(await this._dispatch(
          'http_5xx_spike',
          `[N.E.X.A Pulse Alert] HTTP 5xx Spike: ${count5xx} server errors in the last 5 minutes.`
        ));
      }
    } else {
      this._streaks.http_5xx_spike = 0;
    }

    return results.filter(r => r && r.fired);
  }
}

module.exports = {
  AlertEngine,
  DEFAULT_RULES,
  DEFAULT_COOLDOWN_MS
};
