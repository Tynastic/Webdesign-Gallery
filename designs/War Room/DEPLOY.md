# Deploying and running War Room

The app is a single Node process. It serves the client, the room API and the live-sync websocket, and stores everything in one SQLite file in the `data` volume. Docker Compose puts it behind either a Cloudflare Tunnel or Caddy for HTTPS; setup C runs the Caddy setup on a free Oracle Cloud VM. Expect roughly 100–200 MB of RAM for a handful of rooms.

| Setup | Compose file | When to use it |
|---|---|---|
| **A. Cloudflare Tunnel** | `docker-compose.tunnel.yml` | Home PC or WSL. No port forwarding, no public IPv4 needed (works on DS-Lite), home IP stays hidden |
| **B. Caddy** | `docker-compose.yml` | VPS or any machine reachable on ports 80/443 with a domain. Automatic Let's Encrypt certificates |
| **C. Oracle Cloud Free VM** | `docker-compose.yml` | Setup B on a free, always-on VM in Frankfurt. No home PC needed |

Either way, set `ADMIN_TOKEN` in `.env` (`openssl rand -base64 32`). Create and edit `.env` inside WSL or Linux, because Windows line endings would leave a stray `\r` in the values.

**Tip:** with `COMPOSE_FILE=docker-compose.tunnel.yml` in `.env`, plain `docker compose …` uses the tunnel setup. All commands below assume the right file is selected this way.

## A. Cloudflare Tunnel (Docker in WSL)

```sh
# Ubuntu WSL; the docker.io package lacks these plugins:
sudo apt install docker-compose-v2 docker-buildx
cd "/mnt/c/Users/<you>/Documents/Coding/Webdesign/designs/War Room"
cp .env.example .env
echo "ADMIN_TOKEN=$(openssl rand -base64 32)" >> .env
echo "COMPOSE_FILE=docker-compose.tunnel.yml" >> .env
docker compose up -d --build
docker compose logs tunnel | grep trycloudflare
```

### Stable address

The quick tunnel's `https://….trycloudflare.com` address changes whenever the tunnel container restarts. That's fine for a test evening. For a fixed address:

1. Add a domain to a free Cloudflare account.
2. Under Zero Trust → Networks → Tunnels, create a tunnel and route a public hostname to `http://app:1234`.
3. In `.env`, set `TUNNEL_TOKEN=<token>` and `TUNNEL_ARGS=tunnel --no-autoupdate run`, then run `docker compose up -d`.

### Keeping it running

- The PC must stay on and must not sleep.
- WSL shuts its distribution down once no Windows program uses it. Keep a WSL terminal open, or add a Task Scheduler task "at log on" that runs `wsl.exe -d Ubuntu --exec sleep infinity`.
- `restart: unless-stopped` brings both containers back whenever WSL and Docker start.

### Privacy

All traffic passes through Cloudflare (a US provider, under the EU-US Data Privacy Framework). Name it under "Hosting" in `server/legal/datenschutz.*.html`.

## B. Caddy (VPS with a domain)

1. **A server.** Any Linux VPS with Docker. In the EU, for example the smallest Hetzner instance, which is plenty.
2. **DNS.** An `A` record (and `AAAA` for IPv6) pointing to the server, for example `warroom.example.org`.
3. **Firewall.** Open 80/tcp and 443/tcp, plus 443/udp for HTTP/3.

```sh
git clone <your repo> war-room && cd "war-room/designs/War Room"
cp .env.example .env                               # set DOMAIN and ADMIN_TOKEN
export APP_COMMIT=$(git rev-parse --short HEAD)    # optional: shown as the version
docker compose up -d --build
docker compose logs -f app                         # "War Room 0.4.0 on http://localhost:1234 …"
```

The first request can take a few seconds while Caddy obtains the certificate.

### Closed beta (optional)

To keep the site private while testing:

1. Create a password hash: `docker compose run --rm caddy caddy hash-password`.
2. Put `BETA_USER` and `BETA_PASSWORD_HASH` in `.env`.
3. Uncomment the `basic_auth` block in `Caddyfile`.
4. Run `docker compose up -d`.

### Caddy on a home PC (port forwarding)

