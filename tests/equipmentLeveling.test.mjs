import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// Load modules
const { applyLevelProgression } = await import('../src/utils/leveling.js');

// Helper to load JSON files
function loadJSON(relativePath) {
  const fullPath = resolve(projectRoot, relativePath);
  const content = readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

test('vibranium ring +2 Power bonus triggers level up from 0 to 1', () => {
  // Load game data
  const levelingConfig = loadJSON('public/DB/leveling.json');
  const vibraniumRing = loadJSON('public/DB/objects/equipment/vibranium_ring.json');
  const playerTemplate = loadJSON('public/DB/player.json');

  // Verify ring has +2 Power bonus
  assert.equal(vibraniumRing.Bonuses.Power, 2, 'Vibranium ring should have +2 Power bonus');

  // Create player at level 0 with no stats
  const player = {
    ...playerTemplate,
    Equipped: [],
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      MS: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };

  // Create context with objectMap containing vibranium ring
  const context = {
    objectMap: {
      [vibraniumRing.UniqueID]: vibraniumRing
    }
  };

  // Test 1: No equipment, no level up
  let result = applyLevelProgression(player, levelingConfig, context);
  assert.equal(result.levelsGained, 0, 'Should not level up with no equipment');
  assert.equal(player.Stats.Level, 0, 'Level should remain 0');

  // Test 2: Equip vibranium ring (+2 Power)
  player.Equipped.push(vibraniumRing.UniqueID);

  result = applyLevelProgression(player, levelingConfig, context);

  // Verify leveling config
  assert.equal(levelingConfig.statLeveling.enabled, true, 'Stat leveling should be enabled');
  assert.equal(levelingConfig.statLeveling.thresholdToNext, 2, 'Threshold should be 2 points per level');

  // Verify level up occurred
  assert.equal(result.levelsGained, 1, 'Should gain 1 level from +2 Power bonus');
  assert.equal(player.Stats.Level, 1, 'Player should be level 1 after equipping ring');
  
  // Verify stat tracking
  assert.equal(player.Stats.CoreStatPeakEquip, 2, 'CoreStatPeakEquip should track +2 equipment bonus');
  assert.equal(player.Stats.CoreStatXP, 0, 'CoreStatXP should be 0 (consumed 2 points for level up)');

  // Verify level up details
  assert.equal(result.levelUps.length, 1, 'Should have 1 level up event');
  assert.equal(result.levelUps[0].toLevel, 1, 'Level up should be to level 1');
  assert.equal(result.statProgression.statGained, 2, 'Should report +2 stat points gained');
});

test('unequipping vibranium ring prevents further stat-based level ups', () => {
  const levelingConfig = loadJSON('public/DB/leveling.json');
  const vibraniumRing = loadJSON('public/DB/objects/equipment/vibranium_ring.json');

  const player = {
    Equipped: [vibraniumRing.UniqueID],
    Stats: {
      Level: 1,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      MS: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 2,
      CoreStatXP: 2,
      Health: 110,
      MaxHealth: 110,
      Energy: 108,
      MaxEnergy: 108
    }
  };

  const context = {
    objectMap: {
      [vibraniumRing.UniqueID]: vibraniumRing
    }
  };

  let result = applyLevelProgression(player, levelingConfig, context);
  assert.equal(result.levelsGained, 0, 'Should not gain more levels at same stat value');

  // Unequip ring
  player.Equipped = [];

  result = applyLevelProgression(player, levelingConfig, context);

  // Equipment bonus removed, but level remains
  assert.equal(player.Stats.Level, 1, 'Level should remain at 1');
  assert.equal(result.levelsGained, 0, 'Should not lose levels');
});

test('multiple equipment bonuses stack for leveling', () => {
  const levelingConfig = loadJSON('public/DB/leveling.json');
  
  // Create mock equipment with different bonuses
  const ring = {
    UniqueID: 'test_ring',
    Bonuses: { Power: 1 }
  };
  
  const gloves = {
    UniqueID: 'test_gloves',
    Bonuses: { Focus: 2 }
  };
  
  const boots = {
    UniqueID: 'test_boots',
    Bonuses: { Stealth: 1 }
  };

  const player = {
    Equipped: ['test_ring', 'test_gloves', 'test_boots'],
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      Focus: 0,
      Stealth: 0,
      MS: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };

  const context = {
    objectMap: {
      'test_ring': ring,
      'test_gloves': gloves,
      'test_boots': boots
    }
  };

  const result = applyLevelProgression(player, levelingConfig, context);

  // 4 total stat points / 2 threshold = 2 levels
  assert.equal(result.levelsGained, 2, 'Should gain 2 levels from 4 stat points');
  assert.equal(player.Stats.Level, 2, 'Player should be level 2');
  assert.equal(player.Stats.CoreStatPeakEquip, 4, 'Should track total of 4 equipment bonus points');
});

test('base stats + equipment bonuses combine for leveling', () => {
  const levelingConfig = loadJSON('public/DB/leveling.json');
  const vibraniumRing = loadJSON('public/DB/objects/equipment/vibranium_ring.json');

  const player = {
    Equipped: [vibraniumRing.UniqueID],
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 2, // Base stat
      Focus: 0,
      Stealth: 0,
      MS: 0,
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
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

  const result = applyLevelProgression(player, levelingConfig, context);

  // System only counts GAINS from previous peak. Initial stats don't count.
  // Only the +2 equipment bonus is a NEW gain, so 2 points / 2 threshold = 1 level
  assert.equal(result.levelsGained, 1, 'Should gain 1 level (only equipment bonus counts as gain)');
  assert.equal(player.Stats.Level, 1, 'Player should be level 1');
  assert.equal(player.Stats.CoreStatPeakEquip, 2, 'Should track 2 equipment bonus points');
});
