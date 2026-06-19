import React, { useState, useEffect } from 'react';
import AudioService from '../services/AudioService';
import { Trophy, Search, ArrowLeft, Loader, BarChart3, User, RefreshCw, Skull, CheckCircle } from 'lucide-react';

const LeaderboardView = ({ onBack }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchNickname, setSearchNickname] = useState('');
  const [playerStats, setPlayerStats] = useState(null);
  const [playerHistory, setPlayerHistory] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Fetch top leaderboard on load
  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchNickname.trim()) return;

    setSearchLoading(true);
    setSearchError('');
    setPlayerStats(null);
    setPlayerHistory([]);

    try {
      const res = await fetch(`/api/stats/${encodeURIComponent(searchNickname.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setPlayerStats(data.stats);
        setPlayerHistory(data.history);
        AudioService.playerJoin();
      } else {
        const errData = await res.json();
        setSearchError(errData.error || 'Player stats not found.');
        AudioService.error();
      }
    } catch (err) {
      setSearchError('Network error searching stats.');
      AudioService.error();
    } finally {
      setSearchLoading(false);
    }
  };

  const handleRowClick = (nickname) => {
    setSearchNickname(nickname);
    // Trigger search
    setTimeout(() => {
      const btn = document.getElementById('search-btn');
      if (btn) btn.click();
    }, 50);
  };

  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: 'var(--sp-12)', maxWidth: '900px' }}>
      
      {/* Header */}
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
        <button onClick={onBack} className="btn btn-outline btn-icon" title="Go back to Home">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h2 className="title-section" style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Trophy size={24} style={{ color: 'var(--clr-warning)' }} /> Leaderboard & Statistics
          </h2>
          <p className="subtitle" style={{ textAlign: 'left' }}>Top Mafia agents and player stats</p>
        </div>
      </div>

      <div style={{ 
        width: '100%', 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: 'var(--sp-6)', 
        alignItems: 'start' 
      }}>

        {/* Column 1: Leaderboard Table */}
        <div className="glass-card" style={{ padding: 'var(--sp-6)' }}>
          <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-4)', borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--sp-2)' }}>
            Top 15 Agents
          </h3>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-8)' }}>
              <Loader className="animate-spin" size={24} />
            </div>
          ) : leaderboard.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--sp-6)', color: 'var(--clr-text-secondary)', fontStyle: 'italic' }}>
              No games logged yet. Play a game to record statistics!
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--clr-border-light)', color: 'var(--clr-text-secondary)', textAlign: 'left' }}>
                    <th style={{ padding: '8px 4px' }}>Rank</th>
                    <th style={{ padding: '8px' }}>Player</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Wins</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Played</th>
                    <th style={{ padding: '8px', textAlign: 'right' }}>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((item, index) => {
                    const winRate = item.gamesPlayed > 0 
                      ? Math.round((item.gamesWon / item.gamesPlayed) * 100) 
                      : 0;

                    return (
                      <tr 
                        key={item._id} 
                        onClick={() => handleRowClick(item.nickname)}
                        style={{ 
                          borderBottom: '1px solid var(--clr-border-light)', 
                          cursor: 'pointer',
                          transition: 'background var(--transition-fast)'
                        }}
                        className="player-item-row"
                      >
                        <td style={{ padding: '12px 4px', fontWeight: 'bold', color: index === 0 ? 'var(--clr-warning)' : index === 1 ? 'hsl(0, 0%, 80%)' : index === 2 ? 'hsl(30, 40%, 60%)' : 'var(--clr-text-muted)' }}>
                          #{index + 1}
                        </td>
                        <td style={{ padding: '12px', fontWeight: '500' }}>{item.nickname}</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: '600', color: 'var(--clr-success)' }}>{item.gamesWon}</td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>{item.gamesPlayed}</td>
                        <td style={{ padding: '12px', textAlign: 'right', color: 'var(--clr-primary-light)' }}>{winRate}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Column 2: Player Stats Lookups */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          
          {/* Search Box */}
          <div className="glass-card" style={{ padding: 'var(--sp-6)' }}>
            <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: 'var(--sp-3)' }}>Search Player Stats</h3>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: 'var(--sp-2)' }}>
              <input
                type="text"
                className="input"
                placeholder="Enter player nickname..."
                value={searchNickname}
                onChange={(e) => setSearchNickname(e.target.value)}
                maxLength={16}
                required
                autoComplete="off"
              />
              <button type="submit" id="search-btn" className="btn btn-primary" disabled={searchLoading}>
                {searchLoading ? <Loader className="animate-spin" size={16} /> : <Search size={16} />}
              </button>
            </form>
            {searchError && (
              <p style={{ color: 'var(--clr-accent-light)', fontSize: 'var(--fs-xs)', marginTop: 'var(--sp-2)', textAlign: 'left' }}>
                {searchError}
              </p>
            )}
          </div>

          {/* Stats Breakdown Card */}
          {playerStats && (
            <div className="glass-card animate-fade-in" style={{ padding: 'var(--sp-6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--sp-3)', marginBottom: 'var(--sp-4)' }}>
                <div style={{ background: 'var(--clr-primary-glow)', padding: 'var(--sp-2)', borderRadius: '50%', color: 'var(--clr-primary-light)' }}>
                  <User size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 'var(--fs-lg)', fontWeight: 'bold' }}>{playerStats.nickname}</h3>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>
                    Active: {new Date(playerStats.lastActive).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {/* General Win-Loss rates */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', textAlign: 'center', marginBottom: 'var(--sp-6)' }}>
                <div style={{ background: 'var(--clr-bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', display: 'block' }}>Games</span>
                  <strong style={{ fontSize: 'var(--fs-md)' }}>{playerStats.gamesPlayed}</strong>
                </div>
                <div style={{ background: 'hsla(150, 60%, 45%, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid hsla(150,60%,45%,0.15)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-success)', display: 'block' }}>Wins</span>
                  <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--clr-success-light)' }}>{playerStats.gamesWon}</strong>
                </div>
                <div style={{ background: 'var(--clr-bg-secondary)', padding: '8px', borderRadius: '6px' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', display: 'block' }}>Win Rate</span>
                  <strong style={{ fontSize: 'var(--fs-md)', color: 'var(--clr-primary-light)' }}>
                    {playerStats.gamesPlayed > 0 ? Math.round((playerStats.gamesWon / playerStats.gamesPlayed) * 100) : 0}%
                  </strong>
                </div>
              </div>

              {/* Role breakdowns */}
              <h4 style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-3)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BarChart3 size={14} /> Role Performance
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
                {/* Mafia row */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                    <span>🐺 Mafia</span>
                    <span>{playerStats.mafiaWins} W / {playerStats.mafiaPlayed} P</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${playerStats.mafiaPlayed > 0 ? (playerStats.mafiaWins / playerStats.mafiaPlayed) * 100 : 0}%`, 
                      height: '100%', 
                      background: 'var(--clr-role-mafia)' 
                    }} />
                  </div>
                </div>

                {/* Doctor row */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                    <span>🩺 Doctor</span>
                    <span>{playerStats.doctorWins} W / {playerStats.doctorPlayed} P</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${playerStats.doctorPlayed > 0 ? (playerStats.doctorWins / playerStats.doctorPlayed) * 100 : 0}%`, 
                      height: '100%', 
                      background: 'var(--clr-role-doctor)' 
                    }} />
                  </div>
                </div>

                {/* Detective row */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                    <span>🔍 Detective</span>
                    <span>{playerStats.detectiveWins} W / {playerStats.detectivePlayed} P</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${playerStats.detectivePlayed > 0 ? (playerStats.detectiveWins / playerStats.detectivePlayed) * 100 : 0}%`, 
                      height: '100%', 
                      background: 'var(--clr-role-detective)' 
                    }} />
                  </div>
                </div>

                {/* Villager row */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)', marginBottom: '4px' }}>
                    <span>👤 Villager</span>
                    <span>{playerStats.villagerWins} W / {playerStats.villagerPlayed} P</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${playerStats.villagerPlayed > 0 ? (playerStats.villagerWins / playerStats.villagerPlayed) * 100 : 0}%`, 
                      height: '100%', 
                      background: 'var(--clr-role-villager)' 
                    }} />
                  </div>
                </div>
              </div>

              {/* History list */}
              {playerHistory.length > 0 && (
                <div style={{ marginTop: 'var(--sp-6)' }}>
                  <h4 style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--sp-3)' }}>
                    Recent Match History
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {playerHistory.map(hist => {
                      const meInHist = hist.players.find(p => p.nickname.toLowerCase() === playerStats.nickname.toLowerCase());
                      const isWinner = (hist.winner === 'mafia' && meInHist?.role === 'mafia') || 
                                       (hist.winner === 'villagers' && meInHist?.role !== 'mafia');

                      return (
                        <div key={hist._id} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '8px 12px', 
                          background: 'var(--clr-bg-secondary)', 
                          borderRadius: '6px', 
                          borderLeft: `4px solid ${isWinner ? 'var(--clr-success)' : 'var(--clr-danger)'}`,
                          fontSize: 'var(--fs-xs)'
                        }}>
                          <div>
                            <span style={{ fontWeight: '600', marginRight: '6px' }}>Room {hist.roomCode}</span>
                            <span className={`badge badge-role badge-${meInHist?.role}`} style={{ padding: '0px 4px', fontSize: '10px' }}>
                              {meInHist?.role}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {meInHist?.isAlive ? (
                              <span style={{ color: 'var(--clr-success)' }} title="Survived Match"><CheckCircle size={12} /></span>
                            ) : (
                              <span style={{ color: 'var(--clr-text-muted)' }} title="Eliminated During Match"><Skull size={12} /></span>
                            )}
                            <span style={{ fontWeight: 'bold', color: isWinner ? 'var(--clr-success-light)' : 'var(--clr-text-secondary)' }}>
                              {isWinner ? 'Victory' : 'Defeat'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default LeaderboardView;
