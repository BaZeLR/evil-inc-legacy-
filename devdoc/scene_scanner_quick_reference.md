# Event Scanner System - Quick Reference

## Event Flow on Room Entry

```
Player Enters Room
       ↓
runRoomEnterEvents(roomId)
       ↓
scanLocationEvents(roomId, room)
       ↓
┌──────────────────────────────┐
│  Priority 1: Story Events    │ ← Check planned scenes with RequiredFlags
│  (Pauses game)               │
└──────────────────────────────┘
       ↓ (if no story event)
┌──────────────────────────────┐
│  Roll for Random Event       │ ← Roll 1-100
│  (if > 75, triggers)         │
└──────────────────────────────┘
       ↓ (if triggered)
┌──────────────────────────────┐
│  Roll for Event Type         │ ← Roll 1-100 again
│                              │
│  > 60: Combat                │
│  > 40: Witness (city life)   │
│  > 20: Spicy                 │
│  ≤ 20: Story Random          │
└──────────────────────────────┘
       ↓ (if no events)
┌──────────────────────────────┐
│  Standard Room Entry         │ ← Run normal room events
│  (First time + Regular)      │
└──────────────────────────────┘
```

## Event Types Quick Reference

| Event Type | Trigger | Pauses | Priority | Repeatable |
|------------|---------|--------|----------|------------|
| Story      | Conditional | Yes | 1 | No (unless flagged) |
| Combat     | Random (>75, >60) | Yes | 2 | Yes |
| Witness    | Random (>75, >40) | No | 3 | Yes |
| Spicy      | Random (>75, >20) | No | 3 | Yes |
| Story Random | Random (>75, ≤20) | No | 3 | Yes |

## Scene File Template (Minimal)

```json
{
  "UniqueID": "location_target_001_story",
  "Title": "Scene Title",
  "Description": "What happens in this scene",
  "Location": "room_id_here",
  "SceneType": "story",
  "Trigger": {
    "EventType": "<<On Player Enter First Time>>",
    "RequiredFlags": {}
  },
  "Stages": [
    {
      "StageID": "start",
      "Text": "Scene text here...",
      "Choices": [
        {
          "ChoiceID": "choice1",
          "Text": "Choice text",
          "NextStage": "stage2"
        }
      ]
    }
  ]
}
```

## Common Patterns

### Story Event with Flag Check
```json
{
  "SceneType": "story",
  "Trigger": {
    "RequiredFlags": {
      "quest_herbert_stage": 1,
      "knows_about_evil_corp": true
    }
  }
}
```

### Random Witness Event
```json
{
  "SceneType": "random",
  "Tags": ["witness"],
  "Trigger": {
    "EventType": "<<Random>>"
  }
}
```

### Conditional Choice (ShowIf)
```json
{
  "ChoiceID": "charm",
  "Text": "Use charm ability",
  "ShowIf": {
    "StatCheck": {
      "MS": 5
    }
  },
  "NextStage": "charmed"
}
```

## Probability Quick Math

- **25% chance** of ANY random event per room entry (roll > 75)
- If random event triggers:
  - **40% chance** of combat (roll > 60)
  - **20% chance** of witness (roll 41-60)
  - **20% chance** of spicy (roll 21-40)
  - **20% chance** of story random (roll ≤ 20)

## Player Data Fields

```json
{
  "CompletedScenes": ["scene_id_1", "scene_id_2"],
  "VisitedRooms": ["room_id_1", "room_id_2"],
  "Stats": {
    "Notoriety": 0
  }
}
```

## Game State Fields

```javascript
game.spawnState = {
  ephemeralCharacterIds: new Set(),
  pendingEncounter: {      // Set when combat triggers
    enemy: enemyObject,
    description: "..."
  },
  pendingScene: {          // Set when scene triggers
    sceneId: "...",
    scene: sceneObject,
    category: "story"
  }
}
```

## API Quick Reference

### Check Scene Status
```javascript
game.sceneLoader.getEventStatus('scene_id')
// Returns: 'active', 'inactive', 'blocked', or 'completed'
```

### Mark Scene Completed
```javascript
game.sceneLoader.completeScene('scene_id')
```

### Get Available Scenes for Location
```javascript
const scenes = game.sceneLoader.getAvailableScenes('eastside_lc_001')
```

### Change Event Status
```javascript
game.sceneLoader.setEventStatus('scene_id', EventStatus.ACTIVE)
```

## File Locations

- **Scene Loader**: `src/events/SceneLoader.js`
- **Game Integration**: `src/game.js` (lines 166+)
- **Scene Files**: `public/DB/scenes/`
- **Scene Index**: `public/DB/full_index.json`
- **Player Data**: `public/DB/player.json`

## Naming Convention

Format: `{location}_{target}_{number}_{type}.json`

Examples:
- `eastside_evilcorp_001_story.json`
- `downtown_alley_001_random.json`
- `campus_library_002_story.json`

## Testing Checklist

- [ ] Scene file in `DB/scenes/`
- [ ] Scene added to `full_index.json`
- [ ] Location matches room ID exactly
- [ ] RequiredFlags are testable
- [ ] StageIDs are unique
- [ ] NextStage references exist
- [ ] ChoiceIDs are unique within stage
- [ ] ShowIf conditions are valid
- [ ] Rewards format is correct
- [ ] Event status is ACTIVE

## Common Issues

### Scene Won't Trigger
1. Not in `full_index.json` → Add it
2. Wrong location ID → Check room.UniqueID
3. Flags not met → Test with dev console
4. Status is BLOCKED → Check RequiredFlags
5. Already completed → Check CompletedScenes array

### Random Events Too Frequent/Rare
1. Adjust `RANDOM_EVENT_THRESHOLD` (default 75)
2. Adjust category thresholds (COMBAT_THRESHOLD, etc.)
3. Located in `SceneLoader.js` lines 39-43

### Combat Not Triggering
1. Check enemy `CanSpawn` property
2. Verify enemy category is "enemies"
3. Increase COMBAT_THRESHOLD for more combat

## Quick Modifications

### Make Events More Common
```javascript
// In SceneLoader.js
const RANDOM_EVENT_THRESHOLD = 50;  // Was 75
```

### Disable Combat
```javascript
// In SceneLoader.js
const COMBAT_THRESHOLD = 101;  // Never triggers
```

### More Witness Events
```javascript
const WITNESS_THRESHOLD = 30;  // Was 40 (lower = more likely)
```
