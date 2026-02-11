# Scene Loader System - Implementation Guide

## Overview

The Scene Loader is a comprehensive event management system that triggers different types of events when the player enters a location. It integrates with the existing event system and adds support for:

- **Story Events**: Planned narrative scenes from DB/scenes/
- **Random Combat**: Location-based enemy encounters
- **Witness Events**: City life episodes (NPCs, atmosphere)
- **Spicy Events**: Adult content encounters
- **Story Random Events**: Random narrative moments

## Architecture

### Core Components

1. **SceneLoader** (`src/events/SceneLoader.js`)
   - Manages scene discovery and caching
   - Implements event scanning logic
   - Handles event status tracking (active/inactive/blocked/completed)

2. **Game Integration** (`src/game.js`)
   - SceneLoader initialized in Game constructor
   - Scenes loaded during game initialization
   - `runRoomEnterEvents()` enhanced with event scanner

3. **Scene Files** (`public/DB/scenes/`)
   - JSON-based scene definitions
   - Stage-based progression
   - Dynamic conditional choices

## Event Priority System

When entering a location, the scanner checks events in this order:

1. **Story Events** (Highest Priority)
   - Planned narrative scenes with specific triggers
   - Must have status = "active"
   - Must meet RequiredFlags conditions
   - Pauses game for player interaction

2. **Combat Events**
   - Random enemy encounters
   - Triggered by random roll (> 75, then > 60 within random events)
   - Based on location group
   - Pauses game for combat

3. **Random Events** (Lowest Priority)
   - Witness events (> 40 threshold)
   - Spicy events (> 20 threshold)
   - Story random events (≤ 20 threshold)
   - Most don't pause game

## Event Thresholds

```javascript
const RANDOM_EVENT_THRESHOLD = 75;  // Roll must be > this to trigger any random event
const COMBAT_THRESHOLD = 60;        // Within random events, > this triggers combat
const WITNESS_THRESHOLD = 40;       // > this triggers witness event
const SPICY_THRESHOLD = 20;         // > this triggers spicy event
```

### How It Works

1. Roll 1-100 for random event trigger
2. If roll > 75: Random event triggered
   - Roll again 1-100 for event type:
     - > 60: Combat encounter
     - > 40 (≤ 60): Witness event
     - > 20 (≤ 40): Spicy event
     - ≤ 20: Story random event
3. If roll ≤ 75: Check story events
4. If no story events: Normal room entry

## Scene File Structure

### Required Fields

```json
{
  "UniqueID": "eastside_evilcorp_001_story",
  "Title": "Scene Title",
  "Description": "Scene description",
  "Location": "eastside_lc_001",
  "SceneType": "story",
  "Trigger": {
    "EventType": "<<On Player Enter First Time>>",
    "RequiredFlags": {}
  },
  "Stages": []
}
```

### Optional Fields

```json
{
  "Priority": 100,
  "Tags": ["combat", "witness", "spicy", "story"],
  "Media": "Assets/images/scenes/scene.jpg",
  "Rewards": {
    "OnComplete": {
      "Experience": 50,
      "Flags": {
        "quest_hired": true
      }
    }
  }
}
```

## Scene Types

### Story Scene
```json
{
  "SceneType": "story",
  "Trigger": {
    "EventType": "<<On Player Enter First Time>>",
    "RequiredFlags": {
      "quest_herbert_stage": 0
    }
  }
}
```

### Random Scene
```json
{
  "SceneType": "random",
  "Tags": ["witness"],
  "Trigger": {
    "EventType": "<<Random>>"
  }
}
```

### Combat Scene
```json
{
  "SceneType": "combat",
  "Trigger": {
    "EventType": "<<Random Combat>>"
  }
}
```

## Event Status Management

### Status Types

- **ACTIVE**: Event can trigger if conditions met
- **INACTIVE**: Event exists but won't trigger
- **BLOCKED**: Event conditions not met (e.g., missing required flags)
- **COMPLETED**: Event already completed, won't trigger again

### Status Checking

```javascript
// Check if scene is available
sceneLoader.isSceneAvailable(sceneId)

// Get event status
const status = sceneLoader.getEventStatus(sceneId)

// Update status
sceneLoader.setEventStatus(sceneId, EventStatus.ACTIVE)

// Mark as completed
sceneLoader.completeScene(sceneId)
```

## Integration with Existing Systems

### Player Data

New fields added to `player.json`:

```json
{
  "CompletedScenes": ["eastside_intro_001"],
  "VisitedRooms": ["eastside_lc_001", "route69_lc_001"]
}
```

### Game State

New `spawnState` properties:

```javascript
this.spawnState = {
  ephemeralCharacterIds: new Set(),
  pendingEncounter: null,
  pendingScene: null  // NEW: Current scene waiting for display
}
```

### Event Results

Enhanced event result format:

```javascript
{
  texts: ["Event text..."],
  media: "path/to/image.jpg",
  paused: true,
  errors: [],
  sceneData: {    // NEW: Scene information
    sceneId: "scene_id",
    scene: { /* scene object */ },
    category: "story"
  },
  combatData: {   // NEW: Combat information
    enemy: { /* enemy object */ },
    description: "A hostile appears!"
  }
}
```

## Example Usage

### Creating a Story Event

1. Create scene file: `DB/scenes/eastside_intro_001_story.json`
2. Add scene to `full_index.json`
3. Set Location and Trigger conditions
4. Scene automatically discovered on game load
5. Triggers when player enters location if conditions met

