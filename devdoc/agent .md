general instructions : # AGENTS.md for Reddit HTML AIF Project (RPG-Enhanced Edition)

## Project Overview
This is an RPG-enhanced version of the Reddit HTML AIF (AI Interactive Framework) project. It builds a modular, responsive HTML/CSS/JS framework inspired by Reddit interfaces but adapted for RPG (Role-Playing Game) elements. Focus on AI-driven dynamic content, such as procedural generation of quests, dialogs, and scenes. Emphasize HTML-based best practices for games: lightweight, browser-native, no heavy libraries unless necessary.

## Key Constraints
- **Do not change working code**: Only edit or add to files if explicitly required for new features. Preserve existing functionality.
- **Avoid bloating**: Keep code minimal, reusable, and efficient. No unnecessary dependencies or redundant logic. Favor atomic components over monolithic structures.
- **Read before acting**: Always read existing project files (e.g., via read_file tool) and devdocs (e.g., MDN Web Docs for HTML/JS best practices) for guidance. Search codebase first for reusable elements.

## RPG HTML Best Practices
- **JSON Files for Data Models**: Use JSON files (e.g., data/game-system.json) to define game systems, entities, and states. Dynamically initialize and define elements from these (e.g., load JSON to populate UI components at runtime).
  - Example structure: { "quests": [{ "id": "quest1", "title": "Epic Journey", "flags": { "completed": false } }], "characters": [...] }
- **Atomic HTML Components Design**: Break down UI into small, reusable HTML elements (e.g., <quest-card>, <dialog-box>). Use custom elements or templates for modularity. Ensure semantic HTML with ARIA for accessibility.
- **Procedural Functions**: Implement basic actions (e.g., move, interact) as pure JS functions. For custom action choices:
  - Create menus as <ul> or <select> with event listeners.
  - On click/choice: Trigger custom procedural functions (e.g., updateScene(choiceId)) that handle logic like flag updates, state changes.
- **Dialog/Media Scenes Module**: Build a module (e.g., scripts/dialog-scenes.js) for handling dialogs and media.
  - Use flag variables (e.g., global or sessionStorage flags like gameFlags.completedQuest = true) to update states.
  - Dynamically render scenes: Load JSON data to generate HTML for dialogs, embed media (images/audio via <img>/<audio>).
  - Example: function updateDialog(choice) { /* Update flags, render new scene HTML */ }

## Tool and Workflow Guidance
- Follow OpenAI Codex devdocs: Prioritize autonomy, parallelism in tools, and code quality as per the Codex Prompting Guide.
- Iteration: Update plans with statuses; deliver verifiable code.
- Frontend: Bold UIs with animations, responsive design. Integrate AI placeholders for dynamic RPG elements (e.g., AI-generated quest text).

This AGENTS.md overrides general instructions where conflicting. Merge with any parent AGENTS.md

Specific instruction ## Project Overview
This is an RPG-enhanced version of the Reddit HTML AIF (AI Interactive Framework) project. It builds a modular, responsive HTML/CSS/JS framework inspired by Reddit interfaces but adapted for RPG (Role-Playing Game) elements. Focus on AI-driven dynamic content, such as procedural generation of quests, dialogs, and scenes. Emphasize HTML-based best practices for games: lightweight, browser-native, no heavy libraries unless necessary.

## Key Constraints
- **Do not change working code**: Only edit or add to files if explicitly required for new features. Preserve existing functionality.
- **Avoid bloating**: Keep code minimal, reusable, and efficient. No unnecessary dependencies or redundant logic. Favor atomic components over monolithic structures.
- **Read before acting**: Always read existing project files (e.g., via read_file tool) and devdocs (e.g., MDN Web Docs for HTML/JS best practices) for guidance. Search codebase first for reusable elements.

## RPG HTML Best Practices
- **JSON Files for Data Models**: Use JSON files (e.g., data/game-system.json) to define game systems, entities, and states. Dynamically initialize and define elements from these (e.g., load JSON to populate UI components at runtime).
  - Example structure: { "quests": [{ "id": "quest1", "title": "Epic Journey", "flags": { "completed": false } }], "characters": [...] }
- **Atomic HTML Components Design**: Break down UI into small, reusable HTML elements (e.g., <quest-card>, <dialog-box>). Use custom elements or templates for modularity. Ensure semantic HTML with ARIA for accessibility.
- **Procedural Functions**: Implement basic actions (e.g., move, interact) as pure JS functions. For custom action choices:
  - Create menus as <ul> or <select> with event listeners.
  - On click/choice: Trigger custom procedural functions (e.g., updateScene(choiceId)) that handle logic like flag updates, state changes.
- **Dialog/Media Scenes Module**: Build a module (e.g., scripts/dialog-scenes.js) for handling dialogs and media.
  - Use flag variables (e.g., global or sessionStorage flags like gameFlags.completedQuest = true) to update states.
  - Dynamically render scenes: Load JSON data to generate HTML for dialogs, embed media (images/audio via <img>/<audio>).
  - Example: function updateDialog(choice) { /* Update flags, render new scene HTML */ }

## Tool and Workflow Guidance
- Follow OpenAI Codex devdocs: Prioritize autonomy, parallelism in tools, and code quality as per the Codex Prompting Guide.
- Iteration: Update plans with statuses; deliver verifiable code.
- Frontend: Bold UIs with animations, responsive design. Integrate AI placeholders for dynamic RPG elements (e.g., AI-generated quest text).

This AGENTS.md overrides general instructions where conflicting. Merge with any parent AGENTS.md.

You do not change or harm existing code unless explicitly instructed to do so. You only add or edit code when explicitly required for new features. You always preserve existing functionality. You always keep code minimal, reusable, and efficient. You never add unnecessary dependencies or redundant logic. You always favor atomic components over monolithic structures. You always read existing project files (e.g., via read_file tool) and devdocs (e.g., MDN Web Docs for HTML/JS best practices) for guidance. You always search codebase first for reusable elements. 
You always test, verify, and validate code before delivering.You not halucinate done missions, if it is not actual tested code. You following prompt. If complains about loss of content, funtcionality features,you deliver code that worked previously.
you do not add or change any of text in the codebase,you only add new features or edit existing features or fix bugs. You do not skip any steps or parts of the prompt.If file is big you should report and aproach to chunking into smaller files.youdo not writing characters wording or add descriptions