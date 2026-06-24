const { pipeline } = require('stream/promises');
const { createWriteStream } = require('fs');
const { unlink } = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { Transform } = require('stream');
const axios = require('axios');
const https = require('https');

/**
 * Mengunduh file biner dari proxy ke Base64 (Untuk RAM - Vision Engine)
 */
async function downloadProxyToBase64(proxyUrl, maxSize = 10 * 1024 * 1024) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await axios.get(proxyUrl, {
        responseType: 'arraybuffer',
        signal: controller.signal,
        timeout: 45000,
        maxContentLength: maxSize
      });
      clearTimeout(timer);
      return Buffer.from(response.data).toString('base64');
    } catch (err) {
      clearTimeout(timer);
      const is5xx = err.response && err.response.status >= 500;
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout');
      
      if (attempt < 3 && (is5xx || isTimeout || !err.response)) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      if (err.response) {
        throw new Error(`Proxy HTTP Error: ${err.response.status} ${err.response.statusText}`);
      }
      throw new Error(`Download failed: ${err.message}`);
    }
  }
}

/**
 * Mengunduh file melalui Cloudflare Worker v3.0 dengan mode b64=true
 * Worker mengubah biner → Base64 JSON, lalu kita decode di sini.
 * Ini bypass firewall HF yang memblokir biner besar!
 * Digunakan oleh Vision Engine (mengembalikan Base64 string)
 */
async function downloadRelayB64ToBase64(relayBaseUrl, targetUrl, maxSize = 20 * 1024 * 1024) {
  const proxyUrl = `${relayBaseUrl}${encodeURIComponent(targetUrl)}&b64=true`;
  
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await axios.get(proxyUrl, {
        responseType: 'json',
        signal: controller.signal,
        timeout: 90000
      });
      clearTimeout(timer);

      const data = response.data;
      if (!data.ok || !data.data) {
        throw new Error(`Relay B64 error: ${data.error || 'no data'}`);
      }
      if (data.size > maxSize) {
        throw new Error(`File size ${data.size} exceeds limit ${maxSize}`);
      }
      return data.data; // Base64 string siap pakai
    } catch (err) {
      clearTimeout(timer);
      const is5xx = err.response && err.response.status >= 500;
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('canceled');
      
      if (attempt < 3 && (is5xx || isTimeout || !err.response)) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Relay B64 (Vision) failed: ${err.message}`);
    }
  }
}

/**
 * Mengunduh file melalui Cloudflare Worker v3.0 dengan mode b64=true
 * Worker mengubah biner → Base64 JSON, decode di sini, simpan ke disk.
 * Digunakan oleh Voice Engine (mengembalikan path file temp)
 */
async function downloadRelayB64ToFile(relayBaseUrl, targetUrl, extension = 'ogg', maxSize = 20 * 1024 * 1024) {
  const proxyUrl = `${relayBaseUrl}${encodeURIComponent(targetUrl)}&b64=true`;
  const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);

  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);

    try {
      const response = await axios.get(proxyUrl, {
        responseType: 'json',
        signal: controller.signal,
        timeout: 90000
      });
      clearTimeout(timer);

      const data = response.data;
      if (!data.ok || !data.data) {
        throw new Error(`Relay B64 error: ${data.error || 'no data'}`);
      }
      if (data.size > maxSize) {
        throw new Error(`File size ${data.size} exceeds limit ${maxSize}`);
      }

      // Decode base64 → Buffer → tulis ke disk
      const buffer = Buffer.from(data.data, 'base64');
      require('fs').writeFileSync(filePath, buffer);
      
      return { filePath, sizeBytes: data.size };
    } catch (err) {
      clearTimeout(timer);
      const is5xx = err.response && err.response.status >= 500;
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('canceled');
      
      if (attempt < 3 && (is5xx || isTimeout || !err.response)) {
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      throw new Error(`Relay B64 (Voice) failed: ${err.message}`);
    }
  }
}

/**
 * Streaming file biner dari proxy langsung ke Disk (Untuk Voice & Vault)
 */
async function downloadProxyToFile(proxyUrl, extension = 'bin', maxSize = 20 * 1024 * 1024) {
  const fileName = `nexa_${crypto.randomUUID()}.${extension}`;
  const filePath = path.join(os.tmpdir(), fileName);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  let response;
  try {
    response = await axios.get(proxyUrl, {
      responseType: 'stream',
      signal: controller.signal,
      timeout: 120000
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.response) {
      throw new Error(`Proxy HTTP Error: ${err.response.status}`);
    }
    throw new Error(`Download request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const declaredSize = parseInt(response.headers['content-length'] ?? '0');
  if (declaredSize > maxSize) {
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
      response.data,
      sizeGuard,
      fileStream
    );
  } catch (err) {
    await cleanupFile(filePath);
    throw new Error(`Download stream gagal: ${err.message}`);
  }

  return { filePath, sizeBytes };
}

/**
 * Hapus file dari OS
 */
async function cleanupFile(filePath) {
  if (!filePath) return;
  await unlink(filePath).catch(() => {});
}

/**
 * Fetch untuk JSON/Teks sederhana
 */
async function fetchProxyJSON(proxyUrl, timeoutMs = 15000, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await axios.get(proxyUrl, {
        responseType: 'json',
        signal: controller.signal,
        timeout: timeoutMs
      });
      clearTimeout(timer);
      
      // Axios auto-parses JSON, but we can double check
      if (typeof response.data === 'string') {
        try { return JSON.parse(response.data); } catch(e) { throw new Error(`Invalid JSON: ${response.data.substring(0, 100)}`); }
      }
      return response.data;
    } catch (err) {
      clearTimeout(timer);
      const is5xx = err.response && err.response.status >= 500;
      const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' || err.message.includes('timeout') || err.message.includes('canceled');

      if (attempt < maxRetries && (is5xx || isTimeout || !err.response)) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      if (err.response) {
        throw new Error(`HTTP ${err.response.status}: ${JSON.stringify(err.response.data || err.response.statusText)}`);
      }
      throw new Error(`fetch proxy JSON failed: ${err.message}`);
    }
  }
}

module.exports = {
  downloadProxyToBase64,
  downloadProxyToFile,
  downloadRelayB64ToBase64,
  downloadRelayB64ToFile,
  cleanupFile,
  fetchProxyJSON
};
