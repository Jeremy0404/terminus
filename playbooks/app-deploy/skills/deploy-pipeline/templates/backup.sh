#!/usr/bin/env bash
# Back up {{SLUG}}'s data while the stack runs, encrypt it with age, keep the
# BACKUP_KEEP most recent encrypted backups on the host and copy each one
# off-host when BACKUP_OFFHOST_DESTINATION is set.
#
# Reads everything from deploy/.env; nothing is hardcoded.
#
# Usage: deploy/backup.sh   (from cron, see deploy/README.md)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/backups}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy deploy/.env.example to deploy/.env first." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT must be set in deploy/.env}"
keep="${BACKUP_KEEP:-14}"

compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

mkdir -p "${BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain_file="${BACKUP_DIR}/{{SLUG}}-${timestamp}.backup"
encrypted_file="${plain_file}.age"
trap 'rm -f "${plain_file}"' EXIT

# >>> postgres
: "${POSTGRES_DB:?POSTGRES_DB must be set in deploy/.env}"
: "${POSTGRES_USER:?POSTGRES_USER must be set in deploy/.env}"
echo "Dumping database ${POSTGRES_DB}..."
compose exec -T postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >"${plain_file}"
# <<< postgres
# >>> data-volume
# SQLite's online backup copies a consistent snapshot while the app keeps
# writing; copying the file itself could catch a half-written page.
echo "Copying {{DATA_DIR}}/{{DATA_FILE}} with SQLite's online backup..."
app_container="$(compose ps -q app)"
if [[ -z "${app_container}" ]]; then
  echo "The app container is not running; nothing to back up." >&2
  exit 1
fi
docker run --rm --volumes-from "${app_container}" -v "${BACKUP_DIR}:/backup" alpine:3.22 \
  sh -c "apk add --no-cache sqlite >/dev/null && sqlite3 '{{DATA_DIR}}/{{DATA_FILE}}' \".backup '/backup/$(basename "${plain_file}")'\""
# <<< data-volume

echo "Encrypting with age..."
age -r "${BACKUP_AGE_RECIPIENT}" -o "${encrypted_file}" "${plain_file}"
rm -f "${plain_file}"

if [[ -n "${BACKUP_OFFHOST_DESTINATION:-}" ]]; then
  echo "Copying ${encrypted_file} to ${BACKUP_OFFHOST_DESTINATION}..."
  cp "${encrypted_file}" "${BACKUP_OFFHOST_DESTINATION}/"
else
  echo "BACKUP_OFFHOST_DESTINATION is blank: this backup stays on the host only." >&2
fi

find "${BACKUP_DIR}" -maxdepth 1 -name '{{SLUG}}-*.backup.age' -type f -printf '%T@ %p\n' \
  | sort -rn | tail -n +"$((keep + 1))" | cut -d' ' -f2- | xargs -r rm -f

echo "Backup complete: ${encrypted_file}"
