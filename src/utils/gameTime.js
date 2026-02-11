const MINUTES_PER_DAY = 24 * 60;
const MOVE_MINUTES = 30; // 2 moves == 1 hour

export const DEFAULT_START_MINUTES = 12 * 60; // noon
export const DEFAULT_START_DAY = 1;

function toSafeInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function clampDay(value) {
  return Math.max(1, toSafeInt(value, DEFAULT_START_DAY));
}

function normalizeMinutes(value) {
  const raw = toSafeInt(value, DEFAULT_START_MINUTES);
  const mod = raw % MINUTES_PER_DAY;
  return mod < 0 ? mod + MINUTES_PER_DAY : mod;
}

export function getGameClockFromStats(stats) {
  const source = stats && typeof stats === 'object' ? stats : {};
  const minutes = normalizeMinutes(source.GameTimeMinutes ?? source.TimeMinutes ?? source.minutes);
  const day = clampDay(source.DaysInGame ?? source.Day ?? source.Days);
  return { day, minutes };
}

export function ensureGameClock(player) {
  if (!player) return { day: DEFAULT_START_DAY, minutes: DEFAULT_START_MINUTES };
  if (!player.Stats || typeof player.Stats !== 'object') player.Stats = {};

  const stats = player.Stats;
  const clock = getGameClockFromStats(stats);
  stats.GameTimeMinutes = clock.minutes;
  stats.DaysInGame = clock.day;
  return clock;
}

export function advanceGameClockByMoves(player, moveCount = 1) {
  if (!player) return { day: DEFAULT_START_DAY, minutes: DEFAULT_START_MINUTES, daysGained: 0 };
  if (!player.Stats || typeof player.Stats !== 'object') player.Stats = {};

  const stats = player.Stats;
  const clock = getGameClockFromStats(stats);

  const moves = Math.max(0, toSafeInt(moveCount, 0));
  const deltaMinutes = moves * MOVE_MINUTES;

  const total = clock.minutes + deltaMinutes;
  const daysGained = Math.floor(total / MINUTES_PER_DAY);
  const minutes = total % MINUTES_PER_DAY;
  const day = clampDay(clock.day + daysGained);

  stats.GameTimeMinutes = minutes;
  stats.DaysInGame = day;

  return { day, minutes, daysGained };
}

export function advanceGameClockByMinutes(player, minutesToAdd = 0) {
  if (!player) return { day: DEFAULT_START_DAY, minutes: DEFAULT_START_MINUTES, daysGained: 0 };
  if (!player.Stats || typeof player.Stats !== 'object') player.Stats = {};

  const stats = player.Stats;
  const clock = getGameClockFromStats(stats);

  const deltaMinutes = toSafeInt(minutesToAdd, 0);
  const total = clock.minutes + deltaMinutes;
  const daysGained = Math.floor(total / MINUTES_PER_DAY);
  const minutes = total % MINUTES_PER_DAY;
  const day = clampDay(clock.day + daysGained);

  stats.GameTimeMinutes = minutes < 0 ? minutes + MINUTES_PER_DAY : minutes;
  stats.DaysInGame = day;

  return { day, minutes: stats.GameTimeMinutes, daysGained };
}

export function formatGameClock(minutesValue) {
  const minutes = normalizeMinutes(minutesValue);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function getDayPartFromMinutes(minutesValue) {
  const minutes = normalizeMinutes(minutesValue);

  if (minutes < 60) return 'Midnight';
  if (minutes < 5 * 60) return 'Night';
  if (minutes < 7 * 60) return 'Dawn';
  if (minutes < 12 * 60) return 'Morning';
  if (minutes < 13 * 60) return 'Noon';
  if (minutes < 18 * 60) return 'Afternoon';
  if (minutes < 20 * 60) return 'Dusk';
  return 'Evening';
}

