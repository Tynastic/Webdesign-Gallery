# Development notes

These notes are for working on the code. To use or deploy the app, see the [README](README.md); for hosting details, see [DEPLOY.md](DEPLOY.md). For the visual design and usability principles, see [DESIGN.md](DESIGN.md).

**Stack:** Vite 8, TypeScript 5.9, Vue 3, Leaflet 1.9 (`CRS.Simple`), Yjs, Hocuspocus 4 and SQLite (`node:sqlite`). Tests use Vitest and Playwright. Node ≥ 22.18 is required.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite on :5173 (with `/api` and `/collab` proxied) plus the sync server on :1234 in watch mode |
| `npm run typecheck` | `vue-tsc` over client, shared and server code |
| `npm test` | Unit tests (Vitest): map pipeline, plan model, nations and territories, geometry, coordinates, i18n, limits |
| `npm run test:e2e` | Browser tests (Playwright) against the dev server. Set `E2E_BASE_URL` to test a running production build; that build needs `VITE_E2E=1` |
| `npm run build` | Typecheck, static build into `dist/`, then Brotli/gzip precompression |
| `npm start` | Production server: serves `dist/`, the API and the websocket. Node runs the TypeScript directly |
| `npm run preview` | `build` + `start` |
| `npm run backup` | Consistent SQLite backup into `server/data/backups/` |
| `npm run map:build` | Regenerates `public/data/provinces.json` (and seeds `nations.json`) from the files in `sources/` |

Locally the server stores its data in `server/data/` (git-ignored).

## Making changes

1. **Develop.** Run `npm run dev`. A running Docker deployment isn't affected: the tunnel setup publishes no ports, and Caddy uses 80/443.
2. **Check.** Run `npm run typecheck`, `npm test` and `npm run test:e2e`. After server changes, also test rooms, joining and sync by hand in two browser windows.
3. **Version and commit.**
   - Raise `version` in `package.json` for noticeable changes. Testers see it in the help dialog, and it's attached to their feedback.
   - Commit, so every deploy matches a commit you can return to.
