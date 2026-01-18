import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('UI refreshes player state after navigation moves', async () => {
  const raw = await fs.readFile(new URL('../src/web/GameUI.jsx', import.meta.url), 'utf8');
  assert.match(raw, /const handleMove = destinationId =>[\s\S]*?refreshPlayerState\(game\);/);
});

