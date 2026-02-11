/**
 * Scene Loader - Manages scene discovery, random events, and story progression
 * 
 * Handles:
 * - Scene discovery from DB/scenes/
 * - Random combat encounters based on location group
 * - Random story/spicy events
 * - Planned story events with conditions
 * - Event status tracking (active/inactive/blocked)
 */

import { cryptoRng, randomIntInclusive } from '../utils/random.js';

/**
 * Event Status Types
 */
export const EventStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  BLOCKED: 'blocked',
  COMPLETED: 'completed'
};

/**
 * Event Categories
 */
export const EventCategory = {
  COMBAT: 'combat',
  STORY: 'story',
  SEQUENCE: 'sequence',
  RANDOM: 'random',
  SPICY: 'spicy',
  WITNESS: 'witness',
  SIDE_QUEST: 'side'
};

/**
 * Location Groups for event filtering
 */
export const LocationGroup = {
  CITY: 'Liberty City',
  CAMPUS: 'College Campus',
  DOWNTOWN: 'Downtown',
  WEST_SIDE: 'West Side',
  EAST_SIDE: 'East Side'
};

/**
 * Random event thresholds
 */
const RANDOM_EVENT_THRESHOLD = 75;  // Roll must be > this to trigger random event
const COMBAT_THRESHOLD = 60;        // Within random events, > this triggers combat
const WITNESS_THRESHOLD = 40;       // > this triggers witness event
const SPICY_THRESHOLD = 20;         // > this triggers spicy event
// Otherwise: story random event

export class SceneLoader {
  constructor(game) {
    this.game = game;
    this.scenes = [];
    this.sceneMap = {};
    this.eventStatusMap = {}; // Track event statuses
    this.locationSceneCache = {}; // Cache scenes by location
    this.locationNumberCache = {}; // Cache scenes by (location, number)
  }

  parsePlIndex(sceneOrId) {
    const id = typeof sceneOrId === 'string' ? sceneOrId : sceneOrId?.UniqueID;
    if (!id) return null;
    const match = String(id).match(/(?:^|_)pl_(\d+)(?:_|$)/i);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? value : null;
  }

  getPlChainKey(sceneOrId) {
    const id = typeof sceneOrId === 'string' ? sceneOrId : sceneOrId?.UniqueID;
    if (!id) return null;
    return String(id).replace(/(?:^|_)pl_\d+(?=_|$)/i, '_pl');
  }

  normalizeSceneNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const match = raw.match(/^#?(\d{1,3})$/);
    if (!match) return '';
    const num = Number.parseInt(match[1], 10);
    if (!Number.isFinite(num) || num < 0) return '';
    return String(num).padStart(3, '0');
  }

  parseSceneNumber(sceneOrId) {
    const id = typeof sceneOrId === 'string' ? sceneOrId : sceneOrId?.UniqueID;
    if (!id) return '';
    const match = String(id).match(/(?:^|_)(\d{1,3})(?=_[^_]+$)/);
    if (!match) return '';
    return this.normalizeSceneNumber(match[1]);
  }

  /**
   * Load all scenes from DB/scenes/ directory
   */
  async loadScenes() {
    try {
      // Fetch the full index to find scene files
      const indexResponse = await fetch('DB/full_index.json');
      const indexData = await indexResponse.json();
      
      const sceneFiles = (indexData?.files || [])
        .filter(f => f.startsWith('DB/scenes/') && f.endsWith('.json') && !f.includes('README'));

      const sceneResults = await Promise.allSettled(
        sceneFiles.map(file => fetch(file).then(r => r.json()))
      );

      this.scenes = [];
      for (let i = 0; i < sceneResults.length; i++) {
        const result = sceneResults[i];
        if (result.status === 'fulfilled') {
          const scene = result.value;
          if (scene.UniqueID) {
            this.scenes.push(scene);
            this.sceneMap[scene.UniqueID] = scene;
            
            // Initialize event status
            if (!this.eventStatusMap[scene.UniqueID]) {
              this.eventStatusMap[scene.UniqueID] = this.determineInitialStatus(scene);
            }
          }
        }
      }

      // Build location cache
      this.buildLocationCache();
      this.buildNumberCache();
      
      return this.scenes;
    } catch (error) {
      console.error('Failed to load scenes:', error);
      return [];
    }
  }

