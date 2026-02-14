import { EventEngine } from './events/EventEngine.js';
import { EventController } from './events/EventController.js';
import { SceneLoader } from './events/SceneLoader.js';
import { SceneRunner } from './events/SceneRunner.js';
import { CommandRunner } from './events/CommandRunner.js';
import { TimerManager } from './events/TimerManager.js';
import { GameRuntimeMethods } from './core/game/GameRuntimeMethods.js';

export class Game {
    constructor() {
        this.player = null;
        this.rooms = [];
        this.objects = [];
        this.characters = [];
        this.plannedEvents = [];
        this.plannedEventMap = {};
        this.threadEvents = [];
        this.threadEventIndex = {};
        this.threadEventBySceneId = {};
        this.threadEventById = {};
        this.leveling = null;
        this.objectMap = {};
        this.objectNameMap = {};
        this.objectSourceMap = {};
        this.roomMap = {};
        this.characterMap = {};
        this.characterNameMap = {};
        this.variables = {};
        this.eventEngine = new EventEngine(this);
        this.eventController = new EventController(this);
        this.sceneLoader = new SceneLoader(this);
        this.sceneRunner = new SceneRunner(this);
        this.commandRunner = new CommandRunner(this);
        this.timerManager = new TimerManager(this);
        this.lastEventResult = null;
        this.lastLevelProgression = null;
        this.save = null;
        this.loadErrors = [];
        this.initialized = false;
        this.spawnState = {
            ephemeralCharacterIds: new Set(),
            pendingEncounter: null
        };
        this.timers = [];
        this.timerMap = {};
        this.timerNameMap = {};
    }
}

for (const name of Object.getOwnPropertyNames(GameRuntimeMethods.prototype)) {
    if (name === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(GameRuntimeMethods.prototype, name);
    if (descriptor) Object.defineProperty(Game.prototype, name, descriptor);
}

export async function runGameLoop() {
    const game = new Game();
    await game.initialize();
    setInterval(() => {
        game.getCurrentRoom();
    }, 2000);
}
