import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

async function pathExists(candidate) {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function listJsonFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(fullPath)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith('.json')) continue;
    files.push(fullPath);
  }

  return files;
}

async function fileSha1(filePath) {
  const buf = await fs.readFile(filePath);
  return crypto.createHash('sha1').update(buf).digest('hex');
}

function normalizeRel(relPath) {
  return relPath.replace(/\\/g, '/');
}

async function main() {
  const repoRoot = process.cwd();
  const publicDbDir = path.join(repoRoot, 'public', 'DB');
  const distDbDir = path.join(repoRoot, 'dist', 'DB');

  if (!(await pathExists(publicDbDir))) {
    throw new Error(`Missing ${publicDbDir}`);
  }
  if (!(await pathExists(distDbDir))) {
    throw new Error(`Missing ${distDbDir}. Run "npm run build" first.`);
  }

  const publicFilesAbs = await listJsonFiles(publicDbDir);
  const distFilesAbs = await listJsonFiles(distDbDir);

  const publicFiles = new Map();
  for (const absPath of publicFilesAbs) {
    const rel = normalizeRel(path.relative(publicDbDir, absPath));
    publicFiles.set(rel, absPath);
  }

  const distFiles = new Map();
  for (const absPath of distFilesAbs) {
    const rel = normalizeRel(path.relative(distDbDir, absPath));
    distFiles.set(rel, absPath);
  }

  const missingInDist = [];
  const extraInDist = [];
  const mismatched = [];

  for (const rel of publicFiles.keys()) {
    if (!distFiles.has(rel)) missingInDist.push(rel);
  }
  for (const rel of distFiles.keys()) {
    if (!publicFiles.has(rel)) extraInDist.push(rel);
  }

  for (const [rel, publicAbs] of publicFiles.entries()) {
    const distAbs = distFiles.get(rel);
    if (!distAbs) continue;
    const [h1, h2] = await Promise.all([fileSha1(publicAbs), fileSha1(distAbs)]);
    if (h1 !== h2) mismatched.push(rel);
  }

  const issues = missingInDist.length + extraInDist.length + mismatched.length;
  if (!issues) {
    console.log('OK: dist/DB matches public/DB');
    return;
  }

  console.error('DB sync check failed: dist/DB does not match public/DB');
  if (missingInDist.length) {
    console.error(`- Missing in dist/DB (${missingInDist.length}):`);
    missingInDist.slice(0, 50).forEach(rel => console.error(`  - ${rel}`));
    if (missingInDist.length > 50) console.error(`  (and ${missingInDist.length - 50} more)`);
  }
  if (extraInDist.length) {
    console.error(`- Extra in dist/DB (${extraInDist.length}):`);
    extraInDist.slice(0, 50).forEach(rel => console.error(`  - ${rel}`));
    if (extraInDist.length > 50) console.error(`  (and ${extraInDist.length - 50} more)`);
  }
  if (mismatched.length) {
    console.error(`- Content differs (${mismatched.length}):`);
    mismatched.slice(0, 50).forEach(rel => console.error(`  - ${rel}`));
    if (mismatched.length > 50) console.error(`  (and ${mismatched.length - 50} more)`);
  }

  process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});

