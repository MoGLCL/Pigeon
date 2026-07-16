# Private hosting deployment

This guide corresponds to the **[Pigeon-Private-Hosting](https://github.com/MoGLCL/Pigeon-Private-Hosting)** release.
The main development repository (hub) is located at **[MoGLCL/Pigeon](https://github.com/MoGLCL/Pigeon)**.

Use the `Pigeon-Private-Hosting` distribution when deploying to your own Node-capable host, VPS or control panel.

1. Upload the source without `.env`, `node_modules`, `.next`, runtime logs, database dumps or user media.
2. Create the PostgreSQL database and user in the hosting panel.
3. Copy `.env.production.example` to `.env` on the server only, then add the real database URL, application origin and newly generated secrets.
4. Run `npm ci`, `npm run db:generate`, `npm run db:deploy`, `npm run db:seed` (first installation only), and `npm run build`.
5. Start with `npm run start:custom`, or use the included PM2 ecosystem file.
6. Point the reverse proxy to port 3000 with WebSocket upgrade enabled.

If the host cannot run Chromium persistently, do not enable managed OpenWA startup. Run `rmyndharis/OpenWA` on a VPS/container and configure its URL/API key in **Admin → Configuration**.

Never put live credentials in the source archive or GitHub repository. Owner configuration stored in the database overrides bootstrap environment values.
