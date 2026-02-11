import fs from 'node:fs/promises';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const RCITIZENS_DIR = path.join(WORKSPACE_ROOT, 'public', 'DB', 'characters', 'r_citizens');

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function inferSpawnAreasFromId(id) {
  const key = normalizeLower(id);

  // Strong campus signals.
  const campusHints = [
    'college',
    'student',
    'coed',
    'prof',
    'librarian',
    'book',
    'nerd',
    'athlete',
    'volleyball',
    'basketball',
    'frat',
    'soror',
    'campus',
    'janitor',
    'tutor',
  ];
  if (campusHints.some(h => key.includes(h))) return ['West Side'];

  // Strong medical/hospital signals.
  const medicalHints = ['nurse', 'doctor', 'medic', 'hospital', 'paramedic'];
  if (medicalHints.some(h => key.includes(h))) return ['Liberty City'];

  // Default to broad city core.
  return ['Liberty City'];
}

async function main() {
  const shouldWrite = process.argv.includes('--write');

  const entries = await fs.readdir(RCITIZENS_DIR, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile())
    .map(e => e.name)
    .filter(name => name.endsWith('.json'))
    .filter(name => name !== 'index.json');

  const changed = [];
  const skipped = [];

  for (const fileName of files) {
    const filePath = path.join(RCITIZENS_DIR, fileName);
    const raw = await fs.readFile(filePath, 'utf8');
    const json = JSON.parse(raw);

    const hasAny =
      json.SpawnAreas != null ||
      json.spawnAreas != null ||
      json.SpawnArea != null ||
      json.spawnArea != null ||
      json.spawn_area != null;

    if (hasAny) {
      skipped.push(fileName);
      continue;
    }

    const id = String(json.UniqueID ?? json.id ?? fileName.replace(/\.json$/i, '')).trim();
    json.SpawnAreas = inferSpawnAreasFromId(id);

    changed.push({ fileName, spawnAreas: json.SpawnAreas });

    if (shouldWrite) {
      await fs.writeFile(filePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
    }
  }

  const summary = {
    dir: path.relative(WORKSPACE_ROOT, RCITIZENS_DIR),
    files: files.length,
    changed: changed.length,
    skipped: skipped.length,
    mode: shouldWrite ? 'write' : 'dry-run',
  };

  console.log(JSON.stringify({ summary, changed }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