  /**
   * Determine initial event status based on scene data
   */
  determineInitialStatus(scene) {
    // Check if scene is completed
    const completedScenes = this.game.player?.CompletedScenes || [];
    if (completedScenes.includes(scene.UniqueID)) {
      return EventStatus.COMPLETED;
    }

    const legacyIds = Array.isArray(scene?.LegacyIDs) ? scene.LegacyIDs : [];
    for (const legacyId of legacyIds) {
      const id = String(legacyId ?? '').trim();
      if (!id) continue;
      if (completedScenes.includes(id)) {
        return EventStatus.COMPLETED;
      }
    }

    // Check if scene has required flags
    const requiredFlags = scene.Trigger?.RequiredFlags || {};
    for (const [flag, requiredValue] of Object.entries(requiredFlags)) {
      const actualValue = this.game.player?.Stats?.[flag];
      if (actualValue !== requiredValue) {
        return EventStatus.BLOCKED;
      }
    }

    return EventStatus.ACTIVE;
  }

  /**
   * Build cache of scenes by location for faster lookup
   */
  buildLocationCache() {
    this.locationSceneCache = {};
    
    for (const scene of this.scenes) {
      const location = scene.Location;
      if (!location) continue;
      
      if (!this.locationSceneCache[location]) {
        this.locationSceneCache[location] = [];
      }
      
      this.locationSceneCache[location].push(scene);
    }
  }

  buildNumberCache() {
    this.locationNumberCache = {};

    for (const scene of this.scenes) {
      const location = String(scene?.Location ?? '').trim();
      if (!location) continue;

      const number = this.parseSceneNumber(scene);
      if (!number) continue;

      if (!this.locationNumberCache[location]) this.locationNumberCache[location] = {};
      if (!Array.isArray(this.locationNumberCache[location][number])) this.locationNumberCache[location][number] = [];
      this.locationNumberCache[location][number].push(scene.UniqueID);
    }
  }

  /**
   * Main scanner: Check for available events when entering a location
   */
  scanLocationEvents(roomId, room) {
    const results = {
      combatEvent: null,
      randomEvent: null,
      storyEvent: null,
      eventTriggered: false
    };

    // 1. Check for story events first (highest priority)
    const storyEvent = this.checkStoryEvents(roomId, room);
    if (storyEvent) {
      results.storyEvent = storyEvent;
      results.eventTriggered = true;
      return results;
    }

    // 2. Roll for random events
    const randomRoll = randomIntInclusive(1, 100, cryptoRng);
    
    if (randomRoll > RANDOM_EVENT_THRESHOLD) {
      // Random event triggered - determine type
      const eventTypeRoll = randomIntInclusive(1, 100, cryptoRng);
      
      if (eventTypeRoll > COMBAT_THRESHOLD) {
        // Combat encounter
        results.combatEvent = this.triggerRandomCombat(roomId, room);
        results.eventTriggered = true;
      } else if (eventTypeRoll > WITNESS_THRESHOLD) {
        // Witness event (city life episode)
        results.randomEvent = this.triggerWitnessEvent(roomId, room);
        results.eventTriggered = true;
      } else if (eventTypeRoll > SPICY_THRESHOLD) {
        // Spicy event
        results.randomEvent = this.triggerSpicyEvent(roomId, room);
        results.eventTriggered = true;
      } else {
        // Story random event
        results.randomEvent = this.triggerStoryRandomEvent(roomId, room);
        results.eventTriggered = true;
      }
    }

    return results;
  }

  /**
   * Check for planned story events with conditions
   */
  checkStoryEvents(roomId, room) {
    const locationScenes = this.locationSceneCache[roomId] || [];
    
    // Filter to story events only
    const storyScenes = locationScenes
      .filter(scene => scene.SceneType === 'story' || scene.SceneType === 'sequence')
      .filter(scene => this.eventStatusMap[scene.UniqueID] === EventStatus.ACTIVE);

    // Only consider scenes whose conditions are satisfied.
    const eligibleScenes = storyScenes.filter(scene => this.checkSceneConditions(scene));

    // Planned scenes: deterministic ordering via `_pl_XX` in `UniqueID`.
    // If any planned scenes are eligible, pick the next uncompleted stage in the chain.
    const eligiblePlScenes = eligibleScenes
      .map(scene => ({ scene, plIndex: this.parsePlIndex(scene), chainKey: this.getPlChainKey(scene) }))
      .filter(entry => entry.plIndex !== null && entry.chainKey);

    if (eligiblePlScenes.length > 0) {
      const allPlInLocation = locationScenes
        .filter(scene => scene.SceneType === 'story')
        .map(scene => ({
          scene,
          plIndex: this.parsePlIndex(scene),
          chainKey: this.getPlChainKey(scene),
          status: this.eventStatusMap[scene.UniqueID] || EventStatus.INACTIVE
        }))
        .filter(entry => entry.plIndex !== null && entry.chainKey);

      // Group by chainKey and choose the earliest eligible scene in the earliest-available chain.
      const chainKeySet = Array.from(new Set(eligiblePlScenes.map(e => e.chainKey))).sort();
      for (const chainKey of chainKeySet) {
        const chainAll = allPlInLocation
          .filter(e => e.chainKey === chainKey)
          .sort((a, b) => a.plIndex - b.plIndex);

        const chainEligible = eligiblePlScenes
          .filter(e => e.chainKey === chainKey)
          .sort((a, b) => a.plIndex - b.plIndex);

        for (const candidate of chainEligible) {
          const requiredPrevious = chainAll
            .filter(e => e.plIndex < candidate.plIndex)
            .every(e => e.status === EventStatus.COMPLETED);

          if (!requiredPrevious) continue;

          return {
            scene: candidate.scene,
            category: EventCategory.STORY,
            priority: candidate.scene.Priority || 100
          };
        }
      }
    }

    // Non-planned scenes: deterministic selection by priority desc, then UniqueID asc.
    const sortedEligible = [...eligibleScenes].sort((a, b) => {
      const pa = Number.isFinite(a?.Priority) ? a.Priority : 100;
      const pb = Number.isFinite(b?.Priority) ? b.Priority : 100;
      if (pb !== pa) return pb - pa;
      return String(a?.UniqueID ?? '').localeCompare(String(b?.UniqueID ?? ''));
    });

    if (sortedEligible.length > 0) {
      const scene = sortedEligible[0];
      return {
        scene,
        category: EventCategory.STORY,
        priority: scene.Priority || 100
      };
    }

    return null;
  }

