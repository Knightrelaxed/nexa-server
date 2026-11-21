'use strict';
/**
 * ============================================================
 * N.E.X.A Server - Central Structured Logger & Secret Redactor
 * - FR-SEC-04: Source-level redaction of secrets, tokens, keys,
 *   account numbers, and OTPs before stdout/stderr & in-memory ring.
 * - PRD 10.3: Automatic [cat=FINANCE|BRIDGE|AUTH] tagging so
 *   nexa-log sidecar maps cat_flags accurately.
 * - Optional systemd syslog priority prefix (<3>/<4>/<6>/<7>)
 *   enabled automatically when running under systemd journald.
 * ============================================================
 */

const util = require('util');

const MAX_LOGS = 50;
const systemLogs = [];

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;
const originalDebug = console.debug || console.log;
let isLogging = false;

const SYSLOG_PRIORITY = {
  ERROR: 3,
  WARN: 4,
  INFO: 6,
  DEBUG: 7
};

const EXPLICIT_CAT_RE = /^\[cat=(FINANCE|BRIDGE|AUTH)\]\s*/i;
const MULTI_EXPLICIT_CAT_RE = /^(?:\[cat=(FINANCE|BRIDGE|AUTH)\]\s*)+/i;

const FINANCE_PATTERNS = [
  /\[(?:SUPABASE[_-])?FINANCE[^\]]*\]/i,
  /\[EMAIL[_-]FINANCE[^\]]*\]/i,
  /\[MUTASI[^\]]*\]/i,
  /\[BUDGET(?:[_-]ENGINE)?[^\]]*\]/i,
  /\bfinance_handler\b/i,
  /\bfinance_confirmations?\b/i,
  /\b(?:nexa_finance_dedup|pending[_ ]transactions?|transaction\s+key|finance\s+dedup)\b/i,
  /\bACTION_(?:PENDING|AUTH|REJECTED|CANCEL)\b/
];

const AUTH_PATTERNS = [
  /\[(?:NEXA[_-])?AUTH[^\]]*\]/i,
  /\[TICKET[^\]]*\]/i,
  /\[ENROLL[^\]]*\]/i,
  /\[CHALLENGE[^\]]*\]/i,
  /\[STEP[_-]UP[^\]]*\]/i,
  /\[HMAC[^\]]*\]/i
];

const BRIDGE_PATTERNS = [
  /\[(?:NEXA[_-])?(?:ADAPTER[_-])?MOBILE[^\]]*\]/i,
  /\[(?:NEXA[_-])?BRIDGE[^\]]*\]/i,
  /\[WINDOWS[_-]BRIDGE[^\]]*\]/i,
  /\[WS[_-]GATEWAY[^\]]*\]/i,
  /\[LIVE[_-]VOICE[^\]]*\]/i,
  /\[LIVE[_-]TOOL[^\]]*\]/i
];

/**
 * Redact credentials, tokens, API keys, private keys, bank account numbers,
 * and OTP codes at the logging source (FR-SEC-04).
 * @param {string} input
 * @returns {string}
 */
