import React from 'react';
import './LocationTitle.css';

export function LocationTitle({ visible, combat, locationName, onExamineRoom }) {
  if (!visible) return null;

  const clickable = !combat && typeof onExamineRoom === 'function';

  return (
    <div
      className="location-title"
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      title={combat ? 'Fight!' : clickable ? 'Examine room' : undefined}
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
