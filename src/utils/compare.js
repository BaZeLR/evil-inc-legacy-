function isNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^-?\d+(\.\d+)?$/.test(trimmed);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value.trim());
  return Number(value);
}

function normalizeString(value, { trimStrings, caseInsensitive }) {
  let text = String(value ?? '');
  if (trimStrings) text = text.trim();
  if (caseInsensitive) text = text.toLowerCase();
  return text;
}

export function threeWayCompare(left, right, options = {}) {
  const { coerceNumbers = true, caseInsensitive = true, trimStrings = true } = options;

  const numeric =
    coerceNumbers &&
    ((typeof left === 'number' && typeof right === 'number') || (isNumberLike(left) && isNumberLike(right)));

  if (numeric) {
    const a = toNumber(left);
    const b = toNumber(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }

  const a = normalizeString(left, { trimStrings, caseInsensitive });
  const b = normalizeString(right, { trimStrings, caseInsensitive });
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function compareSummary(left, right, options = {}) {
  const result = threeWayCompare(left, right, options);
  return {
    result,
    equal: result === 0,
    notEqual: result !== 0,
    lessThan: result < 0,
    lessThanOrEqual: result <= 0,
    greaterThan: result > 0,
    greaterThanOrEqual: result >= 0
  };
}

function normalizeOperator(operator) {
  const raw = String(operator ?? '').trim();
  const lower = raw.toLowerCase();

  const map = {
    'equals': 'eq',
    'equal': 'eq',
    'eq': 'eq',
    '==': 'eq',

    'not equals': 'ne',
    'not equal': 'ne',
    'ne': 'ne',
    '!=': 'ne',

    'greater than': 'gt',
    'gt': 'gt',
    '>': 'gt',

    'greater than or equals': 'gte',
    'greater than or equal': 'gte',
    'gte': 'gte',
    '>=': 'gte',

    'less than': 'lt',
    'lt': 'lt',
    '<': 'lt',

    'less than or equals': 'lte',
    'less than or equal': 'lte',
    'lte': 'lte',
    '<=': 'lte',

    'contains': 'contains',
    'include': 'contains',
    'includes': 'contains',

    'not contains': 'notContains',
    'does not contain': 'notContains',
    'exclude': 'notContains',
    'excludes': 'notContains'
  };

  return map[lower] || lower || raw;
}

export function compareOp(left, operator, right, options = {}) {
  const op = normalizeOperator(operator);
  const { coerceNumbers = true, caseInsensitive = true, trimStrings = true } = options;

  if (op === 'contains' || op === 'notContains') {
    let contains = false;
    if (Array.isArray(left)) {
      contains = left.some(item => compareOp(item, 'eq', right, options));
    } else {
      const a = normalizeString(left, { trimStrings, caseInsensitive });
      const b = normalizeString(right, { trimStrings, caseInsensitive });
      contains = a.includes(b);
    }
    return op === 'contains' ? contains : !contains;
  }

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte') {
    const numeric =
      coerceNumbers &&
      ((typeof left === 'number' && typeof right === 'number') || (isNumberLike(left) && isNumberLike(right)));
    if (!numeric) return false;

    const a = toNumber(left);
    const b = toNumber(right);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;

    if (op === 'gt') return a > b;
    if (op === 'gte') return a >= b;
    if (op === 'lt') return a < b;
    if (op === 'lte') return a <= b;
  }

  if (op === 'eq' || op === 'ne') {
    const numeric =
      coerceNumbers &&
      ((typeof left === 'number' && typeof right === 'number') || (isNumberLike(left) && isNumberLike(right)));

    const equal = numeric
      ? toNumber(left) === toNumber(right)
      : normalizeString(left, { trimStrings, caseInsensitive }) === normalizeString(right, { trimStrings, caseInsensitive });

    return op === 'eq' ? equal : !equal;
  }

  return false;
}

