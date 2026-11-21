// ============================================================
// N.E.X.A 3.4 - PM2 ECOSYSTEM CONFIGURATION
// Calibrated for Azure VPS (Standard_B2ats_v2 - 892 MiB RAM + 2 GiB Swap)
// Kept active during Mobile Bridge phases 1-4; systemd migration in Phase 5.
// ============================================================

module.exports = {
  apps: [{
    name: 'nexa-server',
    script: 'src/app.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '420M', // Safe ceiling on 892 MiB VPS (above 216 MiB measured RSS)
    node_args: '--max-old-space-size=320', // Safe headroom above 173 MiB measured Used Heap
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000,
      NEXA_SYSLOG_PREFIX: '1'
    },
    error_file: process.env.NEXA_PM2_ERR_LOG || '/var/log/nexa/err.log',
    out_file: process.env.NEXA_PM2_OUT_LOG || '/var/log/nexa/out.log',
    merge_logs: true // Prevent PM2 from appending "-0" suffix (ensures exact /var/log/nexa/out.log & err.log for nexa-io)
  }]
};
