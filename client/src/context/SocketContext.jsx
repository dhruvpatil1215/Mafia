import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import AudioService from '../services/AudioService';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Game States
  const [roomCode, setRoomCode] = useState('');
  const [player, setPlayer] = useState(null);
  const [players, setPlayers] = useState([]);
  const [hostId, setHostId] = useState('');
  const [gameState, setGameState] = useState('home'); // 'home' | 'lobby' | 'starting' | 'night' | 'day-transition' | 'day-discussion' | 'day-voting' | 'game-over'
  const [round, setRound] = useState(0);
  const [mafiaMembers, setMafiaMembers] = useState([]);
  const [eliminatedPlayers, setEliminatedPlayers] = useState([]);
  const [winner, setWinner] = useState(null);
  const [settings, setSettings] = useState(null);
  const [transitionStep, setTransitionStep] = useState(null);
  const [transitionData, setTransitionData] = useState(null);
  
  // Dynamic Game State
  const [chatMessages, setChatMessages] = useState([]);
  const [actionPrompt, setActionPrompt] = useState(null);
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [detectiveResult, setDetectiveResult] = useState(null);
  const [voteUpdate, setVoteUpdate] = useState(null);
  const [voteResults, setVoteResults] = useState(null);
  const [mafiaVoteState, setMafiaVoteState] = useState({}); // voterId -> targetId
  const [nightStep, setNightStep] = useState(null);         // 'mafia' | 'doctor' | 'detective' | null
  const [nightStepDuration, setNightStepDuration] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Refs to avoid stale closures in socket event listeners
  const playerRef = useRef(player);
  const roomCodeRef = useRef(roomCode);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // Auto-clear error message
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Connect to socket.io server
  useEffect(() => {
    const socketInstance = io({
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      setIsConnected(true);
      console.log('[DEBUG] Socket connected:', socketInstance.id);
      
      // Auto-reconnect if local session exists
      const savedPlayerId = localStorage.getItem('mafia_player_id');
      const savedRoomCode = localStorage.getItem('mafia_room_code');
      if (savedPlayerId && savedRoomCode) {
        console.log('[DEBUG] Attempting auto-reconnect for:', savedPlayerId, 'in room:', savedRoomCode);
        socketInstance.emit('attempt-reconnect', {
          playerId: savedPlayerId,
          roomCode: savedRoomCode
        });
      }
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
      console.log('[DEBUG] Socket disconnected');
    });

    // Room creation / join events
    socketInstance.on('room-created', ({ roomCode, player, players }) => {
      console.log('[DEBUG] room-created event:', roomCode, player, players);
      setRoomCode(roomCode);
      setPlayer(player);
      setPlayers(players);
      setHostId(player.id);
      setGameState('lobby');
      setChatMessages([]);
      localStorage.setItem('mafia_player_id', player.id);
      localStorage.setItem('mafia_room_code', roomCode);
      AudioService.playerJoin();
    });

    socketInstance.on('room-joined', ({ roomCode, player, players, hostId }) => {
      console.log('[DEBUG] room-joined event:', roomCode, player, players, hostId);
      setRoomCode(roomCode);
      setPlayer(player);
      setPlayers(players);
      setHostId(hostId);
      setGameState('lobby');
      setChatMessages([]);
      localStorage.setItem('mafia_player_id', player.id);
      localStorage.setItem('mafia_room_code', roomCode);
      AudioService.playerJoin();
    });

    socketInstance.on('player-joined', ({ player: newPlayer, players: currentPlayers }) => {
      console.log('[DEBUG] player-joined event:', newPlayer, currentPlayers);
      setPlayers(currentPlayers);
      AudioService.playerJoin();
    });

    socketInstance.on('player-ready-update', ({ playerId, isReady, players: updatedPlayers }) => {
      console.log('[DEBUG] player-ready-update received for playerId:', playerId, 'isReady:', isReady);
      setPlayers(updatedPlayers);
      setPlayer(prev => {
        if (prev && prev.id === playerId) {
          console.log('[DEBUG] updating local player ready status to:', isReady);
          return { ...prev, isReady };
        }
        return prev;
      });
      AudioService.voteClick();
    });

    socketInstance.on('player-left', ({ playerId, players: remainingPlayers, hostId: newHostId }) => {
      console.log('[DEBUG] player-left event:', playerId, remainingPlayers);
      setPlayers(remainingPlayers);
      if (newHostId) setHostId(newHostId);
      setPlayer(prev => {
        if (prev && prev.id === playerId) {
          localStorage.removeItem('mafia_player_id');
          localStorage.removeItem('mafia_room_code');
          setRoomCode('');
          setGameState('home');
          return null;
        }
        return prev;
      });
    });

    socketInstance.on('kicked', ({ message }) => {
      console.log('[DEBUG] kicked event:', message);
      setErrorMsg(message);
      localStorage.removeItem('mafia_player_id');
      localStorage.removeItem('mafia_room_code');
      setRoomCode('');
      setPlayer(null);
      setPlayers([]);
      setGameState('home');
      AudioService.error();
    });

    socketInstance.on('player-disconnected', ({ playerId, players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });

    socketInstance.on('player-reconnected', ({ playerId, players: updatedPlayers }) => {
      setPlayers(updatedPlayers);
    });

    socketInstance.on('host-changed', ({ hostId: newHostId, players: updatedPlayers }) => {
      setHostId(newHostId);
      setPlayers(updatedPlayers);
    });

    // Reconnection events
    socketInstance.on('reconnected', (state) => {
      console.log('[DEBUG] reconnected event state:', state);
      setRoomCode(state.roomCode);
      setPlayer(state.player);
      setPlayers(state.players);
      setHostId(state.hostId);
      setGameState(state.gameState);
      setRound(state.round);
      setMafiaMembers(state.mafiaMembers);
      setEliminatedPlayers(state.eliminatedPlayers);
      setWinner(state.winner);
      setSettings(state.settings);
      setTransitionStep(state.transitionStep);
      setTransitionData(state.transitionData);
      setNightStep(state.nightStep || null);
      setNightStepDuration(state.nightStep ? 15 : 0);
      
      localStorage.setItem('mafia_player_id', state.player.id);
      localStorage.setItem('mafia_room_code', state.roomCode);
    });

    socketInstance.on('reconnect-failed', ({ message }) => {
      console.log('[DEBUG] reconnect-failed event:', message);
      localStorage.removeItem('mafia_player_id');
      localStorage.removeItem('mafia_room_code');
      setRoomCode('');
      setPlayer(null);
      setPlayers([]);
      setGameState('home');
    });

    // Game starting
    socketInstance.on('game-started', ({ role, mafiaMembers, players: startingPlayers, settings: gameSettings }) => {
      console.log('[DEBUG] game-started event:', role, mafiaMembers);
      setGameState('starting');
      setPlayer(prev => ({ ...prev, role, isAlive: true, isReady: false }));
      setPlayers(startingPlayers);
      setMafiaMembers(mafiaMembers);
      setSettings(gameSettings);
      setRound(0);
      setWinner(null);
      setEliminatedPlayers([]);
      setTransitionStep(null);
      setTransitionData(null);
      setActionPrompt(null);
      setActionConfirmed(false);
      setDetectiveResult(null);
      setVoteResults(null);
      setVoteUpdate(null);
      setMafiaVoteState({});
      setNightStep(null);
      setNightStepDuration(0);
      
      AudioService.roleReveal();
    });

    // Phase Change events
    socketInstance.on('phase-change', (data) => {
      console.log('[DEBUG] phase-change event:', data);
      setGameState(data.phase);
      setRound(data.round);
      
      const currentPlayerVal = playerRef.current;

      if (data.alivePlayers) {
        const me = data.alivePlayers.find(p => p.id === socketInstance.id || (currentPlayerVal && p.id === currentPlayerVal.id));
        if (me) {
          setPlayer(prev => prev ? { ...prev, isAlive: true } : null);
        }
      }

      if (data.allPlayers) {
        setPlayers(data.allPlayers);
        const me = data.allPlayers.find(p => p.id === (currentPlayerVal ? currentPlayerVal.id : ''));
        if (me) {
          setPlayer(prev => prev ? { ...prev, isAlive: me.isAlive } : null);
        }
      }

      // Handle specifics per phase
      if (data.phase === 'night') {
        setNightStep(null);         // will be set by 'night-step' event for each sub-step
        setNightStepDuration(0);
        setActionConfirmed(false);
        setDetectiveResult(null);
        setMafiaVoteState({});
        AudioService.nightStart();
      } else if (data.phase === 'day-transition') {
        setTransitionStep(data.step);
        if (data.step === 'wakeup') {
          AudioService.dayStart();
        } else if (data.step === 'result') {
          setTransitionData({ killedPlayer: data.killedPlayer, wasSaved: data.wasSaved });
          if (data.killedPlayer) {
            AudioService.elimination();
          } else if (data.wasSaved) {
            AudioService.saved();
          }
        }
      } else if (data.phase === 'day-discussion') {
        setTransitionStep(null);
        setTransitionData(null);
        setVoteUpdate(null);
        setVoteResults(null);
        AudioService.phaseChange();
      } else if (data.phase === 'day-voting') {
        setVoteUpdate(null);
        AudioService.phaseChange();
      }
    });

    socketInstance.on('night-step', ({ step, duration }) => {
      setNightStep(step);
      setNightStepDuration(duration);
      setActionConfirmed(false); // Reset so each role can submit their action
      if (step === 'mafia') AudioService.speak('Mafia, wake up. Choose your target.');
      else if (step === 'doctor') AudioService.speak('Doctor, wake up. Choose who to protect.');
      else if (step === 'detective') AudioService.speak('Detective, wake up. Investigate a player.');
    });

    socketInstance.on('night-action-prompt', (promptData) => {
      setActionPrompt(promptData);
      
      if (promptData.role === 'mafia' && promptData.targets.length > 0) {
        AudioService.speak('Mafia, wake up. Choose a player to eliminate.');
      } else if (promptData.role === 'doctor' && promptData.targets.length > 0) {
        AudioService.speak('Doctor, wake up. Choose a player to protect.');
      } else if (promptData.role === 'detective' && promptData.targets.length > 0) {
        AudioService.speak('Detective, wake up. Choose a player to investigate.');
      } else if (promptData.role === 'villager') {
        AudioService.speak('Villagers, close your eyes. Wait for the morning.');
      }
    });

    socketInstance.on('mafia-vote-update', ({ voterId, voterNickname, targetId, totalMafia, totalVotes }) => {
      setMafiaVoteState(prev => ({ ...prev, [voterId]: targetId }));
    });

    socketInstance.on('action-confirmed', ({ action, targetId }) => {
      setActionConfirmed(true);
    });

    socketInstance.on('detective-result', ({ targetId, targetNickname, isMafia }) => {
      setDetectiveResult({ targetId, targetNickname, isMafia });
    });

    socketInstance.on('vote-update', (data) => {
      setVoteUpdate(data);
      AudioService.voteClick();
    });

    socketInstance.on('vote-results', ({ eliminatedPlayer, tally, allPlayers }) => {
      console.log('[DEBUG] vote-results event:', eliminatedPlayer, tally);
      setVoteResults({ eliminatedPlayer, tally });
      setPlayers(allPlayers);
      
      const currentPlayerVal = playerRef.current;
      const me = allPlayers.find(p => p.id === (currentPlayerVal ? currentPlayerVal.id : ''));
      if (me) {
        setPlayer(prev => prev ? { ...prev, isAlive: me.isAlive } : null);
      }
      AudioService.elimination();
    });

    socketInstance.on('game-over', ({ winner, message, players: finalPlayers, eliminatedPlayers }) => {
      console.log('[DEBUG] game-over event:', winner, message);
      setGameState('game-over');
      setWinner(winner);
      setPlayers(finalPlayers);
      setEliminatedPlayers(eliminatedPlayers);
      
      const currentPlayerVal = playerRef.current;
      const me = finalPlayers.find(p => p.id === (currentPlayerVal ? currentPlayerVal.id : ''));
      if (me) {
        setPlayer(prev => prev ? { ...prev, role: me.role, isAlive: me.isAlive } : null);
      }
      
      AudioService.victory();
      AudioService.speak(message);
    });

    socketInstance.on('return-to-lobby', ({ players: currentPlayers, hostId: currentHostId }) => {
      console.log('[DEBUG] return-to-lobby event:', currentPlayers);
      setGameState('lobby');
      setPlayers(currentPlayers);
      setHostId(currentHostId);
      setPlayer(prev => prev ? { ...prev, role: null, isAlive: true, isReady: false } : null);
      setWinner(null);
      setRound(0);
      setMafiaMembers([]);
      setEliminatedPlayers([]);
      setNightStep(null);
      setNightStepDuration(0);
      setTransitionStep(null);
      setTransitionData(null);
      setActionPrompt(null);
      setActionConfirmed(false);
      setDetectiveResult(null);
      setVoteResults(null);
      setVoteUpdate(null);
      setMafiaVoteState({});
    });

    socketInstance.on('chat-message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
      if (msg.type === 'system' && (msg.subtype === 'death' || msg.subtype === 'phase')) {
        AudioService.speak(msg.message);
      } else {
        AudioService.messageReceive();
      }
    });

    socketInstance.on('error-message', ({ message }) => {
      console.log('[DEBUG] error-message event:', message);
      setErrorMsg(message);
      AudioService.error();
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Emitters
  const createRoom = (nickname) => {
    console.log('[DEBUG] createRoom emit nickname:', nickname);
    if (socket) socket.emit('create-room', { nickname });
  };

  const joinRoom = (nickname, joinCode) => {
    console.log('[DEBUG] joinRoom emit nickname:', nickname, 'roomCode:', joinCode);
    if (socket) socket.emit('join-room', { nickname, roomCode: joinCode });
  };

  const leaveRoom = () => {
    const currentCode = roomCodeRef.current;
    console.log('[DEBUG] leaveRoom emit roomCode:', currentCode);
    if (socket) {
      socket.emit('leave-room', { roomCode: currentCode });
      localStorage.removeItem('mafia_player_id');
      localStorage.removeItem('mafia_room_code');
      setRoomCode('');
      setPlayer(null);
      setPlayers([]);
      setGameState('home');
    }
  };

  const toggleReady = () => {
    const currentCode = roomCodeRef.current;
    console.log('[DEBUG] toggleReady emit roomCode:', currentCode);
    if (socket && currentCode) {
      socket.emit('toggle-ready', { roomCode: currentCode });
    }
  };

  const kickPlayer = (targetPlayerId) => {
    const currentCode = roomCodeRef.current;
    console.log('[DEBUG] kickPlayer emit roomCode:', currentCode, 'targetPlayerId:', targetPlayerId);
    if (socket && currentCode) {
      socket.emit('kick-player', { roomCode: currentCode, targetPlayerId });
    }
  };

  const startGame = () => {
    const currentCode = roomCodeRef.current;
    console.log('[DEBUG] startGame emit roomCode:', currentCode);
    if (socket && currentCode) {
      socket.emit('start-game', { roomCode: currentCode });
    }
  };

  const playAgain = () => {
    const currentCode = roomCodeRef.current;
    console.log('[DEBUG] playAgain emit roomCode:', currentCode);
    if (socket && currentCode) {
      socket.emit('play-again', { roomCode: currentCode });
    }
  };

  const sendChatMessage = (msgText) => {
    const currentCode = roomCodeRef.current;
    if (socket && currentCode) socket.emit('send-message', { roomCode: currentCode, message: msgText });
  };

  const submitMafiaAction = (targetId) => {
    const currentCode = roomCodeRef.current;
    if (socket && currentCode) socket.emit('mafia-action', { roomCode: currentCode, targetId });
  };

  const submitDoctorAction = (targetId) => {
    const currentCode = roomCodeRef.current;
    if (socket && currentCode) socket.emit('doctor-action', { roomCode: currentCode, targetId });
  };

  const submitDetectiveAction = (targetId) => {
    const currentCode = roomCodeRef.current;
    if (socket && currentCode) socket.emit('detective-action', { roomCode: currentCode, targetId });
  };

  const castVote = (targetId) => {
    const currentCode = roomCodeRef.current;
    if (socket && currentCode) socket.emit('cast-vote', { roomCode: currentCode, targetId });
  };

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      roomCode,
      player,
      players,
      hostId,
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
      setErrorMsg,
      
      createRoom,
      joinRoom,
      leaveRoom,
      toggleReady,
      kickPlayer,
      startGame,
      playAgain,
      sendChatMessage,
      submitMafiaAction,
      submitDoctorAction,
      submitDetectiveAction,
      castVote
    }}>
      {children}
    </SocketContext.Provider>
  );
};
