# Command and Naming Reference

**Scope**
This document defines canonical naming, the command/check schemas, and the full command inventory for the current engine (`src/events/EventEngine.js`). It also lists legacy command types observed in the original RAGS/regalia sources that are not implemented in the current engine.

**Canonical Event Triggers**
- `<<On Player Enter First Time>>`
- `<<On Player Enter>>`
- `<<On Player Leave First Time>>`
- `<<On Player Leave>>`
- `<<On Character Enter>>`
- `<<On Character Leave>>`
- `<<On Each Turn>>`

**Naming Conventions**
- Use the canonical trigger names exactly. Do not use “Visit” triggers.
- Actions are matched by `name` or `overridename`.
- Timers use `TT_` types only (`TT_RUNALWAYS`, `TT_LENGTH`).

**Interaction Rules**
- Clicking a character or object selects it, shows description/media, and renders its available actions from `Actions`.
- Clicking an action executes immediately and collapses the menu.
- Custom choice menus render immediately; each choice executes immediately.

**Command Runner (Pause/Resume)**
- Action command lists are executed by a pausable runner.
- `CT_PAUSEGAME` stops execution and shows a Continue prompt.
- On Continue, the runner resumes from the next command.
- If `CT_TRIGGER_SCENE` starts a scene, the action runner yields to the scene runner.

**Custom Actions and Custom Menus**
- An action with `InputType: "Custom"` uses `CustomChoiceTitle` + `CustomChoices` to render a menu.
- You can add/remove choices at runtime with `CT_ACTION_ADD_CUSTOMCHOICE`, `CT_ACTION_REMOVE_CUSTOMCHOICE`, and clear with `CT_CLEAR_CUSTOM_CHOICES`.
- Target menus are identified by `CommandPart2` (examples: `Chr:Vadar:Ask`, `Obj:Com Unit:Objectives`).

Example custom action:
```json
{
  "name": "Ask",
  "bActive": true,
  "InputType": "Custom",
  "CustomChoiceTitle": "Ask about what?",
  "CustomChoices": ["Heist?", "Dr. Burkle Lab?"],
  "PassCommands": []
}
```

Add a choice to an action menu:
```json
{ "cmdtype": "CT_ACTION_ADD_CUSTOMCHOICE", "CommandPart2": "Chr:Vadar:Ask", "CommandText": "Heist?" }
```

Remove a choice from an action menu:
```json
{ "cmdtype": "CT_ACTION_REMOVE_CUSTOMCHOICE", "CommandPart2": "Chr:Vadar:Ask", "CommandText": "Heist?" }
```

Clear all choices for a menu:
```json
{ "cmdtype": "CT_CLEAR_CUSTOM_CHOICES", "CommandPart2": "Chr:Vadar:Ask" }
```

**Action Schema (JSON)**
```json
{
  "name": "<<On Player Enter First Time>>",
  "bActive": true,
  "InputType": "None",
  "Conditions": [
    {
      "conditionname": "example",
      "Checks": [
        {
          "CondType": "CT_Variable_Comparison",
          "CkType": "CT_Uninitialized",
          "ConditionStep2": "player.Stats.some_flag",
          "ConditionStep3": "Equals",
          "ConditionStep4": "1"
        }
      ],
      "PassCommands": [
        { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "Hello" }
      ],
      "FailCommands": []
    }
  ],
  "PassCommands": [
    { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "Room intro" }
  ],
  "FailCommands": []
}
```

**Command Schema (JSON)**
```json
{
  "cmdtype": "CT_DISPLAYTEXT",
  "CommandText": "Hello world",
  "CommandPart2": "",
  "CommandPart3": "",
  "CommandPart4": ""
}
```

**Command Part Mapping (Engine)**
- `CommandText` maps to `text`
- `CommandPart2` maps to `part2`
- `CommandPart3` maps to `part3`
- `CommandPart4` maps to `part4`

