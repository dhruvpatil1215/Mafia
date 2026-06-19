import React, { useState } from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import HomeView from './components/HomeView';
import LobbyView from './components/LobbyView';
import GameView from './components/GameView';
import LeaderboardView from './components/LeaderboardView';

const MainApp = () => {
  const { gameState, isConnected } = useSocket();
  const [currentView, setCurrentView] = useState('home'); // 'home' | 'leaderboard'

  // Render components based on game state
  const renderContent = () => {
    // If not in a room, route based on local state (Home or Leaderboards)
    if (!gameState || gameState === 'home') {
      if (currentView === 'leaderboard') {
        return <LeaderboardView onBack={() => setCurrentView('home')} />;
      }
      return <HomeView onViewLeaderboard={() => setCurrentView('leaderboard')} />;
    }

    // Lobby state
    if (gameState === 'lobby') {
      return <LobbyView />;
    }

    // Active gameplay / Game Over states
    return <GameView />;
  };

  return (
    <div className="app-container">
      {/* Animated visual background (floating particles) */}
      <div className="bg-animated">
        <div className="particles">
          <div className="particle" style={{ top: '10%', left: '15%', animationDelay: '0s' }}></div>
          <div className="particle" style={{ top: '40%', left: '80%', animationDelay: '3s', width: '3px', height: '3px' }}></div>
          <div className="particle" style={{ top: '75%', left: '30%', animationDelay: '6s', width: '4px', height: '4px' }}></div>
          <div className="particle" style={{ top: '25%', left: '65%', animationDelay: '2s' }}></div>
          <div className="particle" style={{ top: '85%', left: '70%', animationDelay: '8s' }}></div>
          <div className="particle" style={{ top: '60%', left: '10%', animationDelay: '4s', width: '3px', height: '3px' }}></div>
        </div>
      </div>

      {/* Connection warning status banner */}
      {!isConnected && (
        <div style={{
          background: 'var(--clr-accent-dark)',
          color: 'white',
          padding: '4px 12px',
          fontSize: 'var(--fs-xs)',
          textAlign: 'center',
          fontWeight: '600',
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          borderBottom: '1px solid var(--clr-accent)',
          animation: 'timerPulse 2s infinite'
        }}>
          ⚠️ Connection lost. Attempting to reconnect...
        </div>
      )}

      {renderContent()}
    </div>
  );
};

function App() {
  return (
    <SocketProvider>
      <MainApp />
    </SocketProvider>
  );
}

export default App;
