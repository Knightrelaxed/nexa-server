'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Zero-Overhead Metrics Collector
 *
 * - Collects Node.js V8/process telemetry (CPU %, RSS, Heap Used/Total/%,
 *   Event Loop Delay via perf_hooks, Active Handles via getActiveResourcesInfo).
 * - Collects Linux VPS host metrics (/proc/meminfo, /proc/stat) with safe
 *   cross-platform fallbacks on Windows/macOS.
 * - Provides Express HTTP timing middleware (1,000-sample circular ring ~8 KB)
 *   and lightweight N.E.X.A domain counters (AI/LLM, Bridges, Live Voice).
 * - Runs a 1-minute sampler writing to HistoryStore (flushed every 5 min).
 *   Zero 2-second timers run when no /monitor WebSocket client is connected.
 * ============================================================
 */

const fs = require('fs');
const os = require('os');
const v8 = require('v8');
const path = require('path');
const { execFile } = require('child_process');
const { performance, monitorEventLoopDelay } = require('perf_hooks');
const {
  FLAG_MOBILE_ONLINE,
  FLAG_WINDOWS_ONLINE,
  FLAG_LIVE_CALL_ACTIVE,
  FLAG_RESTARTED
} = require('./history_store');

const HTTP_RING_CAPACITY = 1000;
const AI_RING_CAPACITY = 256;
const ONE_MINUTE_MS = 60_000;
const FLUSH_EVERY_TICKS = 5; // Flush history ring to disk once every 5 minutes

function round2(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function computeMeanAndP95(values) {
  if (!values || values.length === 0) return { mean: 0, p95: 0 };
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  const sorted = values.slice().sort((a, b) => a - b);
  const p95Idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.95) - 1));
  return {
    mean: round2(sum / values.length),
    p95: round2(sorted[p95Idx])
  };
}

function readLinuxMemInfo() {
  if (process.platform !== 'linux') {
    const totalMb = round2(os.totalmem() / (1024 * 1024));
    const availMb = round2(os.freemem() / (1024 * 1024));
    return {
      totalMb,
      availMb,
      usedMb: round2(Math.max(0, totalMb - availMb)),
      swapTotalMb: 0,
      swapUsedMb: 0
    };
  }
  try {
    const raw = fs.readFileSync('/proc/meminfo', 'utf8');
    const kb = {};
    for (const line of raw.split('\n')) {
      const m = /^([A-Za-z0-9_()]+):\s+(\d+)\s*kB/i.exec(line);
      if (m) kb[m[1]] = Number(m[2]);
    }
    const totalMb = round2((kb.MemTotal || 0) / 1024);
    const availKb = kb.MemAvailable !== undefined ? kb.MemAvailable : ((kb.MemFree || 0) + (kb.Buffers || 0) + (kb.Cached || 0));
    const availMb = round2(availKb / 1024);
    const swapTotalMb = round2((kb.SwapTotal || 0) / 1024);
    const swapFreeMb = round2((kb.SwapFree || 0) / 1024);
    return {
      totalMb,
      availMb,
      usedMb: round2(Math.max(0, totalMb - availMb)),
      swapTotalMb,
      swapUsedMb: round2(Math.max(0, swapTotalMb - swapFreeMb))
    };
  } catch (_) {
    const totalMb = round2(os.totalmem() / (1024 * 1024));
    const availMb = round2(os.freemem() / (1024 * 1024));
    return { totalMb, availMb, usedMb: round2(Math.max(0, totalMb - availMb)), swapTotalMb: 0, swapUsedMb: 0 };
  }
}

function readLinuxCpuTotals() {
  if (process.platform !== 'linux') return null;
  try {
    const firstLine = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0] || '';
    const parts = firstLine.trim().split(/\s+/).slice(1).map(Number);
    if (parts.length < 4 || parts.some(n => !Number.isFinite(n))) return null;
    const idle = (parts[3] || 0) + (parts[4] || 0);
    const total = parts.reduce((acc, v) => acc + v, 0);
    return { idle, total };
  } catch (_) {
    return null;
  }
}

