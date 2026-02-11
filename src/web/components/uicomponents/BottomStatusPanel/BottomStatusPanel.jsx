import React from 'react';
import { humanizeId } from '../../../../utils/humanize.js';
import '../cornerPanel.css';
import './BottomStatusPanel.css';

export function BottomStatusPanel({
  combat,
  interactionLocked,
  locationName,
  playerPortraitUrl,
  playerEquippedWeaponName,
  playerEquippedWeapons,
  playerAbilities,
  combatWeapons,
  combatAbilities,
  combatEnergy,
  onWait,
  onExamineRoom,
  onShowAbility,
  onShowWeapon,
  onCombatWeapon,
  onCombatAbility,
  onInventoryAction,
  onExamineInventoryItem,
  onNpcAction,
  onObjectAction,
  exits,
  onNavigate,
  onOpenPlayer,
  inspectTarget,
  npcs,
  objects,
  inventoryItems,
  credits,
  hasInventoryItem,
  canTakeObject,
  getVendorShopEntriesForNpc,
  getVendorShopEntriesForObject,
  onInspect,
  onTalk,
  onShop,
  onExamineObject,
  onTakeObject,
  onOpenInventory,
  onOpenActionsDrawer,
  selectedInventoryId,
  setSelectedInventoryId,
  menuContextBase,
  shouldShowMenuEntry,
  isContainerObject,
  resolveContainerOpenState,
  canEquipObject,
  equippedInventory
}) {
  const targetType = inspectTarget?.type ?? null;
  const targetId = inspectTarget?.id ?? null;
  const interactionLockedResolved = Boolean(interactionLocked);

  const [playerMenuOpen, setPlayerMenuOpen] = React.useState(false);
  const [openInventoryMenuId, setOpenInventoryMenuId] = React.useState(null);
  const [openObjectMenuId, setOpenObjectMenuId] = React.useState(null);
  const [openNpcMenuId, setOpenNpcMenuId] = React.useState(null);

  const togglePlayerMenu = React.useCallback(() => {
    if (interactionLockedResolved) return;
    setPlayerMenuOpen(prev => !prev);
  }, [interactionLockedResolved]);

  const toggleInventoryMenu = React.useCallback(
    itemId => {
      if (interactionLockedResolved) return;
      setOpenInventoryMenuId(prev => (String(prev || '') === String(itemId || '') ? null : itemId));
    },
    [interactionLockedResolved]
  );

  const toggleObjectMenu = React.useCallback(
    objectId => {
      if (interactionLockedResolved) return;
      setOpenObjectMenuId(prev => (String(prev || '') === String(objectId || '') ? null : objectId));
    },
    [interactionLockedResolved]
  );

  const toggleNpcMenu = React.useCallback(
    npcId => {
      if (interactionLockedResolved) return;
      setOpenNpcMenuId(prev => (String(prev || '') === String(npcId || '') ? null : npcId));
    },
    [interactionLockedResolved]
  );

  const safeNpcs = Array.isArray(npcs) ? npcs : [];
  const safeObjects = Array.isArray(objects) ? objects : [];
  const safeInventory = Array.isArray(inventoryItems) ? inventoryItems : [];
  const safeExits = Array.isArray(exits) ? exits : [];
  const safeAbilities = Array.isArray(playerAbilities) ? playerAbilities : [];
  const safeWeapons = Array.isArray(playerEquippedWeapons) ? playerEquippedWeapons : [];
  const safeCombatWeapons = Array.isArray(combatWeapons) ? combatWeapons : [];
  const safeCombatAbilities = Array.isArray(combatAbilities) ? combatAbilities : [];
  const combatEnergyValue = typeof combatEnergy === 'number' ? combatEnergy : null;
  const combatResolved = Boolean(combat);
  const combatLocked = Boolean(combat?.winner);

  const isVideoSrc = src => {
    const value = String(src ?? '').trim().toLowerCase();
    return value.endsWith('.mp4') || value.endsWith('.webm') || value.endsWith('.ogg');
  };

  const normalizeMenuKey = label =>
    String(label ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[\u00A0]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const isActionExplicitlyInactive = (entity, actionLabel) => {
    const label = String(actionLabel ?? '').trim();
    if (!label) return false;
    const actions = Array.isArray(entity?.Actions) ? entity.Actions : [];
    for (const act of actions) {
      const name = String(act?.name ?? '').trim();
      const override = String(act?.overridename ?? '').trim();
      if (name === label || override === label) return act?.bActive === false;
    }
    return false;
  };

  const buildMenuContext = (entity, kind) => {
    if (!shouldShowMenuEntry || !menuContextBase) return null;
    const base = menuContextBase || {};
    const ctx = { ...base, entity };
    if (kind === 'character') ctx.character = entity;
    if (kind === 'object') ctx.objectBeingActedUpon = entity;
    return ctx;
  };

  const getEntityMenuItems = (entity, { type, canShop, canTake } = {}) => {
    const menu = Array.isArray(entity?.ActionsMenu) ? entity.ActionsMenu : [];
    const hasMenu = menu.length > 0;
    const items = [];
    const seen = new Set();
    const entityId = entity?.id ?? entity?.UniqueID ?? null;
    const isContainer = type === 'object' && typeof isContainerObject === 'function' ? isContainerObject(entity) : false;
    const containerOpen =
      isContainer && typeof resolveContainerOpenState === 'function' ? resolveContainerOpenState(entityId, entity) : false;
    const canEquip = typeof canEquipObject === 'function' ? canEquipObject(entity) : false;
    const inInventory = typeof hasInventoryItem === 'function' ? hasInventoryItem(entityId) : false;
    const equipped = entityId ? Boolean(equippedInventory?.[entityId]) : false;
    const menuCtx = buildMenuContext(entity, type === 'character' ? 'character' : 'object');

    for (const row of menu) {
      if (menuCtx && !shouldShowMenuEntry(row, menuCtx)) continue;
      const action = String(row?.Action ?? '').trim();
      if (!action) continue;
      const key = normalizeMenuKey(action);
      if (!key) continue;
      if (seen.has(key)) continue;
      if (isContainer && (key === 'open' || key === 'close')) {
        if (key === 'open' && containerOpen) continue;
        if (key === 'close' && !containerOpen) continue;
      }
      if (key === 'equip' || key === 'unequip') {
        if (!canEquip) continue;
        const wantsEquip = key === 'equip';
        const disabled = !inInventory || (wantsEquip ? equipped : !equipped);
        seen.add(key);
        items.push({ key, action, label: action, disabled });
        continue;
      }
      if (key === 'shop' && canShop === false) continue;
      if (key === 'take' && canTake === false) continue;
      seen.add(key);
      items.push({ key, action, label: action });
    }

    // Sensible defaults when ActionsMenu is missing.
    if (!items.length && !hasMenu) {
      if (type === 'character') {
        items.push({ key: 'talk', action: 'Talk', label: 'Talk' });
        if (canShop) items.push({ key: 'shop', action: 'Shop', label: 'Shop' });
      }
      if (type === 'object') {
        items.push({ key: 'examine', action: 'Examine', label: 'Examine' });
        if (canShop) items.push({ key: 'shop', action: 'Shop', label: 'Shop' });
        if (canTake) items.push({ key: 'take', action: 'Take', label: 'Take' });
      }
    }

    // Order: keep the most common actions first.
    if (type === 'character') {
      const priority = new Map([
        ['talk', 0],
        ['speak', 0],
        ['chat', 0],
        ['shop', 1]
      ]);
      items.sort((a, b) => (priority.get(a.key) ?? 50) - (priority.get(b.key) ?? 50) || a.label.localeCompare(b.label));
    }
    if (type === 'object') {
      const priority = new Map([
        ['examine', 0],
        ['inspect', 0],
        ['shop', 1],
        ['take', 2],
        ['pickup', 2]
      ]);
      items.sort((a, b) => (priority.get(a.key) ?? 50) - (priority.get(b.key) ?? 50) || a.label.localeCompare(b.label));
    }

    return items;
  };

  const isComUnitItem = item => {
    const id = String(item?.id ?? '').trim().toLowerCase();
    const label = String(item?.label ?? '').trim().toLowerCase();
    const objId = String(item?.obj?.UniqueID ?? item?.obj?.uniqueId ?? '').trim().toLowerCase();

    if (!id && !label && !objId) return false;
    if (id === 'comunit_001' || objId === 'comunit_001') return true;
    if (id.includes('comunit') || objId.includes('comunit')) return true;
    if (label === 'com unit' || label.includes('com unit')) return true;
    return false;
  };

  const getInventoryMenuItems = item => {
    const obj = item?.obj ?? null;
    const menu = Array.isArray(obj?.ActionsMenu) ? obj.ActionsMenu : [];
    const hasMenu = menu.length > 0;
    const items = [];
    const seen = new Set();
    const itemId = item?.id ?? null;
    const menuCtx = buildMenuContext(obj, 'object');
    const isContainer =
      item?.isContainer ?? (typeof isContainerObject === 'function' ? isContainerObject(obj) : false);
    const isOpen =
      item?.isOpen ??
      (isContainer && typeof resolveContainerOpenState === 'function' ? resolveContainerOpenState(itemId, obj) : false);
    const canEquip = typeof canEquipObject === 'function' ? canEquipObject(obj) : false;
    const inInventory = typeof hasInventoryItem === 'function' ? hasInventoryItem(itemId) : true;
    const equipped = itemId ? Boolean(equippedInventory?.[itemId]) : false;

    // Com Unit: show only the requested quick actions in a fixed order.
    if (isComUnitItem(item)) {
      const want = [
        { key: 'hack', action: 'Hack', label: 'Hack' },
        { key: 'call', action: 'Call', label: 'Call' },
        { key: 'examine', action: 'Examine', label: 'Examine' },
        { key: 'objectives', action: 'Objective Menu', label: 'Objectives' }
      ];

      const byKey = new Map();
      const availableKeys = new Set();
      for (const row of menu) {
        if (menuCtx && !shouldShowMenuEntry(row, menuCtx)) continue;
        const action = String(row?.Action ?? '').trim();
        if (!action) continue;
        const key = normalizeMenuKey(action);
        if (!key) continue;
        byKey.set(key, action);
        availableKeys.add(key);
      }

      for (const entry of want) {
        if (availableKeys.size > 0 && !availableKeys.has(entry.key)) continue;
        // Prefer the exact action from DB if present (case/spacing), otherwise fall back.
        const dbAction = byKey.get(entry.key) || byKey.get(normalizeMenuKey(entry.action)) || entry.action;
        items.push({ key: entry.key, action: dbAction, label: entry.label });
      }

      return items;
    }

    for (const row of menu) {
      if (menuCtx && !shouldShowMenuEntry(row, menuCtx)) continue;
      const action = String(row?.Action ?? '').trim();
      if (!action) continue;
      const key = normalizeMenuKey(action);
      if (!key) continue;
      if (seen.has(key)) continue;
      if (isContainer && (key === 'open' || key === 'close')) {
        if (key === 'open' && isOpen) continue;
        if (key === 'close' && !isOpen) continue;
      }
      if (key === 'equip' || key === 'unequip') {
        if (!canEquip) continue;
        const wantsEquip = key === 'equip';
        const disabled = !inInventory || (wantsEquip ? equipped : !equipped);
        seen.add(key);
        items.push({ key, action, label: action, disabled });
        continue;
      }
      seen.add(key);
      items.push({ key, action, label: action });
    }

    if (!items.length && !hasMenu) {
      items.push({ key: 'examine', action: 'Examine', label: 'Examine' });
    }

    return items;
  };

  // Hover-based open/close removed; menus now toggle on click.

  const normalizeQuickMenuAction = label => {
    const raw = String(label ?? '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[\u00A0]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!raw) return '';
    const alpha = raw.replace(/[^a-z]/g, '');
    if (alpha === 'wait') return 'wait';
    if (alpha === 'examine' || alpha === 'examineroom') return 'examine';
    if (raw === 'wait' || raw.startsWith('wait ')) return 'wait';
    if (raw === 'examine' || raw === 'examine room' || raw.startsWith('examine ')) return 'examine';
    return raw;
  };

  // Note: Wait/Examine are always shown as dedicated actions below.
  // We filter them out of the abilities list so they never appear twice.

  return (
    <section className="bottom-status" aria-label="Status panels">
      <div className="bottom-status-box bottom-status-navigation" aria-label="Navigation">
        <div className="bottom-status-title">
          {'Navigation'}
          {locationName ? ` — ${String(locationName)}` : ''}
        </div>
        <div className="bottom-status-nav">
          <div className="bottom-status-nav-list" role="list">
            {safeExits.length ? (
              safeExits.map((exit, idx) => {
                const destId = exit?.destinationId ?? exit?.DestinationId ?? exit?.to ?? exit?.To ?? null;
                const dir = exit?.direction ?? exit?.Direction ?? exit?.label ?? exit?.Label ?? null;
                const destName =
                  exit?.destinationName ??
                  exit?.DestinationName ??
                  (exit?.destinationRaw ? humanizeId(exit.destinationRaw) : null) ??
                  (destId ? humanizeId(destId) : null) ??
                  exit?.destinationRaw ??
                  destId ??
                  null;

                const dirText = String(dir ?? '').trim();
                const destText = String(destName ?? '').trim();

                const name =
                  dirText && destText
                    ? `${dirText} → ${destText}`
                    : String(dirText || destText || destId || '').trim() || `Exit ${idx + 1}`;
                return (
                  <button
                    key={`exit:${destId ?? idx}`}
                    type="button"
                    className="bottom-status-nav-btn"
                    disabled={combat || interactionLockedResolved || !destId}
                    onClick={() => (destId ? onNavigate?.(destId) : null)}
                    role="listitem"
                  >
                    {name}
                  </button>
                );
              })
            ) : (
              <div className="bottom-status-empty">No exits</div>
            )}
          </div>
        </div>
      </div>

      <div className="bottom-status-box bottom-status-playerbox" aria-label="Player portrait">
        <div className="bottom-status-title">Player</div>
        <div className="bottom-status-player">
          <div
            className="bottom-status-player-wrap corner-item-wrap"
          >
            <button
              type="button"
              className="bottom-status-player-btn"
              disabled={combat || interactionLockedResolved}
              onMouseDown={event => {
                event.preventDefault();
                event.stopPropagation();
                togglePlayerMenu();
              }}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {playerPortraitUrl ? (
                isVideoSrc(playerPortraitUrl) ? (
                  <video className="bottom-status-player-media" src={playerPortraitUrl} autoPlay muted loop playsInline />
                ) : (
                  <img className="bottom-status-player-media" src={playerPortraitUrl} alt="Player" />
                )
              ) : (
                <div className="bottom-status-empty">No portrait</div>
              )}
            </button>

            {playerMenuOpen ? (
              <div
                className="corner-tooltip bottom-status-player-tooltip"
                role="menu"
                aria-label="Player quick actions"
              >
                {combatResolved ? (
                  <>
                    {safeCombatWeapons.map((weapon, idx) => {
                      const weaponId = weapon?.id ?? weapon?.UniqueID ?? weapon?.name ?? null;
                      const weaponName = String(weapon?.name ?? '').trim() || `Weapon ${idx + 1}`;
                      return (
                        <button
                          key={`combat-weapon:${weaponId ?? weaponName}:${idx}`}
                          type="button"
                          className="corner-tooltip-btn"
                          disabled={combatLocked || interactionLockedResolved}
                          onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPlayerMenuOpen(false);
                            onCombatWeapon?.(weapon);
                          }}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          {`Weapon: ${weaponName}`}
                        </button>
                      );
                    })}

                    {safeCombatAbilities.map((ability, idx) => {
                      const name = String(ability?.name ?? ability?.Name ?? '').trim() || `Ability ${idx + 1}`;
                      const energyCost = Number(ability?.energyCost ?? ability?.EnergyCost ?? 0);
                      const unavailable = combatEnergyValue !== null && energyCost > 0 && combatEnergyValue < energyCost;
                      return (
                        <button
                          key={`combat-ability:${name}:${idx}`}
                          type="button"
                          className="corner-tooltip-btn"
                          disabled={combatLocked || unavailable || interactionLockedResolved}
                          title={unavailable ? `Requires ${energyCost} Energy` : undefined}
                          onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPlayerMenuOpen(false);
                            if (!unavailable) onCombatAbility?.({ name, energyCost });
                          }}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {safeAbilities.map((ability, idx) => {
                      const name = String(ability?.Name ?? ability?.name ?? '').trim() || `Ability ${idx + 1}`;
                      const key = normalizeQuickMenuAction(name);
                      const isCombatAbility = Boolean(ability?.Combat ?? ability?.combat ?? false);
                      if (isCombatAbility) return null;
                      if (key === 'wait' || key === 'examine') return null;
                      return (
                        <button
                          key={`ability:${name}:${idx}`}
                          type="button"
                          className="corner-tooltip-btn"
                          disabled={interactionLockedResolved}
                          onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            setPlayerMenuOpen(false);
                            onShowAbility?.(ability);
                          }}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      className="corner-tooltip-btn"
                      disabled={interactionLockedResolved}
                      onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPlayerMenuOpen(false);
                        onWait?.();
                      }}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      Wait (skip time)
                    </button>

                    <button
                      type="button"
                      className="corner-tooltip-btn"
                      disabled={interactionLockedResolved}
                      onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPlayerMenuOpen(false);
                        onExamineRoom?.();
                      }}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      Examine
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bottom-status-box bottom-status-npcs" aria-label="Visible characters">
        <div className="bottom-status-title">Characters</div>
        <div className="bottom-status-list" role="list">
          {safeNpcs.length ? (
            safeNpcs.map((npc, idx) => {
              const id = npc?.id ?? npc?.UniqueID ?? String(idx);
              const name = npc?.Charname || npc?.Name || npc?.name || (id ? humanizeId(id) : '') || 'NPC';
              const selected = targetType === 'npc' && targetId === id;
              const vendorEntries = typeof getVendorShopEntriesForNpc === 'function' ? getVendorShopEntriesForNpc(npc) : [];
              const canShop = vendorEntries.length > 0;
              const menuOpen = String(openNpcMenuId || '') === String(id);
              const menuItems = getEntityMenuItems(npc, { type: 'character', canShop });

              return (
                <div key={`npc:${id}`} className={`bottom-status-row${selected ? ' selected' : ''}`} role="listitem">
                  <div
                    className="corner-item-wrap bottom-status-npc-item-wrap"
                  >
                    <button
                      type="button"
                      className="bottom-status-main"
                      disabled={combat || interactionLockedResolved}
                      onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onInspect?.('npc', id, npc);
                        toggleNpcMenu(id);
                      }}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      {name}
                    </button>

                    {menuOpen ? (
                      <div
                        className="corner-tooltip bottom-status-npc-tooltip"
                        role="menu"
                        aria-label={`${name} actions`}
                      >
                        {menuItems.map(entry => {
                          const inactive = isActionExplicitlyInactive(npc, entry.action);
                          const disabled = combat || interactionLockedResolved || inactive || Boolean(entry.disabled);
                          return (
                            <button
                              key={`npc:${id}:${entry.key}`}
                              type="button"
                              className="corner-tooltip-btn"
                              disabled={disabled}
                              title={inactive ? 'Unavailable' : undefined}
                              onMouseDown={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenNpcMenuId(null);
                                if (disabled) return;
                                if (entry.key === 'talk' && onTalk) {
                                  onTalk(npc);
                                  return;
                                }
                                if (entry.key === 'shop' && onShop) {
                                  onShop(npc);
                                  return;
                                }
                                onNpcAction?.({ npc, npcId: id, action: entry.action });
                              }}
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              {entry.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bottom-status-empty">None</div>
          )}
        </div>
      </div>

      <div className="bottom-status-box bottom-status-objects" aria-label="Visible objects">
        <div className="bottom-status-title">Objects</div>
        <div className="bottom-status-list" role="list">
          {safeObjects.length ? (
            safeObjects.map((obj, idx) => {
              const id = obj?.id ?? obj?.UniqueID ?? String(idx);
              const name = obj?.name || obj?.Name || (id ? humanizeId(id) : '') || 'Object';
              const selected = targetType === 'object' && targetId === id;

              const menuOpen = String(openObjectMenuId || '') === String(id);

              const canTake = typeof canTakeObject === 'function' ? canTakeObject(obj) : false;
              const vendorEntries = typeof getVendorShopEntriesForObject === 'function' ? getVendorShopEntriesForObject(obj) : [];
              const canShop = vendorEntries.length > 0;
              const menuItems = getEntityMenuItems(obj, { type: 'object', canShop, canTake });

              return (
                <div key={`obj:${id}`} className={`bottom-status-row${selected ? ' selected' : ''}`} role="listitem">
                  <div
                    className="corner-item-wrap bottom-status-obj-item-wrap"
                  >
                    <button
                      type="button"
                      className="bottom-status-main"
                      disabled={combat || interactionLockedResolved}
                      onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onInspect?.('object', id, obj);
                        toggleObjectMenu(id);
                      }}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      {name}
                    </button>

                    {menuOpen ? (
                      <div
                        className="corner-tooltip bottom-status-obj-tooltip"
                        role="menu"
                        aria-label={`${name} actions`}
                      >
                        {menuItems.map(entry => {
                          const inactive = isActionExplicitlyInactive(obj, entry.action);
                          const disabled = combat || interactionLockedResolved || inactive || Boolean(entry.disabled);
                          return (
                            <button
                              key={`obj:${id}:${entry.key}`}
                              type="button"
                              className="corner-tooltip-btn"
                              disabled={disabled || (entry.key === 'take' && !canTake)}
                              title={inactive ? 'Unavailable' : undefined}
                              onMouseDown={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenObjectMenuId(null);
                                if (disabled) return;
                                if (entry.key === 'take' && onTakeObject) {
                                  onTakeObject(obj);
                                  return;
                                }
                                if (entry.key === 'examine' && onExamineObject) {
                                  onExamineObject(obj);
                                  return;
                                }
                                if (entry.key === 'shop' && onShop) {
                                  onShop(obj);
                                  return;
                                }
                                onObjectAction?.({ obj, objectId: id, action: entry.action });
                              }}
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              {entry.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bottom-status-empty">None</div>
          )}
        </div>
      </div>

      <div className="bottom-status-box bottom-status-inventory" aria-label="Inventory">
        <div className="bottom-status-title">Inventory</div>
        <div className="bottom-status-list" role="list">
          {safeInventory.length ? (
            safeInventory.slice(0, 10).map(item => {
              const selected = String(selectedInventoryId || '') === String(item.id);
              const menuOpen = String(openInventoryMenuId || '') === String(item.id);
              const menuItems = getInventoryMenuItems(item);
              return (
                <div key={`inv:${item.id}`} className={`bottom-status-row bottom-status-inv-item${selected ? ' selected' : ''}`} role="listitem">
                  <div
                    className="corner-item-wrap bottom-status-inv-item-wrap"
                  >
                    <button
                      type="button"
                      className="bottom-status-main bottom-status-inv-main"
                      disabled={combat || interactionLockedResolved}
                      onMouseDown={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedInventoryId?.(item.id);
                        toggleInventoryMenu(item.id);
                      }}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <span className="bottom-status-item-name">{item.label}</span>
                      {item.isContainer ? (
                        <span className={`badge bottom-status-badge ${item.isOpen ? 'on' : 'off'}`}>
                          {item.isOpen ? 'OPEN' : 'BAG'} // 
                        </span>
                      ) : null}
                    </button>

                    {menuOpen ? (
                      <div
                        className="corner-tooltip bottom-status-inv-tooltip"
                        role="menu"
                        aria-label={`${item.label} actions`}
                      >
                        {menuItems.map(entry => {
                          const isExamine = entry.key === 'examine' || entry.key === 'examine room';
                          const disabled = combat || interactionLockedResolved || Boolean(entry.disabled);
                          return (
                            <button
                              key={`inv:${item.id}:${entry.key}`}
                              type="button"
                              className="corner-tooltip-btn"
                              disabled={disabled}
                              onMouseDown={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                setOpenInventoryMenuId(null);
                                if (disabled) return;
                                onInventoryAction?.({ item, action: entry.action });
                              }}
                              onClick={event => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                            >
                              {entry.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  <div className="bottom-status-actions">
                    {hasInventoryItem?.(item.id) && Number.isFinite(credits) ? <span className="mini-muted" aria-hidden="true"></span> : null}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bottom-status-empty">Empty</div>
          )}
        </div>
      </div>
    </section>
  );
}
