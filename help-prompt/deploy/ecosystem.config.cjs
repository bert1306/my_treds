/**
 * PM2: Help Prompt на порту 3000 (Nginx)
 */
module.exports = {
  apps: [
    {
      name: "help-prompt",
      cwd: __dirname + "/..",
      script: "node_modules/.bin/next",
      args: "start --port 3000",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: { NODE_ENV: "production" },
    },
  ],
};
