import React from 'react';
import { humanizeId } from '../../../../utils/humanize.js';
import './ObjectsCorner.css';

export function ObjectsCorner({
  visible,
  objects,
  hiddenCount,
  inspectTarget,
  hoveredMenuId,
  setHoveredMenuId,
  credits,
  hasInventoryItem,
  canTakeObject,
  getVendorShopEntries,
  onInspect,
  onExamine,
  onBuy,
  onShop,
  onTake
}) {
  if (!visible) return null;

  const list = Array.isArray(objects) ? objects : [];
  const targetType = inspectTarget?.type ?? null;
  const targetId = inspectTarget?.id ?? null;

  return (
    <div className="objects-corner">
      <div className="corner-title">Objects</div>
      <ul className="corner-list" aria-label="Objects in location">
        {list.length ? (
          list.map((obj, idx) => {
            const rawId = obj?.id ?? obj?.UniqueID ?? null;
            const objId = rawId ?? `${idx}`;
            const objName = obj?.name || obj?.Name || (rawId ? humanizeId(rawId) : '') || 'Object';
            const selected = targetType === 'object' && targetId === objId;

            const canTake = typeof canTakeObject === 'function' ? canTakeObject(obj) : false;
            const vendorShopEntries = typeof getVendorShopEntries === 'function' ? getVendorShopEntries(obj) : [];
            const canShop = vendorShopEntries.length > 0;

            return (
              <li key={objId}>
                <div
                  className="corner-item-wrap"
                >
                  <button
                    type="button"
                    className={`corner-item-btn${selected ? ' selected' : ''}`}
                    onMouseDown={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      onInspect?.('object', objId, obj);
                      setHoveredMenuId?.(prev => (prev === objId ? null : objId));
                    }}
                    onClick={event => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    {objName}
                  </button>

                  {hoveredMenuId === objId ? (
                    <div className="corner-tooltip" role="menu" aria-label={`${objName} actions`}>
                      <button
                        type="button"
                        className="corner-tooltip-btn"
                        onClick={event => {
                          event.stopPropagation();
                          setHoveredMenuId?.(null);
                          onExamine?.(obj);
                        }}
                      >
                        Examine
                      </button>

                      {canShop
                        ? vendorShopEntries.map(entry => {
                            const owned = hasInventoryItem?.(entry.itemId) && !entry.stackable;
                            const affordable = credits >= entry.price;
                            return (
                              <button
                                key={`${objId}:${entry.itemId}`}
                                type="button"
                                className="corner-tooltip-btn"
                                disabled={owned || !affordable}
                                title={owned ? 'Already owned' : !affordable ? 'Not enough credits' : `Buy for ${entry.price} credits`}
                                onClick={event => {
                                  event.stopPropagation();
                                  setHoveredMenuId?.(null);
                                  onBuy?.({ vendorId: objId, itemId: entry.itemId, price: entry.price });
                                }}
                              >
                                Buy {entry.itemName} ({entry.price}c)
                              </button>
                            );
                          })
                        : null}

                      {canShop ? (
                        <button
                          type="button"
                        className="corner-tooltip-btn"
                        onClick={event => {
                          event.stopPropagation();
                          setHoveredMenuId?.(null);
                          onShop?.(obj);
                        }}
                      >
                        Shop
                      </button>
                      ) : null}

                      <button
                        type="button"
                        className="corner-tooltip-btn"
                        disabled={!canTake}
                        onClick={event => {
                          event.stopPropagation();
                          setHoveredMenuId?.(null);
                          onTake?.(obj);
                        }}
                      >
                        Take
                      </button>
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
