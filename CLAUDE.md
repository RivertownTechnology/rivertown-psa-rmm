# Rivertown PSA/RMM

## Project Overview
RMM (Remote Monitoring & Management) + PSA (Professional Services Automation) tool for MSPs. Think NinjaRMM + HaloPSA.

## Tech Stack
- **Backend:** Fastify + TypeScript + Drizzle ORM + PostgreSQL 16
- **Frontend:** React 19 + Vite + TanStack Router + Tailwind + shadcn/ui (not yet scaffolded)
- **RMM Agent:** C# / .NET 8 (not yet scaffolded)
- **Job Queue:** BullMQ + Redis 7
- **Agent Comms:** MQTT (Mosquitto)
- **Monorepo:** pnpm workspaces + Turborepo

## Monorepo Structure
- `packages/shared/` — @rivertown/shared: types, constants, Zod validators
- `packages/db/` — @rivertown/db: Drizzle schema, migrations, seeds
- `apps/api/` — @rivertown/api: Fastify server
- `apps/web/` — Admin dashboard (not yet scaffolded)
- `apps/portal/` — Customer portal (not yet scaffolded)
- `agent/` — .NET 8 Windows agent (not yet scaffolded)
- `infrastructure/docker/` — Docker Compose for dev services

## Commands
- `pnpm install` — install all dependencies
- `pnpm dev` — start all dev servers (via Turborepo)
- `pnpm build` — build all packages
- `pnpm test` — run all tests
- `pnpm db:generate` — generate Drizzle migrations
- `pnpm db:migrate` — run migrations
- `pnpm db:seed` — seed development data

## Dev Environment
Start services: `docker compose -f infrastructure/docker/docker-compose.yml up -d`
Then: `pnpm dev`

## Architecture Decisions
- Multi-tenant data model (tenant_id on all tables) — single tenant for now
- Module system: each feature is a self-contained Fastify plugin in `apps/api/src/modules/`
- Auth: JWT (access + refresh tokens), RBAC (owner/admin/tech/portal_user)
- All monetary values stored in cents (integer)
- UUID primary keys on all tables
