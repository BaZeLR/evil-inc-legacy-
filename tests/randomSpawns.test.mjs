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
    0.12, // kicker => 6 (score 56 triggers)
    0.3 // delta => 11 (range 5..25)
  ]);

  const spawns = game.runRoomEntrySpawns('street', { rng });
  assert.equal(game.player.Stats.Notoriety, 11);
  assert.equal(game.variables.last_spicy_delta, 11);
  assert.ok(spawns.texts.some(line => String(line).includes('Spicy event')));
  assert.ok(spawns.texts.some(line => String(line).includes('+11')));
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

test('spawn_citizen: filters by SpawnAreas vs room Group (NPC table)', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    quad: {
      id: 'quad',
      UniqueID: 'quad',
      Name: 'Campus Quad',
      Group: 'West Side',
      Spawns: false,
      NPCs: [
        { UniqueID: 'citizen_west_001', Weight: 50 },
        { UniqueID: 'citizen_east_001', Weight: 50 }
      ]
    }
  };

  const west = {
    id: 'citizen_west_001',
    UniqueID: 'citizen_west_001',
    name: 'West Citizen',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['West Side'],
    currentRoomId: null
  };
  const east = {
    id: 'citizen_east_001',
    UniqueID: 'citizen_east_001',
    name: 'East Citizen',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['East Side'],
    currentRoomId: null
  };

  game.characters = [west, east];
  game.characterMap = { citizen_west_001: west, citizen_east_001: east };
  game.player = {
    CurrentRoom: 'quad',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_citizen_02',
      when: 'spawn_citizen',
      location: '*',
      target: 'player',
      action: 'spawn_citizen_02',
      prob: 100,
      priority: 50,
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_citizen_02',
          bActive: true,
          InputType: 'None',
          PassCommands: [{ cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' }],
          FailCommands: []
        }
      ]
    }
  ];

  const spawns = game.runRoomEntrySpawns('quad', { rng: createQueueRng([0.9]) });
  assert.equal(game.characterMap.citizen_west_001.currentRoomId, 'quad');
  assert.equal(game.characterMap.citizen_east_001.currentRoomId, null);
  assert.equal(game.variables.last_spawn_citizen_id, 'citizen_west_001');
  assert.ok(spawns.spawnedIds.includes('citizen_west_001'));
});

test('spawn_citizen: apartment building rooms can spawn apartment r_citizens', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    apartmentLobby: {
      id: 'apartmentLobby',
      UniqueID: 'apartmentLobby',
      Name: 'Appartment Lobby',
      Group: 'Apartment Building',
      Spawns: true,
      NPCs: [
        { UniqueID: 'hot_neighbor_001', Weight: 15 },
        { UniqueID: 'cute_neighbor_001', Weight: 15 },
        { UniqueID: 'high_neighbor_001', Weight: 10 },
        { UniqueID: 'fud_ex_driver_001', Weight: 10 },
        { UniqueID: 'scary_drug_dealer_001', Weight: 15 },
        { UniqueID: 'married_neighbor_001', Weight: 15 },
        { UniqueID: 'landlord_001', Weight: 20 }
      ]
    }
  };

  const makeCitizen = (id) => ({
    id,
    UniqueID: id,
    name: id,
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['Apartment Building'],
    currentRoomId: null
  });

  const citizens = [
    makeCitizen('hot_neighbor_001'),
    makeCitizen('cute_neighbor_001'),
    makeCitizen('high_neighbor_001'),
    makeCitizen('fud_ex_driver_001'),
    makeCitizen('scary_drug_dealer_001'),
    makeCitizen('married_neighbor_001'),
    makeCitizen('landlord_001')
  ];

  game.characters = citizens;
  game.characterMap = Object.fromEntries(citizens.map(c => [c.id, c]));

  game.player = {
    CurrentRoom: 'apartmentLobby',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_citizen_apartment_01',
      when: 'spawn_citizen',
      location: '*',
      target: 'player',
      action: 'spawn_citizen_apartment_01',
      prob: 100,
      priority: 50,
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_citizen_apartment_01',
          bActive: true,
          InputType: 'None',
          PassCommands: [{ cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' }],
          FailCommands: []
        }
      ]
    }
  ];

  // rng=0 => weightedPick selects the first entry in the room NPC table.
  const spawns = game.runRoomEntrySpawns('apartmentLobby', { rng: createQueueRng([0.0]) });
  assert.equal(game.characterMap.hot_neighbor_001.currentRoomId, 'apartmentLobby');
  assert.equal(game.variables.last_spawn_citizen_id, 'hot_neighbor_001');
  assert.ok(spawns.spawnedIds.includes('hot_neighbor_001'));
});

test('spawn_citizen: can spawn a second citizen sometimes', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    plaza: {
      id: 'plaza',
      UniqueID: 'plaza',
      Name: 'Plaza',
      Group: 'Apartment Building',
      Spawns: true,
      NPCs: [
        { UniqueID: 'hot_neighbor_001', Weight: 50 },
        { UniqueID: 'cute_neighbor_001', Weight: 50 }
      ]
    }
  };

  const hot = {
    id: 'hot_neighbor_001',
    UniqueID: 'hot_neighbor_001',
    name: 'Hot Neighbor',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['Apartment Building'],
    currentRoomId: null
  };
  const cute = {
    id: 'cute_neighbor_001',
    UniqueID: 'cute_neighbor_001',
    name: 'Cute Neighbor',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['Apartment Building'],
    currentRoomId: null
  };

  game.characters = [hot, cute];
  game.characterMap = { hot_neighbor_001: hot, cute_neighbor_001: cute };

  game.player = {
    CurrentRoom: 'plaza',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_citizen_double_01',
      when: 'spawn_citizen',
      location: '*',
      target: 'player',
      action: 'spawn_citizen_double_01',
      prob: 100,
      priority: 50,
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_citizen_double_01',
          bActive: true,
          InputType: 'None',
          PassCommands: [
            { cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' },
            { cmdtype: 'CT_TRY_SPAWN_EXTRA_CITIZEN', CommandPart2: 100 }
          ],
          FailCommands: []
        }
      ]
    }
  ];

  // First spawn picks hot (rng=0), extra spawn chance passes (100%), then second pick selects cute (rng=0.9).
  const spawns = game.runRoomEntrySpawns('plaza', { rng: createQueueRng([0.0, 0.9]) });
  assert.equal(game.characterMap.hot_neighbor_001.currentRoomId, 'plaza');
  assert.equal(game.characterMap.cute_neighbor_001.currentRoomId, 'plaza');
  assert.ok(spawns.spawnedIds.includes('hot_neighbor_001'));
  assert.ok(spawns.spawnedIds.includes('cute_neighbor_001'));
});

