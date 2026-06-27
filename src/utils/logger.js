/**
 * logger.js
 * Intercepts console.log, console.error, console.warn, console.info
 * and stores the last 50 lines in an in-memory array.
 * This allows Nexa to read its own logs for diagnostic purposes.
 */

const MAX_LOGS = 50;
const systemLogs = [];

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

function formatArgs(args) {
  return Array.from(args).map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return '[Object]';
      }
    }
    return String(arg);
  }).join(' ');
}

function pushLog(level, message) {
  const timestamp = new Date().toISOString();
  // We keep it compact so the LLM doesn't consume too many tokens
  systemLogs.push(`[${timestamp}] [${level}] ${message}`);
  if (systemLogs.length > MAX_LOGS) {
    systemLogs.shift();
  }
}

console.log = function() {
  pushLog('INFO', formatArgs(arguments));
  originalLog.apply(console, arguments);
};

console.error = function() {
  pushLog('ERROR', formatArgs(arguments));
  originalError.apply(console, arguments);
};

console.warn = function() {
  pushLog('WARN', formatArgs(arguments));
  originalWarn.apply(console, arguments);
};

console.info = function() {
  pushLog('INFO', formatArgs(arguments));
  originalInfo.apply(console, arguments);
};

function getRecentLogs() {
  return systemLogs.join('\n');
}

module.exports = { getRecentLogs };
