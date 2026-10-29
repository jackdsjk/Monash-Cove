#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f local-service/dist/index.js ]; then
  (cd local-service && npm run build)
fi
if [ ! -f webapp/dist/index.html ]; then
  (cd webapp && npm run build)
fi

cd local-service
exec node dist/index.js
