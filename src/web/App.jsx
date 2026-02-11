import React, { useEffect, useState } from 'react';
import { GameUI } from './GameUI.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { HashRouter } from 'react-router-dom';
import { RouteSync } from './routes/RouteSync.jsx';
import { StartScreen } from './components/StartScreen.jsx';

export default function App() {
  const [startFlowOpen, setStartFlowOpen] = useState(true);
  const [hasExistingSave, setHasExistingSave] = useState(false);
  const [startRequest, setStartRequest] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    const checkSaves = async () => {
      let localSave = false;
      try {
        localSave = Boolean(localStorage.getItem('savegame'));
      } catch {
        localSave = false;
      }

      let fileSave = false;
      try {
        const response = await fetch('/DB/savegame.json', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          fileSave = Boolean(data?.updatedAt) || Boolean(data?.player && Object.keys(data.player).length);
        }
      } catch {
        fileSave = false;
      }

      if (!cancelled) setHasExistingSave(localSave || fileSave);
    };

    void checkSaves();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStartRequest = payload => {
    setStartFlowOpen(false);
    setStartRequest({
      variant: payload?.variant || 'prologue',
      playIntro: Boolean(payload?.playIntro),
      requestId: Date.now()
    });
  };

  return (
    <ErrorBoundary>
      {startFlowOpen ? (
        <StartScreen
          onPlayIntro={() => handleStartRequest({ variant: 'prologue', playIntro: true })}
          onSkipIntro={() => handleStartRequest({ variant: 'skip', playIntro: false })}
          onContinue={hasExistingSave ? () => setStartFlowOpen(false) : null}
        />
      ) : (
        <HashRouter>
          <RouteSync />
          <GameUI
            startRequest={startRequest}
            onStartRequestHandled={() => setStartRequest(null)}
            onRequestStartFlow={() => setStartFlowOpen(true)}
          />
        </HashRouter>
      )}
    </ErrorBoundary>
  );
}
