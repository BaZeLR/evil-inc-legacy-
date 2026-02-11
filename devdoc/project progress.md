# Project Progress — EVIL Incorporated (Legacy AI Edition)

This document is a **current-state report** of what systems the project has today, what the **expected behavior** is (design intent / what a content editor would assume), what the **real behavior** is (what the code actually does now), and the key **dependencies**.

It is written for working on the **modern Vite + React implementation** (not the `regalia/` engine).

## 1) Project Snapshot

### What this repo is
- A **browser-based RPG** built with **Vite + React**.
- Game content is **JSON-driven**, loaded at runtime from `/DB/...`.
- There are two implementations:
  - **Modern app**: `src/` (active development)
  - **Legacy engine**: `regalia/` (maintenance mode / reference)

### Source of truth
- Authoritative content lives in: `public/DB/**` and `public/Assets/**`
- Build output lives in: `dist/**` (copied from `public/` during `npm run build`)

### Savegame reality
- Runtime state is persisted to `public/DB/savegame.json` (dev) and can override DB fields.
- Baseline template: `public/DB/savegame.template.json`

Expected:
- Editing DB files changes the game.

Real:
- If `savegame.json` contains overrides (player stats, room flags, object contents, etc.), you can edit DB and see **no effect** until you reset/clear the save.

## 2) Runtime Architecture (Modern App)

### Core coordinator: `Game`
Files:
- `src/game.js`

Responsibilities:
- Loads all DB content via `loadGameData()`.
- Maintains lookup maps:
  - `roomMap`, `objectMap`, `characterMap`, and `objectSourceMap`.
- Coordinates:
  - `EventEngine` (command execution)
  - `EventController` (planned events selection & gating)
  - `SceneLoader` / `SceneRunner` (scene content)

Expected:
- A single “game loop” entrypoint owns state and ensures consistency.

Real:
- This is true: `Game` is the hub; UI calls into it (travel, actions, combat turn resolution).

### Data loading and normalization: `loadGameData()`
Files:
- `src/loader.js`

What it loads:
- Player template: `DB/player.json`
- Rooms list: `DB/rooms/index.json` → then loads each file listed
- Characters: primarily via per-category indexes under `DB/characters/**/index.json`
- Planned events: `DB/events.json` (parsed into planned event objects)
- Objects: via `DB/full_index.json` filtering `DB/objects/**`
- Save state: `DB/savegame.json` (merged onto loaded objects/rooms/player)

Expected:
- Index files are authoritative for what loads.

Real:
- Rooms: loaded from `DB/rooms/index.json`.
- Characters: tries category indexes first; in dev can fall back to `/api/db/list` and ultimately legacy `DB/characters/characters.json`.
- Objects: loaded from `DB/full_index.json` (objects only).
- **Legacy compatibility**: the loader may read `DB/rooms.json` (legacy monolith) and merge only NPC-style lists into per-room objects so spawns can work.

## 3) Database Layout and Indexing

### Current DB shape (recommended)
- `public/DB/rooms/index.json` lists room files.
- `public/DB/rooms/**` contains individual room JSON.
- `public/DB/characters/<category>/index.json` lists character IDs.
- `public/DB/characters/<category>/<id>.json` contains each character.
- `public/DB/objects/**` contains objects.
- `public/DB/scenes/**` contains story scenes.

### Index generation scripts
Files:
- `scripts/generate-db-full-index.js` → writes `public/DB/full_index.json`
- `scripts/generate-db-index.js <subfolder>` → writes subfolder index (rooms/characters/objects)

Expected:
- Index files can be edited by hand.

Real:
- Index files should be treated as **generated artifacts**.
- The project’s workflow expects `npm run dev` (via `predev`) to regenerate them.

## 4) Dev Server Hot-Reload + DB Editor

### Vite dev middleware
File:
- `vite.config.js`

Endpoints (dev only):
- `/api/db/version` — version bump when DB changes (and identifies changed path)
- `/api/db/write` — write JSON to `public/DB/**`
- `/api/db/delete` — delete DB files (optionally backed up to `backups/deleted/`)
- `/api/db/list?dir=DB/...` — list JSON files under `public/DB` for editor/loader

Expected:
- Any edit to DB triggers a reload.

Real:
- The UI polls `/api/db/version` and calls `game.reloadFromDb({ preserveRoomId: true })`.
- Savegame writes are intentionally ignored by the live-reload loop to prevent reload storms.

### In-app DB Editor
Files:
- `src/web/editor/*` and the entry in `src/web/GameUI.jsx`

Expected:
- Editor changes DB immediately and game reflects it.

Real:
- Writes go through `/api/db/write` (dev only).
- After a write, the game reloads DB automatically (except savegame mutations).

## 5) Movement, Navigation, and Exits

### How exits work
File:
- `src/loader.js` (exit normalization + destination resolution)

Expected:
- Room exits are defined “per room” and resolved by ID.

Real:
- Exits are normalized from each room’s `Exits[]`.
- Destination can be provided as an ID or a loose name-like value; the loader resolves it against a room index.

## 6) Planned Events System

### Planned events selection
Files:
- `public/DB/events.json`
- `src/events/EventController.js`
- `src/events/PlannedEvent.js`

Key planned-event fields (conceptually):
- `when`: e.g. `enter`, `exit`, `presence`, and spawn channels like `spawn_citizen`, `spawn_spicy`, `spawn_witness`, `spawn_combat`
- `location`:
  - `"*"` (anywhere)
  - a single room id
  - **or an array of room ids** (current feature)
- `prob`:
  - number (0..100)
  - **or a string range** like `"65-95"` (current feature)

Expected:
- A planned event is eligible when `when` matches and the current room matches.

