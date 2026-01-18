import { advanceGameClockByMoves, getGameClockFromStats } from './gameTime.js';

function toSafeInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

export function applyFlatEnergyCost(player, costValue = 0) {
  if (!player) return { ok: false, cost: 0, energy: null };
  if (!player.Stats || typeof player.Stats !== 'object') player.Stats = {};

  const stats = player.Stats;
  if (stats.Energy === undefined || stats.Energy === null || stats.Energy === '') {
    return { ok: false, cost: 0, energy: null };
  }

  const cost = Math.max(0, toSafeInt(costValue, 0));
  const current = Math.max(0, toSafeInt(stats.Energy, 0));
  const energy = Math.max(0, current - cost);
  stats.Energy = energy;
  return { ok: true, cost, energy };
}

export function applyMoveActionCosts(player) {
  if (!player) return { clock: { day: 1, minutes: 12 * 60 }, energy: null };
  advanceGameClockByMoves(player, 1);
  applyFlatEnergyCost(player, 1);
  return { clock: getGameClockFromStats(player.Stats), energy: player?.Stats?.Energy ?? null };
}

export function applyCombatActionCosts(player, action) {
  if (!player) return { clock: { day: 1, minutes: 12 * 60 }, energy: null };
  const actionKind = String(action?.kind ?? 'weapon').trim().toLowerCase();

  advanceGameClockByMoves(player, 2);
  if (actionKind !== 'ability') applyFlatEnergyCost(player, 1);

  return { clock: getGameClockFromStats(player.Stats), energy: player?.Stats?.Energy ?? null };
}

