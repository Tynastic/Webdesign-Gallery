# Development notes

These notes are for working on the code. To use or deploy the app, see the [README](README.md); for hosting details, see [DEPLOY.md](DEPLOY.md). For the visual design and usability principles, see [DESIGN.md](DESIGN.md).

**Stack:** Vite 8, TypeScript 5.9, Vue 3, Leaflet 1.9 (`CRS.Simple`), Yjs, Hocuspocus 4 and SQLite (`node:sqlite`). Tests use Vitest and Playwright. Node ≥ 22.18 is required.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite on :5173 (with `/api` and `/collab` proxied) plus the sync server on :1234 in watch mode |
| `npm run typecheck` | `vue-tsc` over client, shared and server code |
| `npm test` | Unit tests (Vitest): map pipeline, plan model, line-up and match roles, point rules, server access rules, nations and territories, geometry, coordinates, i18n, limits |
| `npm run test:e2e` | Browser tests (Playwright) against the dev server. Set `E2E_BASE_URL` to test a running production build; that build needs `VITE_E2E=1` |
| `npm run build` | Typecheck, static build into `dist/`, then Brotli/gzip precompression |
| `npm start` | Production server: serves `dist/`, the API and the websocket. Node runs the TypeScript directly |
| `npm run preview` | `build` + `start` |
| `npm run backup` | Consistent SQLite backup into `server/data/backups/` |
| `npm run map:build` | Regenerates `public/data/provinces.json` (and seeds `nations.json`) from the files in `sources/` |

Locally the server stores its data in `server/data/` (git-ignored). `npm run dev` and `npm start` read `.env` if it exists (e.g. `ADMIN_PASSWORD` for `/admin`); variables already set in the shell take precedence. Restart the dev server after changing `.env`.

## Making changes

1. **Develop.** Run `npm run dev`. A running Docker deployment isn't affected: the tunnel setup publishes no ports, and Caddy uses 80/443.
2. **Check.** Run `npm run typecheck`, `npm test` and `npm run test:e2e`. After server changes, also test rooms, joining and sync by hand in two browser windows.
3. **Version and commit.**
   - Raise `version` in `package.json` for noticeable changes. Testers see it in the help dialog, and it's attached to crash reports.
   - Commit, so every deploy matches a commit you can return to.
