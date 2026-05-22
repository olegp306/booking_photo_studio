# Hetzner Multi-Site Photo Studio Deploy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repository-owned deployment artifacts and a safe execution path for deploying Photo Studio Marketplace to the shared Hetzner VM without disrupting the existing CRM staging app.

**Architecture:** The repo will provide deployable ops files, while secrets and live state remain server-local under `/opt/apps/photo-studio-marketplace`. The Vite web app is served as static files behind a shared reverse proxy, the Fastify API runs through a localhost-bound systemd service using the repo's production start script, and Postgres runs in a uniquely named Docker Compose project with a localhost-only host port.

**Tech Stack:** npm workspaces, Vite, React, Fastify, Prisma, tsx, PostgreSQL 16 via classic `docker-compose`, systemd, Caddy reverse proxy, Ubuntu 22.04 on Hetzner.

---

## File Structure

- Modify `apps/api/package.json`: add a production `start` script that runs the Fastify API through `tsx`.
- Create `ops/staging/docker-compose.yml`: local-only Postgres service for this app, using `DB_HOST_PORT=15433` and a named volume isolated by compose project name.
- Create `ops/deploy/photo-studio-marketplace-api.service`: systemd unit template for the API.
- Create `ops/deploy/Caddyfile.photo-studio-marketplace.example`: reverse proxy and static web serving example.
- Create `ops/deploy/PORTS.example.md`: canonical server port registry content to copy into `/opt/apps/PORTS.md`.
- Create `ops/deploy/deploy-photo-studio-marketplace.sh`: repeatable server-side deploy script with backups, CRLF-safe env loading, lockfile install, Prisma deploy, build, restart, and healthchecks.
- Create `ops/deploy/env.production.example`: safe non-secret production env shape for the server-local `.env`.
- Modify `README.md`: add a short Hetzner deployment section pointing to the ops files and spec.

## Root Cause Note

`npm run build -w apps/api` currently emits ESM files with extensionless relative imports such as `import { loadRuntimeConfig } from "./env";`. Running `node apps/api/dist/index.js` fails with `ERR_MODULE_NOT_FOUND` because Node ESM does not resolve `./env` to `./env.js`. The deploy plan therefore adds an explicit API `start` script using the existing `tsx` dependency and points systemd at that script. The TypeScript build remains part of verification.

## Task 0: Add Production API Start Script

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Reproduce the current dist runtime failure**

Run:

```powershell
npm run build -w apps/api
node apps/api/dist/index.js
```

Expected: the second command exits with `ERR_MODULE_NOT_FOUND` for `apps/api/dist/env`.

- [ ] **Step 2: Add the start script**

Modify the `scripts` block in `apps/api/package.json` so it is exactly:

```json
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:soft-launch": "vitest run src/softLaunchSmoke.test.ts",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "db:generate": "prisma generate --schema prisma/schema.prisma",
    "db:push": "prisma db push --schema prisma/schema.prisma",
    "db:migrate": "prisma migrate dev --schema prisma/schema.prisma",
    "db:studio": "prisma studio --schema prisma/schema.prisma"
  },
```

- [ ] **Step 3: Verify the start script boots the API**

Run:

```powershell
$env:HOST="127.0.0.1"
$env:PORT="4403"
$process = Start-Process -FilePath npm -ArgumentList "run start -w apps/api" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3
try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:4403/health" | Select-Object -ExpandProperty StatusCode
} finally {
  Stop-Process -Id $process.Id -Force
}
```

Expected: command prints `200`.

- [ ] **Step 4: Commit Task 0**

Run:

```powershell
git add apps/api/package.json
git commit -m "Add production API start script"
```

Expected: commit succeeds.

## Task 1: Add Isolated Postgres Compose File

**Files:**
- Create: `ops/staging/docker-compose.yml`

