import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, 'regalia', 'game', 'Game.js');

const normalize = value => String(value ?? '').trim().toLowerCase();

const raw = fs.readFileSync(sourcePath, 'utf8');
const marker = 'var timerdata=';
const markerIndex = raw.indexOf(marker);
if (markerIndex < 0) {
  console.error('Timer data not found in regalia/game/Game.js');
  process.exit(1);
}

const startIndex = raw.indexOf('[', markerIndex);
if (startIndex < 0) {
  console.error('Timer data array start not found.');
  process.exit(1);
}

let depth = 0;
let inString = false;
let stringChar = '';
let escaped = false;
let endIndex = -1;

for (let i = startIndex; i < raw.length; i += 1) {
  const ch = raw[i];

  if (inString) {
    if (escaped) {
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === stringChar) {
      inString = false;
    }
    continue;
  }

  if (ch === '"' || ch === "'") {
    inString = true;
    stringChar = ch;
    continue;
  }

  if (ch === '[') depth += 1;
  if (ch === ']') {
    depth -= 1;
    if (depth === 0) {
      endIndex = i;
      break;
    }
  }
}

if (endIndex < 0) {
  console.error('Timer data array end not found.');
  process.exit(1);
}

const timerArrayText = raw.slice(startIndex, endIndex + 1);
const timerdata = vm.runInNewContext(timerArrayText);

function enhinputdata() {
  this.BackgroundColor = 'None';
  this.TextColor = 'Black';
  this.TextFont = 'Times New Roman Bold';
  this.Imagename = '';
  this.bUseEnhancedGraphics = true;
  this.bAllowCancel = true;
  this.NewImage = '';
}

function SetupEnhInputData(GameData) {
  const CurData = new enhinputdata();
  CurData.BackgroundColor = GameData[0];
  CurData.TextColor = GameData[1];
  CurData.Imagename = GameData[2];
  CurData.bUseEnhancedGraphics = GameData[3];
  CurData.bAllowCancel = GameData[4];
  CurData.NewImage = GameData[5];
  CurData.TextFont = GameData[6];
  return CurData;
}

function customproperty() {
  this.Name = '';
  this.Value = '';
}

function SetupCustomPropertyData(GameData) {
  const CurProperty = new customproperty();
  CurProperty.Name = GameData[0];
  CurProperty.Value = GameData[1];
  return CurProperty;
}

function check() {
  this.CondType = 'CT_Uninitialized';
  this.CkType = 'CT_Uninitialized';
  this.ConditionStep2 = '';
  this.ConditionStep3 = '';
  this.ConditionStep4 = '';
}

function SetupCheckData(GameData) {
  const CurCheck = new check();
  CurCheck.CondType = GameData[0];
  CurCheck.CkType = GameData[1];
  CurCheck.ConditionStep2 = GameData[2];
  CurCheck.ConditionStep3 = GameData[3];
  CurCheck.ConditionStep4 = GameData[4];
  return CurCheck;
}

function command() {
  this.cmdtype = 'CT_UNINITIALIZED';
  this.CommandName = '';
  this.CommandText = '';
  this.CommandPart2 = '';
  this.CommandPart3 = '';
  this.CommandPart4 = '';
  this.CustomChoices = [];
  this.EnhInputData = null;
}

function SetupCommandData(GameData) {
  const CurCommand = new command();
  CurCommand.cmdtype = GameData[1];
  CurCommand.CommandName = GameData[2];
  CurCommand.CommandText = GameData[3];
  CurCommand.CommandPart2 = GameData[4];
  CurCommand.CommandPart3 = GameData[5];
  CurCommand.CommandPart4 = GameData[6];
  for (let i = 0; i < GameData[7].length; i += 1) {
    CurCommand.CustomChoices.push(GameData[7][i]);
  }
  CurCommand.EnhInputData = SetupEnhInputData(GameData[8]);
  return CurCommand;
}

function ragscondition() {
  this.conditionname = '';
  this.PassCommands = [];
  this.FailCommands = [];
  this.Checks = [];
}

