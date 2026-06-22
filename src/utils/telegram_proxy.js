const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Transform, Readable } = require('stream');

/**
 * Mengunduh file biner dari proxy ke Base64 (Untuk RAM - Vision Engine)
 * @param {string} proxyUrl URL Proxy lengkap
 * @param {number} maxSize Batas ukuran (default 10MB)
 * @returns {Promise<string>} Base64 string
 */
async function downloadProxyToBase64(proxyUrl, maxSize = 10 * 1024 * 1024) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    let response;
    try {
      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'image/*, application/octet-stream' },
      });
    } catch (err) {
      clearTimeout(timer);
      const cause = err.cause ? ` (${err.cause.message})` : '';
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`fetch failed${cause}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < 3) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`Proxy HTTP Error: ${response.status} ${response.statusText}`);
    }

    const declaredSize = parseInt(response.headers.get('content-length') ?? '0');
    if (declaredSize > maxSize) {
      await response.body?.cancel();
      throw new Error(`File terlalu besar: ${declaredSize} bytes`);
    }

    const chunks = [];
    let totalBytes = 0;
    
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          totalBytes += value.byteLength;
          if (totalBytes > maxSize) {
            await reader.cancel('exceeded size limit');
            throw new Error('File melebihi batas ukuran saat streaming');
          }
          chunks.push(value);
        }
      } catch (err) {
        reader.cancel().catch(() => {});
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw err;
      }
    } else {
      const arrayBuffer = await response.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));
    }

    const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
    return buffer.toString('base64');
  }
}

/**
 * Streaming file biner dari proxy langsung ke Disk (Untuk Voice & Vault)
 * @param {string} proxyUrl URL Proxy lengkap
 * @param {string} extension Ekstensi file (misal 'ogg')
 * @param {number} maxSize Batas ukuran (default 20MB)
 * @returns {Promise<{filePath: string, sizeBytes: number}>}
 */
async function downloadProxyToFile(proxyUrl, extension = 'bin', maxSize = 20 * 1024 * 1024) {
  const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await fetch(proxyUrl, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Proxy HTTP Error: ${response.status}`);
  }

  const declaredSize = parseInt(response.headers.get('content-length') ?? '0');
  if (declaredSize > maxSize) {
    await response.body?.cancel();
    throw new Error(`Ukuran file (${declaredSize}) melebihi batas 20MB`);
  }

  const fileStream = createWriteStream(filePath);
  let sizeBytes = 0;

  const sizeGuard = new Transform({
    transform(chunk, _encoding, callback) {
      sizeBytes += chunk.length;
      if (sizeBytes > maxSize) {
        callback(new Error(`File melebihi batas ${maxSize / 1024 / 1024}MB saat streaming`));
        return;
      }
      callback(null, chunk);
    }
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      sizeGuard,
      fileStream
    );
  } catch (err) {
    await cleanupFile(filePath);
    throw new Error(`Download gagal: ${err.message}`);
  }

  return { filePath, sizeBytes };
}

/**
 * Hapus file dari OS
 * @param {string} filePath 
 */
async function cleanupFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch(() => {});
}

/**
 * Fetch Native Node.js untuk JSON/Teks sederhana (Pengganti curl -sS)
 */
async function fetchProxyJSON(proxyUrl, timeoutMs = 15000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
    } catch (err) {
      clearTimeout(timer);
      const cause = err.cause ? ` (${err.cause.message})` : '';
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(`fetch failed${cause}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      if (response.status >= 500 && attempt < 3) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      const bodyText = await response.text();
      throw new Error(`HTTP ${response.status}: ${bodyText}`);
    }

    const raw = await response.text();
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON response: ${raw.substring(0, 100)}`);
    }
  }
}

module.exports = {
  downloadProxyToBase64,
  downloadProxyToFile,
  cleanupFile,
  fetchProxyJSON
};
