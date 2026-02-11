# EVIL Incorporated — Prologue Gap Report (Spec vs Current Implementation)

**Source of truth for the prologue script:** `devdoc/Evil Incorporated prologue.txt`

This report compares the prologue spec to what currently exists in `public/DB` + `src/` and lists what’s missing / misaligned, with a prioritized TODO.

---

## 1) What the prologue spec requires (high level)

From `devdoc/Evil Incorporated prologue.txt`, the prologue is a long, gated “tutorial arc” that:

1. Starts at **Evil Incorporated Front**, forces the player to use the **Duffel Bag** (wallet + equipment), and restricts player abilities to **Examine** + **Wait**.
2. Moves through **Reception (Penny)** → **Elevator (only 50th allowed)** → **Dr. Evil office** → **Desk test**.
3. After passing the test, awards **EXP +70** (`devdoc/Evil Incorporated prologue.txt:315`) and enables an **Ask** menu.
4. Runs Dr. Evil’s **Ask** flow (ring + briefing), including a **Vibranium Ring** that unlocks abilities and triggers a first-time level-up moment (`devdoc/Evil Incorporated prologue.txt:329`, `devdoc/Evil Incorporated prologue.txt:365`, `devdoc/Evil Incorporated prologue.txt:551`).
5. Jumps to **“Two weeks later”** and places the player into a **company apartment** with a **bed/sleep** loop (`devdoc/Evil Incorporated prologue.txt:421`).
6. Returns to E.I. and runs the **B1 Security Center** arc (Penny updates, Vadar intro, security badge, lab access gating) (`devdoc/Evil Incorporated prologue.txt:427`, `devdoc/Evil Incorporated prologue.txt:718`).
7. Runs **34th floor lab** content (objects + NPCs + objectives) and then **Yes Man → hospital** sequence with healing (`devdoc/Evil Incorporated prologue.txt:904`, `devdoc/Evil Incorporated prologue.txt:916`).
8. Ends by moving the player to **Road 22** and only then declaring the prologue complete (`devdoc/Evil Incorporated prologue.txt:972`).

---

## 2) What exists today (implementation snapshot)

### Start variants (implemented)
- **“Play Intro (Prologue)”** starts at `evilincfront_lc_001` with `Abilities: [Examine, Wait]` and `Credits: 0` in `src/web/GameUI.jsx:204`.
- **“Skip Intro (Start at East Side)”** starts at `eastside_lc_001` and sets prologue flags “as if completed” (same function).

### Rooms / scenes currently used for the prologue
- `public/DB/rooms/evil_inc/evilincfront_lc_001.json`
- `public/DB/rooms/evil_inc/evilreception_lc_001.json`
- `public/DB/rooms/evil_inc/evilelevator_lc_001.json`
- `public/DB/rooms/evil_inc/evilinc50thfloor_lc_001.json`
- `public/DB/rooms/evil_inc/drevilscommandcenter_lc_001.json`
- `public/DB/scenes/evilreception_penny_001_sequence.json`
- `public/DB/scenes/drevilscommandcenter_drevil_001_sequence.json`
- `public/DB/scenes/drevilscommandcenter_drevil_002_sequence.json`
- `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json`
- Test desk object: `public/DB/objects/game_items/old_school_desk_001.json`

---

## 3) Gaps / mismatches (what’s missing vs the spec)

### A) Prologue ends far too early (major blocker)
- **Current behavior:** `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:99` stage `ready_01` sets:
  - `player.Stats.prologue_complete = true` (`public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:105`)
  - `player.CurrentRoom = "road22_lc_001"` (`public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:111`)
  - and ends the scene.
- **Spec behavior:** Road 22 is reached at the *end* of the prologue after the apartment arc + B1 security arc + lab arc + hospital arc (`devdoc/Evil Incorporated prologue.txt:972`).

### B) Missing “Two weeks later” apartment arc
Spec requires:
- A company apartment room with bed/sleep instructions and navigation to hallway/lobby (`devdoc/Evil Incorporated prologue.txt:421`, `devdoc/Evil Incorporated prologue.txt:437`).

Current state:
- No dedicated “company apartment” rooms/bed object exist in `public/DB/rooms/evil_inc/` or elsewhere that matches this flow.

### C) B1 Security Center arc is not implemented
Spec requires:
- Returning to reception with updated Penny lines about meeting in **B1 Security Center** (`devdoc/Evil Incorporated prologue.txt:508`).
- A full **Vadar/security-badge** chain, including gating lab access on a badge (`devdoc/Evil Incorporated prologue.txt:542`, `devdoc/Evil Incorporated prologue.txt:702`, `devdoc/Evil Incorporated prologue.txt:718`).

