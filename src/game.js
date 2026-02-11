// Game entity initialization and loader integration
import { loadGameData } from './loader.js';
import { EventEngine } from './events/EventEngine.js';
import { EventController } from './events/EventController.js';
import { SceneLoader } from './events/SceneLoader.js';
import { SceneRunner } from './events/SceneRunner.js';
import { CommandRunner } from './events/CommandRunner.js';
import { TimerManager } from './events/TimerManager.js';
import { THREAD_DEFINITIONS } from './events/threadDefinitions.js';
import { buildThreadPlannedEvents } from './events/threadPlanner.js';
import { addExperience, applyLevelProgression } from './utils/leveling.js';
import { applyMoveActionCosts } from './utils/actionCosts.js';
import { ensureGameClock } from './utils/gameTime.js';
import { buildTravelEvents } from './utils/roomEventFlow.js';
import { chancePercent, cryptoRng, randomIntInclusive } from './utils/random.js';
import { applyLegacyContent } from './utils/legacyContent.js';

function normalizeLookupKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function buildPlannedEventMap(events) {
    const map = {};
    (Array.isArray(events) ? events : []).forEach(evt => {
        const id = String(evt?.id ?? '').trim();
        if (id) map[id] = evt;
    });
    return map;
}

export class Game {
    constructor() {
        this.player = null;
        this.rooms = [];
        this.objects = [];
        this.characters = [];
        this.plannedEvents = [];
        this.plannedEventMap = {};
        this.threadEvents = [];
        this.threadEventIndex = {};
        this.threadEventBySceneId = {};
        this.threadEventById = {};
        this.leveling = null;
        this.objectMap = {};
        this.objectNameMap = {};
        this.objectSourceMap = {};
        this.roomMap = {};
        this.characterMap = {};
        this.characterNameMap = {};
        this.variables = {};
        this.eventEngine = new EventEngine(this);
        this.eventController = new EventController(this);
        this.sceneLoader = new SceneLoader(this);
        this.sceneRunner = new SceneRunner(this);
        this.commandRunner = new CommandRunner(this);
        this.timerManager = new TimerManager(this);
        this.lastEventResult = null;
        this.lastLevelProgression = null;
        this.save = null;
        this.loadErrors = [];
        this.initialized = false;
        this.spawnState = {
            ephemeralCharacterIds: new Set(),
            pendingEncounter: null
        };
        this.timers = [];
        this.timerMap = {};
        this.timerNameMap = {};
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
        this.objectNameMap = data.objectNameMap ?? {};
        this.objectSourceMap = data.objectSourceMap ?? {};
        this.roomMap = data.roomMap;
        this.characterMap = data.characterMap;
        this.characterNameMap = data.characterNameMap ?? {};
        this.timers = Array.isArray(data.timers) ? data.timers : [];
        this.timerMap = data.timerMap ?? {};
        this.timerNameMap = data.timerNameMap ?? {};
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        if (!this.variables || typeof this.variables !== 'object') this.variables = {};
        if (data.texts && typeof data.texts === 'object') this.variables.texts = data.texts;
        applyLegacyContent(this);
        ensureGameClock(this.player);
        this.spawnState = { ephemeralCharacterIds: new Set(), pendingEncounter: null };
        this.eventController?.syncFlagsToVariables?.();
        if (this.timerManager) {
            this.timerManager.setTimers(this.timers);
            if (this.timerManager.timerMap) this.timerMap = this.timerManager.timerMap;
        }
        
        // Load scenes from DB/scenes/
        await this.sceneLoader.loadScenes();

        const threadBundle = buildThreadPlannedEvents({ threads: THREAD_DEFINITIONS, sceneLoader: this.sceneLoader });
        this.threadEvents = Array.isArray(threadBundle?.events) ? threadBundle.events : [];
        this.threadEventIndex = threadBundle?.threadIndex ?? {};
        this.threadEventBySceneId = threadBundle?.sceneToEvent ?? {};
        this.threadEventById = threadBundle?.byId ?? {};
        if (this.threadEvents.length) {
            this.plannedEvents = [...(this.plannedEvents || []), ...this.threadEvents];
        }
        this.plannedEventMap = buildPlannedEventMap(this.plannedEvents);
        
        this.initialized = true;

        // Fire initial room events so the UI can show system text immediately.
        const currentRoomId = this.player?.CurrentRoom ?? null;
        if (currentRoomId) {
            const plannedEnter = this.eventController?.run?.({ when: 'enter', roomId: currentRoomId, rng: cryptoRng }) ?? null;
            const plannedPresence = this.eventController?.run?.({ when: 'presence', roomId: currentRoomId, rng: cryptoRng }) ?? null;
            const roomEvents = this.runRoomEnterEvents(currentRoomId);
            const characterEvents = this.runCharacterEnterEvents(currentRoomId);
            const plannedCharacterEnter = this.runPlannedCharacterEnterEvents(currentRoomId);
            const plannedTexts = [
                ...(Array.isArray(plannedEnter?.texts) ? plannedEnter.texts : []),
                ...(Array.isArray(plannedPresence?.texts) ? plannedPresence.texts : []),
                ...(Array.isArray(plannedCharacterEnter?.texts) ? plannedCharacterEnter.texts : [])
            ];
            const roomTexts = Array.isArray(roomEvents?.texts) ? roomEvents.texts : [];
            const characterTexts = Array.isArray(characterEvents?.texts) ? characterEvents.texts : [];
            const sceneData =
                plannedCharacterEnter?.sceneData ||
                characterEvents?.sceneData ||
                roomEvents?.sceneData ||
                plannedPresence?.sceneData ||
                plannedEnter?.sceneData ||
                null;
            this.lastEventResult = {
                texts: [...plannedTexts, ...roomTexts, ...characterTexts],
                media: plannedCharacterEnter?.media || characterEvents?.media || roomEvents?.media || plannedPresence?.media || plannedEnter?.media || null,
                paused: Boolean(plannedCharacterEnter?.paused || characterEvents?.paused || roomEvents?.paused || plannedPresence?.paused || plannedEnter?.paused),
                sceneData,
                errors: [
                    ...(plannedEnter?.errors || []),
                    ...(plannedPresence?.errors || []),
                    ...(plannedCharacterEnter?.errors || []),
                    ...(roomEvents?.errors || []),
                    ...(characterEvents?.errors || [])
                ]
            };
            this.lastLevelProgression = this.checkLevelProgression();
            this.markRoomVisited(currentRoomId);
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
        this.characterNameMap = data.characterNameMap ?? {};
        this.timers = Array.isArray(data.timers) ? data.timers : [];
        this.timerMap = data.timerMap ?? {};
        this.timerNameMap = data.timerNameMap ?? {};
        this.save = data.save ?? null;
        this.loadErrors = Array.isArray(data.loadErrors) ? data.loadErrors : [];
        if (!this.variables || typeof this.variables !== 'object') this.variables = {};
        if (data.texts && typeof data.texts === 'object') this.variables.texts = data.texts;
        ensureGameClock(this.player);
        this.spawnState = { ephemeralCharacterIds: new Set(), pendingEncounter: null };
        this.eventController?.syncFlagsToVariables?.();
        if (this.timerManager) {
            this.timerManager.setTimers(this.timers);
            if (this.timerManager.timerMap) this.timerMap = this.timerManager.timerMap;
        }
        const threadBundle = buildThreadPlannedEvents({ threads: THREAD_DEFINITIONS, sceneLoader: this.sceneLoader });
        this.threadEvents = Array.isArray(threadBundle?.events) ? threadBundle.events : [];
        this.threadEventIndex = threadBundle?.threadIndex ?? {};
        this.threadEventBySceneId = threadBundle?.sceneToEvent ?? {};
        this.threadEventById = threadBundle?.byId ?? {};
        if (this.threadEvents.length) {
            this.plannedEvents = [...(this.plannedEvents || []), ...this.threadEvents];
        }
        this.plannedEventMap = buildPlannedEventMap(this.plannedEvents);
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

    markRoomVisited(roomId) {
        const id = String(roomId ?? '').trim();
        if (!id || !this.roomMap?.[id] || !this.player) return;

        const room = this.roomMap[id];
        if (!room.bFirstTimeVisited) room.bFirstTimeVisited = true;

        if (!Array.isArray(this.player.VisitedRooms)) this.player.VisitedRooms = [];
        if (!this.player.VisitedRooms.includes(id)) this.player.VisitedRooms.push(id);
    }

    markRoomLeft(roomId) {
        const id = String(roomId ?? '').trim();
        if (!id || !this.roomMap?.[id]) return;
        const room = this.roomMap[id];
        if (!room.bFirstTimeLeft) room.bFirstTimeLeft = true;
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
        const leaveEvents = fromRoomId ? this.runRoomLeaveEvents(fromRoomId) : this.eventEngine.createResult();
        const characterLeaveEvents = fromRoomId ? this.runCharacterLeaveEvents(fromRoomId) : this.eventEngine.createResult();
        const plannedCharacterLeave = fromRoomId ? this.runPlannedCharacterLeaveEvents(fromRoomId) : this.eventEngine.createResult();
        this.player.CurrentRoom = roomId;
        applyMoveActionCosts(this.player);
        const timerEvents = this.timerManager?.advanceTurn?.() ?? null;

        const plannedEnter = this.eventController?.run?.({ when: 'enter', roomId, fromRoomId, toRoomId: roomId, rng: cryptoRng }) ?? null;
        const plannedPresence = this.eventController?.run?.({ when: 'presence', roomId, fromRoomId, toRoomId: roomId, rng: cryptoRng }) ?? null;
        const suppressCombat = Boolean(plannedExit?.suppressCombat || plannedEnter?.suppressCombat || plannedPresence?.suppressCombat);

        const spawns = this.runRoomEntrySpawns(roomId, { suppressCombat });
        const enterEvents = this.runRoomEnterEvents(roomId);
        const characterEvents = this.runCharacterEnterEvents(roomId);
        const plannedCharacterEnter = this.runPlannedCharacterEnterEvents(roomId);
        const events = buildTravelEvents({
            leaveEvents,
            characterLeaveEvents,
            plannedCharacterLeave,
            timerEvents,
            plannedEnter,
            plannedPresence,
            enterEvents,
            characterEvents,
            plannedCharacterEnter
        });
        this.markRoomVisited(roomId);
        if (fromRoomId) this.markRoomLeft(fromRoomId);
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

    mergeEventResults(target, source) {
        if (!target || !source) return target;
        if (Array.isArray(source.texts) && source.texts.length) {
            if (!Array.isArray(target.texts)) target.texts = [];
            target.texts.push(...source.texts);
        }
        if (source.media) target.media = source.media;
        if (source.startCombatEnemyId) target.startCombatEnemyId = source.startCombatEnemyId;
        if (!target.sceneData && source.sceneData) target.sceneData = source.sceneData;
        if (source.paused) target.paused = true;
        if (Array.isArray(source.errors) && source.errors.length) {
            if (!Array.isArray(target.errors)) target.errors = [];
            target.errors.push(...source.errors);
        }
        if (source.didSomething) target.didSomething = true;
        return target;
    }

    runRoomEnterEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const firstEnter = this.eventEngine.runEvent('<<On Player Enter First Time>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });
        const enter = this.eventEngine.runEvent('<<On Player Enter>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });

        return {
            texts: [...(firstEnter.texts || []), ...(enter.texts || [])],
            media: enter.media || firstEnter.media || null,
            sceneData: enter.sceneData || firstEnter.sceneData || null,
            paused: Boolean(firstEnter.paused || enter.paused),
            errors: [
                ...(firstEnter.errors || []),
                ...(enter.errors || [])
            ]
        };
    }

    runRoomLeaveEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const firstLeave = this.eventEngine.runEvent('<<On Player Leave First Time>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });
        const leave = this.eventEngine.runEvent('<<On Player Leave>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });

        return {
            texts: [...(firstLeave.texts || []), ...(leave.texts || [])],
            media: leave.media || firstLeave.media || null,
            sceneData: leave.sceneData || firstLeave.sceneData || null,
            paused: Boolean(firstLeave.paused || leave.paused),
            errors: [...(firstLeave.errors || []), ...(leave.errors || [])]
        };
    }

    runCharacterEnterEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const result = this.eventEngine.createResult();
        const chars = this.getRoomCharacters(roomId);

        for (const char of chars) {
            const charId = char?.id ?? char?.UniqueID ?? null;
            if (!charId) continue;

            const firstEnter = this.eventEngine.runEvent('<<On Player Enter First Time>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, firstEnter);

            const charEnter = this.eventEngine.runEvent('<<On Character Enter>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, charEnter);

            const enter = this.eventEngine.runEvent('<<On Player Enter>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, enter);
        }

        return result;
    }

    runCharacterLeaveEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const result = this.eventEngine.createResult();
        const chars = this.getRoomCharacters(roomId);

        for (const char of chars) {
            const charId = char?.id ?? char?.UniqueID ?? null;
            if (!charId) continue;

            const firstLeave = this.eventEngine.runEvent('<<On Player Leave First Time>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, firstLeave);

            const charLeave = this.eventEngine.runEvent('<<On Character Leave>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, charLeave);

            const leave = this.eventEngine.runEvent('<<On Player Leave>>', {
                entityType: 'character',
                entityId: charId,
                entity: char,
                character: char,
                room
            });
            this.mergeEventResults(result, leave);
        }

        return result;
    }

    runPlannedCharacterEnterEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const result = this.eventEngine.createResult();
        const chars = this.getRoomCharacters(roomId);
        for (const char of chars) {
            const charId = char?.id ?? char?.UniqueID ?? null;
            if (!charId) continue;
            const evt = this.eventController?.run?.({ when: 'character_enter', roomId, characterId: charId, rng: cryptoRng }) ?? null;
            this.mergeEventResults(result, evt);
        }
        return result;
    }

    runPlannedCharacterLeaveEvents(roomId) {
        const room = this.roomMap[roomId] ?? null;
        if (!room) return this.eventEngine.createResult();

        const result = this.eventEngine.createResult();
        const chars = this.getRoomCharacters(roomId);
        for (const char of chars) {
            const charId = char?.id ?? char?.UniqueID ?? null;
            if (!charId) continue;
            const evt = this.eventController?.run?.({ when: 'character_leave', roomId, characterId: charId, rng: cryptoRng }) ?? null;
            this.mergeEventResults(result, evt);
        }
        return result;
    }

    handleStoryEvent(storyEventData, roomId, room) {
        const scene = storyEventData.scene;

        // Run standard room events first
        const firstTime = this.eventEngine.runEvent('<<On Player Enter First Time>>', {
            entityType: 'room',
            entityId: roomId,
            room
        });

        // Start the scene at its first stage.
        const sceneResult = this.sceneRunner?.begin?.(scene.UniqueID);
        const sceneTexts = Array.isArray(sceneResult?.texts) ? sceneResult.texts : [];
        const sceneErrors = Array.isArray(sceneResult?.errors) ? sceneResult.errors : [];

        return {
            texts: [...(firstTime.texts || []), ...sceneTexts],
            media: sceneResult?.media || scene.Media || null,
            paused: Boolean(sceneResult?.paused),
            errors: [...(firstTime.errors || []), ...sceneErrors],
            sceneData: sceneResult?.sceneData || null,
            startCombatEnemyId: sceneResult?.startCombatEnemyId || null
        };
    }

    handleCombatEvent(combatEventData, roomId, room) {
        const enemy = combatEventData.enemy;
        
        // Store combat encounter
        this.spawnState.pendingEncounter = {
            enemy: enemy,
            description: combatEventData.description
        };

        return {
            texts: [
                combatEventData.description,
                `[Combat Initiated]`
            ],
            media: null,
            paused: true, // Pause for combat
            errors: [],
            combatData: this.spawnState.pendingEncounter
        };
    }

    handleRandomEvent(randomEventData, roomId, room) {
        const scene = randomEventData.scene;
        
        if (scene) {
            // Scene-based random event
            this.spawnState.pendingScene = {
                sceneId: scene.UniqueID,
                scene: scene,
                category: randomEventData.category
            };

            return {
                texts: [
                    `[${randomEventData.category.toUpperCase()}]`,
                    randomEventData.description
                ],
                media: scene.Media || null,
                paused: false, // Don't pause for random events unless scene requires it
                errors: [],
                sceneData: this.spawnState.pendingScene
            };
        } else {
            // Simple random event (e.g., generic witness event)
            return {
                texts: [randomEventData.description],
                media: null,
                paused: false,
                errors: []
            };
        }
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
        const nameKey = normalizeLookupKey(id);
        const char = this.characterMap?.[id] ?? this.characterNameMap?.[nameKey] ?? null;
        if (!char) return false;
        char.currentRoomId = room;
        if (Object.prototype.hasOwnProperty.call(char, 'CurrentRoom')) char.CurrentRoom = room;
        if (this.spawnState?.ephemeralCharacterIds instanceof Set) {
            const resolvedId = String(char?.id ?? char?.UniqueID ?? id).trim();
            if (resolvedId) this.spawnState.ephemeralCharacterIds.add(resolvedId);
        }
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

        const witnessResult = runSpawn('spawn_witness');
        if (witnessResult?.triggered && Array.isArray(witnessResult.texts) && witnessResult.texts.length) {
            texts.push(...witnessResult.texts);
        }

        const citizenResult = runSpawn('spawn_citizen');
        if (citizenResult?.triggered && Array.isArray(citizenResult.texts) && citizenResult.texts.length) {
            texts.push(...citizenResult.texts);
        }

        // Room-level random residents (independent of planned events).
        // If a room defines a Residents list, we pick randomly and try to spawn one.
        this.runRoomResidentsSpawn(roomId, { rng });

        const spawnedIds = this.spawnState?.ephemeralCharacterIds instanceof Set ? [...this.spawnState.ephemeralCharacterIds] : [];
        return { texts, encounter: null, spawnedIds };
    }

    runRoomResidentsSpawn(roomId, { rng = cryptoRng } = {}) {
        const room = this.roomMap?.[roomId] ?? null;
        if (!room) return { triggered: false, spawnedId: null };

        const roomGroup = room?.Group ?? room?.group ?? room?.LocationGroup ?? room?.locationGroup ?? '';
        const matchesSpawnArea = (char) => {
            const group = String(roomGroup ?? '').trim();
            if (!group) return true;

            const raw =
                char?.SpawnAreas ??
                char?.spawnAreas ??
                char?.SpawnArea ??
                char?.spawnArea ??
                char?.spawn_area ??
                null;
            if (!raw) return true;

            const areas = Array.isArray(raw)
                ? raw.map(v => String(v ?? '').trim()).filter(Boolean)
                : [String(raw ?? '').trim()].filter(Boolean);
            if (!areas.length) return true;

            const groupKey = String(group).trim().toLowerCase();
            return areas.some(area => {
                const key = String(area).trim().toLowerCase();
                return key === '*' || key === 'any' || key === groupKey;
            });
        };

        const residentDefsExplicit = Array.isArray(room?.Residents)
            ? room.Residents
            : Array.isArray(room?.residents)
                ? room.residents
                : [];

        // Back-compat: some rooms (and tests) historically used `NPCs` entries with per-resident `Chance`
        // values for ambient resident-style spawning, without a separate `Residents` list.
        const npcDefsForChanceResidents = Array.isArray(room?.NPCs)
            ? room.NPCs
            : Array.isArray(room?.npcs)
                ? room.npcs
                : [];
        const npcDefsWithChance = npcDefsForChanceResidents.filter(entry => {
            if (!entry || typeof entry !== 'object') return false;
            return (
                entry.Chance != null ||
                entry.chance != null ||
                entry.Prob != null ||
                entry.prob != null ||
                entry.Probability != null ||
                entry.probability != null
            );
        });

        const residentDefs = residentDefsExplicit.length ? residentDefsExplicit : npcDefsWithChance;

        const spawnResidentsFromNpcsRaw =
            room?.SpawnResidentsFromNPCs ??
            room?.spawnResidentsFromNPCs ??
            room?.spawn_residents_from_npcs ??
            room?.SpawnResidentsFromNPCList ??
            room?.spawnResidentsFromNpcList ??
            null;
        const spawnResidentsFromNpcs =
            spawnResidentsFromNpcsRaw === true ||
            spawnResidentsFromNpcsRaw === 1 ||
            String(spawnResidentsFromNpcsRaw ?? '').trim().toLowerCase() === 'true';

        // Optional: if a room has no explicit Residents list, it can still spawn "ambient" residents
        // from its NPCs table (using SpawnAreas filtering) if enabled.
        if (!residentDefs.length && spawnResidentsFromNpcs) {
            const npcDefs = Array.isArray(room?.NPCs)
                ? room.NPCs
                : Array.isArray(room?.npcs)
                    ? room.npcs
                    : [];
            if (!npcDefs.length) return { triggered: false, spawnedId: null };

            const candidates = npcDefs
                .map(entry => {
                    const id = String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim();
                    if (!id) return null;

                    const char = this.characterMap?.[id] ?? null;
                    if (!char) return null;

                    const currentRoomId = char?.currentRoomId ?? char?.CurrentRoom ?? char?.location ?? null;
                    if (String(currentRoomId ?? '').trim()) return null;

                    if (!matchesSpawnArea(char)) return null;

                    const rawWeight = entry?.Weight ?? entry?.weight ?? 1;
                    const weightNum = Number(rawWeight);
                    const weight = Number.isFinite(weightNum) ? Math.max(0, weightNum) : 1;
                    return { id, weight };
                })
                .filter(Boolean);

            if (!candidates.length) return { triggered: false, spawnedId: null };

            let totalWeight = 0;
            for (const c of candidates) totalWeight += Number(c.weight) || 0;
            if (totalWeight <= 0) return { triggered: false, spawnedId: null };

            const roll = rng() * totalWeight;
            let running = 0;
            let picked = candidates[candidates.length - 1];
            for (const c of candidates) {
                running += Number(c.weight) || 0;
                if (roll < running) {
                    picked = c;
                    break;
                }
            }

            const residentChanceRaw =
                room?.ResidentSpawnChance ??
                room?.residentSpawnChance ??
                room?.ResidentChance ??
                room?.residentChance ??
                null;
            const residentChanceParsed = Number(residentChanceRaw);
            const chance = Number.isFinite(residentChanceParsed)
                ? Math.min(80, Math.max(55, Math.round(residentChanceParsed)))
                : randomIntInclusive(55, 80, rng);

            if (!chancePercent(chance, rng)) return { triggered: false, spawnedId: null };

            if (this.placeCharacterInRoom?.(picked.id, roomId)) {
                if (!this.variables || typeof this.variables !== 'object') this.variables = {};
                this.variables.last_spawn_resident_id = picked.id;
                this.variables.last_spawn_resident_room_id = roomId;
                this.variables.last_spawn_room_id = roomId;
                return { triggered: true, spawnedId: picked.id };
            }

            return { triggered: false, spawnedId: null };
        }

        if (!residentDefs.length) return { triggered: false, spawnedId: null };

        const candidates = residentDefs
            .map(entry => {
                const id = String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim();
                if (!id) return null;
                const char = this.characterMap?.[id] ?? null;
                if (!char) return null;

                const currentRoomId = char?.currentRoomId ?? char?.CurrentRoom ?? char?.location ?? null;
                if (String(currentRoomId ?? '').trim()) return null;

                if (!matchesSpawnArea(char)) return null;

                const rawChance = entry?.Chance ?? entry?.chance ?? entry?.Prob ?? entry?.prob ?? entry?.Probability ?? entry?.probability;
                const parsedChance = Number(rawChance);
                const chance = Number.isFinite(parsedChance)
                    ? Math.min(80, Math.max(55, Math.round(parsedChance)))
                    : null;

                return { id, chance };
            })
            .filter(Boolean);

        if (!candidates.length) return { triggered: false, spawnedId: null };

        const pickIndex = (maxInclusive) => randomIntInclusive(0, maxInclusive, rng);

        // Try candidates in random order until one spawns.
        const pool = [...candidates];
        while (pool.length) {
            const idx = pickIndex(pool.length - 1);
            const picked = pool.splice(idx, 1)[0];
            if (!picked?.id) continue;

            const chance = picked.chance ?? randomIntInclusive(55, 80, rng);
            if (!chancePercent(chance, rng)) continue;

            if (this.placeCharacterInRoom?.(picked.id, roomId)) {
                if (!this.variables || typeof this.variables !== 'object') this.variables = {};
                this.variables.last_spawn_resident_id = picked.id;
                this.variables.last_spawn_resident_room_id = roomId;
                this.variables.last_spawn_room_id = roomId;
                return { triggered: true, spawnedId: picked.id };
            }
        }

        return { triggered: false, spawnedId: null };
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

    // Example loop (no logging by default)
    setInterval(() => {
        game.getCurrentRoom();
    }, 2000);
}

// Usage: import { runGameLoop } from './game.js'; runGameLoop();

// Example usage:
// const game = new Game();
// await game.initialize();
// console.log(game.getCurrentRoom());
// game.movePlayerTo('some_room_id');
// console.log(game.getCurrentRoom());
