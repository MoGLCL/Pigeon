module.exports = {
  apps: [{
    name: "pigeon",
    script: "node_modules/tsx/dist/cli.mjs",
    args: "scripts/start-all.ts production",
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    max_memory_restart: "1G",
    env: { NODE_ENV: "production" },
  }],
};
