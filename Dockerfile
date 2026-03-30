# syntax=docker/dockerfile:1

# ── Builder stage ─────────────────────────────────────────────────────────────
FROM node:22.14-alpine AS builder

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src/ ./src/

RUN npm run build

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22.14-alpine AS runner

RUN addgroup -S appgroup && adduser -S appuser -G appgroup && apk add --no-cache bash

WORKDIR /app

# Production dependencies only.
# Drop the `prepare` script before installing — it runs `husky` which is a
# dev dependency and is not present in the production install, causing a
# "command not found" failure (exit code 127).
COPY package*.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev && npm cache clean --force

# Compiled output
COPY --from=builder /build/dist ./dist

# Runtime directories — these are expected to be mounted as Docker volumes.
# Creating them here ensures they exist if the volumes are not mounted.
RUN mkdir -p config data sessions && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/',()=>process.exit(0)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
