<p align="center">
  <img src="docs/assets/pigeon-logo.png" alt="Pigeon Logo" width="120" height="120" />
</p>

# Pigeon (Main Repository Hub)

Pigeon is a production-oriented, multi-user workspace for Facebook Pages, Messenger and WhatsApp/OpenWA. Each user owns their own connected accounts, contacts, conversations and campaigns. Owners, admins and moderators receive separate role-based administration capabilities.

This is the **Main Repository Hub** containing the complete source code, development tools, and packaging pipeline. From this repository, three target-specific deployment variants are generated and maintained in their own dedicated GitHub repositories:

## Specialized Repositories

To simplify deployment depending on your target infrastructure, Pigeon is packaged into three distinct GitHub repositories:

1. **[Pigeon Windows Local](https://github.com/MoGLCL/Pigeon-Windows-Local)**
   - **Use case:** Local development or native Windows server deployments without Docker.
   - **Guide:** [Windows local installation guide](docs/WINDOWS.md)
   
2. **[Pigeon Linux Docker](https://github.com/MoGLCL/Pigeon-Linux-Docker)**
   - **Use case:** Repetitive Linux server production environments using Docker and Docker Compose.
   - **Guide:** [Linux + Docker installation guide](docs/DOCKER-LINUX.md)

3. **[Pigeon Private Hosting](https://github.com/MoGLCL/Pigeon-Private-Hosting)**
   - **Use case:** Deploying to Node-capable VPS, shared hosting, or control panels (cPanel/Plesk) with PM2.
   - **Guide:** [Private hosting deployment guide](docs/PRIVATE-HOSTING.md)

---

## Packaging & Release Pipeline

The root folder contains the full development suite. The target-specific releases are built from this source code.

To generate the clean source distributions for all three versions, run:
```bash
npm run package:releases
```
This script validates, runs tests, and outputs three clean deployment-ready packages inside the `Out/` directory, which correspond directly to the repositories listed above.

---

## Features & Architecture

### What is included

- Authentication by username or email, password recovery, session management and role-based access control.
- Multi-account WhatsApp through the existing `rmyndharis/OpenWA` gateway: QR connection, contacts, chat, media, broadcasts and realtime event ingestion.
- Facebook Page OAuth, Page selection, publishing, post/comment sync, replies, post drill-down analytics and Page audience demographics when Meta returns them.
- Messenger inbox with multiple Pages, attachments, realtime updates and conversation cleanup.
- Real dashboard analytics, announcements, notifications, activity, contacts, broadcasts, support and an admin panel.
- Owner-controlled branding, site mode, registration, Facebook callback/configuration, OpenWA configuration, email and scheduled-job secrets stored in the database (secrets encrypted).

### Languages and platform

- TypeScript and JavaScript (Node.js server, Next.js and React)
- HTML5 / JSX and CSS3
- SQL via PostgreSQL and Prisma
- JSON, YAML (Docker Compose), Markdown and shell/PowerShell commands in deployment documentation

### Main libraries and services

- Next.js 15, React 19, Auth.js / NextAuth 5 and a custom Socket.IO server
- Prisma 7, PostgreSQL, `pg` and `@prisma/adapter-pg`
- Socket.IO client/server, Axios and Zod
- React Hook Form, resolvers, TanStack Query and Zustand
- GSAP / ScrollTrigger support, Motion, Lucide React and React Icons
- bcryptjs, date-fns, React Markdown, clsx and tailwind-merge
- Vitest and TypeScript for verification
- Docker / Docker Compose for Linux deployment
- The separate official project used by this application: [rmyndharis/OpenWA](https://github.com/rmyndharis/OpenWA)

---

## Setup & Documentation

For general setup information and auxiliary integration instructions:
- [Facebook and OpenWA configuration](docs/INTEGRATIONS.md)
- [Operations, backups and verification](docs/OPERATIONS.md)

## Fast local setup

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Install PostgreSQL and keep a separate checkout of `rmyndharis/OpenWA` available if WhatsApp is needed.
3. Run `npm install`, `npm run db:generate`, `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev`.
5. Sign in as the seeded owner and complete **Admin → Configuration**. Environment values are bootstrap fallbacks; saved administration values live in PostgreSQL and secrets are encrypted.

## Verification

```text
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Never commit `.env`, database dumps, uploaded media, Facebook tokens, OpenWA API keys, `AUTH_SECRET`, `ENCRYPTION_KEY` or `CRON_SECRET`.
