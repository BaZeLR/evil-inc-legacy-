import React from 'react';
import './AchievementPopup.css';

/**
 * Props:
 * - achievement: {
 *     name: string,
 *     description: string,
 *     media: string,
 *     popup?: { title?: string, text?: string, media?: string }
 *   }
 * - onClose: function
 */
export default function AchievementPopup({ achievement, onClose }) {
  if (!achievement) return null;
  const popup = achievement.popup || {};
  return (
    <div className="achievement-popup-overlay" onClick={onClose}>
      <div className="achievement-popup" onClick={e => e.stopPropagation()}>
        <img
          className="achievement-image"
          src={popup.media || achievement.media}
          alt={achievement.name}
        />
        <div className="achievement-title">{popup.title || 'Achievement Unlocked!'}</div>
        <div className="achievement-name">{achievement.name}</div>
        <div className="achievement-desc">{popup.text || achievement.description}</div>
        <button className="achievement-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
