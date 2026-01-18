import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_START_DAY,
  DEFAULT_START_MINUTES,
  advanceGameClockByMoves,
  ensureGameClock,
  formatGameClock,
  getDayPartFromMinutes
} from '../src/utils/gameTime.js';

test('ensureGameClock initializes missing clock stats', () => {
  const player = { Stats: { Energy: 10 } };
  const clock = ensureGameClock(player);

  assert.equal(clock.day, DEFAULT_START_DAY);
  assert.equal(clock.minutes, DEFAULT_START_MINUTES);
  assert.equal(player.Stats.DaysInGame, DEFAULT_START_DAY);
  assert.equal(player.Stats.GameTimeMinutes, DEFAULT_START_MINUTES);
});

test('advanceGameClockByMoves adds 30 minutes per move', () => {
  const player = { Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60 } };
  advanceGameClockByMoves(player, 1);
  assert.equal(player.Stats.DaysInGame, 1);
  assert.equal(formatGameClock(player.Stats.GameTimeMinutes), '12:30');

  advanceGameClockByMoves(player, 1);
  assert.equal(formatGameClock(player.Stats.GameTimeMinutes), '13:00');
});

test('advanceGameClockByMoves increments day at midnight', () => {
  const player = { Stats: { DaysInGame: 1, GameTimeMinutes: 23 * 60 + 30 } };
  advanceGameClockByMoves(player, 1);
  assert.equal(player.Stats.DaysInGame, 2);
  assert.equal(formatGameClock(player.Stats.GameTimeMinutes), '00:00');
});

test('daypart labels map correctly', () => {
  assert.equal(getDayPartFromMinutes(0), 'Midnight');
  assert.equal(getDayPartFromMinutes(60), 'Night');
  assert.equal(getDayPartFromMinutes(5 * 60), 'Dawn');
  assert.equal(getDayPartFromMinutes(8 * 60), 'Morning');
  assert.equal(getDayPartFromMinutes(12 * 60), 'Noon');
  assert.equal(getDayPartFromMinutes(15 * 60), 'Afternoon');
  assert.equal(getDayPartFromMinutes(19 * 60), 'Dusk');
  assert.equal(getDayPartFromMinutes(22 * 60), 'Evening');
});

