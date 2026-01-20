import { chancePercent, cryptoRng } from '../utils/random.js';
import { getGameClockFromStats } from '../utils/gameTime.js';
import { evaluateCondStr } from './condStr.js';

function clampInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeStatus(value, fallback = 'inactive') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'inactive') return 'inactive';
  if (raw === 'active') return 'active';
  if (raw === 'blocked') return 'blocked';
  if (raw === 'complete' || raw === 'completed') return 'complete';
  if (raw === 'aborted' || raw === 'abort') return 'aborted';
  return raw;
}

function normalizeWhen(value, fallback = 'enter') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'enter') return 'enter';
  if (raw === 'exit') return 'exit';
  if (raw === 'presence' || raw === 'npc_present') return 'presence';
  return raw;
}

function normalizeBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (text === 'true' || text === 'yes' || text === 'y') return true;
    if (text === 'false' || text === 'no' || text === 'n') return false;
  }
  return fallback;
}

function ensureSaveEventsContainer(save) {
  if (!save || typeof save !== 'object') return null;
  if (!save.events || typeof save.events !== 'object') save.events = {};
  if (!save.events.threads || typeof save.events.threads !== 'object') save.events.threads = {};
  if (!save.events.states || typeof save.events.states !== 'object') save.events.states = {};
  if (!save.events.flags || typeof save.events.flags !== 'object') save.events.flags = {};
  return save.events;
}

function normalizeRewards(rewardsRaw) {
  const rewards = rewardsRaw && typeof rewardsRaw === 'object' ? rewardsRaw : null;
  if (!rewards) return null;

  const exp = clampInt(rewards.exp ?? rewards.Exp ?? 0, 0);
  const credits = clampInt(rewards.credits ?? rewards.Credits ?? 0, 0);
  const notoriety = clampInt(rewards.notoriety ?? rewards.Notoriety ?? 0, 0);
  const items = Array.isArray(rewards.items ?? rewards.Items) ? rewards.items ?? rewards.Items : [];
  const loot = Array.isArray(rewards.loot ?? rewards.Loot) ? rewards.loot ?? rewards.Loot : [];
  const flagsRaw = rewards.flags ?? rewards.Flags ?? null;
  const flags = flagsRaw && typeof flagsRaw === 'object' ? flagsRaw : null;

  return { exp, credits, notoriety, items, loot, flags };
}

function normalizeItemGrant(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return { id: entry.trim(), quantity: 1 };
  if (typeof entry !== 'object') return null;

  const id = String(entry.UniqueID ?? entry.id ?? entry.Item ?? entry.item ?? '').trim();
  if (!id) return null;
  const quantity = Math.max(1, clampInt(entry.Quantity ?? entry.quantity ?? entry.Qty ?? 1, 1));
  return { id, quantity };
}

export class EventController {
  constructor(game) {
    this.game = game;
  }

  syncFlagsToVariables() {
    const save = this.game?.save ?? null;
    const container = ensureSaveEventsContainer(save);
    if (!container) return;
    if (!this.game.variables || typeof this.game.variables !== 'object') this.game.variables = {};

    for (const [key, value] of Object.entries(container.flags || {})) {
      this.game.variables[key] = value;
    }
  }

  getThreadStatus(threadName) {
    const thread = normalizeText(threadName);
    if (!thread) return 'active';
    const container = ensureSaveEventsContainer(this.game?.save);
    const state = container?.threads?.[thread] ?? null;
    const status = normalizeStatus(state?.status ?? state?.Status ?? 'active', 'active');
    return status;
  }

  setThreadStatus(threadName, status) {
    const thread = normalizeText(threadName);
    if (!thread) return;
    const container = ensureSaveEventsContainer(this.game?.save);
    if (!container) return;
    container.threads[thread] = { ...(container.threads[thread] || {}), status: normalizeStatus(status, 'active') };
  }

  getEventStatus(eventId) {
    const id = normalizeText(eventId);
    if (!id) return 'inactive';
    const container = ensureSaveEventsContainer(this.game?.save);
    const state = container?.states?.[id] ?? null;
    return normalizeStatus(state?.status ?? state?.Status ?? 'inactive', 'inactive');
  }

