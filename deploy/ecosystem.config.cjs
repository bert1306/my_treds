/**
 * PM2: запуск Next.js в продакшене.
 * Использование на сервере:
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "my_treds",
      cwd: __dirname + "/..",
      script: "node_modules/.bin/next",
      args: "start",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
