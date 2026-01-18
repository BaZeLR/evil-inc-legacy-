import React, { useEffect, useRef, useState } from 'react';
import { Game } from '../game.js';
import { LevelUpNotifier } from './LevelUpNotifier.jsx';
import { ActionsDrawer, LocationTitle, NpcCorner, ObjectsCorner, PlayerDrawer, TextWindow } from './uicomponents/index.js';
import { createCombatState, performCombatTurn } from '../utils/combat.js';
import { randomIntInclusive } from '../utils/random.js';
import { ragsToHtml } from '../utils/ragsMarkup.js';
import { getExperienceCheckpoints, getMentalStatusForLevel } from '../utils/leveling.js';
import { applyCombatActionCosts } from '../utils/actionCosts.js';
import { formatGameClock, getDayPartFromMinutes, getGameClockFromStats } from '../utils/gameTime.js';
import { createEmptySaveGame, writeSaveGame } from '../utils/saveGame.js';
import { writeDbJsonFile } from '../utils/dbWrite.js';
import { useGameStore } from './store/gameStore.js';

// Local image paths
const DEFAULT_BG = '/Assets/images/rooms/dusk.jpg';
const DEFAULT_PLAYER = '/Assets/images/player/playerafraid.jpg';
const LEVEL_UP_MEDIA = '/Assets/images/ui/level_up.mp4';

function getMentalLevelDisplayFromTable(player, level) {
  const table = Array.isArray(player?.MentalLevelTable) ? player.MentalLevelTable : [];
  const entry = table.find(item => item?.Level === level) || null;
  return entry?.Display || (entry?.Title ? `${entry.Title} : Lvl. ${level}` : `Lvl. ${level}`);
}

