import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../src/game.js';
import { createEmptySaveGame } from '../src/utils/saveGame.js';

test('planned event triggers on room enter and applies rewards + flags', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    a: { id: 'a', UniqueID: 'a', Name: 'A', Spawns: false },
    b: { id: 'b', UniqueID: 'b', Name: 'B', Spawns: false }
  };

  game.player = {
    CurrentRoom: 'a',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Experience: 0, Level: 0, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.characters = [];
  game.characterMap = {};

  game.plannedEvents = [
    {
      id: 'b_player_story_01',
      when: 'enter',
      location: 'b',
      target: 'player',
      action: 'event_01',
      prob: 100,
      priority: 100,
      thread_name: 'story_01',
      threaded: true,
      completeOnTrigger: true,
      suppressCombat: true,
      rewards: { exp: 10, flags: { quest_story_01_complete: true } },
      Actions: [{ name: 'event_01', bActive: true, InputType: 'None', run: 'Hello from event.' }]
    }
  ];

  game.runRoomEnterEvents = () => ({ texts: [], media: null, paused: false, errors: [] });
  game.checkLevelProgression = () => ({ levelsGained: 0 });

  const result = game.travelTo('b');
  assert.equal(result.moved, true);
  assert.equal(result.planned.enter.triggered, true);
  assert.equal(result.planned.enter.eventId, 'b_player_story_01');
  assert.ok(result.planned.enter.texts.some(line => String(line).includes('Hello from event.')));
  assert.equal(game.save.events.flags.quest_story_01_complete, true);
  assert.equal(game.player.Stats.Experience, 10);
});

