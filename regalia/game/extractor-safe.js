const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Path to Game.js
const GAME_JS_PATH = path.join(__dirname, 'Game.js');
// Output directory (main project folder)
const OUTPUT_DIR = path.resolve(__dirname, '../../');

// Variable names and their output files
const VAR_TO_FILE = {
  imagedata: 'images.json',
  roomdata: 'rooms.json',
  playerdata: 'player.json',
  variabledata: 'variables.json',
  timerdata: 'timers.json',
  statusbardata: 'statusbar.json',
  layeredclothingdata: 'layeredclothing.json',
  charactersdata: 'characters.json',
  objectsdata: 'objects.json',
};

// Read the entire Game.js file
const content = fs.readFileSync(GAME_JS_PATH, 'utf8');


// Helper to extract full var assignment (multiline, robust)
function extractVarAssignment(varName, text) {
  // Find the start of the assignment
  const startRegex = new RegExp(`(var|let|const)\\s+${varName}\\s*=\\s*\\[`, 'm');
  const startMatch = text.match(startRegex);
  if (!startMatch) return null;
  const startIdx = text.indexOf(startMatch[0]);
  if (startIdx === -1) return null;
  // Find the closing ]; for the array (robust for nested brackets)
  let openBrackets = 0;
  let endIdx = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '[') openBrackets++;
    if (text[i] === ']') openBrackets--;
    if (openBrackets === 0 && text[i] === ']') {
      // Look ahead for the semicolon
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === ';') {
        endIdx = j + 1;
        break;
      }
    }
  }
  if (endIdx === -1) return null;
  const assignment = text.slice(startIdx, endIdx);
  return assignment;
}

const sandbox = {};
for (const key of Object.keys(VAR_TO_FILE)) {
  sandbox[key] = undefined;
}

try {
  let foundAny = false;
  for (const key of Object.keys(VAR_TO_FILE)) {
    const assignment = extractVarAssignment(key, content);
    if (assignment) {
      vm.createContext(sandbox);
      vm.runInContext(assignment, sandbox);
      const outPath = path.join(OUTPUT_DIR, VAR_TO_FILE[key]);
      fs.writeFileSync(outPath, JSON.stringify(sandbox[key], null, 2), 'utf8');
      console.log(`Extracted ${key} to ${outPath}`);
      foundAny = true;
    } else {
      console.log(`Could not find assignment for ${key}`);
    }
  }
  if (!foundAny) {
    console.log('No matching variable assignments found.');
  }
} catch (e) {
  console.error('Extraction error:', e.message);
}