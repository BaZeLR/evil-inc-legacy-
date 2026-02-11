# EVIL Incorporated (Legacy AI Edition)
## Procedural Actions, Dialog Templates, and Scene Rendering

This document describes:
- What the player can do (procedural/UI actions)
- How “data-driven actions” work (`ActionsMenu` → `Actions` → EventEngine)
- How to author dialogs with menu choices and branching
- How to update variables/flags and display scenes (text + media)

---

## 1) Two kinds of “actions”

### A. Procedural/UI actions (hard-coded)
These are implemented in `src/web/GameUI.jsx` and call core engine code (ex: `Game.travelTo()`).

### B. Data-driven actions (JSON-authored)
These are authored in JSON (`public/DB/**`) via:
- `ActionsMenu`: what buttons the UI shows (“Talk”, “Open”, “Attack”…)
- `Actions`: what actually runs (EventEngine actions with commands/conditions)

The UI uses `ActionsMenu` for the player-facing buttons, then calls:
`game.eventEngine.runEvent(<ActionLabel>, ...)`

So **the label in `ActionsMenu.Action` must match an `Actions[].name`** (or `Actions[].overridename`).

---

## 2) Player actions (procedural/UI)

### Navigation / world
- **Move to another room**
  - UI: `handleMove(destinationRoomId)` in `src/web/GameUI.jsx`
  - Engine: `Game.travelTo(roomId)` in `src/game.js`
  - Effects:
    - Advances time **+00:30** and Energy **-1** (move cost)
    - Triggers planned events (exit/enter/presence), spawns, and room enter events

- **Examine room**
  - UI: `handleExamineRoom()`
  - Engine: `eventEngine.runEvent('Examine Room', { entityType:'room', ... })`
  - Effect: pushes returned text/media into the scene UI

### Inspect / examine
- **Inspect object/NPC (select target)**
  - UI: `toggleInspect(type, id, entity)` and `examineObject() / examineNpc()`
  - Engine: `eventEngine.runEvent('<<On Click>>', { entityType, entityId, entity, room })`
  - Effect: the target becomes “inspected”; TextWindow shows its description and hints to open Actions

- **Click rich text links**
  - UI: `handleRichTextClick()`
  - Supported link prefixes in text:
    - `object:<id>` or `obj:<id>` → inspect object
    - `npc:<id>` or `character:<id>` → inspect NPC
    - `room:<roomId>` → shows that room’s picture (if it has media)

### Inventory / objects
- **Take object from room**
  - UI: `takeObject(obj)`
  - Effect: moves it into `player.Inventory`, removes from `room.objects`, persists save

- **Drop inventory item**
  - UI: `dropInventoryItem(item)`
  - Effect: removes from `player.Inventory`, places into `room.objects`, persists save

- **Equip / Unequip item**
  - UI: `toggleEquipped(itemId)` → `setItemEquipped(itemId, bool)`
  - Effect: toggles `player.Equipped`, updates bonuses shown in UI, persists save

- **Use consumable**
  - UI: `useConsumableItem(item)`
  - Effect: applies restore values (from object CustomProperties) and decrements inventory stack, persists save

### Containers (bags)
- **Open / close container**
  - UI: `toggleContainerOpen(containerId)`
  - Effect: toggles CustomProperties on that object (stored in save), updates “Contents” list in the UI

- **Take (or auto-equip) item from container**
  - UI: `takeFromContainerToInventory({ containerId, itemId, autoEquip })`
  - Effect: removes from container contents, adds to inventory, optionally equips, persists save

### Vendor / shop
- **Open vendor**
  - UI: `openVendorShop(vendorEntity)`
  - Effect: opens vendor drawer with shop items

- **Buy item**
  - UI: `buyVendorItem({ vendorId, itemId, price })`
  - Effect: deduct credits, add item to inventory, persists save

### Combat
- **Start combat**
  - UI: `startCombat(npc)`
  - Engine: `createCombatState({ game, room, enemy })`

