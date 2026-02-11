// Generates per-category character indexes under public/DB/characters/<category>/index.json
// Ensures index.json matches the .json files present in that category folder.
// Usage: node scripts/generate-character-category-indexes.js

const fs = require('fs');
const path = require('path');

const CATEGORIES = ['enemies', 'bosses', 'r_citizens', 'main', 'secondary', 'mental_minions'];

function listCharacterIds(categoryDir) {
  const entries = fs.readdirSync(categoryDir, { withFileTypes: true });
  const ids = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        entry.name.toLowerCase() !== 'index.json'
    )
    .map((entry) => entry.name.replace(/\.json$/i, ''))
    .sort((a, b) => a.localeCompare(b));
  return ids;
}

function writeCategoryIndex(categoryDir, categoryName, ids) {
  const outPath = path.join(categoryDir, 'index.json');
  const payload = {
    Category: categoryName,
    Characters: ids,
  };
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n');
  return outPath;
}

function main() {
  const repoRoot = path.join(__dirname, '..');
  const baseDir = path.join(repoRoot, 'public', 'DB', 'characters');

  if (!fs.existsSync(baseDir)) {
    console.error('Directory not found:', baseDir);
    process.exit(1);
  }

  let total = 0;
  for (const category of CATEGORIES) {
    const categoryDir = path.join(baseDir, category);
    if (!fs.existsSync(categoryDir)) {
      console.error('Missing category folder:', categoryDir);
      process.exit(1);
    }

    const ids = listCharacterIds(categoryDir);
    total += ids.length;
    const outPath = writeCategoryIndex(categoryDir, category, ids);
    console.log(`Wrote ${outPath} (${ids.length} ids)`);
  }

  console.log(`Done. Total character ids across categories: ${total}`);
}

if (require.main === module) {
  main();
}
