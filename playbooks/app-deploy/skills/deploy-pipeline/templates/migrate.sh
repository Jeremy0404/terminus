#!/usr/bin/env bash
# Apply pending database migrations with a release's own signed image, before
# the app restarts on it. Only for an app that does not migrate itself at
# start-up: without this step nothing in the pipeline would ever migrate, and
# the app would run against a stale schema while its health check stays green.
#
# A failure stops the deploy job before deploy/rollback.sh, so the app stays on
# its current, already-migrated version.
#
# Usage: deploy/migrate.sh <version>

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy deploy/.env.example to deploy/.env first." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

export RELEASE_VERSION="$1"

compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

# >>> postgres
compose up -d --wait postgres
# <<< postgres
echo "Applying pending migrations for version ${RELEASE_VERSION}..."
compose run --rm --no-deps app {{MIGRATE_COMMAND}}