**Condition Schema (JSON)**
```json
{
  "conditionname": "example",
  "Checks": [
    {
      "CondType": "CT_Variable_Comparison",
      "CkType": "CT_Uninitialized",
      "ConditionStep2": "player.Stats.some_flag",
      "ConditionStep3": "Equals",
      "ConditionStep4": "1"
    },
    {
      "CondType": "CT_Input_Comparison",
      "CkType": "And",
      "ConditionStep2": "",
      "ConditionStep3": "Equals",
      "ConditionStep4": "Yes"
    }
  ],
  "PassCommands": [
    { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "Passed" }
  ],
  "FailCommands": [
    { "cmdtype": "CT_DISPLAYTEXT", "CommandText": "Failed" }
  ]
}
```

**Checks (CondType) Examples**
`CT_Variable_Comparison`
```json
{ "CondType": "CT_Variable_Comparison", "ConditionStep2": "player.Stats.quest_stage", "ConditionStep3": "Equals", "ConditionStep4": "2" }
```

`CT_Variable`
```json
{ "CondType": "CT_Variable", "ConditionStep2": "player.Stats.has_key", "ConditionStep3": "Equals", "ConditionStep4": "true" }
```

`CT_Input_Comparison` and `CT_INPUT_COMPARISON`
```json
{ "CondType": "CT_Input_Comparison", "ConditionStep3": "Contains", "ConditionStep4": "yes" }
```

`CT_Input`
```json
{ "CondType": "CT_Input", "ConditionStep3": "Equals", "ConditionStep4": "ready" }
```

`CT_RandomChance`, `CT_Random_Chance`, `CT_RANDOM_CHANCE`, `CT_D100_CHANCE`
```json
{ "CondType": "CT_RandomChance", "ConditionStep2": "25" }
```

`CT_ObjectState`
```json
{ "CondType": "CT_ObjectState", "ConditionStep2": "<Self>", "ConditionStep3": "bVisible", "ConditionStep4": "true" }
```

`CT_CharacterState`
```json
{ "CondType": "CT_CharacterState", "ConditionStep2": "Dr. Evil", "ConditionStep3": "bEnterFirstTime", "ConditionStep4": "true" }
```

`CT_AdditionalDataCheck`
```json
{ "CondType": "CT_AdditionalDataCheck", "ConditionStep2": "Heist?" }
```

`CT_Character_In_Room`
```json
{ "CondType": "CT_Character_In_Room", "ConditionStep2": "Katie", "ConditionStep3": "<CurrentRoom>" }
```

`CT_Uninitialized`
```json
{ "CondType": "CT_Uninitialized" }
```

`CT_Loop_While`
```json
{
  "conditionname": "loop",
  "Checks": [
    { "CondType": "CT_Loop_While", "ConditionStep2": "player.Stats.counter", "ConditionStep3": "Less Than", "ConditionStep4": "3" }
  ],
  "PassCommands": [
    { "cmdtype": "CT_SETVARIABLE", "CommandPart2": "player.Stats.counter", "CommandPart3": "Add", "CommandPart4": "1" }
  ],
  "FailCommands": []
}
```

**Supported Commands (Current Engine)**
`CT_DISPLAYTEXT`
```json
{ "cmdtype": "CT_DISPLAYTEXT", "CommandText": "Hello there" }
```

`CT_DISPLAYPICTURE`
```json
{ "cmdtype": "CT_DISPLAYPICTURE", "CommandPart2": "Assets/images/rooms/eviloffice.jpg" }
```

`CT_DISPLAYCHARDESC`
```json
{ "cmdtype": "CT_DISPLAYCHARDESC", "CommandPart2": "Dr. Evil" }
```

`CT_SETVARIABLEBYINPUT`
```json
{ "cmdtype": "CT_SETVARIABLEBYINPUT", "CommandPart3": "player.Stats.answer" }
```

`CT_SETVARIABLE_NUMERIC_BYINPUT`
```json
{ "cmdtype": "CT_SETVARIABLE_NUMERIC_BYINPUT", "CommandPart3": "player.Stats.points" }
```

