# Production deployment

{{SLUG}} runs in production at `https://{{DOMAIN}}` as a Docker Compose stack on a Docker host,
behind the host's reverse-proxy container, which terminates TLS. Images are built, signed and
deployed by GitHub Actions:

1. `release-please.yml` keeps a release pull request open on `main`. Merging it tags `vX.Y.Z`.
2. The tag starts `release.yml`: `build` pushes `{{IMAGE}}:X.Y.Z`, `sign` signs it with cosign,
   `deploy` verifies the signature and runs `deploy/rollback.sh X.Y.Z` on the host over SSH,
   then prunes old images, and `verify-deploy` checks that the running container is that exact
   digest.
3. `rollback.yml` (run by hand from the Actions tab) verifies and runs an older version the same
   way.

## Files

- `docker-compose.prod.yml`: the stack. `name: {{SLUG}}` pins the project name, every service
  has a `mem_limit`, and the app listens on the host loopback only.
- `.env.example`: every setting the stack reads. Copy it to `deploy/.env` on the host; never
  commit `deploy/.env`.
- `rollback.sh <version>`: runs a published version. The first run brings the whole stack up and
  joins the reverse-proxy container to `{{SLUG}}_default`; later runs restart only `app`. It
  never touches a volume.
- `prune-images.sh`: removes this app's release images beyond the three most recent, never one a
  container uses.
<!-- >>> migrate -->
- `migrate.sh <version>`: applies pending migrations with the release image, before
  `rollback.sh`, in the `deploy` job.
<!-- <<< migrate -->
<!-- >>> postgres -->
- `backup.sh`: dumps PostgreSQL, encrypts the dump with `age`, keeps the `BACKUP_KEEP` most
  recent and copies each one to `BACKUP_OFFHOST_DESTINATION` when set.
- `backup-freshness-check.sh`: alerts Discord when the newest backup is older than
  `BACKUP_MAX_AGE_HOURS`.
<!-- <<< postgres -->
<!-- >>> data-volume -->
- `backup.sh`: copies `{{DATA_DIR}}/{{DATA_FILE}}` with SQLite's online backup, encrypts it with
  `age`, keeps the `BACKUP_KEEP` most recent and copies each one to `BACKUP_OFFHOST_DESTINATION`
  when set.
- `backup-freshness-check.sh`: alerts Discord when the newest backup is older than
  `BACKUP_MAX_AGE_HOURS`.
<!-- <<< data-volume -->

## One-time server setup

Done once by hand, before the first release is deployed.

1. **DNS**: an `A` record for `{{DOMAIN}}` pointing to the Docker host's public IP.
2. **Reverse proxy**: a proxy host for `{{DOMAIN}}` on the host's reverse-proxy container,
   forwarding over `http` to `{{SLUG}}-app-1:{{INTERNAL_PORT}}`, with a Let's Encrypt certificate
   and HTTPS forced. It answers 502 until the first release runs; that is expected.
3. **Files**: on the host, `mkdir -p ~/{{SLUG}}/deploy` and copy this folder's files into it,
   keeping the scripts executable.
4. **Settings**: `cp deploy/.env.example deploy/.env`, `chmod 600 deploy/.env`, then fill in:
   - `APP_PORT`: a free loopback port on the host;
   - `PROXY_CONTAINER`: the name of the host's reverse-proxy container;
   - leave `RELEASE_VERSION` blank: the first deploy fills it in.
<!-- >>> postgres -->
   - `POSTGRES_PASSWORD`: a fresh password for this app only;
   - `BACKUP_AGE_RECIPIENT`: an `age` public key (`age-keygen`), whose private key stays off the
     host;
   - `BACKUP_OFFHOST_DESTINATION` and `BACKUP_ALERT_DISCORD_WEBHOOK`: optional; blank keeps
     backups on the host and warns on every run.
<!-- <<< postgres -->
<!-- >>> data-volume -->
   - `BACKUP_AGE_RECIPIENT`: an `age` public key (`age-keygen`), whose private key stays off the
     host;
   - `BACKUP_OFFHOST_DESTINATION` and `BACKUP_ALERT_DISCORD_WEBHOOK`: optional; blank keeps
     backups on the host and warns on every run.
<!-- <<< data-volume -->
5. **Registry**: `docker login ghcr.io` on the host with a token that can read this package, if
   the host is not logged in already.
6. **Deploy key**: a dedicated `{{SLUG}}-ci-deploy` ed25519 keypair. Append its public half to
   `~/.ssh/authorized_keys` of the deploy user on the host.
7. **Repository secrets** (`gh secret set <NAME> --repo <owner>/{{SLUG}}`):
   - `RELEASE_PLEASE_TOKEN`: a token that can push tags and open pull requests on this
     repository (a tag pushed with the default `GITHUB_TOKEN` would not start `release.yml`);
   - `SSH_HOST`, `SSH_PORT`, `SSH_USER`: how Actions reaches the host;
   - `SSH_KEY`: the private half of the deploy key.
<!-- >>> postgres -->
8. **Backups**: add both scripts to the deploy user's crontab, for example:

   ```cron
   15 3 * * * ~/{{SLUG}}/deploy/backup.sh >> ~/{{SLUG}}/backup.log 2>&1
   0 * * * * ~/{{SLUG}}/deploy/backup-freshness-check.sh >> ~/{{SLUG}}/backup.log 2>&1
   ```
<!-- <<< postgres -->
<!-- >>> data-volume -->
8. **Backups**: add both scripts to the deploy user's crontab, for example:

   ```cron
   15 3 * * * ~/{{SLUG}}/deploy/backup.sh >> ~/{{SLUG}}/backup.log 2>&1
   0 * * * * ~/{{SLUG}}/deploy/backup-freshness-check.sh >> ~/{{SLUG}}/backup.log 2>&1
   ```
<!-- <<< data-volume -->

The first release then deploys like every other one: `rollback.sh` finds no running app, brings
the whole stack up and joins the reverse proxy to `{{SLUG}}_default`.

## Rolling back

Run the `Rollback` workflow with the version to go back to, or on the host:

```sh
cd ~/{{SLUG}} && ./deploy/rollback.sh 1.4.2
```

It rewrites `RELEASE_VERSION` in `deploy/.env`, restarts only `app`, then polls
`http://127.0.0.1:${APP_PORT}{{HEALTH_PATH}}` with `X-Forwarded-Proto: https` until it answers or
`ROLLBACK_TIMEOUT_SECONDS` (120 by default) runs out. It never migrates, so roll back only to a
version the current schema supports.
<!-- >>> postgres -->

## Restoring a backup

```sh
age --decrypt -i /path/to/private-key.txt deploy/backups/{{SLUG}}-<timestamp>.backup.age > restore.sql
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < restore.sql
```
<!-- <<< postgres -->
<!-- >>> data-volume -->

## Restoring a backup

Stop the app, decrypt the backup and put it back in place of `{{DATA_DIR}}/{{DATA_FILE}}`:

```sh
age --decrypt -i /path/to/private-key.txt deploy/backups/{{SLUG}}-<timestamp>.backup.age > restore.db
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env stop app
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env cp restore.db app:{{DATA_DIR}}/{{DATA_FILE}}
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env start app
```
<!-- <<< data-volume -->
