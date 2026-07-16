<p align="center">
  <img src="docs/assets/pigeon-logo.png" alt="Pigeon Logo" width="120" height="120" />
</p>

# Pigeon - Linux Docker

Pigeon is a production-oriented, multi-user workspace for Facebook Pages, Messenger and WhatsApp/OpenWA. Each user owns their own connected accounts, contacts, conversations and campaigns. Owners, admins and moderators receive separate role-based administration capabilities.

This is the **Linux Docker** source release, prepared with a production Dockerfile and Docker Compose stack for containerized Linux server deployment.

For the main project hub or other deployment targets, visit the **[Pigeon Main Repository Hub](https://github.com/MoGLCL/Pigeon)**.

## Requirements

- A Linux host with Docker Engine and Docker Compose v2.
- A DNS name and HTTPS reverse proxy (for Facebook callbacks and secure session cookies).
- A reachable external `rmyndharis/OpenWA` gateway (if WhatsApp is enabled).

## Setup & Run

1. Copy `.env.example` to `.env` and replace all placeholders with production secrets.
2. Build and start the container stack:
   ```bash
   cp .env.example .env
   docker compose build
   docker compose up -d
   ```
3. Seed the first owner account (first run only):
   ```bash
   docker compose exec app npm run db:seed
   ```

For detailed instructions, refer to **[docs/DOCKER-LINUX.md](docs/DOCKER-LINUX.md)**.