`CT_SET_VARIABLE_BY_INPUT`
```json
{ "cmdtype": "CT_SET_VARIABLE_BY_INPUT", "CommandPart3": "player.Stats.answer" }
```

`CT_SETVARIABLE`
```json
{ "cmdtype": "CT_SETVARIABLE", "CommandPart2": "player.Stats.prologue_done", "CommandPart3": "Equals", "CommandPart4": "1" }
```

`CT_MODIFYVALUE`
```json
{ "cmdtype": "CT_MODIFYVALUE", "CommandPart2": "player.Stats.exp", "CommandPart4": "200" }
```

`CT_ADDTOARRAY`
```json
{ "cmdtype": "CT_ADDTOARRAY", "CommandPart2": "player.Stats.completedScenes", "CommandPart4": "scene_id_here" }
```

`CT_OPENSHOP`
```json
{ "cmdtype": "CT_OPENSHOP", "CommandPart2": "Shady Dealer", "CommandPart3": "Weapons" }
```

`CT_PAUSEGAME`
```json
{ "cmdtype": "CT_PAUSEGAME" }
```

`CT_ADVANCE_TIME`
```json
{ "cmdtype": "CT_ADVANCE_TIME", "CommandPart2": "60" }
```

`CT_EXECUTETIMER` and `CT_EXECUTE_TIMER`
```json
{ "cmdtype": "CT_EXECUTETIMER", "CommandPart2": "EnemyAttack" }
```

`CT_SETTIMER` and `CT_SET_TIMER`
```json
{ "cmdtype": "CT_SETTIMER", "CommandPart2": "EnemyAttack", "CommandPart3": "Active" }
```

`CT_START_COMBAT` (alias `CT_STARTCOMBAT`)
```json
{ "cmdtype": "CT_START_COMBAT", "CommandPart2": "Boss001" }
```

`CT_SET_CHARACTER_ROOM`
```json
{ "cmdtype": "CT_SET_CHARACTER_ROOM", "CommandPart2": "Katie", "CommandPart4": "room_id_here" }
```

`CT_SETCHARACTION` and `CT_SET_CHARACTER_ACTION`
```json
{ "cmdtype": "CT_SETCHARACTION", "CommandPart2": "Dr. Evil", "CommandPart3": "Talk-Active" }
```

`CT_SETROOMACTION` and `CT_SET_ROOM_ACTION`
```json
{ "cmdtype": "CT_SETROOMACTION", "CommandPart2": "room_id_here", "CommandPart3": "Examine Room-Active" }
```

`CT_SETEXIT` and `CT_SET_EXIT`
```json
{ "cmdtype": "CT_SETEXIT", "CommandPart2": "East", "CommandPart3": "East-Active-To:Lab" }
```

`CT_MOVEPLAYER` and `CT_MOVE_PLAYER`
```json
{ "cmdtype": "CT_MOVEPLAYER", "CommandPart2": "room_id_here" }
```

`CT_MOVECHAR` and `CT_MOVE_CHAR`
```json
{ "cmdtype": "CT_MOVECHAR", "CommandPart2": "Katie", "CommandPart3": "room_id_here" }
```

`CT_MOVEITEMTOCHAR` and `CT_MOVE_ITEM_TO_CHAR`
```json
{ "cmdtype": "CT_MOVEITEMTOCHAR", "CommandPart2": "item_id_here", "CommandPart3": "Katie" }
```

`CT_MOVEITEMTOROOM` and `CT_MOVE_ITEM_TO_ROOM`
```json
{ "cmdtype": "CT_MOVEITEMTOROOM", "CommandPart2": "item_id_here", "CommandPart3": "room_id_here" }
```

`CT_TRIGGER_SCENE`
```json
{ "cmdtype": "CT_TRIGGER_SCENE", "CommandPart2": "scene_id_here" }
```

`CT_ACTION_ADD_CUSTOMCHOICE`
```json
{ "cmdtype": "CT_ACTION_ADD_CUSTOMCHOICE", "CommandPart2": "Chr:Vadar:Ask", "CommandText": "Heist?" }
```

