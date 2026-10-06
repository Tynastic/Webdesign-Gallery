# War Room: a shared strategy map for Call of War 1942

## Context
You want a web app where you and your coalition plan Call of War: Supremacy 1942 strategy together on the real game map. The only asset so far is `designs/CoW/world_map_political.svg`. What it contains:

- `viewBox 0 0 13562 7000`, plus one ocean `<rect fill="#a9c6d6">`.
- **3,159 `<path>`** provinces. Each is one polygon with `M…L…Z` coordinates (~99k vertices in total), filled with one of **72 nation colours**.
- **3,159 `<text>`** city labels. They come in **the same order as the paths**: path #0 (Palma) is paired with text #0 "Palma" at its centroid.
- There are **no ids or classes**, and a 2 MB C2PA `<metadata>` blob that should be stripped.

Decisions you made: **real-time collaboration**, **own server/VPS**, **Vite + TypeScript**.

---

## 1. Features

### A. Map basics (M0)
- Pan and zoom the world map. Provinces stay sharp at every zoom level.
- Hovering a province highlights it and shows a tooltip with the city name and its starting nation. Clicking it selects it and opens an info panel.
- City labels appear by zoom level. Only the large ones show when zoomed out, and overlapping labels are hidden.
- A search box with fuzzy matching on province name flies to the result and selects it.
- Layer switches: nation colours, labels, borders, and planning layers.

### B. Planning tools (M1)
These are the core of the app. Every tool uses the current player's colour by default.

| Tool | Purpose in CoW |
|---|---|
| **Attack/move arrow** | Curved arrow with an arrowhead, made of 2+ points. Solid means attack, dashed means move or retreat. Optional label such as "Day 4". |
| **Front line** | Thick polyline, optionally with a teeth/hatch style. |
| **Zone** | Semi-transparent polygon for defence areas, target regions or no-go zones. |
| **Unit marker** | Icon for infantry, armour, artillery, AA, air, naval or a mixed stack. Carries a count/strength label and a player colour. |
| **Objective marker** | Flag, star, crosshair or skull, plus a short title. |
| **Range circle** | Ring for aircraft or artillery range around an airfield or unit. Takes a radius in map units and can be calibrated later. |
| **Text note** | Free text placed on the map. |
| **Freehand** | Quick scribble that you can delete or let fade out. |
| **Ping** | Alt+click (or the ping tool). Shows an animated pulse to everyone and leaves no persistent object. |
| **Measure** | Distance between points, in map units or in km after you calibrate it with two known cities. |

Shared tool behaviour:
- Select, move, edit vertices and delete.
- Change the style (colour, width, dash) and lock an object.
- Undo/redo per player, which only undoes your own edits.

### C. Organisation (M1)
- **Layers**: named, coloured and toggleable. Examples: "Axis attack plan", "Defence", "Intel".
- **Phases**: tag objects with a phase such as "Day 1–3" or "Day 4–6". A phase slider or stepper shows the plan unfolding over time. "All phases" shows everything.
- **Province ownership painting** (M3): paint provinces with the colour of a faction or player to track the real front as it moves. A bucket fill applies this to all provinces of one starting nation.
- **Export/import**: export to and import from JSON as a backup. Export a PNG snapshot of the current view to share in the game chat.

### D. Collaboration (M2)
- **Rooms**: one per game or coalition. You join through an unguessable link (`/r/<nanoid>`) and can add an optional room password.
- **Identity**: no accounts. A player enters a display name and picks a colour, and both are saved in localStorage.
- **Presence**: a list of players online, live cursors showing names, and each player's current tool.
- **Live sync**: every object, layer, phase and ownership change syncs live. It is conflict-free, works offline and catches up on reconnect.
- **Persistence**: the server stores each room. Restarting the server loses nothing.
- **Nice to have** (M3): a small room chat or comments attached to objects, and a "follow player" view that mirrors someone else's camera.

---

## 2. Design

