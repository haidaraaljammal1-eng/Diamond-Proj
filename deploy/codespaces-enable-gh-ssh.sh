#!/usr/bin/env bash
# One-time on universal Codespaces (devcontainer_path null): start OpenSSH for gh/cursor remote.
set -euo pipefail
if pgrep -x sshd >/dev/null 2>&1 || pgrep -x ssh >/dev/null 2>&1; then
  echo "sshd already running"
  exit 0
fi
sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server
sudo mkdir -p /var/run/sshd
sudo service ssh start 2>/dev/null || sudo /usr/sbin/sshd
echo "sshd started (verify: gh codespace ssh -c <name> -- echo ok)"
