#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi
echo "Starting NovaNex MSME Working-Capital Engine..."
echo "Open http://127.0.0.1:8080 in your browser."
exec node server/productionServer.js
