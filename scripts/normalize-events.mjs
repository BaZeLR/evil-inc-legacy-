import fs from 'node:fs/promises';
import path from 'node:path';

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

function pad2(value) {
  return String(value).padStart(2, '0');
}

async function main() {
  const repoRoot = process.cwd();
  const filePath = path.join(repoRoot, 'public', 'DB', 'events.json');

  const raw = await fs.readFile(filePath, 'utf8');
  const doc = JSON.parse(raw);

  if (!doc || typeof doc !== 'object') throw new Error('events.json must be an object');
  if (!Array.isArray(doc.Events)) doc.Events = [];

  const used = new Set();

  for (const evt of doc.Events) {
    if (!evt || typeof evt !== 'object') continue;

    const threadName = normalizeId(evt.thread_name ?? evt.threadName ?? evt.ThreadName ?? 'story');
    const room = shortenToken(evt.location ?? evt.Location ?? 'room') || 'room';
    const target = shortenToken(evt.target ?? evt.Target ?? 'player') || 'player';

    const existing = normalizeId(evt.id ?? evt.Id ?? evt.event_id ?? evt.EventId ?? '');
    if (existing && !used.has(existing)) {
      used.add(existing);
      evt.id = existing;
    } else if (!existing || used.has(existing)) {
      const base = `${room}_${target}_${threadName || 'story'}`;
      evt.id = ensureUniqueId(base, used);
    }

    evt.when = parseWhen(evt.when ?? evt.When ?? evt.trigger ?? evt.Trigger ?? evt.triggerType ?? evt.TriggerType, 'enter');

    const actions = Array.isArray(evt.Actions) ? evt.Actions : Array.isArray(evt.actions) ? evt.actions : [];
    evt.Actions = actions;

    for (let idx = 0; idx < actions.length; idx++) {
      const action = actions[idx];
      if (!action || typeof action !== 'object') continue;
      const name = String(action.name ?? action.Name ?? '').trim();
      if (!name) action.name = `event_${pad2(idx + 1)}`;
    }

    const scene = String(evt.action ?? evt.Action ?? '').trim();
    if (!scene) {
      const firstName = String(actions[0]?.name ?? '').trim();
      evt.action = firstName || 'event_01';
    }
  }

  const formatted = `${JSON.stringify(doc, null, 2)}\n`;
  await fs.writeFile(filePath, formatted, 'utf8');
  console.log(`OK: normalized ${doc.Events.length} event(s) in public/DB/events.json`);
}

main().catch(error => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});

