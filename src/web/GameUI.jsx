import React, { useEffect, useRef, useState } from 'react';
import { Game } from '../game.js';
import { LevelUpNotifier } from './LevelUpNotifier.jsx';
import { ActionsDrawer, BottomStatusPanel, LocationTitle, PlayerDrawer } from './components/uicomponents/index.js';
import { createCombatState, performCombatTurn } from '../utils/combat.js';
import { ragsToHtml } from '../utils/ragsMarkup.js';
import { getExperienceCheckpoints, getMentalStatusForLevel } from '../utils/leveling.js';
import { applyCombatActionCosts } from '../utils/actionCosts.js';
import { formatGameClock, getDayPartFromMinutes, getGameClockFromStats } from '../utils/gameTime.js';
import { humanizeId } from '../utils/humanize.js';
import { createEmptySaveGame, writeSaveGame } from '../utils/saveGame.js';
import { useGameStore } from './store/gameStore.js';
import { DbEditor } from './editor/DbEditor.jsx';
import { getRoomImage } from '../utils/roomUtils.js';
import { evaluateCondition, resolveConditionalValue } from '../events/conditional.js';
import { formatMenuDescription, getCustomChoiceActions, normalizeActionName } from '../actions.js';

// Local image paths
const DEFAULT_BG = '/Assets/images/rooms/dusk.jpg';
const DEFAULT_PLAYER = '/Assets/images/player/playerafraid.jpg';
const LEVEL_UP_MEDIA = '/Assets/images/ui/level_up.mp4';
const START_WIZARD_PLACEHOLDER = 'Assets/images/characters/placeholder.png';
const INTRO_SCENE_ID = 'evilinc_intro_001_sequence';

const START_WIZARD_SCREENS = {
  ageGate: {
    title: 'Disclaimer',
    text: `This game contains the depictions and descriptions of sexual acts between adult persons. If this offends you, is against the law in your community or if you are under the legal age to view such material, please quit now.
This is a pure fictional story. All characters and locations depicted herein are truly fictional and any resemblance to any person, living or dead, is not intended and purely coincidental. All characters depicted herein are considered to be above the age of 18.
I do not support in any way the acts described in this game. Always use your powers responsibly.`,
  },
  toPlayers: {
    title: 'To Players',
    text: `Disregard the spelling and grammar. This is still a story in progress.
Every so often I'll go through to tweak the story or add additional details. For the most part the events shouldn't change.
Please feel free to leave any comments on the forum.

This is a legacy game that I decided to revive, inspired by the original one that was created and abandoned by rrod424 and many others, written on RAGS (RIP).
Built with AI help. Expect the continuation, weirdness, and a lot of AI pictures.

PS: If you're interested in development, welcome to DM. Let's team up.
Enjoy!`
  },
    animation: {
      title: 'Evil Incorporated',
      media: START_WIZARD_PLACEHOLDER,
      text: 'Animation placeholder: Evil Incorporated logo sequence.'
    },
    introChoice: {
      title: 'Start',
      media: START_WIZARD_PLACEHOLDER,
      text: `Would you like to play the full intro before the prologue, or skip straight to East Side?
If you skip, you still need to visit Evil Inc to read Dr. Evil's mail and obtain the E.I. security badge.`
    }
  };


function getMentalLevelDisplayFromTable(player, level) {
  const table = Array.isArray(player?.MentalLevelTable) ? player.MentalLevelTable : [];
  const entry = table.find(item => item?.Level === level) || null;
  return entry?.Display || (entry?.Title ? `${entry.Title} : Lvl. ${level}` : `Lvl. ${level}`);
}

