const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const env = require('./config/env');

const app = express();

// ============================================================
// MIDDLEWARES
// ============================================================
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

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

module.exports = app;

