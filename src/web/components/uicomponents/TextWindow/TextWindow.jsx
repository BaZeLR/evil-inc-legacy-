import React, { useEffect, useRef } from 'react';
import './TextWindow.css';

const DEBUG_DEMON_PORTRAIT = 'Assets/images/characters/enemies/vilain_harley.mp4';

export function TextWindow({
  combat,
  combatMenuEntered,
  combatDrawerActive,
  playerPortrait,
  inspectTargetType,
  inspectedTitle,
  inspectedDescriptionHtml,
  locationDescriptionHtml,
  eventMessages,
  continuePrompt,
  onContinue,
  onRichTextClick,
  onOpenCombatMenu,
  onOpenActions,
  dialogMode,
  dialogPortrait,
  narratorMode
}) {
  const inCombat = Boolean(combat);
  const showContinue = Boolean(!inCombat && continuePrompt);
  const hasStoryMessages = Boolean(!inCombat && Array.isArray(eventMessages) && eventMessages.length);
  const dialogRef = useRef(null);
  const textWindowRef = useRef(null);

  // Determine which portrait to show
  let currentPortrait = playerPortrait;
  let portraitAlt = 'Player';
  
  if (inCombat) {
    currentPortrait = playerPortrait;
    portraitAlt = 'Player';
  } else if (dialogMode && dialogPortrait) {
    currentPortrait = dialogPortrait;
    portraitAlt = 'Dialog';
  } else if (narratorMode) {
    currentPortrait = DEBUG_DEMON_PORTRAIT;
    portraitAlt = 'Narrator';
  } else if (inspectTargetType !== 'room' && inspectedDescriptionHtml) {
    currentPortrait = playerPortrait;
    portraitAlt = 'Player';
  }

  // Allow scrolling for long story text (e.g., emails) and dialog/combat.
  const canScroll = inCombat || showContinue || dialogMode || hasStoryMessages;

  // Add hover effect to show images for links
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleMouseOver = (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href');
      if (href && /\.(jpg|jpeg|png|gif|webp|mp4|webm)(\?.*)?$/i.test(href)) {
        link.style.setProperty('--link-image-url', `url(${href})`);
      }
    };

    dialog.addEventListener('mouseover', handleMouseOver);
    return () => dialog.removeEventListener('mouseover', handleMouseOver);
  }, [locationDescriptionHtml, inspectedDescriptionHtml, eventMessages]);

  // Helper to determine if portrait is video
  const isVideo = (src) => {
    return src && /\.(mp4|webm|ogg)(\?.*)?$/i.test(src);
  };

  // Render portrait element (img or video)
  const renderPortrait = (src, alt) => {
    if (!src) return null;
    
    if (isVideo(src)) {
      return (
        <video 
          src={src} 
          className="speaker-portrait" 
          autoPlay 
          loop 
          muted 
          playsInline
          style={{ objectFit: 'cover' }}
        />
      );
    }
    
    return (
      <img 
        src={src} 
        alt={alt} 
        className="speaker-portrait"
        style={{ objectFit: 'cover' }}
      />
    );
  };

  return (
    <section className={`text-window text-overlay${canScroll ? ' can-scroll' : ''}`} ref={textWindowRef}>
      <div className="text-window-content">
        {inCombat ? (
          <button
            type="button"
            className={`speaker-icon speaker-icon-btn${combatDrawerActive ? ' active' : ''}`}
            aria-label="Combat menu"
            title="Combat menu"
            onClick={onOpenCombatMenu}
          >
            {renderPortrait(currentPortrait, portraitAlt)}
          </button>
        ) : currentPortrait && (dialogMode || narratorMode || inspectedDescriptionHtml) ? (
          <span className="speaker-icon" aria-hidden="true">
            {renderPortrait(currentPortrait, portraitAlt)}
          </span>
        ) : (
          <span className="speaker-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="12" r="6" />
              <rect x="10" y="20" width="12" height="7" rx="3" />
            </svg>
          </span>
        )}
        <div className="text-dialog" ref={dialogRef}>
          {inCombat ? (
            <>
              <div className="combat-header">
                <div className="combat-title">{combat.enemyName}</div>
                <div className="combat-hp">
                  You: {combat.playerHp}/{combat.playerMaxHp} · Energy: {combat.playerEnergy}/{combat.playerMaxEnergy} · Foe:{' '}
                  {combat.enemyHp}/{combat.enemyMaxHp}
                </div>
              </div>

              <div className="combat-log" aria-label="Combat messages">
                {(combat.log || []).slice(-8).map(entry => (
                  <div key={entry.id} className={`combat-log-line ${entry.kind || 'system'}`} dangerouslySetInnerHTML={{ __html: entry.html }} />
                ))}
              </div>

              {!combat.winner ? (
                <div className="combat-hint">
                  {combatMenuEntered
                    ? 'Fight menu is on the left (>) for actions.'
                    : 'Press > (bottom-right) or Fight! to open the fight menu; or Run! to attempt escape.'}
                </div>
              ) : (
                <div className="combat-hint">Open the fight menu (&gt;) to continue.</div>
              )}
            </>
          ) : hasStoryMessages ? (
            <>
              {inspectTargetType !== 'room' && inspectedTitle ? <p className="dialog-title">{inspectedTitle}</p> : null}
              {eventMessages.map(entry => (
                <p
                  key={entry.key}
                  className="system-message"
                  onClick={onRichTextClick}
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                />
              ))}
            </>
          ) : inspectTargetType !== 'room' && (inspectedTitle || inspectedDescriptionHtml) ? (
            <>
              {inspectedTitle ? <p className="dialog-title">{inspectedTitle}</p> : null}
              {inspectedDescriptionHtml ? <p onClick={onRichTextClick} dangerouslySetInnerHTML={{ __html: inspectedDescriptionHtml }} /> : null}
              <div className="dialog-muted-hint">Open Actions (bottom-right) to interact.</div>
            </>
          ) : (
            <p onClick={onRichTextClick} dangerouslySetInnerHTML={{ __html: locationDescriptionHtml }} />
          )}

          {!inCombat && !hasStoryMessages && Array.isArray(eventMessages) && eventMessages.length ? (
            <div className="system-messages" aria-label="System messages">
              {eventMessages.map(entry => (
                <p
                  key={entry.key}
                  className="system-message"
                  onClick={onRichTextClick}
                  dangerouslySetInnerHTML={{ __html: entry.html }}
                />
              ))}
            </div>
          ) : null}
          {!inCombat && !showContinue ? <p>What do you do?</p> : null}
        </div>
      </div>

      {inCombat || showContinue ? (
        <button
          className={`next-btn${showContinue ? ' next-btn-continue next-btn-blink' : ''}`}
          type="button"
          aria-label={inCombat ? 'Combat menu' : 'Continue'}
          onClick={inCombat ? onOpenCombatMenu : onContinue}
        >
          {inCombat ? '>' : 'Continue'}
        </button>
      ) : null}
    </section>
  );
}
