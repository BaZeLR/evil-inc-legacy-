const DEFAULT_TURN_INTERVAL = 1;
const DEFAULT_TIME_INTERVAL = 60;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTimerId(timer, fallback) {
  const id = String(timer?.UniqueID ?? timer?.id ?? timer?.Name ?? timer?.name ?? fallback ?? '').trim();
  return id || null;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function isTimerEnabled(timer) {
  if (timer?.Active === false || timer?.active === false) return false;
  if (timer?.Enabled === false || timer?.enabled === false) return false;
  if (timer?.Disabled === true || timer?.disabled === true) return false;
  return true;
}

function getTimerType(timer) {
  const raw = String(timer?.Type ?? timer?.type ?? timer?.TimerType ?? '').trim().toLowerCase();
  if (raw === 'live' || raw === 'realtime') return 'live';
  if (raw === 'time' || raw === 'minutes') return 'time';
  return 'turn';
}

export class TimerManager {
  constructor(game) {
    this.game = game;
    this.timers = [];
    this.timerMap = {};
    this.turnCount = 0;
    this.liveIntervals = new Map();
  }

  setTimers(timers) {
    this.timers = asArray(timers);
    this.timerMap = {};
    this.stopLiveTimers();

    for (let i = 0; i < this.timers.length; i++) {
      const timer = this.timers[i];
      const id = normalizeTimerId(timer, `timer_${i + 1}`);
      if (!id) continue;
      timer.UniqueID = id;
      if (!timer.__state) timer.__state = {};
      this.timerMap[id] = timer;
    }

    this.turnCount = toNumber(this.game?.variables?.turn_count, 0);
    this.startLiveTimers();
  }

  startLiveTimers() {
    for (const timer of this.timers) {
      if (!isTimerEnabled(timer)) continue;
      if (getTimerType(timer) !== 'live') continue;
      const intervalMs = toNumber(timer?.IntervalMs ?? timer?.IntervalMilliseconds, 1000);
      if (intervalMs <= 0) continue;
      const id = timer.UniqueID;
      if (this.liveIntervals.has(id)) continue;
      const handle = setInterval(() => {
        this.runTimerActions(timer);
      }, intervalMs);
      this.liveIntervals.set(id, handle);
    }
  }

  stopLiveTimers() {
    for (const handle of this.liveIntervals.values()) {
      clearInterval(handle);
    }
    this.liveIntervals.clear();
  }

  advanceTurn(result) {
    this.turnCount += 1;
    if (this.game?.variables) this.game.variables.turn_count = this.turnCount;
    const engine = this.game?.eventEngine;
    const output =
      result ||
      engine?.createResult?.() || {
        texts: [],
        media: null,
        startCombatEnemyId: null,
        sceneData: null,
        paused: false,
        errors: [],
        didSomething: false
      };
    let didRun = false;

    for (const timer of this.timers) {
      if (!isTimerEnabled(timer)) continue;
      if (getTimerType(timer) !== 'turn') continue;
      const interval = toNumber(timer?.IntervalTurns ?? timer?.Interval ?? timer?.IntervalCount, DEFAULT_TURN_INTERVAL);
      const startAt = toNumber(timer?.StartAtTurn ?? timer?.StartAt ?? 0, 0);
      if (this.turnCount < startAt) continue;
      const state = timer.__state ?? (timer.__state = {});
      const nextTurn = toNumber(state.nextTurn ?? startAt, startAt);
      if (this.turnCount < nextTurn) continue;
      didRun = true;
      this.runTimerActions(timer, output);
      state.nextTurn = this.turnCount + Math.max(1, interval);
    }
    return didRun || result ? output : null;
  }

  advanceTime(minutes, result) {
    const delta = toNumber(minutes, 0);
    if (!delta) return result || null;
    const now = toNumber(this.game?.player?.Stats?.GameTimeMinutes, 0);
    const engine = this.game?.eventEngine;
    const output =
      result ||
      engine?.createResult?.() || {
        texts: [],
        media: null,
        startCombatEnemyId: null,
        sceneData: null,
        paused: false,
        errors: [],
        didSomething: false
      };
    let didRun = false;

    for (const timer of this.timers) {
      if (!isTimerEnabled(timer)) continue;
      if (getTimerType(timer) !== 'time') continue;
      const interval = toNumber(timer?.IntervalMinutes ?? timer?.Interval ?? DEFAULT_TIME_INTERVAL, DEFAULT_TIME_INTERVAL);
      const startAt = toNumber(timer?.StartAtMinute ?? timer?.StartAt ?? 0, 0);
      const state = timer.__state ?? (timer.__state = {});
      const nextMinute = toNumber(state.nextMinute ?? startAt, startAt);
      if (now < nextMinute) continue;
      didRun = true;
      this.runTimerActions(timer, output);
      state.nextMinute = now + Math.max(1, interval);
    }
    return didRun || result ? output : null;
  }

  runTimerActions(timer, result) {
    const actions = asArray(timer?.Actions);
    if (!actions.length) return result || null;
    const engine = this.game?.eventEngine;
    if (!engine) return result || null;
    const output =
      result ||
      engine.createResult?.() || {
        texts: [],
        media: null,
        startCombatEnemyId: null,
        sceneData: null,
        paused: false,
        errors: [],
        didSomething: false
      };
    const ctx = {
      game: this.game,
      entityType: 'timer',
      entityId: timer.UniqueID,
      entity: timer,
      timer,
      room: this.game?.getCurrentRoom?.() ?? null
    };
    for (const action of actions) {
      engine.executeAction(action, ctx, output);
    }
    return output;
  }
}
