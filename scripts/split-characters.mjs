import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function hasAttackAction(character) {
  return ensureArray(character?.ActionsMenu).some(entry => normalizeText(entry?.Action ?? entry?.action) === 'attack');
}

function hasEncounter(character) {
  return Boolean(character?.Encounter);
}

function isCombatCharacter(character) {
  const disposition = normalizeText(character?.Disposition ?? character?.disposition);
  const type = normalizeText(character?.Type ?? character?.type);
  return disposition === 'hostile' || type === 'hostile' || hasEncounter(character) || hasAttackAction(character);
}

function isSecondaryNpc(character) {
  const type = normalizeText(character?.Type ?? character?.type);
  return type === 'secondary' || ensureArray(character?.ShopItems).length > 0;
}

function isHeroNpc(character) {
  const type = normalizeText(character?.Type ?? character?.type);
  return type === 'hero';
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, json, 'utf8');
}

async function main() {
  const repoRoot = process.cwd();
  const sourcePath = path.join(repoRoot, 'public', 'DB', 'characters', 'characters.json');
  const baseDir = path.join(repoRoot, 'public', 'DB', 'characters');

  try {
    await fs.access(sourcePath);
  } catch {
    console.log(`OK: no legacy characters.json found at ${path.relative(repoRoot, sourcePath)}`);
    return;
  }

  const categories = [
    { key: 'enemies', dir: path.join(baseDir, 'enemies'), ids: [] },
    { key: 'bosses', dir: path.join(baseDir, 'bosses'), ids: [] },
    { key: 'r_citizens', dir: path.join(baseDir, 'r_citizens'), ids: [] },
    { key: 'main', dir: path.join(baseDir, 'main'), ids: [] }
  ];

  const byKey = new Map(categories.map(entry => [entry.key, entry]));

  const charactersRaw = await readJson(sourcePath);
  if (!Array.isArray(charactersRaw)) {
    throw new Error(`Expected an array in ${sourcePath}`);
  }

  for (const entry of categories) {
    await fs.mkdir(entry.dir, { recursive: true });
  }

  for (const character of charactersRaw) {
    const id = String(character?.UniqueID ?? character?.id ?? '').trim();
    if (!id) continue;

    let categoryKey = 'main';
    if (isCombatCharacter(character)) categoryKey = 'enemies';
    else if (isSecondaryNpc(character)) categoryKey = 'main';
    else if (isHeroNpc(character)) categoryKey = 'main';

    const category = byKey.get(categoryKey);
    if (!category) continue;

    category.ids.push(id);
    await writeJson(path.join(category.dir, `${id}.json`), character);
  }

  for (const entry of categories) {
    entry.ids.sort((a, b) => a.localeCompare(b));
    await writeJson(path.join(entry.dir, 'index.json'), { Category: entry.key, Characters: entry.ids });
  }

  await fs.unlink(sourcePath);
  console.log(`OK: split ${charactersRaw.length} characters into folders; removed ${path.relative(repoRoot, sourcePath)}`);
}

main().catch(error => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
