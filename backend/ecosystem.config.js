module.exports = {
  apps: [{
    name: 'badr-transit',
    script: 'src/server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      SERVE_FRONTEND: 'true',
      PORT: 3000,
    },
    max_memory_restart: '500M',
    autorestart: true,
    watch: false,
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