- [ ] **Step 1: Create the staging ops directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path ops\staging
```

Expected: command exits `0` and `ops/staging` exists.

- [ ] **Step 2: Add the Postgres compose file**

Create `ops/staging/docker-compose.yml` with exactly:

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-photo_studios}
      POSTGRES_USER: ${POSTGRES_USER:-photo_studio}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-photo_studio_local_password}
    ports:
      - "127.0.0.1:${DB_HOST_PORT:-15433}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

- [ ] **Step 3: Validate compose syntax locally if Docker is available**

Run:

```powershell
docker-compose -f ops\staging\docker-compose.yml config
```

Expected: command prints normalized compose config and exits `0`. If Docker is not available locally, record that the syntax check will be run on the VM before starting Postgres.

- [ ] **Step 4: Commit Task 1**

Run:

```powershell
git add ops/staging/docker-compose.yml
git commit -m "Add isolated Postgres compose file"
```

Expected: commit succeeds.

## Task 2: Add Service, Proxy, Port Registry, And Env Templates

**Files:**
- Create: `ops/deploy/photo-studio-marketplace-api.service`
- Create: `ops/deploy/Caddyfile.photo-studio-marketplace.example`
- Create: `ops/deploy/PORTS.example.md`
- Create: `ops/deploy/env.production.example`

- [ ] **Step 1: Create the deploy ops directory**

Run:

```powershell
New-Item -ItemType Directory -Force -Path ops\deploy
```

Expected: command exits `0` and `ops/deploy` exists.

- [ ] **Step 2: Add the systemd API service template**

Create `ops/deploy/photo-studio-marketplace-api.service` with exactly:

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

- [ ] **Step 3: Add the Caddy route example**

Create `ops/deploy/Caddyfile.photo-studio-marketplace.example` with exactly:

```caddyfile
:80 {
	root * /opt/apps/photo-studio-marketplace/apps/web/dist
	encode zstd gzip

	handle /api/* {
		reverse_proxy 127.0.0.1:4003
	}

	handle {
		try_files {path} /index.html
		file_server
	}
}
```

- [ ] **Step 4: Add the port registry example**

Create `ops/deploy/PORTS.example.md` with exactly:

```markdown
# /opt/apps Port Registry

Last reviewed: 2026-05-22

| Site | App path | Public route | Internal web/API port | Database host port | systemd units | Compose project |
| --- | --- | --- | --- | --- | --- | --- |
| crm-staging | `/opt/apps/crm-staging` | `http://204.168.163.99:3002` until proxy migration | `3002` | `15432` | `crm-staging-web.service`, `crm-staging-telegram.service` | `crm_staging` |
| photo-studio-marketplace | `/opt/apps/photo-studio-marketplace` | `http://204.168.163.99` until a domain is assigned | `4003` | `15433` | `photo-studio-marketplace-api.service` | `photo_studio_marketplace` |

Rules:

- Bind app and database ports to `127.0.0.1` unless a short-lived direct public test is explicitly planned.
- Allocate new web/API ports upward from `4004`.
- Allocate new database host ports upward from `15434`.
- Use one unique compose project name per site.
- Store deployed apps only under `/opt/apps`.
```

- [ ] **Step 5: Add the production env example**

Create `ops/deploy/env.production.example` with exactly:

```dotenv
PORT=4003
HOST=127.0.0.1
API_PORT=4003
PUBLIC_APP_URL=http://204.168.163.99
LOCAL_DATA_DIR=.data
BOOKING_LINK_SECRET=server-local-booking-link-secret-32-characters

OPENAI_API_KEY=server-local-openai-api-key
OPENAI_LISTING_MODEL=

TELEGRAM_BOT_TOKEN=server-local-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=server-local-telegram-webhook-secret

MANUAL_PAYMENT_MODE=true

DATABASE_URL=postgresql://photo_studio:photo_studio_local_password@127.0.0.1:15433/photo_studios
POSTGRES_DB=photo_studios
POSTGRES_USER=photo_studio
POSTGRES_PASSWORD=photo_studio_local_password
DB_HOST_PORT=15433

RESEND_API_KEY=server-local-resend-api-key
EMAIL_FROM=Photo Studios <hello@example.com>

R2_ACCOUNT_ID=server-local-r2-account-id
R2_ACCESS_KEY_ID=server-local-r2-access-key-id
R2_SECRET_ACCESS_KEY=server-local-r2-secret-access-key
R2_BUCKET=photo-studios
R2_PUBLIC_BASE_URL=https://media.example.com

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

- [ ] **Step 6: Validate templates**

Run:

```powershell
Test-Path ops\deploy\photo-studio-marketplace-api.service
Test-Path ops\deploy\Caddyfile.photo-studio-marketplace.example
Test-Path ops\deploy\PORTS.example.md
Test-Path ops\deploy\env.production.example
```

Expected: each command prints `True`.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add ops/deploy/photo-studio-marketplace-api.service ops/deploy/Caddyfile.photo-studio-marketplace.example ops/deploy/PORTS.example.md ops/deploy/env.production.example
git commit -m "Add Hetzner deployment templates"
```

Expected: commit succeeds.

## Task 3: Add Repeatable Server-Side Deploy Script

**Files:**
- Create: `ops/deploy/deploy-photo-studio-marketplace.sh`

- [ ] **Step 1: Add the deploy script**

Create `ops/deploy/deploy-photo-studio-marketplace.sh` with exactly:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

SITE_NAME="photo-studio-marketplace"
APP_DIR="/opt/apps/${SITE_NAME}"
BACKUP_ROOT="/root/deploy-backups"
REPO_URL="${REPO_URL:-https://github.com/olegp306/booking_photo_studio.git}"
BRANCH="${BRANCH:-main}"
API_SERVICE="${SITE_NAME}-api.service"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-photo_studio_marketplace}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root on the Hetzner VM." >&2
  exit 1
fi

case "${APP_DIR}" in
  /opt/apps/photo-studio-marketplace) ;;
  *)
    echo "Refusing to deploy outside /opt/apps/photo-studio-marketplace: ${APP_DIR}" >&2
    exit 1
    ;;
esac

command -v git >/dev/null
command -v npm >/dev/null
command -v node >/dev/null
command -v docker-compose >/dev/null
command -v systemctl >/dev/null

mkdir -p /opt/apps "${BACKUP_ROOT}"

if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO_URL}" "${APP_DIR}"
fi

cd "${APP_DIR}"

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${SITE_NAME}-${TS}"
mkdir -p "${BACKUP_DIR}"

git status --short --branch | tee "${BACKUP_DIR}/git-status-before.txt"
git rev-parse HEAD > "${BACKUP_DIR}/head-before.txt" || true
git diff > "${BACKUP_DIR}/local.diff" || true

if [[ -n "$(git status --porcelain)" ]]; then
  git stash push -u -m "pre-${SITE_NAME}-deploy-${TS}"
fi

git fetch origin "${BRANCH}:refs/remotes/origin/${BRANCH}" --tags
git checkout -B "${BRANCH}" "origin/${BRANCH}"

npm ci

if [[ ! -f .env ]]; then
  echo "Missing ${APP_DIR}/.env. Create it from ops/deploy/env.production.example with production values." >&2
  exit 1
fi

set -a
source <(tr -d '\r' < .env)
set +a

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PUBLIC_APP_URL:?PUBLIC_APP_URL is required}"
: "${BOOKING_LINK_SECRET:?BOOKING_LINK_SECRET is required}"

COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker-compose -f ops/staging/docker-compose.yml up -d postgres
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" docker-compose -f ops/staging/docker-compose.yml ps

npm run db:generate -w apps/api
npm run db:push -w apps/api
npm run build

install -m 0644 ops/deploy/photo-studio-marketplace-api.service "/etc/systemd/system/${API_SERVICE}"
systemctl daemon-reload
systemctl enable "${API_SERVICE}"
systemctl restart "${API_SERVICE}"

systemctl is-active "${API_SERVICE}"
curl -fsS --max-time 20 http://127.0.0.1:4003/health
curl -fsS --max-time 20 http://127.0.0.1:4003/api/readiness

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  curl -fsSI --max-time 20 "${PUBLIC_HEALTH_URL}"
fi

echo "Deploy complete for ${SITE_NAME} at $(git rev-parse --short HEAD). Backup: ${BACKUP_DIR}"
```

- [ ] **Step 2: Validate shell syntax**

Run:

```powershell
bash -n ops/deploy/deploy-photo-studio-marketplace.sh
```

Expected: command exits `0`. If Bash is unavailable on Windows, run this command on the VM before executing the script.

- [ ] **Step 3: Commit Task 3**

Run:

```powershell
git add ops/deploy/deploy-photo-studio-marketplace.sh
git commit -m "Add Hetzner deploy script"
```

Expected: commit succeeds.

## Task 4: Document The Deploy Workflow In README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a Hetzner deployment section**

Append this section to `README.md`:

```markdown
## Hetzner Multi-Site Deployment

Deployment design is documented in `docs/superpowers/specs/2026-05-22-hetzner-multi-site-photo-studio-deploy-design.md`.

Repository-owned deployment artifacts live in `ops/`:

- `ops/staging/docker-compose.yml` runs this project's Postgres on `127.0.0.1:15433`.
- `ops/deploy/photo-studio-marketplace-api.service` runs the Fastify API on `127.0.0.1:4003`.
- `ops/deploy/Caddyfile.photo-studio-marketplace.example` shows the static web and `/api/*` proxy route.
- `ops/deploy/PORTS.example.md` is the starting point for `/opt/apps/PORTS.md` on the VM.
- `ops/deploy/env.production.example` shows the server-local `.env` shape.
- `ops/deploy/deploy-photo-studio-marketplace.sh` performs a repeatable server-side deploy.

Production secrets stay in `/opt/apps/photo-studio-marketplace/.env` on the VM and must not be committed. Use classic `docker-compose` on the VM unless the Docker Compose plugin is installed and verified.
```

- [ ] **Step 2: Verify the section is present**

Run:

```powershell
rg -n "Hetzner Multi-Site Deployment|photo-studio-marketplace-api.service|docker-compose" README.md
```

Expected: output includes the new section heading and ops file references.

- [ ] **Step 3: Commit Task 4**

Run:

```powershell
git add README.md
git commit -m "Document Hetzner deployment workflow"
```

Expected: commit succeeds.

## Task 5: Run Local Verification

**Files:**
- No file changes expected.

- [ ] **Step 1: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: all workspaces pass TypeScript typecheck.

- [ ] **Step 2: Run API soft launch smoke test**

Run:

```powershell
npm run test:soft-launch -w apps/api
```

Expected: smoke test passes.

- [ ] **Step 3: Run build**

Run:

```powershell
npm run build
```

Expected: shared, API, and web builds pass.

- [ ] **Step 4: Inspect final diff**

Run:

```powershell
git status --short
git log --oneline -5
```

Expected: working tree is clean after the task commits, and the latest commits are the deployment artifact commits.

## Task 6: Prepare The VM Without Switching Public Traffic

**Files:**
- Server-only changes under `/opt/apps`, `/etc/systemd/system`, and optional `/etc/caddy`.

- [ ] **Step 1: SSH into the VM**

Run from Windows PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\hetzner_204_168_163_99 root@204.168.163.99
```

Expected: shell prompt opens on `ubuntu-4gb-hel1-3`.

- [ ] **Step 2: Refresh server state read-only**

Run on the VM:

```bash
hostname
date -Is
systemctl is-active crm-staging-web.service crm-staging-telegram.service
ss -ltnp
docker ps --format '{{.Names}} {{.Image}} {{.Ports}}'
```

Expected: CRM services are active, CRM web is still on `3002`, and CRM Postgres is still on `127.0.0.1:15432`.

- [ ] **Step 3: Create or update `/opt/apps/PORTS.md`**

Run on the VM after the repo is cloned in Task 7:

```bash
install -m 0644 /opt/apps/photo-studio-marketplace/ops/deploy/PORTS.example.md /opt/apps/PORTS.md
cat /opt/apps/PORTS.md
```

Expected: `photo-studio-marketplace` appears with API `4003` and DB `15433`.

## Task 7: First Server Deploy

**Files:**
- Server-only deployment changes.

- [ ] **Step 1: Clone or update the app checkout**

Run on the VM:

```bash
mkdir -p /opt/apps
if [ ! -d /opt/apps/photo-studio-marketplace/.git ]; then
  git clone https://github.com/olegp306/booking_photo_studio.git /opt/apps/photo-studio-marketplace
fi
cd /opt/apps/photo-studio-marketplace
git fetch origin main:refs/remotes/origin/main --tags
git checkout -B main origin/main
```

Expected: `/opt/apps/photo-studio-marketplace` is on `main`.

- [ ] **Step 2: Create the server-local env file**

Run on the VM:

```bash
cd /opt/apps/photo-studio-marketplace
install -m 0600 ops/deploy/env.production.example .env
```

Expected: `.env` exists with mode `0600`. Edit it on the server with real production values before continuing.

- [ ] **Step 3: Run the deploy script**

Run on the VM:

```bash
cd /opt/apps/photo-studio-marketplace
bash -n ops/deploy/deploy-photo-studio-marketplace.sh
REPO_URL=https://github.com/olegp306/booking_photo_studio.git BRANCH=main bash ops/deploy/deploy-photo-studio-marketplace.sh
```

Expected: Postgres starts on `127.0.0.1:15433`, API service becomes active, and localhost healthchecks pass.

- [ ] **Step 4: Confirm CRM was not changed**

Run on the VM:

```bash
systemctl is-active crm-staging-web.service crm-staging-telegram.service
curl -fsSI --max-time 20 http://204.168.163.99:3002
```

Expected: both CRM services are active and CRM direct URL still returns success.

## Task 8: Add Reverse Proxy And Firewall In A Controlled Window

**Files:**
- Server-only changes under `/etc/caddy` or nginx equivalent.

- [ ] **Step 1: Install Caddy if no reverse proxy exists**

Run on the VM:

```bash
if ! command -v caddy >/dev/null; then
  apt-get update
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi
```

Expected: `caddy version` prints a version.

- [ ] **Step 2: Install the Photo Studio Caddy route on port 80**

Run on the VM:

```bash
install -m 0644 /opt/apps/photo-studio-marketplace/ops/deploy/Caddyfile.photo-studio-marketplace.example /etc/caddy/Caddyfile
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

Expected: Caddy validation passes and the public URL serves the Vite app.

- [ ] **Step 3: Enable firewall after confirming SSH**

Run on the VM:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw status verbose
```

Expected: rules show SSH, 80, and 443 allowed. Enable UFW only after deciding whether port `3389` should remain accessible.

- [ ] **Step 4: Final public healthcheck**

Run on the VM:

```bash
curl -fsSI --max-time 20 "$PUBLIC_APP_URL"
curl -fsS --max-time 20 http://127.0.0.1:4003/api/readiness
```

Expected: public URL returns success and readiness returns JSON.
