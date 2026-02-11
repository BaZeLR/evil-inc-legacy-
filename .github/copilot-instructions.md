# EVIL Incorporated – Legacy AI Edition (Copilot Instructions)

## Project Architecture

This is a **Vite + React web-based RPG game** with JSON-driven content and live DB editing in dev mode. The game runs entirely in the browser, with two parallel implementations:
- **Modern React app** (`src/`, `App.jsx`) – Active development
- **Legacy regalia engine** (`regalia/`) – Original implementation (maintenance mode)

### Critical File Paths
- **Source of truth**: `public/DB/**/*.json` and `public/Assets/**` 
- **Never edit**: `dist/**` (build artifacts, Vite copies from `public/`)
- **Game state**: `public/DB/savegame.json` (runtime state, git-ignored; baseline is `savegame.template.json`)

## Database System & Data Loading

### JSON-Driven Architecture
All game content lives in `public/DB/`:
- `player.json` – Player template & initial stats
- `rooms.json` – Room definitions with exits and events
- `events.json` – Planned events (story triggers, NPCs, rewards)
- `leveling.json` – XP/level progression system
- `characters/` – NPCs organized by type: `enemies/`, `bosses/`, `r_citizens/`, `main/`
- `objects/` – Items, loot, equipment
- `rooms/` – Per-room data files
- `scenes/` – Story scenes with text/media

### Character DB Layout
Characters are **split by category** with individual JSON files:
```
public/DB/characters/
  ├── enemies/index.json     # Lists all enemy IDs
  ├── enemies/*.json         # Individual enemy files
  ├── bosses/index.json
  ├── r_citizens/index.json  # Random citizens
  └── main/index.json        # Story NPCs/vendors
```

### Hot-Reload DB System
Vite config (`vite.config.js`) implements custom middleware for **live editing without restart**:
- `/api/db/version` – DB change tracking endpoint
- `/api/db/write` – Save JSON changes to disk
- `/api/db/delete` – Delete DB entries (backed up to `backups/deleted/`)
- File watchers bump `dbChangeState.version` on mutations
- Recent writes tracked in `recentDbWrites` Map with TTL (4s)

**Key pattern**: Check `isRecentlyWritten(path)` before serving to prevent stale reads.

## Game Loop & Event System

### Core Game Class (`src/game.js`)
The `Game` class is the central coordinator:
- Loads all DB data via `loadGameData()` from `src/loader.js`
- Manages maps: `roomMap`, `objectMap`, `characterMap`, `objectSourceMap`
- Runs **three event engines**:
  - `EventEngine` – Processes Actions/Commands from DB entities
  - `EventController` – Handles planned events from `events.json`
  - `SceneLoader` – Loads scenes from `DB/scenes/`

### Event Flow
1. **Planned Events** (`src/events/EventController.js`):
   - Triggered by `when: 'enter'|'exit'|'presence'` + room/time conditions
   - Uses `condStr` for complex condition checking (`src/events/condStr.js`)
   - Manages event threads, states, flags in `savegame.events`
   - Can suppress combat, grant rewards, update flags

2. **Actions System** (two types):
   - **Procedural (hard-coded)**: In `src/web/GameUI.jsx` – calls `Game.travelTo()`, etc.
   - **Data-driven (JSON)**: Entities have `ActionsMenu` (UI labels) + `Actions` (engine commands)
   - `ActionsMenu.Action` must match `Actions[].name` or `Actions[].overridename`

3. **Commands**: EventEngine executes commands like `DisplayText`, `SetVariable`, `DisplayMedia`, `GrantReward`

### Time & Energy System
- **Move costs**: +00:30 game time, -1 Energy (via `applyMoveActionCosts()`)
- **Combat costs**: +01:00 game time per action (weapons: -1 Energy, abilities: custom)
- **Game clock**: Stored as `DaysInGame` + `GameTimeMinutes`, wraps at midnight
- Test coverage in `tests/actionCosts.test.mjs`

## Development Workflow

### Essential Commands
```bash
npm run dev              # Start dev server (http://127.0.0.1:5173) + auto-generate indices
npm run build            # Production build (copies public/ → dist/)
npm run preview          # Serve built dist/ (http://127.0.0.1:4173)
npm run rebuild          # Clean dist/ then build

# Database operations
npm run db:characters:split     # Migrate legacy characters.json to folders
npm run check:navigation        # Validate room exits in rooms.json
npm run db:verify              # Verify dist/DB matches public/DB
npm run events:normalize       # Normalize auto IDs/scenes in events.json

# Testing
npm test                       # Run all tests (Node.js test runner)
```

