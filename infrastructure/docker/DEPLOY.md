# Deploying Rivertown PSA/RMM to a Raspberry Pi Docker Swarm

Target: a multi-node Pi swarm (1 manager + N workers, all **64-bit OS / arm64**),
public HTTPS via Traefik + Let's Encrypt, Postgres on a USB SSD, auto-deploy on
push to `main` via GitHub Actions → GHCR.

Architecture:
```
Internet ──443──▶ Traefik (manager) ──▶ web  (app.DOMAIN)    ─┐
                                     └─▶ portal (portal.DOMAIN) ┤ nginx proxies /api ─▶ api:3000
                                                                └─▶ api (internal) ─▶ postgres / redis / mosquitto
```
The browser only ever talks to one origin per app, so there are no CORS/CSP
cross-origin concerns — nginx proxies `/api` to the internal `api` service.

---

## 1. One-time bootstrap (run on the hardware)

### 1a. Initialise the swarm
```bash
# On the manager Pi:
docker swarm init --advertise-addr <MANAGER_LAN_IP>
docker swarm join-token worker      # copy the printed command

# On each worker Pi, run the copied join command:
docker swarm join --token <TOKEN> <MANAGER_LAN_IP>:2377
```

### 1b. Prepare the USB SSD (on the node that will run Postgres)
```bash
lsblk                                   # find the disk, e.g. /dev/sda
sudo mkfs.ext4 /dev/sda1                # ⚠️ ERASES the drive
sudo mkdir -p /mnt/ssd
# persistent mount by UUID:
sudo blkid /dev/sda1                    # copy the UUID
echo 'UUID=<uuid> /mnt/ssd ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
sudo mount -a
sudo mkdir -p /mnt/ssd/pgdata
sudo chown -R 999:999 /mnt/ssd/pgdata   # postgres runs as uid 999 in the image
```

### 1c. Label the SSD node so Postgres/Redis pin to it
```bash
# On the manager (get node name from `docker node ls`):
docker node update --label-add ssd=true <NODE_NAME>
```

### 1d. Create the secrets
```bash
# 32+ char JWT secret, 64-hex (32-byte) encryption key, DB password:
openssl rand -base64 48 | tr -d '\n' | docker secret create jwt_secret -
openssl rand -hex 32     | tr -d '\n' | docker secret create encryption_key -
openssl rand -base64 32 | tr -d '\n/+=' | head -c 32 | docker secret create postgres_password -
```
Save the postgres_password value somewhere safe — it must match the
`POSTGRES_PASSWORD` GitHub secret used by the migration step.

### 1e. Log the manager into GHCR (so `--with-registry-auth` can distribute creds)
```bash
echo <GITHUB_PAT_with_read:packages> | docker login ghcr.io -u <github-user> --password-stdin
```

### 1f. DNS
Point these A records at the swarm's public IP (or your router's forwarded 80/443):
```
app.DOMAIN     ─▶ <public IP>
portal.DOMAIN  ─▶ <public IP>
```
Forward ports **80 and 443** to the manager node. Port 80 must be reachable for
the Let's Encrypt TLS challenge.

---

## 2. GitHub configuration

**Settings → Secrets and variables → Actions**

Secrets:
| name | value |
|------|-------|
| `SWARM_HOST` | manager public IP / hostname |
| `SWARM_USER` | ssh user on the manager |
| `SWARM_SSH_KEY` | private key for that user |
| `POSTGRES_PASSWORD` | same value used for the `postgres_password` secret |

Variables:
| name | value |
|------|-------|
| `DOMAIN` | `example.com` |
| `ACME_EMAIL` | `you@example.com` |

Image push uses the built-in `GITHUB_TOKEN` — no extra config. Ensure the
packages are readable by the swarm (either the manager PAT above, or make the
GHCR packages public).

---

## 3. Migrate your existing data off Railway (one time)

The swarm Postgres starts **empty**. Move your current data over before cutover:
```bash
# Dump from Railway (schema + data):
pg_dump "postgresql://postgres:...@mainline.proxy.rlwy.net:31107/railway" \
  --no-owner --no-privileges -Fc -f rivertown.dump

# Restore into the swarm Postgres (temporarily publish 5432, or run from the manager
# on the rivertown_internal network):
docker run --rm -v "$PWD:/w" --network rivertown_internal postgres:16-alpine \
  pg_restore --no-owner --no-privileges -d \
  "postgresql://rivertown:<pgpass>@postgres:5432/rivertown" /w/rivertown.dump
```
Then run migrations (Section 4 does this automatically) to apply anything newer.

---

## 4. First deploy

Push to `main` (or run the workflow manually). The pipeline:
1. Builds arm64 images for `api`, `web`, `portal`, `mqtt` → pushes to GHCR.
2. SCPs `stack.yml` to `/opt/rivertown` on the manager.
3. `docker stack deploy` — creates the overlay networks + all services.
4. Waits for Postgres, then runs `pnpm migrate` once.

Watch it come up on the manager:
```bash
docker stack services rivertown
docker service logs -f rivertown_api
docker service logs -f rivertown_traefik    # cert issuance
```
First TLS issuance takes ~30–60s. Then browse to `https://app.DOMAIN`.

---

## 5. Steady-state

- **Every push to `main` auto-deploys.** `update_config: start-first` keeps the
  old container serving until the new one is healthy (zero-downtime for
  api/web/portal).
- **Rollback:** `docker service update --rollback rivertown_api` (or redeploy an
  older SHA tag).
- **Scale:** `docker service scale rivertown_api=3` — or add worker Pis and they
  pick up replicas automatically (stateless services only).

---

## Notes & caveats

- **arm64 only.** The CI builds `linux/arm64`. Use a 64-bit Pi OS. (32-bit =
  arm/v7 and these images won't run.)
- **Postgres & Redis are single-replica and node-pinned** — their data lives on
  one node's disk. Don't scale them; a proper HA setup is a separate project.
  Back up `/mnt/ssd/pgdata` (or `pg_dump` on a cron) regularly.
- **Mosquitto is internal-only** for now (the RMM agent isn't built yet). When it
  ships, add a TLS listener on 8883 and expose it via a Traefik TCP router or a
  published port — don't expose 1883 plaintext to the internet.
- **Migration ordering:** migrations run right after `stack deploy`, so a new API
  replica can briefly run against the pre-migration schema. Fine for additive
  changes; for destructive ones, deploy in two steps (migrate, then app).
- **PDF generation** (Chromium) makes the API image large and memory-hungry — the
  768M limit in `stack.yml` accounts for it; tune per your Pi's RAM.
- **CORS:** `allowedOrigins` in `apps/api/src/server.ts` still lists the old
  Railway/production hosts. Same-origin routing means CORS isn't exercised, but if
  you ever split the API onto its own subdomain, add your domains there (or make
  it env-driven).
