// main.js
import { AgeGate, PlayerMessage, MainUI } from '../templates/GameStartTemplates.js';

const root = document.getElementById('root');

let step = 0;
let player = { name: 'Player', icon: '', /* add more as needed */ };
let room = { name: 'Starting Room', eventText: 'Welcome to the adventure!' };
let media = { type: 'image', src: '' };
let npcs = [ { id: 1, name: 'NPC1' }, { id: 2, name: 'NPC2' } ];

function render() {
  if (step === 0) {
    ReactDOM.render(
      React.createElement(AgeGate, { onAccept: () => { step = 1; render(); } }),
      root
    );
  } else if (step === 1) {
    ReactDOM.render(
      React.createElement(PlayerMessage, { onContinue: () => { step = 2; render(); } }),
      root
    );
  } else {
    ReactDOM.render(
      React.createElement(MainUI, {
        player,
        room,
        media,
        npcs,
        onContinue: () => { /* handle continuation */ }
      }),
      root
    );
  }
}

render();