  /**
   * Check if scene conditions are satisfied
   */
  checkSceneConditions(scene) {
    const trigger = scene.Trigger || {};
    
    // Check required flags
    const requiredFlags = trigger.RequiredFlags || {};
    for (const [flag, requiredValue] of Object.entries(requiredFlags)) {
      const actualValue = this.game.player?.Stats?.[flag];
      if (actualValue !== requiredValue) {
        return false;
      }
    }

    // Check event type matches (this scanner is for room-enter events).
    const eventTypeRaw = String(trigger.EventType || '<<On Player Enter First Time>>');
    const eventType = eventTypeRaw.trim().toLowerCase();

    // Scenes explicitly marked as event-driven/manual should not auto-trigger here.
    if (eventType.includes('triggered by event') || eventType.includes('manual')) return false;

    // Only auto-trigger enter-style events.
    // (Prevents future exit/presence triggers from firing on enter scans.)
    if (eventType.includes('exit') || eventType.includes('presence')) return false;

    const isFirstTime = eventType.includes('first time');
    
    if (isFirstTime) {
      const room = this.game?.roomMap?.[scene.Location] ?? null;
      if (room?.bFirstTimeVisited) return false;
    }

    return true;
  }

  /**
   * Trigger random combat encounter
   */
  triggerRandomCombat(roomId, room) {
    const roomGroup = room?.Group || '';
    
    // Get eligible enemies for this location group
    const eligibleEnemies = this.getEligibleEnemies(roomGroup);
    
    if (eligibleEnemies.length === 0) {
      return null;
    }

    // Pick random enemy
    const enemy = eligibleEnemies[randomIntInclusive(0, eligibleEnemies.length - 1, cryptoRng)];
    
    // Check for combat scenes in this location
    const combatScenes = (this.locationSceneCache[roomId] || [])
      .filter(s => s.SceneType === 'combat');
    
    return {
      category: EventCategory.COMBAT,
      enemy,
      scene: combatScenes.length > 0 ? combatScenes[0] : null,
      description: `A ${enemy?.Name || 'hostile figure'} appears!`
    };
  }

  /**
   * Get eligible enemies for location group
   */
  getEligibleEnemies(locationGroup) {
    const enemies = Object.values(this.game.characterMap || {})
      .filter(char => {
        const isEnemy = char?.category === 'enemies' || char?.__category === 'enemies';
        const canSpawn = char?.CanSpawn !== false;
        return isEnemy && canSpawn;
      });

    // TODO: Filter by location group compatibility
    // For now, return all eligible enemies
    return enemies;
  }

  /**
   * Trigger witness event (city life episode)
   */
  triggerWitnessEvent(roomId, room) {
    const witnessScenes = (this.locationSceneCache[roomId] || [])
      .filter(s => s.SceneType === 'random' && s.Tags?.includes('witness'));
    
    if (witnessScenes.length === 0) {
      return this.generateGenericWitnessEvent(room);
    }

    const scene = witnessScenes[randomIntInclusive(0, witnessScenes.length - 1, cryptoRng)];
    
    return {
      category: EventCategory.WITNESS,
      scene,
      description: scene.Description || 'You witness something unusual...'
    };
  }