`CT_ACTION_REMOVE_CUSTOMCHOICE`
```json
{ "cmdtype": "CT_ACTION_REMOVE_CUSTOMCHOICE", "CommandPart2": "Chr:Vadar:Ask", "CommandText": "Heist?" }
```

`CT_ADD_CUSTOM_CHOICE`
```json
{ "cmdtype": "CT_ADD_CUSTOM_CHOICE", "CommandPart2": "Ask", "CommandText": "Heist?" }
```

`CT_CLEAR_CUSTOM_CHOICES`
```json
{ "cmdtype": "CT_CLEAR_CUSTOM_CHOICES", "CommandPart2": "Ask" }
```

`CT_SPAWN_RANDOM_CITIZEN`
```json
{ "cmdtype": "CT_SPAWN_RANDOM_CITIZEN" }
```

`CT_TRY_SPAWN_EXTRA_CITIZEN`
```json
{ "cmdtype": "CT_TRY_SPAWN_EXTRA_CITIZEN" }
```

`CT_SPAWN_RANDOM_ENEMY_ENCOUNTER`
```json
{ "cmdtype": "CT_SPAWN_RANDOM_ENEMY_ENCOUNTER" }
```

`CT_TRY_SPICY_EVENT`
```json
{ "cmdtype": "CT_TRY_SPICY_EVENT" }
```

`CT_TRY_WITNESS_EVENT`
```json
{ "cmdtype": "CT_TRY_WITNESS_EVENT" }
```

`CT_PLAYER_SET_CUSTOM_PROPERTY` and `CT_PLAYER_SET_CUSTOM_PROPERTY_JS`
```json
{ "cmdtype": "CT_PLAYER_SET_CUSTOM_PROPERTY", "CommandPart2": "mood", "CommandPart4": "angry" }
```

`CT_ROOM_SET_CUSTOM_PROPERTY` and `CT_ROOM_SET_CUSTOM_PROPERTY_JS`
```json
{ "cmdtype": "CT_ROOM_SET_CUSTOM_PROPERTY", "CommandPart2": "alarm", "CommandPart4": "true" }
```

`CT_ITEM_SET_CUSTOM_PROPERTY` and `CT_ITEM_SET_CUSTOM_PROPERTY_JS`
```json
{ "cmdtype": "CT_ITEM_SET_CUSTOM_PROPERTY", "CommandPart2": "bVisible", "CommandPart4": "false" }
```

`CT_CHAR_SET_CUSTOM_PROPERTY` and `CT_CHAR_SET_CUSTOM_PROPERTY_JS`
```json
{ "cmdtype": "CT_CHAR_SET_CUSTOM_PROPERTY", "CommandPart2": "isMindreadable", "CommandPart4": "true" }
```

**Timer Types (TT_)**
`TT_RUNALWAYS`
```json
{ "TType": "TT_RUNALWAYS", "Active": true }
```

`TT_LENGTH`
```json
{ "TType": "TT_LENGTH", "Active": true, "Length": 3 }
```

