# EVIL Incorporated — The Legacy AI Edition

This repo is a Vite + React web game. The game “database” is a set of JSON files that are loaded at runtime from `/DB/...`.

## Source of truth (important)

- Edit these: `public/DB/**/*.json` and `public/Assets/**`
- Never edit these: `dist/**` (including `dist/DB/**`)

Vite copies everything from `public/` into `dist/` during `npm run build`. That’s why you see two copies of the same DB files.

## Dev vs build (how to know which DB is used)

- Dev (live DB reload): `npm run dev` (http://127.0.0.1:5173)
  - `/DB/...` is served from `public/DB/...` (see `vite.config.js`).
- Production preview: `npm run build` then `npm run preview` (http://127.0.0.1:4173)
  - `/DB/...` is served from `dist/DB/...` (static).

To confirm, open `/DB/rooms.json` in the browser on the dev/preview port.

## “My DB edits don’t show up”

Edits to `public/DB/*.json` can look ignored if `DB/savegame.json` or browser `localStorage` overrides the same fields. In-game: open Settings → **Reset Save** / **New Game**.

Note: `public/DB/savegame.json` is treated as runtime state (ignored by git). The tracked baseline is `public/DB/savegame.template.json`.

## Characters DB layout

Characters are stored as individual files, grouped by category:

- `public/DB/characters/enemies/*.json` (combat enemies)
- `public/DB/characters/bosses/*.json`
- `public/DB/characters/r_citizens/*.json` (random citizens)
- `public/DB/characters/main/*.json` (story NPCs / vendors)

Each folder has an `index.json` listing the character `UniqueID`s in that folder.

## Planned events / story arcs

- Edit: `public/DB/events.json`
- Runtime state: stored in `savegame.json` under `events.threads`, `events.states`, and `events.flags`.
- Normalize auto IDs/scenes: `npm run events:normalize`

## Useful commands

- `npm run dev` - run editor/dev server
- `npm run build` - rebuild `dist/` (updates `dist/DB/**` from `public/DB/**`)
- `npm run preview` - run the built `dist/` locally
- `npm run db:characters:split` - migrate legacy `characters.json` into folders
- `npm run check:navigation` - validate room exits in `public/DB/rooms.json`
- `npm run db:verify` - verify `dist/DB` matches `public/DB` (after a build)
- `npm run rebuild` - delete `dist/` then build

## In-app DB Editor (dev)

When running `npm run dev`, a **DB Editor** button appears in the left sidebar. It can:

- Edit JSON files under `public/DB/**` (save writes to disk).
- Create/delete characters/objects/rooms.
- Batch-create assets by ID prefix + count.

Note: deletes are backed up under `backups/deleted/`.

## Versioning / rollback

- Bump versions (creates git commit + tag): `npm run release:patch` / `npm run release:minor` / `npm run release:major`
- See versions: `git tag --list "v*"`
- Roll back to a version: `git checkout v1.0.0`

## Reddit/Devvit note

For a Reddit deployment, think of `dist/` as the packaged, read-only artifact (like “web assets” inside a Devvit WebView). If you need *editable* data after deployment, the “DB” needs to move to runtime storage (e.g. Devvit Redis), not static JSON files.
