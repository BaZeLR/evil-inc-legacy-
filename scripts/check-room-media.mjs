import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());
const publicDir = path.join(projectRoot, 'public');
const dbRoomsCityDir = path.join(publicDir, 'DB', 'rooms', 'city');

function toPosix(p) {
  return p.split(path.sep).join('/');
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
        i++;
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
      i++;
      continue;
    }

    if (char === '/' && next === '*') {
      inMultiLineComment = true;
      i++;
      continue;
    }

    output += char;
  }

  return output;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(stripJsonComments(raw));
  }
}

function walkFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function buildAssetIndex(rootDir) {
  const files = walkFiles(rootDir).filter(f => fs.statSync(f).isFile());
  const index = new Map();
  for (const abs of files) {
    const rel = toPosix(path.relative(publicDir, abs));
    index.set(rel.toLowerCase(), rel);
  }
  return index;
}

function* iterPictureValues(room) {
  const pic = room?.Picture ?? room?.picture ?? null;
  if (!pic) return;
  if (typeof pic === 'string') {
    yield { key: null, value: pic };
    return;
  }
  if (pic && typeof pic === 'object') {
    for (const [k, v] of Object.entries(pic)) {
      if (typeof v === 'string') yield { key: k, value: v };
    }
  }
}

const assetsIndex = buildAssetIndex(path.join(publicDir, 'Assets'));
const roomFiles = walkFiles(dbRoomsCityDir).filter(f => f.toLowerCase().endsWith('.json'));

const issues = [];

for (const roomFile of roomFiles) {
  let room;
  try {
    room = readJson(roomFile);
  } catch (e) {
    issues.push({
      kind: 'parse-error',
      roomFile,
      message: e?.message || String(e)
    });
    continue;
  }

  for (const { key, value } of iterPictureValues(room)) {
    const raw = String(value ?? '').trim().replace(/^\/+/, '');
    if (!raw) continue;
    if (!raw.startsWith('Assets/')) continue;

    const lookup = raw.toLowerCase();
    const exactExists = assetsIndex.get(lookup) === raw;
    if (exactExists) continue;

    const actual = assetsIndex.get(lookup) || null;
    if (!actual) {
      issues.push({
        kind: 'missing-file',
        roomFile,
        roomId: room?.UniqueID ?? null,
        pictureKey: key,
        referenced: raw
      });
      continue;
    }

    issues.push({
      kind: 'case-mismatch',
      roomFile,
      roomId: room?.UniqueID ?? null,
      pictureKey: key,
      referenced: raw,
      suggested: actual
    });
  }
}

if (!issues.length) {
  console.log('✅ No city room media issues found.');
  process.exit(0);
}

const byKind = issues.reduce((acc, it) => {
  (acc[it.kind] ||= []).push(it);
  return acc;
}, {});

for (const [kind, items] of Object.entries(byKind)) {
  console.log(`\n=== ${kind} (${items.length}) ===`);
  for (const it of items) {
    const relRoomFile = toPosix(path.relative(projectRoot, it.roomFile));
    if (kind === 'parse-error') {
      console.log(`- ${relRoomFile}: ${it.message}`);
      continue;
    }

    const where = it.pictureKey ? `Picture.${it.pictureKey}` : 'Picture';
    if (kind === 'missing-file') {
      console.log(`- ${relRoomFile} (${it.roomId || 'unknown'}): ${where} -> ${it.referenced} (missing)`);
    } else {
      console.log(`- ${relRoomFile} (${it.roomId || 'unknown'}): ${where} -> ${it.referenced} (suggest ${it.suggested})`);
    }
  }
}

process.exitCode = 1;
