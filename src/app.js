// ============================================================
// CRITICAL FIX — MUST BE FIRST LINE BEFORE ANY REQUIRE()
// Node 20 on Hugging Face Docker prefers IPv6 DNS by default.
// api.telegram.org IPv6 routes fail on HF free tier.
// This line forces ALL DNS lookups in this process to return
// IPv4 addresses first, fixing TLS socket disconnect errors.
// ============================================================
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

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
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));

// ============================================================
// ROOT ENDPOINT — Basic identity check
// ============================================================
app.get('/', (req, res) => {
  res.status(200).json({ status: 'N.E.X.A Cloud Core Online', version: '2.0.0' });
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
    version: '2.0.0',
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
// SERVER BOOT
// ============================================================
const cronInterface = require('./interfaces/cron');

if (require.main === module) {
  // PORT defaults to 7860 for Hugging Face Spaces compatibility
  // Falls back to env.PORT which defaults to 3000 for local dev
  const port = process.env.PORT || env.PORT || 7860;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[N.E.X.A] ✅ Server running on port ${port} (${process.env.NODE_ENV || 'development'} mode)`);
    console.log(`[N.E.X.A] 🏥 Health endpoint: http://0.0.0.0:${port}/health`);
    // Initialize cron jobs AFTER server is listening
    // node-cron will run Morning Briefing at 05:30 WIB
    cronInterface.initCronJobs();
    console.log('[N.E.X.A] ⏰ Cron jobs initialized (Morning Briefing: 05:30 WIB)');
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


