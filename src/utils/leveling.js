const DEFAULT_EXPERIENCE_CHECKPOINTS = [
  100, 100, 140, 196, 275, 385, 538, 753, 1055, 1500, 1500, 1500, 1500, 1500, 1500, 1500, 2500, 2500, 2500, 2500,
  2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 2500, 5000, 999999
];

const DEFAULT_STAT_CHECKPOINT = 2;

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

function resolveStatLevelingConfig(config) {
  const raw = config?.statLeveling ?? config?.statProgression ?? null;
  if (!raw || typeof raw !== 'object') return null;

  const enabled = raw.enabled === undefined ? true : Boolean(raw.enabled);
  if (!enabled) return null;

  const threshold = toFiniteNumber(raw.thresholdToNext ?? raw.threshold ?? NaN, NaN);
  const thresholdsToNext =
    normalizeThresholds(raw.thresholdsToNext ?? raw.thresholds ?? raw.checkpoints ?? raw.pointsToNext ?? null) ||
    (Number.isFinite(threshold) ? [threshold] : null);

  return { raw, thresholdsToNext };
}

function getStatCheckpoints(config, maxLevel) {
  const resolved = resolveStatLevelingConfig(config);
  if (!resolved) return null;

  const thresholds = resolved.thresholdsToNext;
  if (Array.isArray(thresholds) && thresholds.length) {
    if (!maxLevel || thresholds.length >= maxLevel) return thresholds.slice();
    const last = toFiniteNumber(thresholds[thresholds.length - 1], DEFAULT_STAT_CHECKPOINT);
    const expanded = thresholds.slice();
    while (expanded.length < maxLevel) expanded.push(last);
    return expanded;
  }

  if (!maxLevel) return null;
  return Array(maxLevel).fill(DEFAULT_STAT_CHECKPOINT);
}

function clampNonNegativeInt(value, fallback = 0) {
  const num = clampInt(value, fallback);
  return Math.max(0, num);
}

