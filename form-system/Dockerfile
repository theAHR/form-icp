FROM node:24-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM build AS tools
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN groupadd -g 1001 app && useradd -u 1001 -g app app \
  && mkdir -p /app/storage && chown -R app:app /app/storage
USER app
CMD ["npm", "run", "worker"]

FROM build AS app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  HOSTNAME=0.0.0.0 \
  PORT=3000 \
  STORAGE_PATH=/app/storage
RUN groupadd -g 1001 app && useradd -u 1001 -g app app \
  && mkdir -p /app/storage \
  && chown -R app:app /app/storage /app/.next /app/prisma
COPY --chown=app:app scripts/docker-start.mjs /app/docker-start.mjs
USER app
EXPOSE 3000
CMD ["node", "docker-start.mjs"]
