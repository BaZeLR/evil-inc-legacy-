import { evaluateCondStr } from './condStr.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolveAbilityNames(player) {
  const abilities = asArray(player?.Abilities);
  return new Set(abilities.map(a => String(a?.Name ?? a?.name ?? '').trim()).filter(Boolean));
}

function resolveStatValue(player, key) {
  const name = String(key ?? '').trim();
  if (!name) return undefined;
  if (name === 'Credits') return player?.Credits;
  return player?.Stats?.[name];
}

function checkStatRequirements(player, requirements) {
  const req = requirements && typeof requirements === 'object' ? requirements : null;
  if (!req) return true;

  for (const [key, rawExpected] of Object.entries(req)) {
    const actual = resolveStatValue(player, key);
    const expected = rawExpected;

    if (typeof expected === 'number') {
      if (!(Number(actual) >= expected)) return false;
      continue;
    }

    if (typeof expected === 'boolean') {
      if (Boolean(actual) !== expected) return false;
      continue;
    }

    if (String(actual ?? '').toLowerCase() !== String(expected ?? '').toLowerCase()) return false;
  }

  return true;
}

function normalizeConditionObject(condition) {
  if (!isRecord(condition)) return null;
  return condition;
}

function extractConditionRef(condition) {
  if (!isRecord(condition)) return null;
  return (
    condition.If ??
    condition.When ??
    condition.CondStr ??
    condition.condStr ??
    condition.ShowIf ??
    condition.showIf ??
    null
  );
}

function evaluateCheckObject(condition, ctx) {
  const engine = ctx?.game?.eventEngine ?? null;
  const condType = String(condition?.Condition ?? condition?.CondType ?? condition?.condType ?? '').trim();
  if (!condType || !engine?.evaluateCheck) return false;

  const step2 = condition?.Variable ?? condition?.Step2 ?? condition?.step2 ?? condition?.Var ?? condition?.var ?? '';
  const step3 = condition?.Operator ?? condition?.Step3 ?? condition?.step3 ?? condition?.Op ?? condition?.op ?? '';
  const step4 = condition?.Value ?? condition?.Step4 ?? condition?.step4 ?? condition?.Val ?? condition?.val;

  const check = { CondType: condType, Step2: step2, Step3: step3, Step4: step4 };
  const result = { errors: [], texts: [] };
  return Boolean(engine.evaluateCheck(check, ctx, result));
}

export function evaluateCondition(condition, ctx) {
  if (condition === undefined || condition === null || condition === '') return true;
  if (typeof condition === 'boolean') return condition;
  if (typeof condition === 'string') return evaluateCondStr(condition, ctx);
  if (Array.isArray(condition)) return condition.every(entry => evaluateCondition(entry, ctx));

  const normalized = normalizeConditionObject(condition);
  if (!normalized) return Boolean(condition);

  const condRef = extractConditionRef(normalized);
  if (typeof condRef === 'string' && condRef.trim()) return evaluateCondStr(condRef, ctx);

  if (normalized.StatCheck) {
    if (!checkStatRequirements(ctx?.game?.player ?? ctx?.player, normalized.StatCheck)) return false;
  }

  if (normalized.AbilityCheck) {
    const abilities = resolveAbilityNames(ctx?.game?.player ?? ctx?.player);
    const needed = String(normalized.AbilityCheck ?? '').trim();
    if (needed && !abilities.has(needed)) return false;
  }

  if (normalized.Condition || normalized.CondType || normalized.condType) {
    return evaluateCheckObject(normalized, ctx);
  }

  return Boolean(condition);
}

function extractConditionalValue(entry, { preferElse = false } = {}) {
  if (!isRecord(entry)) return undefined;

  if (preferElse) {
    if (Object.prototype.hasOwnProperty.call(entry, 'Else')) return entry.Else;
    if (Object.prototype.hasOwnProperty.call(entry, 'Default')) return entry.Default;
    if (Object.prototype.hasOwnProperty.call(entry, 'False')) return entry.False;
  }

  if (Object.prototype.hasOwnProperty.call(entry, 'Then')) return entry.Then;
  if (Object.prototype.hasOwnProperty.call(entry, 'Value')) return entry.Value;
  if (Object.prototype.hasOwnProperty.call(entry, 'Result')) return entry.Result;
  if (Object.prototype.hasOwnProperty.call(entry, 'True')) return entry.True;
  return undefined;
}

export function resolveConditionalValue(value, ctx, fallback) {
  if (Array.isArray(value)) {
    let elseValue = undefined;

    for (const entry of value) {
      if (!isRecord(entry)) {
        if (entry !== undefined) return entry;
        continue;
      }

      const hasElse =
        Object.prototype.hasOwnProperty.call(entry, 'Else') ||
        Object.prototype.hasOwnProperty.call(entry, 'Default') ||
        Object.prototype.hasOwnProperty.call(entry, 'False');

      if (hasElse) {
        elseValue = extractConditionalValue(entry, { preferElse: true });
        continue;
      }

      const condition = extractConditionRef(entry) ?? entry.Condition ?? entry.CondType ?? entry.condType ?? null;
      if (condition === null || condition === undefined) {
        const directValue = extractConditionalValue(entry);
        if (directValue !== undefined) return resolveConditionalValue(directValue, ctx, fallback);
        continue;
      }

      if (evaluateCondition(condition, ctx)) {
        const chosen = extractConditionalValue(entry);
        return resolveConditionalValue(chosen, ctx, fallback);
      }
    }

    if (elseValue !== undefined) return resolveConditionalValue(elseValue, ctx, fallback);
    return fallback !== undefined ? fallback : undefined;
  }

  if (isRecord(value)) {
    const condition = extractConditionRef(value) ?? value.Condition ?? value.CondType ?? value.condType ?? null;
    const hasConditionalValue =
      Object.prototype.hasOwnProperty.call(value, 'Then') ||
      Object.prototype.hasOwnProperty.call(value, 'Else') ||
      Object.prototype.hasOwnProperty.call(value, 'Value') ||
      Object.prototype.hasOwnProperty.call(value, 'Default') ||
      Object.prototype.hasOwnProperty.call(value, 'True') ||
      Object.prototype.hasOwnProperty.call(value, 'False') ||
      Object.prototype.hasOwnProperty.call(value, 'Result');

    if (condition !== null || hasConditionalValue) {
      const pass = condition === null || condition === undefined ? true : evaluateCondition(condition, ctx);
      const chosen = pass
        ? extractConditionalValue(value)
        : extractConditionalValue(value, { preferElse: true });
      if (chosen === undefined) return fallback !== undefined ? fallback : undefined;
      return resolveConditionalValue(chosen, ctx, fallback);
    }
  }

  if (value !== undefined) return value;
  return fallback;
}
