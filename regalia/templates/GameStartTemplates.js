// GameStartTemplates.js
// React-style templates for game start sequence

export const AgeGate = ({ onAccept }) => (
  <div className="age-gate">
    <h2>Age Verification</h2>
    <p>You must be 18+ to play this game. Are you of legal age?</p>
    <button onClick={onAccept}>Yes, I am 18 or older</button>
  </div>
);

export const PlayerMessage = ({ onContinue }) => (
  <div className="player-message">
    <h2>Welcome to Regalia!</h2>
    <p>To players: Disregard spelling and grammar. This is a story in progress. Enjoy!</p>
    <button onClick={onContinue}>Continue...</button>
  </div>
);


export const MainUI = ({ player, room, media, npcs, onContinue }) => (
  <div className="game-layout">
    <div className="text-panel">
      <div className="event-text">{room.eventText}</div>
      <button className="continue-btn" onClick={onContinue}>Continue...</button>
    </div>
    <div className="media-panel" style={{ background: 'black' }}>
      <div className="room-header">
        <span>{room.name}</span>
        <button className="nav-btn">Go</button>
      </div>
      <div className="media-content">
        {media.type === 'image' && <div className="placeholder-img">[Image Placeholder]</div>}
        {media.type === 'video' && <div className="placeholder-video">[Video Placeholder]</div>}
      </div>
      <div className="npc-icons">
        {npcs.map(npc => (
          <div key={npc.id} className="npc-icon">[NPC: {npc.name}]</div>
        ))}
        <div className="player-icon">[Player: {player.name}]</div>
      </div>
    </div>
  </div>
);
