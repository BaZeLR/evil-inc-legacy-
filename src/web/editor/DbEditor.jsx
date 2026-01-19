import React, { useState } from 'react';
import { TabButtons } from './TabButtons.jsx';
import { CharactersEditor } from './CharactersEditor.jsx';
import { ObjectsEditor } from './ObjectsEditor.jsx';
import { RoomsEditor } from './RoomsEditor.jsx';

export function DbEditor({ game, onRequestClose }) {
  const [tab, setTab] = useState('characters');

  return (
    <div className="drawer-body">
      <div className="drawer-subtitle">DB Editor</div>
      <div className="drawer-muted">
        Edits `public/DB/**` via dev server APIs. After saving, the game auto-reloads DB (except savegame writes).
      </div>

      <TabButtons tab={tab} setTab={setTab} />

      {tab === 'characters' ? <CharactersEditor /> : null}
      {tab === 'objects' ? <ObjectsEditor game={game} /> : null}
      {tab === 'rooms' ? <RoomsEditor /> : null}

      {onRequestClose ? (
        <div className="inventory-action-row">
          <button type="button" className="drawer-action-btn" onClick={onRequestClose}>
            Close Editor
          </button>
        </div>
      ) : null}
    </div>
  );
}

