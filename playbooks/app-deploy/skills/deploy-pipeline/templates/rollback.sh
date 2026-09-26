#!/usr/bin/env bash
# Run {{SLUG}} on an already-published, signed image tag: forward on every
# release (release.yml's deploy job calls it over SSH) or back by hand.
#
# The first run brings the whole stack up; later runs restart only the app
# service. It never runs migrations, never removes a volume, and never runs a
# command that could drop data.
#
# Usage: deploy/rollback.sh <version>
# Example: deploy/rollback.sh 1.4.2

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.prod.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
PROJECT='{{SLUG}}'
TIMEOUT_SECONDS="${ROLLBACK_TIMEOUT_SECONDS:-120}"
POLL_INTERVAL_SECONDS="${ROLLBACK_POLL_INTERVAL_SECONDS:-3}"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

target_version="$1"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy deploy/.env.example to deploy/.env first." >&2
  exit 1
fi

if ! grep -q '^RELEASE_VERSION=' "${ENV_FILE}"; then
  echo "RELEASE_VERSION not found in ${ENV_FILE}." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ENV_FILE}"
set +a

# Sourcing .env exported the old RELEASE_VERSION, and Compose prefers an
# exported variable over --env-file: export the target explicitly.
export RELEASE_VERSION="${target_version}"

compose() {
  docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"
}

# Container, network and volume names all derive from the project name. If it
# does not resolve to the slug, this run would start a second, empty stack.
resolved_project="$(compose config | sed -n 's/^name: //p' | head -n 1)"
if [[ "${resolved_project}" != "${PROJECT}" ]]; then
  echo "Compose resolves the project name to '${resolved_project}', expected '${PROJECT}'. Keep 'name: ${PROJECT}' in ${COMPOSE_FILE}." >&2
  exit 1
fi

echo "Moving ${PROJECT} to version ${target_version}..."

tmp_env="$(mktemp)"
sed "s/^RELEASE_VERSION=.*/RELEASE_VERSION=${target_version}/" "${ENV_FILE}" >"${tmp_env}"
cat "${tmp_env}" >"${ENV_FILE}"
rm -f "${tmp_env}"

if [[ -z "$(compose ps -q app)" ]]; then
  echo "No app container runs yet: bringing the whole stack up."
  compose pull
  compose up -d
else
  compose pull app
  compose up -d --no-deps app
fi

network="${PROJECT}_default"
if [[ -n "${PROXY_CONTAINER:-}" ]]; then
  if ! docker inspect --format '{{json .NetworkSettings.Networks}}' "${PROXY_CONTAINER}" | grep -q "\"${network}\""; then
    echo "Joining ${PROXY_CONTAINER} to ${network}..."
    docker network connect "${network}" "${PROXY_CONTAINER}"
  fi
else
  echo "PROXY_CONTAINER is blank in ${ENV_FILE}: the reverse proxy is not joined to ${network}." >&2
fi

HEALTH_URL="${ROLLBACK_HEALTH_URL:-http://127.0.0.1:${APP_PORT:-3000}{{HEALTH_PATH}}}"
echo "Waiting for ${HEALTH_URL} (timeout ${TIMEOUT_SECONDS}s)..."

# The probe sends X-Forwarded-Proto: https because it never goes through the
# proxy's TLS termination; an app that enforces HTTPS would otherwise refuse it.
elapsed=0
until curl --silent --fail --max-time 5 -H 'X-Forwarded-Proto: https' "${HEALTH_URL}" >/dev/null 2>&1; do
  if ((elapsed >= TIMEOUT_SECONDS)); then
    echo "Timed out waiting for ${PROJECT} ${target_version} to become healthy." >&2
    exit 1
  fi
  sleep "${POLL_INTERVAL_SECONDS}"
  elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
done

echo "${PROJECT} is healthy on version ${target_version}."
