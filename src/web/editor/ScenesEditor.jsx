import React, { useMemo, useRef, useState } from 'react';
import { readDbJsonFile } from '../../utils/dbUpdate.js';
import { writeDbJsonFile } from '../../utils/dbWrite.js';
import { deleteDbPaths, formatJson, generateIdSequence, jsonClone, normalizeId, tryParseJson } from './editorUtils.js';
import { StatusLine } from './StatusLine.jsx';

export function ScenesEditor({ game }) {
  const canWrite = Boolean(import.meta?.env?.DEV);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null);

  const [newId, setNewId] = useState('');

  const loadedJsonRef = useRef(null);

  const sceneSourceMap = game?.sceneSourceMap ?? {};
  const sceneIds = useMemo(() => Object.keys(sceneSourceMap || {}).sort((a, b) => a.localeCompare(b)), [sceneSourceMap]);
  const existingIds = useMemo(() => new Set(sceneIds.map(normalizeId).filter(Boolean)), [sceneIds]);

  const filteredIds = useMemo(() => {
    const needle = String(search ?? '').trim().toLowerCase();
    if (!needle) return [...sceneIds];
    return sceneIds.filter(id => String(id).toLowerCase().includes(needle));
  }, [sceneIds, search]);

  const selectedPath = selectedId ? sceneSourceMap?.[selectedId] ?? null : null;

  const loadScene = async id => {
    const nextId = normalizeId(id);
    if (!nextId) return;

    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }

    const source = sceneSourceMap?.[nextId] ?? null;
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

  const saveScene = async () => {
    if (!canWrite) return;
    if (!selectedId || !selectedPath) return;

    const parsed = tryParseJson(jsonText);
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error });
      return;
    }

    const next = parsed.value;
    const id = normalizeId(next?.SceneID ?? next?.id);
    if (id !== selectedId) {
      setStatus({ kind: 'error', message: `SceneID must stay \"${selectedId}\" (use Create to add new scenes).` });
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

  const createScene = async () => {
    if (!canWrite) return;
    const id = normalizeId(newId);
    if (!id) {
      setStatus({ kind: 'error', message: 'Enter a SceneID first.' });
      return;
    }
    if (existingIds.has(id)) {
      setStatus({ kind: 'error', message: `Scene already exists: ${id}` });
      return;
    }

    const templateParsed = tryParseJson(jsonText);
    const template = templateParsed.ok && templateParsed.value ? templateParsed.value : loadedJsonRef.current;
    const next = jsonClone(template && typeof template === 'object' ? template : {});
    next.SceneID = id;
    if (!next.Name) next.Name = id;
    if (!next.Priority) next.Priority = 1;
    if (!next.Type) next.Type = 'story';
    if (!next.Status) next.Status = 'active';
    if (!next.Stages) next.Stages = {};

    const filePath = `DB/scenes/${id}.json`;

    setStatus({ kind: 'info', message: `Creating ${id}...` });
    try {
      await writeDbJsonFile(filePath, next);
      setNewId('');
      setStatus({ kind: 'success', message: `Created ${id}` });
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const deleteScene = async () => {
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

  return (
    <>
      <div className="drawer-subtitle">Scenes</div>
      <div className="drawer-muted">Writes go to public/DB/scenes/** (dev server only).</div>
      {!canWrite ? <div className="drawer-warning">Write APIs are only available on `npm run dev`.</div> : null}

      <StatusLine status={status} />

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Search</div>
          <input className="editor-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="filter scene ids…" />
        </div>
      </div>

      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={saveScene} disabled={!canWrite || !selectedId || !dirty}>
          Save
        </button>
        <button type="button" className="drawer-action-btn" onClick={deleteScene} disabled={!canWrite || !selectedId}>
          Delete
        </button>
      </div>

      <ul className="inventory-list" aria-label="Scenes list">
        {filteredIds.length ? (
          filteredIds.slice(0, 60).map(id => (
            <li key={id}>
              <button type="button" className={`inventory-item${selectedId === id ? ' selected' : ''}`} onClick={() => loadScene(id)}>
                <span className="inventory-item-name">{id}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="drawer-muted">No scenes found.</li>
        )}
      </ul>
      {filteredIds.length > 60 ? <div className="drawer-muted">Showing first 60 results.</div> : null}

      <div className="editor-divider" />

      <div className="drawer-subtitle">Editor</div>
      <div className="drawer-muted">{selectedPath ? selectedPath : 'Pick a scene to edit.'}</div>
      <textarea
        className="editor-textarea"
        value={jsonText}
        onChange={e => {
          setJsonText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        placeholder="Select a scene to load JSON…"
      />

      <div className="editor-divider" />

      <div className="drawer-subtitle">Create Scene</div>
      <div className="drawer-muted">Create new scene JSON file with stage-based structure.</div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">New SceneID</div>
          <input className="editor-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="westside_quest_001_story" />
        </div>
      </div>
      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={createScene} disabled={!canWrite}>
          Create
        </button>
      </div>
    </>
  );
}
