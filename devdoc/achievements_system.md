# Achievements System

## Overview
Achievements are special rewards for player milestones or unique actions. They are defined in `public/DB/achievements.json` and referenced in the player's `Achievements` array. Each achievement can display a custom popup with an image and description.

## Data Structure
- **Definition:** `public/DB/achievements.json`
- **Player State:** `Achievements` array in `player.json`
- **Scene Grant:** Use an action of type `GrantAchievement` in a scene's `actions` array.

### Example Achievement JSON
```json
{
  "id": "HangedOutWithMarkAndEmily",
  "name": "Hanged Out with Mark and Emily!",
  "description": "You spent a memorable evening with Mark and Emily. True friendship is forged in laughter and late-night snacks.",
  "media": "Assets/images/Emily_03.jpg",
  "popup": {
    "title": "Achievement Unlocked!",
    "text": "You hung out with Mark and Emily!",
    "media": "Assets/images/Emily_03.jpg"
  }
}
```

## UI Integration
- The Achievements button in the player's drawer opens a list of unlocked achievements.
- Clicking an achievement shows a popup with its image and description.

## Popup HTML & CSS

### HTML (injected into popup window)
```html
<div class="achievement-popup">
  <img class="achievement-image" src="Assets/images/Emily_03.jpg" alt="Achievement" />
  <div class="achievement-title">Achievement Unlocked!</div>
  <div class="achievement-name">Hanged Out with Mark and Emily!</div>
  <div class="achievement-desc">You spent a memorable evening with Mark and Emily. True friendship is forged in laughter and late-night snacks.</div>
</div>
```

### CSS
```css
.achievement-popup {
  background: #23243a;
  border-radius: 16px;
  box-shadow: 0 4px 32px #000a;
  padding: 32px 24px 24px 24px;
  text-align: center;
  color: #fff;
  max-width: 340px;
  margin: 0 auto;
}
.achievement-image {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 16px;
  border: 3px solid #ffd700;
  box-shadow: 0 2px 12px #0006;
}
.achievement-title {
  font-size: 1.3em;
  font-weight: bold;
  color: #ffd700;
  margin-bottom: 8px;
}
.achievement-name {
  font-size: 1.1em;
  font-weight: 600;
  margin-bottom: 8px;
}
.achievement-desc {
  font-size: 1em;
  color: #e0e0e0;
}
```

## Usage
- Inject the HTML and CSS above into the popup window when an achievement is activated from the achievements list.
- Replace the image, title, name, and description with the selected achievement's data.
