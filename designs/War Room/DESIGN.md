# Design notes

This file covers how the map looks and which usability principles shape the interface. Each principle is tied to the place in the UI where it's applied, so you can check it there.

## Map look: a printed war map

The map is drawn by our own canvas layers (`src/map/baseLayer.ts`, `markLayer.ts`), not by 3,000 separate Leaflet polygons. CRS.Simple is linear, so each redraw sets one transform and refills cached `Path2D`s in SVG coordinates. That keeps redraws cheap enough for the effects below.

| Element | Treatment | Why |
|---|---|---|
| Ocean | Radial gradient from light to deep, with a faint 1000-unit grid | Gives the sea depth and a "chart" feel without distracting |
| Coasts | Two soft, wide light-blue strokes under the land, plus a thin dark coastline | Shallow-water halo; land reads as land at any zoom |
| Land | Four modes. **Vivid** and **Muted** (mixed 55% toward paper): the Call of War colours, so the map looks like the game. **Teams** (the default): Axis terracotta, Allies steel blue, each nation keeping a little of its own colour, a team nation without a player paler, playable nations without a team sand. **Off**: paper. **Grey out AI nations** (a toggle; choosing Teams switches it on, Vivid or Muted off) greys every nation without a player | The game's look for orientation; the sides at a glance in Teams; greying shows which nations are actually played |
| Borders | Three tiers: province (thin, fades out when zoomed far out), nation (dashed over a light underline), coast | Visual hierarchy: you can always tell which provinces belong together |
| Labels | Nation names in letterspaced serif caps when zoomed out, city names in sans with a paper halo when zoomed in, packed without overlaps. No player names on the map: colour tells who is who | Atlas convention. Labels stay readable on any fill |
| Capitals | Gold star with a dark outline, at every zoom level | They cost 10 points and decide wars: they must never be hidden |
| Cities | Dot for a city, double ring for a Doppelstadt, always drawn; their names are placed first, in bold, and in smaller provinces than others. Doppelstädte stay visible when zoomed far out | Atlas convention for settlement size. Cities are the provinces that matter most, so they win label collisions |
| Resources | A glyph in front of the name (wheat ear, ingot, drop) in the resource's colour with a paper halo, three sizes by production; same shapes in the tooltip, province panel and View-menu legend | Economic-atlas convention. Readable without hovering, and the size answers "how much" at a glance |
| Planned conquests | Tint, diagonal hatching that stays the same size on screen, and an inner outline, in the nation's Call of War colour (muted on the Teams map, so the team land stays in front); a dashed outline once conquered. Hatching and outline sit on a dark casing, and the dashes alternate with dark ones | One colour per nation everywhere: land, markings, player. The casing keeps markings readable on land of a similar colour, including the conqueror's own land once taken |
| Legend | A collapsible card in the map's bottom-right corner: team swatches (Teams mode), AI nations (when greyed), planned/achieved and capitals. The PNG export's footer names the players whose nations are in the exported view, in their colours | Recognition rather than recall; an exported image explains exactly what it shows |
| Drawings | In the drawer's nation colour by default (muted on the Teams map); generic ones in enemy red, friendly blue (the military-map convention) or a neutral grey, white or black. Tapered spline arrows with a broad head, barbed or double front lines, dashed zones, NATO-style unit frames | Uses the visual language players already know from war maps |

## Usability principles applied

**Nielsen's 10 heuristics**

1. **Visibility of system status**
   - The status bar always says what the active tool expects next ("Click to add point 2…").
   - The active tool is filled brass and the active phase chip is highlighted.
   - The options bar shows where new drawings go (`→ Layer · Phase`).
   - Undo and redo are disabled when there is nothing to undo or redo.
   - While planning conquests, the options bar shows the nation's running point total against the daily allowance and turns red when it is exceeded. The Points panel says by how much.
   - The splash screen shows progress while the map loads.
