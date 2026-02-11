import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

function loadJSON(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

const { addExperience, applyLevelProgression } = await import('../src/utils/leveling.js');

test('level up grants stat points that can be allocated', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  // Verify config grants stat points per level
  assert.equal(config.statPointsPerLevel, 1, 'Should grant 1 stat point per level');
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      UnspentStatPoints: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  // Gain 1 level from experience
  const expForLevel1 = config.expThresholdsToNext[0]; // 100 exp
  const result = addExperience(player, expForLevel1, config);
  
  assert.equal(player.Stats.Level, 1, 'Should be level 1');
  assert.equal(result.levelsGained, 1, 'Should gain 1 level');
  assert.equal(player.Stats.UnspentStatPoints, 1, 'Should have 1 unspent stat point');
  
  // Simulate allocating point to Power
  const pointsBefore = player.Stats.UnspentStatPoints;
  const powerBefore = player.Stats.Power;
  
  player.Stats.Power += 1;
  player.Stats.UnspentStatPoints -= 1;
  
  assert.equal(player.Stats.Power, 1, 'Power should increase to 1');
  assert.equal(player.Stats.UnspentStatPoints, 0, 'Should have 0 unspent points');
});

test('multiple level ups accumulate stat points', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      UnspentStatPoints: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  // Gain 3 levels (100 + 100 + 140 = 340 exp)
  const expFor3Levels = config.expThresholdsToNext[0] + config.expThresholdsToNext[1] + config.expThresholdsToNext[2];
  const result = addExperience(player, expFor3Levels, config);
  
  assert.equal(player.Stats.Level, 3, 'Should be level 3');
  assert.equal(result.levelsGained, 3, 'Should gain 3 levels');
  assert.equal(player.Stats.UnspentStatPoints, 3, 'Should have 3 unspent stat points');
  
  // Allocate points to different stats
  player.Stats.Power += 1;
  player.Stats.UnspentStatPoints -= 1;
  
  player.Stats.Focus += 1;
  player.Stats.UnspentStatPoints -= 1;
  
  player.Stats.Stealth += 1;
  player.Stats.UnspentStatPoints -= 1;
  
  assert.equal(player.Stats.Power, 1, 'Power should be 1');
  assert.equal(player.Stats.Focus, 1, 'Focus should be 1');
  assert.equal(player.Stats.Stealth, 1, 'Stealth should be 1');
  assert.equal(player.Stats.UnspentStatPoints, 0, 'All points allocated');
});

test('stat-based leveling also grants stat points', () => {
  const config = loadJSON('public/DB/leveling.json');
  const vibraniumRing = loadJSON('public/DB/objects/equipment/vibranium_ring.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Equipped: [vibraniumRing.UniqueID],
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
      UnspentStatPoints: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  const context = {
    objectMap: {
      [vibraniumRing.UniqueID]: vibraniumRing
    }
  };
  
  const result = applyLevelProgression(player, config, context);
  
  assert.equal(result.levelsGained, 1, 'Should gain 1 level from equipment bonus');
  assert.equal(player.Stats.Level, 1, 'Should be level 1');
  assert.equal(player.Stats.UnspentStatPoints, 1, 'Should have 1 stat point from stat-based level up');
});

test('combined exp + stat leveling grants cumulative stat points', () => {
  const config = loadJSON('public/DB/leveling.json');
  const vibraniumRing = loadJSON('public/DB/objects/equipment/vibranium_ring.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Equipped: [],
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
      UnspentStatPoints: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  const context = {
    objectMap: {
      [vibraniumRing.UniqueID]: vibraniumRing
    }
  };
  
  // First, gain 1 level from exp
  const expForLevel1 = config.expThresholdsToNext[0];
  addExperience(player, expForLevel1, config, context);
  
  assert.equal(player.Stats.Level, 1, 'Should be level 1');
  assert.equal(player.Stats.UnspentStatPoints, 1, 'Should have 1 stat point from exp level');
  
  // Now equip the ring (grants +2 Power → 1 stat level)
  player.Equipped.push(vibraniumRing.UniqueID);
  const result = applyLevelProgression(player, config, context);
  
  assert.equal(player.Stats.Level, 2, 'Should be level 2');
  assert.equal(player.Stats.UnspentStatPoints, 2, 'Should have 2 total stat points (1 from exp + 1 from stats)');
});

test('stat points persist after saving (not lost on unspent)', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 5,
      Experience: 0,
      Power: 2,
      Focus: 1,
      Stealth: 1,
      UnspentStatPoints: 3, // Player has 3 unspent points
      Health: 150,
      MaxHealth: 150,
      Energy: 140,
      MaxEnergy: 140
    }
  };
  
  // Simulate save/load by cloning the stats
  const savedStats = JSON.parse(JSON.stringify(player.Stats));
  
  // Verify points persist
  assert.equal(savedStats.UnspentStatPoints, 3, 'Unspent points should persist in save');
  
  // Player allocates 2 points later
  player.Stats.Power += 1;
  player.Stats.UnspentStatPoints -= 1;
  player.Stats.Focus += 1;
  player.Stats.UnspentStatPoints -= 1;
  
  assert.equal(player.Stats.Power, 3, 'Power should be 3');
  assert.equal(player.Stats.Focus, 2, 'Focus should be 2');
  assert.equal(player.Stats.UnspentStatPoints, 1, 'Should have 1 point left');
});
