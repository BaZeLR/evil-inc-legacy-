export function normalizeId(value) {
  return String(value ?? '').trim();
}

export function safeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
}

export function jsonClone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export function formatJson(value) {
  return `${JSON.stringify(value ?? null, null, 2)}\n`;
}

export function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(String(text ?? '')) };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export function generateIdSequence({ prefix, startNumber, count, pad } = {}) {
  const safePrefix = String(prefix ?? '').trim();
  const safeStart = Math.max(0, safeInt(startNumber, 1));
  const safeCount = Math.max(0, Math.min(500, safeInt(count, 1)));
  const safePad = Math.max(0, Math.min(8, safeInt(pad, 3)));

  const out = [];
  for (let i = 0; i < safeCount; i++) {
    const num = safeStart + i;
    const suffix = safePad ? String(num).padStart(safePad, '0') : String(num);
    out.push(`${safePrefix}${suffix}`);
  }
  return out;
}

export async function deleteDbPaths(paths, options = {}) {
  const { backup = true } = options || {};
  const normalized = (Array.isArray(paths) ? paths : [])
    .map(entry => String(entry ?? '').replace(/^\/+/, ''))
    .filter(Boolean);

  if (!normalized.length) throw new Error('No paths to delete');

  const response = await fetch('/api/db/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: normalized, backup })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Failed to delete (${response.status})`);
  }

  return payload;
}

