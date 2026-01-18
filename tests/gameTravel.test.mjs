import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../src/game.js';

test('Game.travelTo applies +00:30 and -1 energy', () => {
  const game = new Game();
  game.roomMap = { a: { id: 'a' }, b: { id: 'b' } };
  game.player = { CurrentRoom: 'a', Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5 } };
  game.runRoomEnterEvents = () => ({ texts: [], media: null, paused: false, errors: [] });
  game.checkLevelProgression = () => ({ levelsGained: 0 });

  const result = game.travelTo('b');
  assert.equal(result.moved, true);
  assert.equal(game.player.CurrentRoom, 'b');
  assert.equal(game.player.Stats.DaysInGame, 1);
  assert.equal(game.player.Stats.GameTimeMinutes, 12 * 60 + 30);
  assert.equal(game.player.Stats.Energy, 4);
});

test('Game.travelTo increments day at midnight', () => {
  const game = new Game();
  game.roomMap = { a: { id: 'a' }, b: { id: 'b' } };
  game.player = { CurrentRoom: 'a', Stats: { DaysInGame: 1, GameTimeMinutes: 23 * 60 + 30, Energy: 1 } };
  game.runRoomEnterEvents = () => ({ texts: [], media: null, paused: false, errors: [] });
  game.checkLevelProgression = () => ({ levelsGained: 0 });

  const result = game.travelTo('b');
  assert.equal(result.moved, true);
  assert.equal(game.player.Stats.DaysInGame, 2);
  assert.equal(game.player.Stats.GameTimeMinutes, 0);
  assert.equal(game.player.Stats.Energy, 0);
});

