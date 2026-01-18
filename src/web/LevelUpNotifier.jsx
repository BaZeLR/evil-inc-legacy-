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
  durationMs = 3500
}) {
  useEffect(() => {
    if (!open) return undefined;
    if (typeof onClose !== 'function') return undefined;
    const timerId = setTimeout(() => onClose(), durationMs);
    return () => clearTimeout(timerId);
  }, [open, durationMs, onClose]);

  if (!open) return null;

  const mediaPath = media || null;
  const showVideo = isVideoPath(mediaPath);

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
        <div className="levelup-heading">LEVEL UP!</div>
        <div className="levelup-congrats">Congrats!</div>
        <div className="levelup-meta">
          Level {level ?? '?'}
          {levelsGained > 1 ? ` (+${levelsGained})` : ''}
        </div>
        {title ? <div className="levelup-title">{title}</div> : null}
        <div className="levelup-hint">Click to continue</div>
      </div>
    </div>
  );
}

