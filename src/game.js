// Game entity initialization and loader integration
import { loadGameData } from './loader.js';
import { EventEngine } from './events/EventEngine.js';
import { addExperience, applyLevelProgression } from './utils/leveling.js';
import { applyMoveActionCosts } from './utils/actionCosts.js';
import { ensureGameClock } from './utils/gameTime.js';

export class Game {
    constructor() {
        this.player = null;
        this.rooms = [];
        this.objects = [];
        this.characters = [];
        this.leveling = null;
        this.objectMap = {};
        this.objectSourceMap = {};
        this.roomMap = {};
        this.characterMap = {};
        this.variables = {};
        this.eventEngine = new EventEngine(this);
        this.lastEventResult = null;
        this.lastLevelProgression = null;
        this.save = null;
        this.loadErrors = [];
        this.initialized = false;
    }

    async initialize() {
        const data = await loadGameData();
        this.player = data.player;
        this.rooms = data.rooms;
        this.objects = data.objects;
        this.characters = data.characters;
        this.leveling = data.leveling ?? null;
        this.objectMap = data.objectMap;
        this.objectSourceMap = data.objectSourceMap ?? {};
        this.roomMap = data.roomMap;
        this.characterMap = data.characterMap;
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        ensureGameClock(this.player);
        this.initialized = true;

        // Fire initial room events so the UI can show system text immediately.
        const currentRoomId = this.player?.CurrentRoom ?? null;
        if (currentRoomId) {
            this.lastEventResult = this.runRoomEnterEvents(currentRoomId);
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
        this.leveling = data.leveling ?? null;
        this.objectMap = data.objectMap;
        this.objectSourceMap = data.objectSourceMap ?? {};
        this.roomMap = data.roomMap;
        this.characterMap = data.characterMap;
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        ensureGameClock(this.player);
        this.initialized = true;

        const resolvedRoomId =
            previousRoomId && this.roomMap?.[previousRoomId]
                ? previousRoomId
                : (this.player?.CurrentRoom ?? null);

        if (resolvedRoomId) this.player.CurrentRoom = resolvedRoomId;
        if (this.eventEngine) this.eventEngine.game = this;

        return { roomId: resolvedRoomId };
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
        this.player.CurrentRoom = roomId;
        applyMoveActionCosts(this.player);
        const events = this.runRoomEnterEvents(roomId);
        const levelProgression = this.checkLevelProgression();
        this.lastEventResult = events;
        this.lastLevelProgression = levelProgression;
        return { moved: true, events, levelProgression };
    }

    checkLevelProgression() {
        return applyLevelProgression(this.player, this.leveling);
    }

    gainExperience(amount) {
        const result = addExperience(this.player, amount, this.leveling);
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
