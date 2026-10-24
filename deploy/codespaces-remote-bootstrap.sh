#!/usr/bin/env bash
# Full remote bootstrap: dump from approved tunnel, sshd, recovery. Run inside Codespace terminal.
set -euo pipefail
DUMP_URL="${CODESPACES_DUMP_URL:-https://locally-crew-batteries-referrals.trycloudflare.com/diamond-haidara-codespaces.dump}"
DUMP_LOCAL=/tmp/diamond-haidara-codespaces.dump
ROOT=/workspaces/Diamond-Proj
cd "$ROOT"
git fetch origin deployment/codespaces-haidara-5f3fa29
git checkout deployment/codespaces-haidara-5f3fa29
git pull --ff-only
chmod +x deploy/*.sh
if [[ ! -f "$DUMP_LOCAL" ]]; then
  curl -fsSL "$DUMP_URL" -o "$DUMP_LOCAL"
fi
bash deploy/codespaces-enable-gh-ssh.sh || true
bash deploy/codespaces-recovery.sh