function SetupConditionData(GameData) {
  const CurCondition = new ragscondition();
  CurCondition.conditionname = GameData[1];
  for (let i = 0; i < GameData[2].length; i += 1) {
    CurCondition.Checks.push(SetupCheckData(GameData[2][i]));
  }
  for (let j = 0; j < GameData[3].length; j += 1) {
    if (GameData[3][j][0] === 'CMD') {
      CurCondition.PassCommands.push(SetupCommandData(GameData[3][j]));
    } else {
      CurCondition.PassCommands.push(SetupConditionData(GameData[3][j]));
    }
  }
  for (let k = 0; k < GameData[4].length; k += 1) {
    if (GameData[4][k][0] === 'CMD') {
      CurCondition.FailCommands.push(SetupCommandData(GameData[4][k]));
    } else {
      CurCondition.FailCommands.push(SetupConditionData(GameData[4][k]));
    }
  }
  return CurCondition;
}

function action() {
  this.name = 'default';
  this.bActive = true;
  this.overridename = '';
  this.actionparent = 'None';
  this.bConditionFailOnFirst = true;
  this.InputType = 'None';
  this.PassCommands = [];
  this.FailCommands = [];
  this.Conditions = [];
  this.CustomChoices = [];
  this.EnhInputData = new enhinputdata();
  this.CustomChoiceTitle = '';
}

function SetupActionData(GameData) {
  const CurAction = new action();
  CurAction.name = GameData[0];
  CurAction.bActive = GameData[1];
  CurAction.overridename = GameData[2];
  CurAction.actionparent = GameData[3];
  CurAction.bConditionFailOnFirst = GameData[4];
  CurAction.InputType = GameData[5];
  CurAction.CustomChoiceTitle = GameData[6];
  for (let i = 0; i < GameData[7].length; i += 1) {
    if (GameData[7][i][0] === 'CMD') {
      CurAction.PassCommands.push(SetupCommandData(GameData[7][i]));
    } else {
      CurAction.PassCommands.push(SetupConditionData(GameData[7][i]));
    }
  }
  for (let j = 0; j < GameData[8].length; j += 1) {
    if (GameData[8][j][0] === 'CMD') {
      CurAction.FailCommands.push(SetupCommandData(GameData[8][j]));
    } else {
      CurAction.FailCommands.push(SetupConditionData(GameData[8][j]));
    }
  }
  for (let k = 0; k < GameData[9].length; k += 1) {
    CurAction.Conditions.push(SetupConditionData(GameData[9][k]));
  }
  for (let l = 0; l < GameData[10].length; l += 1) {
    CurAction.CustomChoices.push(GameData[10][l]);
  }
  CurAction.EnhInputData = SetupEnhInputData(GameData[11]);
  return CurAction;
}

function timer() {
  this.Name = '';
  this.TType = '';
  this.Active = false;
  this.Restart = false;
  this.TurnNumber = 0;
  this.Length = 0;
  this.LiveTimer = false;
  this.TimerSeconds = 0;
  this.CustomProperties = [];
  this.Actions = [];
  this.curtickcount = 0;
}

function SetupTimerData(GameData) {
  const TheTimer = new timer();
  TheTimer.Name = GameData[0];
  TheTimer.TType = GameData[1];
  TheTimer.Active = GameData[2];
  TheTimer.Restart = GameData[3];
  TheTimer.TurnNumber = GameData[4];
  TheTimer.Length = GameData[5];
  TheTimer.LiveTimer = GameData[6];
  TheTimer.TimerSeconds = GameData[7];
  for (let i = 0; i < GameData[8].length; i += 1) {
    TheTimer.CustomProperties.push(SetupCustomPropertyData(GameData[8][i]));
  }
  for (let j = 0; j < GameData[9].length; j += 1) {
    TheTimer.Actions.push(SetupActionData(GameData[9][j]));
  }
  return TheTimer;
}

const timers = timerdata.map(SetupTimerData);

const argName = process.argv.slice(2).join(' ').trim();
if (!argName) {
  console.log(JSON.stringify(timers.map(timer => timer.Name), null, 2));
  process.exit(0);
}

const wanted = normalize(argName);
const found = timers.find(timer => normalize(timer?.Name) === wanted);
if (!found) {
  console.error(`Timer not found: ${argName}`);
  process.exit(1);
}

const isLive = Boolean(found.LiveTimer) || Number(found.TimerSeconds) > 0;
const mapped = {
  ...found,
  Type: isLive ? 'live' : 'turn',
  IntervalTurns: 1,
  StartAtTurn: Number(found.TurnNumber ?? 0),
  Enabled: found.Active !== false
};
if (isLive) mapped.IntervalMs = Math.max(100, Number(found.TimerSeconds ?? 1) * 1000);

console.log(JSON.stringify(mapped, null, 2));