function readHostPrivateIp() {
  try {
    const nets = os.networkInterfaces();
    for (const addrs of Object.values(nets)) {
      if (!Array.isArray(addrs)) continue;
      for (const a of addrs) {
        if (a && a.family === 'IPv4' && !a.internal && a.address) {
          return a.address;
        }
      }
    }
  } catch (_) {}
  return '127.0.0.1';
}

function readRootDiskUsage() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const target = process.platform === 'win32' ? path.parse(process.cwd()).root : '/';
      const st = fs.statfsSync(target);
      const bsize = Number(st.bsize) || 4096;
      const totalBytes = (Number(st.blocks) || 0) * bsize;
      const availBytes = (Number(st.bavail) || 0) * bsize;
      const freeBytes = (Number(st.bfree) || 0) * bsize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const gb = 1024 * 1024 * 1024;
      const totalGb = round2(totalBytes / gb);
      const availGb = round2(availBytes / gb);
      const usedGb = round2(usedBytes / gb);
      const usedPct = totalBytes > 0 ? round2((usedBytes / totalBytes) * 100) : 0;
      return { totalGb, usedGb, availGb, usedPct };
    }
  } catch (_) {}
  return { totalGb: 0, usedGb: 0, availGb: 0, usedPct: 0 };
}

function defaultGitMetadata() {
  let pkgVersion = 'unknown';
  try {
    pkgVersion = require('../../package.json').version || 'unknown';
  } catch (_) {}
  return {
    repository: 'nexa-server',
    appVersion: pkgVersion,
    branch: 'unknown',
    commitShort: 'unknown',
    commitMessage: 'N/A',
    commitDate: null,
    dirty: false
  };
}

async function readGitMetadataAsync(repoDir) {
  const cwd = repoDir || path.resolve(__dirname, '../..');
  const opts = { cwd, timeout: 1500, encoding: 'utf8', windowsHide: true };
  const safeRun = (args) => new Promise((resolve) => {
    execFile('git', args, opts, (err, stdout) => {
      if (err) return resolve('');
      return resolve(String(stdout || '').trim());
    });
  });

  const [branch, commitShort, commitMessage, commitDate, porcelain] = await Promise.all([
    safeRun(['rev-parse', '--abbrev-ref', 'HEAD']),
    safeRun(['rev-parse', '--short', 'HEAD']),
    safeRun(['log', '-1', '--pretty=%s']),
    safeRun(['log', '-1', '--pretty=%cI']),
    safeRun(['status', '--porcelain', '-uno'])
  ]);

  const base = defaultGitMetadata();
  return {
    ...base,
    branch: branch || base.branch,
    commitShort: commitShort || base.commitShort,
    commitMessage: (commitMessage || base.commitMessage).slice(0, 120),
    commitDate: commitDate || null,
    dirty: porcelain.length > 0
  };
}

