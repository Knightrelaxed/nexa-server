'use strict';
/**
 * ============================================================
 * N.E.X.A Pulse Monitor — Read-Only Systemd Inspector & Polkit Restart
 *
 * - Strictly allowlists ONLY the 4 N.E.X.A VPS units:
 *   nexa-server.service, nexa-log.service, nexa-term.service, caddy.service.
 * - Uses execFile (NO shell, NO sudo) with 2s timeout + 3s in-memory cache.
 * - Gracefully handles PM2 transition mode and non-Linux local development.
 * - Polkit restart is hardcoded strictly to `systemctl --no-block restart nexa-server.service`.
 * ============================================================
 */

const fs = require('fs');
const { execFile } = require('child_process');
const env = require('../config/env');

const ALLOWED_UNITS = Object.freeze([
  'nexa-server.service',
  'nexa-log.service',
  'nexa-term.service',
  'caddy.service'
]);

const SYSTEMCTL_PROPS = [
  'LoadState',
  'ActiveState',
  'SubState',
  'MainPID',
  'MemoryCurrent',
  'NRestarts',
  'ActiveEnterTimestamp',
  'UnitFileState'
];

const CACHE_TTL_MS = 3000;
const EXEC_TIMEOUT_MS = 2000;

function parseSystemctlShow(stdout) {
  const map = {};
  for (const line of String(stdout || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const loadState = map.LoadState || 'not-found';
  const activeState = map.ActiveState || 'unknown';
  const subState = map.SubState || '';
  const pid = Number(map.MainPID) > 0 ? Number(map.MainPID) : 0;
  const rawMem = map.MemoryCurrent;
  const memBytes = rawMem && rawMem !== '[not set]' && rawMem !== 'infinity' && /^\d+$/.test(rawMem)
    ? Number(rawMem)
    : 0;
  const nRestarts = /^\d+$/.test(map.NRestarts || '') ? Number(map.NRestarts) : 0;

  let uptimeSec = 0;
  if (activeState === 'active' && map.ActiveEnterTimestamp) {
    const parsedTs = Date.parse(map.ActiveEnterTimestamp);
    if (Number.isFinite(parsedTs)) {
      uptimeSec = Math.max(0, Math.floor((Date.now() - parsedTs) / 1000));
    }
  }

  return {
    installed: loadState === 'loaded',
    loadState,
    activeState,
    subState,
    pid,
    memoryMb: memBytes > 0 ? Math.round((memBytes / (1024 * 1024)) * 10) / 10 : 0,
    restarts: nRestarts,
    uptimeSec
  };
}

class SystemdInspector {
  /**
   * @param {object} [options]
   * @param {string} [options.platform]
   * @param {Function} [options.execFileFn]
   * @param {string} [options.termKillSwitchFile]
   * @param {number} [options.cacheTtlMs=3000]
   * @param {() => number} [options.nowFn]
   */
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.execFileFn = typeof options.execFileFn === 'function' ? options.execFileFn : execFile;
    this.termKillSwitchFile = options.termKillSwitchFile || env.NEXA_TERM_KILL_SWITCH_FILE || '/opt/nexa/etc/terminal.enabled';
    this.cacheTtlMs = Number.isFinite(options.cacheTtlMs) ? options.cacheTtlMs : CACHE_TTL_MS;
    this.nowFn = typeof options.nowFn === 'function' ? options.nowFn : () => Date.now();

    this._cache = null;
    this._cacheAt = 0;
    this._systemdVersion = null;
  }

  isTerminalKillSwitchEnabled() {
    if (env.NEXA_TERM_ENABLED) return true;
    const rawEnv = String(process.env.NEXA_TERM_ENABLED || process.env.NEXA_TERMINAL_ENABLED || '').trim().toLowerCase();
    if (rawEnv === 'true' || rawEnv === '1' || rawEnv === 'yes') return true;
    try {
      return fs.existsSync(this.termKillSwitchFile);
    } catch (_) {
      return false;
    }
  }

  _runExec(bin, args) {
    return new Promise((resolve, reject) => {
      this.execFileFn(bin, args, { timeout: EXEC_TIMEOUT_MS, windowsHide: true }, (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          return reject(err);
        }
        return resolve(String(stdout || ''));
      });
    });
  }

  async _inspectUnit(unit) {
    if (!ALLOWED_UNITS.includes(unit)) {
      throw new Error(`FORBIDDEN_UNIT: ${unit}`);
    }
    const args = ['show', unit, '--no-pager', ...SYSTEMCTL_PROPS.map(p => `--property=${p}`)];
    const out = await this._runExec('systemctl', args);
    return parseSystemctlShow(out);
  }

  async getSystemdVersion() {
    if (this._systemdVersion) return this._systemdVersion;
    if (this.platform !== 'linux') {
      this._systemdVersion = 'unavailable (non-linux)';
      return this._systemdVersion;
    }
    try {
      const out = await this._runExec('systemctl', ['--version']);
      const firstLine = out.split(/\r?\n/)[0] || '';
      const m = /systemd\s+(\d+)/i.exec(firstLine);
      this._systemdVersion = m ? `systemd ${m[1]}` : firstLine.trim().slice(0, 32);
    } catch (_) {
      this._systemdVersion = 'unavailable';
    }
    return this._systemdVersion;
  }

  /**
   * Inspect all 4 allowlisted N.E.X.A VPS units with 3s cache and PM2-transition fallback.
   * @param {{ rssMb?: number, cpuPct?: number, uptimeSec?: number }} [nodeFallback]
   */
  async getServicesStatus(nodeFallback = {}) {
    const now = this.nowFn();
    const termEnabled = this.isTerminalKillSwitchEnabled();

    if (this._cache && (now - this._cacheAt) < this.cacheTtlMs) {
      return this._attachDynamicFields(this._cache, nodeFallback, termEnabled);
    }

    const runningUnderPm2 = Boolean(process.env.PM2_HOME || process.env.pm_id !== undefined);

    if (this.platform !== 'linux') {
      const devSnapshot = {
        platform: this.platform,
        manager: runningUnderPm2 ? 'pm2' : 'local-dev',
        systemdVersion: 'local-dev',
        units: {
          'nexa-server.service': {
            name: 'nexa-server.service',
            installed: false,
            status: 'active',
            mode: runningUnderPm2 ? `pm2 · Node ${process.version}` : `local · Node ${process.version}`,
            memoryMb: nodeFallback.rssMb || 0,
            cpuPct: nodeFallback.cpuPct || 0,
            restarts: Number(process.env.restart_time || 0) || 0,
            uptimeSec: Math.floor(process.uptime()),
            pid: process.pid
          },
          'nexa-log.service': {
            name: 'nexa-log.service',
            installed: false,
            status: 'idle',
            mode: 'socket-activated',
            memoryMb: 0,
            cpuPct: 0,
            restarts: 0,
            uptimeSec: 0,
            pid: 0
          },
          'nexa-term.service': {
            name: 'nexa-term.service',
            installed: false,
            status: 'idle',
            mode: termEnabled ? 'socket · Kill Switch ON' : 'socket · Kill Switch OFF',
            memoryMb: 0,
            cpuPct: 0,
            restarts: 0,
            uptimeSec: 0,
            pid: 0
          },
          'caddy.service': {
            name: 'caddy.service',
            installed: false,
            status: 'unknown',
            mode: 'TLS 1.3 Proxy',
            memoryMb: 0,
            cpuPct: 0,
            restarts: 0,
            uptimeSec: 0,
            pid: 0
          }
        }
      };
      this._cache = devSnapshot;
      this._cacheAt = now;
      return this._attachDynamicFields(devSnapshot, nodeFallback, termEnabled);
    }

    const [systemdVersion, ...unitResults] = await Promise.all([
      this.getSystemdVersion(),
      ...ALLOWED_UNITS.map(u => this._inspectUnit(u).catch(() => ({
        installed: false,
        activeState: 'unknown',
        subState: '',
        pid: 0,
        memoryMb: 0,
        restarts: 0,
        uptimeSec: 0
      })))
    ]);

    const rawMap = {};
    ALLOWED_UNITS.forEach((u, i) => { rawMap[u] = unitResults[i]; });

    const serverUnit = rawMap['nexa-server.service'];
    const useSystemdForServer = serverUnit.installed && serverUnit.activeState === 'active';

    const snapshot = {
      platform: this.platform,
      manager: useSystemdForServer ? 'systemd' : (runningUnderPm2 ? 'pm2' : 'node'),
      systemdVersion,
      units: {
        'nexa-server.service': {
          name: 'nexa-server.service',
          installed: serverUnit.installed,
          status: useSystemdForServer ? 'active' : 'active',
          mode: useSystemdForServer
            ? `systemd · Node ${process.version}`
            : (runningUnderPm2 ? `pm2 (transition) · Node ${process.version}` : `node · ${process.version}`),
          memoryMb: useSystemdForServer && serverUnit.memoryMb > 0 ? serverUnit.memoryMb : (nodeFallback.rssMb || 0),
          cpuPct: nodeFallback.cpuPct || 0,
          restarts: useSystemdForServer ? serverUnit.restarts : (Number(process.env.restart_time || 0) || 0),
          uptimeSec: useSystemdForServer && serverUnit.uptimeSec > 0 ? serverUnit.uptimeSec : Math.floor(process.uptime()),
          pid: useSystemdForServer && serverUnit.pid > 0 ? serverUnit.pid : process.pid
        },
        'nexa-log.service': {
          name: 'nexa-log.service',
          installed: rawMap['nexa-log.service'].installed,
          status: rawMap['nexa-log.service'].activeState === 'active' ? 'active' : 'idle',
          mode: 'socket-activated',
          memoryMb: rawMap['nexa-log.service'].activeState === 'active' ? rawMap['nexa-log.service'].memoryMb : 0,
          cpuPct: 0,
          restarts: rawMap['nexa-log.service'].restarts,
          uptimeSec: rawMap['nexa-log.service'].uptimeSec,
          pid: rawMap['nexa-log.service'].pid
        },
        'nexa-term.service': {
          name: 'nexa-term.service',
          installed: rawMap['nexa-term.service'].installed,
          status: rawMap['nexa-term.service'].activeState === 'active' ? 'active' : 'idle',
          mode: termEnabled ? 'socket · Kill Switch ON' : 'socket · Kill Switch OFF',
          memoryMb: rawMap['nexa-term.service'].activeState === 'active' ? rawMap['nexa-term.service'].memoryMb : 0,
          cpuPct: 0,
          restarts: rawMap['nexa-term.service'].restarts,
          uptimeSec: rawMap['nexa-term.service'].uptimeSec,
          pid: rawMap['nexa-term.service'].pid
        },
        'caddy.service': {
          name: 'caddy.service',
          installed: rawMap['caddy.service'].installed,
          status: rawMap['caddy.service'].activeState === 'active' ? 'active' : (rawMap['caddy.service'].activeState || 'unknown'),
          mode: 'TLS 1.3 Proxy',
          memoryMb: rawMap['caddy.service'].memoryMb,
          cpuPct: 0,
          restarts: rawMap['caddy.service'].restarts,
          uptimeSec: rawMap['caddy.service'].uptimeSec,
          pid: rawMap['caddy.service'].pid
        }
      }
    };

    this._cache = snapshot;
    this._cacheAt = now;
    return this._attachDynamicFields(snapshot, nodeFallback, termEnabled);
  }

  _attachDynamicFields(base, nodeFallback, termEnabled) {
    const units = {
      ...base.units,
      'nexa-server.service': {
        ...base.units['nexa-server.service'],
        cpuPct: Number.isFinite(nodeFallback.cpuPct) ? nodeFallback.cpuPct : base.units['nexa-server.service'].cpuPct,
        memoryMb: base.manager === 'systemd' && base.units['nexa-server.service'].memoryMb > 0
          ? base.units['nexa-server.service'].memoryMb
          : (Number.isFinite(nodeFallback.rssMb) ? nodeFallback.rssMb : base.units['nexa-server.service'].memoryMb)
      },
      'nexa-term.service': {
        ...base.units['nexa-term.service'],
        mode: termEnabled ? 'socket · Kill Switch ON' : 'socket · Kill Switch OFF'
      }
    };
    return {
      platform: base.platform,
      manager: base.manager,
      systemdVersion: base.systemdVersion,
      terminalKillSwitchEnabled: termEnabled,
      canPolkitRestart: base.platform === 'linux' && base.manager === 'systemd',
      units: ALLOWED_UNITS.map(u => units[u])
    };
  }

  /**
   * Trigger a narrow, non-blocking Polkit restart of nexa-server.service ONLY.
   * Never uses sudo, never accepts an arbitrary unit name.
   */
  async restartNexaServer() {
    if (this.platform !== 'linux') {
      return { ok: false, code: 'UNSUPPORTED_PLATFORM', message: 'Systemd restart is only supported on Linux VPS.' };
    }
    // Check if nexa-server.service is actually active under systemd
    const info = await this._inspectUnit('nexa-server.service').catch(() => null);
    if (!info || !info.installed || info.activeState !== 'active') {
      return {
        ok: false,
        code: 'SYSTEMD_UNIT_NOT_ACTIVE',
        message: 'nexa-server.service is not active under systemd yet (still running under PM2 transition).'
      };
    }
    try {
      await this._runExec('systemctl', ['--no-block', 'restart', 'nexa-server.service']);
      this._cache = null;
      return { ok: true, code: 'RESTART_SCHEDULED', message: 'Graceful restart scheduled via systemd Polkit.' };
    } catch (err) {
      return {
        ok: false,
        code: 'POLKIT_DENIED_OR_ERROR',
        message: String(err && (err.stderr || err.message) || 'systemctl restart failed').trim().slice(0, 200)
      };
    }
  }

  invalidateCache() {
    this._cache = null;
    this._cacheAt = 0;
  }
}

module.exports = {
  SystemdInspector,
  ALLOWED_UNITS,
  parseSystemctlShow
};
