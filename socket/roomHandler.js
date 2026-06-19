/**
 * Room Handler
 * Manages room creation, joining, leaving, and host transfer.
 */

const Room = require('../models/Room');
const Player = require('../models/Player');
const { v4: uuidv4 } = require('uuid');
const { startGame } = require('./gameHandler');
const { sendNightPromptToReconnectedPlayer } = require('./gameHandler');
const { sendSystemMessage } = require('./chatHandler');

/**
 * Generate a random 6-character alphanumeric room code.
 * @param {Map} rooms - existing rooms to check for uniqueness
 * @returns {string}
 */
function generateRoomCode(rooms) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (0,O,1,I)
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

/**
 * Register room-related socket events.
 * @param {SocketIO.Server} io
 * @param {SocketIO.Socket} socket
 * @param {Map} rooms - shared rooms map
 * @param {Map} playerSessions - shared player sessions map
 */
function roomHandler(io, socket, rooms, playerSessions) {

  /**
   * Create a new room.
   * Expects: { nickname: string, playerId?: string }
   * Emits: room-created with { roomCode, player }
   */
  socket.on('create-room', ({ nickname, playerId }) => {
    // Validate nickname
    const cleanName = (nickname || '').trim();
    if (cleanName.length < 2 || cleanName.length > 16) {
      socket.emit('error-message', { message: 'Nickname must be 2-16 characters.' });
      return;
    }

    // Generate player ID if not reconnecting
    const pid = playerId || uuidv4();
    const roomCode = generateRoomCode(rooms);

    // Create room and player
    const room = new Room(roomCode, pid);
    const player = new Player(pid, cleanName, socket.id, roomCode);
    player.isHost = true;

    room.addPlayer(player);
    rooms.set(roomCode, room);

    // Track session
    playerSessions.set(socket.id, { playerId: pid, roomCode });

    // Join socket room
    socket.join(roomCode);

    // Respond to creator
    socket.emit('room-created', {
      roomCode: roomCode,
      player: player.toPrivate(),
      players: room.getPublicPlayerList()
    });

    console.log(`[ROOM] ${cleanName} created room ${roomCode}`);
  });

  /**
   * Join an existing room.
   * Expects: { nickname: string, roomCode: string, playerId?: string }
   */
  socket.on('join-room', ({ nickname, roomCode, playerId }) => {
    const cleanName = (nickname || '').trim();
    if (cleanName.length < 2 || cleanName.length > 16) {
      socket.emit('error-message', { message: 'Nickname must be 2-16 characters.' });
      return;
    }

    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error-message', { message: 'Room not found. Check the code and try again.' });
      return;
    }

    if (room.state !== 'lobby') {
      // Check if this is a reconnection
      if (playerId && room.players.has(playerId)) {
        return handleReconnect(io, socket, room, playerId, playerSessions);
      }
      socket.emit('error-message', { message: 'Game already in progress.' });
      return;
    }

    if (room.players.size >= room.settings.maxPlayers) {
      socket.emit('error-message', { message: 'Room is full.' });
      return;
    }

    // Check for duplicate nicknames
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === cleanName.toLowerCase()) {
        socket.emit('error-message', { message: 'That nickname is already taken in this room.' });
        return;
      }
    }

    const pid = playerId || uuidv4();
    const player = new Player(pid, cleanName, socket.id, code);
    room.addPlayer(player);

    playerSessions.set(socket.id, { playerId: pid, roomCode: code });

    socket.join(code);

    // Notify the joining player
    socket.emit('room-joined', {
      roomCode: code,
      player: player.toPrivate(),
      players: room.getPublicPlayerList(),
      hostId: room.hostId
    });

    // Notify room about new player
    socket.to(code).emit('player-joined', {
      player: player.toPublic(),
      players: room.getPublicPlayerList()
    });

    sendSystemMessage(io, code, `👋 ${cleanName} joined the room.`, 'join');

    console.log(`[ROOM] ${cleanName} joined room ${code} (${room.players.size} players)`);
  });

  /**
   * Leave a room voluntarily.
   */
  socket.on('leave-room', ({ roomCode }) => {
    handlePlayerLeave(io, socket, rooms, playerSessions, roomCode, true);
  });

  /**
   * Host kicks a player.
   * Expects: { roomCode: string, targetPlayerId: string }
   */
  socket.on('kick-player', ({ roomCode, targetPlayerId }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'lobby') return;

    // Only host can kick
    if (room.hostId !== session.playerId) return;

    // Can't kick yourself
    if (targetPlayerId === session.playerId) return;

    const target = room.players.get(targetPlayerId);
    if (!target) return;

    // Remove the player
    room.removePlayer(targetPlayerId);

    // Notify the kicked player
    if (target.isConnected) {
      io.to(target.socketId).emit('kicked', { message: 'You have been kicked from the room.' });
      const kickedSocket = io.sockets.sockets.get(target.socketId);
      if (kickedSocket) {
        kickedSocket.leave(roomCode);
        playerSessions.delete(target.socketId);
      }
    }

    // Notify room
    sendSystemMessage(io, roomCode, `🚫 ${target.nickname} was kicked by the host.`, 'leave');
    io.to(roomCode).emit('player-left', {
      playerId: targetPlayerId,
      players: room.getPublicPlayerList()
    });

    console.log(`[ROOM] ${target.nickname} kicked from ${roomCode}`);
  });

  /**
   * Player toggles their ready status.
   * Expects: { roomCode: string }
   */
  socket.on('toggle-ready', ({ roomCode }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'lobby') return;

    const player = room.players.get(session.playerId);
    if (!player) return;

    // Toggle ready
    player.isReady = !player.isReady;

    // Notify room of player ready update
    io.to(roomCode).emit('player-ready-update', {
      playerId: player.id,
      isReady: player.isReady,
      players: room.getPublicPlayerList()
    });

    console.log(`[ROOM] ${player.nickname} in room ${roomCode} set ready to ${player.isReady}`);
  });

  /**
   * Host starts the game.
   * Expects: { roomCode: string }
   */
  socket.on('start-game', ({ roomCode }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'lobby') return;

    // Only host can start
    if (room.hostId !== session.playerId) {
      socket.emit('error-message', { message: 'Only the host can start the game.' });
      return;
    }

    // Minimum players check
    if (room.players.size < room.settings.minPlayers) {
      socket.emit('error-message', { message: `Need at least ${room.settings.minPlayers} players to start.` });
      return;
    }

    // Verify all other players are ready
    const playersArray = room.getPlayersArray();
    const unreadyPlayers = playersArray.filter(p => !p.isHost && !p.isReady);
    if (unreadyPlayers.length > 0) {
      socket.emit('error-message', { message: 'All players must be ready before starting the game.' });
      return;
    }

    console.log(`[GAME] Starting game in room ${roomCode} with ${room.players.size} players`);
    startGame(io, room);
  });

  /**
   * Host requests to play again after game over.
   */
  socket.on('play-again', ({ roomCode }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'game-over') return;

    if (room.hostId !== session.playerId) {
      socket.emit('error-message', { message: 'Only the host can restart the game.' });
      return;
    }

    room.resetForNewGame();

    io.to(roomCode).emit('return-to-lobby', {
      players: room.getPublicPlayerList(),
      hostId: room.hostId
    });

    sendSystemMessage(io, roomCode, '🔄 The host has started a new round! Waiting for the game to start...', 'phase');

    console.log(`[GAME] Room ${roomCode} reset for new game`);
  });
}

