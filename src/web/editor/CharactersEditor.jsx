import React, { useEffect, useMemo, useRef, useState } from 'react';
import { updateDbJsonFile, readDbJsonFile } from '../../utils/dbUpdate.js';
import { writeDbJsonFile } from '../../utils/dbWrite.js';
import { deleteDbPaths, formatJson, generateIdSequence, jsonClone, normalizeId, tryParseJson } from './editorUtils.js';
import { StatusLine } from './StatusLine.jsx';

const CHARACTER_CATEGORIES = [
  { key: 'enemies', label: 'Enemies' },
  { key: 'bosses', label: 'Bosses' },
  { key: 'r_citizens', label: 'Random Citizens' },
  { key: 'main', label: 'Main' }
];

export function CharactersEditor() {
  const canWrite = Boolean(import.meta?.env?.DEV);
  const [category, setCategory] = useState('enemies');
  const [search, setSearch] = useState('');
  const [indexes, setIndexes] = useState({});
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [jsonText, setJsonText] = useState('');
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [newId, setNewId] = useState('');
  const [batchPrefix, setBatchPrefix] = useState('enemy_');
  const [batchStart, setBatchStart] = useState(1);
  const [batchCount, setBatchCount] = useState(5);
  const [batchPad, setBatchPad] = useState(3);

  const loadedJsonRef = useRef(null);

  const selectedPath = selectedId ? `DB/characters/${category}/${selectedId}.json` : null;

  const existingIds = useMemo(() => {
    const all = [];
    for (const value of Object.values(indexes || {})) {
      if (Array.isArray(value)) all.push(...value);
    }
    return new Set(all.map(normalizeId).filter(Boolean));
  }, [indexes]);

  const categoryIds = useMemo(() => {
    const list = Array.isArray(indexes?.[category]) ? indexes[category] : [];
    const needle = String(search ?? '').trim().toLowerCase();
    if (!needle) return [...list];
    return list.filter(id => String(id).toLowerCase().includes(needle));
  }, [indexes, category, search]);

  const loadIndexes = async () => {
    setLoadingIndex(true);
    setStatus(null);
    try {
      const results = await Promise.all(
        CHARACTER_CATEGORIES.map(async entry => {
          const indexPath = `DB/characters/${entry.key}/index.json`;
          try {
            const data = await readDbJsonFile(indexPath);
            const ids = Array.isArray(data?.Characters) ? data.Characters : Array.isArray(data?.characters) ? data.characters : [];
            return [entry.key, ids.map(normalizeId).filter(Boolean)];
          } catch {
            return [entry.key, []];
          }
        })
      );
      const next = {};
      for (const [key, ids] of results) next[key] = ids;
      setIndexes(next);
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    } finally {
      setLoadingIndex(false);
    }
  };

  useEffect(() => {
    void loadIndexes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  useEffect(() => {
    if (!selectedId) return;
    if (!Array.isArray(indexes?.[category]) || !indexes[category].includes(selectedId)) {
      setSelectedId(null);
      setJsonText('');
      setDirty(false);
      loadedJsonRef.current = null;
    }
  }, [indexes, category, selectedId]);

  const loadCharacter = async id => {
    const nextId = normalizeId(id);
    if (!nextId) return;

    if (dirty) {
      const ok = window.confirm('Discard unsaved changes?');
      if (!ok) return;
    }

    setStatus(null);
    setSelectedId(nextId);
    try {
      const data = await readDbJsonFile(`DB/characters/${category}/${nextId}.json`);
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

  const saveCharacter = async () => {
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
      setStatus({ kind: 'error', message: `UniqueID must stay "${selectedId}" (use Create to add new ids).` });
      return;
    }

    try {
      await writeDbJsonFile(selectedPath, next);
      loadedJsonRef.current = next;
      setJsonText(formatJson(next));
      setDirty(false);
      setStatus({ kind: 'success', message: `Saved ${selectedPath}` });
      setRefreshToken(x => x + 1);
    } catch (error) {
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const createCharacter = async () => {
    if (!canWrite) return;
    const id = normalizeId(newId);
    if (!id) {
      setStatus({ kind: 'error', message: 'Enter a UniqueID first.' });
      return;
    }
    if (existingIds.has(id)) {
      setStatus({ kind: 'error', message: `Character already exists: ${id}` });
      return;
    }

    const templateParsed = tryParseJson(jsonText);
    const template = templateParsed.ok && templateParsed.value ? templateParsed.value : loadedJsonRef.current;
    const next = jsonClone(template && typeof template === 'object' ? template : {});
    next.UniqueID = id;
    if (!next.Charname && !next.Name) next.Charname = id;

    const filePath = `DB/characters/${category}/${id}.json`;
    const indexPath = `DB/characters/${category}/index.json`;

    setStatus({ kind: 'info', message: `Creating ${id}...` });
    try {
      await writeDbJsonFile(filePath, next);
      await updateDbJsonFile(
        indexPath,
        current => {
          const existing = Array.isArray(current?.Characters) ? current.Characters : [];
          const combined = [...existing.map(normalizeId).filter(Boolean), id];
          const unique = Array.from(new Set(combined));
          unique.sort((a, b) => a.localeCompare(b));
          return { Category: category, Characters: unique };
        },
        { createIfMissing: true }
      );

      setNewId('');
      setRefreshToken(x => x + 1);
      await loadCharacter(id);
      setStatus({ kind: 'success', message: `Created ${id}` });
    } catch (error) {
      try {
        await deleteDbPaths([filePath], { backup: false });
      } catch {
        // ignore rollback failures
      }
      setStatus({ kind: 'error', message: error?.message || String(error) });
    }
  };

  const deleteCharacter = async () => {
    if (!canWrite) return;
    if (!selectedId || !selectedPath) return;

    const ok = window.confirm(`Delete ${selectedId}? (a backup copy will be written under backups/deleted/)`);
    if (!ok) return;

    const indexPath = `DB/characters/${category}/index.json`;

    setStatus({ kind: 'info', message: `Deleting ${selectedId}...` });
    try {
      await updateDbJsonFile(
        indexPath,
        current => {
          const existing = Array.isArray(current?.Characters) ? current.Characters : [];
          const filtered = existing.map(normalizeId).filter(Boolean).filter(id => id !== selectedId);
          filtered.sort((a, b) => a.localeCompare(b));
          return { Category: category, Characters: filtered };
        },
        { createIfMissing: false }
      );

      await deleteDbPaths([selectedPath], { backup: true });
      setSelectedId(null);
      setJsonText('');
      setDirty(false);
      loadedJsonRef.current = null;
      setRefreshToken(x => x + 1);
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

    const indexPath = `DB/characters/${category}/index.json`;
    const createdPaths = [];

    setStatus({ kind: 'info', message: `Creating batch (${uniqueIds.length})...` });
    try {
      for (const id of uniqueIds) {
        const next = jsonClone(baseTemplate);
        next.UniqueID = id;
        if (!next.Charname && !next.Name) next.Charname = id;
        const filePath = `DB/characters/${category}/${id}.json`;
        await writeDbJsonFile(filePath, next);
        createdPaths.push(filePath);
      }

      await updateDbJsonFile(
        indexPath,
        current => {
          const existing = Array.isArray(current?.Characters) ? current.Characters : [];
          const combined = [...existing.map(normalizeId).filter(Boolean), ...uniqueIds];
          const unique = Array.from(new Set(combined));
          unique.sort((a, b) => a.localeCompare(b));
          return { Category: category, Characters: unique };
        },
        { createIfMissing: true }
      );

      setRefreshToken(x => x + 1);
      setStatus({ kind: 'success', message: `Created ${uniqueIds.length} character(s).` });
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
      <div className="drawer-subtitle">Characters</div>
      <div className="drawer-muted">Writes go to `public/DB/characters/**` (dev server only).</div>
      {!canWrite ? <div className="drawer-warning">Write APIs are only available on `npm run dev`.</div> : null}

      <StatusLine status={status} />

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Category</div>
          <select className="editor-select" value={category} onChange={e => setCategory(e.target.value)}>
            {CHARACTER_CATEGORIES.map(entry => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>
        <div className="editor-field">
          <div className="editor-field-label">Search</div>
          <input className="editor-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="filter ids…" />
        </div>
      </div>

      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={() => setRefreshToken(x => x + 1)} disabled={loadingIndex}>
          Refresh List
        </button>
        <button type="button" className="drawer-action-btn" onClick={saveCharacter} disabled={!canWrite || !selectedId || !dirty}>
          Save
        </button>
        <button type="button" className="drawer-action-btn" onClick={deleteCharacter} disabled={!canWrite || !selectedId}>
          Delete
        </button>
      </div>

      <ul className="inventory-list" aria-label="Characters list">
        {categoryIds.length ? (
          categoryIds.slice(0, 60).map(id => (
            <li key={id}>
              <button type="button" className={`inventory-item${selectedId === id ? ' selected' : ''}`} onClick={() => loadCharacter(id)}>
                <span className="inventory-item-name">{id}</span>
              </button>
            </li>
          ))
        ) : (
          <li className="drawer-muted">{loadingIndex ? 'Loading…' : 'No characters found.'}</li>
        )}
      </ul>
      {categoryIds.length > 60 ? <div className="drawer-muted">Showing first 60 results.</div> : null}

      <div className="editor-divider" />

      <div className="drawer-subtitle">Editor</div>
      <div className="drawer-muted">{selectedPath ? selectedPath : 'Pick a character to edit.'}</div>
      <textarea
        className="editor-textarea"
        value={jsonText}
        onChange={e => {
          setJsonText(e.target.value);
          setDirty(true);
        }}
        spellCheck={false}
        placeholder="Select a character to load JSON…"
      />

      <div className="editor-divider" />

      <div className="drawer-subtitle">Create / Batch</div>
      <div className="drawer-muted">Uses the current editor JSON as a template when possible.</div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">New UniqueID</div>
          <input className="editor-input" value={newId} onChange={e => setNewId(e.target.value)} placeholder="capri_002" />
        </div>
      </div>
      <div className="inventory-action-row">
        <button type="button" className="drawer-action-btn" onClick={createCharacter} disabled={!canWrite}>
          Create
        </button>
      </div>

      <div className="editor-row">
        <div className="editor-field">
          <div className="editor-field-label">Batch prefix</div>
          <input className="editor-input" value={batchPrefix} onChange={e => setBatchPrefix(e.target.value)} placeholder="enemy_" />
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
