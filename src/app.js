// ============================================================
// CRITICAL FIX — MUST BE FIRST LINE BEFORE ANY REQUIRE()
// Node 20 on Hugging Face Docker prefers IPv6 DNS by default.
// api.telegram.org IPv6 routes fail on HF free tier.
// This line forces ALL DNS lookups in this process to return
// IPv4 addresses first, fixing TLS socket disconnect errors.
// ============================================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Initialize Self-Awareness logger
require('./utils/logger');

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const axios = require('axios');
const https = require('https');

// ============================================================
// FIX: HUGGING FACE NETWORK TLS BUG
// Force IPv4 for all Axios requests to prevent 'socket disconnected'
// ============================================================
axios.defaults.httpsAgent = new https.Agent({ family: 4 });


const env = require('./config/env');

const app = express();
app.disable('x-powered-by');

// ============================================================
// MIDDLEWARES
// ============================================================
app.use(cors());
app.use(morgan('dev', {
  skip: (req, res) => {
    // Skip noisy automated web scanner hits (404s like .env, .git, config)
    if (res.statusCode === 404) return true;
    // Skip noisy GET/HEAD hits to root path (/) and its query variations (/?__theme=dark)
    // Only /health and /webhook will be logged normally
    if (req.path === '/' && (req.method === 'GET' || req.method === 'HEAD')) return true;
    return false;
  }
}));
app.use(express.json({ limit: '1mb' }));

// ============================================================
// ROOT ENDPOINT — Basic identity check
// ============================================================
app.get('/', (req, res) => {
  res.status(200).json({ status: 'N.E.X.A Cloud Core Online', version: '3.0.0' });
});

// ============================================================
// HEALTH ENDPOINT — Lapisan 2: Paramedis (Smart Vital Signs)
// Digunakan oleh: UptimeRobot, cron-job.org, Tasker Watchdog
// MUST be registered BEFORE webhook router for fastest response
// ============================================================
app.get('/health', (req, res) => {
  const uptimeSeconds = Math.floor(process.uptime());
  const memoryMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const timestampJakarta = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  res.status(200).json({
    status: 'ALIVE',
    service: 'N.E.X.A Cloud Core',
    version: '3.0.0',
    uptime_seconds: uptimeSeconds,
    uptime_human: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    timestamp_jakarta: timestampJakarta,
    memory_mb: memoryMb,
    node_env: process.env.NODE_ENV || 'development'
  });
});

// ============================================================
// WEBHOOK ROUTER — All /webhook/* routes
// ============================================================
const webhookRouter = require('./interfaces/webhook');
app.use('/webhook', webhookRouter);

// ============================================================
// SERVER BOOT & WEBSOCKET MOBILE BRIDGE (NEXA 3.0)
// ============================================================
const cronInterface = require('./interfaces/cron');
const http = require('http');
const mobileBridgeWs = require('./interfaces/mobile_bridge/MobileBridge_WS');

if (require.main === module) {
  const port = process.env.PORT || env.PORT || 7860;
  
  const server = http.createServer(app);
  mobileBridgeWs.initWebSocket(server);

  server.listen(port, '0.0.0.0', () => {
    console.log(`[N.E.X.A 3.0] ✅ Server running on port ${port} (${process.env.NODE_ENV || 'development'} mode)`);
    console.log(`[N.E.X.A 3.0] 📱 Mobile Bridge WebSocket Endpoint: /ws`);
    console.log(`[N.E.X.A 3.0] 🏥 Health endpoint: http://0.0.0.0:${port}/health`);
    console.log(`[N.E.X.A 3.0] 💻 CLI Local URL  : http://127.0.0.1:${port}`);
    console.log(`[N.E.X.A] 🌐 CLI Cloud Space: https://nexa-asistant-nexa-core-server.hf.space`);
    // Initialize cron jobs AFTER server is listening
    // node-cron will run Morning Briefing at 05:30 WIB
    cronInterface.initCronJobs();
    console.log('[N.E.X.A] ⏰ Cron jobs initialized (Morning Briefing: 05:30 WIB)');

    // Recover pending transactions that were never sent to Telegram (e.g. after server restart)
    const financeEngine = require('./domain/Finance_Engine');
    financeEngine.recoverPendingTransactions().then(() => {
      console.log('[N.E.X.A] 🔄 Pending transaction recovery complete.');
    }).catch(e => {
      console.error('[N.E.X.A] Pending transaction recovery error:', e.message);
    });

    // ── Pintu 2: WhatsApp (DINONAKTIFKAN) ─────────────────────────
    // WhatsApp adapter telah dinonaktifkan untuk deployment cloud.
    // Lihat src/interfaces/whatsapp/ untuk implementasi lokal.
  });
}

// ============================================================
// GLOBAL SAFETY NET — Last line of defense
// Catches any Promise rejection or synchronous exception that
// escaped all domain-level try-catch blocks.
// IMPORTANT: We LOG only — never call process.exit() so the
// server stays alive and continues serving requests.
// ============================================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SAFETY NET] Unhandled Promise Rejection:');
  console.error('  Promise:', promise);
  console.error('  Reason:', reason instanceof Error ? reason.message : reason);
  // Server stays alive — no process.exit()
});

process.on('uncaughtException', (error) => {
  console.error('[SAFETY NET] Uncaught Exception — server continues running:');
  console.error('  Error:', error.message);
  console.error('  Stack:', error.stack);
  // Server stays alive — no process.exit()
});

module.exports = app;