function redactSecrets(input) {
  if (typeof input !== 'string' || input.length === 0) return '';
  let text = input;

  // 1. PEM private key blocks (multi-line)
  text = text.replace(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    '[PRIVATE-KEY-REDACTED]'
  );

  // 2. JWT tokens (three base64url segments starting with eyJ)
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    '[JWT-REDACTED]'
  );

  // 2b. Ed25519 2-segment sidecar tickets (eyJ<payload>.<sig>)
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{24,}\b/g,
    '[TICKET-REDACTED]'
  );

  // 2c. Telegram bot API URLs containing bot token (/bot123456:AAH...)
  text = text.replace(
    /(\/bot)\d{6,15}:[A-Za-z0-9_-]{20,}/gi,
    '$1[BOT-TOKEN-REDACTED]'
  );

  // 3. Bearer / Authorization header values
  text = text.replace(
    /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    '$1 [REDACTED]'
  );

  // 4. URL query string secrets (?token=..., &api_key=..., etc.)
  text = text.replace(
    /([?&](?:token|secret|key|apikey|api_key|password|pass|auth|access_token|refresh_token|ticket)=)[^&\s"'<>]+/gi,
    '$1[REDACTED]'
  );

  // 5. Known provider API key prefixes (Google/Gemini, Groq, OpenAI, Supabase, GitHub, HF, Nvidia, Tavily, Cerebras, Notion, Mapbox)
  text = text.replace(
    /\b(?:AIza[0-9A-Za-z_-]{20,}|gsk_[0-9A-Za-z_-]{16,}|sk-(?:proj-|ant-|live-|test-)?[0-9A-Za-z_-]{16,}|sb_secret_[0-9A-Za-z_-]{12,}|ghp_[0-9A-Za-z]{20,}|hf_[0-9A-Za-z]{20,}|nvapi-[0-9A-Za-z_-]{16,}|tvly-[0-9A-Za-z_-]{16,}|csk-[0-9A-Za-z_-]{16,}|ntn_[0-9A-Za-z_-]{16,}|(?:pk|sk)\.eyJ[0-9A-Za-z_.-]{20,})\b/g,
    '[KEY-REDACTED]'
  );

  // 6. JSON key-value secrets: "token": "...", "hmac_secret": "...", "ticket": "...", "enroll_code": "..."
  text = text.replace(
    /("(?:[a-z0-9_]*(?:token|secret|password|api_?key|private_?key|passphrase|authorization|supabase_?key)|ticket|enroll_code|nonce|signature(?:_der_b64|_b64)?|sig)"\s*:\s*")([^"]*)(")/gi,
    (_, prefix, value, suffix) => (value ? `${prefix}[REDACTED]${suffix}` : `${prefix}${suffix}`)
  );

  // 7. Plain key=value secret assignments (case-insensitive, e.g. HMAC_SECRET=abc, token=abc, api_key=xyz)
  text = text.replace(
    /\b([A-Za-z0-9_]*(?:token|secret|password|api_?key|private_?key|supabase_?key|enroll_code|ticket)\s*=\s*)([^\s,;'"}\]]+)/gi,
    '$1[REDACTED]'
  );

  // 8. Bank account numbers preceded by account keywords (with optional bank name; preserve last 4 digits only)
  text = text.replace(
    /\b(rekening|rek\.?|account|acct|no\.?\s*rek)((?:\s+(?:bank|bca|bri|bni|mandiri|jago|bsi|cimb|permata|danamon|btn|ocbc|mega|panin|uob|hsbc))*\s*[:=#-]?\s*)(\d[\d\s-]{5,18}\d)\b/gi,
    (_, label, sep, rawNum) => {
      const digits = rawNum.replace(/\D/g, '');
      if (digits.length < 7) return `${label}${sep}${rawNum}`;
      const last4 = digits.slice(-4);
      return `${label}${sep}[ACC-****${last4}]`;
    }
  );

  // 9. OTP / verification codes preceded by OTP/PIN label
  text = text.replace(
    /\b(otp|kode\s+verifikasi|verification\s+code|pin)(\s*[:=#-]?\s*)(\d{4,8})\b/gi,
    '$1$2[OTP-REDACTED]'
  );

  return text;
}

/**
 * Detect all matching structured log categories (supports multi-tag e.g. FINANCE + AUTH
 * for Finance Step-Up biometric logs so Go ParseCategoryPrefix sets CatFinance|CatAuth).
 * @param {string} message
 * @returns {Array<'FINANCE'|'BRIDGE'|'AUTH'>}
 */
function detectCategories(message) {
  if (typeof message !== 'string' || message.length === 0) return [];
  const found = new Set();

  let rest = message.trimStart();
  while (true) {
    const m = rest.match(EXPLICIT_CAT_RE);
    if (!m) break;
    found.add(m[1].toUpperCase());
    rest = rest.slice(m[0].length);
  }

  for (const re of FINANCE_PATTERNS) {
    if (re.test(rest)) {
      found.add('FINANCE');
      break;
    }
  }
  for (const re of BRIDGE_PATTERNS) {
    if (re.test(rest)) {
      found.add('BRIDGE');
      break;
    }
  }
  for (const re of AUTH_PATTERNS) {
    if (re.test(rest)) {
      found.add('AUTH');
      break;
    }
  }

  // Canonical order: FINANCE, BRIDGE, AUTH
  const ordered = [];
  for (const name of ['FINANCE', 'BRIDGE', 'AUTH']) {
    if (found.has(name)) ordered.push(name);
  }
  return ordered;
}

/**
 * Detect primary structured log category from explicit [cat=...] prefix or known module tags.
 * @param {string} message
 * @returns {'FINANCE'|'BRIDGE'|'AUTH'|null}
 */
function detectCategory(message) {
  const cats = detectCategories(message);
  return cats.length > 0 ? cats[0] : null;
}

/**
 * Format a single log line with source-level redaction, canonical [cat=...] tag(s),
 * and optional systemd/PM2 syslog priority prefix (<N>).
 * @param {'ERROR'|'WARN'|'INFO'|'DEBUG'} level
 * @param {string} rawMessage
 * @param {{ useSyslogPrefix?: boolean, category?: 'FINANCE'|'BRIDGE'|'AUTH'|null }} [options]
 * @returns {{ redacted: string, outputLine: string, category: string|null, categories: string[] }}
 */
function formatLine(level, rawMessage, options = {}) {
  const redacted = redactSecrets(String(rawMessage ?? ''));
  const categories = options.category !== undefined
    ? (options.category ? [String(options.category).toUpperCase()] : [])
    : detectCategories(redacted);
  const category = categories.length > 0 ? categories[0] : null;

  const useSyslog = options.useSyslogPrefix !== undefined
    ? options.useSyslogPrefix
    : (Boolean(process.env.JOURNAL_STREAM) || process.env.NEXA_SYSLOG_PREFIX === '1');

  const prio = SYSLOG_PRIORITY[level] ?? SYSLOG_PRIORITY.INFO;
  const prioPrefix = useSyslog ? `<${prio}>` : '';
  const catPrefix = categories.length > 0
    ? `${categories.map((c) => `[cat=${c}]`).join('')} `
    : '';

  // N-H7: Apply syslog priority and normalized [cat=UPPER] to EVERY line of multi-line logs
  const lines = redacted.split(/\r?\n/).map((line) => {
    let body = line;
    const explicitPrefix = body.match(MULTI_EXPLICIT_CAT_RE);
    if (explicitPrefix) {
      body = body.slice(explicitPrefix[0].length);
    }
    return `${prioPrefix}${catPrefix}${body}`;
  });

  const outputLine = lines.join('\n');
  return { redacted, outputLine, category, categories };
}

function formatArgs(args) {
  const list = Array.from(args);
  if (list.length === 0) return '';
  try {
    return util.format(...list);
  } catch (_) {
    return list.map(arg => {
      if (arg instanceof Error) {
        return arg.stack || arg.message || String(arg);
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch (__) {
          return '[Object]';
        }
      }
      return String(arg);
    }).join(' ');
  }
}

function pushLog(level, redactedMessage) {
  const timestamp = new Date().toISOString();
  systemLogs.push(`[${timestamp}] [${level}] ${redactedMessage}`);
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.shift();
  }
}

function emitConsole(level, originalFn, args, forcedCategory = undefined) {
  if (isLogging) {
    originalFn.apply(console, args);
    return;
  }
  isLogging = true;
  try {
    const raw = formatArgs(args);
    const { redacted, outputLine } = formatLine(level, raw, { category: forcedCategory });
    pushLog(level, redacted);
    originalFn.call(console, outputLine);
  } finally {
    isLogging = false;
  }
}

console.log = function () {
  emitConsole('INFO', originalLog, arguments);
};

console.error = function () {
  emitConsole('ERROR', originalError, arguments);
};

console.warn = function () {
  emitConsole('WARN', originalWarn, arguments);
};

console.info = function () {
  emitConsole('INFO', originalInfo, arguments);
};

console.debug = function () {
  emitConsole('DEBUG', originalDebug, arguments);
};

function logCategory(category, level, ...args) {
  const normLevel = String(level || 'INFO').toUpperCase();
  const fn = normLevel === 'ERROR'
    ? originalError
    : normLevel === 'WARN'
      ? originalWarn
      : originalLog;
  emitConsole(normLevel, fn, args, category);
}

function getRecentLogs() {
  return systemLogs.join('\n');
}

module.exports = {
  getRecentLogs,
  redactSecrets,
  detectCategory,
  detectCategories,
  formatLine,
  logCategory
};
