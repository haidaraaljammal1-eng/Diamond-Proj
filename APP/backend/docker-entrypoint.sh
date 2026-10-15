#!/bin/sh
set -eu
mkdir -p /app/uploads
chown node:node /app/uploads
exec gosu node "$@"
