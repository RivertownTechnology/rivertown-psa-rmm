# Admin dashboard (apps/web) — static SPA served by nginx.
# Built for the target platform by buildx (linux/amd64 for the x86 Docker host).
FROM node:22-alpine AS build
RUN npm i -g corepack@latest && corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/web/package.json apps/web/
COPY apps/portal/package.json apps/portal/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
COPY . .
# Same-origin deployment — leave VITE_API_URL unset so the app calls /api/v1.
RUN pnpm --filter @rivertown/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