### Pre-dev Hook
The `predev` script in `package.json` **auto-generates indices**:
```bash
node scripts/generate-db-full-index.js   # Creates DB/full_index.json
node scripts/generate-db-index.js objects
node scripts/generate-db-index.js characters
node scripts/generate-db-index.js rooms
```
**Never manually edit** `full_index.json` or category `index.json` files.

### DB Editor (Dev Mode Only)
When running `npm run dev`, a **DB Editor** button appears in the left sidebar:
- Edit JSON files under `public/DB/**` (saves to disk via `/api/db/write`)
- Create/delete characters/objects/rooms
- Batch-create assets by ID prefix + count
- Deletes are backed up to `backups/deleted/`

### Debugging "My edits don't show up"
If changes to `public/DB/*.json` seem ignored:
1. Check if `DB/savegame.json` overrides your fields (runtime state)
2. Clear browser `localStorage` 
3. In-game: **Settings → Reset Save / New Game**
4. Verify dev server is using `public/DB/` not `dist/DB/` (check browser network tab for `/DB/rooms.json`)

## Code Patterns & Conventions

### Data Normalization
Use consistent normalization functions (examples from `src/events/EventController.js`):
```javascript
normalizeText(value)      // String(value ?? '').trim()
normalizeBool(value)      // Handles 1/0, 'yes'/'no', true/false
normalizeStatus(value)    // 'inactive'|'active'|'blocked'|'complete'|'aborted'
clampInt(value, fallback) // Safe integer with fallback
```

### Entity Lookups
Always use maps for O(1) lookup:
```javascript
const room = game.roomMap[roomId];           // From Game.roomMap
const obj = game.objectMap[objectId];        // From Game.objectMap
const char = game.characterMap[charId];      // From Game.characterMap
```

### Event Result Pattern
Functions that trigger events should return structured results:
```javascript
{
  texts: ['array', 'of', 'strings'],    // System messages
  media: 'path/to/image.jpg' | null,    // Media to display
  paused: false,                         // UI pause state
  errors: ['error messages']             // Any errors
}
```

### RNG Usage
Always accept `rng` parameter for testability:
```javascript
import { cryptoRng, rollD100, chancePercent } from './utils/random.js';

function myFunction({ rng = cryptoRng } = {}) {
  const roll = rollD100(rng);  // 1-100 inclusive
  if (chancePercent(75, rng)) { /* 75% chance */ }
}
```

### JSON Comments Support
The loader (`src/loader.js`) strips `// comments` and `/* */` from JSON via `stripJsonComments()`. Use sparingly.

## Testing Strategy

Tests use **Node.js native test runner** (`node --test`):
- `tests/*.test.mjs` – Unit tests for game systems
- Import ES modules directly from `src/` 
- Pattern: `test('description', () => { assert.equal(...) })`
- Coverage areas: action costs, game time, leveling, navigation, planned events, spawns

Key test utilities:
- Mock player objects with minimal required fields
- Use `assert` from `node:assert/strict`
- Test edge cases (midnight wraparound, energy depletion, etc.)

## State Management

**Zustand** (`zustand`) is the state management library:
- Store in `src/web/store/` (if present)
- Game state lives in `Game` class, UI state in Zustand stores
- Avoid prop drilling – use stores for cross-component state

## Dependencies & Tech Stack

- **Vite** – Build tool, dev server, HMR
- **React 18** – UI rendering
- **Pixi.js 7** – Canvas graphics (if used for visual effects)
- **react-router-dom 7** – Routing (minimal usage)
- **Zustand 5** – State management
- Node.js scripts for build/maintenance

## Constraints & Best Practices

1. **Preserve working code** – Only edit files required for new features
2. **Avoid bloat** – Keep code minimal, reusable, efficient
3. **Read before acting** – Check existing patterns in codebase first
4. **Atomic components** – Prefer small, reusable components over monoliths
5. **Data-driven** – Define game content in JSON, not hardcoded
6. **Test changes** – Run `npm test` after modifying game logic
7. **Semantic HTML** – Use proper tags, ARIA attributes for accessibility
8. **Verify DB sync** – After builds, run `npm run db:verify`

## Reddit Devvit Deployment Notes

For Reddit deployment, `dist/` is the packaged artifact (like WebView assets). Since JSON files are static after build, **editable data must move to runtime storage** (e.g., Devvit Redis) – the current static JSON approach won't support user-specific saves in production.
