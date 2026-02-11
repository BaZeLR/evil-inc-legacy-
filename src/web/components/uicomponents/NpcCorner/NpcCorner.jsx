import React from 'react';
import { humanizeId } from '../../../../utils/humanize.js';
import './NpcCorner.css';

export function NpcCorner({
  visible,
  npcs,
  hiddenCount,
  inspectTarget,
  hoveredMenuId,
  setHoveredMenuId,
  getVendorShopEntries,
  onInspect,
  onTalk,
  onShop
}) {
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

            const vendorEntries = typeof getVendorShopEntries === 'function' ? getVendorShopEntries(npc) : [];
            const canShop = Array.isArray(vendorEntries) && vendorEntries.length > 0;
            return (
              <li key={npcId}>
                <div
                  className={`corner-item-wrap${selected ? ' selected' : ''}`}
                >
                  <button
                    type="button"
                    className={`corner-item-btn${selected ? ' selected' : ''}`}
                    onMouseDown={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      onInspect?.('npc', npcId, npc);
                      setHoveredMenuId?.(prev => (prev === npcId ? null : npcId));
                    }}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    title={description}
                  >
                    {npcName}
                  </button>

                  {hoveredMenuId === npcId ? (
                    <div className="corner-tooltip" role="menu" aria-label={`${npcName} actions`}>
                      <button
                        type="button"
                        className="corner-tooltip-btn"
                        onClick={event => {
                          event.stopPropagation();
                          setHoveredMenuId?.(null);
                          onTalk?.(npc);
                        }}
                      >
                        Talk
                      </button>

                      {canShop ? (
                        <button
                          type="button"
                          className="corner-tooltip-btn"
                          onClick={event => {
                            event.stopPropagation();
                            setHoveredMenuId?.(null);
                            onShop?.(npc);
                          }}
                        >
                          Shop
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
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
