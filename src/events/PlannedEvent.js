function clampInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function clampPercent(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, num));
}

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text;
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

function normalizeReqs(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return [value];
}

function normalizeId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function shortenToken(value) {
  const id = normalizeId(value);
  if (!id) return '';
  return id.replace(/_lc_\d+$/i, '').replace(/_\d+$/i, '');
}

function parseWhen(value, fallback = 'enter') {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'enter' || raw === 'on_enter' || raw === 'onenter' || raw === 'room_enter' || raw === 'location_enter') return 'enter';
  if (raw === 'exit' || raw === 'leave' || raw === 'on_exit' || raw === 'onexit' || raw === 'room_exit' || raw === 'location_exit') return 'exit';
  if (
    raw === 'presence' ||
    raw === 'npc_present' ||
    raw === 'npc_presence' ||
    raw === 'on_presence' ||
    raw === 'onpresence' ||
    raw === 'character_present'
  ) {
    return 'presence';
  }
  if (raw === 'character_enter' || raw === 'npc_enter') return 'character_enter';
  if (raw === 'character_leave' || raw === 'npc_leave') return 'character_leave';
  if (raw === 'manual') return 'manual';
  return raw;
}

function ensureUniqueId(base, used) {
  const seed = normalizeId(base);
  if (!seed) return null;
  if (!used.has(seed)) {
    used.add(seed);
    return seed;
  }

  for (let i = 2; i < 1000; i++) {
    const candidate = `${seed}_${String(i).padStart(2, '0')}`;
    if (used.has(candidate)) continue;
    used.add(candidate);
    return candidate;
  }
  return null;
}

export class PlannedEvent {
  constructor(evt, thread_name, threaded) {
    if (Array.isArray(evt)) {
      this.id = '';
      this.target = normalizeText(evt[0]);
      this.day = clampInt(evt[1], 0);
      this.hour = clampInt(evt[2], 0);
      this.evtDay = clampInt(evt[3], 0);
      this.prob = clampPercent(evt[4], 0);
      this.reqs = normalizeReqs(evt[5]);
      this.condStr = normalizeText(evt[6]);
      this.item = normalizeText(evt[7]);
      this.location = normalizeText(evt[8]);
      this.action = normalizeText(evt[9]);
      this.priority = clampInt(evt[10], 0);
      this.thread_name = normalizeText(thread_name);
      this.threaded = normalizeBool(threaded, false);
      this.when = 'enter';
      this.rewards = null;
      this.repeatable = false;
      this.completeOnTrigger = true;
      this.suppressCombat = true;
      this.Actions = [];
      return;
    }

    const obj = evt && typeof evt === 'object' ? evt : {};

    this.id = normalizeText(obj?.id ?? obj?.Id ?? obj?.event_id ?? obj?.EventId ?? '');
    this.target = normalizeText(obj?.target ?? obj?.Target);
    this.day = clampInt(obj?.day ?? obj?.Day, 0);
    this.hour = clampInt(obj?.hour ?? obj?.Hour, 0);
    this.evtDay = clampInt(obj?.evtDay ?? obj?.EvtDay ?? obj?.evt_day ?? obj?.Evt_Day, 0);
    this.prob = clampPercent(obj?.prob ?? obj?.Prob, 0);
    this.reqs = normalizeReqs(obj?.reqs ?? obj?.Reqs ?? obj?.requirements);
    this.condStr = normalizeText(obj?.condStr ?? obj?.CondStr ?? obj?.cond_str);
    this.item = normalizeText(obj?.item ?? obj?.Item);
    this.location = normalizeText(obj?.location ?? obj?.Location);
    this.action = normalizeText(obj?.action ?? obj?.Action);
    this.priority = clampInt(obj?.priority ?? obj?.Priority, 0);

    const resolvedThreadName = thread_name ?? obj?.thread_name ?? obj?.threadName ?? obj?.ThreadName ?? '';
    const resolvedThreaded = threaded ?? obj?.threaded ?? obj?.Threaded ?? false;
    this.thread_name = normalizeText(resolvedThreadName);
    this.threaded = normalizeBool(resolvedThreaded, false);

    this.when = parseWhen(obj?.when ?? obj?.When ?? obj?.trigger ?? obj?.Trigger ?? obj?.triggerType ?? obj?.TriggerType, 'enter');

    this.rewards = obj?.rewards ?? obj?.Rewards ?? null;
    this.repeatable = normalizeBool(obj?.repeatable ?? obj?.Repeatable, false);
    this.completeOnTrigger = normalizeBool(obj?.completeOnTrigger ?? obj?.CompleteOnTrigger, true);
    this.suppressCombat = normalizeBool(obj?.suppressCombat ?? obj?.SuppressCombat, true);

    this.Actions = Array.isArray(obj?.Actions) ? obj.Actions : Array.isArray(obj?.actions) ? obj.actions : [];
  }

  toJSON() {
    return {
      id: this.id,
      when: this.when,
      target: this.target,
      day: this.day,
      hour: this.hour,
      evtDay: this.evtDay,
      prob: this.prob,
      reqs: this.reqs,
      condStr: this.condStr,
      item: this.item,
      location: this.location,
      action: this.action,
      priority: this.priority,
      thread_name: this.thread_name,
      threaded: this.threaded,
      repeatable: this.repeatable,
      completeOnTrigger: this.completeOnTrigger,
      suppressCombat: this.suppressCombat,
      rewards: this.rewards,
      Actions: this.Actions
    };
  }
}

export function parsePlannedEventsDocument(doc) {
  const list = Array.isArray(doc?.Events) ? doc.Events : Array.isArray(doc?.events) ? doc.events : Array.isArray(doc) ? doc : [];
  const used = new Set();
  const events = list.map(entry => new PlannedEvent(entry)).filter(event => Boolean(event?.action || event?.target || event?.location));

  for (const event of events) {
    const existing = normalizeId(event.id);
    if (existing && !used.has(existing)) {
      used.add(existing);
      event.id = existing;
      continue;
    }

    const room = shortenToken(event.location || 'room');
    const target = shortenToken(event.target || 'player');
    const thread = normalizeId(event.thread_name || 'story');
    const base = [room || 'room', target || 'player', thread || 'story'].filter(Boolean).join('_');
    event.id = ensureUniqueId(base, used);
  }

  return events;
}
