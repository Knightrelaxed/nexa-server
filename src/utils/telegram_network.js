/**
 * telegram_network.js — Unified outbound HTTP for Hugging Face Spaces
 *
 * ROOT CAUSE (confirmed HF community + logs):
 * HF Docker intentionally RSTs/block TLS to api.telegram.org and *.workers.dev.
 * This is NOT an axios/keepAlive/SNI bug — Groq/Gmail/Supabase work fine.
 *
 * STRATEGY:
 * 1. User webhook replies → Telegram webhook response JSON (ZERO outbound) — see webhook.js
 * 2. Cron/Tasker/media → relay via Vercel (*.vercel.app) or AllOrigins fallback
 * 3. Serialize concurrent outbound to avoid NAT connection storms
 * 4. Use native fetch() (Node 20+) — fresh connection per request
 */

const dns = require('dns');
const env = require('../config/env');

dns.setDefaultResultOrder('ipv4first');

let outboundChain = Promise.resolve();

function enqueueOutbound(task) {
  const run = outboundChain.then(task, task);
  outboundChain = run.catch(() => {});
  return run;
}

function getRelayBaseUrl() {
  const vercel = String(env.NEXA_VERCEL_RELAY_URL || '').trim();
  if (vercel) return vercel.replace(/\/+$/, '');

  const legacy = String(env.TELEGRAM_PROXY_URL || '').trim();
  if (legacy) {
    if (legacy.includes('.workers.dev')) {
      console.warn('[NET] TELEGRAM_PROXY_URL points to workers.dev — HF blocks this. Set NEXA_VERCEL_RELAY_URL.');
    }
    return legacy.replace(/\?url=$/, '').replace(/\/+$/, '');
  }
  return null;
}

function buildProxyChain(targetUrl) {
  const chain = [];
  const relayBase = getRelayBaseUrl();
  const secret = String(env.NEXA_RELAY_SECRET || '').trim();

  if (relayBase) {
    const relayGetUrl = relayBase.includes('?url=')
      ? `${relayBase}${encodeURIComponent(targetUrl)}`
      : `${relayBase}/api/relay?url=${encodeURIComponent(targetUrl)}`;

    chain.push({
      name: 'Vercel Relay',
      url: relayGetUrl,
      headers: secret ? { 'X-Nexa-Relay-Secret': secret } : {},
    });
  }

  chain.push({
    name: 'AllOrigins',
    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    headers: {},
  });

  return chain;
}

function isRetryable(err) {
  const msg = String(err.message || '');
  return (
    msg.includes('disconnected before secure TLS') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ECONNABORTED') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('terminated') ||
    msg.includes('aborted')
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithFailover(targetUrl, options = {}) {
  const {
    timeoutMs = 30_000,
    maxRetriesPerProxy = 2,
    responseType = 'json',
    extraHeaders = {},
    method = 'GET',
    body = null,
  } = options;

  const proxies = buildProxyChain(targetUrl);

  return enqueueOutbound(async () => {
    for (const proxy of proxies) {
      for (let attempt = 1; attempt <= maxRetriesPerProxy; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
          const fetchOptions = {
            method,
            signal: controller.signal,
            headers: {
              Connection: 'close',
              Accept: '*/*',
              'User-Agent': 'NEXA-Network/1.0',
              ...proxy.headers,
              ...extraHeaders,
            },
          };

          if (body) {
            fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
            if (!fetchOptions.headers['Content-Type']) {
              fetchOptions.headers['Content-Type'] = 'application/json';
            }
          }

          const response = await fetch(proxy.url, fetchOptions);

          clearTimeout(timer);

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
          }

          if (responseType === 'buffer') {
            const buf = Buffer.from(await response.arrayBuffer());
            console.log(`[NET] ${proxy.name} buffer OK (${buf.length} bytes, attempt ${attempt})`);
            return buf;
          }

          const text = await response.text();
          if (responseType === 'text') {
            console.log(`[NET] ${proxy.name} text OK (${text.length} chars, attempt ${attempt})`);
            return text;
          }

          try {
            const parsed = JSON.parse(text);
            console.log(`[NET] ${proxy.name} JSON OK (attempt ${attempt})`);
            return parsed;
          } catch {
            throw new Error(`Invalid JSON from ${proxy.name}: ${text.substring(0, 120)}`);
          }
        } catch (err) {
          clearTimeout(timer);
          const detail = err.cause?.message || err.message;
          console.warn(`[NET] ${proxy.name} attempt ${attempt}/${maxRetriesPerProxy} failed: ${detail.substring(0, 160)}`);

          if (attempt < maxRetriesPerProxy && isRetryable(err)) {
            await sleep(800 * attempt);
            continue;
          }
          break;
        }
      }
    }

    throw new Error(`All proxy paths failed for: ${targetUrl.substring(0, 80)}...`);
  });
}

async function fetchRelayB64(targetUrl, maxSize = 20 * 1024 * 1024) {
  const relayBase = getRelayBaseUrl();
  if (!relayBase) throw new Error('No relay configured for binary download');

  const secret = String(env.NEXA_RELAY_SECRET || '').trim();
  const b64Url = relayBase.includes('?url=')
    ? `${relayBase}${encodeURIComponent(targetUrl)}&b64=true`
    : `${relayBase}/api/relay?url=${encodeURIComponent(targetUrl)}&b64=true`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const response = await fetch(b64Url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Connection: 'close',
        ...(secret ? { 'X-Nexa-Relay-Secret': secret } : {}),
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Relay b64 HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok || !data.data) {
      throw new Error(`Relay b64 error: ${data.error || 'no data'}`);
    }
    if (data.size > maxSize) {
      throw new Error(`File size ${data.size} exceeds limit`);
    }
    return data.data;
  } finally {
    clearTimeout(timer);
  }
}

