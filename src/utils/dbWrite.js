const WRITE_ENDPOINT = '/api/db/write';

let lastDbWriteAt = 0;

export function getLastDbWriteAt() {
  return lastDbWriteAt;
}

export async function writeDbJsonFile(dbPath, data) {
  const path = String(dbPath ?? '').replace(/^\/+/, '');
  if (!path) throw new Error('Missing DB path');

  lastDbWriteAt = Date.now();
  const response = await fetch(WRITE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, data })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }

  return true;
}
