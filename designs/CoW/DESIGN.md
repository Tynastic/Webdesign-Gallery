# Design notes

This file covers how the map looks and which usability principles shape the interface. Each principle is tied to the place in the UI where it's applied, so you can check it there.

## Map look: a printed war map

The map is drawn by our own canvas layers (`src/map/baseLayer.ts`, `markLayer.ts`), not by 3,000 separate Leaflet polygons. CRS.Simple is linear, so each redraw sets one transform and refills cached `Path2D`s in SVG coordinates. That keeps redraws cheap enough for the effects below.

| Element | Treatment | Why |
|---|---|---|
| Ocean | Radial gradient from light to deep, with a faint 1000-unit grid | Gives the sea depth and a "chart" feel without distracting |
| Coasts | Two soft, wide light-blue strokes under the land, plus a thin dark coastline | Shallow-water halo; land reads as land at any zoom |
| Land | Nation colours **muted by default** (mixed 55% toward paper). Vivid and Off are one click away | Figure/ground: the base map recedes so player plans stand out |
| Borders | Three tiers: province (thin, fades out when zoomed far out), nation (dashed over a light underline), coast | Visual hierarchy: you can always tell which provinces belong together |
| Labels | Nation names in letterspaced serif caps when zoomed out, city names in sans with a paper halo when zoomed in, packed without overlaps | Atlas convention. Labels stay readable on any fill |
| Player assignments | Tint, diagonal hatching that stays the same size on screen, and an inner outline in the player's colour | Readable even over a same-hued nation, and distinct from nation fills |
| Drawings | Tapered spline arrows with a broad head, barbed or double front lines, dashed zones, NATO-style unit frames | Uses the visual language players already know from war maps |

## Usability principles applied

**Nielsen's 10 heuristics**

1. **Visibility of system status**
   - The status bar always says what the active tool expects next ("Click to add point 2…").
   - The active tool is filled brass and the active phase chip is highlighted.
   - The options bar shows where new drawings go (`→ Layer · Phase`).
   - Undo and redo are disabled when there is nothing to undo or redo.
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
   - Destructive actions that cascade (removing a player with provinces, a layer with drawings, a used phase, importing over a plan) ask for confirmation, with the focus on *Cancel*.
   - Objects can be locked.
   - The last layer can't be deleted.
6. **Recognition rather than recall**
   - Icons show their name, shortcut and a one-line explanation on hover.
   - The keys for picking a player in assign mode are printed on the chips.
   - The empty inspector lists the most useful shortcuts.
   - The tooltip on a province shows who it's assigned to.
7. **Flexibility and efficiency of use**
   - Single-key tool switching, number keys to pick a player, and `[` `]` to step through phases.
   - Drag-painting, and Shift+click to paint a whole nation.
   - Holding Space pans while painting.
8. **Aesthetic and minimalist design**
   - The options bar appears only for tools that have options.
   - The inspector shows only fields relevant to the selected object.
   - Sidebar sections can be collapsed and remember their state.
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
  - The 9 tools are split into 4 groups with separators: select · assign · lines/areas · markers.
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

German is the default (the coalition's language), and English is one click away in the lobby and in the View panel.

- **Natural German.** Translations read naturally rather than word for word. They use informal "du" as the Call of War community does, German key names (Strg, Entf, Umschalt, Leertaste), German nation names, and localised relative times ("vor 5 Minuten").
- **Live switching.** Changing the language re-renders everything at once: panels, tooltips, map nation labels and the status hint. There's no reload and you keep your place.

## Wrap-around map

Call of War's world is round, so the planner's is too. Panning past the Pacific continues into America without an edge or a jump.

- **Continuous background.** The ocean shading is vertical and the grid divides the world width evenly, so nothing marks the seam.
- **Short way round.** Search and zoom-to flights choose the nearest copy, so going from Japan to Alaska crosses the Pacific instead of the whole map.

## Collaboration (M2)

- **Status at a glance.** A chip next to the title always shows *Live*, *Connecting…*, *Offline* or *Offline plan*, and its tooltip says what that means for your edits. Being offline is never an error: you keep working, and changes merge when the connection returns.
- **Who's here.** Avatars in the top bar show everyone in the room, coloured by their nation. The tooltip names their current tool, and clicking an avatar flies to their cursor. Live cursors carry name tags.
- **Pointing at things.** Alt+click (or the Ping tool, `G`) flashes a ring with your name on everyone's map. Pings that land off-screen for a teammate arrive as a toast with **Show**.
- **Identity without accounts.** "Which nation do you play?" is asked once per room. It is remembered per room, can be changed from the identity chip, and "Just watching" is a valid answer.
- **Planned vs. conquered is unmistakable.**
  - Planned conquests are drawn in the nation's marker colour as hatching; achieved ones turn into a dashed outline.
  - Conquests recolour the land itself with the owner's map colour, and nation borders and labels move.
  - Every view uses the same wording: "Planned conquest", "Held by".
- **Safety in shared space.**
  - Undo only touches your own edits.
  - Importing warns that it replaces the plan for everyone in the room.
  - Removing a nation explains that its planned conquests go while the provinces it holds stay.

## Test phase (M3)

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

Phones are milestone M4 (see PLAN.md), but these choices are already in place:

- Pointer-event drags.
- Taps work as clicks.
- `tapHold` long-press is enabled.
- No information is available only on hover.
- 44 px targets in the lobby, password gate and identity dialog.
- Native selects for nation pickers.
- A responsive shell with no horizontal scrolling at 390 px.
