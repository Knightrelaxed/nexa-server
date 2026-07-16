'use strict';
/**
 * N.E.X.A Auto-Proxy Hunter v2.0
 * ─────────────────────────────────────────────────────────────────────────────
 * Secara otomatis mengambil ribuan SOCKS5 proxy gratis dari beberapa sumber
 * publik yang berbeda, kemudian melakukan "WebSocket Race" secara massal ke
 * wss://web.whatsapp.com/ws/chat — satu-satunya endpoint yang perlu dilewati.
 *
 * Proxy yang pertama berhasil membuka koneksi WSS ke WhatsApp langsung dipakai.
 *
 * Strategi:
 *  1. Kumpulkan proxy dari 4 sumber GitHub (3.700+ kandidat)
 *  2. Acak dan ambil CONCURRENCY_BATCH baris per giliran
 *  3. Race semua dalam giliran tersebut secara paralel
 *  4. Ulangi giliran berikutnya jika belum ada pemenang (sampai MAX_TOTAL_TRIES)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');

// ── Tuning Knobs ──────────────────────────────────────────────────────────────
const CONCURRENCY_BATCH   = 80;    // Berapa proxy diuji secara paralel per giliran
const MAX_TOTAL_TRIES     = 300;   // Batas total proxy yang diuji sebelum menyerah
const PER_PROXY_TIMEOUT   = 8000;  // Timeout per proxy (ms)

// Sumber daftar proxy publik gratis (SOCKS5)
const PROXY_SOURCES = [
  'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt',
  'https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt',
  'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt',
  'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/socks5.txt',
];

/**
 * Ambil semua proxy dari semua sumber, gabung dan acak.
 * @returns {Promise<string[]>} Array of "ip:port"
 */
async function _fetchAllProxies() {
  const allProxies = new Set();
  for (const url of PROXY_SOURCES) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      text.split('\n')
        .map(l => l.trim())
        .filter(l => /^\d+\.\d+\.\d+\.\d+:(80|443|8080)$/.test(l)) // Validasi IP dan HANYA port 80, 443, 8080 (HF Outbound Firewall)
        .forEach(p => allProxies.add(p));
    } catch (e) {
      // Sumber tidak bisa dijangkau, lewati
    }
  }
  // Shuffle (Fisher-Yates)
  const arr = [...allProxies];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Uji SATU proxy dengan koneksi WebSocket Secure (wss://) langsung ke
 * endpoint WhatsApp Web. Ini adalah tes yang paling akurat.
 *
 * @param {string} ipPort - Format "ip:port"
 * @returns {Promise<string>} proxyUrl jika berhasil, throw jika gagal
 */
function _testProxyViaWSS(ipPort) {
  return new Promise((resolve, reject) => {
    const proxyUrl = 'socks5://' + ipPort;
    let done = false;
    const cleanup = (fn, arg) => {
      if (done) return;
      done = true;
      try { ws.terminate(); } catch (_) {}
      clearTimeout(timer);
      fn(arg);
    };

    let ws;
    try {
      const agent = new SocksProxyAgent(proxyUrl);
      ws = new WebSocket('wss://web.whatsapp.com/ws/chat', {
        agent,
        origin: 'https://web.whatsapp.com',
        headers: {
          'Origin': 'https://web.whatsapp.com',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        handshakeTimeout: PER_PROXY_TIMEOUT,
      });
    } catch (e) {
      return reject(e.message);
    }

    const timer = setTimeout(() => cleanup(reject, 'timeout'), PER_PROXY_TIMEOUT + 500);

    // Koneksi WSS berhasil dibuka → proxy ini BEKERJA!
    ws.on('open', () => cleanup(resolve, proxyUrl));

    // Server merespons dengan sesuatu (bahkan error HTTP) → proxy melewati SSL
    // Ini juga berarti proxy berhasil terhubung ke WhatsApp, kita anggap valid
    ws.on('unexpected-response', (_req, res) => {
      // Status 301, 302 = redirect, masih diterima, berarti sambungan berhasil
      if (res.statusCode < 500) cleanup(resolve, proxyUrl);
      else cleanup(reject, 'HTTP ' + res.statusCode);
    });

    ws.on('error', (e) => cleanup(reject, e.message));
  });
}

/**
 * Fungsi utama: cari proxy SOCKS5 yang bekerja untuk wss://web.whatsapp.com.
 * @returns {Promise<string|null>} socks5://ip:port yang berhasil, atau null
 */
async function getWorkingFreeProxy() {
  console.log('[PROXY-ROTATOR] 🕵️ Mengambil daftar proxy SOCKS5 dari 4 sumber publik...');
  const proxies = await _fetchAllProxies();

  if (proxies.length === 0) {
    console.log('[PROXY-ROTATOR] ❌ Tidak ada proxy yang bisa diambil dari sumber publik.');
    return null;
  }

  const totalToTry = Math.min(proxies.length, MAX_TOTAL_TRIES);
  console.log(`[PROXY-ROTATOR] 📊 ${proxies.length} proxy terkumpul. Akan menguji hingga ${totalToTry} proxy via WSS Race...`);

  let tried = 0;
  while (tried < totalToTry) {
    const batch = proxies.slice(tried, tried + CONCURRENCY_BATCH);
    tried += batch.length;

    console.log(`[PROXY-ROTATOR] ⚡ Racing giliran ${Math.ceil(tried / CONCURRENCY_BATCH)} (${batch.length} proxy paralel, ${tried}/${totalToTry} total)...`);

    try {
      const winner = await Promise.any(batch.map(p => _testProxyViaWSS(p)));
      console.log(`[PROXY-ROTATOR] ✅ PROXY AKTIF DITEMUKAN: ${winner}`);
      return winner;
    } catch (_) {
      // AggregateError = semua gagal dalam giliran ini, lanjut ke giliran berikutnya
    }
  }

  console.log(`[PROXY-ROTATOR] ❌ Menyerah setelah mencoba ${totalToTry} proxy. Semua gagal menembus WhatsApp.`);
  return null;
}

module.exports = { getWorkingFreeProxy };
