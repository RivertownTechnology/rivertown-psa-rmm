FROM node:22-alpine AS base
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile

COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/api/ apps/api/

EXPOSE 3000
ENV NODE_ENV=production

# Fix pnpm symlinks created from Windows lockfile
RUN find /app -type l ! -exec test -e {} \; -delete && pnpm install --frozen-lockfile

WORKDIR /app/apps/api
CMD ["npx", "tsx", "src/app.ts"]
