#!/usr/bin/env bash
# Alert to Discord when {{SLUG}}'s newest encrypted backup is missing or older
# than BACKUP_MAX_AGE_HOURS. Runs from its own cron entry, so a stuck or
# failing deploy/backup.sh is still caught.
#
# Usage: deploy/backup-freshness-check.sh   (from cron, see deploy/README.md)

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
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

max_age_hours="${BACKUP_MAX_AGE_HOURS:-26}"

alert() {
  local message="$1"
  echo "${message}" >&2
  if [[ -z "${BACKUP_ALERT_DISCORD_WEBHOOK:-}" ]]; then
    echo "BACKUP_ALERT_DISCORD_WEBHOOK is blank: no alert was sent." >&2
    return
  fi
  curl --silent --fail --max-time 10 \
    -H 'Content-Type: application/json' \
    -d "{\"content\": \"${message}\"}" \
    "${BACKUP_ALERT_DISCORD_WEBHOOK}" >/dev/null
}

latest_backup="$(find "${BACKUP_DIR}" -maxdepth 1 -name '{{SLUG}}-*.backup.age' -type f -printf '%T@ %p\n' 2>/dev/null \
  | sort -rn | head -n 1 | cut -d' ' -f2-)"

if [[ -z "${latest_backup}" ]]; then
  alert "{{SLUG}} backup alert: no encrypted backup in ${BACKUP_DIR}."
  exit 1
fi

age_hours=$((($(date +%s) - $(date -r "${latest_backup}" +%s)) / 3600))

if ((age_hours > max_age_hours)); then
  alert "{{SLUG}} backup alert: the newest backup ($(basename "${latest_backup}")) is ${age_hours}h old, over the ${max_age_hours}h threshold."
  exit 1
fi

echo "Newest backup ($(basename "${latest_backup}")) is ${age_hours}h old, within ${max_age_hours}h."
