import assert from 'node:assert/strict';
import test from 'node:test';
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

const { getMentalStatusForLevel, applyLevelProgression, addExperience } = await import('../src/utils/leveling.js');

test('leveling.json data structure is valid', () => {
  const config = loadJSON('public/DB/leveling.json');
  
  // Verify basic structure
  assert.ok(config.maxLevel, 'maxLevel should be defined');
  assert.ok(Array.isArray(config.expThresholdsToNext), 'expThresholdsToNext should be an array');
  assert.ok(Array.isArray(config.mentalStages), 'mentalStages should be an array');
  
  // Verify maxLevel matches array length
  assert.equal(config.expThresholdsToNext.length, config.maxLevel, 
    `expThresholdsToNext length (${config.expThresholdsToNext.length}) should match maxLevel (${config.maxLevel})`);
  
  // Verify all thresholds are positive numbers
  config.expThresholdsToNext.forEach((threshold, index) => {
    assert.ok(typeof threshold === 'number', `Threshold at index ${index} should be a number`);
    assert.ok(threshold > 0, `Threshold at index ${index} should be positive`);
  });
  
  // Verify autoGainsPerLevel
  assert.ok(config.autoGainsPerLevel, 'autoGainsPerLevel should be defined');
  assert.equal(typeof config.autoGainsPerLevel.maxHealth, 'number', 'maxHealth gain should be a number');
  assert.equal(typeof config.autoGainsPerLevel.maxEnergy, 'number', 'maxEnergy gain should be a number');
  
  // Verify statLeveling
  assert.ok(config.statLeveling, 'statLeveling should be defined');
  assert.equal(config.statLeveling.enabled, true, 'statLeveling should be enabled');
  assert.equal(typeof config.statLeveling.thresholdToNext, 'number', 'statLeveling threshold should be a number');
  assert.equal(typeof config.statLeveling.pointsPerLevel, 'number', 'statLeveling points per level should be a number');
});

test('mental stages cover all levels from 0 to maxLevel', () => {
  const config = loadJSON('public/DB/leveling.json');
  
  // Collect all levels covered by mental stages
  const coveredLevels = new Set();
  config.mentalStages.forEach(stage => {
    assert.ok(Array.isArray(stage.levels), `Stage ${stage.type} should have levels array`);
    stage.levels.forEach(level => coveredLevels.add(level));
  });
  
  // Check that all levels 0 through maxLevel are covered
  for (let level = 0; level <= config.maxLevel; level++) {
    assert.ok(coveredLevels.has(level), `Level ${level} should be covered by a mental stage`);
  }
});

test('each mental stage has proper description data', () => {
  const config = loadJSON('public/DB/leveling.json');
  
  config.mentalStages.forEach((stage, stageIndex) => {
    assert.ok(stage.type, `Stage ${stageIndex} should have a type`);
    assert.ok(Array.isArray(stage.levels), `Stage ${stage.type} should have levels array`);
    assert.ok(stage.media, `Stage ${stage.type} should have media path`);
    
    // Either description or descriptionByLevelInStage should exist
    const hasDescription = Boolean(stage.description);
    const hasDescByLevel = Array.isArray(stage.descriptionByLevelInStage);
    
    assert.ok(hasDescription || hasDescByLevel, 
      `Stage ${stage.type} should have either description or descriptionByLevelInStage`);
    
    // If using descriptionByLevelInStage, verify count matches level count
    if (hasDescByLevel) {
      const expectedCount = stage.levels.length;
      const actualCount = stage.descriptionByLevelInStage.length;
      
      // Allow either exact match or enough descriptions to cover all levels
      assert.ok(actualCount >= expectedCount || actualCount === expectedCount,
        `Stage ${stage.type} has ${stage.levels.length} levels but only ${actualCount} descriptions`);
    }
  });
});

test('getMentalStatusForLevel returns valid data for all levels', () => {
  const config = loadJSON('public/DB/leveling.json');
  
  for (let level = 0; level <= config.maxLevel; level++) {
    const result = getMentalStatusForLevel(config, level);
    
    assert.ok(result, `Level ${level} should return a result`);
    assert.equal(result.level, level, `Result level should match input level ${level}`);
    assert.ok(result.type, `Level ${level} should have a type: ${result.type}`);
    assert.ok(result.display, `Level ${level} should have a display string: ${result.display}`);
    assert.ok(result.description, `Level ${level} should have a description`);
    assert.ok(result.media, `Level ${level} should have media path`);
  }
});

