// This loader is for Reddit html AIF/src, not regalia.
import { loadSaveGame } from './utils/saveGame.js';

function normalizeLookupKey(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeLookupKeyLoose(value) {
    return normalizeLookupKey(value).replace(/[^a-z0-9]/g, '');
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

    async function loadCharactersFromCategoryIndexes() {
        const categories = [
            { key: 'enemies', dir: 'DB/characters/enemies', index: 'DB/characters/enemies/index.json' },
            { key: 'bosses', dir: 'DB/characters/bosses', index: 'DB/characters/bosses/index.json' },
            { key: 'residents', dir: 'DB/characters/residents', index: 'DB/characters/residents/index.json' },
            { key: 'secondary_npc', dir: 'DB/characters/secondary_npc', index: 'DB/characters/secondary_npc/index.json' },
            { key: 'npc', dir: 'DB/characters/npc', index: 'DB/characters/npc/index.json' }
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
                    fileList.push({ id, path: `${category.dir}/${id}.json` });
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

            characters.push(character);
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

            const results = await Promise.allSettled(characterFiles.map(fetchJSON));
            const characters = [];

            for (let idx = 0; idx < results.length; idx++) {
                const source = characterFiles[idx] || null;
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

                characters.push(character);
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
            return Array.isArray(legacy) ? legacy : [];
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
    const [player, roomsRaw, characters] = await Promise.all([fetchJSON('DB/player.json'), fetchJSON('DB/rooms.json'), loadCharacters()]);

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

    const roomsList = Array.isArray(roomsRaw?.Rooms) ? roomsRaw.Rooms : [];
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
        const roomMedia = room?.Picture ?? room?.media ?? null;

        const exitsRaw = Array.isArray(room?.Exits) ? room.Exits : [];
        const exits = exitsRaw
            .map(exit => {
                const direction = String(exit?.Direction ?? exit?.direction ?? '').trim();
                const destinationRaw = exit?.DestinationRoom ?? exit?.destination ?? '';
                const destinationId = resolveRoomId(destinationRaw, roomIndex, roomsList);
                const destinationRoom = destinationId
                    ? roomsList.find(r => String(r?.UniqueID ?? '').trim() === destinationId)
                    : null;

                return {
                    direction,
                    destinationId,
                    destinationName: destinationRoom?.Name ?? String(destinationRaw ?? '').trim(),
                    destinationRaw: String(destinationRaw ?? '').trim()
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
            objects
        };
    });

    // Load all object instances
    const fallbackObjectFiles = [
        'DB/objects/com_unit.json',
        'DB/objects/duffel_bag.json',
        'DB/objects/wallet.json',
        'DB/objects/vibranium_ring.json',
        'DB/objects/rubber_gloves.json',
        'DB/objects/lab_coat.json',
        'DB/objects/insulated_boots.json',
        'DB/objects/energy_pack.json',
        'DB/objects/med_pack.json',
        'DB/objects/rusty_knife.json',
        'DB/objects/cheap_pistol.json',
        'DB/objects/street_vendor.json'
    ];

    let objectFiles = [...fallbackObjectFiles];
    if (import.meta?.env?.DEV) {
        try {
            const response = await fetch('/api/db/list?dir=DB/objects', { cache: 'no-store' });
            if (response.ok) {
                const payload = await response.json();
                if (Array.isArray(payload?.files) && payload.files.length) {
                    objectFiles = payload.files
                        .map(entry => String(entry ?? '').trim())
                        .filter(entry => entry && entry.toLowerCase().endsWith('.json') && entry.startsWith('DB/'))
                        .sort((a, b) => a.localeCompare(b));
                }
            }
        } catch {
            objectFiles = [...fallbackObjectFiles];
        }
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
            media: rawObject?.Picture || rawObject?.media || null,
            id: objectId,
            name: rawObject?.Name ?? rawObject?.name ?? '',
            description: rawObject?.Description ?? rawObject?.description ?? ''
        };
        objects.push(mapped);
        if (source) objectSourceMap[mapped.id] = source;
    }

    // Map characters
    const mappedCharacters = (Array.isArray(characters) ? characters : []).map(char => ({
        ...char,
        media: char?.Picture || char?.media || null,
        id: char?.UniqueID || char?.id,
        name: char?.Charname ?? char?.Name ?? char?.name ?? '',
        description: char?.Description ?? char?.description ?? '',
        currentRoomId: char?.CurrentRoom ?? char?.currentRoom ?? char?.location ?? null
    }));

    // Build lookup maps
    const objectMap = {};
    objects.forEach(obj => {
        objectMap[obj.id] = obj;
    });

    const roomMap = {};
    rooms.forEach(room => { roomMap[room.id] = room; });

    const characterMap = {};
    mappedCharacters.forEach(char => { characterMap[char.id] = char; });

    const save = await loadSaveGame();

    // Apply save overrides
    if (save?.player) {
        if (Array.isArray(save.player.Inventory)) player.Inventory = save.player.Inventory;
        if (Array.isArray(save.player.Equipped)) player.Equipped = save.player.Equipped;
        if (save.player.Credits !== undefined) player.Credits = save.player.Credits;
        if (save.player.Stats && typeof save.player.Stats === 'object') {
            player.Stats = { ...(player.Stats || {}), ...save.player.Stats };
        }
        const savedRoom = String(save.player.CurrentRoom ?? '').trim();
        if (savedRoom) player.CurrentRoom = savedRoom;
    }

    if (save?.rooms && typeof save.rooms === 'object') {
        for (const [roomId, roomState] of Object.entries(save.rooms)) {
            if (!roomId || !roomMap[roomId]) continue;
            const objectsOverride = roomState?.objects ?? roomState?.Objects ?? null;
            if (Array.isArray(objectsOverride)) roomMap[roomId].objects = objectsOverride;
        }
    }

    if (save?.objects && typeof save.objects === 'object') {
        for (const [objId, objState] of Object.entries(save.objects)) {
            if (!objId || !objectMap[objId]) continue;
            if (Array.isArray(objState?.Contents)) objectMap[objId].Contents = objState.Contents;
            if (Array.isArray(objState?.CustomProperties)) objectMap[objId].CustomProperties = objState.CustomProperties;
        }
    }

    // Return game data structure
    return {
        player,
        rooms,
        objects,
        objectMap,
        objectSourceMap,
        roomMap,
        characters: mappedCharacters,
        characterMap,
        leveling,
        save,
        loadErrors
    };
}

// Usage: import { loadGameData } from './loader.js';
// const gameData = await loadGameData();
