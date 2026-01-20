import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

test('characters DB is split into category folders with indexes', async () => {
  const repoRoot = process.cwd();
  const baseDir = path.join(repoRoot, 'public', 'DB', 'characters');

  const legacyPath = path.join(baseDir, 'characters.json');
  assert.equal(await pathExists(legacyPath), false);

  const categories = ['enemies', 'bosses', 'r_citizens', 'main'];
  const allIds = new Set();

  for (const category of categories) {
    const categoryDir = path.join(baseDir, category);
    const indexPath = path.join(categoryDir, 'index.json');
    assert.equal(await pathExists(indexPath), true, `Missing ${indexPath}`);

    const indexJson = await readJson(indexPath);
    assert.equal(String(indexJson?.Category ?? '').trim(), category, `index.json Category mismatch for ${category}`);
    assert.equal(Array.isArray(indexJson?.Characters), true, `index.json Characters must be an array for ${category}`);

    const listed = indexJson.Characters.map(entry => String(entry ?? '').trim()).filter(Boolean);
    const listedSet = new Set(listed);
    assert.equal(listedSet.size, listed.length, `Duplicate ids inside ${category}/index.json`);

    const files = await fs.readdir(categoryDir, { withFileTypes: true });
    const characterFiles = files
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name.toLowerCase() !== 'index.json')
      .map(entry => entry.name.replace(/\.json$/i, ''));
    characterFiles.sort((a, b) => a.localeCompare(b));

    const listedSorted = [...listed].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(characterFiles, listedSorted, `index.json does not match files in ${category}/`);

    for (const id of listed) {
      assert.equal(allIds.has(id), false, `Duplicate id across categories: ${id}`);
      allIds.add(id);

      const characterPath = path.join(categoryDir, `${id}.json`);
      assert.equal(await pathExists(characterPath), true, `Missing ${characterPath}`);
      const character = await readJson(characterPath);
      assert.equal(String(character?.UniqueID ?? character?.id ?? '').trim(), id, `UniqueID mismatch for ${characterPath}`);
    }
  }
});