test('experience-based leveling from 0 to max', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 0,
      Experience: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  let totalExpRequired = 0;
  
  // Test leveling from 0 to maxLevel
  for (let targetLevel = 1; targetLevel <= config.maxLevel; targetLevel++) {
    const expNeeded = config.expThresholdsToNext[targetLevel - 1];
    totalExpRequired += expNeeded;
    
    const result = addExperience(player, expNeeded, config);
    
    assert.equal(player.Stats.Level, targetLevel, 
      `After adding ${expNeeded} exp, player should be level ${targetLevel}`);
    assert.equal(result.levelsGained, 1, 
      `Should gain exactly 1 level when adding ${expNeeded} exp to level ${targetLevel - 1}`);
  }
  
  // Verify cannot level beyond maxLevel
  const extraExpResult = addExperience(player, 10000, config);
  assert.equal(player.Stats.Level, config.maxLevel, 
    'Player should remain at maxLevel even with excess exp');
  assert.equal(extraExpResult.levelsGained, 0, 
    'Should not gain levels beyond maxLevel');
});

test('stat-based leveling works correctly', () => {
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
      CoreStatPeakBase: 0,
      CoreStatPeakEquip: 0,
      CoreStatXP: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  // Verify stat leveling is enabled
  assert.equal(config.statLeveling.enabled, true, 'Stat leveling should be enabled');
  const threshold = config.statLeveling.thresholdToNext;
  
  // Test gaining stats to level up
  player.Stats.Power = threshold; // Gain threshold points
  
  const result = applyLevelProgression(player, config);
  
  assert.equal(result.levelsGained, 1, `Gaining ${threshold} stat points should grant 1 level`);
  assert.equal(player.Stats.Level, 1, 'Player should be level 1');
  assert.equal(player.Stats.CoreStatPeakBase, threshold, 'CoreStatPeakBase should track stat gains');
  assert.equal(player.Stats.CoreStatXP, 0, 'CoreStatXP should reset to 0 after level up');
});

test('auto gains are applied correctly per level', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const initialHealth = 100;
  const initialEnergy = 100;
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 0,
      Experience: 0,
      Health: initialHealth,
      MaxHealth: initialHealth,
      Energy: initialEnergy,
      MaxEnergy: initialEnergy
    }
  };
  
  const healthPerLevel = config.autoGainsPerLevel.maxHealth;
  const energyPerLevel = config.autoGainsPerLevel.maxEnergy;
  
  // Gain 3 levels worth of experience
  const levelsToGain = 3;
  let totalExp = 0;
  for (let i = 0; i < levelsToGain; i++) {
    totalExp += config.expThresholdsToNext[i];
  }
  
  const result = addExperience(player, totalExp, config);
  
  assert.equal(result.levelsGained, levelsToGain, `Should gain ${levelsToGain} levels`);
  
  const expectedHealth = initialHealth + (healthPerLevel * levelsToGain);
  const expectedEnergy = initialEnergy + (energyPerLevel * levelsToGain);
  
  assert.equal(player.Stats.MaxHealth, expectedHealth, 
    `MaxHealth should be ${expectedHealth} (${initialHealth} + ${healthPerLevel} * ${levelsToGain})`);
  assert.equal(player.Stats.MaxEnergy, expectedEnergy, 
    `MaxEnergy should be ${expectedEnergy} (${initialEnergy} + ${energyPerLevel} * ${levelsToGain})`);
});

test('combined exp and stat leveling works', () => {
  const config = loadJSON('public/DB/leveling.json');
  const playerTemplate = loadJSON('public/DB/player.json');
  
  const player = {
    ...playerTemplate,
    Stats: {
      Level: 0,
      Experience: 0,
      Power: 0,
      CoreStatPeakBase: 0,
      CoreStatXP: 0,
      Health: 100,
      MaxHealth: 100,
      Energy: 100,
      MaxEnergy: 100
    }
  };
  
  // Gain 1 level from exp
  const expForLevel1 = config.expThresholdsToNext[0];
  addExperience(player, expForLevel1, config);
  assert.equal(player.Stats.Level, 1, 'Should be level 1 from exp');
  
  // Gain 1 level from stats
  const statThreshold = config.statLeveling.thresholdToNext;
  player.Stats.Power = statThreshold;
  
  const result = applyLevelProgression(player, config);
  
  assert.equal(player.Stats.Level, 2, 'Should be level 2 after stat level up');
  assert.equal(result.levelsGained, 1, 'Should gain 1 level from stats');
  assert.ok(result.statProgression, 'statProgression should be defined');
  assert.equal(result.statProgression.levelsGained, 1, 'statProgression should show 1 level gained');
});
