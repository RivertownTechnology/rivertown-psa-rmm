FROM node:22-alpine AS build
RUN npm i -g corepack@latest && corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/portal/package.json apps/portal/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @rivertown/portal build

FROM nginx:alpine
COPY --from=build /app/apps/portal/dist/ /usr/share/nginx/html/
COPY apps/portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
