# War Room

A shared strategy map for **Call of War: Supremacy 1942**. Your coalition opens one room and plans together, live:

- **Planned conquests:** who should take which province.
- **Ownership:** which provinces are already conquered.
- **Drawings:** attack arrows, fronts, zones and unit markers on the real 3,159-province world map.
- **Phases:** step through the plan phase by phase.

Built with Vite, TypeScript, Vue 3, Leaflet, Yjs and Hocuspocus. See [PLAN.md](PLAN.md) for the roadmap (including the mobile design) and [DESIGN.md](DESIGN.md) for the visual design and the usability principles behind the interface.

## Status

| Milestone | Contents | State |
|---|---|---|
| M0 Map viewer | Province map, hover/select, neighbours, zoom-aware labels, search | ✅ |
| M1 Planning tools | Planned conquests, arrows, fronts, zones, units, objectives, range circles, text; layers, phases; undo/redo; import/export | ✅ |
| M2 Real-time | Lobby, rooms and share links, optional passwords, live sync, presence, cursors, pings, nation roster with nicknames, ownership painting | ✅ |
| M3 Polish and deploy | Measure tool (≈ km, travel time, calibration), range circles in km, follow a player, PNG export, room deletion, feedback and crash reports, legal pages, server limits and hardening, Docker/Caddy | ✅ |
| M4 Mobile | Bottom sheet, touch gestures, PWA (see PLAN.md) | designed |

## Getting started

```sh
npm install
npm run dev          # web on http://localhost:5173 + sync server on :1234
```

Open the app, create a room in the lobby and share the link. **Work offline** opens a plan that is stored only in your browser.

| Script | What it does |
|---|---|
| `npm run dev` | Vite (with `/api` and `/collab` proxied) plus the sync server in watch mode |
| `npm run build` | Typecheck, static build into `dist/`, then Brotli/gzip precompression |
| `npm start` | Production: one Node process serves `dist/`, the API and the websocket (Node ≥ 22.18 runs the TypeScript directly) |
| `npm run backup` | Consistent SQLite backup into `server/data/backups/` |
| `npm start` | Production: one Node process serves `dist/`, the room API and the websocket |
| `npm run map:build` | Regenerates `public/data/provinces.json` from `world_map_political.svg` |
| `npm test` | Unit tests (Vitest): pipeline, plan model, nations and territories, geometry |
| `npm run test:e2e` | Browser tests (Playwright). Set `E2E_BASE_URL` to test a production build (built with `VITE_E2E=1`) |

The server reads two environment variables: `PORT` (default `1234`) and `DATA_DIR` (default `server/data`, which holds `cow-planner.sqlite`).

**Deploying for testers:** see [DEPLOY.md](DEPLOY.md) (Docker Compose with Caddy, HTTPS, backups, reading feedback).

## Measuring

