# Codebase Audit Report (EVIL Incorporated: The Legacy AI Edition)

Date: 2026-01-25  
Repo version: `package.json` (`version: 1.0.11`)

## Scope

This audit focuses on runtime game flow, DB loading, events/scenes, and UI structure. It highlights:

- Repeated/duplicated logic
- Fragmented responsibilities (multiple systems doing similar work)
- Risky or likely-broken areas (silent failures, dead code, brittle coupling)

## Architecture (current)

**Data / assets**
- Source-of-truth DB + assets: `public/DB/**`, `public/Assets/**` (copied to `dist/` on build).
- Generated indexes: `public/DB/full_index.json` plus per-category indexes (scripts run via `npm run predev`).

**Loading + normalization**
- `src/loader.js` loads JSON from `/DB/...` and normalizes to maps:
  - `roomMap`, `objectMap`, `characterMap`
  - `objectSourceMap` for editor/traceability
  - `loadErrors[]` for UI-visible warnings

**Runtime orchestration**
- `src/game.js` is the central orchestrator:
  - Handles travel (`travelTo()`), movement costs (`utils/actionCosts.js`), and game clock (`utils/gameTime.js`).
  - Runs “room action events” via `src/events/EventEngine.js`.
  - Runs “planned events / threads” via `src/events/EventController.js`.
  - Loads and runs “scenes” via `src/events/SceneLoader.js` + `src/events/SceneRunner.js`.

**UI**
- `src/web/GameUI.jsx` owns most UI state and wires together:
  - Drawers (player/inventory/settings/vendor/etc)
  - Text window + media
  - Scene prompt UI and continuation handling
  - Save/load, DB reload, and editor entrypoints
- Layout styling is mostly in `main.css` with small component CSS files in `src/web/uicomponents/**`.

## Findings

### 1) Fragmentation: overlapping “event/story” systems

There are multiple systems that can all produce “narrative output”, “choices”, and/or “side effects”:

- **Room actions / commands**: `src/events/EventEngine.js` (driven by `room.Actions[]`, `object.Actions[]`, etc).
- **Planned events / threads**: `src/events/EventController.js` + `src/events/PlannedEvent.js`.
- **Scenes**: `src/events/SceneRunner.js` driven by data loaded in `src/events/SceneLoader.js`.

Symptoms:
- Conditions are evaluated in multiple ways:
  - `EventEngine.evaluateCheck()` (“CT_*” checks)
  - `EventController` uses `evaluateCondStr()` from `src/events/condStr.js`
  - `SceneRunner` uses its own `ShowIf` schema which *sometimes* delegates back to `EventEngine.evaluateCheck()`
- Random events are implemented in two places:
  - `SceneLoader.scanLocationEvents()` + `triggerRandomCombat()/triggerSpicyEvent()/...` (but see “dead code” below)
  - `EventEngine` command types for spawns (`CT_TRY_SPAWN_RANDOM_ENEMY_ENCOUNTER`, `CT_TRY_SPICY_EVENT`, etc)

Impact:
- Harder to reason about “what triggers what” and “where state lives”.
- Higher chance of drift: DB content may target a system that isn’t actually active.

### 2) Dead/unused code: SceneLoader’s scanner path is not called

`src/events/SceneLoader.js` contains a full scanning/random-event pipeline (`scanLocationEvents()`), but there are no runtime references to it (only references in dev docs).

Evidence:
- Only occurrences of `scanLocationEvents(` are in `src/events/SceneLoader.js` and dev docs (`devdoc/scene_scanner_quick_reference.md`, `devdoc/scene_loader_implementation.md`).
- `src/game.js` loads scenes with `sceneLoader.loadScenes()` but does not use the scanner to select events.

Impact:
- Maintenance burden and confusion (it looks like the system exists, but it’s not wired in).
- Risk that new DB content is authored “for the scanner” and then appears broken at runtime.

### 3) Duplication: variable reference normalization exists in multiple places

Two functions implement near-identical logic for mapping shorthand variables to `player.*` paths:

- `src/events/EventEngine.js` → `normalizeSceneVariableRef()`
- `src/events/SceneRunner.js` → `normalizeVariableRef()`

Impact:
- Bugs/inconsistencies can occur if one is updated and the other isn’t.
- Hard to introduce new “special” top-level variables without touching multiple files.

### 4) Risky coupling: UI contains hard-coded content IDs and branches

`src/web/GameUI.jsx` has special-case logic that checks specific script/scene IDs (example branches visible in `handleContinue()` and `handleSceneChoice()`).

Impact:
- Content changes (renaming IDs, splitting scenes, etc.) can silently break story flow.
- Story logic becomes spread between DB data and React UI code.

### 5) Error surfacing mismatch: SceneLoader failures aren’t shown in UI warnings

- `src/loader.js` captures many DB failures into `loadErrors[]` which are displayed in the Settings drawer.
- `src/events/SceneLoader.js` logs scene load failures to `console.error()` and returns `[]`.

Impact:
- Scenes can “just not work” in a way that looks like content bugs, with no in-game warning.

### 6) DB reload does not reload scenes

`src/game.js` reload path (`reloadFromDb()`) refreshes `player/rooms/objects/characters/plannedEvents`, but it does not call `sceneLoader.loadScenes()` again.

Impact:
- Editing `public/DB/scenes/**` during `npm run dev` likely won’t take effect until a hard refresh/new game init.

## Recommendations (prioritized, low-risk)

1) **Pick a single authority for “random events on location entry”.**  
   Either wire in `SceneLoader.scanLocationEvents()` properly, or remove/disable it and keep the logic exclusively in `EventEngine` commands + planned events.

2) **Unify variable reference normalization into one shared helper.**  
   Move the shared mapping logic into a utility (e.g. `src/utils/variableRef.js`) and import it from both `EventEngine` and `SceneRunner`.

3) **Surface scene-loading failures in `loadErrors[]`.**  
   Have `SceneLoader.loadScenes()` report errors into the same UI-visible warning list used by `loader.js`.

4) **Make DB reload reload scenes (dev quality-of-life).**  
   Update `Game.reloadFromDb()` to re-run `sceneLoader.loadScenes()` and rebuild caches as needed.

5) **Reduce brittle UI branches by moving story flow into data.**  
   Replace hard-coded `scriptId`/`sceneId` checks in `GameUI.jsx` with data-driven commands/events (even if initially “thin wrappers”).

## Validation snapshot

- `npm test`: pass (39 tests)
- `npm run build`: success (Vite “deprecated CJS Node API” warning shown; build completes)
