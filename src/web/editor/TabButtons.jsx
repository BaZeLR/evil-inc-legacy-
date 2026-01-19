import React from 'react';

export function TabButtons({ tab, setTab }) {
  return (
    <div className="editor-tabs" role="tablist" aria-label="DB editor tabs">
      <button
        type="button"
        className="drawer-action-btn"
        aria-selected={tab === 'characters'}
        onClick={() => setTab('characters')}
      >
        Characters
      </button>
      <button type="button" className="drawer-action-btn" aria-selected={tab === 'objects'} onClick={() => setTab('objects')}>
        Objects
      </button>
      <button type="button" className="drawer-action-btn" aria-selected={tab === 'rooms'} onClick={() => setTab('rooms')}>
        Rooms
      </button>
    </div>
  );
}

