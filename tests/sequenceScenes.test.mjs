import assert from 'node:assert/strict';
import test from 'node:test';

import { EventEngine } from '../src/events/EventEngine.js';
import { SceneLoader } from '../src/events/SceneLoader.js';
import { SceneRunner } from '../src/events/SceneRunner.js';

function makeGame() {
  const game = {
    player: { Stats: {}, CompletedScenes: [] },
    variables: {},
    spawnState: {},
    getCurrentRoom: () => null
  };
  game.sceneLoader = new SceneLoader(game);
  game.sceneRunner = new SceneRunner(game);
  game.eventEngine = new EventEngine(game);
  return game;
}

function primeScenes(sceneLoader, scenes) {
  sceneLoader.scenes = scenes;
  sceneLoader.sceneMap = {};
  sceneLoader.eventStatusMap = {};

  for (const scene of scenes) {
    sceneLoader.sceneMap[scene.UniqueID] = scene;
  }

  sceneLoader.buildLocationCache();
  sceneLoader.buildNumberCache();
}

test('numeric TriggerScene resolves to unique sequence in the current room', () => {
  const game = makeGame();
  primeScenes(game.sceneLoader, [
    {
      UniqueID: 'room_arc_001_story',
      SceneType: 'story',
      Location: 'room_1',
      Stages: [{ StageID: 'stage_01', Text: 'Story', IsEnd: true }]
    },
    {
      UniqueID: 'room_arc_001_sequence',
      SceneType: 'sequence',
      Location: 'room_1',
      Stages: [{ StageID: 'stage_01', Text: 'Sequence', IsEnd: true }]
    }
  ]);

  const result = { errors: [], didSomething: false };
  const ctx = { room: { id: 'room_1' } };

  assert.equal(game.eventEngine.resolveSceneRef('1', ctx, result), 'room_arc_001_sequence');
  assert.deepEqual(result.errors, []);
});

test('numeric TriggerScene that is ambiguous reports an error', () => {
  const game = makeGame();
  primeScenes(game.sceneLoader, [
    {
      UniqueID: 'room_arc_001_sequence',
      SceneType: 'sequence',
      Location: 'room_1',
      Stages: [{ StageID: 'stage_01', Text: 'A', IsEnd: true }]
    },
    {
      UniqueID: 'room_other_001_sequence',
      SceneType: 'sequence',
      Location: 'room_1',
      Stages: [{ StageID: 'stage_01', Text: 'B', IsEnd: true }]
    }
  ]);

  const result = { errors: [], didSomething: false };
  const ctx = { room: { id: 'room_1' } };

  assert.equal(game.eventEngine.resolveSceneRef('001', ctx, result), '');
  assert.equal(result.didSomething, true);
  assert.ok(result.errors.some(line => String(line).includes("unable to resolve scene number '001'")));
});

test('SceneRunner.begin respects RequiredFlags and Repeatable', () => {
  const game = makeGame();
  const scene = {
    UniqueID: 'room_arc_001_sequence',
    SceneType: 'sequence',
    Location: 'room_1',
    Repeatable: false,
    Trigger: { RequiredFlags: { has_badge: true } },
    Stages: [{ StageID: 'stage_01', Text: 'Hello', IsEnd: true }]
  };

  primeScenes(game.sceneLoader, [scene]);

  // Missing flag blocks start.
  assert.equal(game.sceneRunner.begin(scene.UniqueID), null);

  // Flag allows start.
  game.player.Stats.has_badge = true;
  const started = game.sceneRunner.begin(scene.UniqueID);
  assert.ok(started?.sceneData);

  // Mark completed and ensure non-repeatable scenes don't start again.
  game.sceneLoader.completeScene(scene.UniqueID);
  assert.equal(game.sceneRunner.begin(scene.UniqueID), null);

  // Repeatable scenes can be started even if completed.
  scene.Repeatable = true;
  const repeatStart = game.sceneRunner.begin(scene.UniqueID);
  assert.ok(repeatStart?.sceneData);
});

