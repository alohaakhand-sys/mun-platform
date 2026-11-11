# Production image for the self-hosted deploy (Coolify on the akhandapps VPS, munpilot.com).
# Vercel ignores this file and keeps building the app its own way.
#
# `npm install`, not `npm ci`: the lockfile is generated on Windows and lacks the
# Linux-only optional @emnapi/* entries, which makes `npm ci` refuse it on Linux.

FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

FROM node:24-bookworm-slim AS builder
WORKDIR /app
# NEXT_PUBLIC_* are inlined into the client bundle at build time, so they must exist
# here, not only at runtime. Coolify passes every build variable as a --build-arg.
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_FIREBASE_DATABASE_URL
ARG NEXT_PUBLIC_AGORA_APP_ID
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_FIREBASE_DATABASE_URL=$NEXT_PUBLIC_FIREBASE_DATABASE_URL \
    NEXT_PUBLIC_AGORA_APP_ID=$NEXT_PUBLIC_AGORA_APP_ID \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Full app dir rather than `output: "standalone"`: the flags API reads src/flags from
# disk at runtime, and this keeps every such file without per-route tracing config.
COPY --from=builder --chown=node:node /app ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start"]
