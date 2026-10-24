# Codespaces real-data deployment (operator)

Independent Codespace copy of local PostgreSQL `haidara` — **never** mutate the Windows source DB.

## Git branch

Use `deployment/codespaces-haidara-5f3fa29` (PDF integration + Codespaces compose overlays).

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

Preserve restored bindings only — **do not** run provisioning/rebind scripts. Expect **27** active real bindings (7 LIVE + 20 Seven Stars).
