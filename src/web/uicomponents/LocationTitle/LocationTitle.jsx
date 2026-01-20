import React from 'react';
import './LocationTitle.css';

export function LocationTitle({ visible, combat, locationName, locationDescription, onExamineRoom }) {
  if (!visible) return null;

  const clickable = !combat && typeof onExamineRoom === 'function';
  const description = String(locationDescription ?? '').trim();
  const hoverTitle = combat
    ? 'Fight!'
    : clickable && description
      ? `${description}\n\nClick to examine`
      : clickable
        ? 'Examine room'
        : description || undefined;

  return (
    <div
      className="location-title"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      title={hoverTitle}
      onClick={clickable ? onExamineRoom : undefined}
      onKeyDown={event => {
        if (!clickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onExamineRoom();
        }
      }}
    >
      {combat ? 'Fight!' : locationName}
    </div>
  );
}
