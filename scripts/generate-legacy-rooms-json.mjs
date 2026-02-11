import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function slugify(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

function shouldPreferPath(candidatePath, currentPath) {
  if (!currentPath) return true;
  const cand = normalizeText(candidatePath);
  const curr = normalizeText(currentPath);
  if (!cand) return false;

  const candDepth = cand.split('/').filter(Boolean).length;
  const currDepth = curr.split('/').filter(Boolean).length;
  if (candDepth !== currDepth) return candDepth < currDepth;

  return cand.localeCompare(curr, undefined, { sensitivity: 'base' }) < 0;
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const repoRoot = process.cwd();
  const publicDir = path.join(repoRoot, 'public');
  const roomsDir = path.join(publicDir, 'DB', 'rooms');
  const roomsIndexPath = path.join(roomsDir, 'index.json');
  const outputPath = path.join(publicDir, 'DB', 'rooms.json');

  const index = await readJson(roomsIndexPath);
  const files = Array.isArray(index?.files) ? index.files : [];

  const roomFiles = files
    .map(entry => normalizeText(entry))
    .filter(entry => entry.toLowerCase().startsWith('db/rooms/') && entry.toLowerCase().endsWith('.json'))
    .filter(entry => !entry.toLowerCase().endsWith('/index.json'))
    .sort((a, b) => a.localeCompare(b));

  const byId = new Map();
  const duplicates = [];

  for (const rel of roomFiles) {
    const abs = path.join(publicDir, rel.replace(/\//g, path.sep));
    const room = await readJson(abs);
    const id = normalizeText(room?.UniqueID ?? room?.id);
    if (!id) continue;

    if (byId.has(id)) {
      const existing = byId.get(id);
      if (shouldPreferPath(rel, existing.sourcePath)) {
        duplicates.push({ id, kept: rel, dropped: existing.sourcePath });
        byId.set(id, { room, sourcePath: rel });
      } else {
        duplicates.push({ id, kept: existing.sourcePath, dropped: rel });
      }
      continue;
    }

    byId.set(id, { room, sourcePath: rel });
  }

  const rooms = [...byId.values()]
    .map(entry => entry.room)
    .sort((a, b) => normalizeText(a?.UniqueID).localeCompare(normalizeText(b?.UniqueID)));

  const groups = new Map();
  for (const room of rooms) {
    const groupName = normalizeText(room?.Group ?? room?.group);
    if (!groupName) continue;
    const list = groups.get(groupName) ?? [];
    list.push(room);
    groups.set(groupName, list);
  }

  const roomGroups = [...groups.entries()]
    .map(([name, list]) => ({
      Name: name,
      UniqueID: `${slugify(name) || 'group'}_group_001`,
      Spawns: list.some(room => Boolean(room?.Spawns ?? room?.spawns)),
      Rooms: list.map(room => normalizeText(room?.UniqueID)).filter(Boolean).sort((a, b) => a.localeCompare(b)),
      Description: '',
      Picture: '',
      CustomProperties: []
    }))
    .sort((a, b) => a.Name.localeCompare(b.Name));

  const payload = {
    $comment: 'Generated from public/DB/rooms/**.json. Do not edit by hand.',
    RoomGroups: roomGroups,
    Rooms: rooms
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${rooms.length} rooms, ${roomGroups.length} groups).`);
  if (duplicates.length) {
    console.warn(`Found ${duplicates.length} duplicate room ids (kept shallower path).`);
    duplicates.slice(0, 25).forEach(entry => {
      console.warn(`- ${entry.id}: kept ${entry.kept} (dropped ${entry.dropped})`);
    });
    if (duplicates.length > 25) console.warn(`(and ${duplicates.length - 25} more)`);
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

