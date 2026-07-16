<p align="center">
  <img src="docs/assets/pigeon-logo.png" alt="Pigeon Logo" width="120" height="120" />
</p>

# Pigeon - Private Hosting

Pigeon is a production-oriented, multi-user workspace for Facebook Pages, Messenger and WhatsApp/OpenWA. Each user owns their own connected accounts, contacts, conversations and campaigns. Owners, admins and moderators receive separate role-based administration capabilities.

This is the **Private Hosting** source release, optimized for Node-capable VPS, shared hosting, or control panels (cPanel/Plesk) with PM2 support.

For the main project hub or other deployment targets, visit the **[Pigeon Main Repository Hub](https://github.com/MoGLCL/Pigeon)**.

## Requirements

- Node.js 22 LTS, npm.
- A PostgreSQL database (local or provided by your hosting panel).
- An external `rmyndharis/OpenWA` gateway (if WhatsApp is enabled).

## Setup & Run

1. Upload the source files to your hosting server (excluding `.env`, `node_modules`, `.next`, etc.).
2. Copy `.env.production.example` to `.env` on the server and configure the database URL and application secrets.
3. Install, generate, migrate, seed, and build:
   ```bash
   npm ci
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   npm run build
   ```
4. Start the application with PM2:
   ```bash
   pm2 start ecosystem.config.cjs
   ```

For detailed instructions, refer to **[docs/PRIVATE-HOSTING.md](docs/PRIVATE-HOSTING.md)**.