- **Combat actions**
  - UI: `runCombatAction(action)`
  - Engine: `performCombatTurn({ ... })`
  - Cost model:
    - Weapon actions advance time **+01:00**, Energy **-1**
    - Ability actions advance time **+01:00**, no flat energy cost (ability energy can be separate)

### Save / load
- **Save game**: `handleSaveGame()`
- **Load game**: `handleLoadGame()`
- **New game**: `handleNewGame()`
- **Reset save**: `handleResetSave()`

---

## 3) Scene rendering (“Scene Player Procedure”)

In this project, a “scene” is just the combination of:
- Location background (room media)
- Optional overlay media (event/inspect/combat/vendor preview)
- TextWindow description + “system messages” (event messages)
- Player choices (via the Actions drawer buttons)

### Procedure (what happens on an action)
1. **Trigger**
   - The player clicks a UI action (Move, Examine, Talk, Open, Buy, Attack, etc.)
2. **Engine resolves content**
   - Procedural action calls core engine (`Game.travelTo`) OR runs an event (`eventEngine.runEvent`)
3. **Engine returns a result**
   - `result.texts[]` (strings)
   - `result.media` (string path to image/video)
4. **UI renders**
   - TextWindow renders room/target descriptions + system messages
   - Media window shows background; overlay shows `result.media` when present
5. **Player chooses next step**
   - For dialogs, choices are usually shown as NPC `ActionsMenu` buttons in the Actions drawer

### Text formatting + variables
Two interpolation systems exist:
- **Curly braces `{...}`**: resolved by the EventEngine when executing commands.
  - Example: `Notoriety is {player.Stats.Notoriety}`
- **RAGS-style `[v: ...]`**: resolved when rendering text in the UI.
  - Example: `Notoriety is [v: player.Stats.Notoriety]`

Supported markup in text:
- `[b]bold[/b]`, `[i]italic[/i]`
- `[c red]colored[/c]` or `[c 255,0,0]colored[/c]`
- Newlines become `<br>`

---

## 4) Data-driven actions (JSON authoring)

### Where actions live
- Rooms: `public/DB/rooms.json` (Room `Actions[]`, and room `objects[]` / `NPCs[]`)
- Objects: `public/DB/objects/<category>/<id>.json` (Object `Actions[]`, `ActionsMenu[]`, `Contents[]`, `ShopItems[]`)
- Characters: `public/DB/characters/<category>/<id>.json` (Character `Actions[]`, `ActionsMenu[]`, `ShopItems[]`)
- Planned events: `public/DB/events.json` (`Events[]`, picked by EventController)

### Minimal pattern (NPC dialog buttons → event actions)
```json
{
  "UniqueID": "officer_jina_001",
  "Charname": "Officer Jina",
  "Description": "A tired officer with sharp eyes.",
  "ActionsMenu": [
    { "Action": "Talk", "Description": "Start a conversation." },
    { "Action": "Ask About Capri", "Description": "Bring up Capri." },
    { "Action": "Goodbye", "Description": "End the conversation." }
  ],
  "Actions": [
    {
      "name": "Talk",
      "bActive": true,
      "PassCommands": [
        { "cmdtype": "CT_DISPLAYPICTURE", "CommandPart2": "Assets/images/characters/officer_jina.jpg" },
        { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "[b]Officer Jina[/b]: \"Speak.\""},
        { "cmdtype": "CT_SETVARIABLE", "CommandPart2": "player.Stats.jina_dialog_step", "CommandPart3": "Equals", "CommandPart4": 1 }
      ]
    },
    {
      "name": "Ask About Capri",
      "bActive": true,
      "Conditions": [
        {
          "ConditionName": "Must have started dialog",
          "Checks": [
            { "CondType": "CT_Variable_Comparison", "ConditionStep2": "player.Stats.jina_dialog_step", "ConditionStep3": "==", "ConditionStep4": 1 }
          ],
          "PassCommands": [
            { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "\"Capri? Trouble. Keep your distance.\""},
            { "cmdtype": "CT_SETVARIABLE", "CommandPart2": "player.Stats.jina_dialog_step", "CommandPart3": "Equals", "CommandPart4": 2 }
          ],
          "FailCommands": [
            { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "She stares. Maybe start with [b]Talk[/b]." }
          ]
        }
      ]
    },
    {
      "name": "Goodbye",
      "bActive": true,
      "PassCommands": [
        { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "She turns away."},
        { "cmdtype": "CT_SETVARIABLE", "CommandPart2": "player.Stats.jina_dialog_step", "CommandPart3": "Equals", "CommandPart4": 0 }
      ]
    }
  ]
}
```

