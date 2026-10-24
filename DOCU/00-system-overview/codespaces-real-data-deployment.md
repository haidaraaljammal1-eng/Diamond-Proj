# Codespaces real-data deployment (operator)

Independent Codespace copy of local PostgreSQL `haidara` — **never** mutate the Windows source DB.

## Git branch

Use `deployment/codespaces-haidara-5f3fa29` (PDF integration + Codespaces compose overlays).

## Codespace must use the dev container

Create (or recreate) with an explicit config so `gh codespace ssh`, `postStartCommand`, and the **sshd** feature work:

```bash
gh codespace create -R haidaraaljammal1-eng/Diamond-Proj \
  -b deployment/codespaces-haidara-5f3fa29 \
  --devcontainer-path .devcontainer/devcontainer.json
```

If `gh codespace view` shows **Devcontainer Path** empty (`devcontainer_path: null`), CLI rebuild does **not** apply `.devcontainer/devcontainer.json`. In the Codespace in VS Code (web or desktop): **Codespaces: Rebuild Container** (or **Reopen in Container**).

After rebuild, resume the host-native stack (when secrets and builds already exist):

```bash
bash /workspaces/Diamond-Proj/deploy/codespaces-autostart.sh
```

## Public HTTPS (port 3100 only)

Register visibility only after the port appears in `gh codespace ports` (requires an active forwarder, usually after the dev container is running):

```bash
gh codespace ports visibility 3100:public -c <codespace-name>
gh codespace ports visibility 3000:private -c <codespace-name>
gh codespace ports --json browseUrl,sourcePort,visibility -c <codespace-name>
```

Do not treat `*.app.github.dev` as working while login returns **502** (nothing listening on 3100).

## Empty Postgres volume recovery

When `pgdata` is empty but Windows `haidara` is intact:

1. On Windows (read-only): `pg_dump -Fc` to `deploy/backups/diamond-haidara-codespaces.dump`.
2. Transfer privately to the Codespace (e.g. `gh codespace cp` after sshd works, or HTTPS to `/tmp/diamond-haidara.dump`).
3. In the Codespace browser terminal:

```bash
cd /workspaces/Diamond-Proj && git pull && chmod +x deploy/*.sh
bash deploy/codespaces-enable-gh-ssh.sh   # once, if gh ssh fails
bash deploy/codespaces-recovery.sh
```

`codespaces-recovery.sh` starts Postgres, restores only when `users` count is near zero, rebuilds backend if the fleet presentation flag is missing, then runs `codespaces-autostart.sh`. Set `CODESPACES_GPS_FLEET_PRESENTATION=true` in `staging.env` (autostart defaults it to true on Codespaces).

## Database (read-only export on Windows)

```powershell
# Example — adjust pg_dump path to your PostgreSQL 16 install
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h localhost -U postgres -Fc -f $env:TEMP\diamond-haidara.dump haidara
```

Restore inside Codespace (empty `haidara` DB, PostgreSQL 16):

```bash
pg_restore -h 127.0.0.1 -U diamond -d haidara --no-owner --role=diamond /path/to/diamond-haidara.dump
```

Transfer dump privately: `gh codespace cp $env:TEMP\diamond-haidara.dump remote:/tmp/`

## Secrets (never commit)

Copy `APP/backend/.env` fields into `deploy/staging.env` on the Codespace via `gh codespace cp` or SSH:

- `COOKIE_SECRET` (required for GPS credential decryption)
- `TWO_FACTOR_ENCRYPTION_KEY`
- `AUTH_SECRET`, JWT secrets, provider keys

## Attachments

Sync `FILE_STORAGE_DIR` / `uploads` volume content from local backend uploads to Codespace Docker volume (same relative keys as DB).

## Runtime

```bash
cd deploy
docker compose -f docker-compose.staging.yml -f docker-compose.codespaces.yml -f docker-compose.codespaces-full.yml up -d
```

Expose port **3100** as Public in Codespaces; keep **5432**, **3000**, **8010**, **8020** private.

## GPS

Preserve restored bindings only — **do not** run provisioning/rebind scripts. Expect **27** active real bindings (7 LIVE + 20 Seven Stars). The **GPS** UI should list those 27; the **Vehicles** page may show more active rows if historical contracts reference non-GPS vehicles (safe idle non-GPS rows can be soft-deactivated on the Codespace copy only).

## OCR (8010 / 8020)

Install Linux Python envs and models from `DOCUMENT-ENGINE` manifests on the Codespace; keep both ports **private**. Not required for the public staff URL.