### Coordinate system and rendering
- Leaflet uses **`L.CRS.Simple`** with SVG pixel coordinates mapped to `latLng(-y, x)`.
- The bounds are `[[-7000,0],[0,13562]]`.
- Zoom runs from about `-6` (whole world) to `+2`.
- Provinces are drawn as **`L.polygon`s on one shared `L.canvas` renderer** (`preferCanvas`). This handles 3k polygons and 100k vertices smoothly. Fill colours can be changed at runtime, which ownership painting needs, and hit-testing works for hover and click.
- Labels are drawn by a **custom canvas `L.Layer`**. It draws only labels inside the viewport and hides colliding labels with a screen-space grid. Each label gets a zoom threshold from its province's area, so large provinces appear first.
- Planning objects go on a **separate SVG renderer pane** above the provinces so they stay crisp and are easy to style. Arrows are generated geometry: a Catmull-Rom/Bezier spline through the control points plus an arrowhead polygon.

### Map data pipeline (build time)
`scripts/build-map-data.ts`, run with `tsx`:
1. Parse the SVG with `fast-xml-parser` and drop `<metadata>`.
2. Zip paths[i] with texts[i] to get `{id: i, name, nationColor, labelXY, ring: [[x,y]...], bbox, area}`.
3. Check the pairing: each label point must lie inside its polygon (point-in-polygon test). Log any mismatches.
4. Write `public/data/provinces.json` (rounded integer coordinates, about 1 MB, served gzipped) and a `nations.json` skeleton keyed by colour (`"rgb(196,101,87)": {name: "?", short: "?"}`). You then fill in the names for the 72 colours by hand once.
5. Province ids are the stable index. The pipeline also writes a content hash so a changed SVG can be detected.

### Shared state model (one Yjs doc per room)
```
meta:      Y.Map   { title, createdAt, calibration? }
players:   Y.Map   id -> { name, color }                 (registry for authorship)
factions:  Y.Map   id -> { name, color }
layers:    Y.Map   id -> { name, color, order, visible }
phases:    Y.Array [{ id, name }]
objects:   Y.Map   id -> Y.Map {
             type: arrow|front|zone|unit|objective|circle|text|freehand|measure,
             layerId, phaseId?, points: [[x,y]...], radius?,
             style: { color, weight, dash, fillOpacity },
             label?, icon?, unitType?, count?, author, createdAt, locked }
ownership: Y.Map   provinceId -> factionId
chat:      Y.Array [{ author, text, ts }]                (M3)
```
- **Awareness** (temporary, never stored) holds `{ name, color, cursor:[x,y], tool, viewport, ping? }`.
- Coordinates are stored in SVG pixel space, not lat/lng, so the stored data doesn't depend on Leaflet.
- Undo uses `Y.UndoManager`, scoped to the local client's origin.

### UI layout
```
┌───────────────────────────────────────────────────────────────┐
│ Room title · share link · online avatars · search    ⚙        │
├────┬──────────────────────────────────────────────┬───────────┤
│Tool│                                              │ Layers    │
│bar │                 Leaflet map                  │ Phases    │
│ ↗  │      (provinces · labels · plan objects ·    │ Selected  │
│ ━  │        cursors · pings)                      │ object /  │
│ ▢  │                                              │ province  │
│ ⚑  │                                              │ inspector │
│ ◎  │                                              │ (Chat M3) │
│ T  │   ─── phase stepper  ◀ Day 1–3 ▶ ───         │           │
└────┴──────────────────────────────────────────────┴───────────┘
```
- Dark, military-map style chrome around the colourful map.
- Keyboard shortcuts: `V` select, `A` arrow, `F` front, `Z` zone, `U` unit, `O` objective, `R` range, `T` text, `P` ping, `M` measure, Ctrl+Z/Y, Del.
- On a phone you can view and ping, and the side panels collapse into drawers.

---

