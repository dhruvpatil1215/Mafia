import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import AudioService from '../services/AudioService';
import { Crown, CheckCircle2, AlertTriangle, Send, LogOut, ShieldAlert, Check } from 'lucide-react';

const LobbyView = () => {
  const {
    roomCode,
    player,
    players,
    hostId,
    chatMessages,
    errorMsg,
    leaveRoom,
    toggleReady,
    kickPlayer,
    startGame,
    sendChatMessage
  } = useSocket();

  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const chatEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    AudioService.voteClick();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    sendChatMessage(message);
    setMessage('');
  };

  const isHost = player ? player.id === hostId : false;
  const readyCount = players.filter(p => !p.isHost && p.isReady).length;
  const nonHostCount = players.filter(p => !p.isHost).length;
  const canStart = players.length >= 5 && readyCount === nonHostCount;

  return (
    <div className="page-container animate-fade-in" style={{ paddingBottom: 'var(--sp-8)' }}>
      
      {/* Top row: Header & Room info */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', marginBottom: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--sp-4)' }}>
          <div>
            <h2 className="title-section" style={{ textAlign: 'left' }}>Lobby</h2>
            <p className="subtitle" style={{ textAlign: 'left' }}>Waiting for players to prepare...</p>
          </div>

          <button onClick={leaveRoom} className="btn btn-outline" style={{ borderColor: 'var(--clr-accent)' }}>
            <LogOut size={16} /> Leave Room
          </button>
        </div>

        {errorMsg && (
          <div className="chat-message system death" style={{ textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          {/* Room Code block */}
          <div className="glass-card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-6)' }}>
            <span className="room-code-label">SHARE ROOM CODE</span>
            <div className="room-code-display" onClick={handleCopyCode} style={{ margin: 'var(--sp-2) 0' }}>
              <span className="room-code">{roomCode}</span>
            </div>
            <span className={`copy-feedback ${copied ? 'show' : ''}`}>
              <Check size={14} style={{ display: 'inline', marginRight: 'var(--sp-1)' }} /> Room code copied!
            </span>
          </div>

          {/* Quick Info block */}
          <div className="glass-card" style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--sp-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
              <span style={{ color: 'var(--clr-text-secondary)' }}>Total Connected:</span>
              <span style={{ fontWeight: 'bold' }}>{players.length} / 15</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-2)' }}>
              <span style={{ color: 'var(--clr-text-secondary)' }}>Min Players Required:</span>
              <span style={{ fontWeight: 'bold', color: players.length >= 5 ? 'var(--clr-success)' : 'var(--clr-warning)' }}>5</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--clr-text-secondary)' }}>Prepared Status:</span>
              <span style={{ fontWeight: 'bold', color: readyCount === nonHostCount && players.length >= 5 ? 'var(--clr-success)' : 'var(--clr-warning)' }}>
                {readyCount} / {nonHostCount} Ready
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main split: Players and Chat */}
      <div style={{ 
        width: '100%', 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
        gap: 'var(--sp-6)', 
        alignItems: 'stretch' 
      }}>
        
        {/* Connected Players list */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          <h3 style={{ fontSize: 'var(--fs-md)', borderBottom: '1px solid var(--clr-border)', paddingBottom: 'var(--sp-2)' }}>
            Players in Lobby
          </h3>

          <div className="player-list" style={{ overflowY: 'auto', maxHeight: '400px' }}>
            {players.map((p) => {
              const playerAvatarInitials = p.nickname.substring(0, 2).toUpperCase();
              const isMe = player && p.id === player.id;
              const isPlayerHost = p.id === hostId;

              // Generate background color based on nickname length for visual diversity
              const avatarHue = (p.nickname.length * 45) % 360;
              const avatarBg = `hsl(${avatarHue}, 60%, 45%)`;

              return (
                <div key={p.id} className="player-item" style={{ borderLeft: isMe ? '4px solid var(--clr-primary)' : '1px solid var(--clr-border)' }}>
                  <div className="player-avatar" style={{ backgroundColor: avatarBg }}>
                    {playerAvatarInitials}
                  </div>
                  
                  <div className="player-info">
                    <div className="player-name">
                      {p.nickname} {isMe && <span style={{ color: 'var(--clr-text-muted)', fontSize: 'var(--fs-xs)' }}>(You)</span>}
                    </div>
                    <div className="player-status" style={{ marginTop: '2px' }}>
                      {isPlayerHost ? (
                        <span className="badge badge-host">
                          <Crown size={10} style={{ marginRight: '3px' }} /> Host
                        </span>
                      ) : p.isReady ? (
                        <span className="badge badge-alive">
                          <CheckCircle2 size={10} style={{ marginRight: '3px' }} /> Ready
                        </span>
                      ) : (
                        <span className="badge badge-disconnected" style={{ background: 'hsla(0, 0%, 50%, 0.15)', color: 'var(--clr-text-muted)', borderColor: 'var(--clr-border)' }}>
                          Unready
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="player-actions">
                    {isHost && !isMe && (
                      <button 
                        onClick={() => kickPlayer(p.id)} 
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--clr-danger)', borderColor: 'transparent', padding: 'var(--sp-1) var(--sp-2)' }}
                      >
                        <ShieldAlert size={14} /> Kick
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 'var(--sp-4)' }}>
            {isHost ? (
              <div>
                <button 
                  onClick={startGame} 
                  disabled={!canStart} 
                  className="btn btn-primary btn-lg btn-full"
                >
                  Start Game
                </button>
                {!canStart && (
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--clr-warning)', textAlign: 'center', marginTop: 'var(--sp-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <AlertTriangle size={12} />
                    {players.length < 5 
                      ? `Need at least 5 players to start (currently ${players.length})` 
                      : `Waiting for all players to click Ready`}
                  </p>
                )}
              </div>
            ) : (
              <button 
                onClick={toggleReady} 
                className={`btn btn-lg btn-full ${player && player.isReady ? 'btn-outline' : 'btn-primary'}`}
                style={{ 
                  borderColor: player && player.isReady ? 'var(--clr-success)' : 'transparent',
                  color: player && player.isReady ? 'var(--clr-success)' : 'white'
                }}
              >
                {player && player.isReady ? 'Unready' : 'I am Ready!'}
              </button>
            )}
          </div>
        </div>

        {/* Lobby Chat */}
        <div className="chat-container" style={{ minHeight: '400px', maxHeight: '500px' }}>
          <div className="chat-header">
            <span>Day Chat</span>
          </div>

          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-message system" style={{ margin: 'auto 0' }}>
                Chat lobby active. Discuss setup or say hello!
              </div>
            ) : (
              chatMessages.map((msg, index) => {
                if (msg.type === 'system') {
                  const subtypeClass = msg.subtype ? ` ${msg.subtype}` : '';
                  return (
                    <div key={index} className={`chat-message system${subtypeClass}`}>
                      {msg.message}
                    </div>
                  );
                }

                const isMsgMe = player && msg.playerId === player.id;
                return (
                  <div key={index} className="chat-message player" style={{ alignSelf: isMsgMe ? 'flex-end' : 'flex-start', background: isMsgMe ? 'var(--clr-surface-active)' : 'var(--clr-surface)', maxWidth: '85%' }}>
                    <div className="sender" style={{ color: isMsgMe ? 'var(--clr-primary-light)' : 'var(--clr-success-light)' }}>
                      {msg.nickname}
                    </div>
                    <div className="text">{msg.message}</div>
                    <div className="time" style={{ textAlign: 'right' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSendChat} className="chat-input-area">
            <input
              type="text"
              className="input"
              placeholder="Type a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary">
              <Send size={16} /> Send
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default LobbyView;
