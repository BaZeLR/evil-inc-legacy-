import React from 'react';
import './PlayerDrawer.css';

export function PlayerDrawer({
  player,
  playerPortraitUrl,
  mentalLevelDisplay,
  mentalDescription,
  power,
  focus,
  stealth,
  hp,
  maxHp,
  energy,
  maxEnergy,
  equippedBonuses,
  speed,
  experience,
  expToNext,
  daysInGame,
  notoriety,
  maxNotoriety,
  credits,
  onShowAchievements,
  onShowAbilities
}) {
  return (
    <div className="drawer-body player-drawer">
      <div className="player-drawer-header">
        <img src={playerPortraitUrl} alt="" className="player-drawer-portrait" />
        <div className="player-drawer-header-meta">
          <div className="drawer-subtitle">{player?.Name || 'Player'}</div>
          {player?.Description ? <div className="player-drawer-description">{player.Description}</div> : null}
        </div>
      </div>

      <div className="player-drawer-buttons">
        <button type="button" className="drawer-action-btn" onClick={onShowAbilities}>
          Abilities
        </button>
        <button type="button" className="drawer-action-btn" onClick={onShowAchievements}>
          Achievements
        </button>
      </div>

      <div className="player-drawer-stats-grid">
        <div className="player-drawer-stats-col">
          <div className="player-drawer-section">
            <div className="player-drawer-section-title">Basic Stats</div>
            <div className="stat-grid">
              <div className="stat-row">
                <span className="stat-label">Power</span>
                <span className="stat-value">{power}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Focus</span>
                <span className="stat-value">{focus}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Stealth</span>
                <span className="stat-value">{stealth}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Health</span>
                <span className="stat-value">
                  {hp}/{maxHp}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Energy</span>
                <span className="stat-value">
                  {energy}/{maxEnergy}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Notoriety</span>
                <span className="stat-value">
                  {notoriety}/{maxNotoriety}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Credits</span>
                <span className="stat-value">{credits}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="player-drawer-stats-col">
          <div className="player-drawer-section">
            <div className="player-drawer-section-title">Combat Stats</div>
            <div className="stat-grid">
              <div className="stat-row">
                <span className="stat-label">Weapon Dmg</span>
                <span className="stat-value">{equippedBonuses?.ms ?? 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Armor Defense</span>
                <span className="stat-value">{equippedBonuses?.defence ?? 0}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Speed</span>
                <span className="stat-value">{speed}</span>
              </div>
            </div>
          </div>

          <div className="player-drawer-section">
            <div className="player-drawer-section-title">Progress</div>
            <div className="stat-grid">
              <div className="stat-row">
                <span className="stat-label">Mental Status</span>
                <span className="stat-value">{mentalLevelDisplay}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Exp</span>
                <span className="stat-value">{expToNext ? `${experience}/${expToNext}` : 'MAX'}</span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Days</span>
                <span className="stat-value">{daysInGame}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {mentalDescription ? <div className="drawer-muted player-drawer-mental-desc">{mentalDescription}</div> : null}
    </div>
  );
}