2. **Match with the real world**
   - Military map symbols (attack arrows, front lines, NATO unit frames) and game terms (provinces, nations, phases such as "Day 1–3").
3. **User control and freedom**
   - Undo and redo cover only your own edits (`Y.UndoManager` with `trackedOrigins`).
   - Each action is exactly one undo step (explicit checkpoints).
   - Esc backs out one level at a time: cancel drawing → Select tool → clear selection.
   - Backspace removes the last point while drawing.
   - Every delete shows a toast with **Undo**.
4. **Consistency and standards**
   - One tool catalogue (`src/ui/toolCatalog.ts`) drives the toolbar, the shortcuts and the help dialog.
   - Standard keys: Ctrl+Z/Y, Del, Esc, `/` for search.
   - Pickers share the same segmented-control and swatch components.
5. **Error prevention**
   - Drags pan and clicks draw, so you never draw by accident while panning.
   - Destructive actions that cascade (removing a player, a layer with drawings, a used phase, importing over a plan) ask for confirmation, with the focus on *Cancel*.
   - Objects can be locked.
   - The last layer can't be deleted.
6. **Recognition rather than recall**
   - Icons show their name, shortcut and a one-line explanation on hover.
   - The keys for picking a nation while planning conquests are printed on the chips.
   - The empty inspector lists the most useful shortcuts.
   - The tooltip on a province shows who it's assigned to.
   - Cities and resource provinces are marked on the map itself, so finding oil or a Doppelstadt needs no hovering.
7. **Flexibility and efficiency of use**
   - Single-key tool switching, number keys to pick a nation, and `[` `]` to step through phases.
   - Drag-painting, and Shift+click to paint a whole nation.
   - Holding Space pans while painting.
8. **Aesthetic and minimalist design**
   - The options bar appears only for tools that have options.
   - The inspector shows only fields relevant to the selected object.
   - Sidebar sections can be collapsed and remember their state.
   - Each piece of chrome sits where its job is. The sidebar holds only information and planning (Details, Nations, Layers). Room facts (link, access, expiry, delete) live in the **Room** menu in the top bar. How the map is drawn (nation colours, borders, labels) and the language live in the **View** menu in the map's bottom-left corner. Both menus close on Esc or a click outside.
9. **Help users recover from errors**
   - Hints explain what's missing ("A zone needs at least 3 points").
   - Failed imports say why.
   - Trying to delete a locked object says how to unlock it.
10. **Help and documentation**
    - `?` opens a full shortcut reference, grouped by task.

**Other principles**

- **Fitts's law**
  - 40 px tool buttons sit in a fixed rail right next to the map, close to where the pointer works.
  - Common actions also have keyboard shortcuts.
- **Hick's law and Gestalt grouping**
  - The 12 tools are split into 5 groups with separators: select · conquests · lines/areas · markers · measure/ping.
- **Progressive disclosure**
  - Advanced options (thickness, phase, layer, lock) live in the inspector, not on the toolbar.
- **WYSIWYG feedback**
  - Drawing previews use the same renderer as the final object, and a faded ghost marker follows the cursor for place tools.
- **Accessibility**
  - Visible `:focus-visible` rings.
  - ARIA roles: radiogroups for pickers, `aria-pressed` for toggles, live regions for the status bar and toasts.
  - Native `<dialog>` handles focus trapping.
  - `prefers-reduced-motion` is respected.
  - Text contrast on the dark chrome meets WCAG AA.
- **Responsive layout**
  - Below 720 px the toolbar becomes a horizontal strip and the sidebar moves under the map, with no horizontal page scroll.

## Language

