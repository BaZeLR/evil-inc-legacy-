import { applyOperation, coerceLiteral, interpolateText, resolveEntityById, resolveValue, setCustomProperty, setValue } from './valueResolver.js';
import { advanceGameClockByMinutes } from '../utils/gameTime.js';
import { chancePercent, cryptoRng, randomIntInclusive } from '../utils/random.js';
import { compareOp } from '../utils/compare.js';
import { normalizeAction as normalizeActionModel, normalizeCondition as normalizeConditionModel } from '../models/normalize.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getField(obj, candidates) {
  for (const key of candidates) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  }
  return undefined;
}

function getCheckSteps(check) {
  return {
    step2: getField(check, ['ConditionStep2', 'Step2', 'step2']),
    step3: getField(check, ['ConditionStep3', 'Step3', 'step3']),
    step4: getField(check, ['ConditionStep4', 'Step4', 'step4'])
  };
}

function getCommandParts(command) {
  return {
    text: getField(command, ['CommandText', 'commandText', 'text', 'run', 'Text']),
    part2: getField(command, ['CommandPart2', 'commandPart2', 'part2', 'Variable', 'VarName', 'ArrayName', 'EnemyID']),
    part3: getField(command, ['CommandPart3', 'commandPart3', 'part3', 'Operator']),
    part4: getField(command, ['CommandPart4', 'commandPart4', 'part4', 'Value']),
    name: getField(command, ['CommandName', 'name'])
  };
}

function normalizeSceneVariableRef(variableRef) {
  const ref = String(variableRef ?? '').trim();
  if (!ref) return '';
  if (ref.includes('.')) return ref;

  // Common non-Stats player fields.
  if (ref === 'Credits') return 'player.Credits';
  if (ref === 'Inventory' || ref === 'Equipped' || ref === 'CompletedScenes' || ref === 'VisitedRooms') {
    return `player.${ref}`;
  }

  return `player.Stats.${ref}`;
}

function isFirstTimeEvent(eventType) {
  return String(eventType ?? '').toLowerCase().includes('first time');
}

function isLeaveEvent(eventType) {
  return String(eventType ?? '').toLowerCase().includes('leave');
}

