# Hetzner Multi-Site Photo Studio Deploy Design

Date: 2026-05-22

## Goal

Deploy Photo Studio Marketplace onto the existing Hetzner VM without disturbing the already-running CRM staging app. The VM should be organized so additional projects can be deployed later without port, service, database, Docker volume, or path collisions.

## Current Server Context

The Hetzner VM is `ubuntu-4gb-hel1-3` at `204.168.163.99`. The active CRM staging app lives at `/opt/apps/crm-staging`, runs from branch `main`, and is currently public at `http://204.168.163.99:3002`.

Existing CRM services:

- `crm-staging-web.service`
- `crm-staging-telegram.service`

Existing CRM ports:

- Web: `0.0.0.0:3002`
- Postgres: `127.0.0.1:15432`

There is no reverse proxy yet. UFW is inactive. Docker is installed, and classic `docker-compose` is available; `docker compose` should not be assumed reliable on this VM.

## Recommended Infrastructure Shape

Use `/opt/apps/{site-name}` as the standard app root pattern for every deployed project. Keep a server-local port registry at `/opt/apps/PORTS.md` and give each project unique service names, host ports, compose project names, and backup directories.

Recommended site identity for this project:

- Site name: `photo-studio-marketplace`
- App root: `/opt/apps/photo-studio-marketplace`
- Backup root: `/root/deploy-backups/photo-studio-marketplace-YYYYMMDD-HHMMSS`
- API systemd unit: `photo-studio-marketplace-api.service`
- Postgres compose project: `photo_studio_marketplace`

Recommended ports:

- CRM staging web: keep `3002`, but eventually bind it to `127.0.0.1`
- Photo Studio API: `127.0.0.1:4003`
- Photo Studio Postgres: `127.0.0.1:15433`
- Public traffic: reverse proxy on `80` and `443`

The web app is a Vite static build, not a long-running Next.js service. Production should serve `apps/web/dist` through the reverse proxy. The API should run as a Node systemd service through the repository's production API start script. The current TypeScript build is still required for verification, but its ESM output is not directly Node-runnable until extension-safe Node ESM packaging is added.

## Reverse Proxy

Install one shared reverse proxy for the VM, preferably Caddy for simple TLS automation or nginx if manual control is preferred. The proxy is responsible for public traffic and route ownership.

For Photo Studio Marketplace:

- `/api/*` proxies to `http://127.0.0.1:4003`
- all other routes serve static files from `/opt/apps/photo-studio-marketplace/apps/web/dist`
- SPA fallback should serve `index.html`

For CRM staging:

- keep current direct `:3002` exposure until the proxy is ready
- after proxy verification, change the CRM web unit to bind to `127.0.0.1:3002`
- route the CRM hostname to `http://127.0.0.1:3002`

If no domains are available at implementation time, direct public ports can be used temporarily, but the deploy design should still create the port registry and localhost-bound API/DB services. Public direct ports are a fallback, not the target state.

## Firewall

After confirming SSH access through the configured key, enable UFW with a narrow allowlist:

- allow SSH on `22`
- allow HTTP on `80`
- allow HTTPS on `443`
- do not expose project app or database ports publicly

The current public `3389` listener should be reviewed before enabling the firewall. If remote desktop is not intentionally needed, close it. If it is needed, restrict it explicitly rather than leaving all ports open.

## Database

Run a separate Postgres container for this project using classic `docker-compose` and an explicit compose project name:

```bash
COMPOSE_PROJECT_NAME=photo_studio_marketplace docker-compose -f ops/staging/docker-compose.yml up -d postgres
```

The compose file should map Postgres to `127.0.0.1:15433`, not `0.0.0.0`. The app `DATABASE_URL` should point to that host port from the VM, for example:

```text
postgresql://USER:PASSWORD@127.0.0.1:15433/photo_studios
```

For the first production-like deployment, use the repository's existing Prisma commands:

```bash
npm run db:generate -w apps/api
npm run db:push -w apps/api
```

Once the schema needs audited rollout history, switch deployment to Prisma migrations rather than `db:push`.

## Environment

Use `/opt/apps/photo-studio-marketplace/.env` for production values and keep it out of git. Load it safely in shell scripts because existing server handoff notes show CRLF line endings can break plain `source .env`:

```bash
set -a
source <(tr -d '\r' < .env)
set +a
```

Required production env includes:

- `PORT=4003`
- `HOST=127.0.0.1`
- `PUBLIC_APP_URL`
- `DATABASE_URL`
- `BOOKING_LINK_SECRET`
- `MANUAL_PAYMENT_MODE=true`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- optional future Stripe keys, left unset while manual payment mode is active

## Deploy Flow

The deploy flow should be repeatable and should not modify other `/opt/apps` projects.

1. Verify the target path is exactly under `/opt/apps/photo-studio-marketplace`.
2. Clone the repo if missing, otherwise fetch the configured branch.
3. Create a timestamped backup directory under `/root/deploy-backups`.
4. Save git status, current SHA, and local diff before changing the server checkout.
5. Stash dirty server changes before checkout.
6. Check out the requested branch or ref.
7. Install dependencies with `npm ci` or another lockfile-strict install.
8. Load `.env` using CRLF stripping.
9. Start or update the project's Postgres container with a unique compose project name.
10. Run Prisma generate and the selected schema deploy command.
11. Build shared packages, API, and web through `npm run build`.
12. Install or update `photo-studio-marketplace-api.service`.
13. Install or update the reverse proxy route.
14. Restart only the Photo Studio API service and reload only the reverse proxy.
15. Healthcheck `http://127.0.0.1:4003/health`, `http://127.0.0.1:4003/api/readiness`, and the public URL.

## Systemd API Service

The API service should run from the repository root so workspace package resolution and env file discovery behave consistently.

```ini
[Unit]
Description=Photo Studio Marketplace API
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/apps/photo-studio-marketplace
Environment=NODE_ENV=production
Environment=HOST=127.0.0.1
Environment=PORT=4003
EnvironmentFile=/opt/apps/photo-studio-marketplace/.env
ExecStart=/usr/bin/npm run start -w apps/api
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Health Checks

Minimum checks after each deploy:

```bash
systemctl is-active photo-studio-marketplace-api.service
curl -fsS --max-time 20 http://127.0.0.1:4003/health
curl -fsS --max-time 20 http://127.0.0.1:4003/api/readiness
curl -fsSI --max-time 20 "$PUBLIC_APP_URL"
```

Before inviting real users, also run the repository's production-like checks locally or on the server:

```bash
npm run test:soft-launch -w apps/api
npm run typecheck
npm run build
```

## Risks And Mitigations

- Existing CRM currently binds to `0.0.0.0:3002`. Do not change it until the reverse proxy is installed and verified.
- UFW is inactive. Do not add more public app ports unless using a short-lived fallback.
- Use classic `docker-compose`, because the VM has known `docker compose` reliability caveats.
- Avoid `/opt/crm-staging`; it is an older duplicate path. Active apps belong under `/opt/apps`.
- Keep compose project names unique to prevent Postgres container and volume collisions.
- Treat `.env` files as server-local secrets and load them with CRLF stripping in scripts.
- Web and API have different production shapes: Vite static files for web, Node systemd service for API.
