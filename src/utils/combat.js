import { randomIntInclusive, rollD100 } from './random.js';
import { ragsToHtml } from './ragsMarkup.js';
import { humanizeId } from './humanize.js';

const DEFAULT_ENEMY_PORTRAIT = '/Assets/images/characters/placeholder.png';

function clampInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function clampNumber(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
}

function getStat(character, key, fallback = 0) {
  const stats = character?.Stats ?? null;
  if (!stats) return fallback;

  const direct = stats?.[key];
  if (direct !== undefined && direct !== null && direct !== '') return clampInt(direct, fallback);

  const altMap = {
    Str: ['Attack', 'Dmg'],
    Def: ['Defence', 'Defense'],
    Agl: ['Agility']
  };

  const alts = altMap[key] || [];
  for (const altKey of alts) {
    const value = stats?.[altKey];
    if (value !== undefined && value !== null && value !== '') return clampInt(value, fallback);
  }

  return fallback;
}

function ensureMin1(value) {
  const num = clampInt(value, 1);
  return Math.max(1, num);
}

function rollD6(rng) {
  return randomIntInclusive(1, 6, rng);
}

function computeMitigatedDamage({ attackerPower, defenderDef, defenderArmor = 0, rng }) {
  const attackRoll = rollD6(rng);
  const defenceRoll = rollD6(rng);
  const attackTotal = ensureMin1(attackerPower) + attackRoll;
  const defenceTotal = ensureMin1(defenderDef + defenderArmor) + defenceRoll;
  const damage = Math.max(1, attackTotal - defenceTotal);
  return { damage, attackRoll, defenceRoll, attackTotal, defenceTotal };
}

function slugify(value) {
  const slug = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'item';
}

