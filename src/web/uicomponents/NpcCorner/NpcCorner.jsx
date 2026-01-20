import React from 'react';
import { humanizeId } from '../../../utils/humanize.js';
import './NpcCorner.css';

export function NpcCorner({ visible, npcs, hiddenCount, inspectTarget, onInspect }) {
  if (!visible) return null;

  const list = Array.isArray(npcs) ? npcs : [];
  const targetType = inspectTarget?.type ?? null;
  const targetId = inspectTarget?.id ?? null;

  return (
    <div className="npc-corner">
      <div className="corner-title">NPCs</div>
      <ul className="corner-list" aria-label="NPCs in location">
        {list.length ? (
          list.map((npc, idx) => {
            const rawId = npc?.id ?? npc?.UniqueID ?? null;
            const npcId = rawId ?? `${idx}`;
            const npcName = npc?.name || npc?.Name || npc?.Charname || (rawId ? humanizeId(rawId) : '') || 'NPC';
            const selected = targetType === 'npc' && targetId === npcId;
            const description = npc?.Description || npc?.description || npcName;
            return (
              <li key={npcId}>
                <button
                  type="button"
                  className={`corner-item-btn${selected ? ' selected' : ''}`}
                  onClick={() => onInspect?.('npc', npcId, npc)}
                  title={description}
                >
                  {npcName}
                </button>
              </li>
            );
          })
        ) : (
          <li className="corner-empty">None</li>
        )}
        {hiddenCount > 0 ? <li className="corner-more">+{hiddenCount}</li> : null}
      </ul>
    </div>
  );
}
