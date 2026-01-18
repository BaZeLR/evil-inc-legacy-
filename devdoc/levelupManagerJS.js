// src/leveling/LevelUpManager.js
import { create } from 'zustand';
import levelingData from './levelingData.json';

export const useLevelingStore = create((set, get) => ({
  currentLevel: 0,
  expCurrent: 0,
  expToNext: levelingData.expThresholdsToNext[0] || 100,
  mentalStatus: { type: 'Bad', level: 0 },
  // ... other stats: power, focus, stealth, health {current, max}, energy {current, max}

  addExp: (amount) => {
    const newExp = get().expCurrent + amount;

    // EXP CHECKPOINT - the trigger
    if (newExp >= get().expToNext && get().currentLevel < 20) {
      const newLevel = get().currentLevel + 1;
      const nextThreshold = levelingData.expThresholdsToNext[newLevel] || 2500;

      // Find current stage
      const currentStage = levelingData.mentalStages.find(stage => 
        stage.levels.includes(newLevel)
      ) || levelingData.mentalStages[0];

      // Auto gains
      const newHealthMax = get().health.max + levelingData.autoGainsPerLevel.maxHealth;
      const newEnergyMax = get().energy.max + levelingData.autoGainsPerLevel.maxEnergy;

      set({
        expCurrent: newExp - get().expToNext,
        expToNext: nextThreshold,
        currentLevel: newLevel,
        mentalStatus: { type: currentStage.type, level: newLevel },
        health: { ...get().health, max: newHealthMax },
        energy: { ...get().energy, max: newEnergyMax },
        levelUpTriggered: true  // Opens modal
      });
    } else {
      set({ expCurrent: newExp });
    }
  },

  // Called after player chooses stat in modal// this is pop up screen to choose stat. with return/exit button i right upper corner 
  executeLevelUp: (chosenStat) => {
    const statUpdate = chosenStat === 'power' ? { power: get().power + 1 } :
                       chosenStat === 'focus' ? { focus: get().focus + 1 } :
                       { stealth: get().stealth + 1 };

    set({
      ...statUpdate,
      levelUpTriggered: false
    });
  }
}));