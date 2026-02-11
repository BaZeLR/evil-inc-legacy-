// Utility for selecting the correct room image based on time of day
// Usage: getRoomImage(room, gameTime)

/**
 * Returns the best image path for a room based on the current game time.
 * @param {object} room - The room object (with Picture field)
 * @param {object} gameTime - An object with a getTimeOfDay() method returning a string (e.g., 'dawn', 'morning', 'day', 'afternoon', 'dusk', 'night')
 * @returns {string|null} - The image path to use, or null if not found
 */
export function getRoomImage(room, gameTime) {
  if (!room || !room.Picture) return null;
  const pic = room.Picture;
  if (typeof pic === 'string') return pic;
  if (!pic || typeof pic !== 'object') return null;
  if (!gameTime || typeof gameTime.getTimeOfDay !== 'function') return pic.day || pic.night || Object.values(pic)[0];
  const timeKey = gameTime.getTimeOfDay(); // e.g., 'dawn', 'morning', etc.
  // Try exact match, then fallback to day, night, or any available
  return pic[timeKey] || pic.day || pic.night || Object.values(pic)[0];
}