4. **Deploy.** Make a backup, then rebuild only the app (see [README](README.md#updating-after-changes) / [DEPLOY.md](DEPLOY.md#updating)). Deploy when few people are online (`/api/admin/stats`), and ask testers to reload. Open tabs keep the old client, which can fail when it lazy-loads a chunk that the rebuild replaced.
5. **Roll back if needed.**
   - Code: `git checkout <previous-commit>` (or `git revert`), then rebuild.
   - Damaged plan data: restore a backup (see [DEPLOY.md](DEPLOY.md#backups)).

### Changes that need care

- **Plan schema** ([shared/schema.ts](shared/schema.ts)). Stored plans keep their old shape. When you rename or remove fields, old rooms must still load. Treat missing fields as defaults, the way `ensureDefaults` does, and never assume a field exists.
- **The line-up document.** Each room's line-up is stored as a second document named `<room>:lineup`. Room deletion, the stale-room cleanup and eviction handle both names; keep it that way when adding per-room documents.
- **Playable nations** are the keys of `NATION_CLASS` ([shared/points.ts](shared/points.ts)). Their capitals are hand-edited in `nations.json` (`capital`, a province name), and a test checks that each one resolves.
- **The map SVG or `map:build`.** Province ids are the order of the paths in the SVG. If that order changes, existing planned conquests and ownership land on the wrong provinces.
- **Docker Compose project name.** Both compose files pin `name: cow`, the project name from when this folder was called `CoW`. The data volume is `cow_data`; without the pin, Compose would derive a new name from the folder and start with an empty volume.
- **Storage keys.** The app was called *CoW Planner* before. The localStorage keys (`cow-planner.*`), the IndexedDB names, the database file `cow-planner.sqlite` and the export-file id `app: "cow-planner"` keep the old name on purpose, so existing plans and export files keep working.
- **Server code runs with type stripping.** Only erasable TypeScript syntax is allowed: no parameter properties, enums or namespaces. Imports use `.ts` extensions.

## Project layout

```
sources/                    build inputs, not shipped:
  world_map_political.svg     source map (no ids; see "Map data")
  world_province_resources.csv resource production per province (input to map:build)
  world_nation_class.csv      point table of the conquest rules (mirrored in shared/points.ts, checked by tests)
scripts/                    build-map-data (SVG -> JSON), compress-dist, backup
public/data/                provinces.json (generated), nations.json (hand-edited)
shared/schema.ts            Yjs plan model + mutation helpers (schema v3: players), import/export
shared/lineup.ts            the line-up document: teams and player allotment, one player per nation
shared/match.ts             roles: class, team, player and colours per nation; point rules from them
shared/points.ts            conquest point rules: playable nations and classes, prices, per-nation sums
server/                     index (Hocuspocus wiring), auth (organizers, admin sessions, document access),
                            http (API, static files, headers), db (SQLite), limits, config, legal/
src/map/                    Leaflet + canvas rendering, no Vue
  createMap.ts              PlannerMap facade: panes, layers, tools, hover, pointer drags, follow view
  canvasLayer.ts            base for the padded, zoom-animated canvas layers
  baseLayer / markLayer / labelLayer / presenceLayer
  nations.ts                nation catalogue, current owners, territory labels
  provinceIndex.ts          grid index for hit-testing
  coords / geo / wrap       SVG <-> Leaflet coordinates, km estimate, wrap-around helpers
src/render/                 plan objects -> Leaflet layers, arrow geometry, icons, PNG export
src/tools/                  select, paint (plan / conquered / ping), path, place (+ range), measure
src/sync/                   planDoc (Y.Doc + IndexedDB + provider + undo), presence, rooms API, telemetry
src/state/                  per-viewer session state, feedback (toasts, confirm)
src/i18n/                   en.ts (defines the keys), de.ts, t()
src/ui/                     Vue components: Lobby, AdminPage (/admin), Planner, panels, dialogs
tests/                      Vitest unit tests; tests/e2e Playwright specs
```

**Data flow is one-way.**

- Yjs is the single source of truth.
- Tools and Vue panels write only through the `shared/schema.ts` helpers.
- Renderers watch the document and update only the Leaflet layers that changed.
- Vue components never touch Leaflet layers directly.

## How the plan is stored

There are two Yjs documents per room:

- **The plan** (named by the room id): meta, nations (neutral marking colours), players, layers, phases, objects, assignments (planned conquests) and ownership. Everyone with access edits it.
- **The line-up** (`<room>:lineup`, [shared/lineup.ts](shared/lineup.ts)): for each playable nation its team and player id. The server marks this connection read-only (Hocuspocus `connectionConfig.readOnly`) unless the client is an **organizer**, so other clients' updates are dropped server-side. Both documents share one websocket.

Organizers are the room's creator (owner token) and the admin (signed session from `ADMIN_PASSWORD`); see [server/auth.ts](server/auth.ts). Clients send `{pw, owner, admin}` as JSON in the Hocuspocus token; a bare string still counts as the password. Organizers also skip the room password.

- **Values.** Plan objects are plain JSON values in `Y.Map`s, so concurrent edits to the same object resolve as last-writer-wins.
- **Coordinates.** Coordinates are in SVG pixel space, so the stored data doesn't depend on Leaflet.
- **Server.** [server/index.ts](server/index.ts) stores each document and the room records in SQLite.
  - Room passwords are scrypt-hashed and checked when a client connects.
  - The room's creator gets an owner token (stored as a hash) that allows deleting the room.
- **Browser cache.** Every client also caches the room in IndexedDB. It opens instantly, keeps working offline, and edits merge when the connection returns.
- **Undo.** `Y.UndoManager` with `trackedOrigins` only reverts your own edits. Explicit checkpoints make each action exactly one undo step. The line-up has its own UndoManager; its edits offer Undo in their toasts.
- **What isn't shared.** Tool choice, selection, hidden layers and map style are per viewer ([src/state/session.ts](src/state/session.ts)).
- **Presence.** Cursors, current tools, views (for following) and pings use the Yjs awareness protocol and are never stored ([src/sync/presence.ts](src/sync/presence.ts)).
- **Older plans.** Schema v1 plans lose their player assignments on import, because v1 players had no nation. Drawings are kept. Schema v2 kept players as nicknames on roster nations: `legacyLineup` turns them into players and line-up slots (teams start unassigned, as v2 only had a yes/no team flag). Imports do this directly; existing rooms are converted once, by the first organizer who opens them (`lineup.meta.legacyMigrated`). A browser that remembered its v2 nation continues as that nation's player.

## Map data

The SVG has `viewBox 0 0 13562 7000` and no ids. Province `<path>` *i* and city `<text>` *i* are paired by document order, and each fill colour is one original nation. [scripts/build-map-data.ts](scripts/build-map-data.ts) produces:

- **`provinces.json`:**
  - for each province: name, original nation, label point, area, ring and neighbours;
  - coastlines;
  - every land border, **tagged with the two provinces it separates**, so the client can redraw nation borders after conquests.
- **Production** from `sources/world_province_resources.csv`. Rows carry the game's own province ids, so they are matched by name and must sit exactly on the label point; the build fails on any mismatch. Each province gets `res` (food, metal, oil or none), `amount`, `core` and `city`. Manpower and money are not kept; money is only read to tell core land apart.
- **Core land and city kind** are derived, since the CSV has neither (`classifyProvinces`). Home provinces produce 600 money or 750/1,500/3,000/6,000 of their resource; non-core land produces a quarter (150, or 187/375/750/1,500). The 750 and 1,500 tiers are ambiguous and take the majority status of their same-nation land neighbours; islands without any use the three nearest same-nation provinces. Home-equivalent 6,000 = Doppelstadt, 3,000 = city.
  - Known gap: three Bhutan provinces share Hungary's colour in the SVG, so they count as Hungarian.
- **`nations.json`:** maps each colour to an English name, a German name (`de`) and a unique short code. The short code is the nation id in plans. The file is seeded from capital cities on the first run and **edited by hand after that**.

### Nations and conquests

- **Playable nations** are the 30 classed nations; all others are always AI. A playable nation without a player is AI too.
- **Players** sign up in the plan (`players`: name and wished nation). "Who am I" is a player id, remembered per room; my nation (`session.me`) follows from the line-up and updates live when an organizer changes it.
- **Roles** ([shared/match.ts](shared/match.ts)) combine line-up, players and colour choices. `MatchState` ([src/sync/match.ts](src/sync/match.ts)) recomputes them on change; Vue reads it through `useMatch()`.
- **Colours.** A nation's colour is its Call of War colour (the map file's fill, set on `MatchState` once map data is loaded). It is its player's colour and the colour of its planned conquests, and it can't be changed (the v2 `nations` marker colours are ignored). On the Teams map, `PlannerMap.displayColor` mutes nation colours in markings (planned conquests and drawings stored in a nation colour); neutral colours are shown as stored. New drawings default to the drawer's nation colour; generic drawings can use one of `NEUTRAL_COLORS` (enemy red, friendly blue, greys, white, black). Land fills for the four map modes and the AI greying come from `landFills` ([src/map/teamColors.ts](src/map/teamColors.ts)).
- Planned conquests (`assignments`) and ownership reference nation codes.
- **Points** ([shared/points.ts](shared/points.ts)): a planned conquest is priced by the holder's class (1/2/3: province 1/2/3, city 4/5/6; Doppelstädte count as cities). Half price for land that is not the holder's core land, and for retaking your own or a teammate's (same team, both with players) core land. A capital always costs 10. AI-held land is free. An achieved conquest is priced as taken from its original owner. The daily allowance is `meta.dailyPoints` and travels with JSON exports.
- Ownership recolours provinces with the owner's colour (in the Teams mode: its team's). Nation borders and territory labels (placed at the medoid of a nation's provinces) are recomputed from the current owners.

## Rendering

- **Coordinates.** Leaflet uses `CRS.Simple` with `latLng(-y, x)` ↔ SVG `(x, y)`.
- **Province canvas layers.** Provinces are drawn by custom canvas layers instead of 3,000 `L.polygon`s. Because the CRS is linear, each redraw sets one affine transform and refills cached `Path2D`s.
- **Canvas size.** Canvases are padded beyond the viewport and repaint mid-pan once the pan leaves the area they cover.
- **Hit-testing** uses a grid index over province bounding boxes.

### Wrap-around

The map is a cylinder. Its left edge (Alaska) and right edge (Chukotka) meet at the Bering Strait.

- **World copies.** Every layer draws the world copies around the view: canvases, labels and plan objects. Plan-object copies are recomputed only when the set of nearby copies changes.
- **Folding back.** After each move the view folds back into the canonical world (`x ∈ [0, width)`). This is skipped while a pointer is down, so it never interrupts a drag.
- **Storing objects.** New objects are stored with their first point inside the world, so an arrow across the seam keeps continuous coordinates. Hit-testing, cursors and pings use wrapped coordinates, and flights go to the nearest copy.
- **Why not `worldCopyJump`.** Leaflet's built-in option was tried and dropped: it jumps the map pane mid-drag, which left the canvases blank.

Helpers: [src/map/wrap.ts](src/map/wrap.ts).

### Distances

- **The fit.** The game map is close to a Mercator projection, fitted from about 20 cities (`R = 2250` units, equator at `y = 4236`). One unit is `6371 / 2250 · cos(lat)` km, which is accurate to about ±35%.
- **Calibration.** A plan-wide factor in `meta.distanceFactor` corrects estimates. Range circles store their radius in map units and display it in km.

Code: [src/map/geo.ts](src/map/geo.ts).

## Languages

- **Messages.** They live in [src/i18n/en.ts](src/i18n/en.ts), which defines the keys, and [src/i18n/de.ts](src/i18n/de.ts). TypeScript rejects a missing German key, and a unit test checks that both languages use the same placeholders.
- **`t(key, params)`.** It fills `{name}` placeholders and picks `one|many` plural forms. Template-literal keys need `as const`.
- **Status-bar hints.** They are stored as message keys, so they re-translate when the language changes.
- **Names.**
  - Nation names come from `nations.json`, and search finds a nation in either language.
  - City names come from the map file and are not translated.
  - Names created inside a plan (the default layer, room titles) follow the language of whoever created them.

## Server

[server/http.ts](server/http.ts) handles the API and static files; [server/index.ts](server/index.ts) wires up Hocuspocus.

| Endpoint | Purpose |
|---|---|
| `GET /api/rooms` | Every room with title, password flag, last activity and players online (the lobby list) |
| `POST /api/rooms`, `GET /api/rooms/:id`, `DELETE /api/rooms/:id` | Create (rate-limited) and look up rooms; delete with the owner token or an admin session |
| `POST /api/admin/login`, `GET /api/admin/session` | Admin login with `ADMIN_PASSWORD` (rate-limited) → a signed 30-day session; whether login is enabled and a session still valid |
| `GET /api/admin/rooms`, `POST /api/admin/rooms/delete` | Room management (admin): every room with its content ([server/roomStats.ts](server/roomStats.ts): players, seated, planned, drawings, conquered, bytes, `empty`), and deleting a list of rooms |
| `POST /api/client-errors` | Automatic crash reports |
| `GET /api/legal/:page?lang=` | Impressum and Datenschutz from `server/legal/` |
| `GET /api/admin/{errors,stats}` | Read-outs, require `Authorization: Bearer $ADMIN_TOKEN` (or an admin session) |
| `/collab` | Hocuspocus websocket. `onUpgrade` caps connections per IP, `onAuthenticate` checks the room, password and organizer credentials, and makes the line-up read-only for non-organizers |
| `/healthz`, `/robots.txt` | Health check, crawler rules |

- **Last activity** of a room is the newer change of its plan and its line-up; the lobby, the room management and the automatic cleanup all use it.
- **Room content** for the management page is read from the live document when the room is open, else decoded from storage, and cached per room until it changes.
- **Deleting a room** broadcasts a stateless `room-deleted` message before closing connections. Hocuspocus's `closeConnections` alone leaves the socket open, so clients wouldn't notice.
- **Debugging.** Dev builds and builds with `VITE_E2E=1` expose `window.__cow` (planner, plan, lineup, match, session, presence) for debugging and the e2e tests.

## Technical notes

- **TypeScript 5.9.** It's pinned because `vue-tsc` does not support TypeScript 7 yet.
- **`node:sqlite`.** It's still flagged experimental. The scripts silence its warning with `--no-warnings=ExperimentalWarning`.
- **Leaflet layer options.** Leaflet ignores options passed to `super()` in ES classes, so custom layers call `L.Util.setOptions(this, …)`.
- **Hocuspocus auth failures** only report "permission-denied", so the client treats them as a wrong password.

## Roadmap

| Milestone | Contents | State |
|---|---|---|
| M0 Map viewer | Province map, hover/select, neighbours, zoom-aware labels, search | ✅ |
| M1 Planning tools | Planned conquests, arrows, fronts, zones, units, objectives, range circles, text; layers, phases; undo/redo; import/export | ✅ |
| M2 Real-time | Lobby, rooms and share links, optional passwords, live sync, presence, cursors, pings, nation roster with nicknames, ownership painting | ✅ |
| M3 Polish and deploy | Measure tool and calibration, range circles in km, follow a player, PNG export, room deletion, feedback and crash reports, legal pages, server hardening, Docker | ✅ |
| M4 Mobile | Bottom sheet, touch gestures, PWA | designed |
| M5 Organized matches | Axis/Allies line-up with player allotment and wishes, organizer rights (creator, admin) enforced by the server, admin login and room management, Teams map mode with player names, capitals and plan tags, legend, nation overview by team, reworked point rules (3 classes, half price, capitals) | ✅ |

Ideas that were dropped: room chat (not needed) and Leaflet-Geoman (custom tools keep the one-way data flow).

### M4: mobile

**Already in place**, so phones won't need a rewrite:

- **Pointer events.** Tool drags track `pointermove`/`pointerup` at document level, following only the finger that started them.
- **Touch starts drags.** Browsers send a finger's `mousedown` only after it lifts, so `adaptTouch` in [createMap.ts](src/map/createMap.ts) sends Leaflet one on `touchstart` (after Leaflet's touch panning has claimed the gesture) and drops the browser's late one. The map keeps `touch-action: none`, so the browser never takes over a paint stroke.
- **Two fingers pinch.** A second finger during a tool drag cancels and undoes it; Leaflet's pinch then zooms and pans. This replaces "hold Space" on touch screens.
- **Taps are clicks.** Long-press pings in the select tool (instead of Alt+click); the paint tools ignore it.
- **Buttons for keys.** Drawings in progress get Done, Undo point and Cancel in the options bar (Enter, Backspace, Esc); the paint tools get a Province / Territory switch (Shift+click).
- **No hover-only information.** The province panel shows everything the hover tooltip does; touch screens get no tooltip.
- **Bottom sheet.** Below 720 px the panels sit in a sheet under the map ([Planner.vue](src/ui/Planner.vue)): just its bar with the status hint, half the screen, or nearly all of it. Tap the bar to open or close it, swipe it up or down a step; selecting something in the select tool opens it halfway. The map row takes the rest, and `PlannerMap` follows its size with a `ResizeObserver`.
- **Touch wording.** On `(hover: none) and (pointer: coarse)` ([device.ts](src/state/device.ts)), `t()` prefers a `<key>.touch` message when one exists, so hints, tool help and tips say tap, long-press and two fingers. Key badges are hidden, and the help dialog lists gestures instead of shortcuts.
- **Touch targets.** 44 px controls in the lobby, password gate, identity dialog and map chrome, 40 px icon buttons, 24 px edit handles, and native `<select>` pickers. Fields use 16 px text so iOS doesn't zoom into them.
- **Phone viewport.** `100dvh` and `viewport-fit=cover` with safe-area padding.

**Still to build:**

1. **Thumb-reach tool palette** at the bottom edge, with the options bar as a second row above it (if players ask for it; the top strip fits 390 px).
2. **Initial view on tall screens:** start zoomed to the height of the world instead of its width, so a portrait phone shows no empty band above and below.
3. **Performance:** lower canvas padding and devicePixelRatio caps on low-end devices, no province borders below a zoom threshold, and fewer label redraws during pinch.
4. **PWA:** a manifest and a service worker that caches the app and map data. Rooms already cache in IndexedDB.
