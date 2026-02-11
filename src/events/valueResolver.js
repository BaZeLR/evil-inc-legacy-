function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeLookupKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeAliasKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolveAliasValue(raw, context) {
  const key = normalizeAliasKey(raw);
  if (key === 'skip intro') {
    const flag = Boolean(context?.game?.player?.Stats?.prologue_intro_skipped);
    return flag ? 1 : 0;
  }
  return undefined;
}

function setAliasValue(raw, value, context) {
  const key = normalizeAliasKey(raw);
  if (key === 'skip intro') {
    const coerced = coerceLiteral(value);
    const flag = coerced === true || coerced === 1;
    if (!context?.game?.player) return false;
    if (!context.game.player.Stats || typeof context.game.player.Stats !== 'object') {
      context.game.player.Stats = {};
    }
    context.game.player.Stats.prologue_intro_skipped = flag;
    return true;
  }
  return false;
}

function getCustomPropertiesArray(entity) {
  if (!entity) return null;
  if (Array.isArray(entity.CustomProperties)) return entity.CustomProperties;
  if (Array.isArray(entity.customProperties)) return entity.customProperties;
  return null;
}

function getCustomPropertyKey(entry) {
  if (!entry) return null;
  return entry.Name ?? entry.Property ?? entry.key ?? entry.name ?? null;
}

function getCustomPropertyValue(entry) {
  if (!entry) return undefined;
  if ('Value' in entry) return entry.Value;
  if ('value' in entry) return entry.value;
  return undefined;
}

function setCustomPropertyValue(entry, value) {
  if (!isRecord(entry)) return;
  if ('Value' in entry || !('value' in entry)) entry.Value = value;
  else entry.value = value;
}

export function getCustomProperty(entity, propertyName) {
  const arr = getCustomPropertiesArray(entity);
  if (!arr) return undefined;

  const key = String(propertyName ?? '').trim();
  if (!key) return undefined;

  const entry = arr.find(item => String(getCustomPropertyKey(item) ?? '').trim() === key);
  return entry ? getCustomPropertyValue(entry) : undefined;
}

export function setCustomProperty(entity, propertyName, value) {
  if (!entity) return false;

  const key = String(propertyName ?? '').trim();
  if (!key) return false;

  const arr = getCustomPropertiesArray(entity);
  if (!arr) {
    entity.CustomProperties = [];
  }

  const list = getCustomPropertiesArray(entity);
  const existing = list.find(item => String(getCustomPropertyKey(item) ?? '').trim() === key) || null;
  if (existing) {
    setCustomPropertyValue(existing, value);
    return true;
  }

  list.push({ Property: key, Value: value });
  return true;
}

export function coerceLiteral(value) {
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return '';

  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === 'true';
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return value;
}

export function applyOperation(currentValue, operation, rawValue) {
  const op = String(operation ?? '').trim().toLowerCase();
  const value = coerceLiteral(rawValue);

  if (!op || op === 'equals' || op === 'set') return value;
  if (op === 'toggle') return !Boolean(currentValue);

  const currentNum = Number(currentValue ?? 0);
  const nextNum = Number(value ?? 0);

  if (op === 'add' || op === 'plus') return currentNum + nextNum;
  if (op === 'subtract' || op === 'minus') return currentNum - nextNum;
  if (op === 'multiply' || op === 'times') return currentNum * nextNum;
  if (op === 'divide') return nextNum === 0 ? currentNum : currentNum / nextNum;

  if (op === 'append') return String(currentValue ?? '') + String(value ?? '');

  return value;
}

function getPathSegments(path) {
  return String(path ?? '')
    .split('.')
    .map(seg => seg.trim())
    .filter(Boolean);
}

function getByPath(root, path) {
  if (!root) return undefined;
  const segments = Array.isArray(path) ? path : getPathSegments(path);
  if (!segments.length) return root;

  let current = root;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (!current) return undefined;

    if (segment === 'CustomProperties') {
      const propertyKey = segments[i + 1];
      if (!propertyKey) return undefined;
      return getCustomProperty(current, propertyKey);
    }

    current = current?.[segment];
  }
  return current;
}

function ensureContainer(parent, key) {
  if (!isRecord(parent)) return false;
  if (isRecord(parent[key])) return true;
  parent[key] = {};
  return true;
}

function setByPath(root, path, value) {
  if (!root) return false;
  const segments = Array.isArray(path) ? path : getPathSegments(path);
  if (!segments.length) return false;

  if (segments[0] === 'CustomProperties') {
    const propertyKey = segments[1];
    if (!propertyKey) return false;
    return setCustomProperty(root, propertyKey, value);
  }

  let current = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (segment === 'CustomProperties') {
      const propertyKey = segments[i + 1];
      if (!propertyKey) return false;
      return setCustomProperty(current, propertyKey, value);
    }
    if (!ensureContainer(current, segment)) return false;
    current = current[segment];
  }

  current[segments[segments.length - 1]] = value;
  return true;
}

