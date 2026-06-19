import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import AudioService from '../services/AudioService';
import { 
  Sun, Moon, Users, Clock, Send, Eye, Shield, Search, 
  UserX, Skull, AlertCircle, RefreshCw, Trophy, MessageSquare 
} from 'lucide-react';

const GameView = () => {
  const {
    player,
    players,
    hostId,
    roomCode,
    gameState,
    round,
    mafiaMembers,
    eliminatedPlayers,
    winner,
    settings,
    transitionStep,
    transitionData,
    chatMessages,
    actionPrompt,
    actionConfirmed,
    detectiveResult,
    voteUpdate,
    voteResults,
    mafiaVoteState,
    nightStep,
    nightStepDuration,
    errorMsg,
    leaveRoom,
    playAgain,
    sendChatMessage,
    submitMafiaAction,
    submitDoctorAction,
    submitDetectiveAction,
    castVote
  } = useSocket();

  const [chatInput, setChatInput] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [activeTab, setActiveTab] = useState('discussion'); // 'discussion' | 'spectator' (for dead players)
  const chatEndRef = useRef(null);

  // Reset selected target on every phase/step change so actions are re-enabled each round/step
  useEffect(() => {
    setSelectedTarget('');
  }, [gameState, round, nightStep]);

  // Synchronise countdown timer — ticks per night step, not the full night
  useEffect(() => {
    let duration = 0;
    if (gameState === 'night') {
      // Only count down once the step starts (nightStepDuration > 0)
      duration = nightStepDuration > 0 ? nightStepDuration : 0;
    } else if (gameState === 'day-transition') {
      duration = transitionStep === 'wakeup' ? 4 : 5;
    } else if (gameState === 'day-discussion' && settings) {
      duration = settings.dayDiscussionDuration;
    } else if (gameState === 'day-voting' && settings) {
      duration = settings.dayVotingDuration;
    }

    setTimerSeconds(duration);

    if (duration === 0) return;

    const interval = setInterval(() => {
      setTimerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        // Play tick sound on last 5 seconds
        if (prev <= 6 && gameState !== 'day-transition') {
          AudioService.tick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, transitionStep, settings, nightStep, nightStepDuration]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, activeTab]);

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    sendChatMessage(chatInput);
    setChatInput('');
  };

  const handleNightActionSubmit = (targetId) => {
    if (actionConfirmed) return;
    setSelectedTarget(targetId);
    
    if (player.role === 'mafia') {
      submitMafiaAction(targetId);
    } else if (player.role === 'doctor') {
      submitDoctorAction(targetId);
    } else if (player.role === 'detective') {
      submitDetectiveAction(targetId);
    }
    AudioService.voteClick();
  };

  const handleVoteSubmit = (targetId) => {
    castVote(targetId);
    setSelectedTarget(targetId);
    AudioService.voteClick();
  };

  // Helper properties
  const isMeAlive = player ? player.isAlive : false;
  const isMeHost = player ? player.id === hostId : false;

  // Render role reveal intro
  if (gameState === 'starting') {
    const roleIcon = () => {
      if (player?.role === 'mafia') return '🐺';
      if (player?.role === 'doctor') return '🩺';
      if (player?.role === 'detective') return '🔍';
      return '👤';
    };

    const roleName = () => {
      if (player?.role === 'mafia') return 'Mafia';
      if (player?.role === 'doctor') return 'Doctor';
      if (player?.role === 'detective') return 'Detective';
      return 'Villager';
    };

    const roleDesc = () => {
      if (player?.role === 'mafia') return 'Your goal is to eliminate all villagers. Vote secretly each night to kill a player.';
      if (player?.role === 'doctor') return 'Your goal is to protect the town. Save one player from elimination each night.';
      if (player?.role === 'detective') return 'Your goal is to investigate. Inspect one player each night to see if they are Mafia.';
      return 'Your goal is to survive and find the Mafia. Discuss and vote during the day to eliminate suspects.';
    };

    return (
      <div className="page-container animate-fade-in" style={{ justifyContent: 'center' }}>
        <div className={`glass-card role-card ${player?.role}`} style={{ maxWidth: '500px', width: '100%', padding: 'var(--sp-10)' }}>
          <div className="role-icon">{roleIcon()}</div>
          <h2 className="role-name">{roleName()}</h2>
          <div style={{ textTransform: 'uppercase', letterSpacing: '1px', fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)', marginBottom: 'var(--sp-4)', fontWeight: 'bold' }}>
            Team: {player?.role === 'mafia' ? '🐺 Evil / Mafia' : '🏘️ Good / Town'}
          </div>
          <p className="role-desc" style={{ marginBottom: 'var(--sp-6)' }}>{roleDesc()}</p>
          
          {player?.role === 'mafia' && mafiaMembers.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)', marginBottom: 'var(--sp-2)' }}>
              <div style={{ fontWeight: '600', color: 'var(--clr-danger)', marginBottom: 'var(--sp-2)', fontSize: 'var(--fs-sm)' }}>
                Your Mafia Partners:
              </div>
              <ul style={{ listStyle: 'none' }}>
                {mafiaMembers.map(m => (
                  <li key={m.id} style={{ fontWeight: '500', fontSize: 'var(--fs-sm)' }}>🗡️ {m.nickname}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ color: 'var(--clr-text-secondary)', fontSize: 'var(--fs-xs)', fontStyle: 'italic', marginTop: 'var(--sp-6)' }}>
            The first night will fall shortly... Prepare yourself.
          </div>
        </div>
      </div>
    );
  }

  // Render Game Over Scoreboard
  if (gameState === 'game-over') {
    return (
      <div className="page-container animate-fade-in" style={{ paddingBottom: 'var(--sp-12)' }}>
        <div className="glass-card" style={{ maxWidth: '700px', width: '100%', padding: 'var(--sp-8)', textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: 'var(--sp-2)' }}>🏆</div>
          <h1 className="title-hero" style={{ fontSize: 'var(--fs-4xl)', marginBottom: 'var(--sp-2)' }}>
            {winner === 'mafia' ? 'MAFIA WINS' : 'VILLAGERS WIN'}
          </h1>
          <p className="subtitle" style={{ marginBottom: 'var(--sp-6)' }}>
            {winner === 'mafia' 
              ? 'The town has fallen. Mafia members have successfully taken control.' 
              : 'All Mafia members have been successfully hunted down.'}
          </p>

          <h3 style={{ fontSize: 'var(--fs-md)', borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--sp-2)', marginBottom: 'var(--sp-4)', textAlign: 'left' }}>
            Final Player Reveals
          </h3>

          <div className="player-list" style={{ gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
            {players.map(p => {
              const avatarHue = (p.nickname.length * 45) % 360;
              const avatarBg = `hsl(${avatarHue}, 60%, 45%)`;

              return (
                <div key={p.id} className="player-item" style={{ opacity: p.isAlive ? 1 : 0.6 }}>
                  <div className="player-avatar" style={{ backgroundColor: avatarBg }}>
                    {p.nickname.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="player-info" style={{ textAlign: 'left' }}>
                    <div className="player-name" style={{ fontWeight: 'bold' }}>
                      {p.nickname} {!p.isAlive && <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-xs)' }}>(Eliminated)</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                      <span className={`badge badge-role badge-${p.role}`}>
                        {p.role}
                      </span>
                      {p.isAlive ? (
                        <span className="badge badge-alive">Survived</span>
                      ) : (
                        <span className="badge badge-dead"><Skull size={10} style={{ marginRight: '3px' }} /> Eliminated</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            {isMeHost ? (
              <button onClick={playAgain} className="btn btn-primary btn-lg btn-full">
                <RefreshCw size={20} /> Play Again
              </button>
            ) : (
              <div style={{ background: 'var(--clr-bg-secondary)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)' }}>
                <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)', display: 'block' }}>
                  Waiting for host to start a new round...
                </span>
              </div>
            )}

            <button onClick={leaveRoom} className="btn btn-outline btn-full">
              Exit to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Game Play layout
  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: 'var(--sp-8)' }}>
      
      {/* HUD Header */}
      <div style={{ 
        width: '100%', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: 'var(--sp-4)', 
        marginBottom: 'var(--sp-6)' 
      }}>
        
        {/* Phase Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          {gameState === 'night' ? (
            <div className="phase-indicator night">
              <Moon size={16} /> NIGHT {round}
            </div>
          ) : (
            <div className="phase-indicator day">
              <Sun size={16} /> {gameState === 'day-voting' ? `VOTING ${round}` : `DAY ${round}`}
            </div>
          )}
          
          <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)' }}>
            Room: <strong style={{ color: 'var(--clr-primary-light)' }}>{roomCode}</strong>
          </div>
        </div>

        {/* Timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <div className={`timer ${timerSeconds <= 5 ? 'critical' : timerSeconds <= 15 ? 'warning' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
            <Clock size={20} />
            <span>{timerSeconds}s</span>
          </div>
        </div>

      </div>

      {/* Main layout grid */}
      <div style={{ 
        width: '100%', 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: 'var(--sp-6)', 
        alignItems: 'stretch' 
      }}>

        {/* Column Left: Actions / Player roster */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', position: 'relative' }}>
          
          {/* Night Visual dim mask overlay */}
          {gameState === 'night' && (
            <div className="bg-night-overlay" style={{ 
              position: 'absolute', 
              top: 0, left: 0, right: 0, bottom: 0, 
              background: 'radial-gradient(circle, rgba(10,10,30,0.4) 0%, rgba(5,5,15,0.7) 100%)', 
              pointerEvents: 'none', 
              zIndex: 0,
              borderRadius: 'var(--radius-lg)'
            }} />
          )}

          <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--sp-4)' }}>
            
            {/* Identity Banner */}
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              paddingBottom: 'var(--sp-3)', 
              borderBottom: '1px solid var(--clr-border-light)' 
            }}>
              <div>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-secondary)', textTransform: 'uppercase', display: 'block' }}>YOUR ROLE</span>
                <span className={`badge badge-role badge-${player?.role}`} style={{ fontSize: 'var(--fs-sm)' }}>
                  {player?.role === 'mafia' ? '🐺 Mafia' : player?.role === 'doctor' ? '🩺 Doctor' : player?.role === 'detective' ? '🔍 Detective' : '👤 Villager'}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-secondary)', textTransform: 'uppercase', display: 'block' }}>STATUS</span>
                {isMeAlive ? (
                  <span className="badge badge-alive">ALIVE</span>
                ) : (
                  <span className="badge badge-dead"><Skull size={10} style={{ marginRight: '3px' }} /> ELIMINATED</span>
                )}
              </div>
            </div>

            {/* --- NIGHT ACTION PHASE PANEL --- */}
            {gameState === 'night' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                <h3 style={{ fontSize: 'var(--fs-md)', display: 'flex', alignItems: 'center', gap: '8px', color: 'hsl(220, 70%, 75%)' }}>
                  <Moon size={16} /> Night Activities
                </h3>

                {/* Night step banner — shows whose turn it is */}
                {nightStep && (
                  <div style={{
                    background: nightStep === 'mafia'
                      ? 'hsla(0,70%,40%,0.15)'
                      : nightStep === 'doctor'
                        ? 'hsla(150,60%,40%,0.15)'
                        : 'hsla(210,70%,50%,0.15)',
                    border: `1px solid ${
                      nightStep === 'mafia' ? 'var(--clr-role-mafia)'
                      : nightStep === 'doctor' ? 'var(--clr-success)'
                      : 'var(--clr-role-detective)'
                    }`,
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--sp-3) var(--sp-4)',
                    fontSize: 'var(--fs-sm)',
                    fontWeight: '600',
                    textAlign: 'center',
                    animation: 'timerPulse 2s infinite'
                  }}>
                    {nightStep === 'mafia' && '🐺 Mafia is awake — choosing a target...'}
                    {nightStep === 'doctor' && '🩺 Doctor is awake — protecting someone...'}
                    {nightStep === 'detective' && '🔍 Detective is awake — investigating...'}
                  </div>
                )}

                {isMeAlive ? (
                  <div>
                    {actionPrompt && actionPrompt.targets.length > 0 ? (
                      <div>
                        <p style={{ color: 'var(--clr-text-secondary)', fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-3)' }}>
                          {actionPrompt.prompt}:
                        </p>

                        {actionConfirmed ? (
                          <div style={{ background: 'hsla(150, 60%, 45%, 0.1)', border: '1px solid var(--clr-success)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                            <p style={{ color: 'var(--clr-success-light)', fontWeight: '600' }}>Choice Confirmed!</p>
                            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-secondary)', marginTop: '4px' }}>
                              Target: {players.find(p => p.id === selectedTarget)?.nickname || 'Selected'}
                            </p>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
                            {actionPrompt.targets.map(t => {
                              const isTargetVotedByMafia = Object.values(mafiaVoteState).includes(t.id);
                              const mafiaVotersOnTarget = Object.entries(mafiaVoteState)
                                .filter(([voterId, targetId]) => targetId === t.id)
                                .map(([voterId]) => players.find(p => p.id === voterId)?.nickname || 'Partner');

                              return (
                                <button
                                  key={t.id}
                                  onClick={() => handleNightActionSubmit(t.id)}
                                  className="btn btn-outline btn-full"
                                  style={{ justifyContent: 'space-between', padding: 'var(--sp-3) var(--sp-4)', borderColor: 'var(--clr-border-light)' }}
                                >
                                  <span>{t.nickname}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {player.role === 'mafia' && isTargetVotedByMafia && (
                                      <span style={{ fontSize: 'var(--fs-xs)', background: 'var(--clr-role-mafia)', color: 'white', padding: '1px 6px', borderRadius: '4px' }}>
                                        Vote: {mafiaVotersOnTarget.join(', ')}
                                      </span>
                                    )}
                                    {player.role === 'mafia' && <UserX size={14} />}
                                    {player.role === 'doctor' && <Shield size={14} />}
                                    {player.role === 'detective' && <Search size={14} />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--clr-text-secondary)', fontStyle: 'italic' }}>
                        {actionPrompt?.role === 'sleeping'
                          ? actionPrompt.prompt
                          : 'You have no actions tonight. Wait for morning...'}
                      </div>
                    )}

                    {player.role === 'detective' && detectiveResult && (
                      <div style={{ marginTop: 'var(--sp-4)', background: 'hsla(210, 70%, 55%, 0.1)', border: '1px solid var(--clr-role-detective)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)' }}>
                        <h4 style={{ color: 'var(--clr-role-detective)', fontSize: 'var(--fs-sm)', fontWeight: 'bold' }}>Investigation Report:</h4>
                        <p style={{ fontSize: 'var(--fs-sm)', marginTop: '4px' }}>
                          <strong>{detectiveResult.targetNickname}</strong> is {detectiveResult.isMafia ? (
                            <span style={{ color: 'var(--clr-role-mafia)', fontWeight: 'bold' }}>🐺 MAFIA!</span>
                          ) : (
                            <span style={{ color: 'var(--clr-success)', fontWeight: 'bold' }}>🏘️ innocent villager.</span>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--clr-text-secondary)', fontStyle: 'italic' }}>
                    You are eliminated. Spectating the night...
                  </div>
                )}
              </div>
            )}

            {/* --- MORNING NARRATIVE STEP PANELS --- */}
            {gameState === 'day-transition' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'var(--sp-4) 0' }}>
                {transitionStep === 'wakeup' ? (
                  <div>
                    <div style={{ fontSize: '3rem', animation: 'timerPulse 1.5s infinite', marginBottom: 'var(--sp-2)' }}>🌅</div>
                    <h3>WAKING UP...</h3>
                    <p style={{ color: 'var(--clr-text-secondary)', fontSize: 'var(--fs-sm)', marginTop: 'var(--sp-2)' }}>
                      Townsfolk are waking up to check on their neighbors.
                    </p>
                  </div>
                ) : (
                  <div>
                    {transitionData?.killedPlayer ? (
                      <div>
                        <div style={{ fontSize: '3rem', color: 'var(--clr-accent)', marginBottom: 'var(--sp-2)' }}>💀</div>
                        <h3 style={{ color: 'var(--clr-accent-light)' }}>MURDER!</h3>
                        <p style={{ fontSize: 'var(--fs-md)', margin: 'var(--sp-2) 0' }}>
                          <strong>{transitionData.killedPlayer.nickname}</strong> was found dead in their bed last night.
                        </p>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)' }}>
                          They were a <strong style={{ color: 'white', textTransform: 'capitalize' }}>{transitionData.killedPlayer.role}</strong>.
                        </p>
                      </div>
                    ) : transitionData?.wasSaved ? (
                      <div>
                        <div style={{ fontSize: '3rem', color: 'var(--clr-success)', marginBottom: 'var(--sp-2)' }}>🩺</div>
                        <h3 style={{ color: 'var(--clr-success-light)' }}>SAVE SUCCESS!</h3>
                        <p style={{ fontSize: 'var(--fs-md)', margin: 'var(--sp-2) 0' }}>
                          The Mafia targeted someone last night, but the Doctor was there to protect them!
                        </p>
                        <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)' }}>
                          Nobody died tonight.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: '3rem', color: 'var(--clr-success)', marginBottom: 'var(--sp-2)' }}>🕊️</div>
                        <h3>PEACEFUL NIGHT</h3>
                        <p style={{ fontSize: 'var(--fs-md)', margin: 'var(--sp-2) 0' }}>
                          Nothing happened. The night was peaceful.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* --- DAY DISCUSSION & VOTING ROSTER PANEL --- */}
            {(gameState === 'day-discussion' || gameState === 'day-voting') && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
                <h3 style={{ fontSize: 'var(--fs-md)', borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--sp-2)' }}>
                  {gameState === 'day-voting' ? 'Cast Your Secret Vote' : 'Alive Players'}
                </h3>

                {gameState === 'day-voting' && isMeAlive && (
                  <div style={{ background: 'rgba(0,0,0,0.15)', padding: 'var(--sp-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)', marginBottom: 'var(--sp-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-xs)' }}>
                      <span>Voted Status:</span>
                      <strong style={{ color: 'var(--clr-primary-light)' }}>
                        {voteUpdate ? `${voteUpdate.totalVotes} / ${voteUpdate.totalAlive}` : `0 / ${players.filter(p => p.isAlive).length}`} cast
                      </strong>
                    </div>
                  </div>
                )}

                <div className="player-list" style={{ overflowY: 'auto', maxHeight: '350px' }}>
                  {players.map(p => {
                    const isTargetMe = player && p.id === player.id;
                    const avatarHue = (p.nickname.length * 45) % 360;
                    const avatarBg = `hsl(${avatarHue}, 60%, 45%)`;

                    return (
                      <div key={p.id} className={`player-item ${!p.isAlive ? 'is-dead' : ''}`}>
                        <div className="player-avatar" style={{ backgroundColor: avatarBg }}>
                          {p.nickname.substring(0, 2).toUpperCase()}
                        </div>
                        
                        <div className="player-info" style={{ textAlign: 'left' }}>
                          <div className="player-name">
                            {p.nickname} {isTargetMe && <span style={{ color: 'var(--clr-text-muted)' }}>(You)</span>}
                          </div>
                          <div className="player-status" style={{ marginTop: '2px' }}>
                            {p.isAlive ? (
                              <span className="badge badge-alive">Alive</span>
                            ) : (
                              <span className="badge badge-dead"><Skull size={10} style={{ marginRight: '3px' }} /> Dead</span>
                            )}
                          </div>
                        </div>

                        <div className="player-actions">
                          {gameState === 'day-voting' && isMeAlive && p.isAlive && !isTargetMe && (
                            <button
                              onClick={() => handleVoteSubmit(p.id)}
                              disabled={selectedTarget !== ''}
                              className={`btn btn-sm ${selectedTarget === p.id ? 'btn-success' : 'btn-outline'}`}
                            >
                              {selectedTarget === p.id ? 'Voted' : 'Vote'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {gameState === 'day-voting' && isMeAlive && (
                  <button
                    onClick={() => handleVoteSubmit('skip')}
                    disabled={selectedTarget !== ''}
                    className={`btn btn-lg btn-full ${selectedTarget === 'skip' ? 'btn-success' : 'btn-outline'}`}
                    style={{ marginTop: 'var(--sp-2)' }}
                  >
                    {selectedTarget === 'skip' ? 'Voted Skip' : '🗳️ Vote to Skip Elimination'}
                  </button>
                )}
              </div>
            )}

            {/* Voting Result overlay details */}
            {voteResults && (
              <div style={{ marginTop: 'var(--sp-4)', background: 'var(--clr-bg-secondary)', padding: 'var(--sp-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)' }}>
                <h4 style={{ fontSize: 'var(--fs-sm)', fontWeight: 'bold', marginBottom: 'var(--sp-2)' }}>Voting Results:</h4>
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--clr-text-secondary)' }}>
                  {voteResults.eliminatedPlayer ? (
                    <span>
                      Town eliminated <strong style={{ color: 'var(--clr-accent-light)' }}>{voteResults.eliminatedPlayer.nickname}</strong>. They were a <strong style={{ color: 'white' }}>{voteResults.eliminatedPlayer.role}</strong>.
                    </span>
                  ) : (
                    <span>No one was eliminated this round (Skip / Tie).</span>
                  )}
                </p>
                <div style={{ marginTop: 'var(--sp-2)' }}>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}>Tally:</span>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {Object.entries(voteResults.tally).map(([name, count]) => (
                      <span key={name} style={{ fontSize: 'var(--fs-xs)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>
                        {name}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Column Right: Chat Window */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          
          {/* Spectator Chat tab selector (only for dead players) */}
          {!isMeAlive && (
            <div style={{ display: 'flex', gap: 'var(--sp-2)', background: 'var(--clr-bg-secondary)', padding: 'var(--sp-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--clr-border)' }}>
              <button 
                onClick={() => setActiveTab('discussion')} 
                className={`btn btn-sm btn-full ${activeTab === 'discussion' ? 'btn-primary' : 'btn-ghost'}`}
              >
                <Sun size={12} style={{ marginRight: '6px' }} /> Town Discussion
              </button>
              <button 
                onClick={() => setActiveTab('spectator')} 
                className={`btn btn-sm btn-full ${activeTab === 'spectator' ? 'btn-danger' : 'btn-ghost'}`}
                style={{ background: activeTab === 'spectator' ? 'linear-gradient(135deg, var(--clr-accent), var(--clr-accent-dark))' : '' }}
              >
                <MessageSquare size={12} style={{ marginRight: '6px' }} /> Spectator Chat
              </button>
            </div>
          )}

          <div className="chat-container" style={{ minHeight: '400px', maxHeight: '550px' }}>
            <div className="chat-header" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} /> 
                {!isMeAlive && activeTab === 'spectator' ? 'Spectator Chat (Dead Only)' : 'Town Square'}
              </span>
              {!isMeAlive && activeTab === 'spectator' && (
                <span className="badge badge-dead">SPECTATING</span>
              )}
            </div>

            <div className="chat-messages">
              {chatMessages
                .filter(msg => {
                  // Filter based on selected Tab for dead players
                  if (!isMeAlive) {
                    if (activeTab === 'spectator') {
                      return msg.type === 'spectator';
                    } else {
                      return msg.type !== 'spectator';
                    }
                  }
                  // Alive players only see non-spectator messages
                  return msg.type !== 'spectator';
                })
                .map((msg, index) => {
                  if (msg.type === 'system') {
                    const subtypeClass = msg.subtype ? ` ${msg.subtype}` : '';
                    return (
                      <div key={index} className={`chat-message system${subtypeClass}`}>
                        {msg.message}
                      </div>
                    );
                  }

                  const isMsgMe = player && msg.playerId === player.id;
                  const isSenderAlive = players.find(p => p.id === msg.playerId)?.isAlive !== false;

                  return (
                    <div 
                      key={index} 
                      className="chat-message player" 
                      style={{ 
                        alignSelf: isMsgMe ? 'flex-end' : 'flex-start', 
                        background: isMsgMe ? 'var(--clr-surface-active)' : 'var(--clr-surface)', 
                        maxWidth: '85%' 
                      }}
                    >
                      <div 
                        className="sender" 
                        style={{ 
                          color: isMsgMe 
                            ? 'var(--clr-primary-light)' 
                            : !isSenderAlive 
                              ? 'var(--clr-accent-light)' 
                              : 'var(--clr-success-light)' 
                        }}
                      >
                        {msg.nickname} {!isSenderAlive && <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-text-muted)' }}> (Dead)</span>}
                      </div>
                      <div className="text">{msg.message}</div>
                      <div className="time" style={{ textAlign: 'right' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </div>
                  );
                })
              }
              <div ref={chatEndRef} />
            </div>

            {/* Chat Send Area */}
            {((isMeAlive && (gameState === 'day-discussion' || gameState === 'day-voting')) || (!isMeAlive && activeTab === 'spectator')) ? (
              <form onSubmit={handleSendChat} className="chat-input-area">
                <input
                  type="text"
                  className="input"
                  placeholder={!isMeAlive && activeTab === 'spectator' ? "Spectator chat..." : "Discuss who the Mafia is..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  maxLength={150}
                  autoComplete="off"
                />
                <button type="submit" className="btn btn-primary">
                  <Send size={16} /> Send
                </button>
              </form>
            ) : (
              <div style={{ padding: 'var(--sp-4)', textAlign: 'center', background: 'var(--clr-bg-primary)', borderTop: '1px solid var(--clr-border)', color: 'var(--clr-text-muted)', fontSize: 'var(--fs-xs)', fontStyle: 'italic' }}>
                {gameState === 'night' 
                  ? "Chat is disabled during the night phase." 
                  : !isMeAlive 
                    ? "You are dead. Discuss in the Spectator Chat tab." 
                    : "Wait for the discussion phase to begin."}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default GameView;
