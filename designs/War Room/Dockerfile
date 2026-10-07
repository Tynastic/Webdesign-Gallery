# War Room: one container serves the client, the room API and the live-sync websocket.
# Build:  docker build --build-arg APP_COMMIT=$(git rev-parse --short HEAD) -t war-room .
# Run:    see docker-compose.yml (with Caddy for HTTPS) and DEPLOY.md

# ---------- build the client ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG APP_COMMIT=""
ENV APP_COMMIT=$APP_COMMIT
RUN npm run build

# ---------- runtime ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=1234 \
    DATA_DIR=/data \
    TRUST_PROXY=1
WORKDIR /app
COPY package.json package-lock.json ./
# Only the server's dependencies; the client is already bundled into dist/.
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY scripts/backup.ts ./scripts/backup.ts
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 1234
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -qO- http://127.0.0.1:1234/healthz || exit 1
# Node >= 22.18 runs the server's TypeScript directly (type stripping), no compile step.
CMD ["node", "--no-warnings=ExperimentalWarning", "server/index.ts"]