export function interpolateText(text, context) {
  if (typeof text !== 'string' || !text.includes('{')) return text;
  return text.replace(/\{([^}]+)\}/g, (match, rawToken) => {
    const token = String(rawToken ?? '').trim();
    if (!token) return match;
    const resolved = resolveValue(token, context);
    if (resolved === undefined || resolved === null) return '';
    return String(resolved);
  });
}

export function resolveValue(reference, context) {
  if (reference === undefined || reference === null) return undefined;
  if (typeof reference !== 'string') return reference;

  const raw = reference.trim();
  if (!raw) return undefined;

  const lower = raw.toLowerCase();
  const game = context?.game ?? null;

  if (lower === '<currentroom>') return game?.player?.CurrentRoom ?? null;
  if (lower === '<self>') return context?.objectBeingActedUpon ?? context?.entity ?? null;

  const prefixes = [
    { prefix: 'player.', root: () => game?.player },
    { prefix: 'room.', root: () => context?.room ?? game?.getCurrentRoom?.() ?? null },
    { prefix: 'object.', root: () => context?.objectBeingActedUpon ?? context?.object ?? null },
    { prefix: 'character.', root: () => context?.character ?? null },
    { prefix: 'timer.', root: () => context?.timer ?? null },
    { prefix: 'global.', root: () => game?.variables ?? null },
    { prefix: 'vars.', root: () => game?.variables ?? null }
  ];

  for (const entry of prefixes) {
    if (!lower.startsWith(entry.prefix)) continue;
    const tail = raw.slice(entry.prefix.length);
    return getByPath(entry.root(), tail);
  }

  const variables = game?.variables ?? null;
  if (variables && Object.prototype.hasOwnProperty.call(variables, raw)) return variables[raw];

  const textLibrary = variables?.texts ?? null;
  if (textLibrary) {
    if (lower.startsWith('text.') || lower.startsWith('texts.')) {
      const tail = raw.split('.').slice(1).join('.');
      const resolvedText = getByPath(textLibrary, tail);
      if (resolvedText !== undefined) return resolvedText;
    }
    if (raw.includes('.')) {
      const resolvedText = getByPath(textLibrary, raw);
      if (resolvedText !== undefined) return resolvedText;
    }
  }

  const alias = resolveAliasValue(raw, context);
  if (alias !== undefined) return alias;

  return undefined;
}

export function setValue(reference, value, context) {
  if (typeof reference !== 'string') return false;
  const raw = reference.trim();
  if (!raw) return false;

  const lower = raw.toLowerCase();
  const game = context?.game ?? null;
  const variables = game?.variables ?? null;

  const prefixes = [
    { prefix: 'player.', root: () => game?.player },
    { prefix: 'room.', root: () => context?.room ?? game?.getCurrentRoom?.() ?? null },
    { prefix: 'object.', root: () => context?.objectBeingActedUpon ?? context?.object ?? null },
    { prefix: 'character.', root: () => context?.character ?? null },
    { prefix: 'timer.', root: () => context?.timer ?? null },
    { prefix: 'global.', root: () => (variables ?? null) },
    { prefix: 'vars.', root: () => (variables ?? null) }
  ];

  for (const entry of prefixes) {
    if (!lower.startsWith(entry.prefix)) continue;
    const tail = raw.slice(entry.prefix.length);
    return setByPath(entry.root(), tail, value);
  }

  if (setAliasValue(raw, value, context)) return true;

  if (!game) return false;
  if (!game.variables) game.variables = {};
  game.variables[raw] = value;
  return true;
}

export function resolveEntityById(game, entityType, entityId, fallbackEntity) {
  if (fallbackEntity) return fallbackEntity;
  const id = String(entityId ?? '').trim();
  if (!id || !game) return null;

  if (entityType === 'room') return game.roomMap?.[id] ?? null;
  if (entityType === 'object') {
    const direct = game.objectMap?.[id] ?? null;
    if (direct) return direct;
    return game.objectNameMap?.[normalizeLookupKey(id)] ?? game.objectNameMap?.[normalizeAliasKey(id)] ?? null;
  }
  if (entityType === 'character') {
    return game.characterMap?.[id] ?? game.characterNameMap?.[normalizeLookupKey(id)] ?? null;
  }
  if (entityType === 'timer') {
    return game.timerMap?.[id] ?? game.timerNameMap?.[normalizeLookupKey(id)] ?? null;
  }
  if (entityType === 'player') return game.player ?? null;
  if (entityType === 'global') return game ?? null;
  return null;
}
