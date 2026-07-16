<p align="center">
  <img src="docs/assets/pigeon-logo.png" alt="Pigeon Logo" width="120" height="120" />
</p>

# Pigeon - Windows Local

Pigeon is a production-oriented, multi-user workspace for Facebook Pages, Messenger and WhatsApp/OpenWA. Each user owns their own connected accounts, contacts, conversations and campaigns. Owners, admins and moderators receive separate role-based administration capabilities.

This is the **Windows Local** source release, tailored for native Windows server or local development environments without Docker.

For the main project hub or other deployment targets, visit the **[Pigeon Main Repository Hub](https://github.com/MoGLCL/Pigeon)**.

## Requirements

- Windows 10/11, Node.js 22 LTS, npm, and Git.
- PostgreSQL 16+ (local or remote).
- Chrome, Edge, or Chromium (if Pigeon manages the separate OpenWA process).

## Setup & Run

1. Copy `.env.example` to `.env` and configure your credentials.
2. Clone and install `rmyndharis/OpenWA` in a separate directory if WhatsApp is needed.
3. Install dependencies and run migrations:
   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   ```
4. Start the application:
   ```powershell
   npm run dev
   ```

For detailed instructions, refer to **[docs/WINDOWS.md](docs/WINDOWS.md)**.
