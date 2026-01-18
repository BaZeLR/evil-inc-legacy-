import React from 'react';

export function LocationView({ room, objects, npcs }) {
    if (!room) return null;
    const roomName = room.name || room.Name || 'Unknown location';
    const roomDescription = room.description || room.Description || '';
    return (
        <div className="location-view" style={{ display: 'flex', flexDirection: 'row', gap: '24px', padding: '16px' }}>
            {/* Media window */}
            <div className="media-window" style={{ flex: '0 0 320px', border: '1px solid #ccc', padding: '8px', background: '#f9f9f9' }}>
                {room.media ? (
                    <img src={room.media} alt={roomName} style={{ width: '100%', height: 'auto', borderRadius: '8px' }} />
                ) : (
                    <div style={{ width: '100%', height: '200px', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span>No image</span>
                    </div>
                )}
                <h2 style={{ marginTop: '12px' }}>{roomName}</h2>
                <p>{roomDescription}</p>
            </div>
            {/* Objects and NPCs */}
            <div className="info-columns" style={{ flex: '1', display: 'flex', flexDirection: 'row', gap: '24px' }}>
                <div className="objects-column" style={{ minWidth: '160px' }}>
                    <h3>Objects</h3>
                    <ul>
                        {objects && objects.length > 0 ? (
                            objects.map((obj, idx) => (
                                <li key={obj.id || obj.UniqueID || obj.Name || idx}>{obj.name || obj.Name || 'Unknown object'}</li>
                            ))
                        ) : (
                            <li>No objects</li>
                        )}
                    </ul>
                </div>
                <div className="npcs-column" style={{ minWidth: '160px' }}>
                    <h3>NPCs</h3>
                    <ul>
                        {npcs && npcs.length > 0 ? (
                            npcs.map((npc, idx) => (
                                <li key={npc.id || npc.UniqueID || npc.Name || npc.Charname || idx}>
                                    {npc.name || npc.Name || npc.Charname || 'Unknown NPC'}
                                </li>
                            ))
                        ) : (
                            <li>No NPCs</li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
}

// Usage example:
// <LocationView room={currentRoom} objects={roomObjects} npcs={roomNpcs} />
