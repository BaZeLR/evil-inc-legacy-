const DEFAULT_EXPERIENCE_CHECKPOINTS = [
  100, 100, 140, 196, 275, 385, 538, 753, 1055, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 2500, 2500, 2500, 2500,
  2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 5000, 999999
];

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clampInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function normalizeThresholds(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const parsed = value.map(entry => toFiniteNumber(entry, NaN)).filter(entry => Number.isFinite(entry));
  return parsed.length ? parsed : null;
}

export function getExperienceCheckpoints(player, config) {
  const fromConfig = normalizeThresholds(config?.expThresholdsToNext ?? config?.experienceCheckpoints ?? null);
  if (fromConfig) return fromConfig;

  const fromPlayer = player?.ExperienceCheckpoints ?? player?.ExperienceLevelCheckpoints ?? null;
  if (Array.isArray(fromPlayer) && fromPlayer.length) {
    const parsed = fromPlayer.map(value => toFiniteNumber(value, NaN)).filter(value => Number.isFinite(value));
    if (parsed.length) return parsed;
  }
  return DEFAULT_EXPERIENCE_CHECKPOINTS.slice();
}

export function getMentalStatusForLevel(config, level) {
  const resolvedLevel = Math.max(0, Math.floor(toFiniteNumber(level, 0)));
  const stages = Array.isArray(config?.mentalStages) ? config.mentalStages : [];

  const stage = stages.find(entry => Array.isArray(entry?.levels) && entry.levels.includes(resolvedLevel)) || null;
  const type = stage?.type ? String(stage.type) : '';
  const display = type ? `${type} : Lvl. ${resolvedLevel}` : `Lvl. ${resolvedLevel}`;

  const stageLevels = Array.isArray(stage?.levels) ? stage.levels : [];
  const idxInStage = stageLevels.indexOf(resolvedLevel);

  const byLevel = Array.isArray(stage?.descriptionByLevelInStage) ? stage.descriptionByLevelInStage : [];
  const descriptionCandidate =
    byLevel.length && idxInStage >= 0
      ? byLevel[Math.min(idxInStage, byLevel.length - 1)]
      : stage?.description ?? null;

  const description = descriptionCandidate ? String(descriptionCandidate) : null;
  const media = stage?.media ? String(stage.media) : null;

  return { type: type || null, level: resolvedLevel, display, description, media };
}

function getMaxLevel(checkpoints, config) {
  const configMaxLevel = toFiniteNumber(config?.maxLevel, NaN);
  if (Number.isFinite(configMaxLevel)) {
    return Math.max(0, Math.min(Math.trunc(configMaxLevel), Array.isArray(checkpoints) ? checkpoints.length : 0));
  }
  return Math.max(0, Array.isArray(checkpoints) ? checkpoints.length - 1 : 0);
}

function applyAutoGains(stats, levelsGained, config) {
  const gains = config?.autoGainsPerLevel ?? null;
  if (!gains || levelsGained <= 0) return null;

  const maxHealthGain = clampInt(gains?.maxHealth ?? gains?.MaxHealth ?? 0, 0);
  const maxEnergyGain = clampInt(gains?.maxEnergy ?? gains?.MaxEnergy ?? 0, 0);

  const currentMaxHealth = clampInt(stats?.MaxHealth ?? stats?.Health ?? 0, 0);
  const currentMaxEnergy = clampInt(stats?.MaxEnergy ?? stats?.Energy ?? 0, 0);

  if (maxHealthGain) stats.MaxHealth = currentMaxHealth + maxHealthGain * levelsGained;
  if (maxEnergyGain) stats.MaxEnergy = currentMaxEnergy + maxEnergyGain * levelsGained;

  if (stats.Health !== undefined && stats.MaxHealth !== undefined) {
    stats.Health = Math.min(clampInt(stats.Health, 0), clampInt(stats.MaxHealth, 0));
  }
  if (stats.Energy !== undefined && stats.MaxEnergy !== undefined) {
    stats.Energy = Math.min(clampInt(stats.Energy, 0), clampInt(stats.MaxEnergy, 0));
  }

  return { maxHealthGain: maxHealthGain * levelsGained, maxEnergyGain: maxEnergyGain * levelsGained };
}

export function applyLevelProgression(player, config) {
  const checkpoints = getExperienceCheckpoints(player, config);
  if (!player) return { fromLevel: 0, toLevel: 0, levelsGained: 0, levelUps: [], maxLevel: 0, nextCheckpoint: null };

  if (!player.Stats) player.Stats = {};
  const stats = player.Stats;

  const fromLevel = Math.max(0, Math.floor(toFiniteNumber(stats.Level, 0)));
  const fromExperience = toFiniteNumber(stats.Experience, 0);

  let level = fromLevel;
  let experience = fromExperience;

  const maxLevel = getMaxLevel(checkpoints, config);
  const levelUps = [];

  while (level < maxLevel) {
    const needed = toFiniteNumber(checkpoints[level], NaN);
    if (!Number.isFinite(needed) || needed <= 0) break;
    if (experience < needed) break;

    experience -= needed;
    levelUps.push({ fromLevel: level, toLevel: level + 1, checkpoint: needed });
    level += 1;
  }

  stats.Level = level;
  stats.Experience = experience;

  const autoGainsApplied = applyAutoGains(stats, levelUps.length, config);
  const nextCheckpoint = level < maxLevel ? toFiniteNumber(checkpoints[level], NaN) : null;

  return {
    fromLevel,
    toLevel: level,
    levelsGained: levelUps.length,
    levelUps,
    maxLevel,
    nextCheckpoint,
    autoGainsApplied
  };
}

export function addExperience(player, amount, config) {
  if (!player) return applyLevelProgression(player, config);
  if (!player.Stats) player.Stats = {};

  const stats = player.Stats;
  stats.Experience = toFiniteNumber(stats.Experience, 0) + toFiniteNumber(amount, 0);
  return applyLevelProgression(player, config);
}
