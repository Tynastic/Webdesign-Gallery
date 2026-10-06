# Deploying War Room for user testing

One small VPS is enough. Docker Compose runs two containers:

- **app**: one Node process. It serves the client, the room API and the live-sync websocket, and stores everything in a single SQLite file.
- **caddy**: HTTPS with automatic Let's Encrypt certificates, forwarding requests to the app.

Expect roughly 100–200 MB of RAM for a handful of rooms.

## 1. Before you start

- **A server.** Any Linux VPS with Docker installed. In the EU, for example Hetzner CX22, which is 2 vCPU and 4 GB. The smallest size is plenty.
- **A domain.** Create a DNS `A` record (and `AAAA` for IPv6) pointing to the server, for example `warroom.example.org`.
- **Open ports.** 80 and 443 (TCP) and 443 (UDP, for HTTP/3) must be reachable.
- **Legal pages.** Germany requires an Impressum and a privacy notice for a public site. Fill in the yellow placeholders in `server/legal/*.html` before inviting testers. The templates describe what the app actually stores, but they are **not legal advice**, so review them. Edits take effect without a rebuild.

## 2. Install

```sh
git clone <your repo> war-room && cd war-room/designs/CoW
cp .env.example .env
# edit .env: DOMAIN=…, ADMIN_TOKEN=$(openssl rand -base64 32)
export APP_COMMIT=$(git rev-parse --short HEAD)   # optional: shown as the version
docker compose up -d --build
docker compose logs -f app                         # "War Room 0.4.0 on http://localhost:1234 …"
```

Open `https://<DOMAIN>`. The first request can take a few seconds while Caddy obtains the certificate.

**Closed beta (optional).** To keep the site private while testing:

1. Create a password hash: `docker compose run --rm caddy caddy hash-password`.
2. Put `BETA_USER` and `BETA_PASSWORD_HASH` in `.env`.
3. Uncomment the `basic_auth` block in `Caddyfile`.
4. Run `docker compose up -d`.

## 2b. Hosting from a Windows PC with Docker in WSL

**Recommended: Cloudflare Tunnel** ([docker-compose.tunnel.yml](docker-compose.tunnel.yml)).

- **No network setup:** no router port forwarding, no WSL network tweaks and no public IPv4 needed, so it also works on DS-Lite connections.
- **HTTPS** is handled by Cloudflare.
- **Privacy:** your home IP stays hidden.

```sh
# inside WSL (Ubuntu); the docker.io package needs the compose and buildx plugins:
sudo apt install docker-compose-v2 docker-buildx
cd /mnt/c/Users/<you>/Documents/Coding/Webdesign/designs/CoW
cp .env.example .env && nano .env            # ADMIN_TOKEN=$(openssl rand -base64 32)
docker compose -f docker-compose.tunnel.yml up -d --build
docker compose -f docker-compose.tunnel.yml logs tunnel | grep trycloudflare
```

**Quick tunnel or a stable URL?**

- The quick tunnel's `https://….trycloudflare.com` URL changes whenever the tunnel container restarts. That's fine for a first test evening.
- For a stable URL, add your domain to Cloudflare (free plan), create a tunnel, and point its public hostname at `http://app:1234`. Then set `TUNNEL_TOKEN` and `TUNNEL_ARGS=tunnel --no-autoupdate run` in `.env` and run `up -d` again.

**Privacy notice:** Cloudflare then processes all traffic (US provider, EU-US Data Privacy Framework). Name it in `datenschutz.*.html` under "Hosting".

**Keeping it running:**

- The PC must stay on and must not sleep.
- WSL shuts its distribution down once no Windows program uses it. Keep a WSL terminal open, or add a Windows Task Scheduler task "at log on" running `wsl.exe -d Ubuntu --exec sleep infinity`.
- Docker's `restart: unless-stopped` brings both containers back whenever WSL and Docker start.

**Alternative: Caddy with router port forwarding** (needs a public IPv4).

1. In `%UserProfile%\.wslconfig` set `[wsl2]` and `networkingMode=mirrored`, then run `wsl --shutdown`. WSL ports then appear on the PC's LAN IP.
2. Allow inbound traffic. As administrator in PowerShell:
   `New-NetFirewallHyperVRule -Name WarRoom -DisplayName "War Room" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 80,443`
