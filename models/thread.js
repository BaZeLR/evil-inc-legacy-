export const ThreadEventTemplate = {
  id: '',
  scene: '',
  trigger: {
    type: 'player_enter',
    room: '',
    character: ''
  },
  condStr: '',
  reqs: [],
  repeatable: false,
  completeOnTrigger: false,
  suppressCombat: true,
  priority: 0,
  rewards: null,
  Conditions: [],
  PassCommands: [],
  FailCommands: []
};

export const ThreadTemplate = {
  id: '',
  name: '',
  autoAdvance: true,
  events: [{ ...ThreadEventTemplate }]
};