## 3. Technologies

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** (strict) | Your choice. Produces a static `dist/` that the server serves. |
| Map | **Leaflet 1.9** with `CRS.Simple` | Your choice. Handles a non-geographic map with pixel coordinates. |
| Drawing/editing | **Leaflet-Geoman (free)** for vertex editing, dragging and removal. Custom tools for arrows, units and range circles. | A tested editing UX, so we don't build vertex handles ourselves. |
| UI panels | **Vue 3** (Composition API, `<script setup lang="ts">` SFCs, `@vitejs/plugin-vue`, `vue-tsc`) | Short code for panels and forms, with first-class Vite support. Shared state stays in Yjs, so there is no Pinia. Leaflet objects are kept non-reactive (`markRaw`/`shallowRef`), and `@vue-leaflet` is not used. |
| Realtime/CRDT | **Yjs** + **@hocuspocus/provider** | Conflict-free merging, offline catch-up, built-in awareness (cursors) and undo. |
| Server | **Node 22 + @hocuspocus/server** and **@hocuspocus/extension-sqlite**, using `onAuthenticate` for room passwords | A ready-made WebSocket server that persists each room's Yjs document. |
| Storage | **SQLite** in a file inside a Docker volume | No database to manage on a VPS. Backing up means copying the file. |
| SVG preprocessing | **fast-xml-parser** + **tsx** script | Runs once at build time. The output is committed so the build is reproducible. |
| Fuzzy search | **Fuse.js** | Matches 3k province names instantly. |
| PNG export | **leaflet-image** or `html-to-image` on the map container | Produces screenshots to share in the game. |
| Tests | **Vitest** (pipeline, geometry, Yjs model ops) + **Playwright** (two-browser sync test) | |
| Deploy | **Docker Compose**: `app` (Node: serves `dist/` + `/collab` WS) behind **Caddy** (automatic HTTPS) | One `docker compose up -d` on the VPS. |
| Lint/format | ESLint + Prettier | |

---

## 4. Project structure (`designs/CoW/`)
```
designs/CoW/
  world_map_political.svg          source asset (unchanged)
  package.json  tsconfig.json  vite.config.ts  index.html
  scripts/build-map-data.ts        SVG -> provinces.json
  public/data/provinces.json       generated
  public/data/nations.json         colour -> nation name (hand-curated)
  public/icons/units/*.svg         unit/objective icons
  shared/schema.ts                 types + Yjs doc accessors (used by client & server)
  src/main.ts
  src/map/   createMap.ts  provinceLayer.ts  labelLayer.ts  coords.ts
  src/tools/ toolManager.ts  arrowTool.ts  unitTool.ts  rangeTool.ts  pingTool.ts  measureTool.ts …
  src/render/ objectRenderer.ts (Y.Map -> Leaflet layer, diff-based)  arrowGeometry.ts
  src/sync/  provider.ts  awareness.ts  cursorsLayer.ts  undo.ts
  src/composables/ useMap.ts (owns the Leaflet instance, markRaw)  useYMap.ts / useYArray.ts (Yjs -> shallowRef)  useAwareness.ts  useTool.ts
  src/ui/    App.vue  Toolbar.vue  LayersPanel.vue  PhaseStepper.vue  Inspector.vue  JoinDialog.vue  PresenceBar.vue
  server/index.ts                  Hocuspocus + static file serving
  Dockerfile  docker-compose.yml  Caddyfile  README.md
```
This is one npm package with `dev` (Vite + server run together), `build`, `map:build`, `test` and `start` scripts. Rendering is one-way: Yjs is the single source of truth, `objectRenderer` watches `objects` and updates only the Leaflet layers that changed, and tools only ever write to Yjs. Vue components read Yjs through the `useY*` composables and write through the `shared/schema.ts` helpers. They never touch Leaflet layers directly.

---

## 5. Milestones

> **Status (2026-10-06):** M0–M3 are done; the app is ready for a public test (see DEPLOY.md). Changes from the original plan:
> - **No Leaflet-Geoman.** Drawing and vertex editing are custom (`src/tools/`). This keeps one-way data flow (tools write to Yjs, renderers read from it).
> - **Plan objects are plain JSON values in Yjs maps**, not nested Y.Maps. Concurrent edits to the same object resolve as last writer wins.
> - **Provinces are drawn by custom canvas layers** instead of `L.polygon`s.
> - **Nations replace free-form players.** Each nation in the plan can carry a player nickname; an empty nickname means an AI or unclaimed nation. Planned conquests, ownership and "who am I" all reference nation codes (schema v2).
> - **Ownership painting moved from M3 into M2.** Marking a province as conquered recolours it and moves nation borders and labels.
> - **Renamed to War Room; German UI by default, English optional** (typed i18n module, no library).
> - **The map wraps horizontally** (added after M2). The canvas layers, labels and plan objects draw neighbouring world copies, and the view folds back into the canonical copy after moves. Leaflet's `worldCopyJump` was tried and dropped: it jumps the map pane mid-drag, which left the canvases blank until the drag ended.
> - **SQLite comes from `node:sqlite`** (built into Node 22) with `@hocuspocus/extension-database`, so there is no native module to compile.

