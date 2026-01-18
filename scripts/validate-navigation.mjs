import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeLookupKeyLoose(value) {
  return normalizeLookupKey(value).replace(/[^a-z0-9]/g, '');
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

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const repoRoot = process.cwd();
  const roomsPath = path.join(repoRoot, 'public', 'DB', 'rooms.json');
  const playerPath = path.join(repoRoot, 'public', 'DB', 'player.json');

  const roomsRaw = await readJson(roomsPath);
  const rooms = Array.isArray(roomsRaw?.Rooms) ? roomsRaw.Rooms : [];
  const roomIndex = buildRoomIndex(rooms);

  const player = await readJson(playerPath);
  const currentRoomId = String(player?.CurrentRoom ?? '').trim();
  const currentRoomOk = Boolean(currentRoomId && roomIndex.byId.has(currentRoomId));

  console.log(`Rooms: ${rooms.length}`);
  console.log(`Player.CurrentRoom: ${currentRoomId || '(missing)'} (${currentRoomOk ? 'OK' : 'MISSING'})`);

  let totalExits = 0;
  let resolvedExits = 0;
  const unresolved = [];

  for (const room of rooms) {
    const exits = Array.isArray(room?.Exits) ? room.Exits : [];
    for (const exit of exits) {
      totalExits++;
      const destRaw = exit?.DestinationRoom ?? exit?.destination ?? '';
      const destId = resolveRoomId(destRaw, roomIndex, rooms);
      if (destId) resolvedExits++;
      else {
        unresolved.push({
          from: room?.Name ?? room?.UniqueID ?? '(unknown)',
          direction: exit?.Direction ?? '(unknown)',
          destination: String(destRaw ?? '').trim() || '(missing)'
        });
      }
    }
  }

  console.log(`Exits: ${resolvedExits}/${totalExits} resolved`);
  if (unresolved.length) {
    console.log(`Unresolved exits: ${unresolved.length}`);
    for (const item of unresolved.slice(0, 50)) {
      console.log(`- ${item.from}: ${item.direction} -> ${item.destination}`);
    }
    if (unresolved.length > 50) console.log(`(and ${unresolved.length - 50} more)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

