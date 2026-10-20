# glibc image. sharp's Linux binary is glibc, not musl.
FROM node:22.21.0-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --maxsockets=3 --fetch-retries=5 --fetch-timeout=600000

FROM node:22.21.0-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV DOCKER_BUILD=1
# No localhost default. Compose or the operator must pass the browser-visible API origin.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_API_PROXY=false
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_PROXY=$NEXT_PUBLIC_API_PROXY
RUN test -n "$NEXT_PUBLIC_API_URL"
# Turbopack is the Next 16 production bundler. Webpack fails on existing
# CSS modules and then looks for a proxy NFT file that this app does not emit.
RUN npx next build --turbopack

FROM node:22.21.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3100
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Dubai
RUN groupadd --gid 1001 nodejs && useradd --uid 1001 --gid nodejs --create-home nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3100/ar').then((r)=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
