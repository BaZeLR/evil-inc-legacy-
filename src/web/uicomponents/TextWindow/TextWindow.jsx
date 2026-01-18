import React from 'react';
import './TextWindow.css';

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
  onRichTextClick,
  onOpenCombatMenu,
  onOpenActions
}) {
  const inCombat = Boolean(combat);

  return (
    <section className="text-window text-overlay">
      <div className="text-window-content">
        {inCombat ? (
          <button
            type="button"
            className={`speaker-icon speaker-icon-btn${combatDrawerActive ? ' active' : ''}`}
            aria-label="Combat menu"
            title="Combat menu"
            onClick={onOpenCombatMenu}
          >
            <img src={playerPortrait} alt="" className="speaker-portrait" />
          </button>
        ) : (
          <span className="speaker-icon" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="16" cy="12" r="6" />
              <rect x="10" y="20" width="12" height="7" rx="3" />
            </svg>
          </span>
        )}
        <div className="text-dialog">
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
          ) : inspectTargetType !== 'room' && (inspectedTitle || inspectedDescriptionHtml) ? (
            <>
              {inspectedTitle ? <p className="dialog-title">{inspectedTitle}</p> : null}
              {inspectedDescriptionHtml ? <p onClick={onRichTextClick} dangerouslySetInnerHTML={{ __html: inspectedDescriptionHtml }} /> : null}
              <div className="dialog-muted-hint">Open Actions (bottom-right) to interact.</div>
            </>
          ) : (
            <p onClick={onRichTextClick} dangerouslySetInnerHTML={{ __html: locationDescriptionHtml }} />
          )}

          {!inCombat && Array.isArray(eventMessages) && eventMessages.length ? (
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
          {!inCombat ? <p>What do you do?</p> : null}
        </div>
      </div>

      <button
        className={`next-btn${inCombat ? '' : ' next-btn-actions'}`}
        type="button"
        aria-label={inCombat ? 'Combat menu' : 'Actions'}
        onClick={inCombat ? onOpenCombatMenu : onOpenActions}
      >
        {inCombat ? '>' : 'Actions'}
      </button>
    </section>
  );
}