This needs a public IPv4 address, so DS-Lite connections can't use it.

1. In `%UserProfile%\.wslconfig`, set `[wsl2]` and `networkingMode=mirrored`, then run `wsl --shutdown`. WSL ports then appear on the PC's LAN IP.
2. As administrator in PowerShell, allow inbound traffic:
   `New-NetFirewallHyperVRule -Name WarRoom -DisplayName "War Room" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 80,443`
3. On the router, give the PC a fixed LAN IP and forward TCP 80/443 (and UDP 443) to it.
4. Use a dynamic-DNS hostname (for example MyFRITZ! or DuckDNS) as `DOMAIN`.

## C. Oracle Cloud Always Free VM

Oracle's Always Free tier includes ARM (Ampere A1) VMs with up to 2 OCPUs and 12 GB of RAM in total. One small VM runs setup B without any changes, and the images used here are available for ARM. Oracle changes free-tier limits from time to time, so check the current [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) before you start.

### 1. Create the account

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/). A credit card is needed for verification; Always Free resources are not charged.
2. ⚠️ **Choose *Germany Central (Frankfurt)* as the home region.** It can't be changed later, and Always Free VMs only run in the home region. Frankfurt keeps the data in the EU, which keeps the privacy notice simple.
3. **Optional, recommended later: upgrade to *Pay As You Go*** (Billing → Upgrade and Manage Payment).
   - Always Free resources stay free.
   - Oracle stops reclaiming idle free VMs. A free-tier VM can be stopped if it stays almost idle for 7 days, and a planning tool between game evenings can look idle.
   - "Out of capacity" errors become rarer.
   - Anything beyond the free limits is billed, so set a budget with an alert at 1 € first (Billing → Budgets).

### 2. Create the VM

Under Compute → Instances → **Create instance**:

| Setting | Value |
|---|---|
| Image | Canonical Ubuntu 24.04 (the aarch64 build is picked automatically for Ampere) |
| Shape | Ampere → `VM.Standard.A1.Flex`, **1 OCPU, 6 GB** (well within the free limit; up to 2 OCPUs / 12 GB in total) |
| Networking | Create a new VCN with a **public subnet**, and assign a public IPv4 address |
| SSH keys | Upload your own public key (`ssh-keygen -t ed25519` creates one), or download the generated key pair and keep the private key safe |
| Boot volume | The default 47–50 GB is enough (up to 200 GB in total are free) |

If it fails with **"Out of capacity for shape"**, try another availability domain (Frankfurt has three) or try again later. Upgrading to Pay As You Go usually helps too.

Note the instance's **public IP address**. Connect as `ubuntu`:

```sh
ssh ubuntu@<public-ip>
```

### 3. Open ports 80 and 443

There are two firewalls, and both need the ports.

1. **Oracle's network (security list).** Instance → subnet → *Default Security List* → **Add Ingress Rules**, with source CIDR `0.0.0.0/0`:
   - TCP, destination port `80`
   - TCP, destination port `443`
   - UDP, destination port `443` (HTTP/3)

   SSH (TCP 22) is already open.
2. **The VM's own iptables.** Oracle's Ubuntu images reject everything except SSH. Don't enable `ufw`; add the rules in front of the final `REJECT` and save them:

   ```sh
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

### 4. Install Docker

```sh
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com | sudo sh        # Docker Engine, Compose and Buildx
sudo usermod -aG docker ubuntu
exit                                                # log in again so the group applies
```

### 5. Get a domain name

Caddy needs a host name that points to the VM. A free one is enough:

1. Sign in at [duckdns.org](https://www.duckdns.org), add a subdomain (for example `warroom-xyz`), and set its IP to the VM's public IP.
2. Check from your PC: `nslookup warroom-xyz.duckdns.org` should return that IP.

The public IP stays the same as long as the instance exists, including across reboots. If you ever recreate the VM, update the DuckDNS entry. Your own domain works the same way, with an `A` record.

### 6. Deploy

```sh
git clone https://github.com/Tynastic/Webdesign-Gallery.git war-room
cd "war-room/designs/War Room"
cp .env.example .env
nano .env                                          # DOMAIN=warroom-xyz.duckdns.org
echo "ADMIN_TOKEN=$(openssl rand -base64 32)" >> .env
export APP_COMMIT=$(git rev-parse --short HEAD)
docker compose up -d --build                       # the first build takes a few minutes
docker compose logs -f app                         # wait for "War Room … on http://localhost:1234"
```

- **Private repository:** clone over SSH with a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) (a read-only key for this repository only), or with a fine-grained personal access token.
- **`.env` is created on the VM,** so it already has Linux line endings, and it is never committed.
- **Check it:** open `https://<your-domain>` and create a test room. The first request can take a few seconds while Caddy obtains the certificate. If it fails, `docker compose logs caddy` usually names the cause: a wrong DNS entry, or port 80 blocked by one of the two firewalls in step 3.

