#!/usr/bin/env bash
# Build and start the Discord bot from the monorepo root.
set -euo pipefail

echo "Building @workspace/api-server..."
pnpm --filter @workspace/api-server run build

echo "Starting bot..."
exec node --enable-source-maps ./artifacts/api-server/dist/index.mjs
