/**
 * telegram_proxy.js — HTTP helpers for pre-built proxy URLs
 */
const { fetchRelayB64, enqueueOutbound } = require('./telegram_network');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

async function undiciGet(url, options = {}) {
  const { timeoutMs = 30_000, responseType = 'json', headers = {} } = options;

  return enqueueOutbound(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Connection: 'close', Accept: '*/*', ...headers },
      });
      clearTimeout(timer);

      if (!response.ok) {
        const t = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${t.substring(0, 200)}`);
      }

      if (responseType === 'buffer') {
        return Buffer.from(await response.arrayBuffer());
      }

      const text = await response.text();
      if (responseType === 'text') return text;

      try { return JSON.parse(text); } catch {
        throw new Error(`Invalid JSON: ${text.substring(0, 100)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      throw new Error(`fetch proxy failed: ${err.message}`);
    }
  });
}

async function fetchProxyJSON(proxyUrl, timeoutMs = 30000, maxRetries = 3, extraHeaders = {}) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await undiciGet(proxyUrl, { timeoutMs, responseType: 'json', headers: extraHeaders });
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      throw new Error(`fetch proxy JSON failed: ${err.message}`);
    }
  }
}

async function downloadProxyToBase64(proxyUrl, maxSize = 10 * 1024 * 1024) {
  const buf = await undiciGet(proxyUrl, { timeoutMs: 45_000, responseType: 'buffer' });
  if (buf.length > maxSize) throw new Error(`File size ${buf.length} exceeds limit`);
  return buf.toString('base64');
}

async function downloadRelayB64ToBase64(_relayBaseUrl, targetUrl, maxSize = 20 * 1024 * 1024) {
  return fetchRelayB64(targetUrl, maxSize);
}

async function downloadRelayB64ToFile(_relayBaseUrl, targetUrl, extension = 'ogg', maxSize = 20 * 1024 * 1024) {
  const b64 = await fetchRelayB64(targetUrl, maxSize);
  const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);
  const buffer = Buffer.from(b64, 'base64');
  require('fs').writeFileSync(filePath, buffer);
  return { filePath, sizeBytes: buffer.length };
}

async function downloadProxyToFile(proxyUrl, extension = 'bin', maxSize = 20 * 1024 * 1024) {
  const buf = await undiciGet(proxyUrl, { timeoutMs: 120_000, responseType: 'buffer' });
  if (buf.length > maxSize) throw new Error(`File exceeds ${maxSize} bytes`);
  const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);
  require('fs').writeFileSync(filePath, buf);
  return { filePath, sizeBytes: buf.length };
}

async function cleanupFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch(() => {});
}

module.exports = {
  downloadProxyToBase64,
  downloadProxyToFile,
  downloadRelayB64ToBase64,
  downloadRelayB64ToFile,
  cleanupFile,
  fetchProxyJSON,
};
