# Linux deployment with Docker

This guide corresponds to the **[Pigeon-Linux-Docker](https://github.com/MoGLCL/Pigeon-Linux-Docker)** release.
The main development repository (hub) is located at **[MoGLCL/Pigeon](https://github.com/MoGLCL/Pigeon)**.

## Requirements

- A Linux host with Docker Engine and Docker Compose v2
- A DNS name and HTTPS reverse proxy for public Facebook callbacks and secure cookies
- A reachable external `rmyndharis/OpenWA` service if WhatsApp is enabled

## Deploy

```bash
cp .env.example .env
# replace all secrets and public URLs in .env
docker compose build
docker compose up -d
docker compose ps
docker compose logs -f app
```

Compose creates PostgreSQL and persistent application-data volumes. It overrides `DATABASE_URL` so the app reaches the `db` service and sets `OPENWA_AUTO_START=false`; set `OPENWA_BASE_URL` to the HTTPS/internal URL of your separately deployed OpenWA gateway.

The app container runs `prisma migrate deploy` before starting. Seed the first owner once:

```bash
docker compose exec app npm run db:seed
```

Terminate TLS at a reverse proxy and forward HTTP/WebSocket traffic to port 3000. Set `APP_URL` and `AUTH_URL` to the final HTTPS origin. Do not publish PostgreSQL port 5432 to the public internet in production; remove the compose `ports` entry for `db` when external access is unnecessary.
