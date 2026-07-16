# Operations and verification

## Database lifecycle

- Development schema change: `npm run db:migrate`
- Production migration: `npm run db:deploy`
- Prisma client: `npm run db:generate`
- Initial owner only: `npm run db:seed`

Back up PostgreSQL and the persistent `data/uploads` / `data/media` folders together. Test restores regularly. Encryption-protected rows require the same `ENCRYPTION_KEY`; losing it makes encrypted secrets and messages unrecoverable.

## Scheduled work

Cron routes require `Authorization: Bearer <CRON_SECRET>`. Schedule Facebook sync/publishing, broadcast processing, OpenWA heartbeat, archive and notification cleanup according to the server capacity. Rotate the secret after any suspected leak.

## Release checks

```text
npm ci
npm run db:generate
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Inspect the Facebook and WhatsApp service-health states after deployment. Verify HTTPS callbacks, WebSocket delivery, password-reset email, one QR connection and one Facebook reconnect before inviting users.