test('spawn_citizen: falls back to global r_citizens pool when room has no NPC table', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    quad: { id: 'quad', UniqueID: 'quad', Name: 'Campus Quad', Group: 'West Side', Spawns: false }
  };

  const west = {
    id: 'citizen_west_002',
    UniqueID: 'citizen_west_002',
    name: 'West Citizen',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['West Side'],
    currentRoomId: null
  };
  const east = {
    id: 'citizen_east_002',
    UniqueID: 'citizen_east_002',
    name: 'East Citizen',
    category: 'r_citizens',
    prob_spawn: 1,
    SpawnAreas: ['East Side'],
    currentRoomId: null
  };

  game.characters = [west, east];
  game.characterMap = { citizen_west_002: west, citizen_east_002: east };
  game.player = {
    CurrentRoom: 'quad',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  game.plannedEvents = [
    {
      id: 'spawn_citizen_03',
      when: 'spawn_citizen',
      location: '*',
      target: 'player',
      action: 'spawn_citizen_03',
      prob: 100,
      priority: 50,
      threaded: false,
      repeatable: true,
      completeOnTrigger: true,
      suppressCombat: false,
      rewards: null,
      Actions: [
        {
          name: 'spawn_citizen_03',
          bActive: true,
          InputType: 'None',
          PassCommands: [{ cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' }],
          FailCommands: []
        }
      ]
    }
  ];

  const spawns = game.runRoomEntrySpawns('quad', { rng: createQueueRng([0.2]) });
  assert.equal(game.characterMap.citizen_west_002.currentRoomId, 'quad');
  assert.equal(game.characterMap.citizen_east_002.currentRoomId, null);
  assert.equal(game.variables.last_spawn_citizen_id, 'citizen_west_002');
  assert.ok(spawns.spawnedIds.includes('citizen_west_002'));
});

test('random residents: picks from room Residents list and spawns with per-resident chance', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    plaza: {
      id: 'plaza',
      UniqueID: 'plaza',
      Name: 'Plaza',
      Spawns: false,
      NPCs: [
        { UniqueID: 'resident_a_001', Chance: 60 },
        { UniqueID: 'resident_b_001', Chance: 60 }
      ]
    }
  };

  const residentA = {
    id: 'resident_a_001',
    UniqueID: 'resident_a_001',
    name: 'Resident A',
    category: 'r_citizens',
    currentRoomId: null
  };
  const residentB = {
    id: 'resident_b_001',
    UniqueID: 'resident_b_001',
    name: 'Resident B',
    category: 'r_citizens',
    currentRoomId: null
  };

  game.characters = [residentA, residentB];
  game.characterMap = { resident_a_001: residentA, resident_b_001: residentB };
  game.player = {
    CurrentRoom: 'plaza',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  // No planned events needed; Residents spawns are room-driven.
  game.plannedEvents = [];

  // Pick index 1 (resident_b_001), then rollD100=11 (<=60) so spawn succeeds.
  const spawns = game.runRoomEntrySpawns('plaza', { rng: createQueueRng([0.6, 0.1]) });
  assert.equal(game.characterMap.resident_b_001.currentRoomId, 'plaza');
  assert.equal(game.variables.last_spawn_resident_id, 'resident_b_001');
  assert.ok(spawns.spawnedIds.includes('resident_b_001'));
});

test('random residents: clamps chance to 55..80 (100% becomes 80%)', () => {
  const game = new Game();
  game.save = createEmptySaveGame();

  game.roomMap = {
    lobby: {
      id: 'lobby',
      UniqueID: 'lobby',
      Name: 'Lobby',
      Spawns: false,
      Residents: [{ UniqueID: 'resident_only_001', Chance: 100 }]
    }
  };

  const resident = {
    id: 'resident_only_001',
    UniqueID: 'resident_only_001',
    name: 'Resident Only',
    category: 'r_citizens',
    currentRoomId: null
  };
  game.characters = [resident];
  game.characterMap = { resident_only_001: resident };
  game.player = {
    CurrentRoom: 'lobby',
    Credits: 0,
    Inventory: [],
    Stats: { DaysInGame: 1, GameTimeMinutes: 12 * 60, Energy: 5, Notoriety: 0, MaxNotoriety: 100 }
  };

  // pickIndex uses rng once (only 1 entry => always 0), then rollD100 should be 82 which fails if clamped to 80.
  // rollD100 = floor(0.81*100)+1 = 82
  const spawns = game.runRoomEntrySpawns('lobby', { rng: createQueueRng([0.0, 0.81]) });
  assert.equal(game.characterMap.resident_only_001.currentRoomId, null);
  assert.ok(!spawns.spawnedIds.includes('resident_only_001'));
});

