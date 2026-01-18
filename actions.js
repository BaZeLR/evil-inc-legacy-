// actions.js
// Core action functions for the game. Import and use these in your main game logic.

// Display media in the media window
function displayMedia(mediaPath) {
  const mediaWindow = document.querySelector('.media-window');
  if (!mediaWindow) return;
  mediaWindow.innerHTML = '';
  const img = document.createElement('img');
  img.src = mediaPath;
  img.alt = 'Media';
  img.style.maxWidth = '100%';
  img.style.maxHeight = '100%';
  mediaWindow.appendChild(img);
}

// Display text in the text window
function displayText(text) {
  const textWindow = document.querySelector('.text-window .text-dialog');
  if (!textWindow) return;
  textWindow.innerHTML = `<p>${text}</p>`;
}

// Set or modify a player variable (stat, inventory, etc.)
function setPlayerVariable(player, variable, operation, value) {
  if (operation === 'Add') {
    player[variable] = (player[variable] || 0) + Number(value);
  } else if (operation === 'Set') {
    player[variable] = value;
  }
}

// Get a player or object variable (stat, property, etc.)
function getVariable(entity, variable) {
  return entity[variable];
}

// General action handler for objects/items
function handleObjectAction(object, action, actor) {
  switch (action) {
    case 'Take':
      object.Owner = actor.UniqueID;
      displayText(`You take the ${object.Name}.`);
      // Add to inventory logic here
      break;
    case 'Examine':
      displayText(object.Description);
      if (object.Picture) displayMedia(object.Picture);
      break;
    case 'Use':
      if (object.Name === 'Healing Potion') {
        setPlayerVariable(actor, 'Health', 'Add', 25);
        displayText('You feel better!');
        // Remove potion from inventory logic here
      }
      break;
    // Add more cases for custom actions
  }
}

// Export functions if using modules
// export { displayMedia, displayText, setPlayerVariable, handleObjectAction };