function pickEncounterLine(value, rng) {
  if (Array.isArray(value)) {
    const candidates = value.map(entry => String(entry ?? '')).map(entry => entry.trim()).filter(Boolean);
    if (!candidates.length) return '';
    const index = randomIntInclusive(0, candidates.length - 1, rng);
    return candidates[index];
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

function normalizeLootItems(rawLoot) {
  const items = Array.isArray(rawLoot) ? rawLoot : rawLoot ? [rawLoot] : [];
  return items.map(item => String(item ?? '').trim()).filter(Boolean);
}

function getWeaponBonus(weaponName) {
  const name = String(weaponName ?? '').trim().toLowerCase();
  if (!name || name === 'fist' || name === 'hands') return 0;
  return 2;
}

function createLogEntry(html, kind = 'system') {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    html: String(html ?? ''),
    kind
  };
}

export function createCombatState({ game, room, enemy, rng }) {
  const enemyName = enemy?.name || enemy?.Charname || enemy?.Name || humanizeId(enemy?.id ?? enemy?.UniqueID) || 'Enemy';
  const enemyPicture = enemy?.media || enemy?.Picture || DEFAULT_ENEMY_PORTRAIT;

  const enemyMaxHp = ensureMin1(enemy?.Stats?.MaxHealth ?? enemy?.Stats?.Health ?? 1);
  const enemyHp = Math.min(enemyMaxHp, ensureMin1(enemy?.Stats?.Health ?? enemyMaxHp));

  const playerMaxHp = ensureMin1(game?.player?.Stats?.MaxHealth ?? game?.player?.Stats?.Health ?? 1);
  const playerHp = Math.min(playerMaxHp, ensureMin1(game?.player?.Stats?.Health ?? playerMaxHp));

  const playerMaxEnergy = Math.max(0, clampInt(game?.player?.Stats?.MaxEnergy ?? game?.player?.Stats?.Energy ?? 0, 0));
  const playerEnergy = Math.max(0, Math.min(playerMaxEnergy, clampInt(game?.player?.Stats?.Energy ?? playerMaxEnergy, 0)));

  const enemyMaxEnergy = Math.max(0, clampInt(enemy?.Stats?.MaxEnergy ?? enemy?.Stats?.Energy ?? 100, 0));
  const enemyEnergy = Math.max(0, Math.min(enemyMaxEnergy, clampInt(enemy?.Stats?.Energy ?? enemyMaxEnergy, 0)));

  const introRaw = pickEncounterLine(enemy?.Encounter?.Intro, rng) || `${enemyName} challenges you!`;
  const introHtml = ragsToHtml(introRaw, { game, room, vars: { 'Foe HP': enemyHp } });

  return {
    id: `${Date.now()}`,
    turn: 0,
    roomId: room?.id ?? room?.UniqueID ?? null,
    roomName: room?.name || room?.Name || humanizeId(room?.id ?? room?.UniqueID) || 'Unknown',
    enemyId: enemy?.id ?? enemy?.UniqueID ?? null,
    enemyName,
    enemyPicture,
    enemyMaxHp,
    enemyHp,
    playerMaxHp,
    playerHp,
    playerMaxEnergy,
    playerEnergy,
    enemyMaxEnergy,
    enemyEnergy,
    log: [createLogEntry(introHtml, 'enemy')],
    winner: null,
    rewards: null,
    lastEffects: []
  };
}

function applyEnergyCost(game, amount) {
  const cost = clampInt(amount, 0);
  if (!cost) return { ok: true, cost: 0, remaining: clampInt(game?.player?.Stats?.Energy, 0) };

  const current = clampInt(game?.player?.Stats?.Energy, 0);
  if (current < cost) return { ok: false, cost, remaining: current };

  const next = Math.max(0, current - cost);
  if (game?.player?.Stats) game.player.Stats.Energy = next;
  return { ok: true, cost, remaining: next };
}

function awardRewards(game, enemy) {
  const exp = clampInt(enemy?.ExpReward, 0);
  const creditsReward = clampInt(enemy?.CreditsReward, 0);
  const lootItems = normalizeLootItems(enemy?.LootItems ?? enemy?.Loot ?? null);

  if (creditsReward) {
    game.player.Credits = clampInt(game.player?.Credits, 0) + creditsReward;
  }

  const levelProgression = exp ? game.gainExperience(exp) : null;

  if (lootItems.length) {
    if (!Array.isArray(game.player.Inventory)) game.player.Inventory = [];
    for (const lootName of lootItems) {
      game.player.Inventory.push({
        UniqueID: `loot_${slugify(lootName)}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        Name: lootName
      });
    }
  }

  return { exp, credits: creditsReward, loot: lootItems, levelProgression };
}

function awardCombatNotoriety(game, enemy, rng) {
  const stats = game?.player?.Stats ?? null;
  if (!stats) return 0;

  const maxNotoriety = Math.max(1, clampInt(stats?.MaxNotoriety ?? 100, 100));
  const notoriety = Math.max(0, Math.min(maxNotoriety, clampInt(stats?.Notoriety ?? 0, 0)));

  // Default: modest notoriety gain per win (can be overridden per enemy).
  const enemyReward = clampInt(enemy?.NotorietyReward ?? enemy?.notorietyReward ?? 0, 0);
  const delta = enemyReward > 0 ? enemyReward : randomIntInclusive(3, 10, rng);

  const next = Math.max(0, Math.min(maxNotoriety, notoriety + delta));
  stats.Notoriety = next;

  if (!game.variables || typeof game.variables !== 'object') game.variables = {};
  game.variables.last_combat_notoriety_delta = next - notoriety;
  game.variables.last_combat_notoriety_room_id = String(game?.player?.CurrentRoom ?? '').trim() || '';
  game.variables.last_combat_notoriety_enemy_id = String(enemy?.id ?? enemy?.UniqueID ?? '').trim() || '';

  return next - notoriety;
}

function resolvePlayerCoreStats(game) {
  const ms = clampInt(game?.player?.Stats?.MS ?? game?.player?.Stats?.Str ?? 1, 1);
  const defence = clampInt(game?.player?.Stats?.Defence ?? 1, 1);
  const agility = clampInt(game?.player?.Stats?.Agility ?? 1, 1);
  return { ms, defence, agility };
}

function resolveEnemyCoreStats(enemy) {
  const str = clampInt(getStat(enemy, 'Str', getStat(enemy, 'Attack', 3)), 1);
  const def = clampInt(getStat(enemy, 'Def', getStat(enemy, 'Defence', 1)), 1);
  const agl = clampInt(getStat(enemy, 'Agl', 1), 1);
  return { str, def, agl };
}

function createContextVars(game, room, enemyHp, extra = {}) {
  return { game, room, vars: { 'Foe HP': enemyHp, ...extra } };
}

export function performCombatTurn({ game, room, combat, enemy, action, rng, playerArmorBonus = 0, playerAttackBonus = 0 }) {
  if (!combat || combat.winner) return combat;
  const turn = clampInt(combat.turn, 0) + 1;

  const effects = [];
  const nextLog = [...(combat.log || [])];

  const player = game?.player ?? null;
  if (!player) return combat;

  const { ms: playerPowerBase, defence: playerDef, agility: playerAgl } = resolvePlayerCoreStats(game);
  const playerPower = playerPowerBase + clampInt(playerAttackBonus, 0);
  const { str: enemyStr, def: enemyDef, agl: enemyAgl } = resolveEnemyCoreStats(enemy);

  const currentEnemyHp = clampInt(combat.enemyHp, 1);
  const currentPlayerHp = clampInt(combat.playerHp, 1);
  const currentPlayerEnergy = clampInt(combat.playerEnergy ?? player?.Stats?.Energy, 0);

  const actionKind = String(action?.kind ?? 'weapon').trim().toLowerCase();
  const actionName = String(action?.name ?? '').trim();

  // Player action
  let enemyHp = currentEnemyHp;
  let playerHp = currentPlayerHp;
  let playerEnergy = currentPlayerEnergy;
  let playerEndedCombat = false;

  if (actionKind === 'run') {
    const baseChance = 50 + (playerAgl - enemyAgl) * 5;
    const chance = Math.max(10, Math.min(90, baseChance));
    const roll = rollD100(rng);
    if (roll <= chance) {
      nextLog.push(createLogEntry(`You run away.`, 'player'));
      playerEndedCombat = true;
      return {
        ...combat,
        turn,
        enemyHp,
        playerHp,
        playerEnergy,
        log: nextLog,
        winner: 'fled',
        lastEffects: effects
      };
    }
    nextLog.push(createLogEntry(`You try to run, but ${combat.enemyName} blocks your escape.`, 'system'));
  } else if (actionKind === 'examine') {
    const desc = enemy?.Description || enemy?.description || '';
    const line = desc ? `<b>${combat.enemyName}:</b> ${String(desc)}` : `You study ${combat.enemyName}.`;
    nextLog.push(createLogEntry(line, 'player'));
  } else if (actionKind === 'ability') {
    const energyCost = clampInt(action?.energyCost ?? 0, 0);
    const energyResult = applyEnergyCost(game, energyCost);
    if (!energyResult.ok) {
      nextLog.push(createLogEntry(`<span style="color:rgba(224,217,197,0.85)">Not enough energy.</span>`, 'system'));
    } else {
      playerEnergy = energyResult.remaining;
      const { damage: playerDamage } = computeMitigatedDamage({
        attackerPower: playerPower,
        defenderDef: enemyDef,
        defenderArmor: 0,
        rng
      });

      enemyHp = Math.max(0, enemyHp - playerDamage);
      effects.push({ type: 'damage', target: 'enemy', amount: playerDamage, critical: false });
      nextLog.push(createLogEntry(`You use <b>${actionName || 'Ability'}</b> for <b>${playerDamage}</b> damage.`, 'player'));
    }
  } else {
    // weapon (default)
    const weaponBonus = clampInt(action?.weaponBonus ?? getWeaponBonus(actionName), 0);
    const { damage: playerDamage } = computeMitigatedDamage({
      attackerPower: playerPower + weaponBonus,
      defenderDef: enemyDef,
      defenderArmor: 0,
      rng
    });

    enemyHp = Math.max(0, enemyHp - playerDamage);
    effects.push({ type: 'damage', target: 'enemy', amount: playerDamage, critical: false });

    const weaponSuffix = actionName ? ` with <b>${actionName}</b>` : '';
    nextLog.push(createLogEntry(`You attack${weaponSuffix} for <b>${playerDamage}</b> damage.`, 'player'));
  }

  // Victory check
  if (enemyHp <= 0) {
    const victoryRaw = pickEncounterLine(enemy?.Encounter?.Victory, rng) || `You have defeated ${combat.enemyName}.`;
    nextLog.push(createLogEntry(ragsToHtml(victoryRaw, createContextVars(game, room, 0, { _enemyDMG: 0 })), 'enemy'));

    const rewards = awardRewards(game, enemy);
    const notorietyDelta = awardCombatNotoriety(game, enemy, rng);
    if (rewards.exp || rewards.credits || rewards.loot?.length) {
      const parts = [];
      if (rewards.exp) parts.push(`+${rewards.exp} XP`);
      if (rewards.credits) parts.push(`+${rewards.credits} Credits`);
      if (rewards.loot?.length) parts.push(`Loot: ${rewards.loot.join(', ')}`);
      nextLog.push(createLogEntry(`Rewards: <b>${parts.join(' | ')}</b>`, 'system'));
    }

    if (notorietyDelta > 0) {
      nextLog.push(createLogEntry(`Notoriety: <b>+${notorietyDelta}</b>`, 'system'));
    }

    return {
      ...combat,
      turn,
      enemyHp,
      playerHp,
      playerEnergy,
      log: nextLog,
      winner: 'player',
      rewards,
      lastEffects: effects
    };
  }

  if (playerEndedCombat) {
    return {
      ...combat,
      turn,
      enemyHp,
      playerHp,
      playerEnergy,
      log: nextLog,
      lastEffects: effects
    };
  }

  // Enemy turn
  const roll = rollD100(rng);
  const isCrit = roll <= 12;
  const isHit = roll <= 70;

  if (!isHit) {
    const missRaw = pickEncounterLine(enemy?.Encounter?.EnemyMiss, rng) || `${combat.enemyName} attacks, but you dodge.`;
    nextLog.push(createLogEntry(ragsToHtml(missRaw, createContextVars(game, room, enemyHp)), 'enemy'));
    return {
      ...combat,
      turn,
      enemyHp,
      playerHp,
      playerEnergy,
      log: nextLog,
      lastEffects: effects
    };
  }

  const { damage: enemyDamageBase } = computeMitigatedDamage({
    attackerPower: enemyStr,
    defenderDef: playerDef,
    defenderArmor: clampInt(playerArmorBonus, 0),
    rng
  });
  const enemyDamage = isCrit ? enemyDamageBase * 2 : enemyDamageBase;

  playerHp = Math.max(0, playerHp - enemyDamage);
  game.player.Stats.Health = playerHp;
  effects.push({ type: 'damage', target: 'player', amount: enemyDamage, critical: isCrit });

  const vars = createContextVars(game, room, enemyHp, { _enemyDMG: enemyDamage });
  const lineRaw = isCrit
    ? pickEncounterLine(enemy?.Encounter?.EnemyCritical, rng) || `${combat.enemyName} lands a critical hit for [v: _enemyDMG] damage!`
    : pickEncounterLine(enemy?.Encounter?.EnemyHit, rng) || `${combat.enemyName} hits you for [v: _enemyDMG] damage.`;
  nextLog.push(createLogEntry(ragsToHtml(lineRaw, vars), 'enemy'));

  if (playerHp <= 0) {
    nextLog.push(createLogEntry(`<b>Game Over.</b>`, 'system'));
    return {
      ...combat,
      turn,
      enemyHp,
      playerHp,
      playerEnergy,
      log: nextLog,
      winner: 'enemy',
      lastEffects: effects
    };
  }

  return {
    ...combat,
    turn,
    enemyHp,
    playerHp,
    playerEnergy,
    log: nextLog,
    lastEffects: effects
  };
}

export function playerAttackTurn({ game, room, combat, enemy, weaponName = null, rng, playerArmorBonus = 0, playerAttackBonus = 0 }) {
  return performCombatTurn({
    game,
    room,
    combat,
    enemy,
    action: { kind: 'weapon', name: weaponName || 'Fist' },
    rng,
    playerArmorBonus,
    playerAttackBonus
  });
}