export function GameUI() {
  const {
    game,
    setGame,
    currentRoom,
    setCurrentRoom,
    roomObjects,
    setRoomObjects,
    roomNpcs,
    setRoomNpcs,
    player,
    setPlayer,
    error,
    setError,
    eventMessages,
    setEventMessages,
    eventMedia,
    setEventMedia,
    levelUpNotice,
    setLevelUpNotice,
    combat,
    setCombat,
    combatMenuEntered,
    setCombatMenuEntered,
    hoveredObjectMenuId,
    setHoveredObjectMenuId,
    hoveredContainerItemId,
    setHoveredContainerItemId,
    containerUi,
    setContainerUi,
    activeDrawer,
    setActiveDrawer,
    shopVendorId,
    setShopVendorId,
    shopHoveredItemId,
    setShopHoveredItemId,
    shopPurchaseNotice,
    setShopPurchaseNotice,
    selectedInventoryId,
    setSelectedInventoryId,
    equippedInventory,
    setEquippedInventory,
    inspectTarget,
    setInspectTarget
  } = useGameStore();

  // Left panel drawers
  const lastEncounterRoomIdRef = useRef(null);
  const dbVersionRef = useRef({ version: null });
  const [dismissedOverlayKey, setDismissedOverlayKey] = useState(null);
  const [eventMediaTitle, setEventMediaTitle] = useState(null);

  useEffect(() => {
    if (!eventMedia) setEventMediaTitle(null);
  }, [eventMedia]);

  const updateRoom = (room, g = game, { resetInspectTarget = true } = {}) => {
    setCurrentRoom(room);
    if (resetInspectTarget) setInspectTarget({ type: 'room', id: room?.id ?? null });
    if (!room || !g) {
      setRoomObjects([]);
      setRoomNpcs([]);
      return;
    }
    setRoomObjects(g.getRoomObjects(room.id));
    setRoomNpcs(g.getRoomCharacters(room.id));
  };

  const openLevelUpNotice = (levelProgression, playerRef, levelingConfig) => {
    if (!levelProgression || levelProgression.levelsGained <= 0) return;
    const newLevel = levelProgression.toLevel;
    const mentalStatus = getMentalStatusForLevel(levelingConfig, newLevel);
    const mentalTitle = mentalStatus?.type ? mentalStatus.display : getMentalLevelDisplayFromTable(playerRef, newLevel);
    const mediaCandidate = mentalStatus?.media || LEVEL_UP_MEDIA;
    const mediaResolved = resolveMediaUrl(mediaCandidate) || mediaCandidate || LEVEL_UP_MEDIA;
    setLevelUpNotice({
      key: `${Date.now()}:${newLevel}`,
      level: newLevel,
      title: mentalTitle,
      levelsGained: levelProgression.levelsGained,
      media: mediaResolved
    });
  };

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const g = new Game();
        await g.initialize();
        if (cancelled) return;

        const startingRoom = g.getCurrentRoom();
        if (!startingRoom) throw new Error(`Current room '${g.player?.CurrentRoom}' not found in rooms.json`);

        setGame(g);
        setPlayer(g.player);
        const equippedIds = Array.isArray(g.player?.Equipped) ? g.player.Equipped : [];
        if (!Array.isArray(g.player?.Equipped)) g.player.Equipped = [...equippedIds];
        setEquippedInventory(() => {
          const next = {};
          for (const id of equippedIds) {
            const key = String(id ?? '').trim();
            if (key) next[key] = true;
          }
          return next;
        });
        updateRoom(startingRoom, g);
        const initTexts = Array.isArray(g.lastEventResult?.texts) ? g.lastEventResult.texts : [];
        const initWarnings = Array.isArray(g.loadErrors) ? g.loadErrors.length : 0;
        setEventMessages(initWarnings ? [...initTexts, `<b>DB warnings:</b> ${initWarnings} file(s) failed to load.`] : initTexts);
        setEventMedia(g.lastEventResult?.media || null);
        openLevelUpNotice(g.lastLevelProgression, g.player, g.leveling);
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || String(e));
        // eslint-disable-next-line no-console
        console.error('GameUI initialization error:', e);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!game || !game.initialized) return;

    let cancelled = false;
    let timerId = null;

    const poll = async () => {
      if (cancelled) return;
      if (!game || !game.initialized) return;
      if (combat) return;

      try {
        const response = await fetch('/api/db/version', { cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json();
        const nextVersion = String(payload?.version ?? '').trim();
        if (!nextVersion) return;

        const source = String(payload?.source ?? '').trim().toLowerCase();
        const prevVersion = dbVersionRef.current.version;
        if (!prevVersion) {
          dbVersionRef.current.version = nextVersion;
          return;
        }

        if (nextVersion === prevVersion) return;
        dbVersionRef.current.version = nextVersion;

        if (source === 'write') return;

        await game.reloadFromDb({ preserveRoomId: true });
        if (cancelled) return;

        const nextRoom = game.getCurrentRoom();
        setPlayer(game.player);

        const equippedIds = Array.isArray(game.player?.Equipped) ? game.player.Equipped : [];
        if (!Array.isArray(game.player?.Equipped)) game.player.Equipped = [...equippedIds];
        setEquippedInventory(() => {
          const next = {};
          for (const id of equippedIds) {
            const key = String(id ?? '').trim();
            if (key) next[key] = true;
          }
          return next;
        });

        updateRoom(nextRoom, game, { resetInspectTarget: false });

        setEventMessages(prev => {
          const base = Array.isArray(prev) ? prev : [];
          const warningCount = Array.isArray(game.loadErrors) ? game.loadErrors.length : 0;
          const lines = ['[i]DB reloaded.[/i]'];
          if (warningCount) lines.push(`[b]DB warnings:[/b] ${warningCount} file(s) failed to load.`);
          return [...base, ...lines].slice(-10);
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('DB hot reload failed:', error?.message || String(error));
      }
    };

    void poll();
    timerId = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
    };
  }, [game, combat]);

  const toggleDrawer = drawerName => {
    setActiveDrawer(prev => (prev === drawerName ? null : drawerName));
  };

  const closeDrawer = () => setActiveDrawer(null);

  const refreshPlayerState = (g = game) => {
    if (!g?.player) return;
    const nextInventory = Array.isArray(g.player.Inventory) ? [...g.player.Inventory] : [];
    const nextStats = g.player.Stats ? { ...g.player.Stats } : undefined;
    const nextEquipped = Array.isArray(g.player.Equipped) ? [...g.player.Equipped] : undefined;
    setPlayer({ ...g.player, Inventory: nextInventory, Stats: nextStats, Equipped: nextEquipped });
  };

  const cloneJson = value => JSON.parse(JSON.stringify(value ?? null));

  const ensureSaveGameShape = g => {
    const base = g?.save && typeof g.save === 'object' ? g.save : createEmptySaveGame();
    const next = cloneJson(base) || createEmptySaveGame();
    if (!next.player || typeof next.player !== 'object') next.player = {};
    if (!next.rooms || typeof next.rooms !== 'object') next.rooms = {};
    if (!next.objects || typeof next.objects !== 'object') next.objects = {};
    if (!next.version) next.version = 1;
    return next;
  };

  const persistSaveGame = nextSave => {
    if (!game) return;
    const snapshot = cloneJson(nextSave);
    game.save = snapshot;
    void writeSaveGame(snapshot).then(result => {
      if (!result?.ok) {
        // eslint-disable-next-line no-console
        console.warn('SaveGame write failed:', result?.error || result);
      }
    });
  };

  const commitPlayerToSave = (save, g = game) => {
    if (!g?.player) return;
    save.player = {
      ...(save.player || {}),
      Inventory: cloneJson(Array.isArray(g.player.Inventory) ? g.player.Inventory : []),
      Equipped: cloneJson(Array.isArray(g.player.Equipped) ? g.player.Equipped : []),
      Stats: cloneJson(g.player.Stats || {}),
      CurrentRoom: g.player.CurrentRoom,
      Credits: g.player.Credits ?? 0
    };
  };

  const commitRoomToSave = (roomId, save, g = game) => {
    const id = String(roomId ?? '').trim();
    if (!id || !g?.roomMap?.[id]) return;
    const room = g.roomMap[id];
    save.rooms[id] = { ...(save.rooms?.[id] || {}), objects: cloneJson(Array.isArray(room.objects) ? room.objects : []) };
  };

  const commitObjectToSave = (objectId, save, g = game) => {
    const id = String(objectId ?? '').trim();
    if (!id || !g?.objectMap?.[id]) return;
    const obj = g.objectMap[id];
    const next = { ...(save.objects?.[id] || {}) };
    if (Array.isArray(obj?.Contents)) next.Contents = cloneJson(obj.Contents);
    if (Array.isArray(obj?.CustomProperties)) next.CustomProperties = cloneJson(obj.CustomProperties);
    save.objects[id] = next;
  };

  const openCombatMenu = () => {
    if (!combat) return;
    setCombatMenuEntered(true);
    setActiveDrawer('combat');
  };

  const openActionsMenu = () => {
    if (combat) return;
    toggleDrawer('actions');
  };

  const handleMove = destinationId => {
    if (!destinationId) return;
    if (!game) return;
    if (combat) return;
    const result = game.travelTo(destinationId);
    if (!result?.moved) return;
    const newRoom = game.getCurrentRoom();
    updateRoom(newRoom, game);
    setEventMessages(result?.events?.texts || []);
    setEventMedia(result?.events?.media || null);
    openLevelUpNotice(result?.levelProgression, game.player, game.leveling);
    closeDrawer();

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const handleSaveGame = () => {
    if (!game || !currentRoom) return;

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    commitRoomToSave(currentRoom.id, save);

    const objectIds = game?.objectSourceMap ? Object.keys(game.objectSourceMap) : [];
    for (const objId of objectIds) commitObjectToSave(objId, save);

    persistSaveGame(save);

    setEventMedia(null);
    setEventMessages([`<b>Game saved.</b>`]);
  };

  const handleLoadGame = async (options = {}) => {
    const mode = String(options?.mode ?? 'load').trim().toLowerCase();
    try {
      setError(null);
      lastEncounterRoomIdRef.current = null;

      const g = new Game();
      await g.initialize();

      const startingRoom = g.getCurrentRoom();
      if (!startingRoom) throw new Error(`Current room '${g.player?.CurrentRoom}' not found in rooms.json`);

      setGame(g);
      setPlayer(g.player);

      const equippedIds = Array.isArray(g.player?.Equipped) ? g.player.Equipped : [];
      if (!Array.isArray(g.player?.Equipped)) g.player.Equipped = [...equippedIds];
      setEquippedInventory(() => {
        const next = {};
        for (const id of equippedIds) {
          const key = String(id ?? '').trim();
          if (key) next[key] = true;
        }
        return next;
      });

      setCombat(null);
      setCombatMenuEntered(false);
      setHoveredObjectMenuId(null);
      setHoveredContainerItemId(null);
      setContainerUi(() => ({}));
      setSelectedInventoryId(null);
      setShopVendorId(null);
      setShopHoveredItemId(null);
      setShopPurchaseNotice(null);

      updateRoom(startingRoom, g);
      const loadedTexts = Array.isArray(g.lastEventResult?.texts) ? g.lastEventResult.texts : [];
      const loadLabel = mode === 'new' ? '<b>New game started.</b>' : '<b>Game loaded.</b>';
      const loadInfo = [loadLabel];
      const warningCount = Array.isArray(g.loadErrors) ? g.loadErrors.length : 0;
      if (warningCount) loadInfo.push(`<b>DB warnings:</b> ${warningCount} file(s) failed to load. Open Settings for details.`);
      setEventMessages([...loadedTexts, ...loadInfo]);
      setEventMedia(g.lastEventResult?.media || null);
      openLevelUpNotice(g.lastLevelProgression, g.player, g.leveling);
    } catch (e) {
      setError(e?.message || String(e));
      // eslint-disable-next-line no-console
      console.error('Load game error:', e);
    }
  };

  const handleNewGame = async () => {
    if (combat) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('savegame');
    } catch {
      // ignore
    }

    try {
      await writeDbJsonFile('DB/savegame.json', createEmptySaveGame());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to reset savegame.json:', error?.message || String(error));
    }

    await handleLoadGame({ mode: 'new' });
  };

  const handleResetSave = async () => {
    if (combat) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('savegame');
    } catch {
      // ignore
    }

    try {
      await writeDbJsonFile('DB/savegame.json', createEmptySaveGame());
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to reset savegame.json:', error?.message || String(error));
    }

    await handleLoadGame();
    setEventMessages(prev => [...(Array.isArray(prev) ? prev : []), '<b>Save reset.</b>']);
  };

  const examineObject = obj => {
    if (!obj) return;
    if (combat) return;
    const objId = obj?.id ?? obj?.UniqueID ?? null;
    if (!objId) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setInspectTarget({ type: 'object', id: objId });
    setHoveredObjectMenuId(null);
    setHoveredContainerItemId(null);
    setEventMedia(null);
    setEventMessages([]);
  };

  const examineNpc = npc => {
    if (!npc) return;
    if (combat) return;
    const npcId = npc?.id ?? npc?.UniqueID ?? null;
    if (!npcId) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setInspectTarget({ type: 'npc', id: npcId });
    setHoveredObjectMenuId(null);
    setHoveredContainerItemId(null);
    setEventMedia(null);
    setEventMessages([]);
  };

  const canTakeObject = obj => {
    const direct = obj?.CanPickUp ?? obj?.CanTake ?? obj?.CanPickup;
    if (direct !== undefined) return Boolean(direct);

    const id = String(obj?.id ?? obj?.UniqueID ?? '').trim();
    if (!id || !game?.objectMap?.[id]) return false;
    const template = game.objectMap[id];
    return Boolean(template?.CanPickUp ?? template?.CanTake ?? template?.CanPickup);
  };

  const resolveRoomObject = obj => {
    if (!obj) return obj;
    const id = String(obj?.id ?? obj?.UniqueID ?? '').trim();
    if (!id || !game?.objectMap?.[id]) return obj;

    const template = game.objectMap[id];
    const merged = { ...(obj || {}), ...(template || {}) };

    const placementKeys = ['AlwaysPresent', 'PresentOnFirstVisit', 'CanPickUp', 'CanExamine', 'CanDrop', 'Actions'];
    for (const key of placementKeys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) merged[key] = obj[key];
    }

    merged.id = id;
    merged.UniqueID = id;
    merged.name = merged.Name ?? merged.name ?? obj?.name ?? obj?.Name ?? '';
    merged.description = merged.Description ?? merged.description ?? obj?.description ?? obj?.Description ?? '';
    merged.media = merged.Picture ?? merged.media ?? obj?.media ?? obj?.Picture ?? null;

    return merged;
  };

  const normalizeActionName = value => String(value ?? '').trim().toLowerCase();

  const getObjectActionNames = obj => {
    const actions = Array.isArray(obj?.ActionsMenu) ? obj.ActionsMenu : [];
    return actions.map(entry => normalizeActionName(entry?.Action ?? entry?.name)).filter(Boolean);
  };

  const resolveEntityId = entity => {
    const id = String(entity?.id ?? entity?.UniqueID ?? '').trim();
    return id || null;
  };

  const resolveVendorShopItems = vendorEntity => {
    const vendorId = resolveEntityId(vendorEntity);
    const objectTemplate = vendorId ? game?.objectMap?.[vendorId] ?? null : null;
    const characterTemplate = vendorId ? game?.characterMap?.[vendorId] ?? null : null;
    const template = objectTemplate || characterTemplate;
    const raw = Array.isArray(vendorEntity?.ShopItems)
      ? vendorEntity.ShopItems
      : Array.isArray(template?.ShopItems)
        ? template.ShopItems
        : [];
    return Array.isArray(raw) ? raw : [];
  };

  const isVendorObject = obj => resolveVendorShopItems(obj).length > 0;

  const openVendorShop = vendorEntity => {
    if (!vendorEntity) return;
    if (combat) return;
    const vendorId = resolveEntityId(vendorEntity);
    if (!vendorId) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setShopVendorId(vendorId);
    setShopHoveredItemId(null);
    setShopPurchaseNotice(null);
    setActiveDrawer('vendor');
  };

  const isContainerObject = obj => {
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    if (type === 'container') return true;
    const actions = getObjectActionNames(obj);
    if (actions.includes('open') || actions.includes('close')) return true;
    return Array.isArray(obj?.Contents) && obj.Contents.length > 0;
  };

  const canEquipObject = obj => {
    if (!obj) return false;
    if (isContainerObject(obj)) return false;
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    const actions = getObjectActionNames(obj);
    if (actions.includes('equip') || actions.includes('unequip')) return true;
    return type === 'wearable' || type === 'weapon';
  };

  const isWeaponObject = obj => {
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    if (type === 'weapon') return true;
    if (obj?.IsWeapon === true || obj?.Weapon === true) return true;
    if (String(obj?.Category ?? '').trim().toLowerCase() === 'weapon') return true;
    return false;
  };

  const toSafeInt = (value, fallback = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.trunc(num);
  };

  const resolveMediaUrl = media => {
    const raw = String(media ?? '').trim();
    if (!raw) return null;

    const normalized = raw.replace(/\\/g, '/');

    if (/^(https?:)?\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
      return normalized;
    }

    let cleaned = normalized.replace(/^\/+/, '');
    cleaned = cleaned.replace(/^public\//i, '').replace(/^dist\//i, '');
    if (!cleaned) return null;

    return encodeURI(`/${cleaned}`);
  };

  const isVideoMedia = media => {
    const value = String(media ?? '').trim().toLowerCase();
    return value.endsWith('.mp4') || value.endsWith('.webm') || value.endsWith('.ogg');
  };

  const getObjectEquipmentBonuses = obj => {
    const root = obj?.Bonuses ?? obj?.bonuses ?? obj?.StatsBonus ?? obj?.statsBonus ?? null;
    const msBonus = toSafeInt(root?.MS ?? root?.Attack ?? root?.Str ?? obj?.MSBonus ?? obj?.AttackBonus ?? 0, 0);
    const defenceBonus = toSafeInt(
      root?.Defence ?? root?.Defense ?? root?.Def ?? root?.Armor ?? obj?.DefenceBonus ?? obj?.DefenseBonus ?? obj?.ArmorBonus ?? 0,
      0
    );
    return { ms: msBonus, defence: defenceBonus };
  };

  const getEquippedBonuses = (equippedMap, objectMap) => {
    const totals = { ms: 0, defence: 0 };
    const lookup = objectMap || game?.objectMap || {};
    for (const [id, on] of Object.entries(equippedMap || {})) {
      if (!on) continue;
      const obj = lookup?.[id] ?? null;
      if (!obj) continue;
      const bonus = getObjectEquipmentBonuses(obj);
      totals.ms += bonus.ms;
      totals.defence += bonus.defence;
    }
    return totals;
  };

  const getCustomProperty = (obj, propertyName) => {
    const key = String(propertyName ?? '').trim();
    if (!key) return undefined;
    const props = Array.isArray(obj?.CustomProperties) ? obj.CustomProperties : [];
    const match = props.find(entry => String(entry?.Property ?? '').trim().toLowerCase() === key.toLowerCase()) || null;
    return match ? match.Value : undefined;
  };

  const setCustomProperty = (obj, propertyName, value) => {
    const key = String(propertyName ?? '').trim();
    if (!key || !obj) return;
    if (!Array.isArray(obj.CustomProperties)) obj.CustomProperties = [];

    const props = obj.CustomProperties;
    const idx = props.findIndex(entry => String(entry?.Property ?? '').trim().toLowerCase() === key.toLowerCase());
    const nextEntry = { Property: key, Value: value };
    if (idx >= 0) props[idx] = nextEntry;
    else props.push(nextEntry);
  };

  const toggleContainerOpen = containerId => {
    const id = String(containerId ?? '').trim();
    if (!id) return;
    if (combat) return;
    const containerObj = game?.objectMap?.[id] ?? null;
    const uiOpen = containerUi?.[id]?.open;
    let currentOpen = Boolean(uiOpen);
    if (uiOpen === undefined && containerObj) {
      const closedFlag = getCustomProperty(containerObj, 'Closed');
      if (closedFlag !== undefined) currentOpen = !Boolean(closedFlag);
      else {
        const openedFlag = getCustomProperty(containerObj, 'Opened');
        if (openedFlag !== undefined) currentOpen = Boolean(openedFlag);
      }
    }
    const nextOpen = !currentOpen;
    const defaultContents = Array.isArray(containerObj?.Contents)
      ? containerObj.Contents.map(entry => String(entry?.UniqueID ?? entry?.id ?? '').trim()).filter(Boolean)
      : [];

    setHoveredContainerItemId(null);
    setContainerUi(prev => {
      const existing = prev?.[id] ?? null;
      const resolvedOpen = existing ? !Boolean(existing.open) : nextOpen;
      const nextEntry = existing ? { ...existing, open: resolvedOpen } : { open: resolvedOpen, contents: defaultContents };
      return { ...(prev || {}), [id]: nextEntry };
    });

    if (containerObj) {
      const hasClosedFlag = getCustomProperty(containerObj, 'Closed') !== undefined;
      if (hasClosedFlag) setCustomProperty(containerObj, 'Closed', !nextOpen);
      else setCustomProperty(containerObj, 'Opened', nextOpen);

      const save = ensureSaveGameShape(game);
      commitObjectToSave(id, save);
      persistSaveGame(save);
    }
  };

  const syncEquippedToPlayer = nextMap => {
    if (!game?.player) return;
    const equipped = Object.entries(nextMap || {})
      .filter(([, on]) => Boolean(on))
      .map(([id]) => id);
    game.player.Equipped = equipped;
  };

  const setItemEquipped = (itemId, shouldEquip) => {
    const id = String(itemId ?? '').trim();
    if (!id) return;
    if (combat) return;

    const itemObj = game?.objectMap?.[id] ?? null;
    if (itemObj) {
      setCustomProperty(itemObj, 'Equipped', Boolean(shouldEquip));
      if (shouldEquip && game?.player?.UniqueID) itemObj.Owner = game.player.UniqueID;

      const save = ensureSaveGameShape(game);
      commitObjectToSave(id, save);
      persistSaveGame(save);
    }

    setEquippedInventory(prev => {
      const next = { ...(prev || {}) };
      if (shouldEquip) next[id] = true;
      else delete next[id];
      syncEquippedToPlayer(next);
      return next;
    });

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const hasInventoryItem = itemId => {
    const id = String(itemId ?? '').trim();
    if (!id || !game?.player) return false;
    const inventory = Array.isArray(game.player.Inventory) ? game.player.Inventory : [];
    return inventory.some(entry => (entry?.UniqueID || entry?.id || entry?.Name) === id);
  };

  const getInventoryEntry = itemId => {
    const id = String(itemId ?? '').trim();
    if (!id || !game?.player) return null;
    const inventory = Array.isArray(game.player.Inventory) ? game.player.Inventory : [];
    return inventory.find(entry => (entry?.UniqueID || entry?.id || entry?.Name) === id) || null;
  };

  const getInventoryQuantity = itemId => {
    const entry = getInventoryEntry(itemId);
    if (!entry) return 0;
    const qty = toSafeInt(entry?.Quantity ?? entry?.Qty ?? entry?.Count ?? 1, 1);
    return Math.max(1, qty);
  };

  const ensureInventoryItem = (itemId, options = {}) => {
    const { quantity = 1 } = options || {};
    const id = String(itemId ?? '').trim();
    if (!id || !game?.player) return false;

    const addQty = Math.max(1, toSafeInt(quantity, 1));

    if (!Array.isArray(game.player.Inventory)) game.player.Inventory = [];
    const inventory = game.player.Inventory;

    const obj = game?.objectMap?.[id] ?? null;
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    const stackable = type === 'consumable';
    const name = obj?.Name || obj?.name || id;

    const index = inventory.findIndex(entry => (entry?.UniqueID || entry?.id || entry?.Name) === id);
    if (index >= 0) {
      if (!stackable) return false;
      const currentQty = toSafeInt(inventory[index]?.Quantity ?? inventory[index]?.Qty ?? inventory[index]?.Count ?? 1, 1);
      inventory[index] = { ...inventory[index], UniqueID: id, Name: inventory[index]?.Name || name, Quantity: currentQty + addQty };
      return true;
    }

    const nextEntry = { UniqueID: id, Name: name };
    if (stackable) nextEntry.Quantity = addQty;
    inventory.push(nextEntry);
    return true;
  };

  const decrementInventoryItem = (itemId, amount = 1) => {
    const id = String(itemId ?? '').trim();
    if (!id || !game?.player) return { removed: false, remaining: 0 };

    const delta = Math.max(1, toSafeInt(amount, 1));

    if (!Array.isArray(game.player.Inventory)) game.player.Inventory = [];
    const inventory = game.player.Inventory;
    const index = inventory.findIndex(entry => (entry?.UniqueID || entry?.id || entry?.Name) === id);
    if (index < 0) return { removed: false, remaining: 0 };

    const currentQty = toSafeInt(inventory[index]?.Quantity ?? inventory[index]?.Qty ?? inventory[index]?.Count ?? 1, 1);
    if (currentQty <= delta) {
      inventory.splice(index, 1);
      return { removed: true, remaining: 0 };
    }

    inventory[index] = { ...inventory[index], Quantity: currentQty - delta };
    return { removed: false, remaining: currentQty - delta };
  };

  const buyVendorItem = ({ vendorId, itemId, price } = {}) => {
    const vId = String(vendorId ?? '').trim();
    const id = String(itemId ?? '').trim();
    if (!vId || !id) return;
    if (!game?.player) return;
    if (combat) return;

    const cost = toSafeInt(price, 0);
    const currentCredits = toSafeInt(game.player?.Credits, 0);
    const obj = game?.objectMap?.[id] ?? null;
    const name = obj?.Name || obj?.name || id;
    const stackable = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase() === 'consumable';

    if (hasInventoryItem(id) && !stackable) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`You already own <b>${name}</b>.`]);
      return;
    }

    if (cost > 0 && currentCredits < cost) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`Not enough credits. You need <b>${cost}</b>, but you have <b>${currentCredits}</b>.`]);
      return;
    }

    game.player.Credits = Math.max(0, currentCredits - Math.max(0, cost));
    const added = ensureInventoryItem(id, { quantity: 1 });
    if (!added) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`Couldn't add <b>${name}</b> to inventory.`]);
      return;
    }

    setSelectedInventoryId(id);
    setShopHoveredItemId(id);
    setShopPurchaseNotice({ key: `${Date.now()}:${id}`, vendorId: vId, itemId: id, price: cost });

    const media = obj?.media || obj?.Picture || null;
    if (media) {
      setEventMedia(media);
      setEventMediaTitle(name);
    } else {
      setEventMedia(null);
      setEventMediaTitle(null);
    }
    setEventMessages([`<b>Purchased</b> ${name} for <b>${cost}</b> credits.`]);

    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const handleRichTextClick = event => {
    const target = event?.target ?? null;
    if (!target || typeof target.closest !== 'function') return;

    const anchor = target.closest('a');
    if (!anchor) return;

    const hrefRaw = anchor.getAttribute('href');
    const href = String(hrefRaw ?? '').trim();
    if (!href) return;

    event.preventDefault();
    event.stopPropagation();

    const title = String(anchor.textContent ?? '').trim() || null;
    const normalizedHref = href.replace(/^\/+/, '');
    const lower = normalizedHref.toLowerCase();

    const isMedia = /\.(png|jpe?g|gif|webp|mp4|webm|ogg)(\?.*)?$/.test(lower);

    if (lower.startsWith('object:') || lower.startsWith('obj:')) {
      setDismissedOverlayKey(null);
      setEventMediaTitle(null);
      const objId = normalizedHref.split(':').slice(1).join(':').trim();
      if (objId) setInspectTarget({ type: 'object', id: objId });
      return;
    }

    if (lower.startsWith('npc:') || lower.startsWith('character:')) {
      setDismissedOverlayKey(null);
      setEventMediaTitle(null);
      const npcId = normalizedHref.split(':').slice(1).join(':').trim();
      if (npcId) setInspectTarget({ type: 'npc', id: npcId });
      return;
    }

    if (lower.startsWith('room:')) {
      const roomId = normalizedHref.split(':').slice(1).join(':').trim();
      if (!roomId || !game?.roomMap?.[roomId]) return;
      const room = game.roomMap[roomId];
      const media = room?.media || room?.Picture || null;
      if (!media) return;
      setDismissedOverlayKey(null);
      setEventMedia(media);
      setEventMediaTitle(room?.name || room?.Name || title || null);
      return;
    }

    if (isMedia) {
      setDismissedOverlayKey(null);
      setEventMedia(normalizedHref);
      setEventMediaTitle(title);
    }
  };

  const createUiLogEntry = (html, kind = 'system') => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    html: String(html ?? ''),
    kind
  });

  const useConsumableItem = item => {
    if (!game?.player || !item) return;

    const id = String(item?.id ?? item?.UniqueID ?? '').trim();
    if (!id) return;

    const obj = item?.obj ?? game?.objectMap?.[id] ?? null;
    const name = obj?.Name || obj?.name || item?.name || id;
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    const actions = getObjectActionNames(obj);
    const canUse = type === 'consumable' || actions.includes('use');
    if (!canUse) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`You can't use <b>${name}</b>.`]);
      return;
    }

    const restoreHealth = toSafeInt(getCustomProperty(obj, 'RestoreHealth') ?? 0, 0);
    const restoreEnergy = toSafeInt(getCustomProperty(obj, 'RestoreEnergy') ?? 0, 0);
    if (!restoreHealth && !restoreEnergy) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`<b>${name}</b> has no effect.`]);
      return;
    }

    if (!game.player.Stats || typeof game.player.Stats !== 'object') game.player.Stats = {};
    const stats = game.player.Stats;

    const prevHealth = toSafeInt(stats.Health, 0);
    const maxHealth = Math.max(prevHealth, toSafeInt(stats.MaxHealth, prevHealth));
    const prevEnergy = toSafeInt(stats.Energy, 0);
    const maxEnergy = Math.max(prevEnergy, toSafeInt(stats.MaxEnergy, prevEnergy));

    const nextHealth = restoreHealth ? Math.min(maxHealth, prevHealth + restoreHealth) : prevHealth;
    const nextEnergy = restoreEnergy ? Math.min(maxEnergy, prevEnergy + restoreEnergy) : prevEnergy;

    stats.Health = nextHealth;
    stats.Energy = nextEnergy;

    const consumed = decrementInventoryItem(id, 1);
    if (consumed.removed) {
      setSelectedInventoryId(prev => {
        if (String(prev ?? '').trim() !== id) return prev;
        const nextInventory = Array.isArray(game.player.Inventory) ? game.player.Inventory : [];
        const nextId = nextInventory[0]?.UniqueID || nextInventory[0]?.id || nextInventory[0]?.Name || null;
        return nextId;
      });
    }

    if (combat) {
      setCombat(prev => {
        if (!prev) return prev;
        const next = { ...prev };
        if (restoreHealth) next.playerHp = Math.min(Number(prev.playerMaxHp) || nextHealth, nextHealth);
        if (restoreEnergy) next.playerEnergy = Math.min(Number(prev.playerMaxEnergy) || nextEnergy, nextEnergy);
        next.log = [...(prev.log || []), createUiLogEntry(`You used <b>${name}</b>.`, 'player')];
        return next;
      });
    }

    const gainParts = [];
    if (restoreHealth) gainParts.push(`+${nextHealth - prevHealth} HP`);
    if (restoreEnergy) gainParts.push(`+${nextEnergy - prevEnergy} Energy`);

    setEventMedia(obj?.media || obj?.Picture || null);
    setEventMediaTitle(name);
    setEventMessages([`You used <b>${name}</b>. ${gainParts.join(' ú ')}`]);

    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const removeFromContainer = (containerId, contentId) => {
    const cId = String(containerId ?? '').trim();
    const itemId = String(contentId ?? '').trim();
    if (!cId || !itemId || !game?.objectMap?.[cId]) return false;

    const containerObj = game.objectMap[cId];
    if (!Array.isArray(containerObj.Contents)) return false;

    const before = containerObj.Contents.length;
    containerObj.Contents = containerObj.Contents.filter(entry => String(entry?.UniqueID ?? entry?.id ?? '').trim() !== itemId);
    return containerObj.Contents.length !== before;
  };

  const takeFromContainerToInventory = ({ containerId, itemId, autoEquip = false } = {}) => {
    const cId = String(containerId ?? '').trim();
    const id = String(itemId ?? '').trim();
    if (!cId || !id) return;
    if (!game) return;
    if (combat) return;

    const removed = removeFromContainer(cId, id);
    const added = ensureInventoryItem(id);

    setContainerUi(prev => {
      const existing = prev?.[cId] ?? null;
      if (!existing || !Array.isArray(existing.contents)) return prev;
      return { ...(prev || {}), [cId]: { ...existing, contents: existing.contents.filter(entry => String(entry ?? '').trim() !== id) } };
    });

    setSelectedInventoryId(id);
    setHoveredContainerItemId(null);

    if (removed || added) {
      const itemObj = game?.objectMap?.[id] ?? null;
      const name = itemObj?.Name || itemObj?.name || id;
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`You take <b>${name}</b>.`]);
    }

    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    commitObjectToSave(cId, save);
    persistSaveGame(save);

    if (autoEquip) setItemEquipped(id, true);
  };

  useEffect(() => {
    if (!game?.player) return;
    syncEquippedToPlayer(equippedInventory);

    let didChange = false;
    // TODO: Replace with full "power-to-level" progression rules.
    if (game.player?.Stats) {
      const currentLevel = toSafeInt(game.player.Stats.Level, 0);
      const effectivePower = toSafeInt(game.player.Stats.MS, 0) + getEquippedBonuses(equippedInventory, game?.objectMap).ms;
      if (currentLevel <= 0 && effectivePower >= 2) {
        game.player.Stats.Level = 1;
        didChange = true;
        openLevelUpNotice({ fromLevel: currentLevel, toLevel: 1, levelsGained: 1 }, game.player, game.leveling);
      }
    }

    refreshPlayerState(game);

    if (!didChange) return;
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  }, [equippedInventory, game]);

  useEffect(() => {
    if (!shopPurchaseNotice?.key) return;
    const timer = setTimeout(() => setShopPurchaseNotice(null), 1400);
    return () => clearTimeout(timer);
  }, [shopPurchaseNotice?.key, setShopPurchaseNotice]);

  const takeObject = obj => {
    if (!game || !currentRoom || !obj) return;
    if (combat) return;
    if (!canTakeObject(obj)) {
      const name = obj?.name || obj?.Name || 'object';
      setEventMediaTitle(null);
      setEventMessages([`You can't take <b>${name}</b>.`]);
      return;
    }

    const objId = obj?.id ?? obj?.UniqueID ?? null;
    const name = obj?.name || obj?.Name || objId || 'Object';
    if (!objId) return;

    if (!Array.isArray(game.player.Inventory)) game.player.Inventory = [];
    const alreadyInInventory = game.player.Inventory.some(entry => (entry?.UniqueID || entry?.id || entry?.Name) === objId);
    if (!alreadyInInventory) game.player.Inventory.push({ UniqueID: objId, Name: name });
    setHoveredObjectMenuId(null);
    setHoveredContainerItemId(null);

    setEquippedInventory(prev => {
      if (!prev?.[objId]) return prev;
      const next = { ...prev };
      delete next[objId];
      syncEquippedToPlayer(next);
      return next;
    });

    const roomId = currentRoom?.id ?? null;
    const room = roomId ? game.roomMap?.[roomId] ?? null : null;
    if (room && Array.isArray(room.objects)) {
      room.objects = room.objects.filter(entry => (entry?.id ?? entry?.UniqueID) !== objId);
    }

    const objRef = game?.objectMap?.[objId] ?? null;
    if (objRef && game?.player?.UniqueID) {
      objRef.Owner = game.player.UniqueID;
    }

    if (inspectTarget.type === 'object' && inspectTarget.id === objId) {
      setInspectTarget({ type: 'room', id: roomId });
    }

    setSelectedInventoryId(objId);
    setEventMedia(null);
    setEventMediaTitle(null);
    setEventMessages([`You take <b>${name}</b>.`]);
    if (room) updateRoom(room, game);
    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    if (roomId) commitRoomToSave(roomId, save);
    persistSaveGame(save);
  };

  const dropInventoryItem = item => {
    if (!game || !currentRoom || !item) return;
    if (combat) return;

    const itemId = item?.id ?? item?.UniqueID ?? null;
    if (!itemId) return;

    const inventory = Array.isArray(game.player.Inventory) ? game.player.Inventory : [];
    const index = inventory.findIndex(entry => {
      const entryId = entry?.UniqueID || entry?.id || entry?.Name;
      return entryId === itemId;
    });
    if (index < 0) return;

    const removed = inventory.splice(index, 1)[0] || null;
    game.player.Inventory = inventory;

    setEquippedInventory(prev => {
      if (!prev?.[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      syncEquippedToPlayer(next);
      return next;
    });

    const roomId = currentRoom?.id ?? null;
    const room = roomId ? game.roomMap?.[roomId] ?? null : null;
    if (room) {
      if (!Array.isArray(room.objects)) room.objects = [];
      const obj = item?.obj ?? null;
      const droppedName = item?.name || obj?.name || obj?.Name || removed?.Name || 'Item';
      const dropped = obj
        ? { ...obj, CanPickUp: true, CanExamine: true, CanDrop: true }
        : { id: itemId, UniqueID: itemId, Name: droppedName, name: droppedName, description: '', media: null, CanPickUp: true };
      room.objects.push(dropped);

      const droppedRef = game?.objectMap?.[itemId] ?? null;
      if (droppedRef) {
        droppedRef.Owner = '';
      }

      updateRoom(room, game);
      setInspectTarget({ type: 'room', id: roomId });
      setEventMedia(null);
      setEventMessages([`You drop <b>${droppedName}</b>.`]);
    }

    refreshPlayerState(game);

    setSelectedInventoryId(prev => {
      if (prev !== itemId) return prev;
      const nextId = inventory[0]?.UniqueID || inventory[0]?.id || inventory[0]?.Name || null;
      return nextId;
    });

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    if (roomId) commitRoomToSave(roomId, save);
    persistSaveGame(save);
  };

  const examineInventoryItem = item => {
    if (!item) return;
    if (combat) return;
    setEventMediaTitle(null);
    setInspectTarget({ type: 'object', id: item.id });
    setEventMedia(null);
    setEventMessages([]);
  };

  const startCombat = npc => {
    if (!game || !currentRoom || !npc) return;
    setCombatMenuEntered(false);
    setActiveDrawer(null);
    setEventMessages([]);
    setEventMedia(null);
    setEventMediaTitle(null);
    setCombat(createCombatState({ game, room: currentRoom, enemy: npc }));
  };

  useEffect(() => {
    if (!game || !currentRoom) return;
    if (combat) return;

    const roomId = currentRoom?.id ?? null;
    if (!roomId) return;

    if (lastEncounterRoomIdRef.current === roomId) return;
    lastEncounterRoomIdRef.current = roomId;

    const enemies = game.getRoomCharacters(roomId).filter(char => {
      const disposition = String(char?.Disposition ?? char?.disposition ?? char?.Type ?? char?.type ?? '').trim().toLowerCase();
      return disposition === 'hostile';
    });
    if (!enemies.length) return;

    const notoriety = Number(game?.player?.Stats?.Notoriety ?? 0);
    const chanceRoll = randomIntInclusive(0, 100) + notoriety;
    if (chanceRoll <= 75) return;

    const picked = enemies[randomIntInclusive(0, enemies.length - 1)];
    startCombat(picked);
  }, [game, currentRoom?.id, combat]);

  const gameClock = getGameClockFromStats(player?.Stats);
  const gameTimeLabel = formatGameClock(gameClock.minutes);
  const dayPart = getDayPartFromMinutes(gameClock.minutes);

  const playerPortrait = player?.PlayerPortrait || DEFAULT_PLAYER;
  const playerPortraitUrl = resolveMediaUrl(playerPortrait) || playerPortrait;
  const level = toSafeInt(player?.Stats?.Level ?? 0, 0);
  const mentalStatus = getMentalStatusForLevel(game?.leveling, level);
  const mentalLevelDisplay = mentalStatus?.type ? mentalStatus.display : getMentalLevelDisplayFromTable(player, level);
  const mentalDescription = mentalStatus?.description || null;

  const hp = player?.Stats?.Health ?? '?';
  const maxHp = player?.Stats?.MaxHealth ?? '?';
  const energy = player?.Stats?.Energy ?? '?';
  const maxEnergy = player?.Stats?.MaxEnergy ?? '?';
  const notoriety = player?.Stats?.Notoriety ?? 0;
  const maxNotoriety = player?.Stats?.MaxNotoriety ?? 100;
  const credits = player?.Credits ?? 0;

  const equippedBonuses = getEquippedBonuses(equippedInventory, game?.objectMap);

  const ms = (player?.Stats?.MS ?? 0) + equippedBonuses.ms;
  const mentalStrength = player?.Stats?.MentalStrength ?? 0;
  const defence = (player?.Stats?.Defence ?? 0) + (combat ? equippedBonuses.defence : 0);
  const agility = player?.Stats?.Agility ?? 0;
  const speed = player?.Stats?.Speed ?? 0;
  const daysInGame = gameClock.day;

  const experience = toSafeInt(player?.Stats?.Experience ?? 0, 0);
  const experienceCheckpoints = getExperienceCheckpoints(player, game?.leveling);
  const configMaxLevelRaw = Number(game?.leveling?.maxLevel);
  const maxLevel = Number.isFinite(configMaxLevelRaw)
    ? Math.max(0, Math.min(Math.trunc(configMaxLevelRaw), experienceCheckpoints.length))
    : Math.max(0, experienceCheckpoints.length - 1);
  const expToNext = level < maxLevel ? toSafeInt(experienceCheckpoints[level], 0) : null;

  const locationName = currentRoom?.name || currentRoom?.Name || 'Unknown location';
  const locationDescription = currentRoom?.description || currentRoom?.Description || '';
  const locationBg = currentRoom?.media || DEFAULT_BG;

  const inventory = Array.isArray(player?.Inventory) ? player.Inventory : [];
  const inventoryItems = inventory.map(item => {
    const id = item?.UniqueID || item?.id || item?.Name || 'unknown';
    const obj = game?.objectMap?.[id] || null;
    const baseName = item?.Name || obj?.Name || id;
    const quantity = Math.max(1, toSafeInt(item?.Quantity ?? item?.Qty ?? item?.Count ?? 1, 1));
    const label = quantity > 1 ? `${baseName} ×${quantity}` : baseName;
    return { id, name: baseName, label, quantity, obj };
  });

  const effectiveSelectedInventoryId = selectedInventoryId || inventoryItems[0]?.id || null;
  const selectedInventoryItem =
    (effectiveSelectedInventoryId && inventoryItems.find(item => item.id === effectiveSelectedInventoryId)) || null;

  const toggleEquipped = itemId => {
    const id = String(itemId ?? '').trim();
    if (!id) return;
    if (combat) return;
    const current = Boolean(equippedInventory?.[id]);
    setItemEquipped(id, !current);
  };

  const exits = Array.isArray(currentRoom?.exits) ? currentRoom.exits : [];

  const handleExamineRoom = () => {
    if (!game || !currentRoom) return;
    if (combat) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    const result = game.eventEngine.runEvent('Examine Room', { entityType: 'room', entityId: currentRoom.id, room: currentRoom });
    setEventMessages(result?.texts || []);
    setEventMedia(result?.media || null);
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);
  };

  const toggleInspect = (type, id, entity) => {
    if (!id) return;
    if (combat) return;
    if (type === 'object') setHoveredObjectMenuId(null);
    const willSelect = !(inspectTarget.type === type && inspectTarget.id === id);
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setInspectTarget(prev => {
      if (prev.type === type && prev.id === id) return { type: 'room', id: currentRoom?.id ?? null };
      return { type, id };
    });

    if (!willSelect || !game) return;
    const entityType = type === 'npc' ? 'character' : type;
    const result = game.eventEngine.runEvent('<<On Click>>', { entityType, entityId: id, entity, room: currentRoom });
    setEventMessages(result?.texts || []);
    setEventMedia(result?.media || null);
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);
  };

  const resolvedRoomObjects = (roomObjects || []).map(resolveRoomObject);

  const inspectedObject =
    inspectTarget.type === 'object'
      ? resolvedRoomObjects.find(obj => (obj?.id ?? obj?.UniqueID) === inspectTarget.id) ||
        (inspectTarget.id ? game?.objectMap?.[inspectTarget.id] || null : null) ||
        null
      : null;

  const inspectedNpc =
    inspectTarget.type === 'npc'
      ? (roomNpcs || []).find(npc => (npc?.id ?? npc?.UniqueID) === inspectTarget.id) || null
      : null;

  const shopPreviewMedia =
    !combat && activeDrawer === 'vendor' && shopHoveredItemId
      ? game?.objectMap?.[shopHoveredItemId]?.media || game?.objectMap?.[shopHoveredItemId]?.Picture || null
      : null;

  const inventoryPreviewMedia =
    !combat && activeDrawer === 'inventory' ? selectedInventoryItem?.obj?.media || selectedInventoryItem?.obj?.Picture || null : null;

  const inspectedMedia = inspectedObject?.media || inspectedNpc?.media || null;
  const combatEnemy = combat ? game?.characterMap?.[combat.enemyId] || null : null;

  const normalizeMediaKey = value => String(value ?? '').trim().replace(/^\/+/, '');
  const overlayMedia = combat?.enemyPicture || shopPreviewMedia || eventMedia || inspectedMedia || inventoryPreviewMedia || null;
  const showOverlayMedia = Boolean(overlayMedia && normalizeMediaKey(overlayMedia) !== normalizeMediaKey(locationBg));
  const overlayMediaUrl = resolveMediaUrl(overlayMedia);

  const inspectedTitle =
    inspectedObject?.name ||
    inspectedObject?.Name ||
    inspectedNpc?.name ||
    inspectedNpc?.Name ||
    inspectedNpc?.Charname ||
    null;
  const inspectedDescription =
    inspectedObject?.description || inspectedObject?.Description || inspectedNpc?.description || inspectedNpc?.Description || null;

  const overlayTitle = (() => {
    if (combat) return combat?.enemyName || null;

    if (!combat && activeDrawer === 'vendor' && shopHoveredItemId) {
      const obj = game?.objectMap?.[shopHoveredItemId] ?? null;
      return obj?.Name || obj?.name || null;
    }

    if (inspectedMedia && inspectedTitle) return inspectedTitle;

    if (!combat && activeDrawer === 'inventory' && inventoryPreviewMedia) {
      return selectedInventoryItem?.name || null;
    }

    if (eventMedia && eventMediaTitle) return eventMediaTitle;

    return null;
  })();

  const overlayKey = showOverlayMedia && overlayMediaUrl ? `${overlayMediaUrl}|${overlayTitle || ''}|${shopPurchaseNotice?.key || ''}` : null;
  const overlayDismissed = Boolean(dismissedOverlayKey && overlayKey && dismissedOverlayKey === overlayKey);
  const showOverlayMediaPanel = Boolean(showOverlayMedia && overlayMediaUrl && !overlayDismissed);

  useEffect(() => {
    if (!dismissedOverlayKey) return;
    if (!overlayKey) {
      setDismissedOverlayKey(null);
      return;
    }
    if (overlayKey !== dismissedOverlayKey) setDismissedOverlayKey(null);
  }, [dismissedOverlayKey, overlayKey]);

  if (error) return <div style={{ color: 'red', padding: '2rem', fontSize: '1.2rem' }}>Error: {error}</div>;
  if (!game || !currentRoom || !player) return <div style={{ padding: '1.5rem', color: '#e0d9c5' }}>Loading game…</div>;

  const inspectedDescriptionHtml = inspectedDescription ? ragsToHtml(inspectedDescription, { game, room: currentRoom }) : null;
  const locationDescriptionHtml = ragsToHtml(locationDescription, { game, room: currentRoom });
  const eventMessageEntries =
    !combat && eventMessages.length
      ? eventMessages.slice(-3).map((line, idx) => ({
          key: `${idx}:${String(line).slice(0, 16)}`,
          html: ragsToHtml(String(line), { game, room: currentRoom })
        }))
      : [];

  const maxCornerItems = 6;
  const visibleObjects = resolvedRoomObjects.slice(0, maxCornerItems);
  const hiddenObjectCount = Math.max(0, resolvedRoomObjects.length - maxCornerItems);
  const visibleNpcs = (roomNpcs || []).slice(0, maxCornerItems);
  const hiddenNpcCount = Math.max(0, (roomNpcs || []).length - maxCornerItems);

  const getVendorShopEntriesForObject = obj => {
    const raw = resolveVendorShopItems(obj);
    return raw
      .map(entry => {
        const itemId = String(entry?.UniqueID ?? entry?.id ?? '').trim();
        if (!itemId) return null;
        const itemObj = game?.objectMap?.[itemId] ?? null;
        const itemName = itemObj?.Name || itemObj?.name || itemId;
        const price = toSafeInt(entry?.Price ?? itemObj?.Price ?? 0, 0);
        const stackable = String(itemObj?.Type ?? itemObj?.type ?? '').trim().toLowerCase() === 'consumable';
        return { itemId, itemName, price, stackable };
      })
      .filter(Boolean);
  };

  const inspectedObjectInRoom = Boolean(
    inspectTarget.type === 'object' && resolvedRoomObjects.some(obj => (obj?.id ?? obj?.UniqueID) === inspectTarget.id)
  );
  const canTakeInspectedObject = inspectedObjectInRoom && canTakeObject(inspectedObject);
  const canShopInspectedObject = inspectedObjectInRoom && isVendorObject(inspectedObject);

  const runEntityActionEvent = ({ entityType, entityId, entity, eventType, label } = {}) => {
    if (!game || !currentRoom) return;
    if (combat) return;
    const name = String(eventType ?? '').trim();
    if (!name) return;

    const result = game.eventEngine.runEvent(name, { entityType, entityId, entity, room: currentRoom });
    const texts = Array.isArray(result?.texts) && result.texts.length ? result.texts : [`<b>${label || name}</b>.`];

    setEventMedia(result?.media || null);
    setEventMediaTitle(null);
    setEventMessages(texts);
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const buildActionsDrawerModel = () => {
    if (combat) return null;

    const roomTitle = locationName;
    const roomDescriptionText = currentRoom?.description || currentRoom?.Description || '';

    if (inspectTarget.type === 'npc' && inspectedNpc) {
      const npcId = inspectedNpc?.id ?? inspectedNpc?.UniqueID ?? null;
      const npcName = inspectedNpc?.Charname || inspectedNpc?.name || inspectedNpc?.Name || 'NPC';
      const npcDesc = inspectedNpc?.Description || inspectedNpc?.description || '';

      const menu = Array.isArray(inspectedNpc?.ActionsMenu) ? inspectedNpc.ActionsMenu : [];
      const menuActions = menu
        .map(entry => ({
          label: String(entry?.Action ?? '').trim(),
          description: String(entry?.Description ?? '').trim() || null
        }))
        .filter(entry => entry.label);

      const menuActionKeys = new Set(menuActions.map(entry => normalizeActionName(entry.label)));
      const playerAbilities = Array.isArray(player?.Abilities) ? player.Abilities : [];
      const abilityActions = playerAbilities
        .map(ability => ({
          label: String(ability?.Name ?? '').trim(),
          description: String(ability?.Tooltip ?? '').trim() || null,
          combat: Boolean(ability?.Combat ?? ability?.combat ?? false)
        }))
        .filter(entry => entry.label && !entry.combat && !menuActionKeys.has(normalizeActionName(entry.label)));

      const interactItems = menuActions.map(entry => {
        const actionKey = normalizeActionName(entry.label);
        const id = `npc:${npcId || 'unknown'}:${actionKey}`;
        if (actionKey === 'talk' && resolveVendorShopItems(inspectedNpc).length > 0) {
          return { id, label: entry.label, description: entry.description, onClick: () => openVendorShop(inspectedNpc) };
        }
        if (actionKey === 'attack') {
          return { id, label: entry.label, description: entry.description, onClick: () => startCombat(inspectedNpc) };
        }
        if (actionKey === 'examine') {
          return { id, label: entry.label, description: entry.description, onClick: () => examineNpc(inspectedNpc) };
        }
        return {
          id,
          label: entry.label,
          description: entry.description,
          onClick: () =>
            runEntityActionEvent({
              entityType: 'character',
              entityId: npcId,
              entity: inspectedNpc,
              eventType: entry.label,
              label: `${npcName}: ${entry.label}`
            })
        };
      });

      const abilityItems = abilityActions.map(entry => ({
        id: `npc:${npcId || 'unknown'}:ability:${normalizeActionName(entry.label)}`,
        label: entry.label,
        description: entry.description,
        onClick: () =>
          runEntityActionEvent({
            entityType: 'character',
            entityId: npcId,
            entity: inspectedNpc,
            eventType: entry.label,
            label: `${npcName}: ${entry.label}`
          })
      }));

      const sections = [];
      if (interactItems.length) sections.push({ title: 'Interact', items: interactItems });
      if (abilityItems.length) sections.push({ title: 'Abilities', items: abilityItems });
      return { title: npcName, description: npcDesc, sections };
    }

    if (inspectTarget.type === 'object' && inspectedObject) {
      const objId = inspectedObject?.id ?? inspectedObject?.UniqueID ?? null;
      const objName = inspectedObject?.name || inspectedObject?.Name || 'Object';
      const objDesc = inspectedObject?.description || inspectedObject?.Description || '';

      const actions = Array.isArray(inspectedObject?.ActionsMenu) ? inspectedObject.ActionsMenu : [];
      const actionItems = actions
        .map(entry => ({
          label: String(entry?.Action ?? '').trim(),
          description: String(entry?.Description ?? '').trim() || null
        }))
        .filter(entry => entry.label);

      const vendorEntries = getVendorShopEntriesForObject(inspectedObject);
      const items = actionItems
        .map(entry => {
          const actionKey = normalizeActionName(entry.label);
          if (actionKey === 'drop' && inspectedObjectInRoom) return null;

          const id = `obj:${objId || 'unknown'}:${actionKey}`;
          if (actionKey === 'examine') {
            return { id, label: entry.label, description: entry.description, onClick: () => examineObject(inspectedObject) };
          }
          if (actionKey === 'take') {
            return {
              id,
              label: entry.label,
              description: entry.description,
              disabled: !canTakeInspectedObject,
              onClick: () => takeObject(inspectedObject)
            };
          }
          if (actionKey === 'shop') {
            return {
              id,
              label: entry.label,
              description: entry.description,
              disabled: !canShopInspectedObject,
              onClick: () => openVendorShop(inspectedObject)
            };
          }
          if (actionKey === 'open' || actionKey === 'close') {
            return { id, label: entry.label, description: entry.description, onClick: () => toggleContainerOpen(objId) };
          }

          if (actionKey.startsWith('buy ')) {
            const wanted = actionKey.replace(/^buy\s+/, '').trim();
            const match =
              vendorEntries.find(row => normalizeActionName(row.itemName) === wanted) ||
              vendorEntries.find(row => normalizeActionName(row.itemName).includes(wanted)) ||
              vendorEntries.find(row => wanted.includes(normalizeActionName(row.itemName))) ||
              null;

            if (match) {
              return {
                id,
                label: entry.label,
                description: entry.description,
                disabled: !canShopInspectedObject,
                onClick: () => buyVendorItem({ vendorId: objId, itemId: match.itemId, price: match.price })
              };
            }

            return {
              id,
              label: entry.label,
              description: entry.description,
              disabled: !canShopInspectedObject,
              onClick: () => openVendorShop(inspectedObject)
            };
          }

          return {
            id,
            label: entry.label,
            description: entry.description,
            onClick: () =>
              runEntityActionEvent({
                entityType: 'object',
                entityId: objId,
                entity: inspectedObject,
                eventType: entry.label,
                label: `${objName}: ${entry.label}`
              })
          };
        })
        .filter(Boolean);

      return { title: objName, description: objDesc, sections: items.length ? [{ title: 'Actions', items }] : [] };
    }

    return {
      title: roomTitle,
      description: roomDescriptionText,
      sections: [
        {
          title: 'Room',
          items: [
            { id: 'room:examine', label: 'Examine Room', description: 'Inspect your surroundings.', onClick: handleExamineRoom },
            { id: 'room:navigation', label: 'Navigation', description: 'Choose an exit.', onClick: () => toggleDrawer('navigation') }
          ]
        }
      ]
    };
  };

  const actionsDrawerModel = activeDrawer === 'actions' ? buildActionsDrawerModel() : null;

  const exitCombat = () => {
    const returnRoomId = combat?.roomId ?? currentRoom?.id ?? null;
    setCombat(null);
    setCombatMenuEntered(false);
    if (activeDrawer === 'combat') setActiveDrawer(null);

    if (game && returnRoomId && game.roomMap?.[returnRoomId]) {
      game.player.CurrentRoom = returnRoomId;
      updateRoom(game.roomMap[returnRoomId], game);
    } else if (game) {
      updateRoom(game.getCurrentRoom(), game);
    }
  };

  const restartGame = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  const runCombatAction = action => {
    if (!game || !currentRoom || !combat) return;
    const enemy = combatEnemy;
    if (!enemy) return;

    const nextCombat = performCombatTurn({
      game,
      room: currentRoom,
      combat,
      enemy,
      action,
      playerArmorBonus: equippedBonuses.defence,
      playerAttackBonus: equippedBonuses.ms
    });
    const costResult = applyCombatActionCosts(game.player, action);
    const nextEnergy = costResult.energy !== null ? toSafeInt(costResult.energy, 0) : toSafeInt(nextCombat?.playerEnergy, 0);
    setCombat(nextCombat ? { ...nextCombat, playerEnergy: nextEnergy } : nextCombat);
    setPlayer({ ...game.player, Stats: { ...game.player.Stats } });
    openLevelUpNotice(nextCombat?.rewards?.levelProgression, game.player, game.leveling);
  };

  const equippedWeapons = inventoryItems.filter(item => Boolean(equippedInventory[item.id]) && isWeaponObject(item.obj));
  const weaponOptions = equippedWeapons.length
    ? equippedWeapons.map(item => ({
        ...item,
        weaponBonus: toSafeInt(item?.obj?.WeaponBonus ?? item?.obj?.Bonuses?.WeaponBonus ?? 0, 0)
      }))
    : [{ id: '__fist__', name: 'Fist', obj: null, weaponBonus: 0 }];

  const combatAbilities = [];
  const combatLevel = player?.Stats?.Level ?? 0;
  const combatEnergy = combat?.playerEnergy ?? player?.Stats?.Energy ?? 0;

  const playerAbilities = Array.isArray(player?.Abilities) ? player.Abilities : [];
  const unlockedCombatAbilities = playerAbilities
    .map(ability => {
      const name = String(ability?.Name ?? '').trim();
      if (!name) return null;
      const combatOnly = Boolean(ability?.Combat ?? ability?.combat ?? false);
      if (!combatOnly) return null;
      const energyCost = toSafeInt(ability?.EnergyCost ?? ability?.energyCost ?? 0, 0);
      return { id: `ability:${normalizeActionName(name)}`, name, energyCost };
    })
    .filter(Boolean);

  if (unlockedCombatAbilities.length) {
    combatAbilities.push(...unlockedCombatAbilities);
  } else if (combatLevel >= 1) {
    combatAbilities.push({ id: 'mental_blast', name: 'Mental Blast', energyCost: 10 });
  }

  const showCombatFlash = Boolean(combat?.lastEffects?.some(effect => effect?.critical));
  const combatEffects = Array.isArray(combat?.lastEffects) ? combat.lastEffects : [];
  const combatLoot = Array.isArray(combat?.rewards?.loot) ? combat.rewards.loot : [];
  const showCombatRewards = Boolean(combat?.rewards && (combat.rewards.exp || combat.rewards.credits || combatLoot.length));

  const playerHpPercent = combat ? Math.round((Number(combat.playerHp) / Math.max(1, Number(combat.playerMaxHp))) * 100) : 0;
  const playerEnergyPercent = combat ? Math.round((Number(combat.playerEnergy) / Math.max(1, Number(combat.playerMaxEnergy))) * 100) : 0;
  const enemyHpPercent = combat ? Math.round((Number(combat.enemyHp) / Math.max(1, Number(combat.enemyMaxHp))) * 100) : 0;
  const enemyEnergyPercent = combat ? Math.round((Number(combat.enemyEnergy) / Math.max(1, Number(combat.enemyMaxEnergy))) * 100) : 0;

  return (
    <div className="main-container">
      <aside className={`left-panel rpg-frame${activeDrawer ? ' drawer-open' : ''}`}>
        <div className="left-panel-bar">
          <div className="time-block" title="Game time">
            <span className="game-hour">{gameTimeLabel}</span>
            <span className="game-daypart">
              {dayPart} · Day {daysInGame}
            </span>
          </div>

          <button
            className={`player-avatar-btn${activeDrawer === 'player' ? ' active' : ''}`}
            type="button"
            aria-label="Player"
            title="Player"
            onClick={() => toggleDrawer('player')}
          >
            <img src={playerPortraitUrl} alt="Player" className="player-pic" />
          </button>

          <div className="sidebar-buttons">
            <button
              className={`sidebar-btn${activeDrawer === 'inventory' ? ' active' : ''}`}
              type="button"
              title="Inventory"
              aria-label="Inventory"
              onClick={() => toggleDrawer('inventory')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M16 3v4M8 3v4" />
              </svg>
            </button>

            <button
              className={`sidebar-btn${activeDrawer === 'settings' ? ' active' : ''}`}
              type="button"
              title="Settings"
              aria-label="Settings"
              onClick={() => toggleDrawer('settings')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 12 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button
              className={`sidebar-btn${activeDrawer === 'navigation' ? ' active' : ''}`}
              type="button"
              title="Navigate"
              aria-label="Navigate"
              disabled={Boolean(combat)}
              onClick={() => toggleDrawer('navigation')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polygon points="12 7 15 15 12 13 9 15 12 7" />
              </svg>
            </button>

            <button
              className={`sidebar-btn${activeDrawer === 'actions' ? ' active' : ''}`}
              type="button"
              title="Actions"
              aria-label="Actions"
              disabled={Boolean(combat)}
              onClick={openActionsMenu}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M8 12h.01M12 12h.01M16 12h.01" />
              </svg>
            </button>
          </div>
        </div>

        <div className="left-panel-drawer" aria-hidden={!activeDrawer}>
          {activeDrawer && (
            <>
              <div className="drawer-header">
                <div className="drawer-title">
                  {activeDrawer === 'player'
                    ? 'Player'
                    : activeDrawer === 'inventory'
                      ? 'Inventory'
                      : activeDrawer === 'settings'
                        ? 'Settings'
                      : activeDrawer === 'vendor'
                        ? 'Vendor'
                      : activeDrawer === 'navigation'
                        ? 'Navigation'
                      : activeDrawer === 'actions'
                        ? 'Actions'
                        : 'Combat'}
                </div>
                <button className="drawer-close-btn" type="button" aria-label="Close" onClick={closeDrawer}>
                  ×
                </button>
              </div>

              {activeDrawer === 'player' && (
                <PlayerDrawer
                  player={player}
                  playerPortraitUrl={playerPortraitUrl}
                  mentalLevelDisplay={mentalLevelDisplay}
                  mentalDescription={mentalDescription}
                  ms={ms}
                  mentalStrength={mentalStrength}
                  agility={agility}
                  hp={hp}
                  maxHp={maxHp}
                  energy={energy}
                  maxEnergy={maxEnergy}
                  equippedBonuses={equippedBonuses}
                  speed={speed}
                  experience={experience}
                  expToNext={expToNext}
                  daysInGame={daysInGame}
                  notoriety={notoriety}
                  maxNotoriety={maxNotoriety}
                  credits={credits}
                  defence={defence}
                  onShowAchievements={() => {
                    setEventMedia(null);
                    setEventMediaTitle(null);
                    setEventMessages([`<b>Achievements</b> (TODO): track fights, objectives, runs/wins, missions completed.`]);
                  }}
                  onShowAbilities={() => {
                    const abilities = Array.isArray(player?.Abilities) ? player.Abilities : [];
                    const lines = abilities.length
                      ? abilities.map(entry => `<b>${entry?.Name ?? 'Ability'}</b> - ${entry?.Tooltip ?? ''}`).filter(Boolean)
                      : ['No abilities yet.'];
                    setEventMedia(null);
                    setEventMediaTitle(null);
                    setEventMessages([`<b>Abilities</b>`, ...lines]);
                  }}
                />
              )}

              {activeDrawer === 'actions' && actionsDrawerModel ? (
                <ActionsDrawer title={actionsDrawerModel.title} description={actionsDrawerModel.description} sections={actionsDrawerModel.sections} />
              ) : null}

              {activeDrawer === 'inventory' && (
                <div className="drawer-body">
                  <ul className="inventory-list">
                    {inventoryItems.length ? (
                      inventoryItems.map(item => {
                        const itemId = item.id;
                        const itemObj = item?.obj ?? null;
                        const itemIsContainer = isContainerObject(itemObj);
                        const itemIsEquipable = canEquipObject(itemObj);
                        const isEquipped = Boolean(equippedInventory?.[itemId]);
                        const isOpen = Boolean(containerUi?.[itemId]?.open);
                        const badgeLabel = itemIsEquipable ? (isEquipped ? 'ON' : 'OFF') : itemIsContainer ? (isOpen ? 'OPEN' : 'BAG') : null;
                        const badgeClass = itemIsEquipable ? (isEquipped ? 'on' : 'off') : itemIsContainer ? (isOpen ? 'on' : 'off') : '';

                        return (
                          <li key={itemId}>
                            <button
                              type="button"
                              className={`inventory-item${effectiveSelectedInventoryId === itemId ? ' selected' : ''}`}
                              onClick={() => setSelectedInventoryId(itemId)}
                            >
                              <span className="inventory-item-name">{item.label}</span>
                              {badgeLabel ? <span className={`badge ${badgeClass}`}>{badgeLabel}</span> : null}
                            </button>
                          </li>
                        );
                      })
                    ) : (
                      <li className="drawer-muted">No items</li>
                    )}
                  </ul>

                  {selectedInventoryItem && (
                    <div className="inventory-actions">
                      <div className="drawer-subtitle">{selectedInventoryItem.name}</div>
                      {selectedInventoryItem.obj?.Description && <div className="drawer-muted">{selectedInventoryItem.obj.Description}</div>}
                      <div className="inventory-action-row">
                        {isContainerObject(selectedInventoryItem.obj) ? (
                          <button type="button" className="drawer-action-btn" onClick={() => toggleContainerOpen(selectedInventoryItem.id)}>
                            {containerUi?.[selectedInventoryItem.id]?.open ? 'Close' : 'Open'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="drawer-action-btn"
                            onClick={() => toggleEquipped(selectedInventoryItem.id)}
                            disabled={!canEquipObject(selectedInventoryItem.obj)}
                          >
                            {equippedInventory[selectedInventoryItem.id] ? 'Unequip' : 'Equip'}
                          </button>
                        )}
                        {(() => {
                          const obj = selectedInventoryItem.obj;
                          const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
                          const actions = getObjectActionNames(obj);
                          const canUse = type === 'consumable' || actions.includes('use');
                          return canUse ? (
                            <button type="button" className="drawer-action-btn" onClick={() => useConsumableItem(selectedInventoryItem)}>
                              Use
                            </button>
                          ) : null;
                        })()}
                        <button type="button" className="drawer-action-btn" onClick={() => dropInventoryItem(selectedInventoryItem)}>
                          Drop
                        </button>
                        <button type="button" className="drawer-action-btn" onClick={() => examineInventoryItem(selectedInventoryItem)}>
                          Examine
                        </button>
                      </div>

                      {isContainerObject(selectedInventoryItem.obj) && containerUi?.[selectedInventoryItem.id]?.open ? (
                        <div className="container-contents">
                          <div className="drawer-subtitle">Contents</div>
                          <ul className="container-contents-list" aria-label={`${selectedInventoryItem.name} contents`}>
                            {(() => {
                              const containerId = selectedInventoryItem.id;
                              const containerObj = game?.objectMap?.[containerId] ?? selectedInventoryItem.obj ?? null;
                              const contentMeta = new Map();
                              if (Array.isArray(containerObj?.Contents)) {
                                for (const entry of containerObj.Contents) {
                                  const entryId = String(entry?.UniqueID ?? entry?.id ?? '').trim();
                                  if (entryId) contentMeta.set(entryId, entry);
                                }
                              }
                              const defaultContents = Array.isArray(containerObj?.Contents)
                                ? containerObj.Contents.map(entry => String(entry?.UniqueID ?? entry?.id ?? '').trim()).filter(Boolean)
                                : [];
                              const contentIds = Array.isArray(containerUi?.[containerId]?.contents)
                                ? containerUi[containerId].contents
                                : defaultContents;

                              if (!contentIds.length) return <li className="drawer-muted">Empty</li>;

                              return contentIds.map(contentId => {
                                const contentObj = game?.objectMap?.[contentId] ?? null;
                                const contentEntry = contentMeta.get(contentId) || null;
                                const contentName = contentObj?.Name || contentObj?.name || contentEntry?.Name || contentId;
                                const contentEquipable = canEquipObject(contentObj);
                                const contentIsContainer = isContainerObject(contentObj);
                                const contentInInventory = hasInventoryItem(contentId);
                                const contentEquipped = Boolean(equippedInventory?.[contentId]);
                                const menuVisible = hoveredContainerItemId === contentId;
                                let contentOpen = Boolean(containerUi?.[contentId]?.open);
                                if (contentIsContainer && contentObj) {
                                  const closedFlag = getCustomProperty(contentObj, 'Closed');
                                  if (closedFlag !== undefined) contentOpen = !Boolean(closedFlag);
                                  else {
                                    const openedFlag = getCustomProperty(contentObj, 'Opened');
                                    if (openedFlag !== undefined) contentOpen = Boolean(openedFlag);
                                  }
                                }

                                return (
                                  <li key={contentId}>
                                    <div
                                      className="container-item-wrap"
                                      onMouseEnter={() => setHoveredContainerItemId(contentId)}
                                      onMouseLeave={() => setHoveredContainerItemId(prev => (prev === contentId ? null : prev))}
                                    >
                                      <button
                                        type="button"
                                        className="container-item-btn"
                                        onClick={() => {
                                          setHoveredContainerItemId(null);
                                          examineObject({ ...(contentObj || {}), id: contentId, UniqueID: contentId });
                                        }}
                                      >
                                        <span className="container-item-name">{contentName}</span>
                                        {contentEquipable ? <span className={`badge ${contentEquipped ? 'on' : 'off'}`}>{contentEquipped ? 'ON' : 'OFF'}</span> : null}
                                      </button>

                                      {menuVisible ? (
                                        <div className="container-tooltip" role="menu" aria-label={`${contentName} actions`}>
                                          <button
                                            type="button"
                                            className="container-tooltip-btn"
                                            onClick={event => {
                                              event.stopPropagation();
                                              setHoveredContainerItemId(null);
                                              examineObject({ ...(contentObj || {}), id: contentId, UniqueID: contentId });
                                            }}
                                          >
                                            Examine
                                          </button>

                                          {!contentInInventory ? (
                                            <button
                                              type="button"
                                              className="container-tooltip-btn"
                                              onClick={event => {
                                                event.stopPropagation();
                                                takeFromContainerToInventory({ containerId, itemId: contentId, autoEquip: false });
                                              }}
                                            >
                                              Take
                                            </button>
                                          ) : null}

                                          {contentIsContainer ? (
                                            <button
                                              type="button"
                                              className="container-tooltip-btn"
                                              onClick={event => {
                                                event.stopPropagation();
                                                setHoveredContainerItemId(null);
                                                toggleContainerOpen(contentId);
                                              }}
                                            >
                                              {contentOpen ? 'Close' : 'Open'}
                                            </button>
                                          ) : null}

                                          {contentEquipable ? (
                                            <>
                                              <button
                                                type="button"
                                                className="container-tooltip-btn"
                                                disabled={contentEquipped}
                                                onClick={event => {
                                                  event.stopPropagation();
                                                  setHoveredContainerItemId(null);
                                                  if (contentInInventory) setItemEquipped(contentId, true);
                                                  else takeFromContainerToInventory({ containerId, itemId: contentId, autoEquip: true });
                                                }}
                                              >
                                                Equip
                                              </button>
                                              <button
                                                type="button"
                                                className="container-tooltip-btn"
                                                disabled={!contentEquipped}
                                                onClick={event => {
                                                  event.stopPropagation();
                                                  setHoveredContainerItemId(null);
                                                  setItemEquipped(contentId, false);
                                                }}
                                              >
                                                Unequip
                                              </button>
                                            </>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  </li>
                                );
                              });
                            })()}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {activeDrawer === 'settings' && (
                <div className="drawer-body">
                  <div className="drawer-subtitle">Save / Load</div>
                  <div className="drawer-muted">
                    Editing `public/DB/*.json` may not show up if `DB/savegame.json` (or browser localStorage) overrides the same fields. Use Load or Reset to
                    refresh.
                  </div>
                  <div className="drawer-muted">
                    Live DB reload: {import.meta.env.DEV ? 'ON (edits to public/DB auto-reload)' : 'OFF (run `npm run dev` for live updates)'}
                  </div>
                  <div className="drawer-muted">
                    App version: {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}
                  </div>
                  <div className="inventory-action-row">
                    <button type="button" className="drawer-action-btn" onClick={handleNewGame} disabled={Boolean(combat)}>
                      New Game
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={handleSaveGame} disabled={!game}>
                      Save Game
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={handleLoadGame}>
                      Load Game
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={handleResetSave} disabled={Boolean(combat)}>
                      Reset Save
                    </button>
                  </div>
                  {Array.isArray(game?.loadErrors) && game.loadErrors.length ? (
                    <div className="drawer-warning" role="alert">
                      <div className="drawer-warning-title">DB warnings ({game.loadErrors.length})</div>
                      <ul className="drawer-warning-list">
                        {game.loadErrors.slice(0, 6).map((entry, idx) => (
                          <li key={`${entry?.path || 'unknown'}:${idx}`}>
                            <code>{entry?.path || 'unknown'}</code>: {entry?.error || 'Failed to load JSON'}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}

              {activeDrawer === 'vendor' && (
                <div className="drawer-body">
                  {(() => {
                    const vendor =
                      (shopVendorId && (roomObjects || []).find(obj => (obj?.id ?? obj?.UniqueID) === shopVendorId)) ||
                      (shopVendorId && (roomNpcs || []).find(npc => (npc?.id ?? npc?.UniqueID) === shopVendorId)) ||
                      (roomObjects || []).find(obj => isVendorObject(obj)) ||
                      (roomNpcs || []).find(npc => isVendorObject(npc)) ||
                      null;

                    if (!vendor) return <div className="drawer-muted">No vendor available in this location.</div>;

                    const vendorId = resolveEntityId(vendor) || '';
                    const vendorTemplate = vendorId ? game?.objectMap?.[vendorId] ?? game?.characterMap?.[vendorId] ?? null : null;
                    const vendorName =
                      vendor?.name || vendor?.Name || vendor?.Charname || vendorTemplate?.name || vendorTemplate?.Name || vendorTemplate?.Charname || 'Vendor';
                    const vendorDesc =
                      vendor?.Description || vendor?.description || vendorTemplate?.Description || vendorTemplate?.description || '';

                    const rawShopItems = resolveVendorShopItems(vendor);
                    const entries = rawShopItems
                      .map(entry => {
                        const id = String(entry?.UniqueID ?? entry?.id ?? '').trim();
                        if (!id) return null;
                        const obj = game?.objectMap?.[id] ?? null;
                        const name = obj?.Name || obj?.name || id;
                        const description = obj?.Description || obj?.description || '';
                        const media = obj?.media || obj?.Picture || null;
                        const price = toSafeInt(entry?.Price ?? obj?.Price ?? 0, 0);
                        const stackable = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase() === 'consumable';
                        return { id, name, description, media, price, obj, stackable };
                      })
                      .filter(Boolean);

                    return (
                      <>
                        <div className="drawer-subtitle">{vendorName}</div>
                        {vendorDesc ? <div className="drawer-muted">{vendorDesc}</div> : null}
                        <div className="drawer-muted">Credits: {credits}</div>

                        <ul className="shop-list" aria-label="Vendor items">
                          {entries.length ? (
                            entries.map(entry => {
                              const quantity = getInventoryQuantity(entry.id);
                              const owned = hasInventoryItem(entry.id) && !entry.stackable;
                              const affordable = credits >= entry.price;
                              return (
                                <li key={entry.id}>
                                  <div
                                    className={`shop-item${shopHoveredItemId === entry.id ? ' hovered' : ''}`}
                                    onMouseEnter={() => setShopHoveredItemId(entry.id)}
                                    onMouseLeave={() => setShopHoveredItemId(prev => (prev === entry.id ? null : prev))}
                                  >
                                    <div className="shop-item-main">
                                      <div className="shop-item-name">
                                        {entry.name}
                                        {entry.stackable && quantity > 0 ? ` ×${quantity}` : ''}
                                      </div>
                                      <div className="shop-item-price">{entry.price}c</div>
                                    </div>
                                    <button
                                      type="button"
                                      className="shop-buy-btn"
                                      disabled={owned || !affordable}
                                      title={owned ? 'Already owned' : !affordable ? 'Not enough credits' : 'Buy'}
                                      onClick={() => buyVendorItem({ vendorId, itemId: entry.id, price: entry.price })}
                                    >
                                      {owned ? 'Owned' : 'Buy'}
                                    </button>
                                  </div>
                                  {shopHoveredItemId === entry.id && entry.description ? (
                                    <div className="shop-item-desc">{entry.description}</div>
                                  ) : null}
                                </li>
                              );
                            })
                          ) : (
                            <li className="drawer-muted">No items for sale.</li>
                          )}
                        </ul>
                      </>
                    );
                  })()}
                </div>
              )}

              {activeDrawer === 'combat' && combat && (
                <div className="drawer-body">
                  <div className="drawer-subtitle">{combat.enemyName}</div>
                  <div className="drawer-muted">
                    You: {combat.playerHp}/{combat.playerMaxHp} · Energy: {combat.playerEnergy}/{combat.playerMaxEnergy}
                  </div>
                  <div className="drawer-muted">
                    Foe: {combat.enemyHp}/{combat.enemyMaxHp} · Energy: {combat.enemyEnergy}/{combat.enemyMaxEnergy}
                  </div>

                  {!combat.winner ? (
                    <div className="combat-options" aria-label="Combat options">
                      <div className="combat-options-section-title">Weapons</div>
                      <div className="combat-options-grid">
                        {weaponOptions.map(weapon => (
                          <button
                            key={weapon.id}
                            type="button"
                            className="combat-option-btn"
                            onClick={() => runCombatAction({ kind: 'weapon', name: weapon.name, weaponBonus: weapon.weaponBonus })}
                            disabled={Boolean(combat.winner)}
                          >
                            {weapon.name}
                          </button>
                        ))}
                      </div>

                      {combatAbilities.length ? (
                        <>
                          <div className="combat-options-section-title">Abilities</div>
                          <div className="combat-options-grid">
                            {combatAbilities.map(ability => {
                              const cost = Number(ability?.energyCost ?? 0);
                              const unavailable = cost > 0 && combatEnergy < cost;
                              return (
                                <button
                                  key={ability.id}
                                  type="button"
                                  className={`combat-option-btn${unavailable ? ' unavailable' : ''}`}
                                  aria-disabled={unavailable || Boolean(combat.winner)}
                                  title={unavailable ? `Requires ${cost} Energy` : undefined}
                                  onClick={() => runCombatAction({ kind: 'ability', name: ability.name, energyCost: ability.energyCost })}
                                  disabled={Boolean(combat.winner)}
                                >
                                  {ability.name}
                                  {cost ? ` (-${cost}E)` : ''}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : null}

                      <div className="combat-options-section-title">Other</div>
                      <div className="combat-options-grid">
                        <button type="button" className="combat-option-btn" onClick={() => runCombatAction({ kind: 'examine' })} disabled={Boolean(combat.winner)}>
                          Examine
                        </button>
                        <button type="button" className="combat-option-btn" onClick={() => runCombatAction({ kind: 'run' })} disabled={Boolean(combat.winner)}>
                          Run!
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="combat-footer">
                    {!combat.winner ? null : combat.winner === 'enemy' ? (
                      <button type="button" className="combat-footer-btn" onClick={restartGame}>
                        Restart
                      </button>
                    ) : (
                      <button type="button" className="combat-footer-btn" onClick={exitCombat}>
                        Continue
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeDrawer === 'navigation' && (
                <div className="drawer-body">
                  <div className="drawer-subtitle">{locationName}</div>
                  <ul className="nav-exit-list">
                    {exits.length ? (
                      exits.map((exit, idx) => (
                        <li key={`${exit.direction}:${exit.destinationId || exit.destinationRaw || idx}`}>
                          <button
                            type="button"
                            className="nav-exit-btn"
                            onClick={() => handleMove(exit.destinationId)}
                            disabled={!exit.destinationId}
                            title={exit.destinationId ? undefined : `Unresolved destination: ${exit.destinationRaw}`}
                          >
                            <span className="nav-dir">{exit.direction}</span>
                            <span className="nav-dest">{exit.destinationName || exit.destinationRaw}</span>
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="drawer-muted">No exits</li>
                    )}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <main className="main-area">
        <section className="media-window">
          <div
            className="media-bg"
            style={{ backgroundImage: `url(${resolveMediaUrl(locationBg) || locationBg})` }}
          />

          {showOverlayMediaPanel ? (
            <div
              key={`overlay:${overlayMediaUrl}:${shopHoveredItemId || ''}:${shopPurchaseNotice?.key || ''}`}
              className={`media-overlay-btn${activeDrawer === 'vendor' && shopHoveredItemId ? ' preview' : ''}${shopPurchaseNotice ? ' purchased' : ''}`}
            >
              <button
                type="button"
                className="media-overlay-close"
                aria-label="Close popup"
                title="Close"
                onClick={event => {
                  event.stopPropagation();
                  if (overlayKey) setDismissedOverlayKey(overlayKey);
                }}
              >
                ×
              </button>
              {overlayTitle ? <div className="media-overlay-title">{overlayTitle}</div> : null}
              {isVideoMedia(overlayMediaUrl) ? (
                <video className="media-overlay-media" src={overlayMediaUrl} autoPlay loop muted playsInline />
              ) : (
                <img className="media-overlay-media" src={overlayMediaUrl} alt="" />
              )}
              {shopPurchaseNotice ? <div className="media-overlay-badge">Purchased!</div> : null}
            </div>
          ) : null}
          {combat ? (
            <>
              {!combat.winner && !combatMenuEntered ? (
                <div className="combat-center-menu" aria-label="Combat menu">
                  <button type="button" className="combat-center-btn" onClick={openCombatMenu}>
                    Fight!
                  </button>
                  <button type="button" className="combat-center-btn" onClick={() => runCombatAction({ kind: 'run' })}>
                    Run!
                  </button>
                </div>
              ) : null}

              <div className="combat-portrait combat-portrait-player" title="Player">
                <div className="combat-bars">
                  <div className="combat-bar hp" title={`HP ${combat.playerHp}/${combat.playerMaxHp}`}>
                    <div className="combat-bar-fill" style={{ width: `${playerHpPercent}%` }} />
                  </div>
                  <div className="combat-bar energy" title={`Energy ${combat.playerEnergy}/${combat.playerMaxEnergy}`}>
                    <div className="combat-bar-fill" style={{ width: `${playerEnergyPercent}%` }} />
                  </div>
                </div>
                <img src={playerPortraitUrl} alt="Player" className="combat-portrait-img" />
              </div>

              <div className="combat-portrait combat-portrait-enemy" title={combat.enemyName}>
                <div className="combat-bars">
                  <div className="combat-bar hp" title={`HP ${combat.enemyHp}/${combat.enemyMaxHp}`}>
                    <div className="combat-bar-fill" style={{ width: `${enemyHpPercent}%` }} />
                  </div>
                  <div className="combat-bar energy" title={`Energy ${combat.enemyEnergy}/${combat.enemyMaxEnergy}`}>
                    <div className="combat-bar-fill" style={{ width: `${enemyEnergyPercent}%` }} />
                  </div>
                </div>
                <img
                  src={resolveMediaUrl(combat.enemyPicture) || combat.enemyPicture}
                  alt={combat.enemyName}
                  className="combat-portrait-img"
                />
              </div>

              {showCombatFlash ? <div key={`flash:${combat.turn}`} className="combat-flash" aria-hidden="true" /> : null}
              {combatEffects.map((effect, idx) => {
                const target = effect?.target === 'player' ? 'player' : 'enemy';
                const critical = Boolean(effect?.critical);
                const amount = Number(effect?.amount ?? 0);
                return (
                  <div
                    key={`fx:${combat.turn}:${idx}:${target}`}
                    className={`combat-float combat-float-${target}${critical ? ' crit' : ''}`}
                    aria-hidden="true"
                  >
                    -{amount}
                  </div>
                );
              })}

              {combat?.winner ? (
                <button
                  type="button"
                  className="combat-result-overlay"
                  onClick={combat.winner === 'enemy' ? restartGame : exitCombat}
                  aria-label="Close combat result"
                >
                  <div className="combat-result-card">
                    <div className="combat-result-title">
                      {combat.winner === 'player' ? 'Victory!' : combat.winner === 'fled' ? 'Escaped' : 'Defeat'}
                    </div>
                    <div className="combat-result-subtitle">{combat.enemyName}</div>
                    {showCombatRewards ? (
                      <div className="combat-result-rewards">
                        {combat?.rewards?.exp ? `+${combat.rewards.exp} XP` : null}
                        {combat?.rewards?.exp && (combat?.rewards?.credits || combatLoot.length) ? ' · ' : null}
                        {combat?.rewards?.credits ? `+${combat.rewards.credits} Credits` : null}
                        {combat?.rewards?.credits && combatLoot.length ? ' · ' : null}
                        {combatLoot.length ? `Loot: ${combatLoot.join(', ')}` : null}
                      </div>
                    ) : null}
                    <div className="combat-result-hint">{combat.winner === 'enemy' ? 'Click to restart' : 'Click to continue'}</div>
                  </div>
                </button>
              ) : null}
            </>
          ) : null}
          <LocationTitle visible={!showOverlayMediaPanel} combat={combat} locationName={locationName} onExamineRoom={handleExamineRoom} />

          <LevelUpNotifier
            key={levelUpNotice?.key || 'levelup'}
            open={Boolean(levelUpNotice)}
            level={levelUpNotice?.level}
            title={levelUpNotice?.title}
            levelsGained={levelUpNotice?.levelsGained}
            media={levelUpNotice?.media}
            onClose={() => setLevelUpNotice(null)}
          />

          <NpcCorner visible={!combat} npcs={visibleNpcs} hiddenCount={hiddenNpcCount} inspectTarget={inspectTarget} onInspect={toggleInspect} />

          <ObjectsCorner
            visible={!combat}
            objects={visibleObjects}
            hiddenCount={hiddenObjectCount}
            inspectTarget={inspectTarget}
            hoveredMenuId={hoveredObjectMenuId}
            setHoveredMenuId={setHoveredObjectMenuId}
            credits={credits}
            hasInventoryItem={hasInventoryItem}
            canTakeObject={canTakeObject}
            getVendorShopEntries={getVendorShopEntriesForObject}
            onInspect={toggleInspect}
            onExamine={examineObject}
            onBuy={buyVendorItem}
            onShop={openVendorShop}
            onTake={takeObject}
          />

          <TextWindow
            combat={combat}
            combatMenuEntered={combatMenuEntered}
            combatDrawerActive={activeDrawer === 'combat'}
            playerPortrait={playerPortraitUrl}
            inspectTargetType={inspectTarget?.type}
            inspectedTitle={inspectedTitle}
            inspectedDescriptionHtml={inspectedDescriptionHtml}
            locationDescriptionHtml={locationDescriptionHtml}
            eventMessages={eventMessageEntries}
            onRichTextClick={handleRichTextClick}
            onOpenCombatMenu={openCombatMenu}
            onOpenActions={openActionsMenu}
          />
        </section>
      </main>
    </div>
  );
}
