# glibc image. Alpine is not used: Prisma, argon2, and sharp need glibc.
FROM node:22.21.0-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund --maxsockets=3 --fetch-retries=5 --fetch-timeout=600000
COPY . .
# Generate does not connect. The URL is a build-stage placeholder, not a secret.
ENV DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres
RUN npx prisma generate && npm run build

FROM node:22.21.0-bookworm-slim AS migrator
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app /app
ENV NODE_ENV=production
ENV DIAMOND_FRESH_DATABASE_CONFIRM=diamond_staging
CMD ["node", "scripts/fresh-database-baseline.mjs"]

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu openssl ca-certificates libssl3 \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/uploads \
  && chown node:node /app/uploads
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/scripts/fresh-staging-smoke.mjs ./scripts/fresh-staging-smoke.mjs
COPY --from=build /app/scripts/fresh-database-baseline-lib.cjs ./scripts/fresh-database-baseline-lib.cjs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod 755 /usr/local/bin/docker-entrypoint.sh \
  && chown -R node:node /app
ENV NODE_ENV=production
ENV TZ=Asia/Dubai
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health/ready').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
