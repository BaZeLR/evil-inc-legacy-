// Game entity initialization and loader integration
import { loadGameData } from './loader.js';
import { EventEngine } from './events/EventEngine.js';
import { EventController } from './events/EventController.js';
import { addExperience, applyLevelProgression } from './utils/leveling.js';
import { applyMoveActionCosts } from './utils/actionCosts.js';
import { ensureGameClock } from './utils/gameTime.js';
import { cryptoRng } from './utils/random.js';

export class Game {
    constructor() {
        this.player = null;
        this.rooms = [];
        this.objects = [];
        this.characters = [];
        this.plannedEvents = [];
        this.leveling = null;
        this.objectMap = {};
        this.objectSourceMap = {};
        this.roomMap = {};
        this.characterMap = {};
        this.variables = {};
        this.eventEngine = new EventEngine(this);
        this.eventController = new EventController(this);
        this.lastEventResult = null;
        this.lastLevelProgression = null;
        this.save = null;
        this.loadErrors = [];
        this.initialized = false;
        this.spawnState = {
            ephemeralCharacterIds: new Set(),
            pendingEncounter: null
        };
    }

    async initialize() {
        const data = await loadGameData();
        this.player = data.player;
        this.rooms = data.rooms;
        this.objects = data.objects;
        this.characters = data.characters;
        this.plannedEvents = Array.isArray(data.plannedEvents) ? data.plannedEvents : [];
        this.leveling = data.leveling ?? null;
        this.objectMap = data.objectMap;
        this.objectSourceMap = data.objectSourceMap ?? {};
        this.roomMap = data.roomMap;
        this.characterMap = data.characterMap;
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        ensureGameClock(this.player);
        this.spawnState = { ephemeralCharacterIds: new Set(), pendingEncounter: null };
        this.eventController?.syncFlagsToVariables?.();
        this.initialized = true;

        // Fire initial room events so the UI can show system text immediately.
        const currentRoomId = this.player?.CurrentRoom ?? null;
        if (currentRoomId) {
            const plannedEnter = this.eventController?.run?.({ when: 'enter', roomId: currentRoomId, rng: cryptoRng }) ?? null;
            const plannedPresence = this.eventController?.run?.({ when: 'presence', roomId: currentRoomId, rng: cryptoRng }) ?? null;
            const roomEvents = this.runRoomEnterEvents(currentRoomId);
            const plannedTexts = [
                ...(Array.isArray(plannedEnter?.texts) ? plannedEnter.texts : []),
                ...(Array.isArray(plannedPresence?.texts) ? plannedPresence.texts : [])
            ];
            const roomTexts = Array.isArray(roomEvents?.texts) ? roomEvents.texts : [];
            this.lastEventResult = {
                texts: [...plannedTexts, ...roomTexts],
                media: roomEvents?.media || plannedPresence?.media || plannedEnter?.media || null,
                paused: Boolean(roomEvents?.paused || plannedPresence?.paused || plannedEnter?.paused),
                errors: [
                    ...(plannedEnter?.errors || []),
                    ...(plannedPresence?.errors || []),
                    ...(roomEvents?.errors || [])
                ]
            };
            this.lastLevelProgression = this.checkLevelProgression();
        }
    }

    async reloadFromDb({ preserveRoomId = true } = {}) {
        const previousRoomId = preserveRoomId ? (this.player?.CurrentRoom ?? null) : null;
        const data = await loadGameData();

        this.player = data.player;
        this.rooms = data.rooms;
        this.objects = data.objects;
        this.characters = data.characters;
        this.plannedEvents = Array.isArray(data.plannedEvents) ? data.plannedEvents : [];
        this.leveling = data.leveling ?? null;
        this.objectMap = data.objectMap;
        this.objectSourceMap = data.objectSourceMap ?? {};
        this.roomMap = data.roomMap;
        this.characterMap = data.characterMap;
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        ensureGameClock(this.player);
        this.spawnState = { ephemeralCharacterIds: new Set(), pendingEncounter: null };
        this.eventController?.syncFlagsToVariables?.();
        this.initialized = true;

        const resolvedRoomId =
            previousRoomId && this.roomMap?.[previousRoomId]
                ? previousRoomId
                : (this.player?.CurrentRoom ?? null);

        if (resolvedRoomId) this.player.CurrentRoom = resolvedRoomId;
        if (this.eventEngine) this.eventEngine.game = this;

        return { roomId: resolvedRoomId };
    }

    consumePendingEncounter(roomId) {
        const pending = this.spawnState?.pendingEncounter ?? null;
        if (!pending) return null;
        const pendingRoom = String(pending?.roomId ?? '').trim();
        const currentRoom = String(roomId ?? '').trim();
        if (pendingRoom && currentRoom && pendingRoom !== currentRoom) return null;
        this.spawnState.pendingEncounter = null;
        return pending;
    }

    getCurrentRoom() {
        return this.roomMap[this.player.CurrentRoom];
    }

    movePlayerTo(roomId) {
        if (this.roomMap[roomId]) {
            this.player.CurrentRoom = roomId;
            return true;
        }
        return false;
    }

