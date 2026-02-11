# Scene System Documentation

## Overview
Centralized scene/story system for managing narrative content. Replaces scattered actions across rooms, objects, and characters with modular, reusable scene files.

## File Naming Convention
`{location}_{target}_{number}_{type}.json`

- **location**: Room ID where scene triggers (e.g., `eastside`, `downtown`, `libertycampus`)
- **target**: Target entity/building/quest (e.g., `evilcorp`, `herbert`, `recruit_katie`)
- **number**: Sequential number (001, 002, 003...)
- **type**: Scene category
  - `story` - Main story arc scenes
  - `sequence` - Linear talk/continue sequences (no choices, NextStage chain)
  - `random` - Random encounters
  - `side` - Side quests
  - `combat` - Combat encounters
  - `romance` - Character relationship scenes

### Examples:
- `eastside_evilcorp_001_story.json` - Get hired at Evil Inc (main quest)
- `downtown_uranuslounge_001_side.json` - Meet the loan shark (side quest)
- `westside_random_001_random.json` - Random mugging encounter
- `libertycampus_herbert_001_story.json` - Herbert infiltration mission

## Scene Structure

### Core Fields
```json
{
  "UniqueID": "scene_id",
  "SceneName": "Human-readable name",
  "SceneType": "story|sequence|random|side|combat|romance",
  "Location": "room_id",
  "TargetEntity": "object_id or character_id",
  "Tags": ["quest-name", "category"],
  "Description": "What this scene does"
}
```

### Trigger System
```json
{
  "Trigger": {
    "EventType": "<<On Player Enter First Time>>",
    "AttachedTo": "room|character|object",
    "EntityID": "entity_unique_id",
    "RequiredFlags": {
      "quest_main_started": true,
      "has_keycard": true
    }
  }
}
```

### Stage-Based Flow
Scenes are composed of **stages** that flow from one to another:

```json
{
  "Stages": [
    {
      "StageID": "intro",
      "Media": "Assets/images/scenes/intro.jpg",
      "MediaType": "image|video",
      "Text": "Narrative text with [b]formatting[/b]",
      "AutoAdvance": false,
      "NextStage": "choice_point"
    }
  ]
}
```

## Talk + Continue Sequences (SceneType: `sequence`)

Use this when you want: **Talk starts the scene**, then the **Continue (>) button** plays the next stage (picture/text), until the scene ends.

Rules:
- Put your dialog/picture steps into `Stages[]`.
- For linear steps: use `Choices: []` + `NextStage: "stage_02"`.
- The last stage should set `"IsEnd": true`.

### Conditional start (only play when conditions match)
You have 3 options:

1) Gate the **Talk action** (room/object/character) with `Conditions` (CT_* checks).
2) Add `Trigger.RequiredFlags` (simple stat/flag equality checks).
3) Add `StartIf` (same schema as `ShowIf`, supports CT_* checks).

### Play once vs repeatable
- Default behavior: once completed, the scene won’t start again.
- Set `"Repeatable": true` on the scene to allow re-playing.

### Calling a scene by number (instead of full UniqueID)
If the scene is in the **current room** (`scene.Location` matches), you can start it by number:
- `TriggerScene: 1` or `TriggerScene: "001"` or `TriggerScene: "#1"`

This resolves the scene using the `_{number}_{type}` pattern in `UniqueID` (e.g. `campussecurity_herbert_001_sequence`). If multiple scenes share the same number in the same room, use the full `UniqueID` instead.

### Dynamic Choice System
Modern conditional choices that show/hide based on player stats:

```json
{
  "Choices": [
    {
      "ChoiceID": "choice_investigate",
      "DisplayText": "Investigate with psychic powers",
      "Tooltip": "Requires MS >= 5",
      "ShowIf": {
        "Condition": "CT_Variable_Comparison",
        "Variable": "player.Stats.MS",
        "Operator": ">=",
        "Value": 5
      },
      "Effects": [
        {
          "cmdtype": "CT_SETVARIABLE",
          "Variable": "player.Stats.quest_stage",
          "Operator": "Equals",
          "Value": 2
        }
      ],
      "NextStage": "investigation_result",
      "GainExp": 15,
      "EnergyCost": 10
    }
  ]
}
```

