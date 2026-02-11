import assert from 'node:assert/strict';
import test from 'node:test';

import { SceneRunner } from '../src/events/SceneRunner.js';

test('SceneRunner exposes nextStageId and advances linear stages', () => {
  const scene = {
    UniqueID: 'test_scene_001',
    Title: 'Test Scene',
    Stages: [
      {
        StageID: 'stage_1',
        Text: 'Stage 1',
        Media: 'stage1.jpg',
        NextStage: 'stage_2',
        Choices: []
      },
      {
        StageID: 'stage_2',
        Text: 'Stage 2 (end)',
        Media: 'stage2.jpg',
        IsEnd: true,
        Choices: []
      }
    ]
  };

  const game = {
    player: { Stats: {}, CompletedScenes: [] },
    spawnState: {},
    eventEngine: {
      createResult: () => ({ texts: [], media: null, errors: [], paused: false, sceneData: null, didSomething: false }),
      executeCommand: () => {}
    },
    sceneLoader: {
      getScene: id => (id === scene.UniqueID ? scene : null),
      completeScene: () => {}
    },
    getCurrentRoom: () => null,
    gainExperience: () => {}
  };

  const runner = new SceneRunner(game);
  game.sceneRunner = runner;

  const first = runner.begin(scene.UniqueID);
  assert.ok(first?.sceneData, 'begin() returns sceneData');
  assert.equal(first.sceneData.stageId, 'stage_1');
  assert.equal(first.sceneData.nextStageId, 'stage_2');

  const second = runner.advance();
  assert.equal(runner.isActive(), false, 'advance() ends the scene when next stage is IsEnd');
  assert.ok(second?.sceneData, 'end stage returns sceneData (for Talk reveal)');
  assert.equal(second.sceneData.stageId, 'stage_2');
  assert.equal(second.sceneData.isEnd, true);
  assert.deepEqual(second?.texts, ['Stage 2 (end)']);
});
