import { loadSaveGame } from './utils/saveGame.js';
import { parsePlannedEventsDocument } from './events/PlannedEvent.js';
import { getRoomImage } from './utils/roomUtils.js';

// This loader is for Reddit html AIF/src, not regalia.

function normalizeLookupKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeLookupKeyLoose(value) {
    return normalizeLookupKey(value).replace(/[^a-z0-9]/g, '');
}

function normalizeArrayLike(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];

    const numericEntries = Object.entries(value)
        .filter(([key]) => /^\d+$/.test(key))
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, entry]) => entry);

    return numericEntries;
}

function stripJsonComments(input) {
    let output = '';
    let inString = false;
    let stringDelimiter = '"';
    let inSingleLineComment = false;
    let inMultiLineComment = false;

    const isEscaped = (text, index) => {
        let backslashCount = 0;
        for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashCount++;
        return backslashCount % 2 === 1;
    };

    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        const next = input[i + 1];

        if (inSingleLineComment) {
            if (char === '\n') {
                inSingleLineComment = false;
                output += char;
            }
            continue;
        }

        if (inMultiLineComment) {
            if (char === '*' && next === '/') {
                inMultiLineComment = false;
                i++; // Skip '/'
            }
            continue;
        }

        if (inString) {
            output += char;
            if (char === stringDelimiter && !isEscaped(input, i)) {
                inString = false;
            }
            continue;
        }

        if (char === '"' || char === "'") {
            inString = true;
            stringDelimiter = char;
            output += char;
            continue;
        }

        if (char === '/' && next === '/') {
            inSingleLineComment = true;
            i++; // Skip second '/'
            continue;
        }

        if (char === '/' && next === '*') {
            inMultiLineComment = true;
            i++; // Skip '*'
            continue;
        }

        output += char;
    }

    return output;
}

function applyVariableDefaults(player, schema) {
    if (!player) return;
    if (!player.Stats || typeof player.Stats !== 'object') player.Stats = {};
    if (!schema || typeof schema !== 'object') return;

    const defaults = schema.variables && typeof schema.variables === 'object' ? schema.variables : null;
    if (!defaults) return;

    for (const [name, def] of Object.entries(defaults)) {
        if (player.Stats[name] !== undefined) continue;
        const type = String(def?.type ?? '').trim().toLowerCase();
        if ('default' in def) {
            player.Stats[name] = def.default;
            continue;
        }
        if (type === 'number') player.Stats[name] = 0;
        else if (type === 'string') player.Stats[name] = '';
        else player.Stats[name] = false;
    }
}

function buildRoomIndex(rooms) {
    const byId = new Map();
    const byName = new Map();
    const bySDesc = new Map();
    const byNameLoose = new Map();
    const bySDescLoose = new Map();

    for (const room of rooms) {
        const roomId = String(room?.UniqueID ?? '').trim();
        if (!roomId) continue;
        byId.set(roomId, roomId);

        const nameKey = normalizeLookupKey(room?.Name);
        if (nameKey && !byName.has(nameKey)) byName.set(nameKey, roomId);

        const sDescKey = normalizeLookupKey(room?.SDesc);
        if (sDescKey && !bySDesc.has(sDescKey)) bySDesc.set(sDescKey, roomId);

        const nameLooseKey = normalizeLookupKeyLoose(room?.Name);
        if (nameLooseKey && !byNameLoose.has(nameLooseKey)) byNameLoose.set(nameLooseKey, roomId);

        const sDescLooseKey = normalizeLookupKeyLoose(room?.SDesc);
        if (sDescLooseKey && !bySDescLoose.has(sDescLooseKey)) bySDescLoose.set(sDescLooseKey, roomId);
    }

    return { byId, byName, bySDesc, byNameLoose, bySDescLoose };
}

