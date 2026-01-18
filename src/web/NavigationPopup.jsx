import React from 'react';

export function NavigationPopup({ room, onMove, onClose }) {
  if (!room) return null;
  const exits = room.exits || [];

  return (
    <div
      className="navigation-popup"
      style={{
        position: 'fixed',
        top: '20%',
        left: '30%',
        background: '#fff',
        border: '2px solid #333',
        padding: '20px',
        zIndex: 1000
      }}
    >
      <h2>{room.name || room.Name}</h2>
      <p>{room.description || room.Description}</p>
      <h3>Available Directions:</h3>
      <ul>
        {exits.map((exit, idx) => (
          <li key={`${exit.direction}:${exit.destinationId || exit.destinationRaw || idx}`}>
            <button
              onClick={() => onMove(exit.destinationId)}
              disabled={!exit.destinationId}
              title={exit.destinationId ? undefined : `Unresolved destination: ${exit.destinationRaw}`}
            >
              {exit.direction} → {exit.destinationName || exit.destinationRaw}
            </button>
          </li>
        ))}
      </ul>
      <button onClick={onClose} style={{ marginTop: '10px' }}>
        Close
      </button>
    </div>
  );
}