  setEventStatus(eventId, status) {
    const id = normalizeText(eventId);
    if (!id) return;
    const container = ensureSaveEventsContainer(this.game?.save);
    if (!container) return;
    container.states[id] = { ...(container.states[id] || {}), status: normalizeStatus(status, 'inactive') };
  }

  markEventTriggered(eventId) {
    const id = normalizeText(eventId);
    if (!id) return;
    const container = ensureSaveEventsContainer(this.game?.save);
    if (!container) return;
    const prev = container.states[id] && typeof container.states[id] === 'object' ? container.states[id] : {};
    const triggers = Math.max(0, clampInt(prev.triggers ?? 0, 0)) + 1;
    container.states[id] = { ...prev, status: normalizeStatus(prev.status, 'active'), triggers, lastTriggeredAt: new Date().toISOString() };
  }

  setFlag(flagName, value) {
    const name = normalizeText(flagName);
    if (!name) return;
    const container = ensureSaveEventsContainer(this.game?.save);
    if (!container) return;
    const boolValue = Boolean(value);
    container.flags[name] = boolValue;
    if (!this.game.variables || typeof this.game.variables !== 'object') this.game.variables = {};
    this.game.variables[name] = boolValue;
  }

  getFlag(flagName) {
    const name = normalizeText(flagName);
    if (!name) return false;
    const container = ensureSaveEventsContainer(this.game?.save);
    const stored = container?.flags?.[name];
    if (stored !== undefined) return Boolean(stored);
    return Boolean(this.game?.variables?.[name]);
  }

  evaluateReqs(reqs) {
    const list = Array.isArray(reqs) ? reqs : reqs ? [reqs] : [];
    for (const raw of list) {
      const token = String(raw ?? '').trim();
      if (!token) continue;

      const parts = token.split(':').map(p => p.trim()).filter(Boolean);
      if (!parts.length) continue;

      if (parts[0] === 'flag' && parts[1]) {
        if (!this.getFlag(parts[1])) return false;
        continue;
      }
      if (parts[0] === 'not_flag' && parts[1]) {
        if (this.getFlag(parts[1])) return false;
        continue;
      }
      if (parts[0] === 'event' && parts[1] && parts[2]) {
        const status = this.getEventStatus(parts[1]);
        if (status !== normalizeStatus(parts[2], parts[2])) return false;
        continue;
      }
      if (parts[0] === 'thread' && parts[1] && parts[2]) {
        const status = this.getThreadStatus(parts[1]);
        if (status !== normalizeStatus(parts[2], parts[2])) return false;
        continue;
      }

      // Unknown token: treat as a flag name.
      if (!this.getFlag(token)) return false;
    }
    return true;
  }

  playerHasItem(itemId) {
    const id = normalizeText(itemId);
    if (!id) return true;
    const inv = Array.isArray(this.game?.player?.Inventory) ? this.game.player.Inventory : [];
    return inv.some(entry => String(entry?.UniqueID ?? entry?.id ?? entry?.Name ?? '').trim() === id);
  }

  addInventoryItem(itemId, quantity = 1) {
    const id = normalizeText(itemId);
    if (!id) return false;
    if (!this.game?.player) return false;

    if (!Array.isArray(this.game.player.Inventory)) this.game.player.Inventory = [];
    const inventory = this.game.player.Inventory;

    const obj = this.game?.objectMap?.[id] ?? null;
    const name = obj?.Name || obj?.name || id;
    const stackable = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase() === 'consumable';
    const addQty = Math.max(1, clampInt(quantity, 1));

    const index = inventory.findIndex(entry => String(entry?.UniqueID ?? entry?.id ?? entry?.Name ?? '').trim() === id);
    if (index >= 0) {
      if (!stackable) return false;
      const currentQty = Math.max(1, clampInt(inventory[index]?.Quantity ?? inventory[index]?.Qty ?? inventory[index]?.Count ?? 1, 1));
      inventory[index] = { ...inventory[index], UniqueID: id, Name: inventory[index]?.Name || name, Quantity: currentQty + addQty };
      return true;
    }

    const nextEntry = { UniqueID: id, Name: name };
    if (stackable) nextEntry.Quantity = addQty;
    inventory.push(nextEntry);
    return true;
  }

