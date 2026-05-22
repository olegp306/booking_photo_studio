#!/usr/bin/env bash
set -Eeuo pipefail

SITE_NAME="photo-studio-marketplace"
APP_DIR="/opt/apps/${SITE_NAME}"
BACKUP_ROOT="/root/deploy-backups"
REPO_URL="${REPO_URL:-https://github.com/olegp306/booking_photo_studio.git}"
BRANCH="${BRANCH:-main}"
API_SERVICE="${SITE_NAME}-api.service"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-photo_studio_marketplace}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-http://204.168.163.99/${SITE_NAME}/}"

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
VITE_BASE_PATH="/${SITE_NAME}/" npm run build

install -m 0644 ops/deploy/photo-studio-marketplace-api.service "/etc/systemd/system/${API_SERVICE}"
systemctl daemon-reload
systemctl enable "${API_SERVICE}"
systemctl restart "${API_SERVICE}"

systemctl is-active "${API_SERVICE}"

for attempt in {1..20}; do
  if curl -fsS --max-time 5 http://127.0.0.1:4003/health >/dev/null; then
    break
  fi
  if [[ "${attempt}" -eq 20 ]]; then
    curl -fsS --max-time 5 http://127.0.0.1:4003/health
  fi
  sleep 1
done

curl -fsS --max-time 20 http://127.0.0.1:4003/api/readiness

if [[ -n "${PUBLIC_HEALTH_URL}" ]]; then
  curl -fsSI --max-time 20 "${PUBLIC_HEALTH_URL}"
fi

echo "Deploy complete for ${SITE_NAME} at $(git rev-parse --short HEAD). Backup: ${BACKUP_DIR}"
