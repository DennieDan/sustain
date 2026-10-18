# Sustain Cloud's image (CLD-10). Build it from the repository's root, since the cloud shares the
# model with the extension: docker build -f cloud/Dockerfile -t sustain-cloud .
# Configuration comes from the environment only. The database lives in /data, and billing stays off
# without Stripe keys.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY cloud/package.json cloud/
RUN npm ci
COPY . .
RUN npm run -w cloud build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 SUSTAIN_DB=/data
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/cloud ./cloud
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["npm", "run", "-w", "cloud", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