  applyRewards(rewardsRaw) {
    const rewards = normalizeRewards(rewardsRaw);
    if (!rewards) return { exp: 0, credits: 0, items: [], loot: [], flags: null };

    if (rewards.credits) {
      const current = clampInt(this.game?.player?.Credits ?? 0, 0);
      this.game.player.Credits = current + rewards.credits;
    }

    if (rewards.notoriety && this.game?.player?.Stats) {
      const stats = this.game.player.Stats;
      const current = clampInt(stats.Notoriety ?? 0, 0);
      const max = Math.max(1, clampInt(stats.MaxNotoriety ?? 100, 100));
      stats.Notoriety = Math.max(0, Math.min(max, current + rewards.notoriety));
    }

    const grantedItems = [];
    for (const entry of rewards.items) {
      const item = normalizeItemGrant(entry);
      if (!item) continue;
      const ok = this.addInventoryItem(item.id, item.quantity);
      if (ok) grantedItems.push(item);
    }

    const grantedLoot = [];
    if (Array.isArray(rewards.loot) && rewards.loot.length) {
      if (!Array.isArray(this.game.player.Inventory)) this.game.player.Inventory = [];
      for (const lootName of rewards.loot) {
        const label = normalizeText(lootName);
        if (!label) continue;
        grantedLoot.push(label);
        this.game.player.Inventory.push({
          UniqueID: `loot_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          Name: label
        });
      }
    }

    if (rewards.flags) {
      for (const [key, value] of Object.entries(rewards.flags)) {
        this.setFlag(key, value);
      }
    }

    const levelProgression = rewards.exp ? this.game.gainExperience(rewards.exp) : null;
    return { ...rewards, items: grantedItems, loot: grantedLoot, levelProgression };
  }

  pickEligibleEvent({ when, roomId, fromRoomId, toRoomId, rng = cryptoRng } = {}) {
    const triggerWhen = normalizeWhen(when, 'enter');
    const room = normalizeText(roomId);
    if (!room) return null;

    const clock = getGameClockFromStats(this.game?.player?.Stats);
    const currentDay = clampInt(clock.day, 1);
    const currentHour = Math.floor(clampInt(clock.minutes, 0) / 60);

    const ctx = {
      game: this.game,
      room: triggerWhen === 'exit' ? this.game?.roomMap?.[fromRoomId] ?? this.game?.roomMap?.[room] ?? null : this.game?.roomMap?.[room] ?? null,
      vars: this.game?.variables ?? {}
    };

    const candidates = (Array.isArray(this.game?.plannedEvents) ? this.game.plannedEvents : []).filter(evt => {
      const evtWhen = normalizeWhen(evt?.when ?? evt?.When ?? evt?.trigger ?? evt?.Trigger, 'enter');
      if (evtWhen !== triggerWhen) return false;

      const thread = normalizeText(evt?.thread_name ?? evt?.threadName ?? '');
      if (thread && this.getThreadStatus(thread) === 'closed') return false;

      const id = normalizeText(evt?.id);
      if (!id) return false;

      const status = this.getEventStatus(id);
      const repeatable = normalizeBool(evt?.repeatable, false);
      if (!repeatable && (status === 'complete' || status === 'aborted')) return false;

      const location = normalizeText(evt?.location ?? evt?.Location ?? '');
      if (location && location !== '*' && location !== room) return false;

      const minDay = clampInt(evt?.day ?? 0, 0);
      const fixedDay = clampInt(evt?.evtDay ?? 0, 0);
      if (fixedDay > 0 && currentDay !== fixedDay) return false;
      if (minDay > 0 && currentDay < minDay) return false;

      const minHour = clampInt(evt?.hour ?? 0, 0);
      if (minHour > 0 && currentHour < minHour) return false;

      const item = normalizeText(evt?.item ?? '');
      if (item && !this.playerHasItem(item)) return false;

      const reqsOk = this.evaluateReqs(evt?.reqs);
      if (!reqsOk) return false;

      const condOk = evaluateCondStr(evt?.condStr, ctx);
      if (!condOk) return false;

      if (triggerWhen === 'presence') {
        const target = normalizeText(evt?.target ?? '');
        if (target) {
          const char = this.game?.characterMap?.[target] ?? null;
          const charRoom = String(char?.currentRoomId ?? char?.CurrentRoom ?? '').trim();
          if (charRoom !== room) return false;
        }
      }

      const prob = clampInt(evt?.prob ?? 100, 100);
      if (prob <= 0) return false;
      if (prob < 100 && !chancePercent(prob, rng)) return false;

      return true;
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const pa = clampInt(a?.priority ?? 0, 0);
      const pb = clampInt(b?.priority ?? 0, 0);
      return pb - pa;
    });

    return candidates[0] || null;
  }

  triggerEvent(event, { when, roomId, fromRoomId, toRoomId, rng = cryptoRng } = {}) {
    const evt = event && typeof event === 'object' ? event : null;
    if (!evt) return { triggered: false, texts: [], media: null, suppressCombat: false, rewards: null };

    const id = normalizeText(evt?.id);
    if (!id) return { triggered: false, texts: [], media: null, suppressCombat: false, rewards: null };

    const room = this.game?.roomMap?.[roomId] ?? null;
    const ctxRoom = room ?? this.game?.getCurrentRoom?.() ?? null;

    let result = null;
    const actionName = normalizeText(evt?.action);
    const hasActions = Array.isArray(evt?.Actions) && evt.Actions.length > 0;

    if (actionName && hasActions && this.game?.eventEngine) {
      result = this.game.eventEngine.runEvent(actionName, {
        entityType: 'event',
        entityId: id,
        entity: evt,
        room: ctxRoom,
        rng
      });
    }

    const texts = Array.isArray(result?.texts) ? [...result.texts] : [];
    const media = result?.media || null;

    const suppressCombat = normalizeBool(evt?.suppressCombat, true);
    const hasRewards = evt?.rewards && typeof evt.rewards === 'object' && Object.keys(evt.rewards).length > 0;
    const didSomething = Boolean(result?.didSomething || media || result?.paused || (Array.isArray(result?.errors) && result.errors.length) || hasRewards);
    if (!didSomething) return { triggered: false, texts: [], media: null, suppressCombat: false, rewards: null };

    const thread = normalizeText(evt?.thread_name ?? '');
    if (thread) this.setThreadStatus(thread, 'active');

    this.setEventStatus(id, 'active');
    this.markEventTriggered(id);

    let rewardResult = null;
    const completeOnTrigger = normalizeBool(evt?.completeOnTrigger, true);
    if (completeOnTrigger) {
      this.setEventStatus(id, 'complete');
      rewardResult = this.applyRewards(evt?.rewards ?? evt?.Rewards ?? null);

      const parts = [];
      const exp = clampInt(rewardResult?.exp ?? 0, 0);
      const credits = clampInt(rewardResult?.credits ?? 0, 0);
      const notoriety = clampInt(rewardResult?.notoriety ?? 0, 0);
      const items = Array.isArray(rewardResult?.items) ? rewardResult.items : [];
      const loot = Array.isArray(rewardResult?.loot) ? rewardResult.loot : [];
      if (exp) parts.push(`+${exp} XP`);
      if (credits) parts.push(`+${credits} Credits`);
      if (notoriety) parts.push(`Notoriety +${notoriety}`);
      if (items.length) parts.push(`Items: ${items.map(entry => entry?.id).filter(Boolean).join(', ')}`);
      if (loot.length) parts.push(`Loot: ${loot.join(', ')}`);
      if (parts.length) texts.push(`Rewards: <b>${parts.join(' | ')}</b>`);
    }

    return { triggered: true, eventId: id, thread, texts, media, suppressCombat, rewards: rewardResult };
  }

  run({ when, roomId, fromRoomId, toRoomId, rng = cryptoRng } = {}) {
    const evt = this.pickEligibleEvent({ when, roomId, fromRoomId, toRoomId, rng });
    if (!evt) return { triggered: false, texts: [], media: null, suppressCombat: false, eventId: null };
    return this.triggerEvent(evt, { when, roomId, fromRoomId, toRoomId, rng });
  }
}
