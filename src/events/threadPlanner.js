import { PlannedEvent } from './PlannedEvent.js';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeId(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function normalizeTriggerType(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) return '';
  if (value === 'player_enter_first' || value === 'enter_first' || value === 'first_enter') return 'player_enter_first';
  if (value === 'player_enter' || value === 'enter') return 'player_enter';
  if (value === 'player_leave_first' || value === 'leave_first' || value === 'first_leave') return 'player_leave_first';
  if (value === 'player_leave' || value === 'leave' || value === 'exit') return 'player_leave';
  if (value === 'character_enter' || value === 'npc_enter' || value === 'on_character_enter') return 'character_enter';
  if (value === 'character_leave' || value === 'npc_leave' || value === 'on_character_leave') return 'character_leave';
  if (value === 'manual') return 'manual';
  return value;
}

function triggerToWhen(triggerType) {
  if (triggerType === 'player_enter_first' || triggerType === 'player_enter') return 'enter';
  if (triggerType === 'player_leave_first' || triggerType === 'player_leave') return 'exit';
  if (triggerType === 'character_enter') return 'character_enter';
  if (triggerType === 'character_leave') return 'character_leave';
  if (triggerType === 'manual') return 'manual';
  return triggerType || 'enter';
}

function buildFirstTimeCond(triggerType) {
  if (triggerType === 'player_enter_first') return 'room.bFirstTimeVisited != true';
  if (triggerType === 'player_leave_first') return 'room.bFirstTimeLeft != true';
  return '';
}

function joinCondStr(firstCond, extraCond) {
  const base = normalizeText(firstCond);
  const extra = normalizeText(extraCond);
  if (base && extra) return `${base} && ${extra}`;
  return base || extra || '';
}

function resolveSceneLocation(sceneLoader, sceneId) {
  if (!sceneLoader || !sceneId) return '';
  const scene = sceneLoader.getScene?.(sceneId) ?? null;
  return normalizeText(scene?.Location ?? scene?.location ?? '');
}

function buildEventId(threadId, eventId, index) {
  const parts = [threadId || 'thread', eventId || `event_${index + 1}`].filter(Boolean);
  return normalizeId(parts.join('_'));
}

export function buildThreadPlannedEvents({ threads = [], sceneLoader = null } = {}) {
  const plannedEvents = [];
  const threadIndex = {};
  const sceneToEvent = {};
  const byId = {};

  for (const thread of asArray(threads)) {
    const threadId = normalizeId(thread?.id ?? thread?.name ?? '');
    if (!threadId) continue;
    const events = asArray(thread?.events);
    if (!events.length) continue;

    const eventIds = events.map((evt, idx) => buildEventId(threadId, evt?.id, idx));
    const order = [];

    for (let i = 0; i < events.length; i++) {
      const evt = events[i] ?? {};
      const eventId = eventIds[i];
      const triggerType = normalizeTriggerType(evt?.trigger?.type ?? evt?.triggerType ?? evt?.when ?? evt?.trigger);
      const when = triggerToWhen(triggerType);
      const sceneId = normalizeText(evt?.scene ?? evt?.sceneId ?? evt?.SceneID ?? evt?.Scene);
      const location = normalizeText(evt?.trigger?.room ?? evt?.room ?? evt?.location ?? resolveSceneLocation(sceneLoader, sceneId));
      const target = normalizeText(evt?.trigger?.target ?? evt?.target ?? evt?.trigger?.character ?? evt?.character ?? evt?.characterId);
      const condStr = joinCondStr(buildFirstTimeCond(triggerType), evt?.condStr ?? evt?.CondStr ?? '');

      const reqs = asArray(evt?.reqs ?? evt?.Reqs ?? []);
      if (i > 0) reqs.push(`event:${eventIds[i - 1]}:complete`);

      const actionName = `event_${String(i + 1).padStart(2, '0')}`;
      const action = {
        name: actionName,
        bActive: true,
        InputType: 'None'
      };
      if (sceneId) action.TriggerScene = sceneId;
      if (Array.isArray(evt?.Conditions)) action.Conditions = evt.Conditions;
      if (Array.isArray(evt?.PassCommands)) action.PassCommands = evt.PassCommands;
      if (Array.isArray(evt?.FailCommands)) action.FailCommands = evt.FailCommands;

      const planned = new PlannedEvent({
        id: eventId,
        when,
        target: target || (triggerType.includes('character') ? '' : 'player'),
        location,
        action: actionName,
        priority: Number.isFinite(evt?.priority) ? evt.priority : 200 - i,
        thread_name: threadId,
        threaded: true,
        repeatable: Boolean(evt?.repeatable ?? false),
        completeOnTrigger: Boolean(evt?.completeOnTrigger ?? false),
        suppressCombat: Boolean(evt?.suppressCombat ?? true),
        condStr,
        reqs,
        rewards: evt?.rewards ?? null,
        Actions: [action]
      });

      planned.__threadId = threadId;
      planned.__threadIndex = i;
      planned.__threadNext = eventIds[i + 1] ?? null;
      planned.__sceneId = sceneId;
      planned.__triggerType = triggerType;

      plannedEvents.push(planned);
      byId[eventId] = planned;
      order.push(eventId);

      if (sceneId) sceneToEvent[sceneId] = eventId;
    }

    threadIndex[threadId] = order;
  }

  return { events: plannedEvents, threadIndex, sceneToEvent, byId };
}