1. **M0 – Map viewer** ✅
   - Pipeline script, nation names, province hover/click, label layer and search.
2. **M1 – Planning tools** ✅
   - Tool framework; arrow, front, zone, unit, objective, text and range tools.
   - Planned conquests, layers, phases, undo/redo and JSON import/export.
3. **M2 – Real-time** ✅
   - Hocuspocus server with SQLite, a lobby, rooms with share links and an optional password.
   - Presence avatars, live cursors and pings.
   - The nation roster with player nicknames.
   - Ownership painting ("already conquered").
4. **M3 – Polish and deploy** ✅
   - **Features:**
     - Measure tool (≈ km from a fitted Mercator scale, travel time, plan-wide calibration) and range circles in km.
     - "Follow player" camera and PNG export with a legend.
     - Room chat was dropped at the user's request.
   - **Server:**
     - Owner-only room deletion, which notifies connected clients.
     - Inactive-room expiry.
     - Per-IP rate limits and connection caps.
     - Message, body and document size limits.
     - Security headers and CSP.
     - Precompressed static assets with ETags, `/healthz`, graceful shutdown and online backups.
   - **Test phase:**
     - Feedback dialog and automatic crash reports, readable through `/api/admin/*`.
     - Impressum and Datenschutz templates.
     - "Test version" badge with the build version.
   - **Deploy:** Dockerfile, plus docker-compose with Caddy (automatic HTTPS, optional closed-beta login), as described in DEPLOY.md.
5. **M4 – Mobile** (designed now, built later)

### M4 mobile design

Decisions already made so phones won't need a rewrite:
- **Drags use pointer events.** Tool drags (paint strokes, moving objects, vertex handles) track `pointermove`/`pointerup` at document level, so touch and pen work like a mouse.
- **Taps are clicks.** Leaflet turns a tap into `click`, so select, paint-click, place, path points and the ping tool already work with a finger. `tapHold` is on, so a long press fires `contextmenu`.
- **No hover-only information.** Everything in the hover tooltip is also in the province panel after a tap.
- **Touch-sized targets in new screens.** The lobby, password gate and identity dialog use 44 px controls, and pickers are native `<select>` elements (proper wheel and list pickers on iOS and Android).
- **Responsive shell.** Below 720 px the toolbar becomes a horizontal strip and the sidebar moves under the map, with no horizontal page scroll.

Still to build in M4:
1. **Bottom sheet** instead of the stacked sidebar: a peek height that shows the selection summary, drag up for panels, swipe down to close.
2. **Gestures**
   - Long-press means ping in the select tool and erase/restore in the paint tools (`contextmenu` already arrives).
   - While painting, two-finger pan/zoom; one finger paints, which replaces "hold Space".
   - Path tools get a "Done" button, because double-tap is unreliable and also zooms.
3. **Bigger edit handles** on coarse pointers (`@media (pointer: coarse)`): 24 px vertex handles and a larger hit tolerance for thin lines.
4. **Thumb-reach tool palette** at the bottom edge, with the tool options bar as a second row above it.
5. **Performance**
   - Lower canvas padding and devicePixelRatio caps on low-end devices.
   - Province borders skipped below a zoom threshold.
   - Fewer label redraws during pinch.
6. **Offline and PWA**: a manifest and a service worker that caches the app and map data. Rooms already cache in IndexedDB and merge when the connection returns.

## 6. Verification
- `npm run map:build`:
  - It must output 3,159 provinces and report 0 label/polygon pairing mismatches.
  - Spot-check that Palma, Murmansk and Helsinki are clickable in the right place.
- `npm run dev`:
  - Pan and zoom stay smooth from world view to city level.
  - Labels thin out correctly as you zoom out.
  - Search for "Helsinki" flies to it and selects it.
- **Sync test**:
  - Open the same room link in two browsers. Draw an arrow in A and it appears in B within about 100 ms. Move it in B and A updates.
  - Cursors and pings are visible to the other browser. Undo in A does not undo B's edits.
- **Persistence**: restart the server and reload, and the plan is still there. Take browser A offline, draw, reconnect, and the edits merge.
- **Automated tests**: `npm test` (Vitest: pipeline, arrow geometry, schema ops) and `npx playwright test` (two-context sync scenario).
- **Deployment**: `docker compose up` on the VPS. Check that HTTPS works and the WebSocket connects through Caddy.
