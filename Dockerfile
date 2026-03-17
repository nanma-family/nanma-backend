# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Prisma + PostgreSQL need OpenSSL, netcat for DB readiness check
RUN apt-get update && \
    apt-get install -y openssl ca-certificates netcat-openbsd && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY prisma ./prisma

EXPOSE 3000

# Wait for DB to be reachable, run migrations, then start app
CMD ["sh", "-c", "\
  echo 'Waiting for database to be ready...' && \
  for i in $(seq 1 30); do \
    npx prisma migrate deploy && echo 'Migrations done!' && break || \
    (echo \"Attempt $i/30 failed, retrying in 5s...\"; sleep 5); \
  done && \
  node dist/index.js"]