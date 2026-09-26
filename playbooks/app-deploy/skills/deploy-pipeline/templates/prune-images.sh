#!/usr/bin/env bash
# Remove old {{SLUG}} release images from the host, so each deploy does not
# leave another image behind until the disk fills up.
#
# Keeps the PRUNE_KEEP_VERSIONS most recent version tags (default 3, enough to
# roll back), never removes an image a container uses, and never touches any
# other repository or any non-version tag.
#
# Usage: deploy/prune-images.sh

set -euo pipefail

IMAGE='{{IMAGE}}'
KEEP="${PRUNE_KEEP_VERSIONS:-3}"

in_use="$(docker ps -aq | xargs -r docker inspect --format '{{.Image}}' | sort -u)"

stale_tags="$(docker image ls "${IMAGE}" --format '{{.Tag}}' \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' \
  | sort -rV \
  | tail -n +"$((KEEP + 1))" || true)"

for tag in ${stale_tags}; do
  ref="${IMAGE}:${tag}"
  image_id="$(docker image inspect --format '{{.Id}}' "${ref}")"
  if grep -qxF "${image_id}" <<<"${in_use}"; then
    echo "Keeping ${ref}: a container uses it."
    continue
  fi
  echo "Removing ${ref}..."
  docker image rm "${ref}"
done
