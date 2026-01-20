import { applyOperation, coerceLiteral, interpolateText, resolveEntityById, resolveValue, setCustomProperty, setValue } from './valueResolver.js';
import { chancePercent, cryptoRng, randomIntInclusive } from '../utils/random.js';
import { compareOp } from '../utils/compare.js';

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
    text: getField(command, ['CommandText', 'text', 'run']),
    part2: getField(command, ['CommandPart2', 'part2']),
    part3: getField(command, ['CommandPart3', 'part3']),
    part4: getField(command, ['CommandPart4', 'part4']),
    name: getField(command, ['CommandName', 'name'])
  };
}

function isFirstTimeEvent(eventType) {
  return String(eventType ?? '').toLowerCase().includes('first time');
}

function clampInt(value, { min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, Math.trunc(num)));
}

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
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
  if (!isRecord(action)) return null;

  if (typeof action.run === 'string' && !Array.isArray(action.PassCommands)) {
    return {
      name: action.name ?? 'Unnamed Action',
      bActive: action.bActive !== false,
      bConditionFailOnFirst: true,
      InputType: action.InputType ?? 'None',
      Tooltip: action.Tooltip ?? '',
      Conditions: [],
      PassCommands: [{ cmdtype: 'CT_DISPLAYTEXT', CommandText: action.run }],
      FailCommands: []
    };
  }

  return {
    name: action.name ?? 'Unnamed Action',
    bActive: action.bActive !== false,
    overridename: action.overridename ?? '',
    actionparent: action.actionparent ?? null,
    bConditionFailOnFirst: action.bConditionFailOnFirst !== false,
    InputType: action.InputType ?? 'None',
    CustomChoiceTitle: action.CustomChoiceTitle ?? '',
    Tooltip: action.Tooltip ?? '',
    Conditions: asArray(action.Conditions),
    PassCommands: asArray(action.PassCommands),
    FailCommands: asArray(action.FailCommands),
    CustomChoices: asArray(action.CustomChoices),
    EnhInputData: action.EnhInputData ?? null
  };
}

function actionMatchesEvent(action, eventType) {
  const expected = String(eventType ?? '').trim();
  if (!expected) return false;
  if (!action) return false;
  const name = String(action.name ?? '').trim();
  const override = String(action.overridename ?? '').trim();
  return name === expected || override === expected;
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
  }

  normalizeCondition(node) {
    if (!isRecord(node)) return null;
    return {
      conditionname: node.conditionname ?? node.ConditionName ?? '',
      Checks: asArray(node.Checks),
      PassCommands: asArray(node.PassCommands),
      FailCommands: asArray(node.FailCommands)
    };
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
    const cmdtype = String(command?.cmdtype ?? '').trim();
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

      case 'CT_SETVARIABLE': {
        const variableRef = interpolateText(String(part2 ?? ''), ctx).trim();
        const operation = interpolateText(String(part3 ?? ''), ctx).trim() || 'Equals';
        const rawValue = interpolateText(part4 === undefined || part4 === null ? '' : String(part4), ctx);

        const current = resolveValue(variableRef, ctx);
        const next = applyOperation(current, operation, rawValue);
        if (variableRef) {
          setValue(variableRef, next, ctx);
          result.didSomething = true;
        }
        break;
      }

      case 'CT_DISPLAYPICTURE': {
        const media = interpolateText(String(part2 ?? text ?? ''), ctx).trim();
        if (media) {
          result.media = media;
          result.didSomething = true;
        }
        break;
      }

      case 'CT_PAUSEGAME': {
        result.paused = true;
        result.didSomething = true;
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

      case 'CT_SPAWN_RANDOM_CITIZEN': {
        const game = ctx?.game ?? null;
        const room = ctx?.room ?? game?.getCurrentRoom?.() ?? null;
        if (!game || !room) break;

        const roomId = String(room?.id ?? room?.UniqueID ?? '').trim();
        if (!roomId) break;

        const npcDefs = Array.isArray(room?.NPCs) ? room.NPCs : Array.isArray(room?.npcs) ? room.npcs : [];
        if (!npcDefs.length) break;

        const rng = typeof ctx?.rng === 'function' ? ctx.rng : cryptoRng;
        const table = npcDefs
          .map(entry => {
            const id = String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim();
            if (!id) return null;
            const char = game.characterMap?.[id] ?? null;
            if (!char) return null;
            const category = normalizeLower(char?.category);
            if (category !== 'r_citizens') return null;

            const roomWeight = getSpawnWeightValue(entry?.Weight ?? entry?.weight, 1);
            const charProb = getSpawnWeightValue(char?.prob_spawn ?? char?.ProbSpawn ?? char?.probSpawn, defaultProbSpawnForId(id));
            return { id, weight: roomWeight * Math.max(1, charProb) };
          })
          .filter(Boolean);

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
        const chanceBase = Math.max(0, Math.round(50 - (notoriety / maxNotoriety) * 45));
        const kicker = randomIntInclusive(0, 15, rng);
        const score = chanceBase + kicker;
        if (score < 55) break;

        const delta = randomIntInclusive(2, 6, rng);
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