### ShowIf Conditions
Choices can be hidden/shown based on:
- **Stats**: `player.Stats.MS >= 5`
- **Flags**: `player.Stats.has_badge == true`
- **Items**: `player.Inventory contains 'keycard_001'`
- **Completed Scenes**: `player.CompletedScenes contains 'scene_id'`

### Chance-Based Outcomes
```json
{
  "ChoiceID": "try_persuade",
  "DisplayText": "Try to persuade the guard",
  "ChanceSuccess": 60,
  "OnSuccess": {
    "Text": "The guard believes you.",
    "NextStage": "success_path",
    "GainExp": 20
  },
  "OnFailure": {
    "Text": "The guard calls security.",
    "NextStage": "caught",
    "GainExp": 0
  }
}
```

### Effects System
Actions that modify game state:

```json
{
  "Effects": [
    {
      "cmdtype": "CT_SETVARIABLE",
      "Variable": "player.Stats.quest_main_stage",
      "Operator": "Equals",
      "Value": 3
    },
    {
      "cmdtype": "CT_DISPLAYTEXT",
      "Text": "You gain the keycard."
    },
    {
      "cmdtype": "CT_ADDTOARRAY",
      "Variable": "player.Inventory",
      "Value": "keycard_001"
    },
    {
      "cmdtype": "CT_ADDTOARRAY",
      "Variable": "player.CompletedScenes",
      "Value": "scene_id"
    }
  ]
}
```

### Rewards
```json
{
  "Rewards": {
    "OnComplete": {
      "Experience": 100,
      "Credits": 500,
      "Items": ["item_id_001", "item_id_002"],
      "UnlockRooms": ["new_room_id"],
      "UnlockScenes": ["next_scene_id"]
    }
  }
}
```

## Integration with Event System

### In Room JSON:
Instead of embedding full action trees, reference scene files:
```json
{
  "Actions": [
    {
      "name": "<<On Player Enter First Time>>",
      "bActive": true,
      "TriggerScene": "eastside_evilcorp_001_story"
    }
  ]
}
```

### In Object/Character JSON:
```json
{
  "ActionsMenu": [
    {
      "Action": "Interact",
      "TriggerScene": "character_recruit_001_side"
    }
  ]
}
```

## Quest/Objective Tracking

### Quest Variables:
```javascript
player.Stats.quest_{questname}_stage = 0-10;  // Progress tracking
player.Stats.{questname}_completed = true/false;
player.Stats.{questname}_{detail} = value;     // Quest-specific data
```

### Objective Display in Com Unit:
The Com Unit can dynamically check `quest_*_stage` variables and display appropriate objectives based on progress.

## Advantages Over Old System

### Old System Problems:
❌ Actions scattered across room/character/object JSONs  
❌ Deeply nested conditions hard to read  
❌ Duplicate code across multiple files  
❌ Difficult to track story flow  
❌ No conditional choice visibility  

### New System Benefits:
✅ All scene content in one file  
✅ Clear stage-based progression  
✅ Dynamic choices show/hide based on stats  
✅ Reusable and modular  
✅ Easy to track quest flow  
✅ Modern conditional syntax  
✅ Better for version control  

## Creating New Scenes

1. Copy `scene_template.json`
2. Rename using convention: `{location}_{target}_{number}_{type}.json`
3. Update UniqueID, SceneName, Location, TargetEntity
4. Design your stages and choices
5. Add ShowIf conditions for dynamic choices
6. Define effects and rewards
7. Reference scene from room/object/character using `TriggerScene`

## Future Enhancements
- Visual scene editor UI
- Scene validation tool
- Auto-generation of objective text from quest stages
- Scene branching visualizer
- Template library for common patterns
