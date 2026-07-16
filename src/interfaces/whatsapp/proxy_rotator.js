const https = require('https');
const { SocksProxyAgent } = require('socks-proxy-agent');

/**
 * Fetches a list of free SOCKS5 proxies from public GitHub repos
 * and races them against web.whatsapp.com to find a working one.
 * @returns {Promise<string>} The working proxy URL (socks5://ip:port) or null
 */
async function getWorkingFreeProxy() {
  console.log('[PROXY-ROTATOR] 🕵️ Mengambil daftar proxy SOCKS5 publik gratis...');
  try {
    const res = await fetch('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/socks5.txt');
    if (!res.ok) throw new Error('Fetch proxy list failed');
    const text = await res.text();
    
    // Parse, filter and shuffle
    const allProxies = text.split('\n').map(p => p.trim()).filter(p => p.length > 8);
    const proxies = allProxies.sort(() => 0.5 - Math.random()).slice(0, 50); // Ambil 50 random untuk di-race
    
    console.log(`[PROXY-ROTATOR] 🚀 Balapan (Racing) ${proxies.length} proxy ke WhatsApp Web...`);

    const promises = proxies.map(ipPort => {
      return new Promise((resolve, reject) => {
        const proxyUrl = 'socks5://' + ipPort;
        const agent = new SocksProxyAgent(proxyUrl);
        const req = https.get('https://web.whatsapp.com', { agent, timeout: 5000 }, (res) => {
          if (res.statusCode === 200 || res.statusCode === 301 || res.statusCode === 302) {
            req.destroy(); // Tutup segera, kita cuma butuh tahu konek atau tidak
            resolve(proxyUrl);
          } else {
            req.destroy();
            reject(new Error('Bad status ' + res.statusCode));
          }
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', (err) => reject(err));
      });
    });

    const winner = await Promise.any(promises);
    console.log(`[PROXY-ROTATOR] ✅ Ditemukan Proxy Gratis Aktif! Menang dengan kecepatan tinggi: ${winner}`);
    return winner;
  } catch (e) {
    console.log('[PROXY-ROTATOR] ❌ Semua 50 proxy gagal (timeout/error). WhatsApp Web mungkin sedang ketat.');
    return null;
  }
}

module.exports = { getWorkingFreeProxy };
