module.exports = {
  apps: [{
    name: 'nexa',
    script: 'src/app.js',
    instances: 1, // Fork mode required for FreeBSD Serv00 resource quota
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '380M', // Restart if RAM nears 512MB limit
    node_args: '--max-old-space-size=350', // Cap V8 engine heap memory
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
