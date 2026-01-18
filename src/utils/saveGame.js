const SAVE_PATH = 'DB/savegame.json';
const WRITE_ENDPOINT = '/api/db/write';

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createEmptySaveGame() {
  return { version: 1, updatedAt: null, player: {}, rooms: {}, objects: {} };
}

export async function loadSaveGame() {
  const empty = createEmptySaveGame();

  const normalize = raw => {
    if (!isRecord(raw)) return null;
    return {
      version: Number(raw.version) || 1,
      updatedAt: raw.updatedAt ?? null,
      player: isRecord(raw.player) ? raw.player : {},
      rooms: isRecord(raw.rooms) ? raw.rooms : {},
      objects: isRecord(raw.objects) ? raw.objects : {}
    };
  };

  const parseUpdatedAt = value => {
    const date = new Date(String(value ?? ''));
    const time = date.getTime();
    return Number.isFinite(time) ? time : 0;
  };

  let fileSave = null;
  try {
    const response = await fetch(SAVE_PATH, { cache: 'no-store' });
    if (response.ok) fileSave = normalize(await response.json());
  } catch {
    fileSave = null;
  }

  let localSave = null;
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('savegame') : null;
    if (stored) localSave = normalize(JSON.parse(stored));
  } catch {
    localSave = null;
  }

  if (fileSave && localSave) {
    return parseUpdatedAt(localSave.updatedAt) > parseUpdatedAt(fileSave.updatedAt) ? localSave : fileSave;
  }

  return fileSave || localSave || empty;
}

export async function writeSaveGame(save) {
  const snapshot = isRecord(save) ? { ...save } : createEmptySaveGame();
  snapshot.updatedAt = new Date().toISOString();

  try {
    const response = await fetch(WRITE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: SAVE_PATH, data: snapshot })
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `HTTP ${response.status}`);
    }

    return { ok: true, persisted: 'file' };
  } catch (error) {
    // Fallback to localStorage so the game remains playable without the write endpoint.
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('savegame', JSON.stringify(snapshot));
    } catch {
      // ignore
    }
    return { ok: false, persisted: 'localStorage', error: error?.message || String(error) };
  }
}