### 7. Before inviting testers

- **Legal pages.** Fill in `server/legal/*.html` (see [Legal pages](#legal-pages)). Under "Hosting", name Oracle as the hosting provider, with the server location *Frankfurt am Main, Germany*. Take the contracting Oracle entity and its address from your account's agreement. Oracle's data processing agreement is part of its cloud service terms. Either commit the filled-in pages, or edit them on the VM; in that case `git pull` may stop with a conflict when the templates change upstream.
- **Daily backups.** Add the cron line from [Backups](#backups) with `crontab -e`, adjusting the path to `/home/ubuntu/war-room/designs/War Room`. Backups stay on the VM, so copy them to your PC now and then:

  ```sh
  # on the VM
  docker compose cp app:/data/backups ./backups
  # on your PC
  scp -r "ubuntu@<public-ip>:war-room/designs/War Room/backups" .
  ```

- **Security updates.** Ubuntu installs security updates automatically (`unattended-upgrades`). Reboot now and then with `sudo reboot`; the containers come back by themselves.

To update the app later, run `git pull` and then follow [Updating](#updating).

## Legal pages

Germany requires an Impressum and a privacy notice for a public site. Fill in the yellow placeholders in `server/legal/*.html` before inviting testers.

- The templates describe what the app actually stores, but they are **not legal advice**, so review them.
- The folder is mounted into the container, so edits take effect without a rebuild.

## Managing the containers

| Command | Purpose |
|---|---|
| `docker compose ps` | Status and health |
| `docker compose logs -f app` | Follow the server log (Ctrl+C to quit) |
| `docker stats` | CPU and RAM per container |
| `docker compose restart app` | Restart only the server |
| `docker compose stop` / `start` | Pause and resume everything |
| `docker compose up -d` | Start, or apply `.env` changes |
| `docker compose down` | Remove the containers; rooms stay in the volume |
| `docker compose exec app sh` | Shell inside the container |
| `docker image prune -f` | Remove old images after rebuilds |

- With the quick tunnel, restarting the `tunnel` container (and `stop`, `down` or a full restart) gives you a new address. Check `docker compose logs tunnel` afterwards.
- ⚠️ **`docker compose down -v` deletes the `data` volume**, which holds every room and plan.

## Updating

```sh
docker compose exec app node --no-warnings=ExperimentalWarning scripts/backup.ts
export APP_COMMIT=$(git rev-parse --short HEAD)
docker compose up -d --build app
docker compose ps                     # wait for "healthy"
```

- **What survives.** On shutdown the server stores every open plan. Clients reconnect and resync automatically, and the `data` volume survives rebuilds.
- **Tell testers to reload.** Open tabs keep the old client code.
- **Testing and rollback** are covered in [DEVELOPMENT.md](DEVELOPMENT.md#making-changes).
- **On a VPS:** run `git pull` first.
- **Git in WSL on `/mnt/c`:** if it reports "dubious ownership", run `git config --global --add safe.directory '*'` once.

## Backups

```sh
docker compose exec app node --no-warnings=ExperimentalWarning scripts/backup.ts
docker compose cp app:/data/backups ./backups      # copy them out of the volume
```

The backup is a consistent copy made while the server keeps running, written to `/data/backups/`. The newest 14 are kept (`BACKUP_KEEP`). To run it daily from the host's cron:

```cron
15 3 * * * cd "/path/to/designs/War Room" && docker compose exec -T app node --no-warnings=ExperimentalWarning scripts/backup.ts
```

**Restore:**

1. Run `docker compose stop app`.
2. Copy a backup over `/data/cow-planner.sqlite` in the volume, for example with `docker compose cp`.
3. Run `docker compose start app`.

## Reading crash reports

Crashes in the app are reported automatically. Read them with your `ADMIN_TOKEN`:

```sh
curl -s https://<address>/api/admin/errors   -H "Authorization: Bearer $ADMIN_TOKEN" | jq
curl -s https://<address>/api/admin/stats    -H "Authorization: Bearer $ADMIN_TOKEN"
```

- **Which build a report came from.** Reports include the browser and the app version, plus the commit if `APP_COMMIT` was set.
- **Deleting them.** The privacy notice promises to delete them after the test phase.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_TOKEN` | – | Enables `/api/admin/*` (required by the compose files) |
| `ADMIN_PASSWORD` | – | Password of the admin user (`/admin`): opens every room without its password, organizes any line-up, manages and deletes rooms. Unset = no admin login. Changing it logs the admin out everywhere |
| `LIMIT_LOGINS_PER_HOUR` | 10 | Admin login attempts per IP |
| `DOMAIN` | – | Public host name (Caddy setup only) |
| `TUNNEL_TOKEN`, `TUNNEL_ARGS` | quick tunnel | Named Cloudflare tunnel (tunnel setup only) |
| `COMPOSE_FILE` | `docker-compose.yml` | Which setup plain `docker compose` uses |
| `APP_COMMIT` | – | Commit shown in the version (build argument) |
| `ROOM_TTL_DAYS` | 90 | Rooms without changes for this long are deleted (checked daily) |
| `LIMIT_ROOMS_PER_HOUR` | 10 | Room creations per IP per hour |
| `LIMIT_CONNECTIONS_PER_IP` | 20 | Concurrent websocket connections per IP |
| `LIMIT_ERRORS_PER_HOUR` | 30 | Crash reports per IP |
| `LIMIT_MESSAGE_BYTES` | 2 MB | Largest single sync message |
| `LIMIT_DOCUMENT_BYTES` | 20 MB | Plans above this are no longer stored (logged) |
| `TRUST_PROXY` | `1` in Docker | Take the client IP from `CF-Connecting-IP` / `X-Forwarded-For`. Only use behind a proxy |
| `BACKUP_KEEP` | 14 | Number of backups kept |
| `DATA_DIR`, `LEGAL_DIR`, `PORT` | `/data`, `server/legal`, `1234` | Paths and port |

The `LIMIT_*` variables that the compose files don't pass through can be added to the `app` service's `environment`.

## Without Docker

Needs Node ≥ 22.18, which runs the server's TypeScript directly.

```sh
npm ci && npm run build
ADMIN_TOKEN=… npm start          # serves dist/, the API and /collab on :1234
```

Put any HTTPS reverse proxy in front of it. It must forward websocket upgrades on `/collab`, and you should set `TRUST_PROXY=1`.

## What is in place for a public test

- **Security headers:** a strict Content-Security-Policy (same-origin only, no inline scripts), `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` (room links are secrets), and HSTS via Caddy or Cloudflare.
- **Abuse limits:**
  - per-IP rate limits and connection caps (IPs are held only in memory);
  - size limits on messages, request bodies and documents;
  - room passwords hashed with scrypt;
  - room deletion only by its creator or the admin;
  - the line-up of a room (teams, who plays which nation) is a separate document that the server makes read-only for everyone but its creator and the admin;
  - admin sessions are signed (HMAC) and expire after 30 days; admin logins are rate-limited.
- **Privacy:**
  - no cookies, tracking or third-party requests;
  - Caddy access logs are discarded;
  - room pages are `noindex`, and `robots.txt` excludes `/r/` and `/api/`.
- **Performance:**
  - Brotli/gzip precompressed assets: the 2.3 MB map data is sent as about 400 KB;
  - long-cached hashed assets and ETags;
  - the lobby loads without the map engine, which is lazy-loaded (about 107 KB compressed).
- **Operations:** a health check (`/healthz`), graceful shutdown that saves open plans, daily cleanup of inactive rooms, and online backups.