Current state:
- `public/DB/rooms/evil_inc/evilincsecuritylevel_lc_001.json` exists but is just a stub (no offices, NPCs, badge flow).
- No `vadar_...` character exists under `public/DB/characters/`.

### D) 34th floor lab content is mostly missing
Spec requires:
- Objectives around labs / finding specific labs (`devdoc/Evil Incorporated prologue.txt:493`).
- Multiple lab objects with action menus (lab computer, containment field, giant laser, etc) (`devdoc/Evil Incorporated prologue.txt:867` and onward).
- NPCs like Dr. Winifred Burkle / Dr. Pam Isley (by name in the script).

Current state:
- `public/DB/rooms/evil_inc/evilinc34thfloor_lc_001.json` exists but has no lab sub-rooms, no lab objects, and no matching NPCs.
- No Winifred Burkle / Pam Isley characters exist in `public/DB/characters/`.

### E) Yes Man → hospital chain is missing / inconsistent
Spec requires:
- “Yes Man” appears on first leave of the lab floor and escorts player to hospital (`devdoc/Evil Incorporated prologue.txt:904`, `devdoc/Evil Incorporated prologue.txt:924`).
- A dedicated doctor “Dr. Aaron Hart” with Heal action and telepathy line (`devdoc/Evil Incorporated prologue.txt:916`, `devdoc/Evil Incorporated prologue.txt:946`, `devdoc/Evil Incorporated prologue.txt:959`).

Current state:
- The DB has `public/DB/rooms/city/liberty_general_hospital/libertygeneralhospital_lc_001.json`, but:
  - It has no scripted prologue events, no Dr. Aaron Hart, and no Yes Man escort.
  - Its exit points to `"Road 22"` by name, not `road22_lc_001` (`public/DB/rooms/city/liberty_general_hospital/libertygeneralhospital_lc_001.json:9`), which is inconsistent with most other rooms.
- There is a `yes_man_001` character, but it currently lives under `public/DB/characters/enemies/yes_man_001.json` (not aligned with spec’s “friendly robot” role).

### F) Telepathy / “abilities unlocked by ring” flow is not implemented
Spec requires:
- After ring equip, player can use abilities and do mind reading with a continue-button style result (`devdoc/Evil Incorporated prologue.txt:365`, plus multiple later telepathy examples).

Current state:
- Prologue start variant explicitly limits Abilities to `[Examine, Wait]` (`src/web/GameUI.jsx:204`).
- Even if Telepathy is later re-enabled, many important prologue NPCs don’t currently define a `Telepathy` action (so the ability would not produce the script’s thought-text content).

### G) Elevator gating does not match the spec
Spec requires:
- Early on: elevator is locked / only floor 50 is allowed (`devdoc/Evil Incorporated prologue.txt:22` onward).

Current state:
- `public/DB/rooms/evil_inc/evilelevator_lc_001.json` exposes 1st/50th/34th/B1 unconditionally.

### H) Reception copy is out of sync with “no security officer”
- Spec mentions a security officer early, but you requested “only Penny in reception.”
- Current room text still says there is “some sort of security officer standing next to the door” (`public/DB/rooms/evil_inc/evilreception_lc_001.json:25`), while the officer is not actually present.

### I) Penny scene is simplified vs spec (media + beats missing)
Spec includes:
- Multiple picture changes (including close-up glowing eyes) and additional beats (`devdoc/Evil Incorporated prologue.txt:47`).

Current scene:
- `public/DB/scenes/evilreception_penny_001_sequence.json` has 3 stages, uses room media only, and omits the close-up glowing-eyes picture beats.

### J) Dr. Evil Ask / ring / briefing flow is incomplete
Spec requires:
- Ask menu options disappear as completed (`devdoc/Evil Incorporated prologue.txt:329`, `devdoc/Evil Incorporated prologue.txt:400`).
- Ring award + on-equip “abilities unlocked” moment + first-time level-up UX (`devdoc/Evil Incorporated prologue.txt:365`, `devdoc/Evil Incorporated prologue.txt:375`).
- A **multi-stage** “Primary Targets” + AEON plan briefing sequence (with bios) (`devdoc/Evil Incorporated prologue.txt:551`, `devdoc/Evil Incorporated prologue.txt:569`).

