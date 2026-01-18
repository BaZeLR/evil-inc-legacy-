function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

export function clampPercent(value) {
  return clampNumber(value, 0, 100);
}

export function cryptoRng() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0] / 0x1_0000_0000;
  }
  return Math.random();
}

export function randomIntInclusive(min, max, rng = cryptoRng) {
  const low = Math.ceil(Number(min));
  const high = Math.floor(Number(max));
  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    throw new Error(`randomIntInclusive: min/max must be numbers (got ${String(min)}..${String(max)})`);
  }
  if (high < low) {
    throw new Error(`randomIntInclusive: max must be >= min (got ${low}..${high})`);
  }
  return Math.floor(rng() * (high - low + 1)) + low;
}

// Percentile dice roll (1..100). Use with chancePercent() for a 0..100% check.
export function rollD100(rng = cryptoRng) {
  return randomIntInclusive(1, 100, rng);
}

// 0..100 (inclusive) raw roll, useful for UI/telemetry.
export function roll0to100(rng = cryptoRng) {
  return randomIntInclusive(0, 100, rng);
}

// Returns true with `percent` chance (0..100).
export function chancePercent(percent, rng = cryptoRng) {
  const target = clampPercent(percent);
  if (target <= 0) return false;
  if (target >= 100) return true;
  return rollD100(rng) <= target;
}

// Dice-style check result with a visible roll (1..100).
export function rollCheck(percent, rng = cryptoRng) {
  const target = clampPercent(percent);
  const roll = rollD100(rng);
  return { roll, target, success: roll <= target };
}

// Deterministic RNG helper (useful for debugging/replays).
export function createSeededRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