function resolveRoomId(destinationRoom, roomIndex, rooms) {
    const raw = String(destinationRoom ?? '').trim();
    if (!raw) return null;

    if (roomIndex.byId.has(raw)) return roomIndex.byId.get(raw);

    const key = normalizeLookupKey(raw);
    if (roomIndex.byName.has(key)) return roomIndex.byName.get(key);
    if (roomIndex.bySDesc.has(key)) return roomIndex.bySDesc.get(key);

    const looseKey = normalizeLookupKeyLoose(raw);
    if (looseKey && roomIndex.byNameLoose.has(looseKey)) return roomIndex.byNameLoose.get(looseKey);
    if (looseKey && roomIndex.bySDescLoose.has(looseKey)) return roomIndex.bySDescLoose.get(looseKey);

    const candidates = rooms.filter(room => {
        const roomName = normalizeLookupKey(room?.Name);
        const roomSDesc = normalizeLookupKey(room?.SDesc);
        return (roomName && roomName.includes(key)) || (roomSDesc && roomSDesc.includes(key));
    });
    if (candidates.length === 1) return String(candidates[0].UniqueID ?? '').trim() || null;

    return null;
}

// Loader for all main game data (player, rooms, objects, characters)
export async function loadGameData() {
    // Helper to fetch and parse JSON
    async function fetchJSON(path) {
        const rawPath = String(path ?? '');
        const normalizedPath = rawPath.startsWith('/') || rawPath.startsWith('http') ? rawPath : `/${rawPath}`;

        const response = await fetch(normalizedPath, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load ${rawPath}`);

        const rawText = await response.text();
        const trimmed = rawText.trimStart();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
            throw new Error(`Invalid JSON in ${rawPath}: received HTML (file missing or wrong path)`);
        }
        try {
            return JSON.parse(rawText);
        } catch {
            try {
                return JSON.parse(stripJsonComments(rawText));
            } catch (parseError) {
                throw new Error(`Invalid JSON in ${rawPath}: ${parseError?.message ?? String(parseError)}`);
            }
        }
    }

    const loadErrors = [];

    // Load leveling + planned events (kept inside the loader to avoid top-level await)
    let leveling = null;
    try {
        leveling = await fetchJSON('DB/leveling.json');
    } catch (error) {
        loadErrors.push({
            kind: 'leveling',
            path: 'DB/leveling.json',
            error: error?.message || String(error)
        });
        leveling = null;
    }

    let plannedEvents = [];
    try {
        const eventsRaw = await fetchJSON('DB/events.json');
        plannedEvents = parsePlannedEventsDocument(eventsRaw);
    } catch (error) {
        loadErrors.push({
            kind: 'plannedEvents',
            path: 'DB/events.json',
            error: error?.message || String(error)
        });
        plannedEvents = [];
    }

    let timers = [];
    try {
        const timersRaw = await fetchJSON('DB/timers.json');
        if (Array.isArray(timersRaw?.timers)) {
            timers = timersRaw.timers;
        } else if (Array.isArray(timersRaw)) {
            timers = timersRaw;
        } else {
            const fromNested = normalizeArrayLike(timersRaw?.timers);
            const fromRoot = normalizeArrayLike(timersRaw);
            timers = fromNested.length ? fromNested : fromRoot;
        }
    } catch (error) {
        loadErrors.push({
            kind: 'timers',
            path: 'DB/timers.json',
            error: error?.message || String(error)
        });
        timers = [];
    }

    let variableSchema = null;
    let textLibrary = null;
    try {
        variableSchema = await fetchJSON('DB/variables.schema.json');
    } catch (error) {
        loadErrors.push({
            kind: 'variables',
            path: 'DB/variables.schema.json',
            error: error?.message || String(error)
        });
        variableSchema = null;
    }
    try {
        textLibrary = await fetchJSON('DB/texts.json');
    } catch (error) {
        loadErrors.push({
            kind: 'texts',
            path: 'DB/texts.json',
            error: error?.message || String(error)
        });
        textLibrary = null;
    }

    async function loadCharactersFromCategoryIndexes() {
        const categories = [
            { key: 'enemies', dir: 'DB/characters/enemies', index: 'DB/characters/enemies/index.json' },
            { key: 'bosses', dir: 'DB/characters/bosses', index: 'DB/characters/bosses/index.json' },
            { key: 'r_citizens', dir: 'DB/characters/r_citizens', index: 'DB/characters/r_citizens/index.json' },
            { key: 'main', dir: 'DB/characters/main', index: 'DB/characters/main/index.json' },
            { key: 'secondary', dir: 'DB/characters/secondary', index: 'DB/characters/secondary/index.json' },
            { key: 'mental_minions', dir: 'DB/characters/mental_minions', index: 'DB/characters/mental_minions/index.json' }
        ];

        const fileList = [];
        const seenIds = new Set();
        let loadedAnyIndex = false;

        for (const category of categories) {
            try {
                const indexJson = await fetchJSON(category.index);
                loadedAnyIndex = true;
                const idsRaw = Array.isArray(indexJson?.Characters)
                    ? indexJson.Characters
                    : Array.isArray(indexJson?.characters)
                        ? indexJson.characters
                        : [];

                for (const rawId of idsRaw) {
                    const id = String(rawId ?? '').trim();
                    if (!id) continue;
                    if (seenIds.has(id)) {
                        loadErrors.push({
                            kind: 'character',
                            path: category.index,
                            error: `Duplicate character id in indexes: ${id}`
                        });
                        continue;
                    }
                    seenIds.add(id);
                    fileList.push({ id, path: `${category.dir}/${id}.json`, category: category.key });
                }
            } catch {
                // Ignore missing index files so the loader can fall back to legacy schemas.
            }
        }

        if (!loadedAnyIndex) return null;

        const results = await Promise.allSettled(fileList.map(entry => fetchJSON(entry.path)));
        const characters = [];

        for (let idx = 0; idx < results.length; idx++) {
            const source = fileList[idx]?.path || null;
            const result = results[idx];

            if (result.status !== 'fulfilled') {
                loadErrors.push({
                    kind: 'character',
                    path: source,
                    error: result.reason?.message || String(result.reason)
                });
                continue;
            }

            const character = result.value;
            const id = character?.UniqueID || character?.id || null;
            if (!id) {
                loadErrors.push({
                    kind: 'character',
                    path: source,
                    error: 'Missing UniqueID/id'
                });
                continue;
            }

            characters.push({
                ...character,
                __category: fileList[idx]?.category ?? null
            });
        }

        return characters;
    }

    async function loadCharactersFromDevList() {
        if (!import.meta?.env?.DEV) return null;

        try {
            const response = await fetch('/api/db/list?dir=DB/characters', { cache: 'no-store' });
            if (!response.ok) return null;
            const payload = await response.json();

            const files = Array.isArray(payload?.files)
                ? payload.files
                    .map(entry => String(entry ?? '').trim())
                    .filter(entry => entry && entry.startsWith('DB/characters/') && entry.toLowerCase().endsWith('.json'))
                : [];
            const characterFiles = files.filter(entry => !entry.toLowerCase().endsWith('/index.json') && !entry.toLowerCase().endsWith('/characters.json'));
            if (!characterFiles.length) return null;

            const entries = characterFiles.map(entry => {
                const normalized = String(entry ?? '').replace(/\\/g, '/');
                const parts = normalized.split('/');
                const category = parts.length >= 3 && parts[0] === 'DB' && parts[1] === 'characters' ? parts[2] : null;
                return { path: entry, category };
            });
            const results = await Promise.allSettled(entries.map(entry => fetchJSON(entry.path)));
            const characters = [];

            for (let idx = 0; idx < results.length; idx++) {
                const source = entries[idx]?.path || null;
                const result = results[idx];

                if (result.status !== 'fulfilled') {
                    loadErrors.push({
                        kind: 'character',
                        path: source,
                        error: result.reason?.message || String(result.reason)
                    });
                    continue;
                }

                const character = result.value;
                const id = character?.UniqueID || character?.id || null;
                if (!id) {
                    loadErrors.push({
                        kind: 'character',
                        path: source,
                        error: 'Missing UniqueID/id'
                    });
                    continue;
                }

                characters.push({
                    ...character,
                    __category: entries[idx]?.category ?? null
                });
            }

            return characters;
        } catch {
            return null;
        }
    }

    async function loadCharacters() {
        const fromIndexes = await loadCharactersFromCategoryIndexes();
        if (fromIndexes) return fromIndexes;

        const fromList = await loadCharactersFromDevList();
        if (fromList) return fromList;

        try {
            const legacy = await fetchJSON('DB/characters/characters.json');
            return Array.isArray(legacy) ? legacy : normalizeArrayLike(legacy);
        } catch (error) {
            loadErrors.push({
                kind: 'character',
                path: 'DB/characters/characters.json',
                error: error?.message || String(error)
            });
            return [];
        }
    }

    // Load core data

    const [player, roomsIndex, characters, fullIndex] = await Promise.all([
        fetchJSON('DB/player.json'),
        fetchJSON('DB/rooms/index.json'),
        loadCharacters(),
        fetchJSON('DB/full_index.json').catch(() => null)
    ]);

    // Load all room files listed in the index
    let roomsList = [];
    if (Array.isArray(roomsIndex?.files)) {
        const roomFiles = roomsIndex.files
            .filter(f => f.toLowerCase().endsWith('.json') && !f.endsWith('index.json'));
        const roomResults = await Promise.allSettled(roomFiles.map(f => fetchJSON(f)));
        roomsList = [];
        roomResults.forEach((result, index) => {
            const filePath = roomFiles[index];
            if (result.status === 'fulfilled' && result.value && result.value.UniqueID) {
                roomsList.push(result.value);
                return;
            }
            const errorMessage =
                result.status === 'rejected'
                    ? result.reason?.message || String(result.reason)
                    : 'Room missing UniqueID';
            loadErrors.push({
                kind: 'room',
                path: filePath,
                error: errorMessage
            });
        });
    }

    if (Array.isArray(fullIndex?.files) && Array.isArray(roomsIndex?.files)) {
        const normalizePath = value => String(value ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
        const fullFiles = new Set(fullIndex.files.map(normalizePath));
        const roomFiles = new Set(roomsIndex.files.map(normalizePath));
        const fullRoomFiles = Array.from(fullFiles).filter(entry => entry.startsWith('DB/rooms/'));

        for (const roomFile of roomFiles) {
            if (!roomFile) continue;
            if (!fullFiles.has(roomFile)) {
                loadErrors.push({
                    kind: 'roomsIndex',
                    path: roomFile,
                    error: 'Missing from DB/full_index.json'
                });
            }
        }

        for (const roomFile of fullRoomFiles) {
            if (!roomFile) continue;
            if (!roomFiles.has(roomFile)) {
                loadErrors.push({
                    kind: 'roomsIndex',
                    path: roomFile,
                    error: 'Present in DB/full_index.json but missing from DB/rooms/index.json'
                });
            }
        }
    }

    // Compatibility: some content pipelines still edit DB/rooms.json (legacy monolith).
    // Merge only NPC-style lists into the per-room objects so spawns can work.
    try {
        const legacyRooms = await fetchJSON('DB/rooms.json');
        const legacyList = Array.isArray(legacyRooms) ? legacyRooms : Array.isArray(legacyRooms?.rooms) ? legacyRooms.rooms : [];
        if (Array.isArray(legacyList) && legacyList.length) {
            const legacyById = new Map(
                legacyList
                    .map(r => {
                        const id = String(r?.UniqueID ?? '').trim();
                        return id ? [id, r] : null;
                    })
                    .filter(Boolean)
            );

            roomsList = roomsList.map(room => {
                const roomId = String(room?.UniqueID ?? '').trim();
                const legacy = roomId ? legacyById.get(roomId) : null;
                if (!legacy) return room;

                const merged = { ...room };

                const legacyNpcs = Array.isArray(legacy?.NPCs) ? legacy.NPCs : Array.isArray(legacy?.npcs) ? legacy.npcs : null;
                const legacyResidents = Array.isArray(legacy?.Residents)
                    ? legacy.Residents
                    : Array.isArray(legacy?.residents)
                        ? legacy.residents
                        : null;

                const roomNpcs = Array.isArray(room?.NPCs) ? room.NPCs : Array.isArray(room?.npcs) ? room.npcs : null;
                const roomResidents = Array.isArray(room?.Residents)
                    ? room.Residents
                    : Array.isArray(room?.residents)
                        ? room.residents
                        : null;

                if (legacyNpcs && (!roomNpcs || roomNpcs.length === 0)) merged.NPCs = legacyNpcs;
                if (legacyResidents && (!roomResidents || roomResidents.length === 0)) merged.Residents = legacyResidents;

                return merged;
            });
        }
    } catch {
        // Optional legacy file.
    }
    const roomIndex = buildRoomIndex(roomsList);

    // Default new games to the configured starting room. Save data can still override CurrentRoom later.
    const startingRoomRaw = player?.StartingRoom ?? player?.startingRoom ?? null;
    const startingRoomId = resolveRoomId(startingRoomRaw, roomIndex, roomsList);
    if (startingRoomId) player.CurrentRoom = startingRoomId;

    // Extract rooms array from roomsRaw and normalize a few fields for UI use
    const rooms = roomsList.map(room => {
        const roomId = String(room?.UniqueID ?? '').trim();
        const roomName = room?.Name ?? room?.name ?? '';
        const roomDescription = room?.Description ?? room?.description ?? '';
        // Always resolve roomMedia to a string using getRoomImage for UI compatibility
        const roomMedia = getRoomImage(room, typeof gameTime !== 'undefined' ? gameTime : null);

                const exitsRaw = Array.isArray(room?.Exits) ? room.Exits : [];
                const exits = exitsRaw
                    .map(exit => {
                        const direction = String(exit?.Direction ?? exit?.direction ?? '').trim();
                        const destinationRaw = exit?.DestinationRoom ?? exit?.destination ?? null;
                        const destinationText = typeof destinationRaw === 'string' ? destinationRaw.trim() : '';
                        const showIfRaw = exit?.ShowIf ?? exit?.showIf ?? exit?.CondStr ?? exit?.condStr ?? null;
                        const showIf = typeof showIfRaw === 'string' ? showIfRaw.trim() : showIfRaw;
                        const todo = Boolean(exit?.Todo ?? exit?.todo ?? false);
                        const todoLabel = exit?.TodoLabel ?? exit?.todoLabel ?? null;
                        const destinationId = destinationText ? resolveRoomId(destinationText, roomIndex, roomsList) : null;
                        const destinationRoom = destinationId
                            ? roomsList.find(r => String(r?.UniqueID ?? '').trim() === destinationId)
                            : null;

                        return {
                            direction,
                            destinationId,
                            destinationName: destinationRoom?.Name ?? destinationText,
                            destinationRaw: destinationRaw ?? destinationText,
                            showIf: showIf ?? null,
                            todo: todo || undefined,
                            todoLabel: todoLabel ?? null
                        };
                    })
                    .filter(exit => exit.direction);

        const objectsRaw = Array.isArray(room?.Objects) ? room.Objects : [];
        const objects = objectsRaw.map((obj, idx) => {
            const objId = obj?.UniqueID ?? obj?.id ?? `${roomId || roomName || 'room'}::obj::${idx}`;
            return {
                ...obj,
                id: objId,
                name: obj?.Name ?? obj?.name ?? '',
                description: obj?.Description ?? obj?.description ?? '',
                media: obj?.Picture ?? obj?.media ?? null
            };
        });

        return {
            ...room,
            id: roomId,
            name: roomName,
            description: roomDescription,
            media: roomMedia,
            exits,
            objects,
            bFirstTimeVisited: room?.bFirstTimeVisited !== undefined ? Boolean(room.bFirstTimeVisited) : false,
            bFirstTimeLeft: room?.bFirstTimeLeft !== undefined ? Boolean(room.bFirstTimeLeft) : false
        };
    });


    // Load all object instances using the generated DB/full_index.json
    let objectFiles = [];
    try {
        const indexData = await fetchJSON('DB/full_index.json');
        if (Array.isArray(indexData?.files)) {
            // Only include object files (DB/objects/...) and skip index.json itself
            objectFiles = indexData.files
                .filter(f => f.startsWith('DB/objects/') && f.toLowerCase().endsWith('.json') && !f.endsWith('index.json'))
                .sort((a, b) => a.localeCompare(b));
        }
    } catch (e) {
        loadErrors.push({ kind: 'object', path: 'DB/full_index.json', error: e?.message || String(e) });
        objectFiles = [];
    }

    const objectResults = await Promise.allSettled(objectFiles.map(fetchJSON));
    const objects = [];
    const objectSourceMap = {};

    for (let idx = 0; idx < objectResults.length; idx++) {
        const source = objectFiles[idx] || null;
        const result = objectResults[idx];

        if (result.status !== 'fulfilled') {
            loadErrors.push({
                kind: 'object',
                path: source,
                error: result.reason?.message || String(result.reason)
            });
            continue;
        }

        const rawObject = result.value;
        const objectId = rawObject?.UniqueID || rawObject?.id;
        if (!objectId) {
            loadErrors.push({
                kind: 'object',
                path: source,
                error: 'Missing UniqueID/id'
            });
            continue;
        }

        const mapped = {
            ...rawObject,
            media: rawObject?.Picture || rawObject?.picture || rawObject?.media || null,
            id: objectId,
            name: rawObject?.Name ?? rawObject?.name ?? '',
            description: rawObject?.Description ?? rawObject?.description ?? ''
        };
        objects.push(mapped);
        if (source) objectSourceMap[mapped.id] = source;
    }

    // Map characters
    const characterList = Array.isArray(characters) ? characters : normalizeArrayLike(characters);
    const mappedCharacters = characterList.map(char => ({
        ...char,
        media: char?.Picture || char?.media || null,
        id: char?.UniqueID || char?.id,
        name: char?.Charname ?? char?.Name ?? char?.name ?? '',
        description: char?.Description ?? char?.description ?? '',
        currentRoomId: char?.CurrentRoom ?? char?.currentRoom ?? char?.location ?? null,
        category: char?.__category ?? char?.category ?? null
    }));

    // Build lookup maps
    const objectMap = {};
    const objectNameMap = {};
    objects.forEach(obj => {
        if (!obj?.id) return;
        objectMap[obj.id] = obj;
        const names = [
            obj?.Name,
            obj?.name,
            obj?.SDesc,
            obj?.sdesc
        ]
            .map(value => normalizeLookupKey(value))
            .filter(Boolean);
        const looseNames = [
            obj?.Name,
            obj?.name,
            obj?.SDesc,
            obj?.sdesc
        ]
            .map(value => normalizeLookupKeyLoose(value))
            .filter(Boolean);

        for (const key of names) {
            if (!objectNameMap[key]) objectNameMap[key] = obj;
        }
        for (const key of looseNames) {
            if (!objectNameMap[key]) objectNameMap[key] = obj;
        }
    });

    const roomMap = {};
    rooms.forEach(room => { roomMap[room.id] = room; });

    const characterMap = {};
    mappedCharacters.forEach(char => {
        if (char?.id) characterMap[char.id] = char;
    });

    const characterNameMap = {};
    mappedCharacters.forEach(char => {
        const names = [
            char?.CharnameOverride,
            char?.Charname,
            char?.Name,
            char?.name
        ]
            .map(value => normalizeLookupKey(value))
            .filter(Boolean);

        for (const key of names) {
            if (!characterNameMap[key]) characterNameMap[key] = char;
        }
    });

    const timerNameMap = {};
    (Array.isArray(timers) ? timers : []).forEach(timer => {
        const nameKey = normalizeLookupKey(timer?.Name ?? timer?.name ?? '');
        if (nameKey && !timerNameMap[nameKey]) timerNameMap[nameKey] = timer;
    });

    const save = await loadSaveGame();

    // Apply save overrides
    if (save?.player) {
        if (Array.isArray(save.player.Inventory)) player.Inventory = save.player.Inventory;
        if (Array.isArray(save.player.Equipped)) player.Equipped = save.player.Equipped;
        if (Array.isArray(save.player.Abilities)) player.Abilities = save.player.Abilities;
        if (Array.isArray(save.player.MentalMinions)) player.MentalMinions = save.player.MentalMinions;
        if (Array.isArray(save.player.CompletedScenes)) player.CompletedScenes = save.player.CompletedScenes;
        if (Array.isArray(save.player.VisitedRooms)) player.VisitedRooms = save.player.VisitedRooms;
        if (save.player.Credits !== undefined) player.Credits = save.player.Credits;
        if (save.player.Stats && typeof save.player.Stats === 'object') {
            player.Stats = { ...(player.Stats || {}), ...save.player.Stats };
        }
        const savedRoom = String(save.player.CurrentRoom ?? '').trim();
        if (savedRoom) player.CurrentRoom = savedRoom;
    }

    applyVariableDefaults(player, variableSchema);

    if (save?.rooms && typeof save.rooms === 'object') {
        for (const [roomId, roomState] of Object.entries(save.rooms)) {
            if (!roomId || !roomMap[roomId]) continue;
            const objectsOverride = roomState?.objects ?? roomState?.Objects ?? null;
            if (Array.isArray(objectsOverride)) roomMap[roomId].objects = objectsOverride;
            if (roomState?.bFirstTimeVisited !== undefined) roomMap[roomId].bFirstTimeVisited = Boolean(roomState.bFirstTimeVisited);
            if (roomState?.bFirstTimeLeft !== undefined) roomMap[roomId].bFirstTimeLeft = Boolean(roomState.bFirstTimeLeft);
        }
    }

    if (save?.objects && typeof save.objects === 'object') {
        for (const [objId, objState] of Object.entries(save.objects)) {
            if (!objId || !objectMap[objId]) continue;
            if (Array.isArray(objState?.Contents)) objectMap[objId].Contents = objState.Contents;
            if (Array.isArray(objState?.CustomProperties)) objectMap[objId].CustomProperties = objState.CustomProperties;
        }
    }

    if (save?.characters && typeof save.characters === 'object') {
        for (const [charId, charState] of Object.entries(save.characters)) {
            if (!charId || !characterMap[charId]) continue;
            const char = characterMap[charId];
            const state = charState && typeof charState === 'object' ? charState : null;
            if (!state) continue;

            const hasRoomOverride =
                Object.prototype.hasOwnProperty.call(state, 'CurrentRoom') ||
                Object.prototype.hasOwnProperty.call(state, 'currentRoomId') ||
                Object.prototype.hasOwnProperty.call(state, 'currentRoom');

            if (hasRoomOverride) {
                const roomId = String(state?.CurrentRoom ?? state?.currentRoomId ?? state?.currentRoom ?? '').trim();
                char.CurrentRoom = roomId;
                char.currentRoomId = roomId;
            }

            if (Array.isArray(state?.CustomProperties)) char.CustomProperties = state.CustomProperties;
            if (state?.KnowsPlayer !== undefined) char.KnowsPlayer = Boolean(state.KnowsPlayer);
        }
    }

    // Return game data structure
    return {
        player,
        rooms,
        objects,
        objectMap,
        objectNameMap,
        objectSourceMap,
        roomMap,
        characters: mappedCharacters,
        characterMap,
        characterNameMap,
        plannedEvents,
        leveling,
        timers,
        variableSchema,
        texts: textLibrary,
        timerNameMap,
        timerMap: timers.reduce((acc, timer) => {
            const id = String(timer?.UniqueID ?? timer?.id ?? '').trim();
            if (id) acc[id] = timer;
            return acc;
        }, {}),
        save,
        loadErrors
    };
}

// Usage: import { loadGameData } from './loader.js';
// const gameData = await loadGameData();