function clampInt(value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeActionKey(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeChoiceValue(value) {
  return String(value ?? '').trim();
}

function normalizeChoicePayload(choice, fallbackLabel, fallbackValue) {
  if (choice === undefined || choice === null) return null;
  if (typeof choice !== 'object') {
    const label = normalizeChoiceValue(choice);
    if (!label) return null;
    return { Label: label, Value: label };
  }

  const label = normalizeChoiceValue(choice.Label ?? choice.label ?? choice.Text ?? choice.text ?? fallbackLabel ?? '');
  const value = normalizeChoiceValue(choice.Value ?? choice.value ?? fallbackValue ?? label);
  if (!label) return null;

  const payload = { Label: label, Value: value || label };
  if (choice.ShowIf !== undefined) payload.ShowIf = choice.ShowIf;
  if (choice.showIf !== undefined) payload.ShowIf = choice.showIf;
  if (choice.HideIf !== undefined) payload.HideIf = choice.HideIf;
  if (choice.hideIf !== undefined) payload.HideIf = choice.hideIf;
  if (choice.bActive !== undefined) payload.bActive = choice.bActive;
  if (choice.active !== undefined) payload.bActive = choice.active;
  if (choice.Disabled !== undefined) payload.Disabled = choice.Disabled;
  if (choice.disabled !== undefined) payload.Disabled = choice.disabled;
  return payload;
}

function parseRagsActionRef(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  const parts = text.split(':').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  if (parts.length === 1) {
    return { entityType: '', entityId: '', actionName: parts[0] };
  }

  const entityType = normalizeTargetType(parts[0]);
  if (parts.length === 2) {
    return { entityType, entityId: parts[1], actionName: '' };
  }

  return {
    entityType,
    entityId: parts[1],
    actionName: parts.slice(2).join(':')
  };
}

function resolveRoomIdFromAny(game, raw) {
  const id = String(raw ?? '').trim();
  if (!id) return '';
  if (game?.roomMap?.[id]) return id;
  const needle = normalizeLower(id);
  const rooms = Object.values(game?.roomMap ?? {});
  for (const room of rooms) {
    const nameKey = normalizeLower(room?.Name ?? room?.name ?? '');
    const sdescKey = normalizeLower(room?.SDesc ?? room?.sdesc ?? '');
    if (needle && (needle === nameKey || needle === sdescKey)) {
      return String(room?.id ?? room?.UniqueID ?? '').trim();
    }
  }
  return '';
}

function normalizeInventoryEntryId(entry) {
  return String(entry?.UniqueID ?? entry?.id ?? entry?.Name ?? entry?.name ?? '').trim();
}

function removeInventoryItem(inventory, objId) {
  if (!Array.isArray(inventory) || !objId) return false;
  const before = inventory.length;
  const idKey = normalizeLower(objId);
  const next = inventory.filter(entry => normalizeLower(normalizeInventoryEntryId(entry)) !== idKey);
  if (next.length !== before) {
    inventory.length = 0;
    inventory.push(...next);
    return true;
  }
  return false;
}

function removeObjectFromRoom(room, objId) {
  if (!room || !Array.isArray(room.objects) || !objId) return false;
  const idKey = normalizeLower(objId);
  const before = room.objects.length;
  room.objects = room.objects.filter(obj => {
    const entryId = String(obj?.id ?? obj?.UniqueID ?? obj ?? '').trim();
    return normalizeLower(entryId) !== idKey;
  });
  return room.objects.length !== before;
}

function addCustomChoiceToAction(target, actionName, choice, result) {
  const action = resolveActionForEntity(target, actionName);
  if (!action) {
    result?.errors?.push?.(`Add choice error: action '${actionName}' not found.`);
    return false;
  }

  const normalized = normalizeChoicePayload(choice, choice?.Label ?? choice?.label, choice?.Value ?? choice?.value);
  if (!normalized) {
    result?.errors?.push?.(`Add choice error: invalid choice for action '${actionName}'.`);
    return false;
  }

  if (!Array.isArray(action.CustomChoices)) action.CustomChoices = [];
  const list = action.CustomChoices;
  const valueKey = normalizeActionKey(normalized.Value ?? normalized.Label);
  const labelKey = normalizeActionKey(normalized.Label);
  const exists = list.some(entry => {
    const entryLabel = normalizeActionKey(entry?.Label ?? entry?.label ?? entry?.Text ?? entry?.text ?? entry?.Value ?? entry?.value ?? '');
    const entryValue = normalizeActionKey(entry?.Value ?? entry?.value ?? entry?.Label ?? entry?.label ?? '');
    return (valueKey && entryValue === valueKey) || (labelKey && entryLabel === labelKey);
  });
  if (exists) return false;

  list.push({ ...normalized, __dynamic: true });
  return true;
}

function removeCustomChoiceFromAction(target, actionName, { label, value, clearAll, mode } = {}, result) {
  const actions = Array.isArray(target?.Actions) ? target.Actions : [];
  const actionList = actionName ? [resolveActionForEntity(target, actionName)] : actions;
  const matchValue = normalizeActionKey(value ?? '');
  const matchLabel = normalizeActionKey(label ?? '');
  let touched = false;

  for (const action of actionList) {
    if (!action) continue;
    if (!Array.isArray(action.CustomChoices) || !action.CustomChoices.length) continue;
    const before = action.CustomChoices.length;
    if (clearAll || mode === 'all') {
      action.CustomChoices = [];
      touched = touched || before > 0;
      continue;
    }
    if (matchValue || matchLabel) {
      action.CustomChoices = action.CustomChoices.filter(entry => {
        const entryLabel = normalizeActionKey(entry?.Label ?? entry?.label ?? entry?.Text ?? entry?.text ?? '');
        const entryValue = normalizeActionKey(entry?.Value ?? entry?.value ?? '');
        if (matchValue && entryValue === matchValue) return false;
        if (matchLabel && entryLabel === matchLabel) return false;
        return true;
      });
    } else {
      action.CustomChoices = action.CustomChoices.filter(entry => !entry?.__dynamic);
    }
    if (action.CustomChoices.length !== before) touched = true;
  }

  if (!touched && result) {
    result.errors.push(`Remove choice error: action '${actionName}' not found or no choices matched.`);
  }
  return touched;
}

function normalizeTargetType(rawType) {
  const value = String(rawType ?? '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'chr' || value === 'char' || value === 'character' || value === 'npc') return 'character';
  if (value === 'obj' || value === 'object' || value === 'item') return 'object';
  if (value === 'room' || value === 'location') return 'room';
  if (value === 'timer') return 'timer';
  if (value === 'player') return 'player';
  if (value === 'event') return 'event';
  if (value === 'global' || value === 'game') return 'global';
  return value;
}

function resolveTargetEntity(ctx, targetSpec) {
  const game = ctx?.game ?? null;
  if (!targetSpec) return ctx?.entity ?? ctx?.character ?? ctx?.objectBeingActedUpon ?? ctx?.room ?? null;

  let targetType = '';
  let targetId = '';
  if (typeof targetSpec === 'string') {
    const raw = targetSpec.trim();
    const parts = raw.split(':').map(part => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      targetType = normalizeTargetType(parts[0]);
      targetId = parts.slice(1).join(':');
    } else {
      targetId = raw;
    }
  } else if (targetSpec && typeof targetSpec === 'object') {
    targetType = normalizeTargetType(targetSpec.Type ?? targetSpec.type ?? targetSpec.EntityType ?? targetSpec.entityType ?? '');
    targetId = String(targetSpec.Id ?? targetSpec.id ?? targetSpec.UniqueID ?? targetSpec.uniqueId ?? '').trim();
  }

  if (game && targetType && targetId) {
    return resolveEntityById(game, targetType, targetId, null);
  }
  if (game && targetId) {
    return (
      resolveEntityById(game, 'character', targetId, null) ||
      resolveEntityById(game, 'object', targetId, null) ||
      resolveEntityById(game, 'room', targetId, null) ||
      null
    );
  }

  return ctx?.entity ?? ctx?.character ?? ctx?.objectBeingActedUpon ?? ctx?.room ?? null;
}

function resolveActionForEntity(entity, actionName) {
  const key = normalizeActionKey(actionName);
  if (!entity || !key) return null;
  const actions = Array.isArray(entity?.Actions) ? entity.Actions : [];
  let fallback = null;
  for (const action of actions) {
    if (!action) continue;
    const nameKey = normalizeActionKey(action?.name);
    const overrideKey = normalizeActionKey(action?.overridename);
    if (nameKey === key || overrideKey === key) return action;

    const looseName = normalizeActionKey(String(action?.name ?? '').replace(/[^a-z0-9]+/gi, ''));
    const looseOverride = normalizeActionKey(String(action?.overridename ?? '').replace(/[^a-z0-9]+/gi, ''));
    const looseKey = normalizeActionKey(String(actionName ?? '').replace(/[^a-z0-9]+/gi, ''));
    if (looseKey && (looseName === looseKey || looseOverride === looseKey)) fallback = action;
    if (!fallback && (nameKey.includes(key) || overrideKey.includes(key))) fallback = action;
  }
  return fallback;
}

function defaultProbSpawnForId(id) {
  const text = String(id ?? '').trim();
  if (!text) return 10;
  let hash = 0;
  for (let idx = 0; idx < text.length; idx++) {
    hash = (hash * 31 + text.charCodeAt(idx)) >>> 0;
  }
  return 5 + (hash % 11);
}

function getSpawnWeightValue(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, num);
}

function getSpawnAreas(entity) {
  if (!entity) return [];
  const raw =
    entity.SpawnAreas ??
    entity.spawnAreas ??
    entity.SpawnArea ??
    entity.spawnArea ??
    entity.spawn_area ??
    null;

  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(v => String(v ?? '').trim()).filter(Boolean);
  const text = String(raw ?? '').trim();
  return text ? [text] : [];
}

function matchesSpawnArea(entity, roomGroup) {
  const group = String(roomGroup ?? '').trim();
  if (!group) return true;
  const areas = getSpawnAreas(entity);
  if (!areas.length) return true;
  const groupKey = normalizeLower(group);
  return areas.some(area => {
    const key = normalizeLower(area);
    return key === '*' || key === 'any' || key === groupKey;
  });
}

function weightedPick(entries, rng = cryptoRng) {
  const list = Array.isArray(entries) ? entries : [];
  let total = 0;
  for (const entry of list) total += getSpawnWeightValue(entry?.weight, 0);
  if (total <= 0) return null;

  const roll = rng() * total;
  let running = 0;
  for (const entry of list) {
    running += getSpawnWeightValue(entry?.weight, 0);
    if (roll < running) return entry;
  }
  return list[list.length - 1] || null;
}

function normalizeAction(action) {
  return normalizeActionModel(action);
}

function actionMatchesEvent(action, eventType) {
  const expected = String(eventType ?? '').trim();
  if (!expected) return false;
  if (!action) return false;
  const name = String(action.name ?? '').trim();
  const override = String(action.overridename ?? '').trim();
  if (name === expected || override === expected) return true;

  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const expectedKey = normalize(expected);
  const nameKey = normalize(name);
  const overrideKey = normalize(override);

  const aliases = {
    '<<on player enter first time>>': ['<<on player first enter>>', '<<on player enter first>>', '<<on first player enter>>'],
    '<<on player leave first time>>': ['<<on player first leave>>', '<<on player leave first>>', '<<on first player leave>>']
  };

  const expectedAliases = aliases[expectedKey] || [];
  if (expectedAliases.includes(nameKey) || expectedAliases.includes(overrideKey)) return true;

  const nameAliases = aliases[nameKey] || [];
  if (nameAliases.includes(expectedKey) || nameAliases.includes(overrideKey)) return true;

  const overrideAliases = aliases[overrideKey] || [];
  if (overrideAliases.includes(expectedKey) || overrideAliases.includes(nameKey)) return true;

  return false;
}

export class EventEngine {
  constructor(game) {
    this.game = game;
    this.firstTimeEventKeys = new Set();
  }

  runEvent(eventType, { entityType, entityId, entity, room, objectBeingActedUpon, character, input, rng } = {}) {
    const resolvedEntity = resolveEntityById(this.game, entityType, entityId, entity);
    const result = this.createResult();
    if (!resolvedEntity) return result;

    const ctx = {
      game: this.game,
      rng: typeof rng === 'function' ? rng : undefined,
      entityType,
      entityId: entityId ?? resolvedEntity?.id ?? resolvedEntity?.UniqueID ?? null,
      entity: resolvedEntity,
      room: room ?? (entityType === 'room' ? resolvedEntity : this.game?.getCurrentRoom?.() ?? null),
      objectBeingActedUpon: objectBeingActedUpon ?? (entityType === 'object' ? resolvedEntity : null),
      character: character ?? (entityType === 'character' ? resolvedEntity : null),
      input
    };

    const actions = asArray(resolvedEntity?.Actions);
    for (const rawAction of actions) {
      const action = normalizeAction(rawAction);
      if (!action || !action.bActive) continue;
      if (!actionMatchesEvent(action, eventType)) continue;

      if (isFirstTimeEvent(eventType)) {
        if (String(entityType ?? '').trim() === 'room') {
          const alreadyVisited = isLeaveEvent(eventType) ? ctx?.room?.bFirstTimeLeft : ctx?.room?.bFirstTimeVisited;
          if (alreadyVisited) continue;
        }
        const key = `${entityType ?? 'unknown'}:${String(ctx.entityId ?? '').trim()}:${String(eventType ?? '').trim()}`;
        if (this.firstTimeEventKeys.has(key)) continue;
        this.firstTimeEventKeys.add(key);
      }

      this.executeAction(action, ctx, result);
    }

    return result;
  }

  createResult() {
    return {
      texts: [],
      media: null,
      startCombatEnemyId: null,
      sceneData: null,
      paused: false,
      errors: [],
      didSomething: false
    };
  }

  executeAction(action, ctx, result) {
    const conditions = asArray(action?.Conditions);
    const requireAll = action?.bConditionFailOnFirst !== false;

    let passed = requireAll ? true : conditions.length === 0;

    for (const condNode of conditions) {
      const cond = this.normalizeCondition(condNode);
      if (!cond) continue;
      const conditionPassed = this.evaluateCondition(cond, ctx, result);

      if (requireAll && !conditionPassed) passed = false;
      if (!requireAll && conditionPassed) passed = true;

      const branchNodes = conditionPassed ? cond.PassCommands : cond.FailCommands;
      this.executeNodes(branchNodes, ctx, result);
    }

    const actionNodes = passed ? asArray(action.PassCommands) : asArray(action.FailCommands);
    this.executeNodes(actionNodes, ctx, result);

    if (passed) {
      const triggerScene = String(action?.TriggerScene ?? '').trim();
      const triggerScenes = asArray(action?.TriggerScenes)
        .map(id => String(id ?? '').trim())
        .filter(Boolean);

      const sceneId = triggerScene || this.pickNextUncompletedScene(triggerScenes, ctx, result);
      if (sceneId) this.triggerScene(sceneId, ctx, result);
    }
  }

  resolveSceneRef(sceneRef, ctx, result) {
    const id = String(sceneRef ?? '').trim();
    if (!id) return '';

    const match = id.match(/^#?(\d{1,3})$/);
    if (!match) return id;

    const roomId = String(ctx?.room?.id ?? ctx?.room?.UniqueID ?? '').trim();
    const resolved =
      this.game?.sceneLoader?.resolveSceneIdFromNumber?.(match[1], { roomId, preferTypes: ['sequence'] }) ||
      this.game?.sceneLoader?.resolveSceneIdFromNumber?.(match[1], { roomId }) ||
      '';

    if (resolved) return resolved;
    if (result?.errors) {
      result.errors.push(`Scene error: unable to resolve scene number '${id}' for room '${roomId || 'unknown'}'.`);
      result.didSomething = true;
    }
    return '';
  }

  pickNextUncompletedScene(sceneIds, ctx, result) {
    const list = asArray(sceneIds).map(id => String(id ?? '').trim()).filter(Boolean);
    if (!list.length) return '';
    for (const sceneId of list) {
      const resolved = this.resolveSceneRef(sceneId, ctx, result);
      if (!resolved) continue;
      const completed = this.game?.sceneLoader?.isSceneCompleted?.(resolved);
      if (!completed) return resolved;
    }
    return '';
  }

  triggerScene(sceneId, ctx, result) {
    const id = this.resolveSceneRef(sceneId, ctx, result);
    if (!id) return;

    if (!this.game?.sceneRunner?.begin) {
      result.errors.push(`Scene error: SceneRunner not available (cannot start '${id}').`);
      result.didSomething = true;
      return;
    }

    const sceneExists = Boolean(this.game?.sceneLoader?.getScene?.(id));
    const sceneResult = this.game.sceneRunner.begin(id);
    if (!sceneResult) {
      if (sceneExists) return;
      result.errors.push(`Scene error: unable to start '${id}'.`);
      result.didSomething = true;
      return;
    }

    if (sceneResult?.media) result.media = sceneResult.media;
    if (sceneResult?.sceneData) result.sceneData = sceneResult.sceneData;
    if (sceneResult?.startCombatEnemyId) result.startCombatEnemyId = sceneResult.startCombatEnemyId;
    result.paused = Boolean(sceneResult?.paused ?? true);
    result.didSomething = true;

    const threadEventId = this.game?.threadEventBySceneId?.[id] ?? '';
    if (threadEventId && this.game?.eventController?.registerActiveSceneEvent) {
      this.game.eventController.registerActiveSceneEvent(threadEventId, id);
    }
  }

  normalizeCondition(node) {
    return normalizeConditionModel(node);
  }

  evaluateCondition(condition, ctx, result) {
    const checks = asArray(condition?.Checks);
    if (!checks.length) return true;

    // Loop support: a single CT_Loop_While check acts like a while-loop over PassCommands.
    if (checks.length === 1 && String(checks[0]?.CondType ?? '').trim() === 'CT_Loop_While') {
      const loopCheck = checks[0];
      const { step2, step3, step4 } = getCheckSteps(loopCheck);
      const maxIterations = 250;
      let ran = false;
      for (let i = 0; i < maxIterations; i++) {
        if (!this.evaluateVariableComparison(step2, step3, step4, ctx)) break;
        ran = true;
        this.executeNodes(condition.PassCommands, ctx, result);
      }
      return ran;
    }

    let bResult = true;
    let counter = 0;

    for (const check of checks) {
      if (!isRecord(check)) continue;

      if (counter > 0) {
        const joinType = String(check.CkType ?? '').trim();
        if (joinType === 'Or' && bResult === true) break;
        if (joinType === 'And' && bResult === false) continue;
      }
      counter++;

      bResult = this.evaluateCheck(check, ctx, result);
    }

    return bResult;
  }

  evaluateCheck(check, ctx, result) {
    const condType = String(check?.CondType ?? '').trim();
    const { step2, step3, step4 } = getCheckSteps(check);

    if (!condType) return false;

    switch (condType) {
      case 'CT_Variable_Comparison':
      case 'CT_Variable':
        return this.evaluateVariableComparison(step2, step3, step4, ctx);
      case 'CT_Input_Comparison':
      case 'CT_INPUT_COMPARISON':
      case 'CT_Input': {
        const rawOp = interpolateText(String(step3 ?? ''), ctx).trim();
        const op = rawOp || '==';

        const rawExpected = interpolateText(step4 === undefined || step4 === null ? '' : String(step4), ctx).trim();
        const resolvedExpected = resolveValue(rawExpected, ctx);
        const expected = resolvedExpected !== undefined ? resolvedExpected : coerceLiteral(rawExpected);

        const actualRaw = ctx?.input === undefined || ctx?.input === null ? '' : String(ctx.input);
        const actual = actualRaw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
        const expectedNorm =
          expected === undefined || expected === null
            ? ''
            : String(expected).replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

        return compareOp(actual, op, expectedNorm, { caseInsensitive: true, coerceNumbers: false, trimStrings: true });
      }
      case 'CT_RandomChance':
      case 'CT_Random_Chance':
      case 'CT_RANDOM_CHANCE':
      case 'CT_D100_CHANCE': {
        const raw = interpolateText(String(step2 ?? ''), ctx).trim();
        let percent = resolveValue(raw, ctx);
        if (percent === undefined) percent = coerceLiteral(raw);
        const rng = typeof ctx?.rng === 'function' ? ctx.rng : undefined;
        return chancePercent(percent, rng);
      }
      case 'CT_ObjectState':
        return this.evaluateEntityState('object', step2, step3, step4, ctx);
      case 'CT_CharacterState':
        return this.evaluateEntityState('character', step2, step3, step4, ctx);
      case 'CT_AdditionalDataCheck': {
        const expectedRaw = interpolateText(String(step2 ?? ''), ctx).trim();
        if (!expectedRaw) return false;
        const actualRaw = ctx?.input === undefined || ctx?.input === null ? '' : String(ctx.input);
        return compareOp(actualRaw, 'equals', expectedRaw, { caseInsensitive: true, coerceNumbers: false, trimStrings: true });
      }
      case 'CT_Character_In_Room': {
        const game = ctx?.game ?? null;
        const rawChar = interpolateText(String(step2 ?? ''), ctx).trim();
        if (!game || !rawChar) return false;
        const char = resolveEntityById(game, 'character', rawChar, null);
        if (!char) return false;

        let roomId = interpolateText(String(step3 ?? ''), ctx).trim();
        if (!roomId || roomId === '00000000-0000-0000-0000-000000000001') {
          roomId = String(ctx?.room?.id ?? ctx?.room?.UniqueID ?? game?.player?.CurrentRoom ?? '').trim();
        }
        const charRoom = String(char?.currentRoomId ?? char?.CurrentRoom ?? char?.location ?? '').trim();
        if (!roomId) return Boolean(charRoom);
        return charRoom === roomId;
      }
      case 'CT_Uninitialized':
        return true;
      default:
        result?.errors?.push?.(`Unimplemented CondType: ${condType}`);
        return false;
    }
  }

  evaluateVariableComparison(step2, step3, step4, ctx) {
    const variableRef = interpolateText(String(step2 ?? ''), ctx);
    const opRaw = interpolateText(String(step3 ?? ''), ctx);
    const expectedRaw = interpolateText(step4 === undefined || step4 === null ? '' : String(step4), ctx);

    const actual = resolveValue(variableRef, ctx);
    const expected = coerceLiteral(expectedRaw);

    const op = String(opRaw ?? '').trim();
    if (!op) return Boolean(actual);
    return compareOp(actual, op, expected, { caseInsensitive: true, coerceNumbers: true });
  }

  evaluateEntityState(targetType, step2, step3, step4, ctx) {
    const idRaw = interpolateText(String(step2 ?? ''), ctx).trim();
    const propPath = interpolateText(String(step3 ?? ''), ctx).trim();
    const expectedRaw = interpolateText(step4 === undefined || step4 === null ? '' : String(step4), ctx);
    const expected = coerceLiteral(expectedRaw);

    const entity = resolveEntityById(
      this.game,
      targetType,
      idRaw === '<Self>' ? (ctx?.objectBeingActedUpon?.id ?? ctx?.objectBeingActedUpon?.UniqueID ?? '') : idRaw,
      idRaw === '<Self>' ? ctx?.objectBeingActedUpon : null
    );
    if (!entity) return false;
    if (!propPath) return Boolean(entity);

    const actual = resolveValue(`${targetType}.${propPath}`, { ...ctx, [targetType]: entity, objectBeingActedUpon: entity });
    if (typeof expected === 'boolean') return Boolean(actual) === expected;
    if (typeof expected === 'number') return Number(actual) === expected;
    return String(actual ?? '').toLowerCase() === String(expected ?? '').toLowerCase();
  }

  executeNodes(nodes, ctx, result) {
    for (const node of asArray(nodes)) {
      if (!node) continue;
      if (isRecord(node) && typeof node.cmdtype === 'string') {
        this.executeCommand(node, ctx, result);
        continue;
      }
      if (isRecord(node) && Array.isArray(node.Checks)) {
        const cond = this.normalizeCondition(node);
        const passed = this.evaluateCondition(cond, ctx, result);
        const branch = passed ? cond.PassCommands : cond.FailCommands;
        this.executeNodes(branch, ctx, result);
        continue;
      }
    }
  }

  executeCommand(command, ctx, result) {
    const cmdtypeRaw = String(command?.cmdtype ?? command?.Type ?? '').trim();
    const cmdtype = cmdtypeRaw === 'CT_STARTCOMBAT' ? 'CT_START_COMBAT' : cmdtypeRaw;
    const { text, part2, part3, part4 } = getCommandParts(command);

    if (!cmdtype) return;

    switch (cmdtype) {
      case 'CT_DISPLAYTEXT': {
        const output = interpolateText(String(text ?? ''), ctx);
        if (output) {
          result.texts.push(output);
          result.didSomething = true;
        }
        break;
      }

      case 'CT_DISPLAYCHARDESC': {
        const game = ctx?.game ?? null;
        const rawChar = interpolateText(String(part2 ?? ''), ctx).trim();
        const char =
          rawChar
            ? resolveEntityById(game, 'character', rawChar, null)
            : ctx?.character ?? ctx?.entity ?? null;
        const desc = char?.Description ?? char?.description ?? '';
        const output = interpolateText(String(desc ?? ''), { ...ctx, character: char });
        if (output) {
          result.texts.push(output);
          result.didSomething = true;
        }
        break;
      }

      case 'CT_SETVARIABLEBYINPUT':
      case 'CT_SETVARIABLE_NUMERIC_BYINPUT':
      case 'CT_SET_VARIABLE_BY_INPUT': {
        const rawVar = interpolateText(String(part3 ?? part2 ?? ''), ctx).trim();
        if (!rawVar) break;

        const rawInput = ctx?.input ?? '';
        const value =
          cmdtype === 'CT_SETVARIABLE_NUMERIC_BYINPUT'
            ? Number(String(rawInput ?? '').trim() || 0)
            : String(rawInput ?? '');

        if (setValue(rawVar, value, ctx)) {
          result.didSomething = true;
        }
        break;
      }

      case 'CT_SETVARIABLE': {
        const variableRef = normalizeSceneVariableRef(interpolateText(String(part2 ?? ''), ctx).trim());
        const operation = interpolateText(String(part3 ?? ''), ctx).trim() || 'Equals';
        const rawValue = interpolateText(part4 === undefined || part4 === null ? '' : String(part4), ctx);

        const current = resolveValue(variableRef, ctx);
        const next = applyOperation(current, operation, rawValue);
        if (variableRef) {
          setValue(variableRef, next, ctx);
          if (variableRef === 'player.Stats.prologue_test_complete' && Boolean(next)) {
            setValue('player.Stats.prologue_test_ready', false, ctx);
          }
          result.didSomething = true;
        }
        break;
      }

      case 'CT_MODIFYVALUE': {
        const variableRef = normalizeSceneVariableRef(interpolateText(String(part2 ?? ''), ctx).trim());
        const rawValue = interpolateText(part4 === undefined || part4 === null ? '' : String(part4), ctx);
        const current = resolveValue(variableRef, ctx);
        const next = applyOperation(current, 'Add', rawValue);
        if (variableRef) {
          setValue(variableRef, next, ctx);
          result.didSomething = true;
        }
        break;
      }

      case 'CT_ADDTOARRAY': {
        const variableRef = normalizeSceneVariableRef(interpolateText(String(part2 ?? ''), ctx).trim());
        const value = part4;
        if (!variableRef) break;

        const current = resolveValue(variableRef, ctx);
        const list = Array.isArray(current) ? [...current] : [];

        const candidate = value;
        const candidateId =
          candidate && typeof candidate === 'object' ? String(candidate.UniqueID ?? candidate.id ?? '').trim() : '';
        const primitiveKey = candidateId ? '' : String(candidate ?? '').trim();

        const alreadyPresent = list.some(entry => {
          if (candidateId) {
            const entryId = entry && typeof entry === 'object' ? String(entry.UniqueID ?? entry.id ?? '').trim() : '';
            return entryId === candidateId;
          }
          return primitiveKey && String(entry ?? '').trim() === primitiveKey;
        });

        if (!alreadyPresent) {
          list.push(candidate);
          setValue(variableRef, list, ctx);
          result.didSomething = true;
        }

        break;
      }

      case 'CT_DISPLAYPICTURE': {
        const media = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        if (media) {
          if (ctx?.preserveFirstMedia && result.media) break;
          result.media = media;
          result.didSomething = true;
        }
        break;
      }

      case 'CT_OPENSHOP': {
        const vendorId = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        const category = interpolateText(String(part3 ?? ''), ctx).trim();
        if (vendorId) {
          result.openShopVendorId = vendorId;
          result.openShopCategory = category || null;
          result.didSomething = true;
        }
        break;
      }

      case 'CT_PAUSEGAME': {
        result.paused = true;
        result.didSomething = true;
        break;
      }

      case 'CT_ADVANCE_TIME': {
        const game = ctx?.game ?? null;
        if (!game?.player) break;

        const raw = interpolateText(String(part2 ?? part4 ?? text ?? ''), ctx).trim();
        let minutes = resolveValue(raw, ctx);
        if (minutes === undefined) minutes = coerceLiteral(raw);
        const delta = Number(minutes);
        if (!Number.isFinite(delta) || delta === 0) break;

        advanceGameClockByMinutes(game.player, delta);
        if (game.timerManager?.advanceTime) {
          const timerResult = game.timerManager.advanceTime(delta);
          if (timerResult && typeof game.mergeEventResults === 'function') {
            game.mergeEventResults(result, timerResult);
          }
        }
        result.didSomething = true;
        break;
      }

      case 'CT_EXECUTETIMER':
      case 'CT_EXECUTE_TIMER': {
        const game = ctx?.game ?? null;
        if (!game) break;
        const rawTimerId = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        if (!rawTimerId) break;
        const timer =
          game.timerMap?.[rawTimerId] ??
          game.timerNameMap?.[normalizeLower(rawTimerId)] ??
          null;
        if (!timer) {
          result.errors.push(`Timer not found: ${rawTimerId}`);
          break;
        }
        if (game.timerManager?.runTimerActions) {
          const timerResult = game.timerManager.runTimerActions(timer);
          if (timerResult && typeof game.mergeEventResults === 'function') {
            game.mergeEventResults(result, timerResult);
          }
          result.didSomething = true;
        }
        break;
      }

      case 'CT_SETTIMER':
      case 'CT_SET_TIMER': {
        const game = ctx?.game ?? null;
        if (!game) break;
        const rawTimerId = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        if (!rawTimerId) break;
        const timer =
          game.timerMap?.[rawTimerId] ??
          game.timerNameMap?.[normalizeLower(rawTimerId)] ??
          null;
        if (!timer) {
          result.errors.push(`Timer not found: ${rawTimerId}`);
          break;
        }

        const rawCommand = interpolateText(String(part3 ?? part4 ?? ''), ctx).trim();
        const command = normalizeLower(rawCommand);

        if (['active', 'activate', 'on', 'true'].includes(command)) {
          timer.Active = true;
          timer.Enabled = true;
          if (timer.__state && typeof timer.__state === 'object') {
            delete timer.__state.nextTurn;
            delete timer.__state.nextMinute;
          }
          result.didSomething = true;
          break;
        }

        if (['inactive', 'deactivate', 'off', 'false'].includes(command)) {
          timer.Active = false;
          timer.Enabled = false;
          result.didSomething = true;
          break;
        }

        const numeric = Number(rawCommand);
        if (Number.isFinite(numeric)) {
          timer.TurnNumber = numeric;
          timer.StartAtTurn = numeric;
          if (timer.__state && typeof timer.__state === 'object') {
            delete timer.__state.nextTurn;
            delete timer.__state.nextMinute;
          }
          result.didSomething = true;
        }
        break;
      }

      case 'CT_START_COMBAT': {
        const rawTarget = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        const enemyId =
          rawTarget === '<Self>' ? String(ctx?.character?.id ?? ctx?.character?.UniqueID ?? '').trim() : rawTarget;

        if (enemyId) {
          result.startCombatEnemyId = enemyId;
          result.didSomething = true;
        }
        break;
      }

      case 'CT_SET_CHARACTER_ROOM': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const characterId = interpolateText(String(part2 ?? ''), ctx).trim();
        const roomId = interpolateText(String(part4 ?? ''), ctx).trim();
        if (!characterId || !roomId) break;

        const char = game.characterMap?.[characterId] ?? null;
        if (!char) break;

        char.currentRoomId = roomId;
        if (Object.prototype.hasOwnProperty.call(char, 'CurrentRoom')) char.CurrentRoom = roomId;
        result.didSomething = true;
        break;
      }

      case 'CT_SETCHARACTION':
      case 'CT_SET_CHARACTER_ACTION': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const rawTarget = interpolateText(String(part2 ?? ''), ctx).trim();
        if (!rawTarget) break;
        const char = resolveEntityById(game, 'character', rawTarget, null);
        if (!char) break;

        const rawAction = interpolateText(String(part3 ?? ''), ctx).trim();
        if (!rawAction) break;

        let actionName = rawAction;
        let stateRaw = '';

        if (rawAction.includes('-')) {
          const parts = rawAction.split('-').map(part => part.trim()).filter(Boolean);
          if (parts.length >= 2) {
            stateRaw = parts.pop() || '';
            actionName = parts.join('-').trim();
          }
        }

        if (!stateRaw) {
          stateRaw = interpolateText(String(part4 ?? ''), ctx).trim();
        }

        const state = normalizeLower(stateRaw || 'active');
        const isActive = ['active', 'enable', 'enabled', 'on', 'true'].includes(state)
          ? true
          : ['inactive', 'disable', 'disabled', 'off', 'false'].includes(state)
            ? false
            : null;

        if (isActive === null) break;

        const key = normalizeActionKey(actionName);
        let touched = false;

        const actions = Array.isArray(char?.Actions) ? char.Actions : [];
        for (const action of actions) {
          if (!action) continue;
          const nameKey = normalizeActionKey(action?.name);
          const overrideKey = normalizeActionKey(action?.overridename);
          if (key && (nameKey === key || overrideKey === key)) {
            action.bActive = isActive;
            touched = true;
          }
        }

        const menu = Array.isArray(char?.ActionsMenu) ? char.ActionsMenu : [];
        for (const entry of menu) {
          if (!entry) continue;
          const entryKey = normalizeActionKey(entry?.Action ?? entry?.name ?? '');
          if (key && entryKey === key) {
            entry.bActive = isActive;
            touched = true;
          }
        }

        if (touched) result.didSomething = true;
        break;
      }

      case 'CT_SETROOMACTION':
      case 'CT_SET_ROOM_ACTION': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const rawTarget = interpolateText(String(part2 ?? ''), ctx).trim();
        const room =
          rawTarget
            ? resolveEntityById(game, 'room', rawTarget, null) ?? game?.roomMap?.[resolveRoomIdFromAny(game, rawTarget)] ?? null
            : ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!room) break;

        const rawAction = interpolateText(String(part3 ?? ''), ctx).trim();
        if (!rawAction) break;

        let actionName = rawAction;
        let stateRaw = '';

        if (rawAction.includes('-')) {
          const parts = rawAction.split('-').map(part => part.trim()).filter(Boolean);
          if (parts.length >= 2) {
            stateRaw = parts.pop() || '';
            actionName = parts.join('-').trim();
          }
        }

        if (!stateRaw) {
          stateRaw = interpolateText(String(part4 ?? ''), ctx).trim();
        }

        const state = normalizeLower(stateRaw || 'active');
        const isActive = ['active', 'enable', 'enabled', 'on', 'true'].includes(state)
          ? true
          : ['inactive', 'disable', 'disabled', 'off', 'false'].includes(state)
            ? false
            : null;

        if (isActive === null) break;

        const key = normalizeActionKey(actionName);
        let touched = false;

        const actions = Array.isArray(room?.Actions) ? room.Actions : [];
        for (const action of actions) {
          if (!action) continue;
          const nameKey = normalizeActionKey(action?.name);
          const overrideKey = normalizeActionKey(action?.overridename);
          if (key && (nameKey === key || overrideKey === key)) {
            action.bActive = isActive;
            touched = true;
          }
        }

        const menu = Array.isArray(room?.ActionsMenu) ? room.ActionsMenu : [];
        for (const entry of menu) {
          if (!entry) continue;
          const entryKey = normalizeActionKey(entry?.Action ?? entry?.name ?? '');
          if (key && entryKey === key) {
            entry.bActive = isActive;
            touched = true;
          }
        }

        if (touched) result.didSomething = true;
        break;
      }

      case 'CT_SETEXIT':
      case 'CT_SET_EXIT': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const descriptor = interpolateText(String(part3 ?? ''), ctx).trim();
        const fallbackKey = interpolateText(String(part2 ?? ''), ctx).trim();

        let direction = '';
        let destination = '';
        let stateRaw = '';

        if (descriptor) {
          const match = /^(.*?)\s*-\s*(Active|Inactive|Enable|Enabled|Disable|Disabled|On|Off)\s*(?:-?\s*To:\s*(.+))?$/i.exec(descriptor);
          if (match) {
            direction = String(match[1] ?? '').trim();
            stateRaw = String(match[2] ?? '').trim();
            destination = String(match[3] ?? '').trim();
          } else if (descriptor.includes('To:')) {
            const [left, right] = descriptor.split(/To:/i);
            direction = String(left ?? '').replace(/-$/, '').trim();
            destination = String(right ?? '').trim();
          } else {
            direction = descriptor;
          }
        }

        if (!direction && fallbackKey) direction = fallbackKey;

        const state = normalizeLower(stateRaw || interpolateText(String(part4 ?? ''), ctx).trim() || 'active');
        const isActive = ['active', 'enable', 'enabled', 'on', 'true'].includes(state)
          ? true
          : ['inactive', 'disable', 'disabled', 'off', 'false'].includes(state)
            ? false
            : null;

        const exits = Array.isArray(room?.exits) ? room.exits : Array.isArray(room?.Exits) ? room.Exits : [];
        if (!exits.length) break;

        const dirKey = normalizeLower(direction);
        const destKey = normalizeLower(destination);
        const fallbackDirKey = normalizeLower(fallbackKey);

        const exit = exits.find(entry => {
          const entryDir = normalizeLower(entry?.Direction ?? entry?.direction ?? '');
          const entryDestRaw = normalizeLower(entry?.DestinationRoom ?? entry?.destinationRaw ?? entry?.destinationName ?? entry?.destination ?? '');
          return (dirKey && entryDir === dirKey) || (destKey && entryDestRaw === destKey) || (fallbackDirKey && entryDir === fallbackDirKey);
        });

        if (!exit) break;

        if (isActive !== null) {
          exit.showIf = isActive;
          exit.ShowIf = isActive;
        }

        if (destination) {
          const resolvedId = resolveRoomIdFromAny(game, destination);
          if (resolvedId) {
            exit.destinationId = resolvedId;
            exit.destinationName = game?.roomMap?.[resolvedId]?.Name ?? destination;
            exit.destinationRaw = destination;
          } else {
            exit.destinationName = destination;
            exit.destinationRaw = destination;
          }
        }

        result.didSomething = true;
        break;
      }

      case 'CT_MOVEPLAYER':
      case 'CT_MOVE_PLAYER': {
        const game = ctx?.game ?? null;
        if (!game?.player) break;

        const rawRoom = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        const roomId = resolveRoomIdFromAny(game, rawRoom);
        if (!roomId) break;

        const fromRoomId = String(game.player.CurrentRoom ?? '').trim();
        game.player.CurrentRoom = roomId;
        ctx.room = game.roomMap?.[roomId] ?? ctx.room;
        if (fromRoomId) game.markRoomLeft(fromRoomId);
        game.markRoomVisited(roomId);

        const leaveEvents = fromRoomId ? game.runRoomLeaveEvents(fromRoomId) : null;
        const enterEvents = game.runRoomEnterEvents(roomId);
        const characterEvents = game.runCharacterEnterEvents(roomId);

        if (leaveEvents) game.mergeEventResults(result, leaveEvents);
        if (enterEvents) game.mergeEventResults(result, enterEvents);
        if (characterEvents) game.mergeEventResults(result, characterEvents);

        result.didSomething = true;
        break;
      }

      case 'CT_MOVECHAR':
      case 'CT_MOVE_CHAR': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const rawChar = interpolateText(String(part2 ?? ''), ctx).trim();
        const rawRoom = interpolateText(String(part3 ?? ''), ctx).trim();
        const char = resolveEntityById(game, 'character', rawChar, null);
        const roomId = resolveRoomIdFromAny(game, rawRoom);
        if (!char || !roomId) break;

        char.currentRoomId = roomId;
        if (Object.prototype.hasOwnProperty.call(char, 'CurrentRoom')) char.CurrentRoom = roomId;
        result.didSomething = true;
        break;
      }

      case 'CT_MOVEITEMTOCHAR':
      case 'CT_MOVE_ITEM_TO_CHAR': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const rawItem = interpolateText(String(part2 ?? ''), ctx).trim();
        const rawChar = interpolateText(String(part3 ?? ''), ctx).trim();
        const obj = resolveEntityById(game, 'object', rawItem, null);
        const char = resolveEntityById(game, 'character', rawChar, null);
        if (!obj || !char) break;

        const objId = String(obj?.id ?? obj?.UniqueID ?? rawItem).trim();
        removeInventoryItem(game?.player?.Inventory, objId);
        for (const room of Object.values(game.roomMap ?? {})) {
          removeObjectFromRoom(room, objId);
        }
        for (const entry of Array.isArray(game.characters) ? game.characters : []) {
          removeInventoryItem(entry?.Inventory, objId);
        }

        if (!Array.isArray(char.Inventory)) char.Inventory = [];
        const exists = char.Inventory.some(entry => normalizeLower(normalizeInventoryEntryId(entry)) === normalizeLower(objId));
        if (!exists) {
          char.Inventory.push({ UniqueID: objId, Name: obj?.Name ?? obj?.name ?? objId });
        }
        obj.Owner = char?.UniqueID ?? char?.id ?? obj.Owner;
        result.didSomething = true;
        break;
      }

      case 'CT_MOVEITEMTOROOM':
      case 'CT_MOVE_ITEM_TO_ROOM': {
        const game = ctx?.game ?? null;
        if (!game) break;

        const rawItem = interpolateText(String(part2 ?? ''), ctx).trim();
        const rawRoom = interpolateText(String(part3 ?? ''), ctx).trim();
        const obj = resolveEntityById(game, 'object', rawItem, null);
        const roomId = resolveRoomIdFromAny(game, rawRoom) || String(ctx?.room?.id ?? ctx?.room?.UniqueID ?? '').trim();
        if (!obj || !roomId) break;

        const room = game.roomMap?.[roomId] ?? null;
        if (!room) break;

        const objId = String(obj?.id ?? obj?.UniqueID ?? rawItem).trim();
        removeInventoryItem(game?.player?.Inventory, objId);
        for (const entry of Array.isArray(game.characters) ? game.characters : []) {
          removeInventoryItem(entry?.Inventory, objId);
        }
        for (const otherRoom of Object.values(game.roomMap ?? {})) {
          if (otherRoom?.id !== roomId) removeObjectFromRoom(otherRoom, objId);
        }

        if (!Array.isArray(room.objects)) room.objects = [];
        const exists = room.objects.some(entry => normalizeLower(String(entry?.id ?? entry?.UniqueID ?? entry ?? '').trim()) === normalizeLower(objId));
        if (!exists) {
          room.objects.push(obj);
        }
        obj.location = roomId;
        result.didSomething = true;
        break;
      }

      case 'CT_TRIGGER_SCENE': {
        const sceneId = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        if (!sceneId) break;
        this.triggerScene(sceneId, ctx, result);
        break;
      }
      case 'CT_ACTION_ADD_CUSTOMCHOICE': {
        const ref = parseRagsActionRef(part2 ?? '');
        if (!ref) break;
        const target = resolveTargetEntity(ctx, { type: ref.entityType, id: ref.entityId });
        const actionName = String(ref.actionName || part3 || '').trim();
        const label = String(text ?? part4 ?? part3 ?? '').trim();
        if (!target || !actionName || !label) break;
        const touched = addCustomChoiceToAction(target, actionName, { Label: label, Value: label }, result);
        if (touched) result.didSomething = true;
        break;
      }

      case 'CT_ACTION_REMOVE_CUSTOMCHOICE': {
        const ref = parseRagsActionRef(part2 ?? '');
        if (!ref) break;
        const target = resolveTargetEntity(ctx, { type: ref.entityType, id: ref.entityId });
        const actionName = String(ref.actionName || part3 || '').trim();
        const label = String(text ?? part4 ?? part3 ?? '').trim();
        if (!target || !actionName) break;
        const touched = removeCustomChoiceFromAction(target, actionName, { label }, result);
        if (touched) result.didSomething = true;
        break;
      }

      case 'CT_ADD_CUSTOM_CHOICE': {
        const payload = isRecord(text) ? text : null;
        const actionName = String(payload?.Action ?? payload?.action ?? part2 ?? '').trim();
        const targetSpec = payload?.Target ?? payload?.target ?? null;
        const target = resolveTargetEntity(ctx, targetSpec);

        const rawChoice = payload?.Choice ?? payload?.choice ?? null;
        const fallbackLabel = String(payload?.Label ?? payload?.label ?? part3 ?? '').trim();
        const fallbackValue = String(payload?.Value ?? payload?.value ?? part4 ?? '').trim() || fallbackLabel;
        const choice = normalizeChoicePayload(rawChoice ?? { Label: fallbackLabel, Value: fallbackValue }, fallbackLabel, fallbackValue);
        if (!choice) {
          result.errors.push(`Add choice error: invalid choice for action '${actionName}'.`);
          break;
        }

        const touched = addCustomChoiceToAction(target, actionName, choice, result);
        if (touched) result.didSomething = true;
        break;
      }
      case 'CT_CLEAR_CUSTOM_CHOICES': {
        const payload = isRecord(text) ? text : null;
        const actionName = String(payload?.Action ?? payload?.action ?? part2 ?? '').trim();
        const targetSpec = payload?.Target ?? payload?.target ?? null;
        const target = resolveTargetEntity(ctx, targetSpec);

        const clearAll = Boolean(payload?.All || payload?.all || String(payload?.Mode ?? payload?.mode ?? '').trim().toLowerCase() === 'all');
        const matchValue = payload?.Value ?? payload?.value ?? part3 ?? '';
        const matchLabel = payload?.Label ?? payload?.label ?? '';

        const touched = removeCustomChoiceFromAction(target, actionName, {
          value: matchValue,
          label: matchLabel,
          clearAll,
          mode: String(payload?.Mode ?? payload?.mode ?? '').trim().toLowerCase()
        }, result);

        if (touched) result.didSomething = true;
        break;
      }

      case 'CT_SPAWN_RANDOM_CITIZEN': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const roomId = String(room?.id ?? room?.UniqueID ?? '').trim();
        if (!roomId) break;

        const roomGroup = room?.Group ?? room?.group ?? room?.LocationGroup ?? room?.locationGroup ?? '';

        const npcDefs = Array.isArray(room?.NPCs) ? room.NPCs : Array.isArray(room?.npcs) ? room.npcs : [];
        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;

        const buildEntry = (id, roomWeight = 1) => {
          const char = game.characterMap?.[id] ?? null;
          if (!char) return null;
          const category = normalizeLower(char?.category);
          if (category !== 'r_citizens') return null;

          const currentRoomId = String(char?.currentRoomId ?? char?.CurrentRoom ?? char?.location ?? '').trim();
          if (currentRoomId) return null;

          if (!matchesSpawnArea(char, roomGroup)) return null;

          const charProb = getSpawnWeightValue(
            char?.prob_spawn ?? char?.ProbSpawn ?? char?.probSpawn,
            defaultProbSpawnForId(id)
          );
          return { id, weight: getSpawnWeightValue(roomWeight, 1) * Math.max(1, charProb) };
        };

        // Prefer explicit room NPC table when present; otherwise fall back to any eligible citizen.
        const table = npcDefs.length
          ? npcDefs
              .map(entry => {
                const id = String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim();
                if (!id) return null;
                const roomWeight = entry?.Weight ?? entry?.weight ?? 1;
                return buildEntry(id, roomWeight);
              })
              .filter(Boolean)
          : (Array.isArray(game.characters) ? game.characters : [])
              .map(char => {
                const id = String(char?.id ?? char?.UniqueID ?? '').trim();
                if (!id) return null;
                return buildEntry(id, 1);
              })
              .filter(Boolean);

        if (!table.length) break;

        const picked = weightedPick(table, rng);
        if (!picked) break;

        if (game.placeCharacterInRoom?.(picked.id, roomId)) {
          if (!game.variables || typeof game.variables !== 'object') game.variables = {};
          game.variables.last_spawn_citizen_id = picked.id;
          game.variables.last_spawn_room_id = roomId;
          result.didSomething = true;
        }
        break;
      }

      case 'CT_TRY_SPAWN_EXTRA_CITIZEN': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const roomId = String(room?.id ?? room?.UniqueID ?? '').trim();
        if (!roomId) break;

        const allowEncounters = Boolean(room?.Spawns ?? room?.spawns ?? false);
        if (!allowEncounters) break;

        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;

        // part2 (or text) can be a chance percent (0..100). Default: 35%.
        const rawChance = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        const parsed = Number(rawChance);
        const chance = Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 35;
        if (chance <= 0) break;
        if (chance < 100 && !chancePercent(chance, rng)) break;

        // Reuse the existing citizen spawn logic; it will naturally avoid duplicates because
        // already-spawned citizens have currentRoomId set.
        this.executeCommand({ cmdtype: 'CT_SPAWN_RANDOM_CITIZEN' }, ctx, result);
        break;
      }

      case 'CT_SPAWN_RANDOM_ENEMY_ENCOUNTER': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const roomId = String(room?.id ?? room?.UniqueID ?? '').trim();
        if (!roomId) break;

        const allowEncounters = Boolean(room?.Spawns ?? room?.spawns ?? false);
        if (!allowEncounters) break;
        if (game.spawnState?.pendingEncounter) break;

        const stats = game.player?.Stats ?? {};
        const maxNotoriety = clampInt(stats?.MaxNotoriety ?? 100, { min: 1, max: 1000 });
        const notoriety = clampInt(stats?.Notoriety ?? 0, { min: 0, max: maxNotoriety });
        const roomDisposition = normalizeLower(room?.Type ?? room?.type ?? 'neutral');

        const allCharacters = Array.isArray(game.characters) ? game.characters : [];
        const enemies = allCharacters.filter(char => normalizeLower(char?.category) === 'enemies');
        const spawnableEnemies = enemies.filter(char => !String(char?.currentRoomId ?? char?.CurrentRoom ?? '').trim());
        if (!spawnableEnemies.length) break;

        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;
        const enemy = spawnableEnemies[randomIntInclusive(0, spawnableEnemies.length - 1, rng)];
        const enemyId = String(enemy?.id ?? enemy?.UniqueID ?? '').trim();
        if (!enemyId) break;

        const probSpawn = getSpawnWeightValue(
          enemy?.prob_spawn ?? enemy?.ProbSpawn ?? enemy?.probSpawn,
          defaultProbSpawnForId(enemyId)
        );

        let enemySpawns = false;
        if (notoriety > 90) {
          enemySpawns = true;
        } else {
          const notorietyScale = notoriety <= 45 ? 25 : 50;
          const notorietyBonus = Math.round((notoriety / maxNotoriety) * notorietyScale);
          const roomBonus = roomDisposition === 'hostile' ? 10 : -10;
          const kicker = randomIntInclusive(0, 50, rng);
          const score = Math.round(probSpawn + notorietyBonus + roomBonus + kicker);
          enemySpawns = score > 65;
        }

        if (!enemySpawns) break;
        if (!game.placeCharacterInRoom?.(enemyId, roomId)) break;

        if (game.spawnState) {
          game.spawnState.pendingEncounter = { kind: 'combat', enemyId, roomId };
        }

        if (!game.variables || typeof game.variables !== 'object') game.variables = {};
        game.variables.last_spawn_enemy_id = enemyId;
        game.variables.last_spawn_room_id = roomId;

        const template = interpolateText(String(text ?? ''), { ...ctx, character: enemy });
        if (template) result.texts.push(template);
        result.didSomething = true;
        break;
      }

      case 'CT_TRY_SPICY_EVENT': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const allowEncounters = Boolean(room?.Spawns ?? room?.spawns ?? false);
        if (!allowEncounters) break;

        const stats = game.player?.Stats ?? {};
        const maxNotoriety = clampInt(stats?.MaxNotoriety ?? 100, { min: 1, max: 1000 });
        const notoriety = clampInt(stats?.Notoriety ?? 0, { min: 0, max: maxNotoriety });

        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;

        // Spicy events are reciprocal to combat pressure:
        // lower notoriety => higher chance for spicy beats to happen.
        const ratio = maxNotoriety > 0 ? notoriety / maxNotoriety : 0;
        const chanceBase = 50 - Math.round(ratio * 30); // 50..20
        const kicker = randomIntInclusive(0, 50, rng);
        const score = chanceBase + kicker;
        if (score < 55) break;

        const delta = randomIntInclusive(5, 25, rng);
        const next = clampInt(notoriety + delta, { min: 0, max: maxNotoriety });
        if (game.player?.Stats) game.player.Stats.Notoriety = next;

        if (!game.variables || typeof game.variables !== 'object') game.variables = {};
        game.variables.last_spicy_delta = next - notoriety;
        game.variables.last_spicy_room_id = String(room?.id ?? room?.UniqueID ?? '').trim() || '';

        const template = String(text ?? '').trim();
        if (template) {
          const output = interpolateText(template, ctx);
          if (output) result.texts.push(output);
        } else {
          result.texts.push(`<b>Spicy event:</b> a rumor spreads. Notoriety +${next - notoriety}.`);
        }

        result.didSomething = true;
        break;
      }

      case 'CT_TRY_WITNESS_EVENT': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const stats = game.player?.Stats ?? {};
        const maxNotoriety = clampInt(stats?.MaxNotoriety ?? 100, { min: 1, max: 1000 });
        const notoriety = clampInt(stats?.Notoriety ?? 0, { min: 0, max: maxNotoriety });

        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;

        // Witness events are "story random" beats; make them more likely when notoriety is low.
        const ratio = maxNotoriety > 0 ? notoriety / maxNotoriety : 0;
        const chance = Math.max(5, Math.min(45, Math.round(40 - ratio * 30)));
        if (!chancePercent(chance, rng)) break;

        const lines = [
          'You see a street performer entertaining a small crowd.',
          'A group of teenagers runs past, laughing and shouting.',
          'An elderly woman feeds pigeons on a nearby bench.',
          'Two people argue loudly on the corner before walking away.',
          'A delivery drone buzzes overhead, carrying a package.',
          'You notice graffiti on the wall: "The mind is the ultimate weapon."'
        ];

        const picked = lines[randomIntInclusive(0, lines.length - 1, rng)];

        if (!game.variables || typeof game.variables !== 'object') game.variables = {};
        game.variables.last_witness_line = picked;
        game.variables.last_witness_room_id = String(room?.id ?? room?.UniqueID ?? '').trim() || '';
        game.variables.last_witness_chance = chance;

        const template = String(text ?? '').trim();
        if (template) {
          const output = interpolateText(template, ctx);
          if (output) result.texts.push(output);
        } else {
          result.texts.push(`<b>Witness:</b> ${picked}`);
        }

        result.didSomething = true;
        break;
      }

      case 'CT_PLAYER_SET_CUSTOM_PROPERTY':
      case 'CT_PLAYER_SET_CUSTOM_PROPERTY_JS': {
        const propertyName = interpolateText(String(part2 ?? ''), ctx).trim();
        const operation = interpolateText(String(part3 ?? ''), ctx).trim() || 'Equals';
        const rawValue = interpolateText(part4 === undefined || part4 === null ? '' : String(part4), ctx);
        const current = ctx?.game?.player ? resolveValue(`player.CustomProperties.${propertyName}`, ctx) : undefined;
        const next = applyOperation(current, operation, rawValue);
        if (propertyName) {
          setCustomProperty(ctx?.game?.player, propertyName, next);
          result.didSomething = true;
        }
        break;
      }

      case 'CT_ROOM_SET_CUSTOM_PROPERTY':
      case 'CT_ROOM_SET_CUSTOM_PROPERTY_JS':
      case 'CT_ITEM_SET_CUSTOM_PROPERTY':
      case 'CT_ITEM_SET_CUSTOM_PROPERTY_JS':
      case 'CT_CHAR_SET_CUSTOM_PROPERTY':
      case 'CT_CHAR_SET_CUSTOM_PROPERTY_JS': {
        const rawTarget = interpolateText(String(part2 ?? ''), ctx);
        const [targetIdRaw, propertyNameRaw] = String(rawTarget ?? '').split(':');
        const targetId = String(targetIdRaw ?? '').trim();
        const propertyName = String(propertyNameRaw ?? '').trim();
        const operation = interpolateText(String(part3 ?? ''), ctx).trim() || 'Equals';
        const rawValue = interpolateText(part4 === undefined || part4 === null ? '' : String(part4), ctx);

        let entityType = null;
        if (cmdtype.startsWith('CT_ROOM_')) entityType = 'room';
        if (cmdtype.startsWith('CT_ITEM_')) entityType = 'object';
        if (cmdtype.startsWith('CT_CHAR_')) entityType = 'character';

        let entity = null;
        if (entityType === 'room') {
          if (targetId === '<CurrentRoom>' || !targetId) entity = ctx?.room ?? ctx?.game?.getCurrentRoom?.() ?? null;
          else entity = resolveEntityById(ctx?.game, 'room', targetId, null);
        } else if (entityType === 'object') {
          if (targetId === '<Self>' || !targetId) entity = ctx?.objectBeingActedUpon ?? null;
          else entity = resolveEntityById(ctx?.game, 'object', targetId, null);
        } else if (entityType === 'character') {
          if (!targetId) entity = ctx?.character ?? null;
          else entity = resolveEntityById(ctx?.game, 'character', targetId, null);
        }

        if (!entity || !propertyName) break;

        const current = resolveValue(`${entityType}.CustomProperties.${propertyName}`, { ...ctx, [entityType]: entity, objectBeingActedUpon: entity });
        const next = applyOperation(current, operation, rawValue);
        setCustomProperty(entity, propertyName, next);
        result.didSomething = true;
        break;
      }

      default: {
        result.errors.push(`Unimplemented cmdtype: ${cmdtype}`);
      }
    }
  }
}
