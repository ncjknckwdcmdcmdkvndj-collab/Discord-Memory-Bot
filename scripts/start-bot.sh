#!/usr/bin/env bash
set -e
# Build if tsconfig exists
if [ -f tsconfig.json ]; then
  npm run build --if-present
fi
# Start bot (assumes "start" script is configured)
npm run start
