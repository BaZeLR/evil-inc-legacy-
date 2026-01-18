import { writeDbJsonFile } from './dbWrite.js';

function normalizeDbPath(value) {
  return String(value ?? '').replace(/^\/+/, '');
}

export async function readDbJsonFile(dbPath) {
  const path = normalizeDbPath(dbPath);
  if (!path) throw new Error('Missing DB path');

  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Failed to load ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function updateDbJsonFile(dbPath, updater, options = {}) {
  const { createIfMissing = true } = options || {};
  const path = normalizeDbPath(dbPath);
  if (!path) throw new Error('Missing DB path');

  let current;
  try {
    current = await readDbJsonFile(path);
  } catch (error) {
    if (!createIfMissing) throw error;
    current = {};
  }

  const next = typeof updater === 'function' ? updater(current) : updater;
  await writeDbJsonFile(path, next);
  return next;
}