4. **Deploy.** Make a backup, then rebuild only the app (see [README](README.md#updating-after-changes) / [DEPLOY.md](DEPLOY.md#updating)). Deploy when few people are online (`/api/admin/stats`), and ask testers to reload. Open tabs keep the old client, which can fail when it lazy-loads a chunk that the rebuild replaced.
5. **Roll back if needed.**
   - Code: `git checkout <previous-commit>` (or `git revert`), then rebuild.
   - Damaged plan data: restore a backup (see [DEPLOY.md](DEPLOY.md#backups)).

### Changes that need care

- **Plan schema** ([shared/schema.ts](shared/schema.ts)). Stored plans keep their old shape. When you rename or remove fields, old rooms must still load. Treat missing fields as defaults, the way `ensureDefaults` does, and never assume a field exists.
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
shared/schema.ts            Yjs plan model + mutation helpers (schema v2), import/export
shared/points.ts            conquest point rules: nation classes, price table, per-nation sums
server/                     index (Hocuspocus wiring), http (API, static files, headers), db (SQLite),
                            limits, config, legal/ (Impressum and Datenschutz templates)
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
src/ui/                     Vue components: Lobby, Planner, panels, dialogs
tests/                      Vitest unit tests; tests/e2e Playwright specs
```

**Data flow is one-way.**

- Yjs is the single source of truth.
- Tools and Vue panels write only through the `shared/schema.ts` helpers.
- Renderers watch the document and update only the Leaflet layers that changed.
- Vue components never touch Leaflet layers directly.

## How the plan is stored

There is one Yjs document per room: meta, nations, layers, phases, objects, assignments (planned conquests) and ownership.

- **Values.** Plan objects are plain JSON values in `Y.Map`s, so concurrent edits to the same object resolve as last-writer-wins.
- **Coordinates.** Coordinates are in SVG pixel space, so the stored data doesn't depend on Leaflet.
- **Server.** [server/index.ts](server/index.ts) stores each document and the room records in SQLite.
  - Room passwords are scrypt-hashed and checked when a client connects.
  - The room's creator gets an owner token (stored as a hash) that allows deleting the room.
- **Browser cache.** Every client also caches the room in IndexedDB. It opens instantly, keeps working offline, and edits merge when the connection returns.
- **Undo.** `Y.UndoManager` with `trackedOrigins` only reverts your own edits. Explicit checkpoints make each action exactly one undo step.
- **What isn't shared.** Tool choice, selection, hidden layers and map style are per viewer ([src/state/session.ts](src/state/session.ts)).
- **Presence.** Cursors, current tools, views (for following) and pings use the Yjs awareness protocol and are never stored ([src/sync/presence.ts](src/sync/presence.ts)).
- **Older plans.** Schema v1 plans lose their player assignments on import, because v1 players had no nation. Drawings are kept.

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

- The plan's roster lists nations by short code. A nickname marks a nation that a teammate plays.
- Planned conquests (`assignments`), ownership and "who am I" all reference nation codes.
- Roster nations can be marked as **team** (`team`; unset = has a player). Team members' core land is priced as team core land.
- **Points** ([shared/points.ts](shared/points.ts)): a planned conquest is priced by the current owner's class, the land category (enemy core / enemy non-core / own or team core, from the province's original owner and `core`) and its kind. An achieved conquest is priced as taken from its original owner. The daily allowance is `meta.dailyPoints` and travels with JSON exports.
- Ownership recolours provinces with the owner's map colour. Nation borders and territory labels (placed at the medoid of a nation's provinces) are recomputed from the current owners.

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
| `POST /api/rooms`, `GET /api/rooms/:id`, `DELETE /api/rooms/:id` | Create (rate-limited) and look up rooms; delete with the owner token |
| `POST /api/feedback`, `POST /api/client-errors` | Tester feedback, automatic crash reports |
| `GET /api/legal/:page?lang=` | Impressum and Datenschutz from `server/legal/` |
| `GET /api/admin/{feedback,errors,stats}` | Read-outs, require `Authorization: Bearer $ADMIN_TOKEN` |
| `/collab` | Hocuspocus websocket. `onUpgrade` caps connections per IP, `onAuthenticate` checks the room and password |
| `/healthz`, `/robots.txt` | Health check, crawler rules |

- **Deleting a room** broadcasts a stateless `room-deleted` message before closing connections. Hocuspocus's `closeConnections` alone leaves the socket open, so clients wouldn't notice.
- **Debugging.** Dev builds and builds with `VITE_E2E=1` expose `window.__cow` (planner, plan, session, presence) for debugging and the e2e tests.

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

Ideas that were dropped: room chat (not needed) and Leaflet-Geoman (custom tools keep the one-way data flow).

### M4: mobile

**Already in place**, so phones won't need a rewrite:

- **Pointer events.** Tool drags track `pointermove`/`pointerup` at document level, so touch and pen work like a mouse.
- **Taps are clicks.** Leaflet turns taps into clicks, and `tapHold` makes a long press fire `contextmenu`.
- **No hover-only information.** The province panel shows everything the hover tooltip does.
- **Touch targets.** 44 px controls in the lobby, password gate and identity dialog, and native `<select>` pickers.
- **Responsive shell.** Below 720 px the toolbar becomes a horizontal strip and the sidebar moves under the map.

**Still to build:**

1. **Bottom sheet** instead of the stacked sidebar: a peek height with the selection summary, drag up for panels, swipe down to close.
2. **Gestures:**
   - long-press to ping in the select tool and to erase or restore in the paint tools;
   - two-finger pan and zoom while painting, replacing "hold Space";
   - a "Done" button for path tools, because double-tap is unreliable and zooms.
3. **Bigger edit handles** on coarse pointers (`@media (pointer: coarse)`): 24 px vertex handles and a larger hit tolerance for thin lines.
4. **Thumb-reach tool palette** at the bottom edge, with the options bar as a second row above it.
5. **Performance:** lower canvas padding and devicePixelRatio caps on low-end devices, no province borders below a zoom threshold, and fewer label redraws during pinch.
6. **PWA:** a manifest and a service worker that caches the app and map data. Rooms already cache in IndexedDB.
