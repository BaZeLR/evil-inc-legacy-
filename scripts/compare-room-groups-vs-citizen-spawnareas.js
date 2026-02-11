// Compares room Group values vs r_citizens SpawnAreas.
// Usage: node scripts/compare-room-groups-vs-citizen-spawnareas.js

const fs = require('fs');
const path = require('path');

function tryReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return null;
  }
}

// Removes // line comments and /* block comments */ while preserving content inside strings.
function stripJsonComments(input) {
  let out = '';
  let i = 0;
  let inString = false;
  let escaped = false;

  while (i < input.length) {
    const ch = input[i];
    const next = i + 1 < input.length ? input[i + 1] : '';

    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }

    // Line comment
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }

    // Block comment
    if (ch === '/' && next === '*') {
      i += 2;
      while (i + 1 < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function normKey(value) {
  return normalize(value).toLowerCase();
}

function addGroup(groupSet, groupSourceMap, groupValue, source) {
  const g = normalize(groupValue);
  if (!g) return;
  const key = normKey(g);
  groupSet.add(key);
  if (!groupSourceMap.has(key)) groupSourceMap.set(key, { value: g, sources: new Set() });
  groupSourceMap.get(key).sources.add(source);
}

function collectRoomGroups(repoRoot) {
  const groups = new Set();
  const groupSourceMap = new Map();

  function walkDir(dir) {
    const out = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkDir(fp));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        out.push(fp);
      }
    }
    return out;
  }

  // 1) public/DB/rooms.json (master list)
  const roomsJsonPath = path.join(repoRoot, 'public', 'DB', 'rooms.json');
  if (fs.existsSync(roomsJsonPath)) {
    const data = tryReadJson(roomsJsonPath);
    if (data && typeof data === 'object') {
      // Support multiple shapes: { Rooms: [...] } or object map
      const rooms = Array.isArray(data?.Rooms)
        ? data.Rooms
        : (data?.rooms && Array.isArray(data.rooms) ? data.rooms : null);

      if (Array.isArray(rooms)) {
        for (const room of rooms) {
          addGroup(groups, groupSourceMap, room?.Group ?? room?.group, 'public/DB/rooms.json');
        }
      } else {
        for (const [roomId, room] of Object.entries(data)) {
          if (!room || typeof room !== 'object') continue;
          addGroup(groups, groupSourceMap, room?.Group ?? room?.group, `public/DB/rooms.json:${roomId}`);
        }
      }
    }
  }

  // 2) public/DB/rooms/*.json (per-room)
  const roomsDir = path.join(repoRoot, 'public', 'DB', 'rooms');
  if (fs.existsSync(roomsDir)) {
    const jsonFiles = walkDir(roomsDir);
    for (const fp of jsonFiles) {
      if (fp.toLowerCase().endsWith(path.sep + 'index.json')) continue;
      const json = tryReadJson(fp);
      if (!json || typeof json !== 'object') continue;
      const rel = path.relative(repoRoot, fp).replace(/\\/g, '/');
      addGroup(groups, groupSourceMap, json?.Group ?? json?.group ?? json?.RoomGroup ?? json?.roomGroup, rel);
    }
  }

  return { groups, groupSourceMap };
}

function collectCitizenSpawnAreas(repoRoot) {
  const spawnAreas = new Set();
  const spawnAreaSourceMap = new Map();

  const citizensDir = path.join(repoRoot, 'public', 'DB', 'characters', 'r_citizens');
  if (!fs.existsSync(citizensDir)) {
    return { spawnAreas, spawnAreaSourceMap };
  }

  const entries = fs.readdirSync(citizensDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    if (entry.name.toLowerCase() === 'index.json') continue;

    const fp = path.join(citizensDir, entry.name);
    const json = tryReadJson(fp);
    if (!json || typeof json !== 'object') continue;

    const areas = Array.isArray(json?.SpawnAreas)
      ? json.SpawnAreas.map(normalize).filter(Boolean)
      : (typeof json?.SpawnArea === 'string' ? [normalize(json.SpawnArea)].filter(Boolean) : []);

    for (const area of areas) {
      const key = normKey(area);
      spawnAreas.add(key);
      if (!spawnAreaSourceMap.has(key)) spawnAreaSourceMap.set(key, { value: area, sources: new Set() });
      spawnAreaSourceMap.get(key).sources.add(`public/DB/characters/r_citizens/${entry.name}`);
    }
  }

  return { spawnAreas, spawnAreaSourceMap };
}

function main() {
  const repoRoot = process.cwd();

  const { groups, groupSourceMap } = collectRoomGroups(repoRoot);
  const { spawnAreas, spawnAreaSourceMap } = collectCitizenSpawnAreas(repoRoot);

  const spawnAreasNotInGroups = [...spawnAreas]
    .filter((k) => !groups.has(k))
    .map((k) => spawnAreaSourceMap.get(k)?.value ?? k)
    .sort((a, b) => a.localeCompare(b));

  const groupsNotInSpawnAreas = [...groups]
    .filter((k) => !spawnAreas.has(k))
    .map((k) => groupSourceMap.get(k)?.value ?? k)
    .sort((a, b) => a.localeCompare(b));

  const out = {
    roomGroupsCount: groups.size,
    citizenSpawnAreasCount: spawnAreas.size,
    spawnAreasNotInAnyRoomGroup: spawnAreasNotInGroups,
    roomGroupsWithoutAnyCitizenSpawnArea: groupsNotInSpawnAreas,
  };

  console.log(JSON.stringify(out, null, 2));

  if (spawnAreasNotInGroups.length > 0) process.exitCode = 2;
}

main();
