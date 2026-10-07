# War Room

A shared strategy map for **Call of War: Supremacy 1942**. Your coalition opens one room and plans together, live, on the real 3,159-province world map:

- **Planned conquests:** who should take which province.
- **Ownership:** which provinces are already conquered. Nation borders and labels follow.
- **Drawings:** attack arrows, fronts, zones, unit and objective markers, range circles and notes.
- **Phases:** step through the plan phase by phase.

The interface is German by default; English is one click away. Current version: test version 0.4 (desktop). A phone layout is planned.

## Using War Room

1. **Create a room** in the lobby, optionally with a password, and share the link with your coalition. **Work offline** opens a plan that lives only in your browser.
2. **Pick your nation** when you join. The plan's roster lists the nations in your game. A nation gets a **nickname** when a teammate plays it; AI nations keep it empty.
3. **Plan and draw** with the tools below. Everyone sees changes instantly. Undo (Ctrl+Z) only reverts your own edits.

| Key | Tool | What it does |
|---|---|---|
| `V` | Select | Select, move and edit drawings; click a province for its details |
| `P` | Plan conquests | Hatch provinces in the colour of the nation that should take them. Shift+click paints a whole nation |
| `C` | Mark as conquered | Record a province's current owner; it takes the conqueror's colour |
| `A` `F` `Z` | Arrow, front, zone | Attack/move arrows, front lines and areas |
| `U` `O` `R` `T` | Unit, objective, range, text | Markers, range circles in km, notes |
| `M` | Measure | Approximate distance in km and travel time |
| `G` | Ping | Flash a ring on everyone's map (also Alt+click) |

More: `?` shows all shortcuts. Click a teammate's avatar to follow their view. Export a PNG with a legend for the game chat, or a JSON backup of the plan.

**Distances are estimates.** The game map is a stylised Mercator projection, so distances are within about ±35%. Measure a known distance and click **Calibrate…** to correct the whole plan.

## Running it locally

Needs Node ≥ 22.18.

```sh
npm install
npm run dev          # http://localhost:5173 (sync server on :1234)
```

## Deploying

Two ready-made setups, both with Docker Compose. Details, alternatives and troubleshooting: [DEPLOY.md](DEPLOY.md).

### Option A: your own PC with Docker in WSL (Cloudflare Tunnel)

You don't need port forwarding or a public IP, and HTTPS comes from Cloudflare. In the Ubuntu WSL terminal:

```sh
sudo apt install docker-compose-v2 docker-buildx       # once
cd /mnt/c/Users/<you>/Documents/Coding/Webdesign/designs/CoW
cp .env.example .env
echo "ADMIN_TOKEN=$(openssl rand -base64 32)" >> .env
echo "COMPOSE_FILE=docker-compose.tunnel.yml" >> .env  # so plain "docker compose" uses the tunnel setup
docker compose up -d --build
docker compose logs tunnel | grep trycloudflare        # your public https://….trycloudflare.com address
```

Keep in mind:

- The PC must stay on.
- WSL must keep running. Keep a WSL terminal open, or see [DEPLOY.md](DEPLOY.md#keeping-it-running).
- The quick-tunnel address changes when the tunnel container restarts. DEPLOY.md shows how to get a stable address.

### Option B: a VPS with your own domain (Caddy)

Point a DNS record at the server, then:

```sh
cp .env.example .env    # set DOMAIN and ADMIN_TOKEN
docker compose up -d --build
```

Caddy obtains the HTTPS certificate automatically.

### Before inviting testers

- **Fill in the legal pages:** replace the yellow placeholders in `server/legal/*.html` (Impressum, Datenschutz). They take effect without a rebuild.
- **Option A only:** name Cloudflare as a processor in the Datenschutz page.

### Updating after changes

```sh
docker compose exec app node --no-warnings=ExperimentalWarning scripts/backup.ts   # safety net
export APP_COMMIT=$(git rev-parse --short HEAD)                                     # shown as the version
docker compose up -d --build app
docker compose ps                                                                   # wait for "healthy"
```

Plans are kept, and browsers reconnect by themselves. Ask testers to reload so they get the new version. The full procedure, including rollback, is in [DEVELOPMENT.md](DEVELOPMENT.md#making-changes).

### Everyday commands

| Command | Purpose |
|---|---|
| `docker compose ps` | Are the containers running and healthy? |
| `docker compose logs -f app` | Follow the server log |
| `docker compose restart app` | Restart the server (the tunnel URL stays) |
| `docker compose stop` / `start` | Pause and resume everything |
| `docker compose down` | Remove the containers; rooms are kept |

⚠️ Never run `docker compose down -v`. It deletes the data volume with every room.

**Reading feedback.** Testers send feedback from the speech-bubble button, and crashes are reported automatically:

```sh
curl -s https://<address>/api/admin/feedback -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## Documentation

| File | Contents |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Hosting options, operations, backups, configuration, security measures |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Workflow, scripts, tests, architecture, technical notes, roadmap |
| [DESIGN.md](DESIGN.md) | Visual design and the usability principles behind the interface |