**Legacy Commands Observed (Not Implemented in Current Engine)**
- `CT_DISPLAYIMAGE`
- `CT_DISPLAYROOMPICTURE`
- `CT_DISPLAYROOMDESCRIPTION`
- `CT_DISPLAYPLAYERDESC`
- `CT_DISPLAYITEMDESC`
- `CT_DISPLAYLAYEREDPICTURE`
- `CT_ENDGAME`
- `CT_RESETTIMER`
- `CT_ACTION_CLEAR_CUSTOMCHOICE`
- `CT_SETPLAYERACTION`
- `CT_SETPLAYERPORTRAIT`
- `CT_SETROOMPIC`
- `CT_SETROOMDESCRIPTION`
- `CT_SETEXITDESTINATION`
- `CT_SETOPENCLOSED`
- `CT_SETLOCKEDUNLOCKED`
- `CT_SETOBJECTACTION`
- `CT_SETITEMDESC`
- `CT_SETITEMTOWORN`
- `CT_SETPLAYERNAME`
- `CT_SETPLAYERGENDER`
- `CT_SETPLAYERDESC`
- `CT_SETCHARDESC`
- `CT_CHAR_SET_NAME`
- `CT_CHAR_SET_GENDER`
- `CT_CHAR_SETPORT`
- `CT_CHAR_DISPLAYPORT`
- `CT_ITEM_SET_NAME_OVERRIDE`
- `CT_ITEM_SET_VISIBILITY`
- `CT_MOVEITEMTOINV`
- `CT_MOVEITEMTOOBJ`
- `CT_MOVEINVENTORYTOCHAR`
- `CT_MOVEINVENTORYTOROOM`
- `CT_ROOM_MOVE_ITEMS_TO_PLAYER`
- `CT_MOVETOCHAR`
- `CT_MOVETOOBJ`
- `CT_CANCELMOVE`
- `CT_EXPORTVARIABLE`
- `CT_IMPORTVARIABLE`
- `CT_VARIABLE_SET_RANDOMLY`
- `CT_VARIABLE_SET_WITH_VARIABLE`
- `CT_VARIABLE_SET_WITH_PLAYERPROPERTYVALUE`
- `CT_VARIABLE_SET_WITH_CHARPROPERTYVALUE`
- `CT_VARIABLE_SET_WITH_ROOMPROPERTYVALUE`
- `CT_VARIABLE_SET_WITH_ITEMPROPERTYVALUE`
- `CT_VARIABLE_SET_WITH_TIMERPROPERTYVALUE`
- `CT_VARIABLE_SET_WITH_VARIABLEPROPERTYVALUE`
- `CT_VARIABLE_SET_JAVASCRIPT`
- `CT_TIMER_SET_CUSTOM_PROPERTY`
- `CT_TIMER_SET_CUSTOM_PROPERTY_JS`
- `CT_MM_SET_BACKGROUND_MUSIC`
- `CT_MM_STOP_BACKGROUND_MUSIC`
- `CT_MM_PLAY_SOUNDEFFECT`
- `CT_MM_SET_MAIN_COMPASS`
- `CT_MM_SET_UD_COMPASS`
- `CT_LAYEREDIMAGE_ADD`
- `CT_LAYEREDIMAGE_REMOVE`
- `CT_LAYEREDIMAGE_REPLACE`
- `CT_LAYEREDIMAGE_CLEAR`
- `CT_ITEM_LAYERED_WEAR`
- `CT_ITEM_LAYERED_REMOVE`
- `CT_ITEMS_MOVE_CONTAINER_TO_CONTAINER`

**Legacy Check Types Observed (Not Implemented in Current Engine)**
- `CT_Player_In_Room`
- `CT_Player_In_RoomGroup`
- `CT_Player_In_Same_Room_As`
- `CT_Player_Moving`
- `CT_Character_In_RoomGroup`
- `CT_Item_In_Room`
- `CT_Item_In_RoomGroup`
- `CT_Item_In_Object`
- `CT_Item_Held_By_Player`
- `CT_Item_Not_Held_By_Player`
- `CT_Item_Held_By_Character`
- `CT_Item_State_Check`
- `CT_Variable_To_Variable_Comparison`
- `CT_Player_CustomPropertyCheck`
- `CT_Character_CustomPropertyCheck`
- `CT_Item_CustomPropertyCheck`
- `CT_Room_CustomPropertyCheck`
- `CT_Timer_CustomPropertyCheck`
- `CT_MultiMedia_InGroup`
- `CT_Loop_Items`
- `CT_Loop_Rooms`
- `CT_Loop_Characters`
- `CT_Loop_Item_Room`
- `CT_Loop_Item_Inventory`
- `CT_Loop_Item_Group`
- `CT_Loop_Item_Container`
- `CT_Loop_Item_Char_Inventory`
- `CT_Loop_Exits`

**Legacy Command Example Template**
```json
{ "cmdtype": "CT_DISPLAYROOMPICTURE", "CommandPart2": "Assets/images/rooms/office.jpg" }
```