export function GameUI({ startRequest, onStartRequestHandled, onRequestStartFlow } = {}) {
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
    hoveredNpcMenuId,
    setHoveredNpcMenuId,
    hoveredContainerItemId,
    setHoveredContainerItemId,
    containerUi,
    setContainerUi,
    activeDrawer,
    setActiveDrawer,
    shopVendorId,
    setShopVendorId,
    shopCategory,
    setShopCategory,
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
  const dbVersionRef = useRef({ version: null });
  const [dismissedOverlayKey, setDismissedOverlayKey] = useState(null);
  const [eventMediaTitle, setEventMediaTitle] = useState(null);
  const [continuePrompt, setContinuePrompt] = useState(null);
  const [textInputPrompt, setTextInputPrompt] = useState(null);
  const [textInputValue, setTextInputValue] = useState('');
  const [scenePrompt, setScenePrompt] = useState(null);
  const [sceneRevealed, setSceneRevealed] = useState(false);
  const sceneAutoRevealRef = useRef(false);
  const transientMediaTimeoutRef = useRef(null);
  const transientMediaTokenRef = useRef(null);
  const playerPortraitTimeoutRef = useRef(null);
  const [playerPortraitOverride, setPlayerPortraitOverride] = useState(null);
  const [hackPickerOpen, setHackPickerOpen] = useState(false);
  const [startVariantPromptOpen, setStartVariantPromptOpen] = useState(false);
  const [startWizardStep, setStartWizardStep] = useState(null);
  const [introActive, setIntroActive] = useState(false);
  const [pendingIntroSceneStart, setPendingIntroSceneStart] = useState(false);

  const sideTextWindowRef = useRef(null);
  const textLogCounterRef = useRef(0);
  const [textLog, setTextLog] = useState([]);
  const lastLoggedEventMessagesRef = useRef(null);
  const lastLoggedRoomIdRef = useRef(null);
  const interactionLocked = introActive;

  const appendTextLogBlock = (lines, { kind = 'system' } = {}) => {
    if (!game || !currentRoom) return;
    const rawLines = Array.isArray(lines) ? lines : lines ? [String(lines)] : [];
    const trimmed = rawLines
      .map(line => String(line ?? '').trim())
      .filter(Boolean);
    if (!trimmed.length) return;

    const htmlLines = trimmed.map(line => ragsToHtml(line, { game, room: currentRoom }));
    const key = `log:${Date.now()}:${++textLogCounterRef.current}`;
    setTextLog(prev => [...(Array.isArray(prev) ? prev : []), { key, kind, htmlLines }]);
  };

  useEffect(() => {
    if (combat) return;
    if (introActive) return;
    if (!currentRoom?.id) return;
    if (lastLoggedRoomIdRef.current === currentRoom.id) return;
    lastLoggedRoomIdRef.current = currentRoom.id;

    const name = currentRoom?.name || currentRoom?.Name || 'Unknown location';
    const description = String(currentRoom?.description || currentRoom?.Description || '').trim();
    appendTextLogBlock(description ? [`<b>${name}</b>`, description] : [`<b>${name}</b>`], { kind: 'location' });
  }, [combat, currentRoom?.id, introActive]);

  useEffect(() => {
    if (combat) return;
    if (introActive) return;
    if (!Array.isArray(eventMessages) || !eventMessages.length) return;
    if (lastLoggedEventMessagesRef.current === eventMessages) return;
    lastLoggedEventMessagesRef.current = eventMessages;
    appendTextLogBlock(eventMessages, { kind: 'system' });
  }, [combat, eventMessages, introActive]);

  useEffect(() => {
    const el = sideTextWindowRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [textLog.length]);

  useEffect(() => {
    if (!eventMedia) setEventMediaTitle(null);
  }, [eventMedia]);

  useEffect(() => {
    return () => {
      clearTransientMedia();
      clearPlayerPortraitOverride();
    };
  }, []);

  useEffect(() => {
    // Each new stage should be revealed via Talk.
    if (sceneAutoRevealRef.current) {
      sceneAutoRevealRef.current = false;
      return;
    }
    setSceneRevealed(false);
    setContinuePrompt(prev => {
      const kind = String(prev?.kind ?? '').trim().toLowerCase();
      return kind === 'scene' ? null : prev;
    });
  }, [scenePrompt?.sceneId, scenePrompt?.stageId]);

  useEffect(() => {
    if (!scenePrompt || !sceneRevealed) return;
    const delay = Number(scenePrompt?.autoAdvanceMs ?? 0);
    if (!Number.isFinite(delay) || delay <= 0) return;
    const choices = Array.isArray(scenePrompt?.choices) ? scenePrompt.choices : [];
    const canContinue = Boolean(!scenePrompt?.isEnd && !choices.length);
    if (!canContinue) return;

    const token = setTimeout(() => {
      handleContinue();
    }, delay);
    return () => clearTimeout(token);
  }, [scenePrompt?.sceneId, scenePrompt?.stageId, sceneRevealed]);

  useEffect(() => {
    // Close hack picker when switching inspection target.
    setHackPickerOpen(false);
  }, [inspectTarget?.type, inspectTarget?.id]);

  const clearContinuePrompt = g => {
    setContinuePrompt(null);
    const resolvedGame = g ?? game;
    if (resolvedGame?.variables && Object.prototype.hasOwnProperty.call(resolvedGame.variables, 'continue_to_room')) {
      delete resolvedGame.variables.continue_to_room;
    }
  };

  const openTextInputPrompt = ({ title, placeholder, submitLabel, entityType, entityId, entity, eventType, label, media, inputType } = {}) => {
    if (combat) return;
    const resolvedTitle = String(title ?? label ?? eventType ?? 'Enter text').trim();
    setActiveDrawer(null);
    setTextInputValue('');
    setTextInputPrompt({
      title: resolvedTitle,
      placeholder: String(placeholder ?? 'Enter value').trim() || 'Enter value',
      submitLabel: String(submitLabel ?? 'Submit').trim() || 'Submit',
      media: String(media ?? '').trim() || null,
      inputType: String(inputType ?? '').trim() || 'text',
      entityType,
      entityId,
      entity,
      eventType,
      label
    });
  };

  const closeTextInputPrompt = () => {
    setTextInputPrompt(null);
    setTextInputValue('');
  };

  const openStartVariantPrompt = () => {
    setStartVariantPromptOpen(true);
    setStartWizardStep('ageGate');
  };
  const closeStartVariantPrompt = () => {
    setStartVariantPromptOpen(false);
    setStartWizardStep(null);
  };

  const startNewGameWithVariant = async variantRaw => {
    if (combat) return;

    const variant = String(variantRaw ?? '').trim().toLowerCase();
    const save = createEmptySaveGame();

    const examineAbility = { Name: 'Examine', Tooltip: 'Inspect your surroundings or items.', Combat: false };
    const waitAbility = { Name: 'Wait', Tooltip: 'Skip time.', Combat: false };

    if (variant === 'prologue') {
      save.player = {
        CurrentRoom: 'evilincfront_lc_001',
        Inventory: [{ UniqueID: 'comunit_001', Name: 'Com Unit' }],
        Equipped: ['comunit_001'],
        Abilities: [examineAbility, waitAbility],
        Credits: 0,
        Stats: {
          Experience: 0,
          Level: 0,
          GameTimeMinutes: 12 * 60,
          DaysInGame: 1,
          prologue_complete: false,
          prologue_wallet_xp_awarded: false
        }
      };
      save.objects = {
        duffelbag_001: {
          Contents: ['wallet_001']
        }
      };
    } else if (variant === 'skip') {
      save.player = {
        CurrentRoom: 'eastside_lc_001',
        Inventory: [{ UniqueID: 'comunit_001', Name: 'Com Unit' }],
        Equipped: ['comunit_001'],
        Credits: 0,
        Stats: {
          Experience: 0,
          Level: 0,
          GameTimeMinutes: 12 * 60,
          DaysInGame: 1,
          prologue_complete: false,
          prologue_wallet_xp_awarded: false,
          prologue_intro_skipped: true
        }
      };
    } else {
      setEventMessages([`Unknown start variant: ${variantRaw}`]);
      return;
    }

    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('savegame');
    } catch {
      // ignore
    }

    setActiveDrawer(null);

    const result = await writeSaveGame(save);
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('Failed to persist new game save:', result?.error || 'unknown error');
    }

    await handleLoadGame({ mode: 'new' });
  };

  const handleStartVariantChoice = variant => {
    closeStartVariantPrompt();
    startNewGameWithVariant(variant);
  };

  const handleStartWizardNotEligible = () => {
    closeStartVariantPrompt();
    setEventMessages(prev => [...(Array.isArray(prev) ? prev : []), '<b>You must be 18+ to play.</b>']);
  };

    const handleStartWizardAdvance = () => {
      if (startWizardStep === 'ageGate') {
        setStartWizardStep('toPlayers');
        return;
      }
      if (startWizardStep === 'toPlayers') {
        setStartWizardStep('animation');
        return;
      }
      if (startWizardStep === 'animation') {
        setStartWizardStep('introChoice');
      }
    };

  const handleStartWizardIntro = async () => {
    closeStartVariantPrompt();
    await startNewGameWithVariant('prologue');
    setPendingIntroSceneStart(true);
  };

  useEffect(() => {
    const requestId = startRequest?.requestId;
    if (!requestId) return;
    let cancelled = false;

    const run = async () => {
      await startNewGameWithVariant(startRequest?.variant || 'prologue');
      if (cancelled) return;
      if (startRequest?.playIntro) {
        setPendingIntroSceneStart(true);
      } else {
        setIntroActive(false);
        setContinuePrompt(null);
      }
      if (typeof onStartRequestHandled === 'function') onStartRequestHandled();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [startRequest?.requestId]);

  useEffect(() => {
    if (!pendingIntroSceneStart) return;
    if (!game) return;
    beginIntroSequence(game);
    setPendingIntroSceneStart(false);
  }, [pendingIntroSceneStart, game]);

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
        if (!startingRoom) throw new Error(`Current room '${g.player?.CurrentRoom}' not found in rooms index`);

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
        const initInfo = initWarnings
          ? [...initTexts, `<b>DB warnings:</b> ${initWarnings} file(s) failed to load.`]
          : initTexts;
        const initSceneData = g.lastEventResult?.sceneData ?? null;
        const initMedia = g.lastEventResult?.media || null;
        clearContinuePrompt(g);
        if (initSceneData) {
          showSceneData(initSceneData, { prependTexts: initInfo, fallbackMedia: initMedia });
        } else {
          setEventMessages(initInfo);
          // Game should begin with no popups/modals.
          setEventMedia(null);
          setScenePrompt(null);
        }

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

        const changedPath = String(payload?.path ?? '').replace(/\\/g, '/').trim();
        const isSaveMutation = changedPath === 'DB/savegame.json';

        if (source === 'write' && isSaveMutation) return;

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
    if (interactionLocked) return;
    setActiveDrawer(prev => (prev === drawerName ? null : drawerName));
  };

  const closeDrawer = () => setActiveDrawer(null);

  const refreshPlayerState = (g = game) => {
    if (!g?.player) return;
    const nextInventory = Array.isArray(g.player.Inventory) ? [...g.player.Inventory] : [];
    const nextStats = g.player.Stats ? { ...g.player.Stats } : undefined;
    const nextEquipped = Array.isArray(g.player.Equipped) ? [...g.player.Equipped] : undefined;
    const nextAbilities = Array.isArray(g.player.Abilities) ? cloneJson(g.player.Abilities) : undefined;
    const nextMentalMinions = Array.isArray(g.player.MentalMinions) ? [...g.player.MentalMinions] : undefined;
    setPlayer({
      ...g.player,
      Inventory: nextInventory,
      Stats: nextStats,
      Equipped: nextEquipped,
      Abilities: nextAbilities,
      MentalMinions: nextMentalMinions
    });
  };

  const cloneJson = value => JSON.parse(JSON.stringify(value ?? null));

  const ensureSaveGameShape = g => {
    const base = g?.save && typeof g.save === 'object' ? g.save : createEmptySaveGame();
    const next = cloneJson(base) || createEmptySaveGame();
    if (!next.player || typeof next.player !== 'object') next.player = {};
    if (!next.rooms || typeof next.rooms !== 'object') next.rooms = {};
    if (!next.objects || typeof next.objects !== 'object') next.objects = {};
    if (!next.characters || typeof next.characters !== 'object') next.characters = {};
    if (!next.events || typeof next.events !== 'object') next.events = {};
    if (!next.events.threads || typeof next.events.threads !== 'object') next.events.threads = {};
    if (!next.events.states || typeof next.events.states !== 'object') next.events.states = {};
    if (!next.events.flags || typeof next.events.flags !== 'object') next.events.flags = {};
    if (!next.events.activeScenes || typeof next.events.activeScenes !== 'object') next.events.activeScenes = {};
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
      Abilities: cloneJson(Array.isArray(g.player.Abilities) ? g.player.Abilities : []),
      MentalMinions: cloneJson(Array.isArray(g.player.MentalMinions) ? g.player.MentalMinions : []),
      CompletedScenes: cloneJson(Array.isArray(g.player.CompletedScenes) ? g.player.CompletedScenes : []),
      VisitedRooms: cloneJson(Array.isArray(g.player.VisitedRooms) ? g.player.VisitedRooms : []),
      CurrentRoom: g.player.CurrentRoom,
      Credits: g.player.Credits ?? 0
    };
  };

  const commitRoomToSave = (roomId, save, g = game) => {
    const id = String(roomId ?? '').trim();
    if (!id || !g?.roomMap?.[id]) return;
    const room = g.roomMap[id];
    save.rooms[id] = {
      ...(save.rooms?.[id] || {}),
      objects: cloneJson(Array.isArray(room.objects) ? room.objects : []),
      bFirstTimeVisited: Boolean(room?.bFirstTimeVisited),
      bFirstTimeLeft: Boolean(room?.bFirstTimeLeft)
    };
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

  const commitCharacterToSave = (characterId, save, g = game) => {
    const id = String(characterId ?? '').trim();
    if (!id || !g?.characterMap?.[id]) return;

    const char = g.characterMap[id];
    const category = String(char?.category ?? char?.__category ?? '').trim().toLowerCase();
    if (category === 'r_citizens' || category === 'enemies') return;

    const next = { ...(save.characters?.[id] || {}) };

    const roomId = String(char?.currentRoomId ?? char?.CurrentRoom ?? '').trim();
    next.CurrentRoom = roomId;

    if (Array.isArray(char?.CustomProperties)) next.CustomProperties = cloneJson(char.CustomProperties);
    if (char?.KnowsPlayer !== undefined) next.KnowsPlayer = Boolean(char.KnowsPlayer);

    save.characters[id] = next;
  };

  const openCombatMenu = () => {
    if (!combat) return;
    setCombatMenuEntered(true);
    setActiveDrawer('combat');
  };

  const openActionsMenu = () => {
    if (combat) return;
    if (interactionLocked) return;
    toggleDrawer('actions');
  };

  const normalizeTextValue = value => {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap(normalizeTextValue);
    if (typeof value === 'object') {
      const text = value?.text ?? value?.Text ?? value?.content ?? null;
      if (text !== null && text !== undefined) return [String(text)];

      const headers = Array.isArray(value?.headers) ? value.headers : Array.isArray(value?.Headers) ? value.Headers : null;
      const rows = Array.isArray(value?.rows) ? value.rows : Array.isArray(value?.Rows) ? value.Rows : null;
      if (headers || rows) {
        const safeHeaders = (headers || []).map(entry => String(entry ?? '').trim()).filter(Boolean);
        const safeRows = (rows || []).map(row =>
          Array.isArray(row) ? row.map(cell => String(cell ?? '').trim()) : [String(row ?? '').trim()]
        );
        const headHtml = safeHeaders.length
          ? `<thead><tr>${safeHeaders.map(cell => `<th>${cell}</th>`).join('')}</tr></thead>`
          : '';
        const bodyHtml = safeRows.length
          ? `<tbody>${safeRows
              .map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`)
              .join('')}</tbody>`
          : '';
        return [`<table class="rags-table">${headHtml}${bodyHtml}</table>`];
      }
    }
    return [String(value)];
  };

  const normalizeTextList = valueOrList => {
    if (!valueOrList) return [];
    const list = Array.isArray(valueOrList) ? valueOrList : [valueOrList];
    return list.flatMap(normalizeTextValue).map(entry => String(entry ?? '').trim()).filter(Boolean);
  };

  const clearTransientMedia = () => {
    if (transientMediaTimeoutRef.current) {
      clearTimeout(transientMediaTimeoutRef.current);
      transientMediaTimeoutRef.current = null;
    }
  };

  const clearPlayerPortraitOverride = () => {
    if (playerPortraitTimeoutRef.current) {
      clearTimeout(playerPortraitTimeoutRef.current);
      playerPortraitTimeoutRef.current = null;
    }
    setPlayerPortraitOverride(null);
  };

  const showPlayerPortraitOverride = (media, { durationMs = 2500 } = {}) => {
    if (!media) return;
    if (playerPortraitTimeoutRef.current) {
      clearTimeout(playerPortraitTimeoutRef.current);
      playerPortraitTimeoutRef.current = null;
    }
    const resolved = resolveMediaUrl(media) || media;
    setPlayerPortraitOverride(resolved);
    if (!durationMs) return;
    playerPortraitTimeoutRef.current = setTimeout(() => {
      setPlayerPortraitOverride(null);
    }, durationMs);
  };

  const resolveAbilityPortrait = rawName => {
    const name = String(rawName ?? '').trim().toLowerCase();
    if (!name) return null;
    const map = {
      'telepathy': 'Assets/images/player/player_abilities/mind_read-mode.jpg',
      'mind read': 'Assets/images/player/player_abilities/mind_read-mode.jpg',
      'read mind': 'Assets/images/player/player_abilities/mind_read-mode.jpg',
      'give order': 'Assets/images/player/player_abilities/mental_order_action.jpg',
      'mental order': 'Assets/images/player/player_abilities/mental_order.jpg',
      'dominate': 'Assets/images/player/player_abilities/mental_order.jpg',
      'mental blast': 'Assets/images/player/player_abilities/mental_blast_mode.jpg',
      'psychic leech': 'Assets/images/player/player_abilities/energy_leech.jpg',
      'psionic shield': 'Assets/images/player/player_abilities/psionic_shield.jpg',
      'mental healing': 'Assets/images/player/player_abilities/self_healing_action.jpg',
      'self healing': 'Assets/images/player/player_abilities/self_healing.jpg',
      'physical slam': 'Assets/images/player/trumph-mode.jpg'
    };
    return map[name] || null;
  };

  const showTransientMedia = (media, { title = null, durationMs = 3500 } = {}) => {
    clearTransientMedia();
    const resolved = media ? resolveMediaUrl(media) || media : null;
    setEventMedia(resolved);
    setEventMediaTitle(title);

    if (!resolved || !durationMs) return;
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    transientMediaTokenRef.current = token;
    transientMediaTimeoutRef.current = setTimeout(() => {
      if (transientMediaTokenRef.current !== token) return;
      setEventMedia(null);
      setEventMediaTitle(null);
    }, durationMs);
  };

  const isMindReadAction = raw => {
    const key = normalizeActionName(raw);
    return key === 'telepathy' || key === 'mind read' || key === 'read mind' || key === 'mindread';
  };

  const getMindReadThoughts = entity => {
    if (!entity) return [];
    const isReadable =
      entity?.isMindreadable === true ||
      entity?.IsMindreadable === true ||
      entity?.Mindreadable === true ||
      getCustomProperty(entity, 'Mindreadable') === true ||
      getCustomProperty(entity, 'mindreadable') === true;
    if (!isReadable) return [];

    const thoughtsRaw =
      entity?.thoughts ??
      entity?.Thoughts ??
      entity?.MindReadThoughts ??
      entity?.mindReadThoughts ??
      getCustomProperty(entity, 'MindReadThoughts') ??
      getCustomProperty(entity, 'mindreadthoughts') ??
      [];

    if (Array.isArray(thoughtsRaw)) {
      return thoughtsRaw.map(entry => String(entry ?? '').trim()).filter(Boolean);
    }
    if (typeof thoughtsRaw === 'string') {
      return thoughtsRaw
        .split(/\r?\n|\|/g)
        .map(entry => String(entry ?? '').trim())
        .filter(Boolean);
    }
    return [];
  };

  const getNextMindReadThought = entity => {
    const thoughts = getMindReadThoughts(entity);
    if (!thoughts.length) return null;
    const current = Number(getCustomProperty(entity, 'MindReadIndex') ?? 0);
    const safeIndex = Number.isFinite(current) && current >= 0 ? current % thoughts.length : 0;
    setCustomProperty(entity, 'MindReadIndex', safeIndex + 1);
    return thoughts[safeIndex];
  };

  const showSceneData = (sceneData, { prependTexts = [], appendTexts = [], appendErrors = [], fallbackMedia = null } = {}) => {
    if (!sceneData) return;
    clearTransientMedia();
    const lines = normalizeTextList(sceneData?.lines);
    const choices = Array.isArray(sceneData?.choices) ? sceneData.choices : [];
    const canContinue = Boolean(!sceneData?.isEnd && !choices.length);

    const baseLines =
      lines.length || !sceneData?.suppressText
        ? (lines.length ? [...lines] : ['...'])
        : [];

    const texts = [
      ...normalizeTextList(prependTexts),
      ...baseLines,
      ...normalizeTextList(appendErrors),
      ...normalizeTextList(appendTexts)
    ].filter(Boolean);

    setEventMedia(sceneData?.media || fallbackMedia || null);
    setEventMediaTitle(null);
    setEventMessages(texts);

    if (sceneData?.isEnd) {
      setScenePrompt(null);
      setSceneRevealed(false);
      setContinuePrompt(null);
      return;
    }

    sceneAutoRevealRef.current = true;
    setScenePrompt(sceneData);
    setSceneRevealed(true);
    setContinuePrompt(canContinue ? { kind: 'scene' } : null);
  };

  const handleMove = destinationId => {
    if (!destinationId) return;
    if (!game) return;
    if (combat) return;
    if (interactionLocked) return;
    if (scenePrompt && !scenePrompt.isEnd) return;
    clearContinuePrompt(game);
    const fromRoomId = game?.player?.CurrentRoom ?? null;
    const fromRoomFirstLeft = fromRoomId ? Boolean(game.roomMap?.[fromRoomId]?.bFirstTimeLeft) : false;
    const result = game.travelTo(destinationId);
    if (!result?.moved) return;
    const shouldSetPennyKnowsPlayer = fromRoomId === 'evilreception_lc_001' && !fromRoomFirstLeft;
    if (shouldSetPennyKnowsPlayer) {
      const penny = game.characterMap?.penny_001 ?? null;
      if (penny && penny.KnowsPlayer !== true) penny.KnowsPlayer = true;
    }
    const newRoom = game.getCurrentRoom();
    updateRoom(newRoom, game);
    const plannedExitTexts = Array.isArray(result?.planned?.exit?.texts) ? result.planned.exit.texts : [];
    const plannedEnterTexts = Array.isArray(result?.planned?.enter?.texts) ? result.planned.enter.texts : [];
    const plannedPresenceTexts = Array.isArray(result?.planned?.presence?.texts) ? result.planned.presence.texts : [];
    const spawnTexts = Array.isArray(result?.spawns?.texts) ? result.spawns.texts : [];
    const eventTexts = Array.isArray(result?.events?.texts) ? result.events.texts : [];
    const combinedTexts = [...plannedExitTexts, ...plannedEnterTexts, ...plannedPresenceTexts, ...spawnTexts, ...eventTexts];

    const plannedMedia =
      result?.planned?.presence?.media || result?.planned?.enter?.media || result?.planned?.exit?.media || null;
    const combinedMedia = plannedMedia || result?.events?.media || null;
    openLevelUpNotice(result?.levelProgression, game.player, game.leveling);
    closeDrawer();

    const sceneData =
      result?.events?.sceneData ??
      result?.planned?.presence?.sceneData ??
      result?.planned?.enter?.sceneData ??
      result?.planned?.exit?.sceneData ??
      null;
    if (sceneData) {
      clearContinuePrompt(game);
      showSceneData(sceneData, { prependTexts: combinedTexts, fallbackMedia: combinedMedia });
    } else if (result?.events?.paused) {
      const destinationId = String(game?.variables?.continue_to_room ?? '').trim();
      setContinuePrompt({ destinationId: destinationId || null });
      setScenePrompt(null);
    } else {
      setEventMessages(combinedTexts);
      clearTransientMedia();
      setEventMedia(combinedMedia);
      setScenePrompt(null);
    }

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    if (fromRoomId) commitRoomToSave(fromRoomId, save);
    if (newRoom?.id) commitRoomToSave(newRoom.id, save);
    if (shouldSetPennyKnowsPlayer) commitCharacterToSave('penny_001', save);
    persistSaveGame(save);
  };

  const handleContinue = () => {
    if (!continuePrompt) return;
    const kind = String(continuePrompt?.kind ?? '').trim().toLowerCase();
    const destinationId = String(continuePrompt?.destinationId ?? '').trim();

    if (kind === 'scene') {
      if (!game || combat) return;

      const result = game.sceneRunner?.advance?.() ?? null;
      if (!result) {
        clearContinuePrompt(game);
        setScenePrompt(null);
        setSceneRevealed(false);
        return;
      }

      const nextSceneData = result?.sceneData ?? null;
      const nextLines = nextSceneData
        ? Array.isArray(nextSceneData?.lines)
          ? nextSceneData.lines
          : []
        : Array.isArray(result?.texts)
          ? result.texts
          : [];
      const nextMedia = nextSceneData?.media || result?.media || null;

      clearTransientMedia();
      setEventMedia(nextMedia || null);
      setEventMediaTitle(null);
      const normalizedLines = normalizeTextList(nextLines);
      if (normalizedLines.length || !nextSceneData?.suppressText) {
        setEventMessages(normalizedLines.length ? normalizedLines : ['...']);
      } else {
        setEventMessages([]);
      }

      if (nextSceneData && !nextSceneData?.isEnd) {
        sceneAutoRevealRef.current = true;
        setScenePrompt(nextSceneData);
        setSceneRevealed(true);

        const nextStageId = String(nextSceneData?.nextStageId ?? '').trim();
        const choices = Array.isArray(nextSceneData?.choices) ? nextSceneData.choices : [];
        setContinuePrompt(!nextSceneData?.isEnd && !choices.length ? { kind: 'scene' } : null);
      } else {
        setScenePrompt(null);
        setSceneRevealed(false);
        setContinuePrompt(null);
        if (introActive && !game.sceneRunner?.isActive?.()) {
          setIntroActive(false);
          setEventMedia(null);
          setEventMediaTitle(null);
          setEventMessages([]);
        }
      }

      openLevelUpNotice(game.lastLevelProgression || game.checkLevelProgression(), game.player, game.leveling);

      const nextRoom = game.getCurrentRoom();
      if (nextRoom) updateRoom(nextRoom, game, { resetInspectTarget: false });

      refreshPlayerState(game);
      const save = ensureSaveGameShape(game);
      commitPlayerToSave(save);
      persistSaveGame(save);
      return;
    }

    if (kind === 'script') {
      const scriptId = String(continuePrompt?.scriptId ?? '').trim();
      clearContinuePrompt(game);
      if (game?.variables && Object.prototype.hasOwnProperty.call(game.variables, 'continue_script')) {
        delete game.variables.continue_script;
      }

      if (!game || !currentRoom || combat) return;

      if (scriptId === 'herbert_pc_hack_aftermath') {
        // Herbert arrives in the office on Continue, awarding XP and opening a Talk choice.
        const roomId = String(currentRoom?.id ?? currentRoom?.UniqueID ?? '').trim();
        const herbert = game?.characterMap?.herbert_001 ?? null;
        if (herbert && roomId) {
          herbert.currentRoomId = roomId;
          if (Object.prototype.hasOwnProperty.call(herbert, 'CurrentRoom')) herbert.CurrentRoom = roomId;
        }

        const clickSlamLines = [
          'Click!',
          'Slam!',
          "WHAT WAS THAT?!? That didn't sound like a computer.",
          '',
          'The office door bursts open.',
          'Herbert: "What the Fuck!"',
          '',
          '&lt; Cracked Herbert\'s password... + 40 Exp &gt;',
          '<b>Conversation available.</b> Open Actions → Talk.'
        ];

        game.gainExperience?.(40);
        openLevelUpNotice(game.lastLevelProgression || game.checkLevelProgression(), game.player, game.leveling);

        const sceneResult = game.sceneRunner?.begin?.('herbyoffice_hack_confrontation_001_story') ?? null;
        setScenePrompt(sceneResult?.sceneData || null);
        setSceneRevealed(false);

        // Keep the player in the Actions flow rather than forcing a modal.
        setEventMedia(null);
        setEventMediaTitle(null);
        setEventMessages(clickSlamLines);

        const nextRoom = game.getCurrentRoom();
        if (nextRoom) updateRoom(nextRoom, game, { resetInspectTarget: false });

        refreshPlayerState(game);
        const save = ensureSaveGameShape(game);
        commitPlayerToSave(save);
        if (herbert) commitCharacterToSave('herbert_001', save);
        if (roomId) commitRoomToSave(roomId, save);
        persistSaveGame(save);
      }

      return;
    }

    if (kind === 'command') {
      clearContinuePrompt(game);
      if (!game || combat) return;
      const result = game.commandRunner?.resume?.() ?? null;
      if (!result) return;

      const hasScene = Boolean(result?.sceneData);
      const baseTexts =
        Array.isArray(result?.texts) && result.texts.length
          ? result.texts
          : hasScene
            ? []
            : ['...'];
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      const displayTexts = normalizeTextList(errors.length ? [...baseTexts, ...errors] : baseTexts);

      openLevelUpNotice(game.lastLevelProgression || game.checkLevelProgression(), game.player, game.leveling);

      if (result?.sceneData) {
        const nextSceneData = result.sceneData;
        const lines = Array.isArray(nextSceneData?.lines) ? nextSceneData.lines : [];
        const choices = Array.isArray(nextSceneData?.choices) ? nextSceneData.choices : [];
        const canContinue = Boolean(!nextSceneData?.isEnd && !choices.length);

        setEventMedia(nextSceneData?.media || result?.media || null);
        setEventMediaTitle(null);
        setEventMessages(lines.length ? lines : ['...']);

        sceneAutoRevealRef.current = true;
        setScenePrompt(nextSceneData);
        setSceneRevealed(true);
        setContinuePrompt(canContinue ? { kind: 'scene' } : null);
        return;
      } else if (result?.paused) {
        setContinuePrompt({ kind: 'command' });
        setScenePrompt(null);
      } else {
        if (continuePrompt) clearContinuePrompt(game);
        if (scenePrompt) setScenePrompt(null);
      }

      clearTransientMedia();
      setEventMedia(result?.media || null);
      setEventMediaTitle(null);
      setEventMessages(displayTexts);

      const nextRoom = game.getCurrentRoom();
      if (nextRoom) updateRoom(nextRoom, game, { resetInspectTarget: false });

      refreshPlayerState(game);
      const save = ensureSaveGameShape(game);
      commitPlayerToSave(save);
      persistSaveGame(save);
      return;
    }

    if (kind === 'combat') {
      const enemyId = String(continuePrompt?.enemyId ?? '').trim();
      const enemy = enemyId ? game?.characterMap?.[enemyId] ?? null : null;
      const overrideMedia = String(continuePrompt?.combatMedia ?? '').trim();
      clearContinuePrompt(game);

      if (!enemy || !game || !currentRoom || combat) return;

      const combatState = createCombatState({ game, room: currentRoom, enemy });
      const resolvedOverride = overrideMedia ? resolveMediaUrl(overrideMedia) || overrideMedia : null;
      if (resolvedOverride) combatState.enemyPicture = resolvedOverride;

      setCombatMenuEntered(false);
      setActiveDrawer(null);
      setEventMessages([]);
      setEventMedia(null);
      setEventMediaTitle(null);
      setCombat(combatState);
      return;
    }

    clearContinuePrompt(game);
    if (destinationId) handleMove(destinationId);
  };

  const handleSceneChoice = choiceId => {
    if (!game || !currentRoom) return;
    if (combat) return;
    if (!scenePrompt) return;

    setActiveDrawer(null);
    const id = String(choiceId ?? '').trim();
    if (!id) return;

    const activeSceneId = String(scenePrompt?.sceneId ?? '').trim();

    const result = game.sceneRunner?.choose?.(id) ?? null;
    if (!result) return;

    const baseTexts = Array.isArray(result?.texts) ? result.texts : [];

    const startCombatEnemyId = String(result?.startCombatEnemyId ?? '').trim();
    const startCombatEnemy = startCombatEnemyId ? game?.characterMap?.[startCombatEnemyId] ?? null : null;

    // Post-fight Herbert branch: unlock Domination and convert Herbert into a mental minion.
    if (activeSceneId === 'herbyoffice_postfight_001_story' && id === 'power_interrogate') {
      const herbertLost = Boolean(game?.player?.Stats?.herbert_loss);
      const playerPower = Number(game?.player?.Stats?.Power ?? 0);
      if (!herbertLost || !(Number.isFinite(playerPower) && playerPower >= 2)) {
        setEventMedia(null);
        setEventMediaTitle(null);
        setEventMessages(['Nothing happens.']);
        return;
      }

      if (!Array.isArray(game.player.Abilities)) game.player.Abilities = [];
      const hasDomination = game.player.Abilities.some(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const uid = String(entry.UniqueID ?? entry.id ?? '').trim();
        const name = String(entry.Name ?? entry.name ?? '').trim();
        return uid === 'ability_domination_001' || name.toLowerCase() === 'domination';
      });

      if (!hasDomination) {
        game.player.Abilities.push({
          UniqueID: 'ability_domination_001',
          Name: 'Domination',
          Tooltip:
            "Crush a target's will into mindless devotion. They retain memories, but who they were ceases to exist.",
          Combat: false
        });
      }

      if (!Array.isArray(game.player.MentalMinions)) game.player.MentalMinions = [];

      const roomId = String(currentRoom?.id ?? currentRoom?.UniqueID ?? '').trim();
      const bossHerbert = game?.characterMap?.herbert_001 ?? null;
      if (bossHerbert) {
        bossHerbert.currentRoomId = null;
        if (Object.prototype.hasOwnProperty.call(bossHerbert, 'CurrentRoom')) bossHerbert.CurrentRoom = null;
      }

      const minionId = 'herbert_minion_001';
      const minion = game?.characterMap?.[minionId] ?? null;
      if (minion && roomId) {
        minion.currentRoomId = roomId;
        if (Object.prototype.hasOwnProperty.call(minion, 'CurrentRoom')) minion.CurrentRoom = roomId;
      }

      if (!game.player.MentalMinions.includes(minionId)) game.player.MentalMinions.push(minionId);

      refreshPlayerState(game);
      const save = ensureSaveGameShape(game);
      commitPlayerToSave(save);
      if (bossHerbert) commitCharacterToSave('herbert_001', save);
      if (minion) commitCharacterToSave(minionId, save);
      persistSaveGame(save);
    }

    if (startCombatEnemyId && startCombatEnemy) {
      const pendingCombatMedia = String(game?.variables?.pending_combat_media ?? '').trim();
      if (pendingCombatMedia && game?.variables && Object.prototype.hasOwnProperty.call(game.variables, 'pending_combat_media')) {
        delete game.variables.pending_combat_media;
      }

      // Show the narrative + portrait now, and only enter combat on Continue.
      const preFightMedia = String(result?.media ?? '').trim();
      const resolvedPreFight = preFightMedia ? resolveMediaUrl(preFightMedia) || preFightMedia : null;
      clearTransientMedia();
      setEventMedia(resolvedPreFight || startCombatEnemy?.Picture || startCombatEnemy?.media || null);
      setEventMediaTitle(startCombatEnemy?.Charname || startCombatEnemy?.Name || startCombatEnemy?.name || null);
      setEventMessages(baseTexts);

      setScenePrompt(null);
      setSceneRevealed(false);
      setCombatMenuEntered(false);
      setActiveDrawer(null);
      setContinuePrompt({ kind: 'combat', enemyId: startCombatEnemyId, combatMedia: pendingCombatMedia || null });
    } else {
      const errors = Array.isArray(result?.errors) ? result.errors : [];
      const sceneData = result?.sceneData ?? null;
      if (sceneData) {
        showSceneData(sceneData, { appendErrors: errors });
      } else {
        clearTransientMedia();
        setEventMedia(result?.media || null);
        setEventMediaTitle(null);
        setEventMessages(normalizeTextList(baseTexts.length ? [...baseTexts, ...errors] : errors));
        setScenePrompt(null);
        setSceneRevealed(false);
        setContinuePrompt(null);
      }
    }
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);

    const nextRoom = game.getCurrentRoom();
    if (nextRoom) updateRoom(nextRoom, game, { resetInspectTarget: false });

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const revealScene = () => {
    if (!scenePrompt) return;

    const lines = normalizeTextList(scenePrompt?.lines);
    const choices = Array.isArray(scenePrompt?.choices) ? scenePrompt.choices : [];
    const canContinue = Boolean(!scenePrompt?.isEnd && !choices.length);

    if (scenePrompt?.media) {
      clearTransientMedia();
      setEventMedia(scenePrompt.media);
    }
    setEventMediaTitle(null);
    if (lines.length || !scenePrompt?.suppressText) {
      setEventMessages(lines.length ? lines : ['...']);
    } else {
      setEventMessages([]);
    }
    setSceneRevealed(true);
    setContinuePrompt(canContinue ? { kind: 'scene' } : null);
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

      const g = new Game();
      await g.initialize();

      const startingRoom = g.getCurrentRoom();
      if (!startingRoom) throw new Error(`Current room '${g.player?.CurrentRoom}' not found in rooms index`);

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
      const loadSceneData = g.lastEventResult?.sceneData ?? null;
      const loadMedia = g.lastEventResult?.media || null;
      clearContinuePrompt(g);
      if (loadSceneData) {
        showSceneData(loadSceneData, { prependTexts: [...loadedTexts, ...loadInfo], fallbackMedia: loadMedia });
      } else {
        setEventMessages([...loadedTexts, ...loadInfo]);
        // New game should begin with no popups/modals.
        clearTransientMedia();
        setEventMedia(mode === 'new' ? null : loadMedia);
        if (mode === 'new') {
          setScenePrompt(null);
        }
      }
      openLevelUpNotice(g.lastLevelProgression, g.player, g.leveling);
    } catch (e) {
      setError(e?.message || String(e));
      // eslint-disable-next-line no-console
      console.error('Load game error:', e);
    }
  };

  const handleNewGame = async () => {
    if (combat) return;
    if (interactionLocked) return;
    if (typeof onRequestStartFlow === 'function') {
      onRequestStartFlow();
      return;
    }
    openStartVariantPrompt();
  };

  const handleResetSave = async () => {
    if (combat) return;
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem('savegame');
    } catch {
      // ignore
    }

    const result = await writeSaveGame(createEmptySaveGame());
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('Failed to reset savegame.json:', result?.error || 'unknown error');
    }

    await handleLoadGame();
    setEventMessages(prev => [...(Array.isArray(prev) ? prev : []), '<b>Save reset.</b>']);
  };

  const examineObject = obj => {
    if (!obj) return;
    if (combat) return;
    if (interactionLocked) return;
    const objId = obj?.id ?? obj?.UniqueID ?? null;
    if (!objId) return;
    setActiveDrawer(null);
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setInspectTarget({ type: 'object', id: objId });
    setHoveredObjectMenuId(null);
    setHoveredContainerItemId(null);

    const resolved = resolveRoomObject(obj);
    const description = String(resolved?.Description ?? resolved?.description ?? '').trim();
    const media = resolved?.media || resolved?.Picture || null;
    const title = resolved?.Name || resolved?.name || humanizeId(objId) || null;

    if (media) {
      showTransientMedia(media, { title });
    } else {
      clearTransientMedia();
      setEventMedia(null);
      setEventMediaTitle(title);
    }
    setEventMessages(description ? normalizeTextList([description]) : []);
  };

  const examineNpc = npc => {
    if (!npc) return;
    if (combat) return;
    if (interactionLocked) return;
    const npcId = npc?.id ?? npc?.UniqueID ?? null;
    if (!npcId) return;
    setActiveDrawer(null);
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setInspectTarget({ type: 'npc', id: npcId });
    setHoveredObjectMenuId(null);
    setHoveredNpcMenuId(null);
    setHoveredContainerItemId(null);
    const npcName = npc?.Charname || npc?.Name || npc?.name || humanizeId(npcId) || null;
    const description = String(npc?.Description ?? npc?.description ?? '').trim();
    const media = npc?.Picture || npc?.CharPortrait || npc?.media || null;
    if (media) {
      showTransientMedia(media, { title: npcName });
    } else {
      clearTransientMedia();
      setEventMedia(null);
      setEventMediaTitle(npcName);
    }
    setEventMessages(description ? normalizeTextList([description]) : []);
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
    merged.name = merged.Name ?? merged.name ?? obj?.name ?? obj?.Name ?? humanizeId(id) ?? '';
    merged.description = merged.Description ?? merged.description ?? obj?.description ?? obj?.Description ?? '';
    merged.media = merged.Picture ?? merged.media ?? obj?.media ?? obj?.Picture ?? null;

    return merged;
  };

  const normalizeLookupKey = value => String(value ?? '').trim().toLowerCase();
  const normalizeLookupKeyLoose = value => normalizeLookupKey(value).replace(/[^a-z0-9]/g, '');

  const getObjectActionNames = obj => {
    const actionsMenu = Array.isArray(obj?.ActionsMenu) ? obj.ActionsMenu : [];
    const legacyMenu = Array.isArray(obj?.menu) ? obj.menu : [];
    return [...actionsMenu.map(entry => entry?.Action ?? entry?.name), ...legacyMenu]
      .map(normalizeActionName)
      .filter(Boolean);
  };

  const getActionsMenuDescription = (obj, actionLabel, ctxOverride = null) => {
    const wanted = normalizeActionName(actionLabel);
    if (!wanted) return null;
    const actions = Array.isArray(obj?.ActionsMenu) ? obj.ActionsMenu : [];
    const entry =
      actions.find(row => normalizeActionName(row?.Action ?? row?.name) === wanted) ||
      actions.find(row => normalizeActionName(row?.Action ?? row?.name).includes(wanted)) ||
      null;
    if (!entry) return null;
    const ctx = ctxOverride || { game, room: currentRoom, vars: game?.variables ?? {}, entity: obj, objectBeingActedUpon: obj };
    const raw = entry?.Description ?? entry?.description ?? entry?.Tooltip ?? entry?.tooltip ?? '';
    return formatMenuDescription(raw, ctx, '') || null;
  };

  const resolveEntityId = entity => {
    const id = String(entity?.id ?? entity?.UniqueID ?? '').trim();
    return id || null;
  };

  const resolveRoomIdFromGame = raw => {
    const value = String(raw ?? '').trim();
    if (!value || !game?.roomMap) return null;
    if (game.roomMap[value]) return value;

    const key = normalizeLookupKey(value);
    let partialMatch = null;

    for (const room of Object.values(game.roomMap)) {
      const roomId = String(room?.UniqueID ?? room?.id ?? '').trim();
      if (!roomId) continue;
      const nameKey = normalizeLookupKey(room?.Name ?? room?.name);
      const sDescKey = normalizeLookupKey(room?.SDesc ?? room?.sdesc);
      if (nameKey && nameKey === key) return roomId;
      if (sDescKey && sDescKey === key) return roomId;

      if (!partialMatch && key && ((nameKey && nameKey.includes(key)) || (sDescKey && sDescKey.includes(key)))) {
        partialMatch = roomId;
      } else if (partialMatch && key && ((nameKey && nameKey.includes(key)) || (sDescKey && sDescKey.includes(key)))) {
        partialMatch = null;
      }
    }

    const looseKey = normalizeLookupKeyLoose(value);
    if (looseKey) {
      for (const room of Object.values(game.roomMap)) {
        const roomId = String(room?.UniqueID ?? room?.id ?? '').trim();
        if (!roomId) continue;
        const nameKey = normalizeLookupKeyLoose(room?.Name ?? room?.name);
        const sDescKey = normalizeLookupKeyLoose(room?.SDesc ?? room?.sdesc);
        if (nameKey && nameKey === looseKey) return roomId;
        if (sDescKey && sDescKey === looseKey) return roomId;
      }
    }

    return partialMatch;
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
    setShopCategory(null);
    setShopHoveredItemId(null);
    setShopPurchaseNotice(null);
    setActiveDrawer('vendor');
  };

  const openVendorShopWithCategory = (vendorEntity, category) => {
    if (!vendorEntity) return;
    if (combat) return;
    const vendorId = resolveEntityId(vendorEntity);
    if (!vendorId) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setShopVendorId(vendorId);
    setShopCategory(String(category ?? '').trim() || null);
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

    const explicitCanEquip = obj?.CanEquip ?? obj?.canEquip;
    if (explicitCanEquip !== undefined) return Boolean(explicitCanEquip);

    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    const category = String(obj?.Category ?? obj?.category ?? '').trim().toLowerCase();
    const actions = getObjectActionNames(obj);
    if (actions.includes('equip') || actions.includes('unequip')) return true;
    if (type === 'wearable' || type === 'weapon' || type === 'equipment') return true;
    if (category === 'armor' || category === 'equipment') return true;
    return isWeaponObject(obj);
  };

  const findActionMenuEntry = (entity, actionLabel) => {
    if (!entity || !actionLabel) return null;
    const menu = Array.isArray(entity?.ActionsMenu) ? entity.ActionsMenu : [];
    const key = normalizeActionName(actionLabel);
    return menu.find(entry => normalizeActionName(entry?.Action ?? entry?.name ?? '') === key) || null;
  };

  const findCustomChoiceAction = (entity, actionLabel) => {
    if (!entity || !actionLabel) return null;
    const map = getCustomChoiceActions(entity);
    return map.get(normalizeActionName(actionLabel)) || null;
  };

  const isWeaponObject = obj => {
    const type = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase();
    if (type === 'weapon') return true;
    if (obj?.IsWeapon === true || obj?.Weapon === true) return true;
    if (String(obj?.Category ?? '').trim().toLowerCase() === 'weapon') return true;
    if (obj?.WeaponBonus !== undefined || obj?.AttackBonus !== undefined || obj?.MSBonus !== undefined) return true;
    if (obj?.Bonuses?.WeaponBonus !== undefined || obj?.Bonuses?.Attack !== undefined || obj?.Bonuses?.MS !== undefined) return true;
    if (obj?.playerWeaponDmg !== undefined || obj?.playerWeaponDamage !== undefined) return true;
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
    const lastAssetsIndex = cleaned.toLowerCase().lastIndexOf('assets/');
    if (lastAssetsIndex > 0) {
      cleaned = cleaned.slice(lastAssetsIndex);
    }
    if (!cleaned) return null;

    return encodeURI(`/${cleaned}`);
  };

  const isVideoMedia = media => {
    const value = String(media ?? '').trim().toLowerCase();
    return value.endsWith('.mp4') || value.endsWith('.webm') || value.endsWith('.ogg');
  };

  const resolveStartWizardMedia = media => resolveMediaUrl(media) || media || START_WIZARD_PLACEHOLDER;

  const beginIntroSequence = (gameOverride = game) => {
    const g = gameOverride;
    if (!g) return;
    const sceneResult = g.sceneRunner?.begin?.(INTRO_SCENE_ID) ?? null;
    const sceneData = sceneResult?.sceneData ?? null;
    if (!sceneData) {
      setIntroActive(false);
      setContinuePrompt(null);
      return;
    }

    const lines = Array.isArray(sceneData?.lines)
      ? sceneData.lines
      : Array.isArray(sceneResult?.texts)
        ? sceneResult.texts
        : [];
    const choices = Array.isArray(sceneData?.choices) ? sceneData.choices : [];
    const canContinue = Boolean(!sceneData?.isEnd && !choices.length);

    setIntroActive(true);
    sceneAutoRevealRef.current = true;
    setScenePrompt(sceneData);
    setSceneRevealed(true);
    setActiveDrawer(null);
    setDismissedOverlayKey(null);
    setTextLog([]);
    lastLoggedRoomIdRef.current = null;
    lastLoggedEventMessagesRef.current = null;
    clearContinuePrompt(g);
    setEventMedia(sceneData?.media || sceneResult?.media || null);
    setEventMediaTitle(null);
    if (lines.length || !sceneData?.suppressText) {
      setEventMessages(lines.length ? lines : ['...']);
    } else {
      setEventMessages([]);
    }
    setContinuePrompt(canContinue ? { kind: 'scene' } : null);
  };

  const getObjectEquipmentBonuses = obj => {
    const root = obj?.Bonuses ?? obj?.bonuses ?? obj?.StatsBonus ?? obj?.statsBonus ?? null;
    const msBonus = toSafeInt(
      root?.MS ??
        root?.Attack ??
        root?.Str ??
        obj?.MSBonus ??
        obj?.AttackBonus ??
        obj?.WeaponBonus ??
        obj?.playerWeaponDmg ??
        obj?.playerWeaponDamage ??
        0,
      0
    );
    const defenceBonus = toSafeInt(
      root?.Defence ??
        root?.Defense ??
        root?.Def ??
        root?.Armor ??
        obj?.DefenceBonus ??
        obj?.DefenseBonus ??
        obj?.ArmorBonus ??
        obj?.playerArmorDefense ??
        obj?.playerArmorDefence ??
        0,
      0
    );
    const powerBonus = toSafeInt(root?.Power ?? root?.MS ?? root?.Str ?? 0, 0);
    const focusBonus = toSafeInt(root?.Focus ?? root?.MentalStrength ?? obj?.MentalStrengthBonus ?? obj?.FocusBonus ?? 0, 0);
    const stealthBonus = toSafeInt(root?.Stealth ?? root?.Agility ?? root?.Agl ?? obj?.AgilityBonus ?? obj?.StealthBonus ?? 0, 0);
    const speedBonus = toSafeInt(root?.Speed ?? obj?.SpeedBonus ?? obj?.playerSpeed ?? 0, 0);
    return { ms: msBonus, defence: defenceBonus, power: powerBonus, focus: focusBonus, stealth: stealthBonus, speed: speedBonus };
  };

  const getEquippedBonuses = (equippedMap, objectMap) => {
    const totals = { ms: 0, defence: 0, power: 0, focus: 0, stealth: 0, speed: 0 };
    const lookup = objectMap || game?.objectMap || {};
    for (const [id, on] of Object.entries(equippedMap || {})) {
      if (!on) continue;
      const obj = lookup?.[id] ?? null;
      if (!obj) continue;
      const bonus = getObjectEquipmentBonuses(obj);
      totals.ms += bonus.ms;
      totals.defence += bonus.defence;
      totals.power += bonus.power;
      totals.focus += bonus.focus;
      totals.stealth += bonus.stealth;
      totals.speed += bonus.speed;
    }
    return totals;
  };

  const shouldShowMenuEntry = (entry, ctx) => {
    if (!entry) return false;
    if (entry?.bActive === false || entry?.active === false) return false;
    if (entry?.Disabled === true || entry?.disabled === true) return false;
    const hideIf = entry?.HideIf ?? entry?.hideIf ?? null;
    if (hideIf !== null && hideIf !== undefined && hideIf !== '' && evaluateCondition(hideIf, ctx)) return false;
    const showIf = entry?.ShowIf ?? entry?.showIf ?? entry?.CondStr ?? entry?.condStr ?? null;
    if (showIf === null || showIf === undefined || showIf === '') return true;
    return evaluateCondition(showIf, ctx);
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

  const resolveContainerOpenState = (containerId, containerObj = null) => {
    const id = String(containerId ?? '').trim();
    if (!id) return false;

    const uiOpen = containerUi?.[id]?.open;
    if (uiOpen !== undefined) return Boolean(uiOpen);

    const obj = containerObj || game?.objectMap?.[id] || null;
    if (!obj) return false;

    const closedFlag = getCustomProperty(obj, 'Closed');
    if (closedFlag !== undefined) return !Boolean(closedFlag);

    const openedFlag = getCustomProperty(obj, 'Opened');
    if (openedFlag !== undefined) return Boolean(openedFlag);

    return false;
  };

  const resolveContainerContentIds = (containerId, containerObj = null) => {
    const id = String(containerId ?? '').trim();
    if (!id) return [];
    const obj = containerObj || game?.objectMap?.[id] || null;
    if (!obj) return [];
    if (!Array.isArray(obj?.Contents)) return [];
    return obj.Contents.map(entry => String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim()).filter(Boolean);
  };

  const toggleContainerOpen = containerId => {
    const id = String(containerId ?? '').trim();
    if (!id) return;
    if (combat) return;
    if (interactionLocked) return;
    const containerObj = game?.objectMap?.[id] ?? null;
    const nextOpen = !resolveContainerOpenState(id, containerObj);
    const defaultContents = resolveContainerContentIds(id, containerObj);

    setHoveredContainerItemId(null);
    setContainerUi(prev => {
      const existing = prev?.[id] ?? null;
      const resolvedOpen = existing ? !Boolean(existing.open) : nextOpen;
      const nextEntry = existing
        ? {
            ...existing,
            open: resolvedOpen,
            contents: resolvedOpen ? defaultContents : Array.isArray(existing.contents) ? existing.contents : defaultContents
          }
        : { open: resolvedOpen, contents: defaultContents };
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
    const bonusLines = [];
    if (!id) return { bonusLines };
    if (combat) return { bonusLines };
    if (interactionLocked) return { bonusLines };

    if (shouldEquip && id === 'wallet_001' && game?.player) {
      if (!game.player.Stats || typeof game.player.Stats !== 'object') game.player.Stats = {};
      const stats = game.player.Stats;
      const prologueComplete = stats.prologue_complete === true;
      const alreadyAwarded = stats.prologue_wallet_xp_awarded === true;
      if (!prologueComplete && !alreadyAwarded) {
        const currentExp = toSafeInt(stats.Experience ?? stats.XP ?? 0, 0);
        stats.Experience = currentExp + 5;
        stats.prologue_wallet_xp_awarded = true;
        bonusLines.push('<b>+5 EXP</b>');
      }
    }

    if (shouldEquip && id === 'vibranium_ring_001' && game?.player) {
      if (!Array.isArray(game.player.Abilities)) game.player.Abilities = [];
      const hasTelepathy = game.player.Abilities.some(entry => {
        if (!entry || typeof entry !== 'object') return false;
        const uid = String(entry.UniqueID ?? entry.id ?? '').trim().toLowerCase();
        const name = String(entry.Name ?? entry.name ?? '').trim().toLowerCase();
        return uid === 'ability_telepathy_001' || name === 'telepathy';
      });

      if (!hasTelepathy) {
        game.player.Abilities.push({
          UniqueID: 'ability_telepathy_001',
          Name: 'Telepathy',
          Tooltip: 'Read or send thoughts (Mind Reading).',
          Combat: false,
          PowerRequired: 0
        });
      }

      if (!game.player.Stats || typeof game.player.Stats !== 'object') game.player.Stats = {};
      game.player.Stats.prologue_telepathy_unlocked = true;
    }
 
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

    // Check level progression BEFORE saving so stat changes are persisted
    const levelProgression = game.checkLevelProgression();

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
     
    openLevelUpNotice(levelProgression, game.player, game.leveling);
    return { bonusLines };
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
    const name = obj?.Name || obj?.name || humanizeId(id) || 'Item';

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
    const name = obj?.Name || obj?.name || humanizeId(id) || 'Item';
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
      if (vId === 'shadydealer_001') {
        setEventMessages([`You don't have enough money pal, maybe next time. You have <b>${currentCredits}</b>, need <b>${cost}</b>.`]);
      } else {
        setEventMessages([`Not enough credits. You need <b>${cost}</b>, but you have <b>${currentCredits}</b>.`]);
      }
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
      setEventMediaTitle(room?.name || room?.Name || title || humanizeId(roomId) || null);
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
    const name = obj?.Name || obj?.name || item?.name || humanizeId(id) || 'Item';
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
    if (!cId || !itemId || !game?.objectMap?.[cId]) return { removed: false, removedEntry: null };

    const containerObj = game.objectMap[cId];
    if (!Array.isArray(containerObj.Contents)) return { removed: false, removedEntry: null };

    const remaining = [];
    let removedEntry = null;

    for (const entry of containerObj.Contents) {
      const entryId = String(entry?.UniqueID ?? entry?.id ?? entry ?? '').trim();
      if (entryId === itemId && removedEntry === null) {
        removedEntry = entry;
        continue;
      }
      remaining.push(entry);
    }

    if (removedEntry === null) return { removed: false, removedEntry: null };
    containerObj.Contents = remaining;
    return { removed: true, removedEntry };
  };

  const takeFromContainerToInventory = ({ containerId, itemId, autoEquip = false } = {}) => {
    const cId = String(containerId ?? '').trim();
    const id = String(itemId ?? '').trim();
    if (!cId || !id) return;
    if (!game) return;
    if (combat) return;

    const itemObj = game?.objectMap?.[id] ?? null;
    const name = itemObj?.Name || itemObj?.name || humanizeId(id) || 'Item';
    const type = String(itemObj?.Type ?? itemObj?.type ?? '').trim().toLowerCase();
    const stackable = type === 'consumable';
    const alreadyOwned = hasInventoryItem(id);

    if (alreadyOwned && !stackable) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`You already own <b>${name}</b>.`]);
      return;
    }

    const removal = removeFromContainer(cId, id);
    if (!removal.removed) {
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`<b>${name}</b> isn't inside that container.`]);
      return;
    }

    const added = ensureInventoryItem(id);
    if (!added) {
      const containerObj = game?.objectMap?.[cId] ?? null;
      if (containerObj && Array.isArray(containerObj.Contents) && removal.removedEntry) {
        containerObj.Contents.push(removal.removedEntry);
      }
      setEventMedia(null);
      setEventMediaTitle(null);
      setEventMessages([`Couldn't take <b>${name}</b>.`]);
      return;
    }

    setContainerUi(prev => {
      const existing = prev?.[cId] ?? null;
      if (!existing || !Array.isArray(existing.contents)) return prev;
      return { ...(prev || {}), [cId]: { ...existing, contents: existing.contents.filter(entry => String(entry ?? '').trim() !== id) } };
    });

    setSelectedInventoryId(id);
    setHoveredContainerItemId(null);

    const equipResult = autoEquip ? setItemEquipped(id, true) : null;
    const equipBonusLines = Array.isArray(equipResult?.bonusLines) ? equipResult.bonusLines : [];

    if (removal.removed || added) {
      const lines = [`You take <b>${name}</b>.`];
      if (autoEquip) {
        const narration = getActionsMenuDescription(itemObj, 'Equip');
        lines.push(narration || `You equip <b>${name}</b>.`);
        if (equipBonusLines.length) lines.push(...equipBonusLines);
      }

      setEventMedia(itemObj?.media || itemObj?.Picture || null);
      setEventMediaTitle(name);
      setEventMessages(lines);
    }

    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    commitObjectToSave(cId, save);
    persistSaveGame(save);
  };

  useEffect(() => {
    if (!game?.player) return;
    syncEquippedToPlayer(equippedInventory);

    const levelProgression = game.checkLevelProgression();
    openLevelUpNotice(levelProgression, game.player, game.leveling);
    refreshPlayerState(game);

    if (!levelProgression || levelProgression.levelsGained <= 0) return;
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
    if (interactionLocked) return;
    if (!canTakeObject(obj)) {
      const name = obj?.name || obj?.Name || humanizeId(obj?.id ?? obj?.UniqueID) || 'object';
      setEventMediaTitle(null);
      setEventMessages([`You can't take <b>${name}</b>.`]);
      return;
    }

    const objId = obj?.id ?? obj?.UniqueID ?? null;
    const name = obj?.name || obj?.Name || humanizeId(objId) || 'Object';
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
      const droppedName = item?.name || obj?.name || obj?.Name || removed?.Name || humanizeId(itemId) || 'Item';
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
    if (interactionLocked) return;
    if (!game || !currentRoom) return;
    setEventMediaTitle(null);
    setInspectTarget({ type: 'object', id: item.id });

    const result = game.eventEngine.runEvent('<<On Click>>', { entityType: 'object', entityId: item.id, entity: item.obj, room: currentRoom });
    const fallbackText = item?.obj?.Description ?? item?.obj?.description ?? '';
    const nextTexts = Array.isArray(result?.texts) && result.texts.length ? result.texts : (fallbackText ? [fallbackText] : []);
    setEventMedia(result?.media || item?.obj?.media || item?.obj?.Picture || null);
    setEventMessages(nextTexts);
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

    const encounter = game.consumePendingEncounter?.(roomId) ?? null;
    if (!encounter) return;
    if (String(encounter?.kind ?? '').toLowerCase() !== 'combat') return;

    const enemyId = String(encounter?.enemyId ?? '').trim();
    if (!enemyId) return;
    const enemy = game?.characterMap?.[enemyId] ?? null;
    if (!enemy) return;
    startCombat(enemy);
  }, [game, currentRoom?.id, combat]);

  const playerPortrait = playerPortraitOverride || player?.PlayerPortrait || DEFAULT_PLAYER;
  const playerPortraitUrl = resolveMediaUrl(playerPortrait) || playerPortrait;
  const playerForStats = game?.player ?? player;
  const level = toSafeInt(playerForStats?.Stats?.Level ?? 0, 0);
  const mentalStatus = getMentalStatusForLevel(game?.leveling, level);
  const mentalLevelDisplay = mentalStatus?.type
    ? mentalStatus.display
    : getMentalLevelDisplayFromTable(playerForStats, level);
  const mentalDescription = mentalStatus?.description || null;

  const gameClock = getGameClockFromStats(playerForStats?.Stats);
  const gameTimeLabel = formatGameClock(gameClock.minutes);
  const dayPart = getDayPartFromMinutes(gameClock.minutes);
  const dayPartKey = String(dayPart ?? '').trim().toLowerCase();
  const roomTimeKey =
    dayPartKey === 'noon'
      ? 'day'
      : dayPartKey === 'midnight' || dayPartKey === 'evening'
        ? 'night'
        : dayPartKey;
  const roomTime = { getTimeOfDay: () => roomTimeKey };

  const hp = playerForStats?.Stats?.Health ?? '?';
  const maxHp = playerForStats?.Stats?.MaxHealth ?? '?';
  const energy = playerForStats?.Stats?.Energy ?? '?';
  const maxEnergy = playerForStats?.Stats?.MaxEnergy ?? '?';
  const notoriety = playerForStats?.Stats?.Notoriety ?? 0;
  const maxNotoriety = playerForStats?.Stats?.MaxNotoriety ?? 100;
  const credits = playerForStats?.Credits ?? 0;
  const unspentStatPoints = toSafeInt(
    playerForStats?.Stats?.UnspentStatPoints ?? playerForStats?.Stats?.unspentStatPoints ?? 0,
    0
  );

  const equippedBonuses = getEquippedBonuses(equippedInventory, game?.objectMap);

  // Core stats (Power/Focus/Stealth) with equipment bonuses
  const power = (playerForStats?.Stats?.Power ?? playerForStats?.Stats?.MS ?? 0) + equippedBonuses.power;
  const focus = (playerForStats?.Stats?.Focus ?? playerForStats?.Stats?.MentalStrength ?? 0) + equippedBonuses.focus;
  const stealth = (playerForStats?.Stats?.Stealth ?? playerForStats?.Stats?.Agility ?? 0) + equippedBonuses.stealth;
  
  // Combat stats
  const ms = (playerForStats?.Stats?.MS ?? 0) + equippedBonuses.ms;
  const speed = (playerForStats?.Stats?.Speed ?? 0) + equippedBonuses.speed;
  const daysInGame = gameClock.day;

  const experience = toSafeInt(player?.Stats?.Experience ?? 0, 0);
  const experienceCheckpoints = getExperienceCheckpoints(player, game?.leveling);
  const configMaxLevelRaw = Number(game?.leveling?.maxLevel);
  const maxLevel = Number.isFinite(configMaxLevelRaw)
    ? Math.max(0, Math.min(Math.trunc(configMaxLevelRaw), experienceCheckpoints.length))
    : Math.max(0, experienceCheckpoints.length - 1);
  const expToNext = level < maxLevel ? toSafeInt(experienceCheckpoints[level], 0) : null;

  const allocateLevelUpPoint = statKey => {
    if (!game?.player) return;
    if (!game.player.Stats || typeof game.player.Stats !== 'object') game.player.Stats = {};

    const stats = game.player.Stats;
    const currentPoints = Math.max(0, toSafeInt(stats.UnspentStatPoints ?? stats.unspentStatPoints ?? 0, 0));
    if (!currentPoints) return;

    const kind = String(statKey ?? '').trim().toLowerCase();

    if (kind === 'power') {
      const next = toSafeInt(stats.MS ?? stats.Power ?? 0, 0) + 1;
      stats.MS = next;
      stats.Power = next;
    } else if (kind === 'focus') {
      const next = toSafeInt(stats.MentalStrength ?? stats.Focus ?? 0, 0) + 1;
      stats.MentalStrength = next;
      stats.Focus = next;
    } else if (kind === 'stealth') {
      const next = toSafeInt(stats.Agility ?? stats.Stealth ?? 0, 0) + 1;
      stats.Agility = next;
      stats.Stealth = next;
    } else {
      return;
    }

    stats.UnspentStatPoints = currentPoints - 1;

    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);

    refreshPlayerState(game);

    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    persistSaveGame(save);
  };

  const locationName = currentRoom?.name || currentRoom?.Name || 'Unknown location';
  const locationDescription = currentRoom?.description || currentRoom?.Description || '';
  const roomMediaRaw = resolveConditionalValue(
    currentRoom?.Picture ?? currentRoom?.media ?? null,
    { game, room: currentRoom, vars: game?.variables ?? {} },
    null
  );
  const locationBg =
    roomMediaRaw && typeof roomMediaRaw === 'object'
      ? getRoomImage({ Picture: roomMediaRaw }, roomTime) || DEFAULT_BG
      : roomMediaRaw || currentRoom?.media || DEFAULT_BG;

  const inventory = Array.isArray(player?.Inventory) ? player.Inventory : [];
  const inventoryItems = inventory.map(item => {
    const id = item?.UniqueID || item?.id || item?.Name || 'unknown';
    const obj = game?.objectMap?.[id] || null;
    const baseName = item?.Name || obj?.Name || obj?.name || humanizeId(id) || 'Item';
    const quantity = Math.max(1, toSafeInt(item?.Quantity ?? item?.Qty ?? item?.Count ?? 1, 1));
    const label = quantity > 1 ? `${baseName} ×${quantity}` : baseName;
    const isContainer = isContainerObject(obj);
    const isOpen = isContainer && resolveContainerOpenState(id, obj);
    return { id, name: baseName, label, quantity, obj, isContainer, isOpen };
  });

  const playerEquippedWeaponName = (() => {
    const equippedWeapons = inventoryItems.filter(item => Boolean(equippedInventory?.[item.id]) && isWeaponObject(item.obj));
    if (!equippedWeapons.length) return 'Fist';

    const scored = equippedWeapons.map(item => {
      const obj = item?.obj ?? null;
      const weaponBonus = toSafeInt(
        obj?.WeaponBonus ?? obj?.Bonuses?.WeaponBonus ?? obj?.playerWeaponDmg ?? obj?.playerWeaponDamage ?? obj?.AttackBonus ?? obj?.Bonuses?.Attack,
        0
      );
      return { item, weaponBonus };
    });

    scored.sort((a, b) => (b.weaponBonus || 0) - (a.weaponBonus || 0));
    return scored[0]?.item?.name || 'Weapon';
  })();

  const playerEquippedWeaponsForMenu = inventoryItems.filter(item => Boolean(equippedInventory?.[item.id]) && isWeaponObject(item.obj));

  const playerAbilitiesForMenu = Array.isArray(player?.Abilities) ? player.Abilities : [];

  const effectiveSelectedInventoryId = selectedInventoryId || inventoryItems[0]?.id || null;
  const selectedInventoryItem =
    (effectiveSelectedInventoryId && inventoryItems.find(item => item.id === effectiveSelectedInventoryId)) || null;

  const toggleEquipped = itemId => {
    const id = String(itemId ?? '').trim();
    if (!id) return;
    if (combat) return;
    const current = Boolean(equippedInventory?.[id]);
    const shouldEquip = !current;
    const result = setItemEquipped(id, shouldEquip);
    const bonusLines = Array.isArray(result?.bonusLines) ? result.bonusLines : [];

    const obj = game?.objectMap?.[id] ?? null;
    const name = obj?.Name || obj?.name || humanizeId(id) || 'Item';
    const narration = getActionsMenuDescription(obj, shouldEquip ? 'Equip' : 'Unequip');
    const descriptionFallback = obj?.Description ?? obj?.description ?? '';
    const fallback = shouldEquip ? `You equip <b>${name}</b>.` : `You unequip <b>${name}</b>.`;

    setEventMedia(obj?.media || obj?.Picture || null);
    setEventMediaTitle(name);
    setEventMessages([narration || descriptionFallback || fallback, ...bonusLines].filter(Boolean));
  };

  const exits = Array.isArray(currentRoom?.exits) ? currentRoom.exits : [];
  const visibleExits = exits
    .map(exit => {
      const exitCtx = { game, room: currentRoom, vars: game?.variables ?? {}, exit };
      const showIf = exit?.showIf ?? exit?.ShowIf ?? exit?.CondStr ?? exit?.condStr ?? null;
      if (showIf !== null && showIf !== undefined && showIf !== '' && !evaluateCondition(showIf, exitCtx)) return null;

      const rawDestination = resolveConditionalValue(
        exit?.destinationRaw ?? exit?.DestinationRoom ?? exit?.destination ?? exit?.DestinationId ?? exit?.destinationId ?? null,
        exitCtx,
        exit?.destinationRaw ?? exit?.DestinationRoom ?? exit?.destination ?? null
      );
      const destinationText = typeof rawDestination === 'string' ? rawDestination.trim() : '';
      const destinationId = destinationText ? resolveRoomIdFromGame(destinationText) : null;
      const destinationRoom = destinationId ? game?.roomMap?.[destinationId] ?? null : null;
      const destinationName =
        destinationRoom?.Name ||
        String(
          resolveConditionalValue(exit?.destinationName ?? exit?.DestinationName ?? destinationText, exitCtx, destinationText) ?? ''
        ).trim();
      const todoLabel = String(resolveConditionalValue(exit?.todoLabel ?? exit?.TodoLabel ?? '', exitCtx, '') ?? '').trim();

      return {
        ...exit,
        destinationId,
        destinationName: destinationName || destinationText,
        destinationRaw: rawDestination,
        todoLabel: todoLabel || null
      };
    })
    .filter(Boolean);

  const handleExamineRoom = () => {
    if (!game || !currentRoom) return;
    if (combat) return;
    if (interactionLocked) return;
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    const result = game.eventEngine.runEvent('Examine Room', { entityType: 'room', entityId: currentRoom.id, room: currentRoom });
    setEventMessages(result?.texts || []);
    setEventMedia(result?.media || null);
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);
  };

  const roomActionMenuItems = (() => {
    const raw = Array.isArray(currentRoom?.Actions) ? currentRoom.Actions : Array.isArray(currentRoom?.actions) ? currentRoom.actions : [];
    const items = raw
      .map(entry => {
        const name = String(entry?.name ?? entry?.Name ?? '').trim();
        if (!name) return null;
        if (name.startsWith('<<')) return null;
        if (entry?.bActive === false) return null;
        const tooltip =
          formatMenuDescription(entry?.Tooltip ?? entry?.tooltip ?? '', { game, room: currentRoom, vars: game?.variables ?? {}, entity: currentRoom }, '') ||
          '';
        const label = name === 'Examine Room' ? 'Examine' : name;
        return { action: name, label, description: tooltip || undefined };
      })
      .filter(Boolean);

    items.sort((a, b) => {
      if (a.action === 'Examine Room') return -1;
      if (b.action === 'Examine Room') return 1;
      return a.label.localeCompare(b.label);
    });
    return items;
  })();

  const hasExtraRoomActions = roomActionMenuItems.some(item => item?.action && item.action !== 'Examine Room');

  const handleRoomAction = actionName => {
    const name = String(actionName ?? '').trim();
    if (!name) return;
    if (!game || !currentRoom) return;
    if (combat) return;
    if (interactionLocked) return;
    setActiveDrawer(null);
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    if (name === 'Examine Room') {
      handleExamineRoom();
      return;
    }
    runEntityActionEvent({
      entityType: 'room',
      entityId: currentRoom.id,
      entity: currentRoom,
      eventType: name,
      label: name
    });
  };

  const toggleInspect = (type, id, entity) => {
    if (!id) return;
    if (combat) return;
    if (interactionLocked) return;
    if (type === 'object') setHoveredObjectMenuId(null);
    const willSelect = !(inspectTarget.type === type && inspectTarget.id === id);
    setDismissedOverlayKey(null);
    setEventMediaTitle(null);
    setEventMessages([]);
    setInspectTarget(prev => {
      if (prev.type === type && prev.id === id) return { type: 'room', id: currentRoom?.id ?? null };
      return { type, id };
    });

    if (!willSelect || !game) return;
    const entityType = type === 'npc' ? 'character' : type;
    const result = game.eventEngine.runEvent('<<On Click>>', { entityType, entityId: id, entity, room: currentRoom });
    setEventMessages(normalizeTextList(result?.texts || []));
    if (result?.media) {
      const title = entity?.Name || entity?.name || entity?.Charname || humanizeId(id) || null;
      showTransientMedia(result.media, { title });
    } else {
      clearTransientMedia();
      setEventMedia(null);
    }
    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);
  };

  const openActionsDrawerForTarget = ({ type, id, entity }) => {
    if (!id) return;
    if (combat) return;
    if (interactionLocked) return;

    const isSelected = inspectTarget.type === type && inspectTarget.id === id;
    if (!isSelected) {
      setDismissedOverlayKey(null);
      setEventMediaTitle(null);
      setEventMessages([]);
      setInspectTarget({ type, id });

      if (game) {
        const entityType = type === 'npc' ? 'character' : type;
        const result = game.eventEngine.runEvent('<<On Click>>', { entityType, entityId: id, entity, room: currentRoom });
        setEventMessages(result?.texts || []);
        setEventMedia(result?.media || null);
        openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);
      }
    }

    setActiveDrawer('actions');
  };

  const resolvedRoomObjects = (roomObjects || [])
    .map(resolveRoomObject)
    .filter(obj =>
      shouldShowMenuEntry(obj, { game, room: currentRoom, vars: game?.variables ?? {}, objectBeingActedUpon: obj, entity: obj })
    );

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

  const inspectedMedia = inspectedObject?.media || inspectedObject?.Picture || inspectedNpc?.media || inspectedNpc?.Picture || null;
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
    (inspectTarget?.id ? humanizeId(inspectTarget.id) : null);
  const inspectedDescription =
    inspectedObject?.description || inspectedObject?.Description || inspectedNpc?.description || inspectedNpc?.Description || null;

  const overlayTitle = (() => {
    if (combat) return combat?.enemyName || null;

    if (!combat && activeDrawer === 'vendor' && shopHoveredItemId) {
      const obj = game?.objectMap?.[shopHoveredItemId] ?? null;
      return obj?.Name || obj?.name || humanizeId(shopHoveredItemId) || null;
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
        const itemName = itemObj?.Name || itemObj?.name || humanizeId(itemId) || 'Item';
        const price = toSafeInt(entry?.Price ?? itemObj?.Price ?? 0, 0);
        const stackable = String(itemObj?.Type ?? itemObj?.type ?? '').trim().toLowerCase() === 'consumable';
        return { itemId, itemName, price, stackable };
      })
      .filter(Boolean);
  };

  const getVendorShopEntriesForNpc = npc => {
    const raw = resolveVendorShopItems(npc);
    return raw
      .map(entry => {
        const itemId = String(entry?.UniqueID ?? entry?.id ?? '').trim();
        if (!itemId) return null;
        const itemObj = game?.objectMap?.[itemId] ?? null;
        const itemName = itemObj?.Name || itemObj?.name || humanizeId(itemId) || 'Item';
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

  const runEntityActionEvent = ({ entityType, entityId, entity, eventType, label, input } = {}) => {
    if (!game || !currentRoom) return;
    if (combat) return;
    if (interactionLocked) return;
    if (game.commandRunner?.isPaused?.()) return;
    const name = String(eventType ?? '').trim();
    if (!name) return;

    setActiveDrawer(null);
    const safeInput =
      input === undefined || input === null
        ? undefined
        : String(input)
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80);

    const result =
      game.commandRunner?.start?.({
        eventType: name,
        entityType,
        entityId,
        entity,
        room: currentRoom,
        input: safeInput
      }) ??
      game.eventEngine.runEvent(name, { entityType, entityId, entity, room: currentRoom, input: safeInput });
    const abilityPortrait = resolveAbilityPortrait(name);
    if (abilityPortrait) {
      showPlayerPortraitOverride(abilityPortrait);
    }
    if (entityType === 'character' && isMindReadAction(name)) {
      const thought = getNextMindReadThought(entity);
      if (thought) {
        result.texts.push(`&lt;${thought}&gt;`);
        if (!result.media) {
          result.media = entity?.Picture || entity?.CharPortrait || entity?.media || null;
        }
        result.didSomething = true;
      }
    }
    const hasScene = Boolean(result?.sceneData);
    const baseTexts =
      Array.isArray(result?.texts) && result.texts.length
        ? result.texts
        : hasScene
          ? []
          : [`<b>${label || name}</b>.`];
    const errors = Array.isArray(result?.errors) ? result.errors : [];
    const displayTexts = normalizeTextList(errors.length ? [...baseTexts, ...errors] : baseTexts);

    const openShopVendorId = String(result?.openShopVendorId ?? '').trim();
    const openShopCategory = String(result?.openShopCategory ?? '').trim() || null;

    const startCombatEnemyId = String(result?.startCombatEnemyId ?? '').trim();
    const startCombatEnemy = startCombatEnemyId ? game?.characterMap?.[startCombatEnemyId] ?? null : null;
    const combatMedia = String(result?.media ?? '').trim() || null;
    const wantsCombatPrompt = Boolean(startCombatEnemyId);

    openLevelUpNotice(game.checkLevelProgression(), game.player, game.leveling);

    const nextRoom = game.getCurrentRoom();
    if (nextRoom) {
      updateRoom(nextRoom, game, { resetInspectTarget: false });

      if (inspectTarget.type === 'npc' && inspectTarget.id) {
        const stillPresent = (game.getRoomCharacters(nextRoom.id) || []).some(npc => (npc?.id ?? npc?.UniqueID) === inspectTarget.id);
        if (!stillPresent) setInspectTarget({ type: 'room', id: nextRoom.id });
      }

      if (inspectTarget.type === 'object' && inspectTarget.id) {
        const stillPresent = (game.getRoomObjects(nextRoom.id) || []).some(obj => (obj?.id ?? obj?.UniqueID) === inspectTarget.id);
        if (!stillPresent) setInspectTarget({ type: 'room', id: nextRoom.id });
      }
    }

    refreshPlayerState(game);
    const save = ensureSaveGameShape(game);
    commitPlayerToSave(save);
    if (entityType === 'character' && entityId) commitCharacterToSave(entityId, save);
    if (entityType === 'object' && entityId) commitObjectToSave(entityId, save);
    persistSaveGame(save);

    if (wantsCombatPrompt) {
      if (!startCombatEnemy) {
        setEventMedia(combatMedia || null);
        setEventMediaTitle(null);
        setEventMessages([...displayTexts, `Unknown enemy id: ${startCombatEnemyId}.`]);
        return;
      }

      // Show the pre-fight narration first, and only enter combat on Continue.
      const normalPortrait = startCombatEnemy?.Picture || startCombatEnemy?.media || null;
      setEventMedia(normalPortrait || null);
      setEventMediaTitle(startCombatEnemy?.Charname || startCombatEnemy?.Name || startCombatEnemy?.name || null);
      setEventMessages(displayTexts);
      setScenePrompt(null);
      setActiveDrawer(null);
      setContinuePrompt({ kind: 'combat', enemyId: startCombatEnemyId, combatMedia });
      return;
    }

    const wantsTransientMedia =
      entityType !== 'room' && isMindReadAction(name) && Boolean(result?.media) && !result?.sceneData;
    if (wantsTransientMedia) {
      const title =
        entity?.Charname || entity?.Name || entity?.name || humanizeId(entityId) || null;
      showTransientMedia(result.media, { title });
    } else {
      clearTransientMedia();
      setEventMedia(result?.media || null);
      setEventMediaTitle(null);
    }
    setEventMessages(displayTexts);

    if (openShopVendorId) {
      const vendorEntity =
        (roomObjects || []).find(obj => (obj?.id ?? obj?.UniqueID) === openShopVendorId) ||
        (roomNpcs || []).find(npc => (npc?.id ?? npc?.UniqueID) === openShopVendorId) ||
        game?.objectMap?.[openShopVendorId] ||
        game?.characterMap?.[openShopVendorId] ||
        null;

      if (vendorEntity) {
        if (openShopCategory) openVendorShopWithCategory(vendorEntity, openShopCategory);
        else openVendorShop(vendorEntity);
      }
    }

    if (result?.sceneData) {
      const nextSceneData = result.sceneData;
      const lines = Array.isArray(nextSceneData?.lines) ? nextSceneData.lines : [];
      const choices = Array.isArray(nextSceneData?.choices) ? nextSceneData.choices : [];
      const canContinue = Boolean(!nextSceneData?.isEnd && !choices.length);

      setEventMedia(nextSceneData?.media || result?.media || null);
      setEventMediaTitle(null);
      setEventMessages(lines.length ? lines : ['...']);

      sceneAutoRevealRef.current = true;
      setScenePrompt(nextSceneData);
      setSceneRevealed(true);
      setContinuePrompt(canContinue ? { kind: 'scene' } : null);
      return;
    } else if (result?.paused) {
      const destinationId = String(game?.variables?.continue_to_room ?? '').trim();
      const continueScript = String(game?.variables?.continue_script ?? '').trim();
      if (continueScript) {
        setContinuePrompt({ kind: 'script', scriptId: continueScript });
      } else if (game.commandRunner?.isPaused?.()) {
        setContinuePrompt({ kind: 'command' });
      } else {
        setContinuePrompt({ destinationId: destinationId || null });
      }
      setScenePrompt(null);
    } else {
      if (continuePrompt) clearContinuePrompt(game);
      if (scenePrompt) setScenePrompt(null);
    }
  };

  const buildActionsDrawerModel = () => {
    if (combat) return null;

    const roomTitle = locationName;
    const roomDescriptionText = currentRoom?.description || currentRoom?.Description || '';

    if (inspectTarget.type === 'npc' && inspectedNpc) {
      const npcId = inspectedNpc?.id ?? inspectedNpc?.UniqueID ?? null;
      const npcName = inspectedNpc?.Charname || inspectedNpc?.name || inspectedNpc?.Name || humanizeId(npcId) || 'NPC';
      const npcDesc = inspectedNpc?.Description || inspectedNpc?.description || '';

      const menu = Array.isArray(inspectedNpc?.ActionsMenu) ? inspectedNpc.ActionsMenu : [];
      const menuCtx = { game, room: currentRoom, vars: game?.variables ?? {}, character: inspectedNpc, entity: inspectedNpc };
      const menuActions = menu
        .filter(entry => shouldShowMenuEntry(entry, menuCtx))
        .map(entry => ({
          label: String(entry?.Action ?? '').trim(),
          description: formatMenuDescription(entry?.Description ?? entry?.Tooltip ?? '', menuCtx, '') || null
        }))
        .filter(entry => entry.label);

      const playerAbilities = Array.isArray(player?.Abilities) ? player.Abilities : [];
      const canTelepath =
        Boolean(player?.Stats?.prologue_telepathy_unlocked) ||
        playerAbilities.some(entry => {
          const name = String(entry?.Name ?? entry?.name ?? '').trim().toLowerCase();
          return name === 'telepathy' || name === 'mind read' || name === 'read mind';
        });

      const mindThoughts = getMindReadThoughts(inspectedNpc);
      const hasMindRead = mindThoughts.length > 0;
      if (hasMindRead && canTelepath && !menuActions.some(entry => normalizeActionName(entry.label) === 'telepathy')) {
        menuActions.push({
          label: 'Telepathy',
          description: `Read ${npcName}'s thoughts.`
        });
      }

      const menuActionKeys = new Set(menuActions.map(entry => normalizeActionName(entry.label)));
      const customChoiceActions = getCustomChoiceActions(inspectedNpc);
      const abilityActions = playerAbilities
        .map(ability => ({
          label: String(ability?.Name ?? '').trim(),
          description: String(ability?.Tooltip ?? '').trim() || null,
          combat: Boolean(ability?.Combat ?? ability?.combat ?? false)
        }))
        .filter(entry => entry.label && !entry.combat && !menuActionKeys.has(normalizeActionName(entry.label)));

      const customChoiceSections = [];
      const interactItems = [];

      for (const entry of menuActions) {
        const actionKey = normalizeActionName(entry.label);
        const id = `npc:${npcId || 'unknown'}:${actionKey}`;
        const custom = customChoiceActions.get(actionKey) ?? null;
        if (custom && custom.choices.length) {
          const sectionTitle = custom.title || entry.label;
          const choiceItems = custom.choices
            .filter(choice => shouldShowMenuEntry(choice, menuCtx))
            .map((choice, idx) => ({
            id: `npc:${npcId || 'unknown'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
            label: choice.label,
            description: entry.description || custom.tooltip || null,
            onClick: () =>
              runEntityActionEvent({
                entityType: 'character',
                entityId: npcId,
                entity: inspectedNpc,
                eventType: entry.label,
                label: `${npcName}: ${entry.label}`,
                input: choice.value
              })
          }));
          if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
          continue;
        }

        if (actionKey === 'attack') {
          interactItems.push({ id, label: entry.label, description: entry.description, onClick: () => startCombat(inspectedNpc) });
          continue;
        }
        if (actionKey === 'examine') {
          interactItems.push({ id, label: entry.label, description: entry.description, onClick: () => examineNpc(inspectedNpc) });
          continue;
        }

        interactItems.push({
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
        });
      }

      for (const [actionKey, custom] of customChoiceActions.entries()) {
        if (menuActionKeys.has(actionKey)) continue;
        const sectionTitle = custom.title || custom.name || 'Action';
        const choiceItems = custom.choices
          .filter(choice => shouldShowMenuEntry(choice, menuCtx))
          .map((choice, idx) => ({
          id: `npc:${npcId || 'unknown'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
          label: choice.label,
          description: custom.tooltip || null,
          onClick: () =>
            runEntityActionEvent({
              entityType: 'character',
              entityId: npcId,
              entity: inspectedNpc,
              eventType: custom.name,
              label: `${npcName}: ${custom.name}`,
              input: choice.value
            })
        }));
        if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
      }

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
      if (customChoiceSections.length) sections.push(...customChoiceSections);
      if (interactItems.length) sections.push({ title: 'Interact', items: interactItems });
      if (abilityItems.length) sections.push({ title: 'Abilities', items: abilityItems });
      return { title: npcName, description: npcDesc, sections };
    }

    if (inspectTarget.type === 'object' && inspectedObject) {
      const objId = inspectedObject?.id ?? inspectedObject?.UniqueID ?? null;
      const objName = inspectedObject?.name || inspectedObject?.Name || humanizeId(objId) || 'Object';
      const objDesc = inspectedObject?.description || inspectedObject?.Description || '';
      const containerObj = objId ? game?.objectMap?.[objId] ?? inspectedObject : inspectedObject;
      const containerOpen = Boolean(objId && isContainerObject(containerObj) && resolveContainerOpenState(objId, containerObj));

      const actions = Array.isArray(inspectedObject?.ActionsMenu) ? inspectedObject.ActionsMenu : [];
      const actionMenuCtx = { game, room: currentRoom, vars: game?.variables ?? {}, objectBeingActedUpon: inspectedObject, entity: inspectedObject };
      const actionItems = actions
        .filter(entry => shouldShowMenuEntry(entry, actionMenuCtx))
        .map(entry => ({
          label: String(entry?.Action ?? '').trim(),
          description: formatMenuDescription(entry?.Description ?? entry?.Tooltip ?? '', actionMenuCtx, '') || null,
          inputType: String(entry?.InputType ?? entry?.inputType ?? '').trim() || null,
          maskInput: Boolean(entry?.MaskInput ?? entry?.maskInput ?? false),
          placeholder:
            String(resolveConditionalValue(entry?.Placeholder ?? entry?.placeholder ?? '', actionMenuCtx, '') ?? '').trim() ||
            null,
          submitLabel:
            String(resolveConditionalValue(entry?.SubmitLabel ?? entry?.submitLabel ?? '', actionMenuCtx, '') ?? '').trim() ||
            null
        }))
        .filter(entry => entry.label);

      const customChoiceActions = getCustomChoiceActions(inspectedObject);
      const menuActionKeys = new Set(actionItems.map(entry => normalizeActionName(entry.label)));
      const vendorEntries = getVendorShopEntriesForObject(inspectedObject);
      const customChoiceSections = [];
      const items = [];

      for (const entry of actionItems) {
        const actionKey = normalizeActionName(entry.label);
        if (actionKey === 'drop' && inspectedObjectInRoom) continue;

        const custom = customChoiceActions.get(actionKey) ?? null;
        if (custom && custom.choices.length) {
          const sectionTitle = custom.title || entry.label;
          const choiceItems = custom.choices
            .filter(choice => shouldShowMenuEntry(choice, actionMenuCtx))
            .map((choice, idx) => ({
            id: `obj:${objId || 'unknown'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
            label: choice.label,
            description: entry.description || custom.tooltip || null,
            onClick: () =>
              runEntityActionEvent({
                entityType: 'object',
                entityId: objId,
                entity: inspectedObject,
                eventType: entry.label,
                label: `${objName}: ${entry.label}`,
                input: choice.value
              })
          }));
          if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
          continue;
        }

        const id = `obj:${objId || 'unknown'}:${actionKey}`;
        if (actionKey === 'examine') {
          items.push({ id, label: entry.label, description: entry.description, onClick: () => examineObject(inspectedObject) });
          continue;
        }
        if (actionKey === 'take') {
          items.push({
            id,
            label: entry.label,
            description: entry.description,
            disabled: !canTakeInspectedObject,
            onClick: () => takeObject(inspectedObject)
          });
          continue;
        }
        if (actionKey === 'shop') {
          items.push({
            id,
            label: entry.label,
            description: entry.description,
            disabled: !canShopInspectedObject,
            onClick: () => openVendorShop(inspectedObject)
          });
          continue;
        }
        if (actionKey === 'open' || actionKey === 'close') {
          if (actionKey === 'open' && containerOpen) continue;
          if (actionKey === 'close' && !containerOpen) continue;
          items.push({ id, label: entry.label, description: entry.description, onClick: () => toggleContainerOpen(objId) });
          continue;
        }

        if (actionKey === 'equip' || actionKey === 'unequip') {
          if (!objId) continue;
          if (!canEquipObject(containerObj)) continue;

          const inInventory = hasInventoryItem(objId);
          const equipped = Boolean(equippedInventory?.[objId]);
          const wantsEquip = actionKey === 'equip';
          const disabled = !inInventory || (wantsEquip ? equipped : !equipped);

          items.push({
            id,
            label: entry.label,
            description: entry.description,
            disabled,
            onClick: () => {
              if (!inInventory) return;
              const result = setItemEquipped(objId, wantsEquip);
              const bonusLines = wantsEquip && Array.isArray(result?.bonusLines) ? result.bonusLines : [];
              const narration = entry.description || getActionsMenuDescription(containerObj, wantsEquip ? 'Equip' : 'Unequip');
              const descriptionFallback = containerObj?.Description ?? containerObj?.description ?? '';
              const fallback = wantsEquip ? `You equip <b>${objName}</b>.` : `You unequip <b>${objName}</b>.`;
              setEventMedia(containerObj?.media || containerObj?.Picture || null);
              setEventMediaTitle(objName);
              setEventMessages([narration || descriptionFallback || fallback, ...bonusLines].filter(Boolean));
            }
          });
          continue;
        }

        if (actionKey.startsWith('buy ')) {
          const wanted = actionKey.replace(/^buy\s+/, '').trim();
          const match =
            vendorEntries.find(row => normalizeActionName(row.itemName) === wanted) ||
            vendorEntries.find(row => normalizeActionName(row.itemName).includes(wanted)) ||
            vendorEntries.find(row => wanted.includes(normalizeActionName(row.itemName))) ||
            null;

          if (match) {
            items.push({
              id,
              label: entry.label,
              description: entry.description,
              disabled: !canShopInspectedObject,
              onClick: () => buyVendorItem({ vendorId: objId, itemId: match.itemId, price: match.price })
            });
            continue;
          }

          items.push({
            id,
            label: entry.label,
            description: entry.description,
            disabled: !canShopInspectedObject,
            onClick: () => openVendorShop(inspectedObject)
          });
          continue;
        }

        if (objId === 'comunit_001' && actionKey === 'hack') {
          const hackableTargets = resolvedRoomObjects
            .map(obj => {
              const id = String(obj?.id ?? obj?.UniqueID ?? '').trim();
              if (!id || id === objId) return null;
              const entity = game?.objectMap?.[id] ?? obj;
              const hackable = getCustomProperty(entity, 'Hackable');
              if (hackable !== true) return null;
              const name = entity?.Name || entity?.name || humanizeId(id) || id;
              const desc = entity?.Description || entity?.description || null;
              return { id, name, desc, entity };
            })
            .filter(Boolean);

          items.push({
            id,
            label: entry.label,
            description: entry.description || 'Select a nearby device to hack.',
            disabled: hackableTargets.length === 0,
            onClick: () => setHackPickerOpen(open => !open)
          });
          continue;
        }

        items.push({
          id,
          label: entry.label,
          description: entry.description,
          onClick: () =>
            (String(entry?.inputType ?? '').trim().toLowerCase() === 'text'
              ? openTextInputPrompt({
                  title: `${objName}: ${entry.label}`,
                  placeholder: entry.placeholder || 'Enter value',
                  submitLabel: entry.submitLabel || 'Submit',
                  inputType: entry.maskInput ? 'password' : 'text',
                  media: inspectedObject?.Picture || null,
                  entityType: 'object',
                  entityId: objId,
                  entity: inspectedObject,
                  eventType: entry.label,
                  label: `${objName}: ${entry.label}`
                })
              : runEntityActionEvent({
                  entityType: 'object',
                  entityId: objId,
                  entity: inspectedObject,
                  eventType: entry.label,
                  label: `${objName}: ${entry.label}`
                }))
        });
      }

      for (const [actionKey, custom] of customChoiceActions.entries()) {
        if (menuActionKeys.has(actionKey)) continue;
        const sectionTitle = custom.title || custom.name || 'Action';
        const choiceItems = custom.choices
          .filter(choice => shouldShowMenuEntry(choice, actionMenuCtx))
          .map((choice, idx) => ({
          id: `obj:${objId || 'unknown'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
          label: choice.label,
          description: custom.tooltip || null,
          onClick: () =>
            runEntityActionEvent({
              entityType: 'object',
              entityId: objId,
              entity: inspectedObject,
              eventType: custom.name,
              label: `${objName}: ${custom.name}`,
              input: choice.value
            })
        }));
        if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
      }

      const sections = [];
      if (customChoiceSections.length) sections.push(...customChoiceSections);
      if (items.length) sections.push({ title: 'Actions', items });

      if (objId === 'comunit_001' && hackPickerOpen) {
        const hackableTargets = resolvedRoomObjects
          .map(obj => {
            const id = String(obj?.id ?? obj?.UniqueID ?? '').trim();
            if (!id || id === objId) return null;
            const entity = game?.objectMap?.[id] ?? obj;
            const hackable = getCustomProperty(entity, 'Hackable');
            if (hackable !== true) return null;
            const name = entity?.Name || entity?.name || humanizeId(id) || id;
            const baseDesc = entity?.Description || entity?.description || null;
            const hint = getCustomProperty(entity, 'PasswordHint');
            const desc = hint ? `${baseDesc ? `${baseDesc} ` : ''}(Hint: ${String(hint)})` : baseDesc;
            const media = entity?.Picture || entity?.media || null;
            return { id, name, desc, entity, media };
          })
          .filter(Boolean);

        sections.push({
          title: 'Hack Targets',
          items: hackableTargets.length
            ? hackableTargets.map(target => ({
                id: `hack-target:${target.id}`,
                label: target.name,
                description: target.desc,
                onClick: () =>
                  openTextInputPrompt({
                    title: `${target.name}: Hack`,
                    placeholder: 'Enter password',
                    submitLabel: 'Hack',
                    media: target.media,
                    inputType: 'password',
                    entityType: 'object',
                    entityId: target.id,
                    entity: target.entity,
                    eventType: 'Hack',
                    label: `${target.name}: Hack`
                  })
              }))
            : [
                {
                  id: 'hack-target:none',
                  label: 'No hackable devices nearby',
                  description: 'Move closer to a device with Hackable=true.',
                  disabled: true
                }
              ]
        });
      }

      if (objId && containerOpen) {
        const contentIds = resolveContainerContentIds(objId, containerObj);
        if (!contentIds.length) {
          sections.push({
            title: 'Contents',
            items: [{ id: `obj:${objId}:contents:empty`, label: 'Empty', description: 'Nothing inside.', disabled: true }]
          });
        } else {
          const contentItems = [];
          for (const contentId of contentIds) {
            const contentObj = game?.objectMap?.[contentId] ?? null;
            const contentName = contentObj?.Name || contentObj?.name || humanizeId(contentId) || 'Item';
            const contentDesc = contentObj?.Description || contentObj?.description || null;
            const contentType = String(contentObj?.Type ?? contentObj?.type ?? '').trim().toLowerCase();
            const stackable = contentType === 'consumable';
            const inInventory = hasInventoryItem(contentId);
            const canTake = stackable || !inInventory;
            const equipable = canEquipObject(contentObj);
            const equipped = Boolean(equippedInventory?.[contentId]);

            contentItems.push({
              id: `obj:${objId}:contents:${contentId}:take`,
              label: `Take ${contentName}`,
              description: contentDesc,
              disabled: !canTake,
              onClick: () => takeFromContainerToInventory({ containerId: objId, itemId: contentId, autoEquip: false })
            });

            if (equipable) {
              contentItems.push({
                id: `obj:${objId}:contents:${contentId}:equip`,
                label: `Equip ${contentName}`,
                description: contentDesc,
                disabled: equipped || (!inInventory && !canTake),
                onClick: () => {
                  if (inInventory) {
                    const result = setItemEquipped(contentId, true);
                    const bonusLines = Array.isArray(result?.bonusLines) ? result.bonusLines : [];
                    const narration = getActionsMenuDescription(contentObj, 'Equip');
                    const descriptionFallback = contentObj?.Description ?? contentObj?.description ?? '';
                    setEventMedia(contentObj?.media || contentObj?.Picture || null);
                    setEventMediaTitle(contentName);
                    setEventMessages([narration || descriptionFallback || `You equip <b>${contentName}</b>.`, ...bonusLines].filter(Boolean));
                  } else {
                    takeFromContainerToInventory({ containerId: objId, itemId: contentId, autoEquip: true });
                  }
                }
              });
            }
          }

          sections.push({ title: 'Contents', items: contentItems });
        }
      }

      return { title: objName, description: objDesc, sections };
    }

    const todoItems = (visibleExits || [])
      .filter(exit => Boolean(exit?.todo ?? exit?.Todo ?? false))
      .map(exit => {
        const destId = exit.destinationId || null;
        if (!destId) return null;
        const todoLabel = String(exit?.todoLabel ?? exit?.TodoLabel ?? '').trim();
        const label = todoLabel || `Go ${exit.direction}`;
        const description = exit.destinationName || humanizeId(exit.destinationRaw) || exit.destinationRaw || '';
        return {
          id: `todo:${exit.direction}:${destId}`,
          label,
          description,
          onClick: () => handleMove(destId)
        };
      })
      .filter(Boolean);

    const roomMenu = Array.isArray(currentRoom?.ActionsMenu) ? currentRoom.ActionsMenu : [];
    const roomMenuCtx = { game, room: currentRoom, vars: game?.variables ?? {}, entity: currentRoom };
    const roomMenuItems = roomMenu
      .filter(entry => shouldShowMenuEntry(entry, roomMenuCtx))
      .map(entry => {
        const label = String(entry?.Action ?? '').trim();
        if (!label) return null;
        const actionKey = normalizeActionName(label);
        if (actionKey === 'examine room' || actionKey === 'navigation') return null;
        return {
          id: `room:${currentRoom?.id || 'room'}:${actionKey}`,
          label,
          description: formatMenuDescription(entry?.Description ?? entry?.Tooltip ?? '', roomMenuCtx, '') || null,
          onClick: () =>
            runEntityActionEvent({
              entityType: 'room',
              entityId: currentRoom?.id,
              entity: currentRoom,
              eventType: label,
              label: `${roomTitle}: ${label}`
            })
        };
      })
      .filter(Boolean);

    const roomMenuKeys = new Set(roomMenuItems.map(item => normalizeActionName(item.label)));
    const customChoiceActions = getCustomChoiceActions(currentRoom);
    const customChoiceSections = [];
    const filteredRoomMenuItems = [];

    for (const item of roomMenuItems) {
      const actionKey = normalizeActionName(item.label);
      const custom = customChoiceActions.get(actionKey) ?? null;
      if (custom && custom.choices.length) {
        const sectionTitle = custom.title || item.label;
        const choiceItems = custom.choices
          .filter(choice => shouldShowMenuEntry(choice, roomMenuCtx))
          .map((choice, idx) => ({
          id: `room:${currentRoom?.id || 'room'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
          label: choice.label,
          description: item.description || custom.tooltip || null,
          onClick: () =>
            runEntityActionEvent({
              entityType: 'room',
              entityId: currentRoom?.id,
              entity: currentRoom,
              eventType: item.label,
              label: `${roomTitle}: ${item.label}`,
              input: choice.value
            })
        }));
        if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
        continue;
      }
      filteredRoomMenuItems.push(item);
    }

    for (const [actionKey, custom] of customChoiceActions.entries()) {
      if (roomMenuKeys.has(actionKey)) continue;
      const sectionTitle = custom.title || custom.name || 'Action';
      const choiceItems = custom.choices
        .filter(choice => shouldShowMenuEntry(choice, roomMenuCtx))
        .map((choice, idx) => ({
        id: `room:${currentRoom?.id || 'room'}:${actionKey}:choice:${normalizeActionName(choice.value) || idx}`,
        label: choice.label,
        description: custom.tooltip || null,
        onClick: () =>
          runEntityActionEvent({
            entityType: 'room',
            entityId: currentRoom?.id,
            entity: currentRoom,
            eventType: custom.name,
            label: `${roomTitle}: ${custom.name}`,
            input: choice.value
          })
      }));
      if (choiceItems.length) customChoiceSections.push({ title: sectionTitle, items: choiceItems });
    }

    const sections = [];
    if (todoItems.length) sections.push({ title: 'Todo', items: todoItems });

    if (scenePrompt) {
      const sceneChoices = Array.isArray(scenePrompt?.choices) ? scenePrompt.choices : [];
      const abilityChoiceItems = sceneChoices
        .filter(choice => String(choice?.kind ?? '').trim() === 'ability')
        .map(choice => ({
          id: `scene:ability:${choice.id}`,
          label: choice.text,
          description: choice.tooltip || null,
          onClick: () => handleSceneChoice(choice.id)
        }));

      const regularChoiceItems = sceneChoices
        .filter(choice => !String(choice?.kind ?? '').trim() || String(choice?.kind ?? '').trim() === 'choice')
        .map(choice => ({
          id: `scene:choice:${choice.id}`,
          label: choice.text,
          description: choice.tooltip || null,
          onClick: () => handleSceneChoice(choice.id)
        }));

      sections.push({
        title: 'Scene',
        items: [
          {
            id: 'scene:talk',
            label: sceneRevealed ? 'Talk (replay)' : 'Talk',
            description: String(scenePrompt?.title ?? '').trim() || 'Continue the conversation.',
            onClick: revealScene
          }
        ]
      });

      if (sceneRevealed && regularChoiceItems.length) sections.push({ title: 'Choices', items: regularChoiceItems });
      if (sceneRevealed && abilityChoiceItems.length) sections.push({ title: 'Abilities', items: abilityChoiceItems });
    }

    if (customChoiceSections.length) sections.push(...customChoiceSections);

    sections.push({
      title: 'Room',
      items: [
        { id: 'room:examine', label: 'Examine Room', description: 'Inspect your surroundings.', onClick: handleExamineRoom },
        { id: 'room:navigation', label: 'Navigation', description: 'Choose an exit.', onClick: () => toggleDrawer('navigation') },
        ...filteredRoomMenuItems
      ]
    });

    return { title: roomTitle, description: roomDescriptionText, sections };
  };

  const actionsDrawerModel = activeDrawer === 'actions' ? buildActionsDrawerModel() : null;

  const exitCombat = () => {
    const resolvedCombat = combat;
    const returnRoomId = resolvedCombat?.roomId ?? currentRoom?.id ?? null;
    const winner = String(resolvedCombat?.winner ?? '').trim().toLowerCase();
    const enemyId = String(resolvedCombat?.enemyId ?? '').trim();

    setCombat(null);
    setCombatMenuEntered(false);
    if (activeDrawer === 'combat') setActiveDrawer(null);

    if (winner === 'player' && enemyId === 'herbert_001' && returnRoomId === 'herbyoffice_lc_001' && game) {
      if (!game.player.Stats || typeof game.player.Stats !== 'object') game.player.Stats = {};
      game.player.Stats.herbert_loss = true;

      const sceneResult = game.sceneRunner?.begin?.('herbyoffice_postfight_001_story') ?? null;
      const sceneData = sceneResult?.sceneData ?? null;
      if (sceneData) {
        setScenePrompt(sceneData);
        setSceneRevealed(false);
        setEventMedia(null);
        setEventMediaTitle(null);
        setEventMessages(['<b>Conversation available.</b> Open Actions → Talk.']);

        refreshPlayerState(game);
        const save = ensureSaveGameShape(game);
        commitPlayerToSave(save);
        persistSaveGame(save);
      }
    }

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

    const abilityPortrait = resolveAbilityPortrait(action?.name);
    if (abilityPortrait) {
      showPlayerPortraitOverride(abilityPortrait, { durationMs: 1800 });
    }

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
        weaponBonus: toSafeInt(
          item?.obj?.WeaponBonus ??
            item?.obj?.Bonuses?.WeaponBonus ??
            item?.obj?.playerWeaponDmg ??
            item?.obj?.playerWeaponDamage ??
            0,
          0
        )
      }))
    : [{ id: '__fist__', name: 'Fist', obj: null, weaponBonus: 0 }];

  const combatAbilities = [];
  const startWizardScreen = startWizardStep ? START_WIZARD_SCREENS[startWizardStep] : null;
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
      {startVariantPromptOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Start new game"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={event => {
            if (event.target === event.currentTarget) closeStartVariantPrompt();
          }}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              background: '#1b1b1b',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              padding: '16px',
              color: '#e0d9c5',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
          >
            <>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>{startWizardScreen?.title || 'Start new game'}</div>
                <div style={{ marginBottom: '10px' }}>
                  {isVideoMedia(resolveStartWizardMedia(startWizardScreen?.media)) ? (
                    <video
                      src={resolveStartWizardMedia(startWizardScreen?.media)}
                      style={{ width: '100%', borderRadius: '10px' }}
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={resolveStartWizardMedia(startWizardScreen?.media)}
                      alt=""
                      style={{ width: '100%', borderRadius: '10px', objectFit: 'cover' }}
                    />
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, marginBottom: '14px', color: '#bfae86' }}>
                  {startWizardScreen?.text || ''}
                </div>
                {startWizardStep === 'ageGate' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button type="button" className="drawer-action-btn" onClick={handleStartWizardAdvance}>
                      I'm 18 and play
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={handleStartWizardNotEligible}>
                      I am not 18 and leave
                    </button>
                  </div>
                ) : null}
                {startWizardStep === 'toPlayers' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button type="button" className="drawer-action-btn" onClick={handleStartWizardAdvance}>
                      Continue
                    </button>
                  </div>
                ) : null}
                {startWizardStep === 'animation' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button type="button" className="drawer-action-btn" onClick={handleStartWizardAdvance}>
                      Continue
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={closeStartVariantPrompt}>
                      Cancel
                    </button>
                  </div>
                ) : null}
                {startWizardStep === 'introChoice' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button type="button" className="drawer-action-btn" onClick={handleStartWizardIntro}>
                      Play Intro (then Prologue)
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={() => handleStartVariantChoice('skip')}>
                      Skip Intro (Start at East Side)
                    </button>
                    <button type="button" className="drawer-action-btn" onClick={closeStartVariantPrompt}>
                      Cancel
                    </button>
                  </div>
                ) : null}
            </>
          </div>
        </div>
      ) : null}
      {textInputPrompt ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={textInputPrompt.title}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
          onClick={event => {
            if (event.target === event.currentTarget) closeTextInputPrompt();
          }}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              background: '#1b1b1b',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '12px',
              padding: '16px',
              color: '#e0d9c5',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '10px' }}>{textInputPrompt.title}</div>

            {textInputPrompt.media ? (
              <div style={{ marginBottom: '10px' }}>
                {isVideoMedia(resolveMediaUrl(textInputPrompt.media) || textInputPrompt.media) ? (
                  <video
                    src={resolveMediaUrl(textInputPrompt.media) || textInputPrompt.media}
                    style={{ width: '100%', borderRadius: '10px' }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={resolveMediaUrl(textInputPrompt.media) || textInputPrompt.media}
                    alt=""
                    style={{ width: '100%', borderRadius: '10px' }}
                  />
                )}
              </div>
            ) : null}
            <input
              autoFocus
              type="text"
              autoComplete="off"
              name={String(textInputPrompt?.inputType ?? '').toLowerCase() === 'password' ? 'game-password' : 'game-text'}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={textInputValue}
              placeholder={textInputPrompt.placeholder}
              onChange={e => setTextInputValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') closeTextInputPrompt();
                if (e.key === 'Enter') {
                  const payload = textInputPrompt;
                  closeTextInputPrompt();
                  runEntityActionEvent({ ...payload, input: textInputValue });
                }
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: '#e0d9c5',
                outline: 'none',
                WebkitTextSecurity: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', justifyContent: 'flex-end' }}>
              <button type="button" className="drawer-action-btn" onClick={closeTextInputPrompt}>
                Cancel
              </button>
              <button
                type="button"
                className="drawer-action-btn"
                onClick={() => {
                  const payload = textInputPrompt;
                  closeTextInputPrompt();
                  runEntityActionEvent({ ...payload, input: textInputValue });
                }}
              >
                {textInputPrompt.submitLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <aside
        className={`left-panel rpg-frame${activeDrawer ? ' drawer-open' : ''}${activeDrawer === 'player' ? ' drawer-player' : ''}`}
      >
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
            disabled={interactionLocked || Boolean(combat)}
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
              disabled={interactionLocked}
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
              disabled={interactionLocked}
              onClick={() => toggleDrawer('settings')}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 12 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {import.meta.env.DEV ? (
              <button
                className={`sidebar-btn${activeDrawer === 'editor' ? ' active' : ''}`}
                type="button"
                title="DB Editor"
                aria-label="DB Editor"
                disabled={Boolean(combat) || interactionLocked}
                onClick={() => toggleDrawer('editor')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <ellipse cx="12" cy="5" rx="8" ry="3" />
                  <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
                  <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
                </svg>
              </button>
            ) : null}

            <button
              className={`sidebar-btn${activeDrawer === 'navigation' ? ' active' : ''}`}
              type="button"
              title="Navigate"
              aria-label="Navigate"
              disabled={Boolean(combat) || interactionLocked}
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
              disabled={Boolean(combat) || interactionLocked}
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
                      : activeDrawer === 'editor'
                        ? 'DB Editor'
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
                  power={power}
                  focus={focus}
                  stealth={stealth}
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
                        const isOpen = itemIsContainer ? resolveContainerOpenState(itemId, itemObj) : false;
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
                      {(selectedInventoryItem.obj?.Description || selectedInventoryItem.obj?.description) && (
                        <div className="drawer-muted">
                          {selectedInventoryItem.obj?.Description ?? selectedInventoryItem.obj?.description}
                        </div>
                      )}
                      <div className="inventory-action-row">
                        {isContainerObject(selectedInventoryItem.obj) ? (
                          <button type="button" className="drawer-action-btn" onClick={() => toggleContainerOpen(selectedInventoryItem.id)}>
                            {resolveContainerOpenState(selectedInventoryItem.id, selectedInventoryItem.obj) ? 'Close' : 'Open'}
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
                        {(() => {
                          if (combat) return null;
                          const obj = selectedInventoryItem.obj;
                          const objId = selectedInventoryItem.id;
                          if (!obj || !objId) return null;

                          const menu = Array.isArray(obj?.ActionsMenu) ? obj.ActionsMenu : [];
                          const excluded = new Set(['examine', 'take', 'drop', 'open', 'close', 'shop', 'equip', 'unequip', 'use']);
                          const entries = [];
                          const seen = new Set();

                          for (const row of menu) {
                            const label = String(row?.Action ?? '').trim();
                            if (!label) continue;
                            const key = normalizeActionName(label);
                            if (!key) continue;
                            if (excluded.has(key) || key.startsWith('buy ')) continue;
                            if (seen.has(key)) continue;
                            seen.add(key);
                            entries.push({ key, label });
                          }

                          if (!entries.length) return null;

                          return entries.map(entry => (
                            <button
                              key={`inv:${objId}:${entry.key}`}
                              type="button"
                              className="drawer-action-btn"
                              onClick={() =>
                                runEntityActionEvent({
                                  entityType: 'object',
                                  entityId: objId,
                                  entity: obj,
                                  eventType: entry.label,
                                  label: `${selectedInventoryItem.name}: ${entry.label}`
                                })
                              }
                            >
                              {entry.label}
                            </button>
                          ));
                        })()}
                      </div>

                      {isContainerObject(selectedInventoryItem.obj) &&
                      resolveContainerOpenState(selectedInventoryItem.id, selectedInventoryItem.obj) ? (
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
                                const contentName = contentObj?.Name || contentObj?.name || contentEntry?.Name || humanizeId(contentId) || 'Item';
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
                                                  if (contentInInventory) {
                                                    const result = setItemEquipped(contentId, true);
                                                    const bonusLines = Array.isArray(result?.bonusLines) ? result.bonusLines : [];
                                                    const narration = getActionsMenuDescription(contentObj, 'Equip');
                                                    const descriptionFallback = contentObj?.Description ?? contentObj?.description ?? '';
                                                    setEventMedia(contentObj?.media || contentObj?.Picture || null);
                                                    setEventMediaTitle(contentName);
                                                    setEventMessages([narration || descriptionFallback || `You equip <b>${contentName}</b>.`, ...bonusLines].filter(Boolean));
                                                  } else {
                                                    takeFromContainerToInventory({ containerId, itemId: contentId, autoEquip: true });
                                                  }
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
                                                  const narration = getActionsMenuDescription(contentObj, 'Unequip');
                                                  setEventMedia(contentObj?.media || contentObj?.Picture || null);
                                                  setEventMediaTitle(contentName);
                                                  setEventMessages([narration || `You unequip <b>${contentName}</b>.`]);
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

              {activeDrawer === 'editor' && <DbEditor game={game} onRequestClose={closeDrawer} />}

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
                      vendor?.name ||
                      vendor?.Name ||
                      vendor?.Charname ||
                      vendorTemplate?.name ||
                      vendorTemplate?.Name ||
                      vendorTemplate?.Charname ||
                      humanizeId(vendorId) ||
                      'Vendor';
                    const vendorDesc =
                      vendor?.Description || vendor?.description || vendorTemplate?.Description || vendorTemplate?.description || '';

                    const rawShopItems = resolveVendorShopItems(vendor);
                    const entries = rawShopItems
                      .map(entry => {
                        const id = String(entry?.UniqueID ?? entry?.id ?? '').trim();
                        if (!id) return null;
                        const obj = game?.objectMap?.[id] ?? null;
                        const name = obj?.Name || obj?.name || humanizeId(id) || 'Item';
                        const description = obj?.Description || obj?.description || '';
                        const media = obj?.media || obj?.Picture || null;
                        const price = toSafeInt(entry?.Price ?? obj?.Price ?? 0, 0);
                        const stackable = String(obj?.Type ?? obj?.type ?? '').trim().toLowerCase() === 'consumable';
                        const explicitCategory = String(entry?.Category ?? entry?.category ?? '').trim();
                        const inferredCategory = obj && isWeaponObject(obj) ? 'Weapons' : 'Armors';
                        const category = explicitCategory || inferredCategory;
                        return { id, name, description, media, price, obj, stackable, category };
                      })
                      .filter(Boolean);

                    const availableCategories = Array.from(
                      new Set(entries.map(entry => String(entry?.category ?? '').trim()).filter(Boolean))
                    );
                    availableCategories.sort((a, b) => a.localeCompare(b));

                    const activeCategory = String(shopCategory ?? '').trim();
                    const filteredEntries = activeCategory
                      ? entries.filter(entry => String(entry?.category ?? '').trim() === activeCategory)
                      : entries;

                    return (
                      <>
                        <div className="drawer-subtitle">{vendorName}</div>
                        {vendorDesc ? <div className="drawer-muted">{vendorDesc}</div> : null}
                        <div className="drawer-muted">Credits: {credits}</div>

                        {availableCategories.length > 1 ? (
                          <div className="inventory-action-row" aria-label="Shop categories">
                            <button
                              type="button"
                              className="drawer-action-btn"
                              onClick={() => setShopCategory(null)}
                              disabled={!activeCategory}
                            >
                              All
                            </button>
                            {availableCategories.map(cat => (
                              <button
                                key={cat}
                                type="button"
                                className="drawer-action-btn"
                                onClick={() => setShopCategory(cat)}
                                disabled={activeCategory === cat}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        ) : null}

                        <ul className="shop-list" aria-label="Vendor items">
                          {filteredEntries.length ? (
                            filteredEntries.map(entry => {
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
                    {visibleExits.length ? (
                      visibleExits.map((exit, idx) => (
                        <li key={`${exit.direction}:${exit.destinationId || exit.destinationRaw || idx}`}>
                          <button
                            type="button"
                            className="nav-exit-btn"
                            onClick={() => handleMove(exit.destinationId)}
                            disabled={!exit.destinationId}
                            title={exit.destinationId ? undefined : `Unresolved destination: ${exit.destinationRaw}`}
                          >
                            <span className="nav-dir">{exit.direction}</span>
                            <span className="nav-dest">{exit.destinationName || humanizeId(exit.destinationRaw) || exit.destinationRaw}</span>
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
        <section className="upper-split">
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
          <LocationTitle
            visible={!showOverlayMediaPanel}
            combat={combat}
            locationName={locationName}
            locationDescription={locationDescription}
            onExamineRoom={handleExamineRoom}
            menuItems={roomActionMenuItems}
            hasExtraActions={hasExtraRoomActions}
            onAction={handleRoomAction}
          />

          <LevelUpNotifier
            key={levelUpNotice?.key || 'levelup'}
            open={Boolean(levelUpNotice)}
            level={levelUpNotice?.level}
            title={levelUpNotice?.title}
            levelsGained={levelUpNotice?.levelsGained}
            media={levelUpNotice?.media}
            statPoints={unspentStatPoints}
            onAllocatePoint={allocateLevelUpPoint}
            onClose={() => setLevelUpNotice(null)}
          />
          </section>

          <section className="side-text-window" aria-label="Story log">
            <div
              ref={sideTextWindowRef}
              className={`side-text-window-body${introActive ? ' side-text-window-body--locked' : ''}`}
            >
              {!combat ? (
                <>
                  <div className="side-text-lines">
                    {introActive ? (
                      (Array.isArray(eventMessages) ? eventMessages : []).map((line, idx) => (
                        <p
                          key={`intro-line:${idx}`}
                          className="side-text-line"
                          onClick={handleRichTextClick}
                          dangerouslySetInnerHTML={{ __html: ragsToHtml(line, { game, room: currentRoom }) }}
                        />
                      ))
                    ) : (
                      textLog.map(block => (
                        <div key={block.key} className={`side-text-block ${block.kind || 'system'}`}>
                          {Array.isArray(block.htmlLines)
                            ? block.htmlLines.map((html, idx) => (
                                <p
                                  key={`${block.key}:${idx}`}
                                  className="side-text-line"
                                  onClick={handleRichTextClick}
                                  dangerouslySetInnerHTML={{ __html: html }}
                                />
                              ))
                            : null}
                          <div className="side-text-delim" aria-hidden="true">-------------------</div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="side-text-title">Combat Log</div>
                  <div className="side-text-lines" aria-label="Combat log">
                    {(combat.log || []).slice(-14).map(entry => (
                      <p key={`side-combat:${entry.id}`} className={`side-text-line ${entry.kind || 'system'}`} dangerouslySetInnerHTML={{ __html: entry.html }} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {!combat && continuePrompt ? (
              <button type="button" className="side-text-next-btn pulse" onClick={handleContinue} aria-label="Continue">
                &gt;
              </button>
            ) : combat ? (
              <button type="button" className="side-text-next-btn" onClick={openCombatMenu}>
                &gt;
              </button>
            ) : null}
          </section>
        </section>

        <BottomStatusPanel
          combat={combat}
          interactionLocked={interactionLocked}
          locationName={locationName}
          playerPortraitUrl={playerPortraitUrl}
          playerEquippedWeaponName={playerEquippedWeaponName}
          playerEquippedWeapons={playerEquippedWeaponsForMenu}
          playerAbilities={playerAbilitiesForMenu}
          combatWeapons={weaponOptions}
          combatAbilities={combatAbilities}
          combatEnergy={combatEnergy}
          onWait={() =>
            runEntityActionEvent({
              entityType: 'room',
              entityId: currentRoom?.id,
              entity: currentRoom,
              eventType: 'Wait',
              label: `${locationName}: Wait`
            })
          }
          onExamineRoom={handleExamineRoom}
          onShowWeapon={weapon => {
            if (combat) return;
            const id = weapon?.id ?? weapon?.UniqueID ?? null;
            if (!id) return;
            setSelectedInventoryId(id);
            setActiveDrawer('inventory');
          }}
          onShowAbility={ability => {
            if (combat) return;
            const name = String(ability?.Name ?? ability?.name ?? '').trim() || 'Ability';
            const tip = String(ability?.Tooltip ?? ability?.tooltip ?? '').trim();
            setEventMedia(null);
            setEventMediaTitle(null);
            setEventMessages([`<b>${name}</b>${tip ? ` - ${tip}` : ''}`]);
          }}
          onCombatWeapon={weapon => {
            if (!combat) return;
            if (combat?.winner) return;
            const name = String(weapon?.name ?? '').trim();
            const weaponBonus = Number(weapon?.weaponBonus ?? 0);
            if (!name) return;
            runCombatAction({ kind: 'weapon', name, weaponBonus });
          }}
          onCombatAbility={ability => {
            if (!combat) return;
            if (combat?.winner) return;
            const name = String(ability?.name ?? ability?.Name ?? '').trim();
            const energyCost = Number(ability?.energyCost ?? ability?.EnergyCost ?? 0);
            if (!name) return;
            runCombatAction({ kind: 'ability', name, energyCost });
          }}
          onInventoryAction={({ item, action }) => {
            if (combat) return;
            const objId = String(item?.id ?? '').trim();
            if (!objId) return;
            const label = String(action ?? '').trim();
            if (!label) return;
            const actionKey = normalizeActionName(label);
            const obj = item?.obj ?? null;
            const menuEntry = findActionMenuEntry(obj, label);
            const inputTypeRaw = String(menuEntry?.InputType ?? menuEntry?.inputType ?? '').trim().toLowerCase();
            const customAction = findCustomChoiceAction(obj, label);
            if (customAction && inputTypeRaw !== 'text' && inputTypeRaw !== 'password') {
              setSelectedInventoryId(objId);
              setActiveDrawer('actions');
              return;
            }

            if ((actionKey === 'open' || actionKey === 'close') && obj && isContainerObject(obj)) {
              toggleContainerOpen(objId);
              if (actionKey === 'open') {
                setSelectedInventoryId(objId);
                setActiveDrawer('inventory');
              }
              return;
            }

            if (actionKey === 'equip' || actionKey === 'unequip') {
              if (!canEquipObject(obj)) return;
              const wantsEquip = actionKey === 'equip';
              if (Boolean(equippedInventory?.[objId]) === wantsEquip) return;
              const result = setItemEquipped(objId, wantsEquip);
              const bonusLines = wantsEquip && Array.isArray(result?.bonusLines) ? result.bonusLines : [];
              const objName = item?.name || item?.label || obj?.Name || obj?.name || humanizeId(objId) || objId;
              const narration = getActionsMenuDescription(obj, wantsEquip ? 'Equip' : 'Unequip');
              const fallback = wantsEquip ? `You equip <b>${objName}</b>.` : `You unequip <b>${objName}</b>.`;
              setEventMedia(obj?.media || obj?.Picture || null);
              setEventMediaTitle(objName);
              setEventMessages([narration || fallback, ...bonusLines].filter(Boolean));
              return;
            }

            if (actionKey === 'drop') {
              dropInventoryItem(item);
              return;
            }

            if (actionKey === 'examine') {
              examineInventoryItem(item);
              return;
            }

            if (inputTypeRaw === 'text' || inputTypeRaw === 'password') {
              const ctx = { game, room: currentRoom, vars: game?.variables ?? {}, entity: obj, objectBeingActedUpon: obj };
              const placeholder =
                String(resolveConditionalValue(menuEntry?.Placeholder ?? menuEntry?.placeholder ?? '', ctx, '') ?? '').trim() ||
                'Enter value';
              const submitLabel =
                String(resolveConditionalValue(menuEntry?.SubmitLabel ?? menuEntry?.submitLabel ?? '', ctx, '') ?? '').trim() ||
                'Submit';
              openTextInputPrompt({
                title: `${item?.name || item?.label || humanizeId(objId) || objId}: ${label}`,
                placeholder,
                submitLabel,
                inputType: menuEntry?.MaskInput ? 'password' : inputTypeRaw,
                media: obj?.Picture || obj?.media || null,
                entityType: 'object',
                entityId: objId,
                entity: obj ?? null,
                eventType: label,
                label: `${item?.name || item?.label || humanizeId(objId) || objId}: ${label}`
              });
              return;
            }

            runEntityActionEvent({
              entityType: 'object',
              entityId: objId,
              entity: item?.obj ?? null,
              eventType: label,
              label: `${item?.name || item?.label || humanizeId(objId) || objId}: ${label}`
            });
          }}
          onNpcAction={({ npc, npcId, action }) => {
            if (combat) return;
            const id = String(npcId ?? npc?.id ?? npc?.UniqueID ?? '').trim();
            if (!id) return;
            const label = String(action ?? '').trim();
            if (!label) return;
            const menuEntry = findActionMenuEntry(npc, label);
            const inputTypeRaw = String(menuEntry?.InputType ?? menuEntry?.inputType ?? '').trim().toLowerCase();
            const customAction = findCustomChoiceAction(npc, label);
            if (customAction && inputTypeRaw !== 'text' && inputTypeRaw !== 'password') {
              setInspectTarget({ type: 'npc', id });
              setActiveDrawer('actions');
              return;
            }
            if (inputTypeRaw === 'text' || inputTypeRaw === 'password') {
              const ctx = { game, room: currentRoom, vars: game?.variables ?? {}, entity: npc, character: npc };
              const placeholder =
                String(resolveConditionalValue(menuEntry?.Placeholder ?? menuEntry?.placeholder ?? '', ctx, '') ?? '').trim() ||
                'Enter value';
              const submitLabel =
                String(resolveConditionalValue(menuEntry?.SubmitLabel ?? menuEntry?.submitLabel ?? '', ctx, '') ?? '').trim() ||
                'Submit';
              const npcName = npc?.Charname || npc?.Name || npc?.name || humanizeId(id) || 'NPC';
              openTextInputPrompt({
                title: `${npcName}: ${label}`,
                placeholder,
                submitLabel,
                inputType: menuEntry?.MaskInput ? 'password' : inputTypeRaw,
                media: npc?.Picture || npc?.CharPortrait || npc?.media || null,
                entityType: 'character',
                entityId: id,
                entity: npc ?? null,
                eventType: label,
                label: `${npcName}: ${label}`
              });
              return;
            }
            const npcName = npc?.Charname || npc?.Name || npc?.name || humanizeId(id) || 'NPC';
            runEntityActionEvent({
              entityType: 'character',
              entityId: id,
              entity: npc ?? null,
              eventType: label,
              label: `${npcName}: ${label}`
            });
          }}
          onObjectAction={({ obj, objectId, action }) => {
            if (combat) return;
            const id = String(objectId ?? obj?.id ?? obj?.UniqueID ?? '').trim();
            if (!id) return;
            const label = String(action ?? '').trim();
            if (!label) return;
            const actionKey = normalizeActionName(label);
            const entity = obj ?? null;
            const objName = entity?.name || entity?.Name || humanizeId(id) || 'Object';
            const menuEntry = findActionMenuEntry(entity, label);
            const inputTypeRaw = String(menuEntry?.InputType ?? menuEntry?.inputType ?? '').trim().toLowerCase();
            const customAction = findCustomChoiceAction(entity, label);
            if (customAction && inputTypeRaw !== 'text' && inputTypeRaw !== 'password') {
              setInspectTarget({ type: 'object', id });
              setActiveDrawer('actions');
              return;
            }

            if ((actionKey === 'open' || actionKey === 'close') && entity && isContainerObject(entity)) {
              toggleContainerOpen(id);
              return;
            }

            if (actionKey === 'equip' || actionKey === 'unequip') {
              if (!canEquipObject(entity)) return;
              if (!hasInventoryItem(id)) {
                setEventMedia(entity?.media || entity?.Picture || null);
                setEventMediaTitle(objName);
                setEventMessages([`You need to take <b>${objName}</b> first.`]);
                return;
              }
              const wantsEquip = actionKey === 'equip';
              if (Boolean(equippedInventory?.[id]) === wantsEquip) return;
              const result = setItemEquipped(id, wantsEquip);
              const bonusLines = wantsEquip && Array.isArray(result?.bonusLines) ? result.bonusLines : [];
              const narration = getActionsMenuDescription(entity, wantsEquip ? 'Equip' : 'Unequip');
              const fallback = wantsEquip ? `You equip <b>${objName}</b>.` : `You unequip <b>${objName}</b>.`;
              setEventMedia(entity?.media || entity?.Picture || null);
              setEventMediaTitle(objName);
              setEventMessages([narration || fallback, ...bonusLines].filter(Boolean));
              return;
            }

            if (actionKey === 'take') {
              takeObject(entity);
              return;
            }

            if (actionKey === 'examine') {
              examineObject(entity);
              return;
            }

            if (inputTypeRaw === 'text' || inputTypeRaw === 'password') {
              const ctx = { game, room: currentRoom, vars: game?.variables ?? {}, entity, objectBeingActedUpon: entity };
              const placeholder =
                String(resolveConditionalValue(menuEntry?.Placeholder ?? menuEntry?.placeholder ?? '', ctx, '') ?? '').trim() ||
                'Enter value';
              const submitLabel =
                String(resolveConditionalValue(menuEntry?.SubmitLabel ?? menuEntry?.submitLabel ?? '', ctx, '') ?? '').trim() ||
                'Submit';
              openTextInputPrompt({
                title: `${objName}: ${label}`,
                placeholder,
                submitLabel,
                inputType: menuEntry?.MaskInput ? 'password' : inputTypeRaw,
                media: entity?.Picture || entity?.media || null,
                entityType: 'object',
                entityId: id,
                entity,
                eventType: label,
                label: `${objName}: ${label}`
              });
              return;
            }
            runEntityActionEvent({
              entityType: 'object',
              entityId: id,
              entity,
              eventType: label,
              label: `${objName}: ${label}`
            });
          }}
          onExamineInventoryItem={item => {
            if (!item) return;
            examineInventoryItem(item);
          }}
          exits={visibleExits}
          onNavigate={handleMove}
          onOpenPlayer={() => {
            if (interactionLocked) return;
            setActiveDrawer('player');
          }}
          inspectTarget={inspectTarget}
          npcs={visibleNpcs}
          objects={visibleObjects}
          inventoryItems={inventoryItems}
          credits={credits}
          hasInventoryItem={hasInventoryItem}
          canTakeObject={canTakeObject}
          getVendorShopEntriesForNpc={getVendorShopEntriesForNpc}
          getVendorShopEntriesForObject={getVendorShopEntriesForObject}
          onInspect={toggleInspect}
          onTalk={npc => {
            const npcId = npc?.id ?? npc?.UniqueID ?? null;
            if (!npcId) return;
            runEntityActionEvent({
              entityType: 'character',
              entityId: npcId,
              entity: npc,
              eventType: 'Talk',
              label: `${npc?.Charname || npc?.Name || npc?.name || humanizeId(npcId) || 'NPC'}: Talk`
            });
          }}
          onShop={openVendorShop}
          onExamineObject={examineObject}
          onTakeObject={takeObject}
          selectedInventoryId={effectiveSelectedInventoryId}
          setSelectedInventoryId={setSelectedInventoryId}
          onOpenInventory={itemId => {
            if (interactionLocked) return;
            setSelectedInventoryId(itemId);
            setActiveDrawer('inventory');
          }}
          onOpenActionsDrawer={openActionsDrawerForTarget}
          menuContextBase={{ game, room: currentRoom, vars: game?.variables ?? {} }}
          shouldShowMenuEntry={shouldShowMenuEntry}
          isContainerObject={isContainerObject}
          resolveContainerOpenState={resolveContainerOpenState}
          canEquipObject={canEquipObject}
          equippedInventory={equippedInventory}
        />
      </main>
    </div>
  );
}
