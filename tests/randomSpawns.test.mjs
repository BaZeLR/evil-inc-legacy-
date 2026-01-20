import assert from 'node:assert/strict';
import test from 'node:test';

import { Game } from '../src/game.js';
import { createEmptySaveGame } from '../src/utils/saveGame.js';

function createQueueRng(values) {
  const queue = Array.isArray(values) ? [...values] : [];
  return () => {
    if (!queue.length) return 0;
    return queue.shift();
  };
}

test('spawn_combat: high notoriety forces enemy encounter', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    street: { id: 'street', UniqueID: 'street', Name: 'Street', Type: 'hostile', Spawns: true }
  };

  const enemy = { id: 'enemy_001', UniqueID: 'enemy_001', name: 'Enemy', category: 'enemies', currentRoomId: null };
  game.characters = [enemy];
  game.characterMap = { enemy_001: enemy };

  game.player = {
    CurrentRoom: 'street',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 95, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_combat_enemy_01',
      when: 'spawn_combat',
      location: '*',
      target: 'player',
      action: 'spawn_combat_01',
      prob: 100,
      priority: 50,
      thread_name: '',
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_combat_01',
          bActive: true,
          InputType: 'None',
          PassCommands: [{ cmdtype: 'CT_SPAWN_RANDOM_ENEMY_ENCOUNTER' }],
          FailCommands: []
        }
      ]
    }
  ];

  const spawns = game.runRoomEntrySpawns('street', { rng: createQueueRng([0.1]) });
  assert.equal(spawns.encounter?.kind, 'combat');
  assert.equal(spawns.encounter?.enemyId, 'enemy_001');
  assert.equal(game.characterMap.enemy_001.currentRoomId, 'street');
  assert.equal(game.spawnState?.pendingEncounter?.enemyId, 'enemy_001');
});

test('spawn_spicy: deterministic RNG increases notoriety', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    street: { id: 'street', UniqueID: 'street', Name: 'Street', Type: 'neutral', Spawns: true }
  };

  game.characters = [];
  game.characterMap = {};

  game.player = {
    CurrentRoom: 'street',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_spicy_01',
      when: 'spawn_spicy',
      location: '*',
      target: 'player',
      action: 'spawn_spicy_01',
      prob: 100,
      priority: 50,
      thread_name: '',
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_spicy_01',
          bActive: true,
          InputType: 'None',
          PassCommands: [
            {
              cmdtype: 'CT_TRY_SPICY_EVENT',
              CommandText: '<b>Spicy event:</b> a rumor spreads. Notoriety +{vars.last_spicy_delta}.'
            }
          ],
          FailCommands: []
        }
      ]
    }
  ];

  const rng = createQueueRng([
    0.33, // kicker => 5 (score 55 triggers)
    0.3 // delta => 3
  ]);

  const spawns = game.runRoomEntrySpawns('street', { rng });
  assert.equal(game.player.Stats.Notoriety, 3);
  assert.equal(game.variables.last_spicy_delta, 3);
  assert.ok(spawns.texts.some(line => String(line).includes('Spicy event')));
  assert.ok(spawns.texts.some(line => String(line).includes('+3')));
});

test('spawn_citizen: spawns a random citizen from room NPC table', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    plaza: {
      id: 'plaza',
      UniqueID: 'plaza',
      Name: 'Plaza',
      Spawns: false,
      NPCs: [
        { UniqueID: 'citizen_a_001', Weight: 20 },
        { UniqueID: 'citizen_b_001', Weight: 80 }
      ]
    }
  };

  const citizenA = {
    id: 'citizen_a_001',
    UniqueID: 'citizen_a_001',
    name: 'Citizen A',
    category: 'r_citizens',
    prob_spawn: 1,
    currentRoomId: null
  };
  const citizenB = {
    id: 'citizen_b_001',
    UniqueID: 'citizen_b_001',
    name: 'Citizen B',
    category: 'r_citizens',
    prob_spawn: 1,
    currentRoomId: null
  };

  game.characters = [citizenA, citizenB];
  game.characterMap = { citizen_a_001: citizenA, citizen_b_001: citizenB };

  game.player = {
    CurrentRoom: 'plaza',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_citizen_01',
      when: 'spawn_citizen',
      location: '*',
      target: 'player',
      action: 'spawn_citizen_01',
      prob: 100,
      priority: 50,
      thread_name: '',
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_citizen_01',
          bActive: true,
          InputType: 'None',
          PassCommands: [{ cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' }],
          FailCommands: []
        }
      ]
    }
  ];

  const spawns = game.runRoomEntrySpawns('plaza', { rng: createQueueRng([0.1]) });
  assert.equal(game.characterMap.citizen_a_001.currentRoomId, 'plaza');
  assert.equal(game.variables.last_spawn_citizen_id, 'citizen_a_001');
  assert.ok(spawns.spawnedIds.includes('citizen_a_001'));
});

