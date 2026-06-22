const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Transform, Readable } = require('stream');

// ============================================================
// CORE: PARALLEL PROXY RACE — Kunci Kecepatan Utama
// Menjalankan semua proxy BERSAMAAN. Yang berhasil pertama = yang digunakan.
// ============================================================
async function raceProxies(buildRequestFn, proxies, timeoutMs = 20000) {
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

// Helper to delay between retries
const delay = ms => new Promise(res => setTimeout(res, ms));

// ============================================================
// FETCH JSON — Paralel Race (untuk getFile, sendMessage)
// ============================================================
async function fetchProxyJSON(proxyUrls, timeoutMs = 20000, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { result } = await raceProxies(
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
        await delay(1000);
        continue;
      }
      throw new Error(`fetch proxy JSON failed: ${err.message}`);
    }
  }
}

// ============================================================
// DOWNLOAD BASE64 — Paralel Race (untuk Vision Engine)
// Menggunakan native fetch() untuk menghindari bug socket axios di HuggingFace
// ============================================================
async function downloadProxyToBase64(proxyUrls, maxSize = 10 * 1024 * 1024, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { result } = await raceProxies(
        async (url, signal) => {
          const response = await fetch(url, { method: 'GET', signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          
          const arrayBuffer = await response.arrayBuffer();
          if (arrayBuffer.byteLength > maxSize) throw new Error('File melebihi batas ukuran');
          
          const b64 = Buffer.from(arrayBuffer).toString('base64');
          if (!b64 || b64.length < 100) throw new Error('Response terlalu kecil/kosong');
          return b64;
        },
        urlList,
        30000
      );
      return result;
    } catch (err) {
      if (attempt < maxRetries) {
        console.warn(`[PROXY] Base64 download attempt ${attempt} failed, retrying...`);
        await delay(1500);
        continue;
      }
      throw new Error(`Base64 download failed: ${err.message}`);
    }
  }
}

// ============================================================
// DOWNLOAD TO FILE — Paralel Race (untuk Voice Engine & Vault)
// Menggunakan native fetch() dan Readable.fromWeb
// ============================================================
async function downloadProxyToFile(proxyUrls, extension = 'bin', maxSize = 20 * 1024 * 1024, maxRetries = 3) {
  const urlList = Array.isArray(proxyUrls)
    ? proxyUrls.map((u, i) => ({ name: `Proxy${i + 1}`, url: u }))
    : [{ name: 'Proxy', url: proxyUrls }];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const errors = [];
    for (const proxy of urlList) {
      const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
      const filePath = path.join(os.tmpdir(), fileName);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000); 

      try {
        const response = await fetch(proxy.url, { method: 'GET', signal: controller.signal });
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

        // Convert Web Stream to Node Stream
        const webStream = Readable.fromWeb(response.body);
        await pipeline(webStream, sizeGuard, fileStream);
        clearTimeout(timer);

        console.log(`[PROXY] File downloaded via ${proxy.name}. Size: ${sizeBytes} bytes`);
        return { filePath, sizeBytes };

      } catch (err) {
        clearTimeout(timer);
        await cleanupFile(filePath).catch(() => {});
        const msg = `${proxy.name} binary stream failed: ${err.message.substring(0, 120)}`;
        errors.push(msg);
      }
    }

    // Jika sampai sini, berarti semua proxy gagal di percobaan ini
    if (attempt < maxRetries) {
      console.warn(`[PROXY] Stream attempt ${attempt} failed on all proxies. Retrying...`);
      await delay(1500);
    } else {
      throw new Error(`File download failed across all proxies. ${errors.join(' | ')}`);
    }
  }
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
