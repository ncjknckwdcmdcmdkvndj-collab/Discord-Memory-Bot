#!/usr/bin/env bash
set -euo pipefail

# Build if tsconfig exists
if [ -f tsconfig.json ]; then
  echo "Building TypeScript..."
  npm run build --if-present
fi

# Start bot (assumes "start" script is configured in package.json)
exec npm run start
