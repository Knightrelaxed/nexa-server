// ============================================================
// N.E.X.A 3.0 — PM2 ECOSYSTEM CONFIGURATION
// Optimized for Azure VPS (Standard_B2ats_v2 - 2 vCPU, 1 GB RAM)
// ============================================================

module.exports = {
  apps: [{
    name: 'nexa-server',
    script: 'src/app.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '650M', // Graceful restart if RAM exceeds 650MB on 1GB VPS
    node_args: '--max-old-space-size=512', // Allocate healthy V8 heap memory
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
};