function getStatPointsPerLevel(config) {
  const direct = toFiniteNumber(config?.statPointsPerLevel ?? config?.pointsPerLevel ?? NaN, NaN);
  if (Number.isFinite(direct)) return clampNonNegativeInt(direct, 0);

  const nested = toFiniteNumber(
    config?.statLeveling?.pointsPerLevel ?? config?.statLeveling?.statPointsPerLevel ?? config?.statLeveling?.pointsAwardedPerLevel ?? NaN,
    NaN
  );
  if (Number.isFinite(nested)) return clampNonNegativeInt(nested, 0);

  return 0;
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

function getCoreStat(stats, keys, fallback = 0) {
  const source = stats && typeof stats === 'object' ? stats : {};
  for (const key of keys) {
    if (!key) continue;
    const raw = source[key];
    if (raw === undefined || raw === null || raw === '') continue;
    return clampInt(raw, fallback);
  }
  return fallback;
}

function getObjectCoreBonus(obj) {
  const root = obj?.Bonuses ?? obj?.bonuses ?? obj?.StatsBonus ?? obj?.statsBonus ?? null;
  const power = clampInt(root?.Power ?? root?.MS ?? root?.Str ?? obj?.MSBonus ?? 0, 0);
  const focus = clampInt(root?.Focus ?? root?.MentalStrength ?? obj?.MentalStrengthBonus ?? obj?.FocusBonus ?? 0, 0);
  const stealth = clampInt(root?.Stealth ?? root?.Agility ?? root?.Agl ?? obj?.AgilityBonus ?? obj?.StealthBonus ?? 0, 0);
  return { power, focus, stealth };
}

function getEquippedCoreBonuses(player, context) {
  const objectMap = context?.objectMap && typeof context.objectMap === 'object' ? context.objectMap : null;
  if (!objectMap) return { power: 0, focus: 0, stealth: 0 };

  const equippedIds = Array.isArray(player?.Equipped) ? player.Equipped : [];
  if (!equippedIds.length) return { power: 0, focus: 0, stealth: 0 };

  const totals = { power: 0, focus: 0, stealth: 0 };
  for (const rawId of equippedIds) {
    const id = String(rawId ?? '').trim();
    if (!id) continue;
    const obj = objectMap?.[id] ?? null;
    if (!obj) continue;
    const bonus = getObjectCoreBonus(obj);
    totals.power += bonus.power;
    totals.focus += bonus.focus;
    totals.stealth += bonus.stealth;
  }
  return totals;
}

function applyStatLevelProgression(player, config, context, maxLevel, fromLevel) {
  const statConfig = resolveStatLevelingConfig(config);
  if (!statConfig) {
    return { levelsGained: 0, levelUps: [], nextCheckpoint: null, statGained: 0 };
  }

  if (!player.Stats) player.Stats = {};
  const stats = player.Stats;

  const basePower = clampNonNegativeInt(getCoreStat(stats, ['MS', 'Power', 'Str', 'Attack', 'Dmg'], 0), 0);
  const baseFocus = clampNonNegativeInt(getCoreStat(stats, ['MentalStrength', 'Focus', 'Mind'], 0), 0);
  const baseStealth = clampNonNegativeInt(getCoreStat(stats, ['Agility', 'Stealth', 'Agl'], 0), 0);

  const baseScore = basePower + baseFocus + baseStealth;
  const equippedCore = getEquippedCoreBonuses(player, context);
  const equipScore = clampNonNegativeInt(equippedCore.power, 0) + clampNonNegativeInt(equippedCore.focus, 0) + clampNonNegativeInt(equippedCore.stealth, 0);

  const peakBase = toFiniteNumber(stats.CoreStatPeakBase, NaN);
  const peakEquip = toFiniteNumber(stats.CoreStatPeakEquip, NaN);

  const resolvedPeakBase = Number.isFinite(peakBase) ? peakBase : 0;
  const resolvedPeakEquip = Number.isFinite(peakEquip) ? peakEquip : 0;

  const gainedBase = baseScore > resolvedPeakBase ? baseScore - resolvedPeakBase : 0;
  const gainedEquip = equipScore > resolvedPeakEquip ? equipScore - resolvedPeakEquip : 0;

  if (gainedBase) stats.CoreStatPeakBase = baseScore;
  if (gainedEquip) stats.CoreStatPeakEquip = equipScore;

  const statGained = gainedBase + gainedEquip;
  if (!statGained) {
    const checkpoints = getStatCheckpoints(config, maxLevel);
    const nextCheckpoint = checkpoints && fromLevel < maxLevel ? toFiniteNumber(checkpoints[fromLevel], NaN) : null;
    return { levelsGained: 0, levelUps: [], nextCheckpoint, statGained: 0 };
  }

  const currentProgress = toFiniteNumber(stats.CoreStatXP, 0);
  let statXp = currentProgress + statGained;

  const checkpoints = getStatCheckpoints(config, maxLevel);
  const levelUps = [];
  let level = fromLevel;

  while (level < maxLevel) {
    const neededRaw = checkpoints ? checkpoints[level] : DEFAULT_STAT_CHECKPOINT;
    const needed = toFiniteNumber(neededRaw, DEFAULT_STAT_CHECKPOINT);
    if (!Number.isFinite(needed) || needed <= 0) break;
    if (statXp < needed) break;
    statXp -= needed;
    levelUps.push({ fromLevel: level, toLevel: level + 1, checkpoint: needed, source: 'stats' });
    level += 1;
  }

  stats.CoreStatXP = statXp;
  stats.Level = level;

  const nextCheckpoint = checkpoints && level < maxLevel ? toFiniteNumber(checkpoints[level], NaN) : null;
  return { levelsGained: levelUps.length, levelUps, nextCheckpoint, statGained };
}

export function applyLevelProgression(player, config, context = null) {
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

  const expLevelsGained = levelUps.length;

  const statProgression = applyStatLevelProgression(player, config, context, maxLevel, level);
  const combinedLevelUps = [
    ...levelUps.map(entry => ({ ...entry, source: 'exp' })),
    ...(statProgression.levelUps || [])
  ];

  const totalLevelsGained = expLevelsGained + (statProgression.levelsGained || 0);
  const autoGainsApplied = applyAutoGains(stats, totalLevelsGained, config);

  const statPointsPerLevel = getStatPointsPerLevel(config);
  if (statPointsPerLevel && totalLevelsGained) {
    const existing = clampNonNegativeInt(stats.UnspentStatPoints ?? stats.unspentStatPoints ?? 0, 0);
    stats.UnspentStatPoints = existing + statPointsPerLevel * totalLevelsGained;
  }

  const nextCheckpoint = stats.Level < maxLevel ? toFiniteNumber(checkpoints[stats.Level], NaN) : null;

  return {
    fromLevel,
    toLevel: stats.Level,
    levelsGained: totalLevelsGained,
    levelUps: combinedLevelUps,
    maxLevel,
    nextCheckpoint,
    autoGainsApplied,
    statProgression: statProgression.levelsGained ? statProgression : undefined
  };
}

export function addExperience(player, amount, config, context = null) {
  if (!player) return applyLevelProgression(player, config, context);
  if (!player.Stats) player.Stats = {};

  const stats = player.Stats;
  stats.Experience = toFiniteNumber(stats.Experience, 0) + toFiniteNumber(amount, 0);
  return applyLevelProgression(player, config, context);
}
