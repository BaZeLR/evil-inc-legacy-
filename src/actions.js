import { resolveConditionalValue } from './events/conditional.js';

export const normalizeActionName = value => String(value ?? '').trim().toLowerCase();

export function formatMenuDescription(value, ctx, fallback = '') {
  const resolved = resolveConditionalValue(value, ctx, fallback);
  if (Array.isArray(resolved)) {
    const parts = resolved.map(part => String(part ?? '').trim()).filter(Boolean);
    return parts.length ? parts.join('<br>') : null;
  }
  const text = String(resolved ?? '').trim();
  return text || null;
}

function normalizeCustomChoice(choice) {
  if (choice === undefined || choice === null) return null;
  if (typeof choice === 'string' || typeof choice === 'number') {
    const label = String(choice).trim();
    return label ? { label, value: label } : null;
  }
  if (typeof choice !== 'object') return null;

  const label =
    String(choice?.Label ?? choice?.label ?? choice?.Text ?? choice?.text ?? choice?.Name ?? choice?.name ?? choice?.Value ?? choice?.value ?? '')
      .trim();
  if (!label) return null;
  const value = String(choice?.Value ?? choice?.value ?? label).trim() || label;
  const showIf = choice?.ShowIf ?? choice?.showIf ?? choice?.CondStr ?? choice?.condStr ?? null;
  const hideIf = choice?.HideIf ?? choice?.hideIf ?? null;
  const bActive = choice?.bActive ?? choice?.active ?? undefined;
  const disabled = choice?.Disabled ?? choice?.disabled ?? undefined;
  return {
    label,
    value,
    ShowIf: showIf ?? undefined,
    HideIf: hideIf ?? undefined,
    bActive: bActive ?? undefined,
    Disabled: disabled ?? undefined
  };
}

function normalizeCustomChoiceList(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const choices = [];
  for (const entry of raw) {
    const normalized = normalizeCustomChoice(entry);
    if (!normalized) continue;
    const key = `${normalizeActionName(normalized.value)}|${normalizeActionName(normalized.label)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push(normalized);
  }
  return choices;
}

export function getCustomChoiceActions(entity) {
  const actions = Array.isArray(entity?.Actions) ? entity.Actions : [];
  const map = new Map();

  for (const action of actions) {
    if (action?.bActive === false) continue;
    const name = String(action?.name ?? action?.Name ?? action?.overridename ?? '').trim();
    if (!name || name.startsWith('<<')) continue;
    const rawChoices = action?.CustomChoices ?? action?.customChoices ?? null;
    const choices = normalizeCustomChoiceList(rawChoices);
    if (!choices.length) continue;

    const key = normalizeActionName(name);
    const title = String(action?.CustomChoiceTitle ?? action?.customChoiceTitle ?? '').trim();
    const tooltip = String(action?.Tooltip ?? action?.tooltip ?? '').trim();

    if (!map.has(key)) {
      map.set(key, {
        name,
        title: title || null,
        tooltip: tooltip || null,
        choices: []
      });
    }

    const entry = map.get(key);
    if (!entry) continue;
    if (!entry.title && title) entry.title = title;
    if (!entry.tooltip && tooltip) entry.tooltip = tooltip;
    for (const choice of choices) {
      const exists = entry.choices.some(existing => existing.value === choice.value && existing.label === choice.label);
      if (!exists) entry.choices.push(choice);
    }
  }

  return map;
}