- **Measure (`M`)** shows approximate kilometres and, with a speed set, the travel time ("≈ 860 km · 39 h").
- **How distances are estimated.** The game map is close to a Mercator projection (fitted from ~20 cities) but stylised, so estimates are within about ±35%.
- **Calibration.** Measure a known distance (for example from the game's travel display), then click **Calibrate…**. The correction applies to the whole plan and can be undone.
- **Range circles** show and edit their radius in km.

## Nations, players and conquests

- **Nations and players.** The plan's roster lists the **nations** in your game. A nation gets a **nickname** when a teammate plays it; AI nations keep it empty. Each roster nation has a bright marker colour for its plans.
- **Who you are.** Everyone picks the nation they play when they join a room. This is remembered per room, and you can change it with the chip in the top bar.
- **Plan conquests (`P`).** Hatches provinces in the marker colour of the nation that should take them. Once that nation holds a province, the hatch becomes a dashed outline, and the roster shows progress such as `3/7`.
- **Mark as conquered (`C`).** Records the province's current owner. The province takes the conqueror's map colour, and nation borders and nation labels follow the new territory. You can also do this from the province panel: **Held by**.

## How the plan is stored

Everything shared lives in one Yjs document per room ([shared/schema.ts](shared/schema.ts)): nations, layers, phases, drawings, planned conquests and ownership.

- **Server.** The sync server ([server/index.ts](server/index.ts)) stores each document and the room records in SQLite. Room passwords are scrypt-hashed and checked when a client connects.
- **Browser cache.** Every client also caches the room in IndexedDB. It opens instantly, keeps working offline, and edits merge when the connection returns.
- **Undo.** Undo only reverts your own edits.
- **What isn't shared.** Tool choice, selection, hidden layers and map style are per viewer ([src/state/session.ts](src/state/session.ts)).
- **Presence.** Cursors, current tools and pings use the Yjs awareness protocol and are never stored ([src/sync/presence.ts](src/sync/presence.ts)).

## Map data

The SVG has no ids. Province `<path>` *i* and city `<text>` *i* are paired by document order, and each fill colour is one 1942 nation. [scripts/build-map-data.ts](scripts/build-map-data.ts) produces the following:

- **`provinces.json`**:
  - for each province: name, 1942 nation, label point, area, ring and neighbours.
  - coastlines, plus every land border **tagged with the two provinces it separates**, so the client can redraw nation borders after conquests.
- **`nations.json`**: maps each colour to a nation name and a unique short code (the nation id in plans). It is seeded from capital cities on the first run and **edited by hand after that**.

## Languages

German is the default; English can be chosen in the lobby (top right) or in the **View** panel. The choice is remembered per browser and switches the whole UI live, without a reload.

- **Messages** live in [src/i18n/en.ts](src/i18n/en.ts), which defines the keys, and [src/i18n/de.ts](src/i18n/de.ts). TypeScript rejects a missing German key, and a unit test checks that both languages use the same placeholders.
- **`t(key, params)`** fills `{name}` placeholders and picks `one|many` plural forms. Status-bar hints are stored as message keys, so they re-translate when the language changes.
- **Nation names** come from `nations.json` (`name` in English, `de` in German). They are used on map labels, in pickers and in tooltips, and search finds a nation in either language. City names come from the map file and are not translated.
- **Names inside a plan** follow the language of whoever created them, for example the default layer ("Allgemein"/"General") or a room title. They're shared data, not UI.

## Wrap-around

The map is a cylinder. Its left edge (Alaska) and right edge (Chukotka) meet at the Bering Strait, so you can pan from Asia across the Pacific to America.

- **Drawing the copies.** Every layer draws the world copies around the view: the canvases, the labels, and plan objects (whose copies are recomputed only when the set of nearby copies changes).
- **Mid-pan repaints.** Canvases and SVG overlays repaint as soon as a pan leaves the area they cover.
- **Folding back.** After each move the view folds back into the canonical world (`x ∈ [0, width)`). This is invisible, but it's skipped while a pointer is down, so it never interrupts a drag.
- **How things are stored.**
  - New objects are stored with their first point inside the world, so an arrow from Kamchatka to Alaska keeps continuous coordinates across the seam.
  - Hit-testing, cursors and pings use wrapped coordinates.
  - Flights, cursors and pings go to the copy nearest the view.

Helpers: [src/map/wrap.ts](src/map/wrap.ts).

## Layout

```
scripts/build-map-data.ts   SVG -> JSON pipeline
shared/schema.ts            Yjs plan model + mutation helpers (schema v2)
server/                     index (Hocuspocus wiring), http (API, static, headers), db (SQLite), limits, config, legal/ templates
src/map/                    Leaflet + canvas rendering (no Vue)
  createMap.ts              PlannerMap facade: panes, layers, tools, hover, pointer drags
  nations.ts                Nation catalogue, current owners, territory labels
  baseLayer.ts / markLayer.ts / labelLayer.ts / presenceLayer.ts
src/render/                 Plan objects -> Leaflet layers (arrow geometry, unit/objective icons)
src/tools/                  select, paint (plan/own), path, place, range, ping
src/sync/                   planDoc (Y.Doc + IndexedDB + provider + undo), presence, rooms API client
src/state/                  Per-viewer session state, toasts/confirm
src/ui/                     Vue components (Lobby, Planner, panels, dialogs)
tests/                      Vitest unit tests, tests/e2e Playwright
```

## Notes

- The app was called *CoW Planner* before. The internal storage keys (`cow-planner.*` in localStorage and the IndexedDB names) and the export-file id `app: "cow-planner"` keep the old name on purpose, so existing local plans and older export files keep working.
- TypeScript is pinned to 5.9 because `vue-tsc` does not support TypeScript 7 yet.
- `node:sqlite` needs Node 22.5 or newer. The scripts silence its "experimental" warning.
- Plans saved with schema v1 lose their player assignments: v1 players had no nation, so they can't be mapped. Drawings are kept.
- Dev builds expose `window.__cow` (planner, plan, session, presence) for debugging and the e2e tests.
