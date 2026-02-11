import React from 'react';
import './LocationTitle.css';

export function LocationTitle({
  visible,
  combat,
  locationName,
  locationDescription,
  onExamineRoom,
  menuItems = [],
  hasExtraActions = false,
  onAction
}) {
  if (!visible) return null;

  const [open, setOpen] = React.useState(false);
  const closeTimerRef = React.useRef(null);

  React.useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  const scheduleClose = (delayMs = 220) => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => setOpen(false), delayMs);
  };

  const openNow = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setOpen(true);
  };

  const clickable = !combat && typeof onExamineRoom === 'function';

  const showMenu = !combat && (clickable || (Array.isArray(menuItems) && menuItems.length));

  const safeMenuItems = Array.isArray(menuItems) ? menuItems : [];
  const effectiveMenuItems = clickable
    ? [{ action: 'Examine Room', label: 'Examine', description: 'Inspect your surroundings.' }, ...safeMenuItems]
    : safeMenuItems;
  const uniqueMenuItems = (() => {
    const seen = new Set();
    return effectiveMenuItems.filter(item => {
      const key = String(item?.action ?? item?.label ?? '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  return (
    <div
      className={`location-title${hasExtraActions ? ' has-extra-actions' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      onMouseEnter={showMenu ? openNow : undefined}
      onMouseLeave={showMenu ? () => scheduleClose(240) : undefined}
      onFocus={showMenu ? openNow : undefined}
      onBlur={showMenu ? () => scheduleClose(120) : undefined}
      onClick={clickable ? onExamineRoom : undefined}
      onKeyDown={event => {
        if (!clickable) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onExamineRoom();
        }
      }}
    >
      <span className="location-title-text">{combat ? 'Fight!' : locationName}</span>

      {showMenu && open ? (
        <div
          className="location-title-tooltip"
          role="menu"
          aria-label="Location actions"
          onMouseEnter={openNow}
          onMouseLeave={() => scheduleClose(240)}
        >
          {uniqueMenuItems.map(item => {
            const action = String(item?.action ?? '').trim();
            const label = String(item?.label ?? action ?? '').trim();
            const itemTitle = String(item?.description ?? '').trim() || undefined;
            if (!action || !label) return null;
            return (
              <button
                key={`loc:${action}`}
                type="button"
                role="menuitem"
                className="location-title-tooltip-btn"
                title={itemTitle}
                onMouseDown={e => {
                  e.preventDefault();
                  if (action.toLowerCase() === 'examine room' && clickable) {
                    onExamineRoom();
                    return;
                  }
                  if (typeof onAction === 'function') onAction(action);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