Current state:
- The ask shell exists in `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:19`, and it spawns the ring in `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:64`.
- The “Why go after the Justice Force?” branch is currently a short text stub at `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:84` (missing the big briefing + targets + bios).
- Prologue-start still locks the ability list to `[Examine, Wait]` (`src/web/GameUI.jsx:204`), so the ring cannot actually “unlock Telepathy” unless we restore abilities after the ring step.

### K) Mind reading (Telepathy) still needs a real implementation
Spec uses a consistent mind-reading UX:
- thought text shown as `<...>` and styled differently (“player thinking”)
- some mind reads show a “Who?” list and require a continue (`devdoc/Evil Incorporated prologue.txt:654`).

Current state:
- There is no prologue-complete mind-reading flow (actions + UI formatting + per-character thought content). The reference script for this is also captured in `devdoc/mind read people.txt`.

### L) Incremental unlock (actions, rooms, sublocations) is incomplete
Spec expects staged unlocking of:
- elevator floors / navigation (`devdoc/Evil Incorporated prologue.txt:75`)
- badge-gated sublocations / “show me my lab” gating (`devdoc/Evil Incorporated prologue.txt:696`, `devdoc/Evil Incorporated prologue.txt:702`, `devdoc/Evil Incorporated prologue.txt:718`).

Current state:
- A few gates exist (e.g., reception east exit, desk visibility), but most staged unlocks are not wired yet (elevator floor gating, badge gating, Mini Me/Vadar options).

---

## 4) TODO list (prioritized)

### P0 — Must-fix to finish the prologue
1. **Stop ending the prologue early**
   - Change `ready_01` in `public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json` so it does *not* set `prologue_complete` and does *not* jump to `road22_lc_001` yet.
2. **Implement the “Two weeks later” apartment segment**
   - Add required rooms + bed object + sleep action + transitions per `devdoc/Evil Incorporated prologue.txt:421`.
3. **Build B1 Security Center content**
   - Create Vadar (NPC), his office, badge item, and gating logic described around `devdoc/Evil Incorporated prologue.txt:542` and `devdoc/Evil Incorporated prologue.txt:718`.
4. **Build the 34th floor lab segment**
   - Add lab hallway / sub-rooms, objectives, lab objects with action menus, and missing NPCs (Winifred Burkle, Pam Isley, etc).
5. **Implement Yes Man → hospital → heal chain**
   - Add Yes Man as a friendly NPC for this arc, add Dr. Aaron Hart, and match the “first leave lab → escort → heal → end prologue” flow (`devdoc/Evil Incorporated prologue.txt:904` → `devdoc/Evil Incorporated prologue.txt:972`).
6. **Only at the true end:** set `player.Stats.prologue_complete = true` and transition to `road22_lc_001`.

### P1 - Core prologue mechanics the script depends on
1. **Ring unlocks abilities**
   - On ring equip, restore/unlock abilities beyond Examine/Wait (at minimum Telepathy) and match the prologue’s first-time level-up UX + “animations yes/no” prompt (`devdoc/Evil Incorporated prologue.txt:365`, `devdoc/Evil Incorporated prologue.txt:375`).
2. **Telepathy content on prologue NPCs**
   - Add `Telepathy` actions to Penny / Dr. Evil / Vadar / Yes Man / Dr. Aaron Hart with the exact thought-text content from the script.
3. **Elevator restriction rules**
   - Gate elevator floor exits by prologue flags so the player can't access floors early.
4. **Primary Targets / AEON briefing sequence**
   - Implement the multi-stage security-center briefing (targets + bios + mission plan) beginning around `devdoc/Evil Incorporated prologue.txt:551`.
5. **Incremental unlock scaffolding**
   - Add missing `ShowIf`/flag wiring for badge-gated navigation + Mini Me lab escort flow (`devdoc/Evil Incorporated prologue.txt:696`  `devdoc/Evil Incorporated prologue.txt:702`).

### P2 - Polish / fidelity to the spec
1. **Penny "glowing eyes" media beats**
2. **Reception copy cleanup**
   - Remove the “security officer in reception” line if we’re enforcing “Penny only.”
3. **Room exit ID consistency**
   - Normalize exits like `"Road 22"` to `road22_lc_001` where appropriate.

---

## 5) Immediate next step recommendation

Fixing the premature end (`public/DB/scenes/drevilscommandcenter_drevil_ask_001_story.json:99`) is the fastest way to make the prologue actually proceed, then implement the missing arcs in order: apartment → B1 security → 34th labs → hospital → Road 22.