class MetricsCollector {
  /**
   * @param {object} [options]
   * @param {import('./history_store').HistoryStore} [options.historyStore]
   * @param {import('./issue_tracker').IssueTracker} [options.issueTracker]
   * @param {import('./alert_engine').AlertEngine} [options.alertEngine]
   * @param {string} [options.repoDir]
   * @param {number} [options.sampleIntervalMs=60000]
   * @param {() => number} [options.nowFn]
   * @param {() => object} [options.domainStatsProvider]
   */
  constructor(options = {}) {
    this.historyStore = options.historyStore || null;
    this.issueTracker = options.issueTracker || null;
    this.alertEngine = options.alertEngine || null;
    this.repoDir = options.repoDir || path.resolve(__dirname, '../..');
    this.sampleIntervalMs = Math.max(1000, Number(options.sampleIntervalMs) || ONE_MINUTE_MS);
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();
    this.domainStatsProvider = typeof options.domainStatsProvider === 'function'
      ? options.domainStatsProvider
      : () => this._readDefaultDomainStats();

    // Event loop monitor (enabled on start() or first snapshot).
    // Node's monitorEventLoopDelay histogram includes the timer resolution interval itself,
    // so we subtract _elResolutionMs when reading true event-loop lag.
    this._elResolutionMs = 20;
    this._elMonitor = monitorEventLoopDelay({ resolution: this._elResolutionMs });
    this._elEnabled = false;

    // CPU sampling baselines
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuHrTime = process.hrtime.bigint();
    this._lastCpuPct = 0;
    this._lastHostCpu = readLinuxCpuTotals();
    this._lastVpsCpuPct = 0;

    // HTTP timing ring buffer (fixed 1,000 samples)
    this._httpDurations = new Float64Array(HTTP_RING_CAPACITY);
    this._httpTimestamps = new Float64Array(HTTP_RING_CAPACITY);
    this._httpWriteIdx = 0;
    this._httpCount = 0;
    this._activeRequests = 0;

    // AI / LLM call ring buffer (fixed 256 samples)
    this._aiDurations = new Float64Array(AI_RING_CAPACITY);
    this._aiTimestamps = new Float64Array(AI_RING_CAPACITY);
    this._aiWriteIdx = 0;
    this._aiCount = 0;
    this._aiErrorsTotal = 0;

    // Lifecycle state
    this._sampleTimer = null;
    this._tickCount = 0;
    this._bootMarked = false;
    this._lastResetAt = this.nowFn();
    this._gitMeta = defaultGitMetadata();
    this._gitRefreshPromise = null;

    // Host static + cached disk metadata (refreshed max 1x/60s via native statfsSync)
    this._hostname = os.hostname();
    this._privateIp = readHostPrivateIp();
    this._diskCache = null;
    this._diskCacheAt = 0;

    // Bounded in-memory Cron / Background Jobs tracker (max 40 jobs, <4 KB RAM)
    this._cronJobs = new Map();
  }

  _readCachedDisk(now = this.nowFn()) {
    if (this._diskCache && (now - this._diskCacheAt) < 60_000) {
      return this._diskCache;
    }
    this._diskCache = readRootDiskUsage();
    this._diskCacheAt = now;
    return this._diskCache;
  }

  registerCronJob(name, schedule = '') {
    const key = String(name || '').trim().slice(0, 64);
    if (!key) return;
    if (!this._cronJobs.has(key) && this._cronJobs.size >= 40) return;
    const existing = this._cronJobs.get(key);
    if (existing) {
      if (schedule) existing.schedule = String(schedule).slice(0, 48);
      return;
    }
    this._cronJobs.set(key, {
      name: key,
      schedule: String(schedule || '').slice(0, 48),
      lastRunAt: null,
      lastStatus: 'scheduled',
      lastDurationMs: 0,
      runCount: 0,
      failCount: 0,
      lastError: ''
    });
  }

  recordCronRun(name, status, durationMs = 0, errorMsg = '', schedule = '') {
    const key = String(name || '').trim().slice(0, 64);
    if (!key) return;
    if (!this._cronJobs.has(key)) {
      if (this._cronJobs.size >= 40) return;
      this.registerCronJob(key, schedule);
    }
    const job = this._cronJobs.get(key);
    if (!job) return;
    if (schedule && !job.schedule) job.schedule = String(schedule).slice(0, 48);
    job.lastRunAt = this.nowFn();
    job.lastStatus = status === 'error' || status === 'FAILED' ? 'failed' : 'ok';
    job.lastDurationMs = Math.max(0, Math.round(Number(durationMs) || 0));
    job.runCount += 1;
    if (job.lastStatus === 'failed') {
      job.failCount += 1;
      job.lastError = String(errorMsg || '').replace(/[\r\n]+/g, ' ').slice(0, 180);
    } else {
      job.lastError = '';
    }
  }

  getCronJobs() {
    return Array.from(this._cronJobs.values()).sort((a, b) => {
      if (a.lastStatus === 'failed' && b.lastStatus !== 'failed') return -1;
      if (b.lastStatus === 'failed' && a.lastStatus !== 'failed') return 1;
      const ta = a.lastRunAt || 0;
      const tb = b.lastRunAt || 0;
      if (ta !== tb) return tb - ta;
      return a.name.localeCompare(b.name);
    });
  }

  _ensureElEnabled() {
    if (!this._elEnabled) {
      this._elMonitor.enable();
      this._elEnabled = true;
    }
  }

  getGitMetadata() {
    return this._gitMeta;
  }

