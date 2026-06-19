import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import AudioService from '../services/AudioService';
import { Play, Plus, Trophy, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';

const HomeView = ({ onViewLeaderboard }) => {
  const { createRoom, joinRoom, errorMsg, setErrorMsg } = useSocket();
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [soundsEnabled, setSoundsEnabled] = useState(AudioService.isEnabled());
  const [speechEnabled, setSpeechEnabled] = useState(AudioService.isSpeechEnabled());

  const handleCreate = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setErrorMsg('Please enter a nickname first.');
      AudioService.error();
      return;
    }
    createRoom(nickname);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      setErrorMsg('Please enter a nickname first.');
      AudioService.error();
      return;
    }
    if (!roomCode.trim() || roomCode.trim().length !== 6) {
      setErrorMsg('Room code must be exactly 6 characters.');
      AudioService.error();
      return;
    }
    joinRoom(nickname, roomCode);
  };

  const toggleSound = () => {
    const val = AudioService.toggle();
    setSoundsEnabled(val);
    AudioService.voteClick();
  };

  const toggleSpeech = () => {
    const val = AudioService.toggleSpeech();
    setSpeechEnabled(val);
    AudioService.voteClick();
  };

  return (
    <div className="page-container animate-fade-in" style={{ justifyContent: 'center' }}>
      <div className="glass-card home-card" style={{ maxWidth: '480px', width: '100%' }}>
        <h1 className="title-hero" style={{ marginBottom: 'var(--sp-2)' }}>MAFIA ONLINE</h1>
        <p className="subtitle" style={{ marginBottom: 'var(--sp-6)' }}>Real-time multiplayer role deduction game</p>
        
        {errorMsg && (
          <div className="chat-message system death" style={{ marginBottom: 'var(--sp-4)', textAlign: 'center' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleCreate} className="player-list" style={{ gap: 'var(--sp-4)' }}>
          <div className="input-group">
            <label htmlFor="nickname">Nickname</label>
            <input
              id="nickname"
              type="text"
              className="input"
              placeholder="Enter your nickname (2-16 chars)"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={16}
              autoComplete="off"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--sp-4)', marginTop: 'var(--sp-2)' }}>
            <button type="submit" className="btn btn-primary btn-lg btn-full">
              <Plus size={20} /> Create Room
            </button>
          </div>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', margin: 'var(--sp-6) 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--clr-border)' }}></div>
          <span style={{ padding: '0 var(--sp-3)', color: 'var(--clr-text-muted)', fontSize: 'var(--fs-xs)', fontWeight: 'bold' }}>OR JOIN ROOM</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--clr-border)' }}></div>
        </div>

        <form onSubmit={handleJoin} className="player-list" style={{ gap: 'var(--sp-4)' }}>
          <div className="input-group">
            <label htmlFor="roomCode">Room Code</label>
            <input
              id="roomCode"
              type="text"
              className="input input-lg"
              placeholder="ROOM CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              maxLength={6}
              autoComplete="off"
            />
          </div>

          <button type="submit" className="btn btn-accent btn-lg btn-full">
            <Play size={20} /> Join Room
          </button>
        </form>

        <div style={{ display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-6)' }}>
          <button onClick={onViewLeaderboard} className="btn btn-outline btn-full">
            <Trophy size={18} /> Leaderboards
          </button>
        </div>

        {/* Audio control panel */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: 'var(--sp-4)', 
          marginTop: 'var(--sp-6)', 
          paddingTop: 'var(--sp-4)', 
          borderTop: '1px solid var(--clr-border-light)' 
        }}>
          <button 
            onClick={toggleSound} 
            className="btn btn-ghost btn-sm" 
            title={soundsEnabled ? "Mute sounds" : "Unmute sounds"}
            style={{ color: soundsEnabled ? 'var(--clr-text-secondary)' : 'var(--clr-text-muted)' }}
          >
            {soundsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span style={{ fontSize: 'var(--fs-xs)' }}>Sound</span>
          </button>

          <button 
            onClick={toggleSpeech} 
            className="btn btn-ghost btn-sm" 
            title={speechEnabled ? "Mute narrator" : "Unmute narrator"}
            style={{ color: speechEnabled ? 'var(--clr-text-secondary)' : 'var(--clr-text-muted)' }}
          >
            {speechEnabled ? <Mic size={18} /> : <MicOff size={18} />}
            <span style={{ fontSize: 'var(--fs-xs)' }}>God Voice</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default HomeView;
