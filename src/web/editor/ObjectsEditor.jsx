import React, { useMemo, useRef, useState } from 'react';
import { readDbJsonFile } from '../../utils/dbUpdate.js';
import { writeDbJsonFile } from '../../utils/dbWrite.js';
import { deleteDbPaths, formatJson, generateIdSequence, jsonClone, normalizeId, tryParseJson } from './editorUtils.js';
import { StatusLine } from './StatusLine.jsx';

export function ObjectsEditor({ game }) {
  const canWrite = Boolean(import.meta?.env?.DEV);
  const [category, setCategory] = useState('equipment');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null);

  const [newId, setNewId] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('item_');
  const [batchStart, setBatchStart] = useState(1);
  const [batchCount, setBatchCount] = useState(5);
  const [batchPad, setBatchPad] = useState(3);

  const loadedJsonRef = useRef(null);

  const OBJECT_CATEGORIES = [
    { key: 'equipment', label: 'Equipment' },
    { key: 'gadgets', label: 'Gadgets' },
    { key: 'game_items', label: 'Game Items' },
    { key: 'weapons', label: 'Weapons' }
  ];

  const objectSourceMap = game?.objectSourceMap ?? {};
  const objectIds = useMemo(() => Object.keys(objectSourceMap || {}).sort((a, b) => a.localeCompare(b)), [objectSourceMap]);
  const existingIds = useMemo(() => new Set(objectIds.map(normalizeId).filter(Boolean)), [objectIds]);

  const filteredIds = useMemo(() => {
    const needle = String(search ?? '').trim().toLowerCase();
    if (!needle) return [...objectIds];
    return objectIds.filter(id => String(id).toLowerCase().includes(needle));
  }, [objectIds, search]);

  const selectedPath = selectedId ? objectSourceMap?.[selectedId] ?? null : null;

  const loadObject = async id => {
    const nextId = normalizeId(id);
    if (!nextId) return;

    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }

    const source = objectSourceMap?.[nextId] ?? null;
    if (!source) {
      setStatus({ kind: 'error', message: `Missing source for ${nextId}` });
      return;
    }

    setStatus(null);
    setSelectedId(nextId);
    try {
      const data = await readDbJsonFile(source);
      loadedJsonRef.current = data;
      setJsonText(formatJson(data));
      setDirty(false);
    } catch (error) {
      loadedJsonRef.current = null;
      setJsonText('');
      setDirty(false);
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const saveObject = async () => {
    if (!canWrite) return;
    if (!selectedId || !selectedPath) return;

    const parsed = tryParseJson(jsonText);
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error });
      return;
    }

    const next = parsed.value;
    const id = normalizeId(next?.UniqueID ?? next?.id);
    if (id !== selectedId) {
      setStatus({ kind: 'error', message: `UniqueID must stay \"${selectedId}\" (use Create to add new objects).` });
      return;
    }

    try {
      await writeDbJsonFile(selectedPath, next);
      loadedJsonRef.current = next;
      setJsonText(formatJson(next));
      setDirty(false);
      setStatus({ kind: 'success', message: `Saved ${selectedPath}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const createObject = async () => {
    if (!canWrite) return;
    const id = normalizeId(newId);
    if (!id) {
      setStatus({ kind: 'error', message: 'Enter a UniqueID first.' });
      return;
    }
    if (existingIds.has(id)) {
      setStatus({ kind: 'error', message: `Object already exists: ${id}` });
      return;
    }

    const templateParsed = tryParseJson(jsonText);
    const template = templateParsed.ok && templateParsed.value ? templateParsed.value : loadedJsonRef.current;
    const next = jsonClone(template && typeof template === 'object' ? template : {});
    next.UniqueID = id;
    if (!next.Name) next.Name = id;

    const filePath = `DB/objects/${category}/${id}.json`;

    setStatus({ kind: 'info', message: `Creating ${id}...` });
    try {
      await writeDbJsonFile(filePath, next);
      setNewId('');
      setStatus({ kind: 'success', message: `Created ${id}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const deleteObject = async () => {
    if (!canWrite) return;
    if (!selectedId || !selectedPath) return;

    const ok = window.confirm(`Delete ${selectedId}? (a backup copy will be written under backups/deleted/)`);
    if (!ok) return;

    setStatus({ kind: 'info', message: `Deleting ${selectedId}...` });
    try {
      await deleteDbPaths([selectedPath], { backup: true });
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

    const createdPaths = [];
    setStatus({ kind: 'info', message: `Creating batch (${uniqueIds.length})...` });
    try {
      for (const id of uniqueIds) {
        const next = jsonClone(baseTemplate);
        next.UniqueID = id;
        if (!next.Name) next.Name = id;
        const filePath = `DB/objects/${category}/${id}.json`;
        await writeDbJsonFile(filePath, next);
        createdPaths.push(filePath);
      }
      setStatus({ kind: 'success', message: `Created ${uniqueIds.length} object(s).` });
    } catch (error) {
      try {
        await deleteDbPaths(createdPaths, { backup: false });
      } catch {
        // ignore rollback failures
      }
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  return (
    <>
      <div className="drawer-subtitle">Objects</div>
      <div className="drawer-muted">Writes go to public/DB/objects/[category]/** (dev server only).</div>
      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Category</div>
          <select className="editor-select" value={category} onChange={e => setCategory(e.target.value)}>
            {OBJECT_CATEGORIES.map(entry => (
              <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
        </div>
      </div>
      {!canWrite ? <div className="drawer-warning">Write APIs are only available on `npm run dev`.</div> : null}

      <StatusLine status={status} />

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Search</div>
          <input className="editor-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="filter ids…" />
        </div>
      </div>

      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={saveObject} disabled={!canWrite || !selectedId || !dirty}>
          Save
        </button>
        <button type="button" className="drawer-action-btn" onClick={deleteObject} disabled={!canWrite || !selectedId}>
          Delete
        </button>
      </div>

      <ul className="inventory-list" aria-label="Objects list">
        {filteredIds.length ? (
          filteredIds.slice(0, 60).map(id => (
            <li key={id}>
              <button type="button" className={`inventory-item${selectedId === id ? ' selected' : ''}`} onClick={() => loadObject(id)}>
                <span className="inventory-item-name">{id}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="drawer-muted">No objects found.</li>
        )}
      </ul>
      {filteredIds.length > 60 ? <div className="drawer-muted">Showing first 60 results.</div> : null}

      <div className="editor-divider" />

      <div className="drawer-subtitle">Editor</div>
      <div className="drawer-muted">{selectedPath ? selectedPath : 'Pick an object to edit.'}</div>
      <textarea
        className="editor-textarea"
        value={jsonText}
        onChange={e => {
          setJsonText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        placeholder="Select an object to load JSON…"
      />

      <div className="editor-divider" />

      <div className="drawer-subtitle">Create / Batch</div>
      <div className="drawer-muted">Create new objects using current JSON as base structure.</div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">New UniqueID</div>
          <input className="editor-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="medpack_002" />
        </div>
      </div>
      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={createObject} disabled={!canWrite}>
          Create
        </button>
      </div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Batch prefix</div>
          <input className="editor-input" value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="item_" />
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

