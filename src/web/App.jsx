import React from 'react';
import { GameUI } from './GameUI.jsx';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { HashRouter } from 'react-router-dom';
import { RouteSync } from './routes/RouteSync.jsx';

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <RouteSync />
        <GameUI />
      </HashRouter>
    </ErrorBoundary>
  );
}