Notes:
- This uses `player.Stats.*` as the dialog “state machine” because Stats are persisted in the save.
- The UI does not (yet) hide/show menu choices based on conditions; conditions control what happens when clicked.

---

## 5) Variables vs flags (what persists)

### Recommended for persistent story state
- `player.Stats.<your_flag_or_step>` (persisted by save/load)
- Planned event `rewards.flags` in `public/DB/events.json` (persisted in `save.events.flags`)
- `object.CustomProperties.<your_flag>` (persisted once the object state is written into `save.objects`)
  - Always persisted after **Save Game** (the UI saves all objects)
  - Also persisted for containers when the UI calls `commitObjectToSave()` (open/close, take-from-container, etc.)

### Ephemeral (resets on reload)
- `vars.*` / `global.*` (stored in `game.variables` only; not saved)

---

## 6) EventEngine: supported conditions and commands

### Condition checks (`CondType`)
- `CT_Variable_Comparison` / `CT_Variable`
  - Compares resolved values (example: `player.Stats.Notoriety >= 45`)
- `CT_RandomChance` / `CT_D100_CHANCE` (percent chance)
- `CT_ObjectState` (reads a property from an object)
- `CT_CharacterState` (reads a property from a character)
- `CT_Loop_While` (special: while-loop style over PassCommands)

### Commands (`cmdtype`)
- `CT_DISPLAYTEXT` → append a line to the scene
- `CT_DISPLAYPICTURE` → set overlay media (image/video path)
- `CT_SETVARIABLE` → set/toggle/add/etc. variables (supports `player.*`, `room.*`, `object.*`, `character.*`, `vars.*`)
- `CT_PAUSEGAME` → marks result as paused (UI can use this later)
- `CT_SPAWN_RANDOM_CITIZEN` → spawns a citizen from the room’s `NPCs` table
- `CT_SPAWN_RANDOM_ENEMY_ENCOUNTER` → spawns an enemy encounter (combat starts after move)
- `CT_TRY_SPICY_EVENT` → increases notoriety based on RNG and room rules
- `CT_*_SET_CUSTOM_PROPERTY(_JS)` → sets CustomProperties on player/room/object/character
  - Persistence note: object CustomProperties persist after the object is committed to `save.objects` (see section 5). Player/room/character CustomProperties are currently treated as in-memory state unless you store your state in `player.Stats.*` or planned-event `rewards.flags`.

---

## 7) Planned events (EventController) template

Planned events are authored in `public/DB/events.json` and are triggered by:
- `enter` / `exit` / `presence` during travel
- `spawn_combat` / `spawn_spicy` / `spawn_citizen` during room entry spawn checks

Template:
```json
{
  "id": "eastside_player_intro_story_01",
  "when": "enter",
  "location": "eastside_lc_001",
  "prob": 100,
  "priority": 100,
  "thread_name": "intro_story_01",
  "repeatable": false,
  "completeOnTrigger": true,
  "suppressCombat": true,
  "rewards": {
    "exp": 5,
    "flags": { "intro_story_01_complete": true }
  },
  "action": "event_01",
  "Actions": [
    { "name": "event_01", "bActive": true, "InputType": "None", "run": "A chill runs down your spine..." }
  ]
}
```

---

## 8) Naming conventions (recommended)

To keep content scalable and searchable:
- Planned event id: `<room>_<target>_<thread>_<nn>` (example: `eastside_player_intro_story_01`)
- Thread name: `<arc_name>_<nn>` (example: `intro_story_01`)
- Action names inside an event: `event_<nn>` (example: `event_01`)
- NPC dialog state var: `player.Stats.dialog_<npc>_step` (example: `player.Stats.dialog_jina_step`)
