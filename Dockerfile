# Multi-stage build for the Discord bot (pnpm monorepo)
FROM node:20-slim AS builder

# Enable corepack so pnpm is available without a separate install step
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy manifests first so Docker caches the install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY lib/db/package.json                      lib/db/
COPY lib/api-zod/package.json                 lib/api-zod/
COPY artifacts/api-server/package.json        artifacts/api-server/
COPY scripts/package.json                     scripts/

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm --filter @workspace/api-server run build

# ── Runtime image ─────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/node_modules             ./node_modules

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