Real:
- Eligibility also depends on any `reqs` / `condStr` / thread state / repeatability flags.
- `location` can be an array, enabling data-driven targeting (used for “outside-only spicy”).

## 7) Command Execution (EventEngine)

### Command processor
File:
- `src/events/EventEngine.js`

It executes `cmdtype` commands from planned events and entity actions.

Expected:
- Commands are purely data-driven.

Real:
- Many commands are data-driven, but the meaning of each `cmdtype` is implemented in JS.
- Supported command list is partially documented in `devdoc/procedural_actions_and_scene_player.md`.

## 8) Spawn & Ambient Systems (Expected vs Real)

### Spawn pipeline at room entry
File:
- `src/game.js` (`runRoomEntrySpawns`)

Order (real behavior):
1. `spawn_combat` (unless suppressed)
2. `spawn_spicy`
3. `spawn_witness`
4. `spawn_citizen`
5. Room-level residents spawn (`runRoomResidentsSpawn`) — independent of planned events

Expected:
- Random events happen “sometimes” and feel contextual.

Real:
- They are deterministic relative to:
  - planned event gating (`prob`, `location`, conditions)
  - room flags (e.g., `Spawns`)
  - notoriety and RNG logic inside the command implementation

### Enemy encounters (combat)
Files:
- Planned event: `public/DB/events.json` (`spawn_combat_*`)
- Command: `CT_SPAWN_RANDOM_ENEMY_ENCOUNTER` in `src/events/EventEngine.js`

Expected:
- Combat spawns only in rooms that allow it.

Real:
- Combat spawn requires `room.Spawns === true`.
- Score combines base spawn weight, notoriety scaling, room disposition, and RNG.

### Spicy events (notoriety beats)
Files:
- Planned event: `public/DB/events.json` (`spawn_spicy_01`)
- Command: `CT_TRY_SPICY_EVENT` in `src/events/EventEngine.js`

Expected:
- Spicy events should happen in **city outside locations**, not inside apartments/interiors.

Real:
- This is enforced **data-first** via planned event `location: [ ...outsideRoomIds ]`.
- `CT_TRY_SPICY_EVENT` additionally requires `room.Spawns === true` and uses notoriety-based scoring.

Important dependency:
- The “outside room ids list” is currently encoded in `events.json` (copied from the legacy `rooms.json` RoomGroups concept).

### Witness events (ambient city life beats)
Files:
- Planned event: `public/DB/events.json` (`spawn_witness_*`)
- Command: `CT_TRY_WITNESS_EVENT` in `src/events/EventEngine.js`

Expected:
- Witness events are more common when life is calm.

Real:
- Witness chance increases when notoriety is low (inverse scaling).

### Random citizens (r_citizens)
Files:
- Planned event: `public/DB/events.json` (`spawn_citizen_*`)
- Command: `CT_SPAWN_RANDOM_CITIZEN` in `src/events/EventEngine.js`

Expected:
- Rooms spawn citizens appropriate to that location.

Real:
- The system prefers `room.NPCs[]` as a weighted table.
- Citizens are filtered by:
  - being in category `r_citizens`
  - not already placed in a room
  - matching `SpawnAreas` against the room’s `Group`
- If a room has no NPC table, it falls back to the global `r_citizens` pool.
- Optional traffic bump exists: `CT_TRY_SPAWN_EXTRA_CITIZEN` can cause a second citizen spawn sometimes.

### Residents (ambient “room NPC list” spawns)
File:
- `src/game.js` (`runRoomResidentsSpawn`)

Expected:
- If a room has resident-like NPCs, they should appear sometimes.

Real:
- Supports multiple data shapes:
  - `room.Residents[]` (preferred)
  - Back-compat: `room.NPCs[]` entries with `Chance` fields are treated as resident candidates
  - Optional mode: `room.SpawnResidentsFromNPCs: true` uses the room’s NPC table as resident candidates even without explicit `Residents`
- Chance clamping: per-resident and room-level chances are clamped to a practical range (55..80).

## 9) UI Layer

### React UI
File:
- `src/web/GameUI.jsx`

Expected:
- UI is a thin wrapper over the engine.

Real:
- UI handles:
  - navigation actions
  - save/load/reset
  - showing planned event text outputs
  - integrating combat state
  - optional DB editor drawer in dev mode

### State management
Dependency:
- `zustand`

Expected:
- Shared UI state lives in a store.

Real:
- Game state is primarily inside the `Game` class; UI state uses stores where needed.

## 10) Dependencies

### Runtime dependencies (browser)
From `package.json`:
- `react`, `react-dom`
- `react-router-dom`
- `zustand`
- `pixi.js`

### Tooling / dev dependencies
- `vite`
- `@vitejs/plugin-react`

### Node scripts / runner
- Tests use Node’s built-in test runner (`node --test`).

## 11) Operational Gotchas (Real-World Behavior)

- DB edits not showing up is usually one of:
  - `savegame.json` overriding the field you changed
  - browser storage / old save state
  - running preview/build and editing `public/` instead of `dist/`
- Index files are generated; don’t hand-edit them unless you intend to regenerate.
- Dev server intentionally ignores direct FS watching of `public/DB/**` in Vite’s default watcher, and uses custom `/api/db/version` instead.

## 12) Related Specs / Reference Docs

Existing internal docs that complement this report:
- `devdoc/procedural_actions_and_scene_player.md` (EventEngine commands overview)
- `devdoc/game_event_data_structure_and procedural_flow.txt`
- `devdoc/game_object_actions_dependencies.md`
- `devdoc/scene_loader_implementation.md`
- `devdoc/GameflowMainEvents.txt`

---

## Appendix: Quick Commands

- Dev: `npm run dev`
- Tests: `npm test`
- Validate DB sync (public vs dist): `npm run db:verify`
- Validate navigation: `npm run check:navigation`