  refreshGitMetadata() {
    if (this._gitRefreshPromise) return this._gitRefreshPromise;
    this._gitRefreshPromise = readGitMetadataAsync(this.repoDir)
      .then((meta) => {
        this._gitMeta = meta;
        return meta;
      })
      .catch(() => this._gitMeta)
      .finally(() => {
        this._gitRefreshPromise = null;
      });
    return this._gitRefreshPromise;
  }

  _computeProcessCpuPct() {
    const nowHr = process.hrtime.bigint();
    const elapsedUs = Number(nowHr - this._lastCpuHrTime) / 1000;
    if (elapsedUs < 50_000) {
      // Avoid noisy sub-50ms spikes; return cached reading
      return this._lastCpuPct;
    }
    const delta = process.cpuUsage(this._lastCpuUsage);
    this._lastCpuUsage = process.cpuUsage();
    this._lastCpuHrTime = nowHr;
    const cpuUs = delta.user + delta.system;
    const pct = Math.max(0, Math.min(100 * Math.max(1, os.cpus().length), (cpuUs / elapsedUs) * 100));
    this._lastCpuPct = round2(pct);
    return this._lastCpuPct;
  }

  _computeVpsCpuPct() {
    const cur = readLinuxCpuTotals();
    if (!cur || !this._lastHostCpu) {
      const load1 = os.loadavg()[0] || 0;
      const cores = Math.max(1, os.cpus().length);
      return round2(Math.min(100, (load1 / cores) * 100));
    }
    const totalDelta = cur.total - this._lastHostCpu.total;
    const idleDelta = cur.idle - this._lastHostCpu.idle;
    if (totalDelta <= 0) return this._lastVpsCpuPct;
    this._lastHostCpu = cur;
    const busyPct = ((totalDelta - idleDelta) / totalDelta) * 100;
    this._lastVpsCpuPct = round2(Math.max(0, Math.min(100, busyPct)));
    return this._lastVpsCpuPct;
  }

  _readEventLoopStats() {
    this._ensureElEnabled();
    if (this._elMonitor.count === 0) {
      return { meanMs: 0, p95Ms: 0, maxMs: 0 };
    }
    const resMs = this._elResolutionMs || 0;
    const rawMean = Math.max(0, (this._elMonitor.mean / 1e6) - resMs);
    const rawP95 = Math.max(0, (this._elMonitor.percentile(95) / 1e6) - resMs);
    const rawMax = Math.max(0, (this._elMonitor.max / 1e6) - resMs);
    return {
      meanMs: Number.isFinite(rawMean) && rawMean >= 0 && rawMean < 60_000 ? round2(rawMean) : 0,
      p95Ms: Number.isFinite(rawP95) && rawP95 >= 0 && rawP95 < 60_000 ? round2(rawP95) : 0,
      maxMs: Number.isFinite(rawMax) && rawMax >= 0 && rawMax < 60_000 ? round2(rawMax) : 0
    };
  }

  _readActiveHandlesCount() {
    try {
      if (typeof process.getActiveResourcesInfo === 'function') {
        return process.getActiveResourcesInfo().length;
      }
    } catch (_) {}
    return 0;
  }

  recordHttpRequest(durationMs, now = this.nowFn()) {
    const dur = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this._httpDurations[this._httpWriteIdx] = dur;
    this._httpTimestamps[this._httpWriteIdx] = now;
    this._httpWriteIdx = (this._httpWriteIdx + 1) % HTTP_RING_CAPACITY;
    if (this._httpCount < HTTP_RING_CAPACITY) this._httpCount += 1;
  }

  getHttpStats(now = this.nowFn()) {
    const cutoff1m = now - ONE_MINUTE_MS;
    const allSamples = [];
    let reqLast1m = 0;
    for (let i = 0; i < this._httpCount; i++) {
      const dur = this._httpDurations[i];
      allSamples.push(dur);
      if (this._httpTimestamps[i] >= cutoff1m) reqLast1m += 1;
    }
    const { mean, p95 } = computeMeanAndP95(allSamples);
    return {
      reqPerMin: reqLast1m,
      meanMs: mean,
      p95Ms: p95,
      sampleCount: this._httpCount,
      activeRequests: this._activeRequests
    };
  }

