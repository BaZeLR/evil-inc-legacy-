import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCombatActionCosts, applyMoveActionCosts } from '../src/utils/actionCosts.js';

test('move costs: +00:30 and -1 energy', () => {
  const player = { Stats: { Energy: 5 } };
  const result = applyMoveActionCosts(player);

  assert.equal(result.clock.day, 1);
  assert.equal(result.clock.minutes, 12 * 60 + 30);
  assert.equal(result.energy, 4);
});

test('combat weapon costs: +01:00 and -1 energy', () => {
  const player = { Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5 } };
  const result = applyCombatActionCosts(player, { kind: 'weapon' });

  assert.equal(result.clock.day, 1);
  assert.equal(result.clock.minutes, 13 * 60);
  assert.equal(result.energy, 4);
});

test('combat ability costs: +01:00 and no flat energy cost', () => {
  const player = { Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5 } };
  const result = applyCombatActionCosts(player, { kind: 'ability' });

  assert.equal(result.clock.day, 1);
  assert.equal(result.clock.minutes, 13 * 60);
  assert.equal(result.energy, 5);
});

test('move across midnight increments day', () => {
  const player = { Stats: { DaysInGame: 1, GameTimeMinutes: 23 * 60 + 30, Energy: 1 } };
  const result = applyMoveActionCosts(player);

  assert.equal(result.clock.day, 2);
  assert.equal(result.clock.minutes, 0);
  assert.equal(result.energy, 0);
});

