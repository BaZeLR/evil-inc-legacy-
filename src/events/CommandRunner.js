import { resolveEntityById } from './valueResolver.js';
import { normalizeAction as normalizeActionModel, normalizeCondition as normalizeConditionModel } from '../models/normalize.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeLower(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isFirstTimeEvent(eventType) {
  return String(eventType ?? '').toLowerCase().includes('first time');
}

function isLeaveEvent(eventType) {
  return String(eventType ?? '').toLowerCase().includes('leave');
}

function normalizeActionKey(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function actionMatchesEvent(action, eventType) {
  const expected = String(eventType ?? '').trim();
  if (!expected || !action) return false;
  const name = String(action.name ?? '').trim();
  const override = String(action.overridename ?? '').trim();
  if (name === expected || override === expected) return true;

  const expectedKey = normalizeActionKey(expected);
  const nameKey = normalizeActionKey(name);
  const overrideKey = normalizeActionKey(override);

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

class CommandIterator {
  constructor(nodes, ctx, eventEngine) {
    this.stack = [{ nodes: asArray(nodes), index: 0 }];
    this.ctx = ctx;
    this.eventEngine = eventEngine;
  }

  next(result) {
    while (this.stack.length) {
      const frame = this.stack[this.stack.length - 1];
      if (!frame || frame.index >= frame.nodes.length) {
        this.stack.pop();
        continue;
      }

      const node = frame.nodes[frame.index++];
      if (!node) continue;

      if (typeof node?.cmdtype === 'string') {
        return node;
      }

      if (Array.isArray(node?.Checks)) {
        const cond = normalizeConditionModel(node);
        if (!cond) continue;
        const passed = this.eventEngine.evaluateCondition(cond, this.ctx, result);
        const branch = passed ? cond.PassCommands : cond.FailCommands;
        if (Array.isArray(branch) && branch.length) {
          this.stack.push({ nodes: branch, index: 0 });
        }
        continue;
      }
    }

    return null;
  }
}

export class CommandRunner {
  constructor(game) {
    this.game = game;
    this.active = null;
  }

  isPaused() {
    return Boolean(this.active?.paused);
  }

  isActive() {
    return Boolean(this.active);
  }

  clear() {
    this.active = null;
  }

  start({ eventType, entityType, entityId, entity, room, input } = {}) {
    const resolvedEntity = resolveEntityById(this.game, entityType, entityId, entity);
    if (!resolvedEntity) return this.game?.eventEngine?.createResult?.() ?? null;

    const ctx = {
      game: this.game,
      entityType,
      entityId: entityId ?? resolvedEntity?.id ?? resolvedEntity?.UniqueID ?? null,
      entity: resolvedEntity,
      room: room ?? (entityType === 'room' ? resolvedEntity : this.game?.getCurrentRoom?.() ?? null),
      objectBeingActedUpon: entityType === 'object' ? resolvedEntity : null,
      character: entityType === 'character' ? resolvedEntity : null,
      input
    };

    const actions = asArray(resolvedEntity?.Actions)
      .map(action => normalizeActionModel(action))
      .filter(Boolean);

    this.active = {
      eventType: String(eventType ?? '').trim(),
      ctx,
      actions,
      actionIndex: 0,
      actionState: null,
      paused: false
    };

    return this.processNext();
  }

  resume() {
    if (!this.active) return null;
    this.active.paused = false;
    return this.processNext();
  }

  processNext() {
    if (!this.active) return null;
    const result = this.game?.eventEngine?.createResult?.() ?? { texts: [], errors: [], paused: false };
    const { eventType, ctx, actions } = this.active;

    while (this.active && !this.active.paused) {
      const action = actions[this.active.actionIndex];
      if (!action) {
        this.clear();
        break;
      }

      if (!action.bActive || !actionMatchesEvent(action, eventType)) {
        this.active.actionIndex += 1;
        this.active.actionState = null;
        continue;
      }

      if (isFirstTimeEvent(eventType)) {
        if (String(ctx?.entityType ?? '').trim() === 'room') {
          const alreadyVisited = isLeaveEvent(eventType) ? ctx?.room?.bFirstTimeLeft : ctx?.room?.bFirstTimeVisited;
          if (alreadyVisited) {
            this.active.actionIndex += 1;
            this.active.actionState = null;
            continue;
          }
        }

        const key = `${ctx?.entityType ?? 'unknown'}:${String(ctx?.entityId ?? '').trim()}:${String(eventType ?? '').trim()}`;
        if (this.game?.eventEngine?.firstTimeEventKeys?.has?.(key)) {
          this.active.actionIndex += 1;
          this.active.actionState = null;
          continue;
        }
        this.game?.eventEngine?.firstTimeEventKeys?.add?.(key);
      }

      if (!this.active.actionState) {
        this.active.actionState = {
          action,
          conditions: asArray(action?.Conditions),
          condIndex: 0,
          requireAll: action?.bConditionFailOnFirst !== false,
          passed: action?.bConditionFailOnFirst !== false ? true : (asArray(action?.Conditions).length === 0),
          phase: 'conditions',
          iterator: null
        };
      }

      const state = this.active.actionState;
      const stepResult = this.stepAction(state, ctx, result);

      if (stepResult === 'paused') {
        if (this.active) this.active.paused = true;
        break;
      }

      if (stepResult === 'done') {
        this.active.actionIndex += 1;
        this.active.actionState = null;
        continue;
      }
    }

    return result;
  }

  stepAction(state, ctx, result) {
    const engine = this.game?.eventEngine;
    if (!engine) return 'done';

    while (true) {
      if (state.phase === 'conditions') {
        if (state.iterator) {
          const cmd = state.iterator.next(result);
          if (cmd) {
            engine.executeCommand(cmd, ctx, result);
            if (result.sceneData || result.startCombatEnemyId) {
              this.clear();
              return 'paused';
            }
            if (result.paused) return 'paused';
            continue;
          }
          state.iterator = null;
          continue;
        }

        if (state.condIndex >= state.conditions.length) {
          state.phase = 'action';
          const branchNodes = state.passed ? asArray(state.action?.PassCommands) : asArray(state.action?.FailCommands);
          state.iterator = new CommandIterator(branchNodes, ctx, engine);
          continue;
        }

        const condNode = state.conditions[state.condIndex];
        state.condIndex += 1;

        const cond = normalizeConditionModel(condNode);
        if (!cond) continue;

        const conditionPassed = engine.evaluateCondition(cond, ctx, result);
        if (state.requireAll && !conditionPassed) state.passed = false;
        if (!state.requireAll && conditionPassed) state.passed = true;

        const branchNodes = conditionPassed ? cond.PassCommands : cond.FailCommands;
        if (Array.isArray(branchNodes) && branchNodes.length) {
          state.iterator = new CommandIterator(branchNodes, ctx, engine);
        }
        continue;
      }

      if (state.phase === 'action') {
        if (state.iterator) {
          const cmd = state.iterator.next(result);
          if (cmd) {
            engine.executeCommand(cmd, ctx, result);
            if (result.sceneData || result.startCombatEnemyId) {
              this.clear();
              return 'paused';
            }
            if (result.paused) return 'paused';
            continue;
          }
          state.iterator = null;
        }

        if (state.passed) {
          const triggerScene = String(state.action?.TriggerScene ?? '').trim();
          const triggerScenes = asArray(state.action?.TriggerScenes)
            .map(id => String(id ?? '').trim())
            .filter(Boolean);
          const sceneId = triggerScene || engine.pickNextUncompletedScene(triggerScenes, ctx, result);
          if (sceneId) {
            engine.triggerScene(sceneId, ctx, result);
            if (result.sceneData || result.startCombatEnemyId) {
              this.clear();
              return 'paused';
            }
            if (result.paused) return 'paused';
          }
        }

        return 'done';
      }

      return 'done';
    }
  }
}
