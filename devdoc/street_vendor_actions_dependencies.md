# Street Vendor Machine Actions Menu Dependencies

This document describes the dependencies and data flow for the Street Vendor machine's actions menu in the game.

## 1. Room Definition
- The room JSON (e.g., `public/DB/rooms.json`) lists objects in its `Objects` array by their `UniqueID`.
- Example:
  ```json
  "Objects": [
    { "UniqueID": "streetvendor_001" }
  ]
  ```

## 2. Object JSON
- The object JSON file (e.g., `public/DB/objects/game_items/street_vendor.json`) must have:
  - A matching `UniqueID` (e.g., `streetvendor_001`)
  - An `ActionsMenu` array with available actions
- Example:
  ```json
  {
    "UniqueID": "streetvendor_001",
    "ActionsMenu": [ ... ]
  }
  ```

## 3. Loader (src/loader.js)
- Loads all object files and builds a map of objects by their `UniqueID`.
- The loader must reference the correct file path and ensure the `UniqueID` matches the room and object JSON.
- The loader creates an `objectSourceMap` for resolving object data by ID.

## 4. Object Source Map
- Used by the editor and game to resolve object data by `UniqueID`.
- Ensures the UI can find the correct object and its actions menu.

## 5. UI Rendering
- The UI uses the `objectSourceMap` and the room's `Objects` array to display the actions menu for the object.
- If the mapping or `UniqueID` is incorrect, the actions menu will not appear.

## 6. Dependencies Summary
- Room JSON: references object by `UniqueID`
- Object JSON: must have matching `UniqueID` and valid `ActionsMenu`
- Loader: must load correct file path and build `objectSourceMap`
- UI: uses `objectSourceMap` and room data to display actions

## 7. Common Issues
- Mismatched `UniqueID` between room and object JSON
- Loader referencing outdated file paths
- Object JSON missing `ActionsMenu`
- UI not finding object in `objectSourceMap`

## 8. How to Fix
- Ensure all references use the correct `UniqueID` and file path
- Update loader fallback lists and hardcoded paths
- Verify object JSON contains a valid `ActionsMenu`
- Confirm UI uses the correct mapping