### Handling Scene in UI

```javascript
// Check event result for scene data
if (eventResult.sceneData) {
  const scene = eventResult.sceneData.scene;
  const stage = scene.Stages[0]; // First stage
  
  // Display stage content
  displayText(stage.Text);
  displayMedia(stage.Media);
  
  // Display choices
  stage.Choices.forEach(choice => {
    if (checkShowIf(choice.ShowIf)) {
      displayChoice(choice);
    }
  });
}
```

### Handling Combat Events

```javascript
// Check event result for combat data
if (eventResult.combatData) {
  const enemy = eventResult.combatData.enemy;
  
  // Initialize combat
  startCombat(player, enemy);
}
```

## Location Groups

Location groups determine which enemies can spawn:

```javascript
export const LocationGroup = {
  CITY: 'Liberty City',
  CAMPUS: 'College Campus',
  DOWNTOWN: 'Downtown',
  WEST_SIDE: 'West Side',
  EAST_SIDE: 'East Side'
}
```

## Customization

### Adjusting Thresholds

Edit thresholds in `SceneLoader.js`:

```javascript
const RANDOM_EVENT_THRESHOLD = 75;  // Lower = more random events
const COMBAT_THRESHOLD = 60;        // Higher = more combat
const WITNESS_THRESHOLD = 40;       // Adjust witness event frequency
const SPICY_THRESHOLD = 20;         // Adjust spicy event frequency
```

### Adding New Event Categories

1. Add to `EventCategory` enum
2. Create trigger method (e.g., `triggerNewEventType()`)
3. Add to `scanLocationEvents()` logic
4. Update threshold system if needed

### Custom Event Conditions

Add custom condition checks in `checkSceneConditions()`:

```javascript
checkSceneConditions(scene) {
  // Existing checks...
  
  // Custom condition: Player level
  const minLevel = scene.Trigger?.MinLevel;
  if (minLevel && this.game.player.Stats.Level < minLevel) {
    return false;
  }
  
  return true;
}
```

## Debugging

### Enable Scene Loader Logging

Add console logs in `SceneLoader.js`:

```javascript
scanLocationEvents(roomId, room) {
  console.log(`[SceneLoader] Scanning ${roomId}...`);
  
  const results = { /* ... */ };
  
  console.log('[SceneLoader] Results:', results);
  return results;
}
```

### Check Scene Discovery

```javascript
console.log('Loaded scenes:', game.sceneLoader.scenes);
console.log('Location cache:', game.sceneLoader.locationSceneCache);
```

### Monitor Event Status

```javascript
Object.entries(game.sceneLoader.eventStatusMap).forEach(([id, status]) => {
  console.log(`${id}: ${status}`);
});
```

## Best Practices

1. **Scene Naming**: Use format `{location}_{target}_{number}_{type}.json`
2. **RequiredFlags**: Keep flag names consistent across scenes
3. **Priorities**: Use 1-100 scale (100 = highest priority)
4. **Testing**: Test scene conditions before marking as active
5. **Balancing**: Adjust thresholds based on gameplay testing
6. **Performance**: Cache frequently accessed scenes
7. **Error Handling**: Always validate scene data before use

## Future Enhancements

- **Scene Dependencies**: Chain scenes together (scene A unlocks scene B)
- **Cooldown System**: Prevent same scene from triggering too frequently
- **Location Tags**: More granular location-based filtering
- **Dynamic Thresholds**: Adjust based on player stats (Notoriety affects combat rate)
- **Scene Editor**: Visual tool for creating scenes
- **Analytics**: Track which scenes trigger most often

## Troubleshooting

### Scene Not Triggering

1. Check if scene in `full_index.json`
2. Verify `Location` matches room ID exactly
3. Check `RequiredFlags` are satisfied
4. Verify event status is ACTIVE
5. Check random roll thresholds
6. Ensure scene type is correct

### Combat Not Working

1. Verify enemies have `CanSpawn: true`
2. Check enemy category is "enemies"
3. Ensure combat threshold allows triggers
4. Verify `pendingEncounter` is set correctly

### Scene Status Issues

1. Check if scene already completed
2. Verify flags updated correctly
3. Check initial status determination
4. Ensure `CompletedScenes` array exists

## API Reference

### SceneLoader Methods

- `loadScenes()`: Load all scenes from DB/scenes/
- `scanLocationEvents(roomId, room)`: Check for available events
- `checkStoryEvents(roomId, room)`: Find eligible story events
- `triggerRandomCombat(roomId, room)`: Generate combat encounter
- `triggerWitnessEvent(roomId, room)`: Generate witness event
- `triggerSpicyEvent(roomId, room)`: Generate spicy event
- `getScene(sceneId)`: Get scene by ID
- `completeScene(sceneId)`: Mark scene as completed
- `setEventStatus(sceneId, status)`: Update event status
- `getEventStatus(sceneId)`: Get current status
- `isSceneAvailable(sceneId)`: Check if scene can trigger

### Game Methods

- `runRoomEnterEvents(roomId)`: Enhanced with scene scanner
- `handleStoryEvent(storyEventData, roomId, room)`: Process story event
- `handleCombatEvent(combatEventData, roomId, room)`: Process combat event
- `handleRandomEvent(randomEventData, roomId, room)`: Process random event