/**
 * Handle player reconnection.
 */
function handleReconnect(io, socket, room, playerId, playerSessions) {
  const player = room.players.get(playerId);
  if (!player) return;

  // Cancel any grace period timer from a recent disconnect
  if (player._gracePeriod) {
    clearTimeout(player._gracePeriod);
    player._gracePeriod = null;
  }

  // Update socket ID
  const oldSocketId = player.socketId;
  player.socketId = socket.id;
  player.isConnected = true;

  // Clean up old session
  playerSessions.delete(oldSocketId);
  playerSessions.set(socket.id, { playerId, roomCode: room.code });

  socket.join(room.code);

  // Send full game state to reconnecting player
  const mafiaMembers = player.role === 'mafia'
    ? room.getAliveByRole('mafia')
        .filter(p => p.id !== player.id)
        .map(p => ({ id: p.id, nickname: p.nickname }))
    : [];

  socket.emit('reconnected', {
    roomCode: room.code,
    player: player.toPrivate(),
    players: room.getPublicPlayerList(),
    hostId: room.hostId,
    gameState: room.state,
    round: room.round,
    mafiaMembers: mafiaMembers,
    eliminatedPlayers: room.eliminatedPlayers,
    winner: room.winner,
    settings: room.settings,
    transitionStep: room.transitionStep,
    transitionData: room.transitionData,
    nightStep: room.nightStep
  });

  // Restore night-action-prompt if reconnecting during night phase
  if (room.state === 'night') {
    sendNightPromptToReconnectedPlayer(socket, room, player);
  }

  // Notify room
  sendSystemMessage(io, room.code, `🔄 ${player.nickname} reconnected.`, 'join');
  socket.to(room.code).emit('player-reconnected', {
    playerId: player.id,
    players: room.getPublicPlayerList()
  });

  console.log(`[ROOM] ${player.nickname} reconnected to ${room.code}`);
}

