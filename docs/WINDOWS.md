# Windows local installation (no Docker)

This guide corresponds to the **[Pigeon-Windows-Local](https://github.com/MoGLCL/Pigeon-Windows-Local)** release.
The main development repository (hub) is located at **[MoGLCL/Pigeon](https://github.com/MoGLCL/Pigeon)**.

## Requirements

- Windows 10/11, Node.js 22 LTS, npm and Git
- PostgreSQL 16+ (local or reachable remotely)
- Chrome, Edge or Chromium if Pigeon will manage the separate OpenWA process

## Install

```powershell
Copy-Item .env.example .env
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

Edit `.env` before migration. Generate a 32-byte-or-longer `AUTH_SECRET`, a 64-character hexadecimal `ENCRYPTION_KEY`, a unique `CRON_SECRET`, and a strong owner password. Never reuse the example values.

For WhatsApp, clone and install `rmyndharis/OpenWA` in a separate directory. In **Admin → Configuration**, set its working directory and operator API key. `OPENWA_AUTO_START=true` lets Pigeon start that existing checkout; it does not install OpenWA for you.

Open `http://localhost:3000`. Production mode is `npm.cmd run build` followed by `npm.cmd start`.
