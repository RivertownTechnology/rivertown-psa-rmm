# Build stage — install, compile, spit out a static dist/
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /repo

# Copy workspace metadata and lockfile first for Docker layer caching on deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/admin/package.json ./apps/admin/

# Install (devDependencies included — vite is a devDep we need for `build`)
RUN pnpm install --filter @forgepsa/admin... --frozen-lockfile --prod=false

# Copy the actual source after install so dep changes don't bust this layer
COPY apps/admin ./apps/admin

RUN pnpm --filter @forgepsa/admin build

# Runtime stage — tiny static-file server
FROM node:22-slim AS runtime

WORKDIR /app

RUN npm install -g serve@14

COPY --from=builder /repo/apps/admin/dist ./dist

# Railway injects $PORT. Fall back to 3000 for local `docker run`.
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "serve -s dist -l tcp://0.0.0.0:${PORT}"]