  /**
   * Generate generic witness event if no scene defined
   */
  generateGenericWitnessEvent(room) {
    const events = [
      'You see a street performer entertaining a small crowd.',
      'A group of teenagers runs past, laughing and shouting.',
      'An elderly woman feeds pigeons on a nearby bench.',
      'Two people argue loudly on the corner before walking away.',
      'A delivery drone buzzes overhead, carrying a package.',
      'You notice graffiti on the wall: "The mind is the ultimate weapon."'
    ];

    return {
      category: EventCategory.WITNESS,
      scene: null,
      description: events[randomIntInclusive(0, events.length - 1, cryptoRng)]
    };
  }

  /**
   * Trigger spicy event
   */
  triggerSpicyEvent(roomId, room) {
    const spicyScenes = (this.locationSceneCache[roomId] || [])
      .filter(s => s.SceneType === 'random' && s.Tags?.includes('spicy'));
    
    if (spicyScenes.length === 0) {
      return null; // No spicy events available
    }

    const scene = spicyScenes[randomIntInclusive(0, spicyScenes.length - 1, cryptoRng)];
    
    return {
      category: EventCategory.SPICY,
      scene,
      description: scene.Description || 'Something interesting catches your attention...'
    };
  }

  /**
   * Trigger story random event
   */
  triggerStoryRandomEvent(roomId, room) {
    const storyRandomScenes = (this.locationSceneCache[roomId] || [])
      .filter(s => s.SceneType === 'random' && s.Tags?.includes('story'));
    
    if (storyRandomScenes.length === 0) {
      return null;
    }

    const scene = storyRandomScenes[randomIntInclusive(0, storyRandomScenes.length - 1, cryptoRng)];
    
    return {
      category: EventCategory.RANDOM,
      scene,
      description: scene.Description || 'Something happens...'
    };
  }

  /**
   * Get scene by ID
   */
  getScene(sceneId) {
    return this.sceneMap[sceneId] || null;
  }

  resolveSceneIdFromNumber(number, { roomId, preferTypes = [] } = {}) {
    const room = String(roomId ?? '').trim();
    const normalizedNumber = this.normalizeSceneNumber(number);
    if (!room || !normalizedNumber) return null;

    const ids = this.locationNumberCache?.[room]?.[normalizedNumber] ?? [];
    if (!Array.isArray(ids) || !ids.length) return null;

    const preferred = Array.isArray(preferTypes) ? preferTypes.map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean) : [];
    if (preferred.length) {
      const filtered = ids.filter(id => preferred.includes(String(this.sceneMap?.[id]?.SceneType ?? '').trim().toLowerCase()));
      if (filtered.length === 1) return filtered[0];
      if (filtered.length > 1) return null;
    }

    if (ids.length === 1) return ids[0];
    return null;
  }

  isSceneCompleted(sceneId) {
    const id = String(sceneId ?? '').trim();
    if (!id) return false;
    if (this.eventStatusMap?.[id] === EventStatus.COMPLETED) return true;

    const completed = this.game?.player?.CompletedScenes;
    if (Array.isArray(completed) && completed.includes(id)) return true;

    const scene = this.sceneMap?.[id] ?? null;
    const legacy = Array.isArray(scene?.LegacyIDs) ? scene.LegacyIDs : [];
    if (Array.isArray(completed) && legacy.some(entry => completed.includes(String(entry ?? '').trim()))) return true;

    return false;
  }

  /**
   * Mark scene as completed
   */
  completeScene(sceneId) {
    this.eventStatusMap[sceneId] = EventStatus.COMPLETED;
    
    // Add to player's completed scenes
    if (!this.game.player.CompletedScenes) {
      this.game.player.CompletedScenes = [];
    }
    
    if (!this.game.player.CompletedScenes.includes(sceneId)) {
      this.game.player.CompletedScenes.push(sceneId);
    }
  }

  /**
   * Update event status
   */
  setEventStatus(sceneId, status) {
    this.eventStatusMap[sceneId] = status;
  }

  /**
   * Get event status
   */
  getEventStatus(sceneId) {
    return this.eventStatusMap[sceneId] || EventStatus.INACTIVE;
  }

  /**
   * Check if scene is available (active and conditions met)
   */
  isSceneAvailable(sceneId) {
    const scene = this.sceneMap[sceneId];
    if (!scene) return false;
    
    const status = this.eventStatusMap[sceneId];
    if (status !== EventStatus.ACTIVE) return false;
    
    return this.checkSceneConditions(scene);
  }

  /**
   * Get all available scenes for location
   */
  getAvailableScenes(roomId) {
    const locationScenes = this.locationSceneCache[roomId] || [];
    
    return locationScenes.filter(scene => 
      this.isSceneAvailable(scene.UniqueID)
    );
  }
}
