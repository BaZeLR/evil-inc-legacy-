import { applyKatieLegacyPatch } from '../content/legacy/katieLegacy.js';

export function applyLegacyContent(game) {
  const results = [];

  try {
    results.push({ id: 'katie', ...applyKatieLegacyPatch(game) });
  } catch (error) {
    results.push({ id: 'katie', applied: false, reason: error?.message || 'unknown error' });
  }

  return results;
}
