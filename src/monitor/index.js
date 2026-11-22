'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Subsystem Facade (Phase 5A Foundation)
 *
 * Central entry point uniting:
 * - HistoryStore (726 KB fixed 7-day binary ring + health heatmap)
 * - IssueTracker (deduplicated FR-SEC-04 redacted error store)
 * - SystemdInspector (read-only allowlisted units + Polkit restart)
 * - AlertEngine (sustained threshold alerts -> Mobile Bridge Notifier)
 * - MetricsCollector (perf_hooks, V8/OS, HTTP middleware, N.E.X.A domain)
 * ============================================================
 */

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { HistoryStore } = require('./history_store');
const { IssueTracker } = require('./issue_tracker');
const { SystemdInspector } = require('./systemd_inspector');
const { AlertEngine } = require('./alert_engine');
const { MetricsCollector } = require('./metrics_collector');
const { MonitorAuthService } = require('./auth_service');
const { createMonitorRouter } = require('./router');
const { MonitorMetricsWebSocket } = require('./ws_metrics');

let _singleton = null;

function resolveMonitorDataDir() {
  const configured = String(env.NEXA_MONITOR_DATA_DIR || process.env.NEXA_MONITOR_DATA_DIR || '').trim();
  if (configured) return configured;

  // Production Linux VPS default: /var/lib/nexa (if writable)
  if (process.platform === 'linux') {
    const prodDir = '/var/lib/nexa';
    try {
      fs.mkdirSync(prodDir, { recursive: true });
      fs.accessSync(prodDir, fs.constants.W_OK);
      return prodDir;
    } catch (_) {}
  }

  // Local dev / Windows fallback (gitignored)
  return path.resolve(__dirname, '../../data/monitor');
}

function createMonitor(options = {}) {
  const dataDir = options.memoryOnly ? null : (options.dataDir || resolveMonitorDataDir());

  const historyStore = new HistoryStore({
    filePath: dataDir ? path.join(dataDir, 'monitor_metrics_7d.bin') : null,
    capacity: options.historyCapacity
  });

  let collectorRef = null;
  const issueTracker = new IssueTracker({
    filePath: dataDir ? path.join(dataDir, 'monitor_issues.json') : null,
    getCommitFn: () => {
      try {
        return collectorRef ? collectorRef.getGitMetadata().commitShort : '';
      } catch (_) {
        return '';
      }
    }
  });

  const alertEngine = new AlertEngine({
    configPath: dataDir ? path.join(dataDir, 'monitor_alerts.json') : null,
    notifyFn: options.notifyFn
  });

  const authService = new MonitorAuthService({
    username: options.username,
    passwordHash: options.passwordHash,
    alertEngine,
    allowedOrigins: options.allowedOrigins,
    sessionTtlMs: options.sessionTtlMs,
    nowFn: options.nowFn
  });

  const systemdInspector = new SystemdInspector({
    platform: options.platform,
    execFileFn: options.execFileFn
  });

  const metricsCollector = new MetricsCollector({
    historyStore,
    issueTracker,
    alertEngine,
    repoDir: options.repoDir,
    sampleIntervalMs: options.sampleIntervalMs,
    domainStatsProvider: options.domainStatsProvider
  });
  collectorRef = metricsCollector;

  let wsMetrics = null;

  const instance = {
    dataDir,
    historyStore,
    issueTracker,
    alertEngine,
    authService,
    systemdInspector,
    metricsCollector,

    start() {
      metricsCollector.start();
    },

    destroy() {
      if (wsMetrics) {
        wsMetrics.close();
        wsMetrics = null;
      }
      metricsCollector.destroy();
      issueTracker.destroy();
    },

    createRouter(routerOpts) {
      return createMonitorRouter(instance, routerOpts);
    },

    attachMetricsWebSocket(httpServer, wsOpts) {
      if (!wsMetrics) {
        wsMetrics = new MonitorMetricsWebSocket(instance, wsOpts);
      }
      wsMetrics.attach(httpServer);
      return wsMetrics;
    },

    getMetricsWebSocket() {
      return wsMetrics;
    },

    httpMetricsMiddleware(opts) {
      return metricsCollector.httpMetricsMiddleware(opts);
    },

    recordIssue(subsystem, errorOrMsg, meta) {
      return issueTracker.recordIssue(subsystem, errorOrMsg, meta);
    },

    recordAiCall(durationMs, meta) {
      metricsCollector.recordAiCall(durationMs, meta);
    },

    registerCronJob(name, schedule) {
      metricsCollector.registerCronJob(name, schedule);
    },

    recordCronRun(name, status, durationMs, errorMsg, schedule) {
      metricsCollector.recordCronRun(name, status, durationMs, errorMsg, schedule);
    },

    resetAiBreakers() {
      try {
        const providerHealth = require('../core/Provider_Health');
        if (typeof providerHealth.resetBreakers === 'function') {
          return providerHealth.resetBreakers();
        }
      } catch (_) {}
      return { clearedGroups: 0, clearedKeys: 0 };
    },

    sampleOnce() {
      return metricsCollector.sampleOnce();
    },

    async getOverview() {
      const snap = metricsCollector.collectSnapshot();
      const [services, issueSummary] = await Promise.all([
        systemdInspector.getServicesStatus({
          rssMb: snap.memory.rssMb,
          cpuPct: snap.cpu.processPct,
          uptimeSec: snap.runtime.uptimeSec
        }),
        Promise.resolve(issueTracker.getSummary())
      ]);
      const spark1h = historyStore.queryRange(3600, 60);
      const heatmap = historyStore.getHealthHeatmap(168);

      return {
        snapshot: snap,
        services,
        issues: issueSummary,
        cronJobs: metricsCollector.getCronJobs(),
        spark1h,
        heatmap
      };
    }
  };

  return instance;
}

function getMonitor() {
  if (!_singleton) {
    // During automated test runs without explicit dataDir, avoid writing files into repo data/
    const isTestEnv = process.env.NODE_ENV === 'test' || process.argv.some(a => a.includes('.test.js'));
    _singleton = createMonitor({ memoryOnly: isTestEnv });
  }
  return _singleton;
}

function destroyMonitor() {
  if (_singleton) {
    _singleton.destroy();
    _singleton = null;
  }
}

module.exports = {
  createMonitor,
  getMonitor,
  destroyMonitor,
  resolveMonitorDataDir,
  httpMetricsMiddleware: (opts) => getMonitor().httpMetricsMiddleware(opts),
  recordIssue: (subsystem, errorOrMsg, meta) => getMonitor().recordIssue(subsystem, errorOrMsg, meta),
  recordAiCall: (durationMs, meta) => getMonitor().recordAiCall(durationMs, meta),
  registerCronJob: (name, schedule) => getMonitor().registerCronJob(name, schedule),
  recordCronRun: (name, status, durationMs, errorMsg, schedule) => getMonitor().recordCronRun(name, status, durationMs, errorMsg, schedule),
  HistoryStore,
  IssueTracker,
  SystemdInspector,
  AlertEngine,
  MetricsCollector,
  MonitorAuthService,
  createMonitorRouter,
  MonitorMetricsWebSocket
};
