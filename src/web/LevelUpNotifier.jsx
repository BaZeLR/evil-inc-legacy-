import React, { useEffect } from 'react';

function isVideoPath(path) {
  if (!path) return false;
  return /\.(mp4|webm|ogg)(\?.*)?$/i.test(String(path));
}

export function LevelUpNotifier({
  open,
  level,
  title,
  levelsGained = 1,
  media,
  onClose,
  durationMs = 3500,
  statPoints = 0,
  onAllocatePoint
}) {
  useEffect(() => {
    if (!open) return undefined;
    if (typeof onClose !== 'function') return undefined;
    if (Number(statPoints) > 0) return undefined;
    const timerId = setTimeout(() => onClose(), durationMs);
    return () => clearTimeout(timerId);
  }, [open, durationMs, onClose, statPoints]);

  if (!open) return null;

  const mediaPath = media || null;
  const showVideo = isVideoPath(mediaPath);
  const pointsRemaining = Math.max(0, Math.trunc(Number(statPoints) || 0));
  const canAllocate = pointsRemaining > 0 && typeof onAllocatePoint === 'function';

  return (
    <div className="levelup-overlay" role="status" aria-live="polite" onClick={onClose}>
      {mediaPath ? (
        showVideo ? (
          <video className="levelup-media" src={mediaPath} autoPlay muted loop playsInline />
        ) : (
          <img className="levelup-media" src={mediaPath} alt="" />
        )
      ) : null}

      <div className="levelup-scrim" />

      <div className="levelup-card">
        <button
          type="button"
          className="levelup-close-btn"
          onClick={event => {
            event.stopPropagation();
            onClose?.();
          }}
          aria-label="Close level up"
        >
          ×
        </button>
        <div className="levelup-heading">LEVEL UP!</div>
        <div className="levelup-congrats">Congrats!</div>
        <div className="levelup-meta">
          Level {level ?? '?'}
          {levelsGained > 1 ? ` (+${levelsGained})` : ''}
        </div>
        {title ? <div className="levelup-title">{title}</div> : null}
        {canAllocate ? (
          <>
            <div className="levelup-points">Choose a stat (+1). Points left: {pointsRemaining}</div>
            <div className="levelup-actions" role="group" aria-label="Level up stat choices">
              <button
                type="button"
                className="levelup-action-btn"
                onClick={event => {
                  event.stopPropagation();
                  onAllocatePoint('power');
                }}
              >
                Power
              </button>
              <button
                type="button"
                className="levelup-action-btn"
                onClick={event => {
                  event.stopPropagation();
                  onAllocatePoint('focus');
                }}
              >
                Focus
              </button>
              <button
                type="button"
                className="levelup-action-btn"
                onClick={event => {
                  event.stopPropagation();
                  onAllocatePoint('stealth');
                }}
              >
                Stealth
              </button>
            </div>
            <div className="levelup-hint">Click outside to continue (points stay saved).</div>
          </>
        ) : (
          <div className="levelup-hint">Click to continue</div>
        )}
      </div>
    </div>
  );
}
