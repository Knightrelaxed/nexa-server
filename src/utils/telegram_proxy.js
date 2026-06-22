const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Transform, Readable } = require('stream');

// Helper to delay between retries
const delay = ms => new Promise(res => setTimeout(res, ms));

// ============================================================
// CORE: SINGLE PROXY FETCH WITH HARD TIMEOUT
// timeoutMs: Maximum time to wait for this single request.
// ============================================================
async function fetchWithTimeout(url, timeoutMs, mode = 'json') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    if (mode === 'json') return await response.json();
    if (mode === 'arraybuffer') return await response.arrayBuffer();
    return response; // 'stream' mode — caller handles body
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// FETCH JSON — Retry loop with fast per-attempt timeout
// Budget: 3 attempts × 6s + 2 × 500ms delay = ~19s total
// This fits safely inside Telegram's 25s webhook window.
// ============================================================
async function fetchProxyJSON(proxyUrls, timeoutMs = 6000, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  const allErrors = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const proxy of urlList) {
      try {
        console.log(`[PROXY] Fetch JSON via ${proxy.name} (attempt ${attempt})...`);
        const result = await fetchWithTimeout(proxy.url, timeoutMs, 'json');
        console.log(`[PROXY] Fetch JSON SUCCESS via ${proxy.name}.`);
        return result;
      } catch (err) {
        const msg = `${proxy.name} attempt ${attempt}: ${err.message.substring(0, 100)}`;
        allErrors.push(msg);
        console.warn(`[PROXY] ${msg}`);
      }
    }

    if (attempt < maxRetries) {
      await delay(500);
    }
  }

  throw new Error(`fetch proxy JSON failed: All proxies failed:\n${allErrors.join('\n')}`);
}

// ============================================================
// DOWNLOAD BASE64 — For Vision Engine (images)
// Budget: 3 attempts × 20s + 2 × 1s delay = ~62s
// This runs AFTER the safety timer has already responded to Telegram,
// so it can afford a longer budget.
// ============================================================
async function downloadProxyToBase64(proxyUrls, maxSize = 10 * 1024 * 1024, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  const allErrors = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const proxy of urlList) {
      try {
        console.log(`[PROXY] Download base64 via ${proxy.name} (attempt ${attempt})...`);
        const arrayBuffer = await fetchWithTimeout(proxy.url, 20000, 'arraybuffer');

        if (arrayBuffer.byteLength > maxSize) throw new Error('File melebihi batas ukuran');

        const b64 = Buffer.from(arrayBuffer).toString('base64');
        if (!b64 || b64.length < 100) throw new Error('Response terlalu kecil/kosong');

        console.log(`[PROXY] Base64 download SUCCESS via ${proxy.name}. Size: ${b64.length} chars`);
        return b64;
      } catch (err) {
        const msg = `${proxy.name} attempt ${attempt}: ${err.message.substring(0, 100)}`;
        allErrors.push(msg);
        console.warn(`[PROXY] ${msg}`);
      }
    }

    if (attempt < maxRetries) {
      await delay(1000);
    }
  }

  throw new Error(`Base64 download failed: All proxies failed:\n${allErrors.join('\n')}`);
}

// ============================================================
// DOWNLOAD TO FILE — For Voice Engine & Vault (binary stream)
// Budget: 3 attempts × 30s + 2 × 1s delay = ~92s
// Runs after safety timer, so long budget is OK.
// ============================================================
async function downloadProxyToFile(proxyUrls, extension = 'bin', maxSize = 20 * 1024 * 1024, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  const allErrors = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    for (const proxy of urlList) {
      const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
      const filePath = path.join(os.tmpdir(), fileName);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);

      try {
        console.log(`[PROXY] Stream download via ${proxy.name} (attempt ${attempt})...`);
        const response = await fetch(proxy.url, { method: 'GET', signal: controller.signal });
        clearTimeout(timer);

        if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

        const declaredSize = parseInt(response.headers.get('content-length') ?? '0');
        if (declaredSize > maxSize) throw new Error(`File terlalu besar: ${declaredSize} bytes`);

        const fileStream = createWriteStream(filePath);
        let sizeBytes = 0;

        const sizeGuard = new Transform({
          transform(chunk, _encoding, callback) {
            sizeBytes += chunk.length;
            if (sizeBytes > maxSize) {
              callback(new Error(`File melebihi batas ${maxSize / 1024 / 1024}MB`));
              return;
            }
            callback(null, chunk);
          }
        });

        const webStream = Readable.fromWeb(response.body);
        await pipeline(webStream, sizeGuard, fileStream);

        console.log(`[PROXY] File downloaded via ${proxy.name}. Size: ${sizeBytes} bytes`);
        return { filePath, sizeBytes };

      } catch (err) {
        clearTimeout(timer);
        await cleanupFile(filePath).catch(() => {});
        const msg = `${proxy.name} attempt ${attempt}: ${err.message.substring(0, 120)}`;
        allErrors.push(msg);
        console.warn(`[PROXY] ${msg}`);
      }
    }

    if (attempt < maxRetries) {
      console.warn(`[PROXY] Stream attempt ${attempt} failed. Retrying in 1s...`);
      await delay(1000);
    }
  }

  throw new Error(`File download failed across all proxies. ${allErrors.join(' | ')}`);
}

// ============================================================
// CLEANUP FILE
// ============================================================
async function cleanupFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch(() => {});
}

module.exports = {
  downloadProxyToBase64,
  downloadProxyToFile,
  cleanupFile,
  fetchProxyJSON,
};