German is the default (the coalition's language), and English can be picked in the lobby and in the map's View menu (bottom left).

- **Natural German.** Translations read naturally rather than word for word. They use informal "du" as the Call of War community does, German key names (Strg, Entf, Umschalt, Leertaste), German nation names, and localised relative times ("vor 5 Minuten").
- **Live switching.** Changing the language re-renders everything at once: panels, tooltips, map nation labels and the status hint. There's no reload and you keep your place.

## Wrap-around map

Call of War's world is round, so the planner's is too. Panning past the Pacific continues into America without an edge or a jump.

- **Continuous background.** The ocean shading is vertical and the grid divides the world width evenly, so nothing marks the seam.
- **Short way round.** Search and zoom-to flights choose the nearest copy, so going from Japan to Alaska crosses the Pacific instead of the whole map.

## Collaboration

- **Status at a glance.** A chip next to the title always shows *Live*, *Connecting…*, *Offline* or *Offline plan*, and its tooltip says what that means for your edits. Being offline is never an error: you keep working, and changes merge when the connection returns.
- **Who's here.** Avatars in the top bar show everyone in the room, coloured by their nation. The tooltip names their current tool, and clicking an avatar flies to their cursor. Live cursors carry name tags.
- **Pointing at things.** Alt+click (or the Ping tool, `G`) flashes a ring with your name on everyone's map. Pings that land off-screen for a teammate arrive as a toast with **Show**.
- **Identity without accounts.** "Who are you?" is asked once per room: pick your name if an organizer already listed you, or sign up with the nation you would like. It is remembered per room, can be changed from the identity chip, and "Just watching" is a valid answer.
- **One board for the line-up.** Axis left, Allies right, unassigned nations between them, waiting players underneath: the layout mirrors the two sides of the map. Organizers drag cards, or use the arrows and pickers on each card (same result, keyboard-friendly); a balance strip compares players, classes and provinces per team. Everyone else sees the same board with a lock notice instead of controls, so nobody wonders why a drag does nothing.
- **Changes reach the player.** When an organizer seats you, a toast says which nation you play now, and the identity chip, avatar ring and drawing colour follow.
- **Planned vs. conquered is unmistakable.**
  - Planned conquests are drawn in the nation's colour as hatching; achieved ones turn into a dashed outline.
  - Conquests recolour the land itself with the owner's map colour, and nation borders and labels move.
  - Every view uses the same wording: "Planned conquest", "Held by".
- **Safety in shared space.**
  - Undo only touches your own edits.
  - Importing warns that it replaces the plan for everyone in the room.
  - Removing a seated player explains that the nation becomes an AI nation.

## Room management

The admin's page (`/admin`) answers "which rooms can go?":

- **Content, not just dates.** Each room shows who signed up, how many are seated, and what was planned, drawn and conquered; an empty room says so in orange.
- **The likely candidates first.** The list starts with the rooms unused the longest; the **Unused** and **Inactive** filters show their counts up front.
- **Bulk with care.** Select all shown or single rooms, then delete them in one step. The confirmation counts the rooms and warns when people are in some of them right now.

## Test phase

- **Honest numbers.** Distances are always shown with "≈", and calibration is one click away in the options bar. Range circles speak km, the unit Call of War uses.
- **Following a teammate.**
  - Clicking an avatar follows that player's view, and a banner states it ("Du folgst Max") with a stop button.
  - Any own pan or zoom ends following, so you are never trapped.
- **Feedback where the problem happens.**
  - A speech-bubble button in the top bar, and in the lobby footer.
  - Three categories, and an optional contact.
  - The dialog says plainly what is stored.
- **Clear failure states.**
  - A deleted room replaces the map with an explanation and a way back, instead of a silent "offline".
  - Unexpected errors show a short apology toast and are reported automatically.

## Mobile readiness

Phones are milestone M4 (see [DEVELOPMENT.md](DEVELOPMENT.md#m4-mobile)), but these choices are already in place:

- Pointer-event drags.
- Taps work as clicks.
- `tapHold` long-press is enabled.
- No information is available only on hover.
- 44 px targets in the lobby, password gate and identity dialog.
- Native selects for nation pickers.
- A responsive shell with no horizontal scrolling at 390 px.