/**
 * Handle player leaving (voluntary or disconnect).
 * @param {boolean} voluntary - true if the player clicked "Leave", false if socket disconnected
 */
function handlePlayerLeave(io, socket, rooms, playerSessions, roomCode, voluntary = false) {
  const session = playerSessions.get(socket.id);
  if (!session) return;

  const room = rooms.get(roomCode || session.roomCode);
  if (!room) {
    playerSessions.delete(socket.id);
    return;
  }

  const player = room.players.get(session.playerId);
  if (!player) {
    playerSessions.delete(socket.id);
    return;
  }

  // Clean up the socket-to-session mapping
  playerSessions.delete(socket.id);
  socket.leave(room.code);

  if (voluntary) {
    // === Voluntary leave: remove immediately in any state ===
    doFullRemove(io, rooms, room, player);
  } else if (room.state === 'lobby' || room.state === 'starting') {
    // === Lobby/Starting disconnect (page navigation): grace period ===
    // When navigating between pages (home→lobby, lobby→game), the old socket
    // disconnects before the new page connects. Give a 5s grace window.
    player.isConnected = false;

    // Cancel any existing grace timer
    if (player._gracePeriod) clearTimeout(player._gracePeriod);

    player._gracePeriod = setTimeout(() => {
      player._gracePeriod = null;
      // If still disconnected after grace period, fully remove
      if (!player.isConnected && room.players.has(player.id)) {
        doFullRemove(io, rooms, room, player);
      }
    }, 20000); // 20s grace — enough time for a page refresh to reconnect

    console.log(`[ROOM] ${player.nickname} navigating (grace period, state=${room.state})`);
  } else {
    // === During game: mark as disconnected, don't remove ===
    player.isConnected = false;

    sendSystemMessage(io, room.code, `⚠️ ${player.nickname} disconnected.`, 'leave');

    io.to(room.code).emit('player-disconnected', {
      playerId: player.id,
      players: room.getPublicPlayerList()
    });

    // Transfer host if needed
    if (room.hostId === player.id) {
      const connectedPlayers = room.getPlayersArray().filter(p => p.isConnected);
      if (connectedPlayers.length > 0) {
        const newHost = connectedPlayers[0];
        room.hostId = newHost.id;
        newHost.isHost = true;
        player.isHost = false;
        sendSystemMessage(io, room.code, `👑 ${newHost.nickname} is now the host.`, 'info');
        io.to(room.code).emit('host-changed', {
          hostId: newHost.id,
          players: room.getPublicPlayerList()
        });
      }
    }

    // Check if all players disconnected during game
    const connected = room.getPlayersArray().filter(p => p.isConnected);
    if (connected.length === 0) {
      room.clearPhaseTimer();
      rooms.delete(room.code);
      console.log(`[ROOM] Room ${room.code} deleted (all disconnected during game)`);
    }

    console.log(`[ROOM] ${player.nickname} disconnected from ${room.code}`);
  }
}

/**
 * Fully remove a player from a room and clean up.
 */
function doFullRemove(io, rooms, room, player) {
  room.removePlayer(player.id);

  sendSystemMessage(io, room.code, `👋 ${player.nickname} left the room.`, 'leave');

  // If room is empty, delete it
  if (room.players.size === 0) {
    room.clearPhaseTimer();
    rooms.delete(room.code);
    console.log(`[ROOM] Room ${room.code} deleted (empty)`);
    return;
  }

  // Transfer host if the host left
  if (room.hostId === player.id) {
    const newHost = room.getPlayersArray().find(p => p.isConnected) || room.getPlayersArray()[0];
    room.hostId = newHost.id;
    newHost.isHost = true;
    sendSystemMessage(io, room.code, `👑 ${newHost.nickname} is now the host.`, 'info');
  }

  io.to(room.code).emit('player-left', {
    playerId: player.id,
    players: room.getPublicPlayerList(),
    hostId: room.hostId
  });

  console.log(`[ROOM] ${player.nickname} removed from ${room.code}`);
}

module.exports = { roomHandler, handlePlayerLeave };
