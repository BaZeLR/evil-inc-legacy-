import React, { useEffect, useMemo, useRef, useState } from 'react';
import { readDbJsonFile } from '../../utils/dbUpdate.js';
import { writeDbJsonFile } from '../../utils/dbWrite.js';
import { formatJson, generateIdSequence, jsonClone, normalizeId, tryParseJson } from './editorUtils.js';
import { StatusLine } from './StatusLine.jsx';

export function RoomsEditor() {
  const canWrite = Boolean(import.meta?.env?.DEV);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [roomsDoc, setRoomsDoc] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [jsonText, setJsonText] = useState('');
  const [dirty, setDirty] = useState(false);

  const [newId, setNewId] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('room_');
  const [batchStart, setBatchStart] = useState(1);
  const [batchCount, setBatchCount] = useState(5);
  const [batchPad, setBatchPad] = useState(3);

  const loadedJsonRef = useRef(null);

  const loadRooms = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const doc = await readDbJsonFile('DB/rooms/index.json');
      setRoomsDoc(doc);
    } catch (error) {
      setRoomsDoc(null);
      setStatus({ kind: 'error', message: error?.message || String(error) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rooms = useMemo(() => (Array.isArray(roomsDoc?.Rooms) ? roomsDoc.Rooms : []), [roomsDoc]);
  const existingIds = useMemo(() => new Set(rooms.map(room => normalizeId(room?.UniqueID)).filter(Boolean)), [rooms]);

  const filteredRooms = useMemo(() => {
    const needle = String(search ?? '').trim().toLowerCase();
    const list = [...rooms];
    list.sort((a, b) => String(a?.UniqueID ?? '').localeCompare(String(b?.UniqueID ?? '')));
    if (!needle) return list;
    return list.filter(room => {
      const id = String(room?.UniqueID ?? '').toLowerCase();
      const name = String(room?.Name ?? '').toLowerCase();
      return id.includes(needle) || name.includes(needle);
    });
  }, [rooms, search]);

  const loadRoom = roomId => {
    const id = normalizeId(roomId);
    if (!id) return;

    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }

    const room = rooms.find(r => normalizeId(r?.UniqueID) === id) || null;
    if (!room) {
      setStatus({ kind: 'error', message: `Room not found: ${id}` });
      return;
    }

    loadedJsonRef.current = room;
    setSelectedId(id);
    setJsonText(formatJson(room));
    setDirty(false);
    setStatus(null);
  };

  const saveRoom = async () => {
    if (!canWrite) return;
    if (!selectedId) return;

    const parsed = tryParseJson(jsonText);
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error });
      return;
    }

    const nextRoom = parsed.value;
    const id = normalizeId(nextRoom?.UniqueID);
    if (id !== selectedId) {
      setStatus({ kind: 'error', message: `UniqueID must stay \"${selectedId}\" (use Create to add new rooms).` });
      return;
    }

    const nextDoc = jsonClone(roomsDoc && typeof roomsDoc === 'object' ? roomsDoc : {});
    const list = Array.isArray(nextDoc.Rooms) ? nextDoc.Rooms : [];
    const idx = list.findIndex(r => normalizeId(r?.UniqueID) === selectedId);
    if (idx < 0) {
      setStatus({ kind: 'error', message: `Room not found in rooms index: ${selectedId}` });
      return;
    }

    list[idx] = nextRoom;
    nextDoc.Rooms = list;

    setStatus({ kind: 'info', message: `Saving ${selectedId}...` });
    try {
      await writeDbJsonFile('DB/rooms/index.json', nextDoc);
      setRoomsDoc(nextDoc);
      loadedJsonRef.current = nextRoom;
      setJsonText(formatJson(nextRoom));
      setDirty(false);
      setStatus({ kind: 'success', message: `Saved ${selectedId}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const createRoom = async () => {
    if (!canWrite) return;
    const id = normalizeId(newId);
    if (!id) {
      setStatus({ kind: 'error', message: 'Enter a UniqueID first.' });
      return;
    }
    if (existingIds.has(id)) {
      setStatus({ kind: 'error', message: `Room already exists: ${id}` });
      return;
    }

    const templateParsed = tryParseJson(jsonText);
    const template = templateParsed.ok && templateParsed.value ? templateParsed.value : loadedJsonRef.current;
    const nextRoom = jsonClone(template && typeof template === 'object' ? template : {});
    nextRoom.UniqueID = id;
    if (!nextRoom.Name) nextRoom.Name = id;
    if (!nextRoom.SDesc) nextRoom.SDesc = id.replace(/_lc_\\d+$/i, '');

    const nextDoc = jsonClone(roomsDoc && typeof roomsDoc === 'object' ? roomsDoc : {});
    const list = Array.isArray(nextDoc.Rooms) ? nextDoc.Rooms : [];
    list.push(nextRoom);
    nextDoc.Rooms = list;

    setStatus({ kind: 'info', message: `Creating ${id}...` });
    try {
      await writeDbJsonFile('DB/rooms/index.json', nextDoc);
      setRoomsDoc(nextDoc);
      setNewId('');
      setStatus({ kind: 'success', message: `Created ${id}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const deleteRoom = async () => {
    if (!canWrite) return;
    if (!selectedId) return;

    const ok = window.confirm(`Remove room ${selectedId} from rooms index?`);
    if (!ok) return;

    const nextDoc = jsonClone(roomsDoc && typeof roomsDoc === 'object' ? roomsDoc : {});
    const list = Array.isArray(nextDoc.Rooms) ? nextDoc.Rooms : [];
    const filtered = list.filter(room => normalizeId(room?.UniqueID) !== selectedId);
    if (filtered.length === list.length) {
      setStatus({ kind: 'error', message: `Room not found: ${selectedId}` });
      return;
    }
    nextDoc.Rooms = filtered;

    setStatus({ kind: 'info', message: `Deleting ${selectedId}...` });
    try {
      await writeDbJsonFile('DB/rooms/index.json', nextDoc);
      setRoomsDoc(nextDoc);
      setSelectedId(null);
      setJsonText('');
      setDirty(false);
      loadedJsonRef.current = null;
      setStatus({ kind: 'success', message: `Deleted ${selectedId}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const batchCreate = async () => {
    if (!canWrite) return;
    const ids = generateIdSequence({ prefix: batchPrefix, startNumber: batchStart, count: batchCount, pad: batchPad }).map(normalizeId).filter(Boolean);
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      setStatus({ kind: 'error', message: 'Batch count is 0.' });
      return;
    }
    if (uniqueIds.length !== ids.length) {
      setStatus({ kind: 'error', message: 'Batch ids contain duplicates. Check prefix/start/pad.' });
      return;
    }
    const collisions = uniqueIds.filter(id => existingIds.has(id));
    if (collisions.length) {
      setStatus({ kind: 'error', message: `Already exists: ${collisions.slice(0, 5).join(', ')}${collisions.length > 5 ? '…' : ''}` });
      return;
    }

    const templateParsed = tryParseJson(jsonText);
    const template = templateParsed.ok && templateParsed.value ? templateParsed.value : loadedJsonRef.current;
    const baseTemplate = jsonClone(template && typeof template === 'object' ? template : {});

    const nextDoc = jsonClone(roomsDoc && typeof roomsDoc === 'object' ? roomsDoc : {});
    const list = Array.isArray(nextDoc.Rooms) ? nextDoc.Rooms : [];

    for (const id of uniqueIds) {
      const nextRoom = jsonClone(baseTemplate);
      nextRoom.UniqueID = id;
      if (!nextRoom.Name) nextRoom.Name = id;
      if (!nextRoom.SDesc) nextRoom.SDesc = id.replace(/_lc_\\d+$/i, '');
      list.push(nextRoom);
    }

    nextDoc.Rooms = list;
    setStatus({ kind: 'info', message: `Creating batch (${uniqueIds.length})...` });
    try {
      await writeDbJsonFile('DB/rooms/index.json', nextDoc);
      setRoomsDoc(nextDoc);
      setStatus({ kind: 'success', message: `Created ${uniqueIds.length} room(s).` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  return (
    <>
      <div className="drawer-subtitle">Rooms</div>
      <div className="drawer-muted">Writes go to `public/DB/rooms/index.json` (dev server only).</div>
      {!canWrite ? <div className="drawer-warning">Write APIs are only available on `npm run dev`.</div> : null}

      <StatusLine status={status} />

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Search</div>
          <input className="editor-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="filter by id or name…" />
        </div>
      </div>

      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={loadRooms} disabled={loading}>
          Reload rooms index
        </button>
        <button type="button" className="drawer-action-btn" onClick={saveRoom} disabled={!canWrite || !selectedId || !dirty}>
          Save
        </button>
        <button type="button" className="drawer-action-btn" onClick={deleteRoom} disabled={!canWrite || !selectedId}>
          Delete
        </button>
      </div>

      <ul className="inventory-list" aria-label="Rooms list">
        {filteredRooms.length ? (
          filteredRooms.slice(0, 60).map(room => {
            const id = normalizeId(room?.UniqueID);
            const name = String(room?.Name ?? '');
            return (
              <li key={id || name}>
                <button type="button" className={`inventory-item${selectedId === id ? ' selected' : ''}`} onClick={() => loadRoom(id)}>
                  <span className="inventory-item-name">{id ? `${id}${name ? ` · ${name}` : ''}` : name || 'Room'}</span>
                </button>
              </li>
            );
          })
        ) : (
          <li className="drawer-muted">{loading ? 'Loading…' : 'No rooms found.'}</li>
        )}
      </ul>
      {filteredRooms.length > 60 ? <div className="drawer-muted">Showing first 60 results.</div> : null}

      <div className="editor-divider" />

      <div className="drawer-subtitle">Editor</div>
      <div className="drawer-muted">{selectedId ? `Room: ${selectedId}` : 'Pick a room to edit.'}</div>
      <textarea
        className="editor-textarea"
        value={jsonText}
        onChange={e => {
          setJsonText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        placeholder="Select a room to load JSON…"
      />

      <div className="editor-divider" />

      <div className="drawer-subtitle">Create / Batch</div>
      <div className="drawer-muted">Uses the current editor JSON as a template when possible.</div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">New UniqueID</div>
          <input className="editor-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="harbor_lc_002" />
        </div>
      </div>
      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={createRoom} disabled={!canWrite}>
          Create
        </button>
      </div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Batch prefix</div>
          <input className="editor-input" value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="room_" />
        </div>
        <div className="editor-field">
          <div className="editor-field-label">Start</div>
          <input className="editor-input" value={batchStart} onChange={e => setBatchStart(e.target.value)} />
        </div>
        <div className="editor-field">
          <div className="editor-field-label">Count</div>
          <input className="editor-input" value={batchCount} onChange={e => setBatchCount(e.target.value)} />
        </div>
        <div className="editor-field">
          <div className="editor-field-label">Pad</div>
          <input className="editor-input" value={batchPad} onChange={e => setBatchPad(e.target.value)} />
        </div>
      </div>
      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={batchCreate} disabled={!canWrite}>
          Batch Create
        </button>
      </div>
    </>
  );
}