async function postToRelay(path, body, timeoutMs = 90_000) {
  const relayBase = getRelayBaseUrl();
  if (!relayBase) throw new Error('No relay configured');

  const secret = String(env.NEXA_RELAY_SECRET || '').trim();
  const url = relayBase.includes('?url=')
    ? `${relayBase.replace(/\?url=$/, '')}${path.replace('/api', '')}`
    : `${relayBase}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Connection: 'close',
        ...(secret ? { 'X-Nexa-Relay-Secret': secret } : {}),
      },
      body: JSON.stringify(body),
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Relay POST ${path} HTTP ${response.status}: ${errText.substring(0, 200)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function formatTelegramHtml(text) {
  if (!text) return '';
  let str = String(text);

  // 1. Convert common HTML breaks and block elements from LLM to clean linebreaks
  str = str.replace(/<br\s*\/?>/gi, '\n');
  str = str.replace(/<\/?p>/gi, '\n\n');
  str = str.replace(/<\/?div>/gi, '\n');
  str = str.replace(/<h[1-6]>(.*?)<\/h[1-6]>/gi, '<b>$1</b>\n');
  str = str.replace(/<\/?(ul|ol)>/gi, '\n');
  str = str.replace(/<li>(.*?)<\/li>/gi, '• $1\n');
  str = str.replace(/<hr\s*\/?>/gi, '\n— — — — —\n');

  // 2. Convert standard markdown syntax to Telegram HTML
  str = str.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  str = str.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  str = str.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 3. Protect allowed Telegram HTML tags using temporary placeholders
  const validTags = ['b', 'i', 'u', 's', 'code', 'pre', 'a', 'blockquote', 'tg-spoiler', 'strong', 'em', 'strike', 'del'];
  const validTagRegex = new RegExp(`<(\/?)(${validTags.join('|')})\\b([^>]*)>`, 'gi');
  str = str.replace(validTagRegex, '###TAG_$1$2$3###');

  // 4. Escape all remaining < and > characters to prevent Telegram HTTP 400 Bad Request
  str = str.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 5. Restore protected valid tags
  str = str.replace(/###TAG_(\/?)([a-z0-9_-]+)([^#]*)###/gi, '<$1$2$3>');

  return str.trim();
}

async function sendTelegramMessage(text, chatId, botToken, payload = null) {
  const safeText = formatTelegramHtml(String(text).substring(0, 4000));
  
  if (payload) {
    const telegramUrl = `https://api.telegram.org/bot${botToken}/${payload.method || 'sendMessage'}`;
    const body = {
      chat_id: chatId,
      text: safeText,
      parse_mode: 'HTML',
      ...payload
    };
    return fetchWithFailover(telegramUrl, {
      method: 'POST',
      body,
      timeoutMs: 30_000,
      maxRetriesPerProxy: 3
    });
  }

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&parse_mode=HTML&text=${encodeURIComponent(safeText)}`;
  return fetchWithFailover(telegramUrl, { timeoutMs: 30_000, maxRetriesPerProxy: 3 });
}

async function sendTelegramPhoto(photoUrl, caption, chatId, botToken, extraOptions = {}) {
  const safeCaption = formatTelegramHtml(String(caption || '').substring(0, 1024));
  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption: safeCaption,
    parse_mode: 'HTML',
    ...extraOptions
  };
  return fetchWithFailover(telegramUrl, {
    method: 'POST',
    body,
    timeoutMs: 30_000,
    maxRetriesPerProxy: 3
  });
}

// sendChatAction — Pure fire-and-forget, NO serialization queue.
// Each call races independently to Telegram so typing appears INSTANTLY,
// never waiting behind any other outbound request.
function sendChatAction(chatId, botToken, action = 'typing') {
  if (!chatId || !botToken) return;
  const relayBase = getRelayBaseUrl();
  if (!relayBase) return;

  const secret = String(env.NEXA_RELAY_SECRET || '').trim();
  const relayUrl = relayBase.includes('?url=')
    ? `${relayBase.replace(/\?url=$/, '')}/sendAction`
    : `${relayBase}/api/sendAction`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  // Completely detached — no await, no queue, no chain
  fetch(relayUrl, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Connection: 'close',
      ...(secret ? { 'X-Nexa-Relay-Secret': secret } : {}),
    },
    body: JSON.stringify({ bot_token: botToken, chat_id: chatId, action }),
  })
    .then(async (resp) => {
      clearTimeout(timer);
      const data = await resp.json().catch(() => ({}));
      if (data.ok) {
        console.log(`[TYPING] sendChatAction OK — chat_id=${chatId}`);
      } else {
        console.warn(`[TYPING] sendChatAction failed — ${JSON.stringify(data).substring(0, 120)}`);
      }
    })
    .catch(() => {
      clearTimeout(timer);
      // Silently suppress — typing is best-effort
    });
}

function startTypingLoop(chatId, botToken, intervalMs = 4500) {
  if (!chatId || !botToken) return () => {};

  // Fire IMMEDIATELY — no queue, no chain, direct network call
  sendChatAction(chatId, botToken, 'typing');

  // Auto-refresh every 4.5s (also fire-and-forget)
  const timer = setInterval(() => {
    sendChatAction(chatId, botToken, 'typing');
  }, intervalMs);

  let stopped = false;
  return () => {
    if (!stopped) {
      stopped = true;
      clearInterval(timer);
    }
  };
}

module.exports = {
  fetchWithFailover,
  fetchRelayB64,
  postToRelay,
  sendTelegramMessage,
  sendTelegramPhoto,
  sendChatAction,
  startTypingLoop,
  formatTelegramHtml,
  buildProxyChain,
  enqueueOutbound,
};
