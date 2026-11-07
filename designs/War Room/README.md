# War Room

A shared strategy map for organized **Call of War: Supremacy 1942** matches: two teams, Axis and Allies, on the real 3,159-province world map. Each room is one match, planned together and live:

- **Line-up:** which of the 30 playable nations is on which team, and who plays it. Every nation without a player is an AI nation.
- **Planned conquests:** who should take which province.
- **Ownership:** which provinces are already conquered. Nation borders and labels follow.
- **Drawings:** attack arrows, fronts, zones, unit and objective markers, range circles and notes.
- **Phases:** step through the plan phase by phase.

The interface is German by default; English is one click away. Current version: test version 0.5 (desktop). A phone layout is planned.

## Using War Room

1. **Create a room** in the lobby, optionally with a password, and share the link. Whoever creates a room **organizes** it. **Work offline** opens a plan that lives only in your browser.
2. **Join.** Pick your name if the organizer already listed you, or sign up with the nation you would like to play.
3. **Line-up** (`L`, or **Line-up** in the top bar). The organizer drags the nations into the Axis and Allies columns and players onto nations; waiting players' wishes can be seated with one click. Everyone else sees the same board read-only.
4. **Plan and draw** with the tools below. Everyone sees changes instantly. Undo (Ctrl+Z) only reverts your own edits.

**Who is who, by colour.** Every nation has one colour, its Call of War colour, and so does its player: their avatar, cursor, conquest chips, planned conquests and drawings all share it. It can't be changed; on the **Teams** map the markings show muted, so the team colours stay in front. Generic drawings can use a fixed colour instead (options bar or inspector): enemy forces red, friendly forces blue, light grey, dark grey, white or black. The legend in the map's corner explains the map's colours and symbols. A PNG export lists the players whose nations are in the exported view, in their colours.

**Map colours** (the **View** menu): **Vivid** and **Muted** show the Call of War colours, **Teams** paints Axis land terracotta and Allies land blue, **Off** shows plain paper. **Grey out AI nations** greys every nation without a player; choosing Teams switches it on, Vivid or Muted switch it off. Capitals carry a gold star. The **Nations** panel lists the nations by team with their player, class, land held since the start, capital status and conquest progress.

**Organizers and the admin.** A room's creator and the admin may change its line-up; the server enforces this. The admin logs in at `/admin` (**Admin** in the lobby footer; needs `ADMIN_PASSWORD` on the server) and can then open every room without its password and organize any line-up.

**Room management** (`/admin`). Every room with what is in it: players (and how many are seated), planned conquests, drawings, conquered provinces, size, creation date and last activity. Filter for **unused** rooms (nobody signed up, nothing planned, drawn or conquered) or rooms **inactive** for a number of days, select them and delete them in one go. Rooms are still deleted automatically after `ROOM_TTL_DAYS` without changes.

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

**Cities and resources.** Cities are marked with a dot, Doppelstädte (6,000 production) with a double ring, and both are labelled first. Resource provinces carry a glyph in front of their name (wheat ear = food, ingot = metal, drop = oil); the bigger the glyph, the more they produce. Both can be switched off in the **View** menu. Click a province to see its daily production, whether it is core land, and what conquering it costs.

**Point system.** Each nation may conquer a daily allowance of points (set it under **Points** in the sidebar). The price of a province depends on the **class of the nation holding it** ([sources/world_nation_class.csv](sources/world_nation_class.csv)):

| Class | Nations | Province | City |
|---|---|---|---|
| 1 (large) | USA, Soviet Union, Nationalist China, Brazil | 1 | 4 |
| 2 (medium) | Canada, UK, France, Germany, Italy, Spain, India, Japan, Australia | 2 | 5 |
| 3 (small) | Mexico, Venezuela, Peru, Argentina, South Africa, Egypt, Sweden, Netherlands, Poland, Yugoslavia, Romania, Turkey, Persia, Xinjiang, Tibet, Mongolia, Manchukuo | 3 | 6 |

- Doppelstädte count as cities.
- **Half price:** land that is not the holder's core land, and taking back your own or a teammate's core land.
- **A capital always costs 10.**
- Land held by an **AI nation** (any nation without a player) is always free.

The Points panel totals each nation's planned conquests against the allowance, and the Plan conquests tool shows the running total while you paint.

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
cd "/mnt/c/Users/<you>/Documents/Coding/Webdesign/designs/War Room"
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

**No VPS?** Oracle Cloud's Always Free tier includes an ARM VM in Frankfurt that runs this setup for free. The step-by-step guide is in [DEPLOY.md](DEPLOY.md#c-oracle-cloud-always-free-vm).

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

**Reading crash reports.** Crashes in the app are reported automatically:

```sh
curl -s https://<address>/api/admin/errors -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## Documentation

| File | Contents |
|---|---|
| [DEPLOY.md](DEPLOY.md) | Hosting options, operations, backups, configuration, security measures |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Workflow, scripts, tests, architecture, technical notes, roadmap |
| [DESIGN.md](DESIGN.md) | Visual design and the usability principles behind the interface |
