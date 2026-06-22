const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Transform } = require('stream');
const axios = require('axios');
const https = require('https');

// Gunakan agen HTTP standar dengan keepAlive. Hugging Face memblokir rute IPv6 (ENETUNREACH).
const httpAgent = new https.Agent({ keepAlive: true, family: 4 });

// ============================================================
// CORE: PARALLEL PROXY RACE — Kunci Kecepatan Utama
// Menjalankan semua proxy BERSAMAAN. Yang berhasil pertama = yang digunakan.
// Menghilangkan bottleneck serial "tunggu timeout dulu baru ganti proxy".
// ============================================================
async function raceProxies(buildRequestFn, proxies, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let failCount = 0;
    const errors = [];

    for (const proxy of proxies) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      buildRequestFn(proxy.url, controller.signal)
        .then(result => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            resolve({ result, proxyName: proxy.name });
            // Note: other in-flight requests will naturally abort/complete and be ignored
          }
        })
        .catch(err => {
          clearTimeout(timer);
          failCount++;
          errors.push(`${proxy.name}: ${err.message.substring(0, 100)}`);
          if (failCount === proxies.length && !settled) {
            settled = true;
            reject(new Error(`All proxies failed:\n${errors.join('\n')}`));
          }
        });
    }
  });
}

// ============================================================
// FETCH JSON — Paralel Race (untuk getFile, sendMessage)
// ============================================================
async function fetchProxyJSON(proxyUrls, timeoutMs = 10000, maxRetries = 1) {
  // Support both legacy single-URL string and new array format
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { result, proxyName } = await raceProxies(
        async (url, signal) => {
          const response = await fetch(url, { method: 'GET', signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          return await response.json();
        },
        urlList,
        timeoutMs
      );
      return result;
    } catch (err) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      throw new Error(`fetch proxy JSON failed: ${err.message}`);
    }
  }
}

// ============================================================
// DOWNLOAD BASE64 — Paralel Race (untuk Vision Engine)
// ============================================================
async function downloadProxyToBase64(proxyUrls, maxSize = 10 * 1024 * 1024) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  const { result } = await raceProxies(
    async (url, signal) => {
      const response = await axios.get(url, {
        httpsAgent: httpAgent,
        responseType: 'arraybuffer',
        signal,
        timeout: 40000,
        maxContentLength: maxSize
      });
      const b64 = Buffer.from(response.data).toString('base64');
      if (!b64 || b64.length < 100) throw new Error('Response too small or empty');
      return b64;
    },
    urlList,
    40000
  );
  return result;
}

// ============================================================
// DOWNLOAD TO FILE — Paralel Race (untuk Voice Engine)
// ============================================================
async function downloadProxyToFile(proxyUrls, extension = 'bin', maxSize = 20 * 1024 * 1024) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  // For streaming downloads, we try proxies in sequence (streaming can't race cleanly)
  // But we use a short timeout per proxy so we fail fast
  const errors = [];
  for (const proxy of urlList) {
    const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
    const filePath = path.join(os.tmpdir(), fileName);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000); // 30s max per proxy

    try {
      const response = await axios.get(proxy.url, {
        httpsAgent: httpAgent,
        responseType: 'stream',
        signal: controller.signal,
        timeout: 30000
      });
      clearTimeout(timer);

      const declaredSize = parseInt(response.headers['content-length'] ?? '0');
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

      await pipeline(response.data, sizeGuard, fileStream);
      console.log(`[PROXY] Audio downloaded via ${proxy.name}. Size: ${sizeBytes} bytes`);
      return { filePath, sizeBytes };

    } catch (err) {
      clearTimeout(timer);
      await cleanupFile(filePath).catch(() => {});
      const msg = `${proxy.name} binary download failed: ${err.message.substring(0, 120)}`;
      console.warn(`[PROXY] ${msg}`);
      errors.push(msg);
    }
  }

  throw new Error(`Audio download failed across all proxies. ${errors.join(' | ')}`);
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
  raceProxies
};