3. On the router, give the PC a fixed LAN IP, then forward TCP 80/443 (and UDP 443) to it.
4. Set up a dynamic-DNS hostname as `DOMAIN` (for example MyFRITZ! or DuckDNS), then run `docker compose up -d --build` as in step 2.

## 3. Updating

```sh
git pull
export APP_COMMIT=$(git rev-parse --short HEAD)
docker compose up -d --build
```

On shutdown the server stores every open plan, and clients reconnect and resync automatically. Rooms and plans live in the `data` volume, so they survive rebuilds.

## 4. Backups

```sh
docker compose exec app node --no-warnings=ExperimentalWarning scripts/backup.ts
```

This writes a consistent copy to `/data/backups/` while the server keeps running, and keeps the newest 14 (`BACKUP_KEEP`). Run it daily from the host's cron, and copy the backups off the server, for example:

```cron
15 3 * * * cd /path/to/war-room/designs/CoW && docker compose exec -T app node --no-warnings=ExperimentalWarning scripts/backup.ts
```

**Restore:** stop the app, copy a backup over `/data/cow-planner.sqlite` in the volume, then start it again.

## 5. Reading tester feedback

Testers send feedback from the speech-bubble button in the app or the lobby footer. Crashes are reported automatically. Read both with your `ADMIN_TOKEN`:

```sh
curl -s https://<DOMAIN>/api/admin/feedback -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -s https://<DOMAIN>/api/admin/errors   -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -s https://<DOMAIN>/api/admin/stats    -H "Authorization: Bearer $ADMIN_TOKEN"
```

Feedback and error reports include the browser version and the app version (with the commit if `APP_COMMIT` was set), so you can tell which build a report came from. The privacy notice promises to delete them after the test phase.

## 6. Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | – | Public host name (Caddy) |
| `ADMIN_TOKEN` | – | Enables `/api/admin/*` |
| `ROOM_TTL_DAYS` | 90 | Rooms without changes for this long are deleted (checked daily) |
| `LIMIT_ROOMS_PER_HOUR` | 10 | Room creations per IP per hour |
| `LIMIT_CONNECTIONS_PER_IP` | 20 | Concurrent websocket connections per IP |
| `LIMIT_FEEDBACK_PER_HOUR` / `LIMIT_ERRORS_PER_HOUR` | 10 / 30 | Per IP |
| `LIMIT_MESSAGE_BYTES` | 2 MB | Largest single sync message |
| `LIMIT_DOCUMENT_BYTES` | 20 MB | Plans above this are no longer stored (logged) |
| `TRUST_PROXY` | `1` in Docker | Take the client IP from `X-Forwarded-For` (only behind Caddy) |
| `DATA_DIR`, `LEGAL_DIR`, `PORT` | `/data`, `server/legal`, `1234` | Paths and port |

## 7. Without Docker

You need Node ≥ 22.18, which runs the server's TypeScript directly.

```sh
npm ci && npm run build
ADMIN_TOKEN=… npm start          # serves dist/, the API and /collab on :1234
```

Put any HTTPS reverse proxy in front of it (it must forward websocket upgrades on `/collab`) and set `TRUST_PROXY=1`.

## What is in place for a public test

- **Security headers:** a strict Content-Security-Policy (same-origin only, no inline scripts), plus `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` (room links are secrets) and HSTS via Caddy.
- **Abuse limits:**
  - per-IP rate limits and connection caps (the IPs live only in memory);
  - size limits on messages, request bodies and documents;
  - room passwords hashed with scrypt;
  - owner-only room deletion.
- **Privacy:**
  - no cookies, tracking or third-party requests;
  - Caddy access logs are discarded;
  - room pages are `noindex`, and `robots.txt` excludes `/r/` and `/api/`.
- **Performance:**
  - Brotli/gzip precompressed assets: the 2.3 MB map data is sent as about 400 KB;
  - long-cached hashed assets and ETags;
  - the lobby loads without the map engine, which loads lazily (about 107 KB compressed).
- **Operations:** a health check (`/healthz`), graceful shutdown that saves open plans, daily cleanup of inactive rooms, and online backups.
