#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] || { echo 'Run ./setup.sh first.' >&2; exit 1; }
[[ -d node_modules/next ]] || { echo 'Run npm ci first.' >&2; exit 1; }
docker compose up -d --wait
npm run dev