    travelTo(roomId) {
        if (!this.roomMap[roomId]) return { moved: false, events: null };
        const fromRoomId = this.player?.CurrentRoom ?? null;

        const plannedExit = fromRoomId
            ? (this.eventController?.run?.({ when: 'exit', roomId: fromRoomId, fromRoomId, toRoomId: roomId, rng: cryptoRng }) ?? null)
            : null;
        this.player.CurrentRoom = roomId;
        applyMoveActionCosts(this.player);

        const plannedEnter = this.eventController?.run?.({ when: 'enter', roomId, fromRoomId, toRoomId: roomId, rng: cryptoRng }) ?? null;
        const plannedPresence = this.eventController?.run?.({ when: 'presence', roomId, fromRoomId, toRoomId: roomId, rng: cryptoRng }) ?? null;
        const suppressCombat = Boolean(plannedExit?.suppressCombat || plannedEnter?.suppressCombat || plannedPresence?.suppressCombat);

        const spawns = this.runRoomEntrySpawns(roomId, { suppressCombat });
        const events = this.runRoomEnterEvents(roomId);
        const levelProgression = this.checkLevelProgression();
        this.lastEventResult = events;
        this.lastLevelProgression = levelProgression;
        return { moved: true, planned: { exit: plannedExit, enter: plannedEnter, presence: plannedPresence }, spawns, events, levelProgression };
    }

    checkLevelProgression() {
        return applyLevelProgression(this.player, this.leveling, { objectMap: this.objectMap });
    }

    gainExperience(amount) {
        const result = addExperience(this.player, amount, this.leveling, { objectMap: this.objectMap });
        this.lastLevelProgression = result;
        return result;
    }

    runRoomEnterEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const firstTime = this.eventEngine.runEvent('<<On Player Enter First Time>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });
        const regular = this.eventEngine.runEvent('<<On Player Enter>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });

        return {
            texts: [...(firstTime.texts || []), ...(regular.texts || [])],
            media: regular.media || firstTime.media || null,
            paused: Boolean(firstTime.paused || regular.paused),
            errors: [...(firstTime.errors || []), ...(regular.errors || [])]
        };
    }

    clearEphemeralSpawns() {
        const ids = this.spawnState?.ephemeralCharacterIds;
        if (!ids || !(ids instanceof Set) || !ids.size) return;

        for (const id of ids) {
            const char = this.characterMap?.[id] ?? null;
            if (!char) continue;
            char.currentRoomId = null;
            if (Object.prototype.hasOwnProperty.call(char, 'CurrentRoom')) char.CurrentRoom = null;
        }
        ids.clear();
    }

    placeCharacterInRoom(characterId, roomId) {
        const id = String(characterId ?? '').trim();
        if (!id) return false;
        const room = String(roomId ?? '').trim();
        if (!room) return false;
        const char = this.characterMap?.[id] ?? null;
        if (!char) return false;
        char.currentRoomId = room;
        if (Object.prototype.hasOwnProperty.call(char, 'CurrentRoom')) char.CurrentRoom = room;
        if (this.spawnState?.ephemeralCharacterIds instanceof Set) this.spawnState.ephemeralCharacterIds.add(id);
        return true;
    }

    runRoomEntrySpawns(roomId, { rng = cryptoRng, suppressCombat = false } = {}) {
        const room = this.roomMap?.[roomId] ?? null;
        if (!room) return { texts: [], encounter: null, spawnedIds: [] };

        this.clearEphemeralSpawns();
        if (this.spawnState) this.spawnState.pendingEncounter = null;

        const texts = [];
        const runSpawn = when => this.eventController?.run?.({ when, roomId, rng }) ?? null;

        const combatResult = suppressCombat ? null : runSpawn('spawn_combat');
        if (combatResult?.triggered) {
            if (Array.isArray(combatResult.texts) && combatResult.texts.length) texts.push(...combatResult.texts);
            const spawnedIds = this.spawnState?.ephemeralCharacterIds instanceof Set ? [...this.spawnState.ephemeralCharacterIds] : [];
            const encounter = this.spawnState?.pendingEncounter ?? null;
            return { texts, encounter, spawnedIds };
        }

        const spicyResult = runSpawn('spawn_spicy');
        if (spicyResult?.triggered && Array.isArray(spicyResult.texts) && spicyResult.texts.length) {
            texts.push(...spicyResult.texts);
        }

        const citizenResult = runSpawn('spawn_citizen');
        if (citizenResult?.triggered && Array.isArray(citizenResult.texts) && citizenResult.texts.length) {
            texts.push(...citizenResult.texts);
        }

        const spawnedIds = this.spawnState?.ephemeralCharacterIds instanceof Set ? [...this.spawnState.ephemeralCharacterIds] : [];
        return { texts, encounter: null, spawnedIds };
    }

    getRoomMedia(roomId) {
        const room = this.roomMap[roomId];
        return room ? room.media : null;
    }

    getRoomObjects(roomId) {
        const room = this.roomMap[roomId];
        if (room?.objects) return room.objects;

        // Fallback for older schemas that used a `location` field on global objects.
        return this.objects.filter(obj => obj?.location === roomId);
    }

    getRoomCharacters(roomId) {
        return this.characters.filter(char => {
            const currentRoomId = char?.currentRoomId ?? char?.CurrentRoom ?? char?.location ?? null;
            return currentRoomId === roomId;
        });
    }
}

// Simple game loop for demonstration
export async function runGameLoop() {
    const game = new Game();
    await game.initialize();
    console.log('Game initialized. Player:', game.player);
    console.log('Starting room:', game.getCurrentRoom());

    // Example loop: log current room every 2 seconds
    setInterval(() => {
        const room = game.getCurrentRoom();
        console.log('Player is in:', room ? room.Name : 'Unknown');
    }, 2000);
}

// Usage: import { runGameLoop } from './game.js'; runGameLoop();

// Example usage:
// const game = new Game();
// await game.initialize();
// console.log(game.getCurrentRoom());
// game.movePlayerTo('some_room_id');
// console.log(game.getCurrentRoom());