  /**
   * Lightweight Express middleware measuring HTTP request latency & active concurrency.
   * Excludes /monitor/api/* and /monitor/ws/* to prevent self-observation distortion.
   */
  httpMetricsMiddleware(options = {}) {
    const excludePrefix = options.excludePrefix !== undefined ? options.excludePrefix : '/monitor/';
    return (req, res, next) => {
      const reqUrl = String(req.originalUrl || req.url || '');
      if (excludePrefix && reqUrl.startsWith(excludePrefix)) {
        return next();
      }
      this._activeRequests += 1;
      const startMs = performance.now();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this._activeRequests = Math.max(0, this._activeRequests - 1);
        this.recordHttpRequest(performance.now() - startMs);
      };
      res.on('finish', finish);
      res.on('close', finish);
      return next();
    };
  }

  recordAiCall(durationMs, meta = {}, now = this.nowFn()) {
    const dur = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this._aiDurations[this._aiWriteIdx] = dur;
    this._aiTimestamps[this._aiWriteIdx] = now;
    this._aiWriteIdx = (this._aiWriteIdx + 1) % AI_RING_CAPACITY;
    if (this._aiCount < AI_RING_CAPACITY) this._aiCount += 1;
    if (meta && meta.ok === false) {
      this._aiErrorsTotal += 1;
    }
  }

  getAiStats(now = this.nowFn()) {
    const cutoff1m = now - ONE_MINUTE_MS;
    const recent = [];
    let reqLast1m = 0;
    for (let i = 0; i < this._aiCount; i++) {
      if (this._aiTimestamps[i] >= cutoff1m) {
        reqLast1m += 1;
        recent.push(this._aiDurations[i]);
      }
    }
    // If idle in last 1m, show mean over all buffered AI calls so operator sees recent baseline
    const all = [];
    if (recent.length === 0) {
      for (let i = 0; i < this._aiCount; i++) all.push(this._aiDurations[i]);
    }
    const { mean, p95 } = computeMeanAndP95(recent.length > 0 ? recent : all);
    return {
      reqPerMin: reqLast1m,
      meanMs: mean,
      p95Ms: p95,
      sampleCount: this._aiCount,
      errorsTotal: this._aiErrorsTotal
    };
  }

  _readDefaultDomainStats() {
    const now = this.nowFn();
    let mobile = { connected: false, rttMs: null, uptimeSec: 0, pendingProactive: 0 };
    let windows = { connected: false, rttMs: null, uptimeSec: 0 };
    let activeLiveCalls = 0;
    let enrolledDevices = 0;

    // Helper: read exports ONLY if module is already loaded in Node require.cache
    // so collectSnapshot() NEVER eagerly loads heavy subsystems (e.g. Live_Voice_Engine / googleapis) into RAM.
    const getLoaded = (relPath) => {
      try {
        const resolved = require.resolve(relPath);
        const cached = require.cache[resolved];
        return cached ? cached.exports : null;
      } catch (_) {
        return null;
      }
    };

    try {
      const mobileClient = getLoaded('../interfaces/bridge/mobile_bridge/client');
      if (mobileClient) {
        const ws = mobileClient.getClient();
        const connected = mobileClient.isConnected();
        mobile = {
          connected,
          rttMs: connected && ws && Number.isFinite(ws.lastRttMs) ? ws.lastRttMs : null,
          uptimeSec: connected && ws && Number.isFinite(ws.connectedAt) ? Math.max(0, Math.floor((now - ws.connectedAt) / 1000)) : 0,
          pendingProactive: typeof mobileClient.getPendingProactiveCount === 'function' ? mobileClient.getPendingProactiveCount() : 0
        };
      }
    } catch (_) {}

    try {
      const windowsClient = getLoaded('../interfaces/bridge/windows_bridge/client');
      if (windowsClient) {
        const ws = windowsClient.getClient();
        const connected = windowsClient.isConnected();
        windows = {
          connected,
          rttMs: connected && ws && Number.isFinite(ws.lastRttMs) ? ws.lastRttMs : null,
          uptimeSec: connected && ws && Number.isFinite(ws.connectedAt) ? Math.max(0, Math.floor((now - ws.connectedAt) / 1000)) : 0
        };
      }
    } catch (_) {}

    try {
      const liveVoice = getLoaded('../core/Live_Voice_Engine');
      if (liveVoice) {
        if (typeof liveVoice.getActiveSessionCount === 'function') {
          activeLiveCalls = liveVoice.getActiveSessionCount();
        } else {
          activeLiveCalls = liveVoice.getActiveSession() ? 1 : 0;
        }
      }
    } catch (_) {}

    try {
      const ticketMod = getLoaded('../core/auth/ticket_service');
      if (ticketMod && typeof ticketMod.getTicketService === 'function') {
        const store = ticketMod.getTicketService().deviceStore;
        if (store && typeof store.listDevices === 'function') {
          enrolledDevices = store.listDevices().length;
        }
      }
    } catch (_) {}

    let aiHealth = { groups: [], keysCoolingDown: [], openCount: 0, halfOpenCount: 0, coolingKeysCount: 0 };
    try {
      const providerHealth = getLoaded('../core/Provider_Health');
      if (providerHealth && typeof providerHealth.snapshot === 'function') {
        const snap = providerHealth.snapshot();
        const groupList = Object.entries((snap && snap.groups) || {}).map(([name, g]) => ({
          name,
          state: g.state || 'CLOSED',
          fails: Number(g.fails) || 0,
          reopenInSec: Math.ceil((Number(g.reopenInMs) || 0) / 1000)
        }));
        const coolingList = Array.isArray(snap && snap.keysCoolingDown)
          ? snap.keysCoolingDown.map(k => ({
              key: String(k.key || ''),
              resumeInSec: Math.ceil((Number(k.resumeInMs) || 0) / 1000)
            }))
          : [];
        aiHealth = {
          groups: groupList,
          keysCoolingDown: coolingList,
          openCount: groupList.filter(g => g.state === 'OPEN').length,
          halfOpenCount: groupList.filter(g => g.state === 'HALF_OPEN').length,
          coolingKeysCount: coolingList.length
        };
      }
    } catch (_) {}

    return { mobile, windows, activeLiveCalls, enrolledDevices, aiHealth };
  }

  /**
   * Collect a complete real-time telemetry snapshot (~0.2ms, zero disk I/O except /proc).
   */
  collectSnapshot() {
    const now = this.nowFn();
    const mem = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();
    const vpsMem = readLinuxMemInfo();
    const cpuPct = this._computeProcessCpuPct();
    const vpsCpuPct = this._computeVpsCpuPct();
    const el = this._readEventLoopStats();
    const http = this.getHttpStats(now);
    const ai = this.getAiStats(now);
    const domain = this.domainStatsProvider();
    const activeHandles = this._readActiveHandlesCount();
    const load = os.loadavg().map(round2);

    const rssMb = round2(mem.rss / (1024 * 1024));
    const heapUsedMb = round2(mem.heapUsed / (1024 * 1024));
    const heapTotalMb = round2(mem.heapTotal / (1024 * 1024));
    const heapLimitMb = round2(heapStats.heap_size_limit / (1024 * 1024));
    const heapPct = heapTotalMb > 0 ? round2((heapUsedMb / heapTotalMb) * 100) : 0;

    return {
      ts: now,
      tsSec: Math.floor(now / 1000),
      cpu: {
        processPct: cpuPct,
        vpsPct: vpsCpuPct,
        cores: Math.max(1, os.cpus().length),
        loadAvg: load
      },
      memory: {
        rssMb,
        heapUsedMb,
        heapTotalMb,
        heapLimitMb,
        heapPct,
        externalMb: round2(mem.external / (1024 * 1024)),
        vpsTotalMb: vpsMem.totalMb,
        vpsUsedMb: vpsMem.usedMb,
        vpsAvailMb: vpsMem.availMb,
        swapTotalMb: vpsMem.swapTotalMb,
        swapUsedMb: vpsMem.swapUsedMb
      },
      disk: this._readCachedDisk(now),
      eventLoop: el,
      http,
      runtime: {
        pid: process.pid,
        hostname: this._hostname,
        privateIp: this._privateIp,
        nodeVersion: process.version,
        v8Version: process.versions.v8,
        uptimeSec: Math.floor(process.uptime()),
        nodeEnv: process.env.NODE_ENV || 'development',
        activeHandles,
        activeRequests: this._activeRequests,
        lastResetAt: this._lastResetAt
      },
      ai,
      domain,
      git: this.getGitMetadata()
    };
  }

  /**
   * Execute one 1-minute sample tick: append to HistoryStore, flush every 5m, evaluate alerts.
   */
  async sampleOnce() {
    const snap = this.collectSnapshot();
    const issuesDelta = this.issueTracker ? this.issueTracker.consumeIntervalDelta() : 0;

    let flags = 0;
    if (snap.domain && snap.domain.mobile && snap.domain.mobile.connected) flags |= FLAG_MOBILE_ONLINE;
    if (snap.domain && snap.domain.windows && snap.domain.windows.connected) flags |= FLAG_WINDOWS_ONLINE;
    if (snap.domain && snap.domain.activeLiveCalls > 0) flags |= FLAG_LIVE_CALL_ACTIVE;
    if (!this._bootMarked) {
      flags |= FLAG_RESTARTED;
      this._bootMarked = true;
    }

    const record = {
      tsSec: snap.tsSec,
      cpuPct: snap.cpu.processPct,
      vpsCpuPct: snap.cpu.vpsPct,
      vpsAvailMb: snap.memory.vpsAvailMb,
      rssMb: snap.memory.rssMb,
      heapUsedMb: snap.memory.heapUsedMb,
      heapTotalMb: snap.memory.heapTotalMb,
      elMeanMs: snap.eventLoop.meanMs,
      elP95Ms: snap.eventLoop.p95Ms,
      httpReqMin: snap.http.reqPerMin,
      httpMeanMs: snap.http.meanMs,
      httpP95Ms: snap.http.p95Ms,
      activeHandles: snap.runtime.activeHandles,
      activeReqs: snap.runtime.activeRequests,
      issuesDelta,
      flags,
      aiReqMin: snap.ai.reqPerMin,
      aiMeanMs: snap.ai.meanMs
    };

    if (this.historyStore) {
      this.historyStore.append(record);
      this._tickCount += 1;
      if (this._tickCount % FLUSH_EVERY_TICKS === 0) {
        this.historyStore.flush();
      }
    }

    if (this.alertEngine) {
      const http5xxLast5m = this.issueTracker
        ? this.issueTracker.countEventsInWindow(5 * 60_000, 'HTTP-5XX', snap.ts)
        : 0;
      await this.alertEngine.evaluateSample(record, { http5xxLast5m });
    }

    return { snapshot: snap, record };
  }

  /**
   * Reset in-memory latency histograms and temporary counters (RESET MONIT).
   */
  resetMonit() {
    if (this._elEnabled) {
      try { this._elMonitor.reset(); } catch (_) {}
    }
    this._httpDurations.fill(0);
    this._httpTimestamps.fill(0);
    this._httpWriteIdx = 0;
    this._httpCount = 0;

    this._aiDurations.fill(0);
    this._aiTimestamps.fill(0);
    this._aiWriteIdx = 0;
    this._aiCount = 0;
    this._aiErrorsTotal = 0;

    this._lastResetAt = this.nowFn();
    return { resetAt: this._lastResetAt };
  }

  start() {
    if (this._sampleTimer) return;
    this._ensureElEnabled();
    this.refreshGitMetadata();
    this._sampleTimer = setInterval(() => {
      this.sampleOnce().catch(err => {
        console.warn(`[MONITOR-COLLECTOR] Sample tick warning: ${err.message}`);
      });
    }, this.sampleIntervalMs);
    if (typeof this._sampleTimer.unref === 'function') {
      this._sampleTimer.unref();
    }
  }

  destroy() {
    if (this._sampleTimer) {
      clearInterval(this._sampleTimer);
      this._sampleTimer = null;
    }
    if (this._elEnabled) {
      try { this._elMonitor.disable(); } catch (_) {}
      this._elEnabled = false;
    }
    if (this.historyStore) {
      this.historyStore.flush();
    }
  }
}

module.exports = {
  MetricsCollector,
  computeMeanAndP95,
  readLinuxMemInfo,
  readGitMetadataAsync
};
