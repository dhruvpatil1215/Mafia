/**
 * Socket.IO Master Handler
 * Initializes all socket event handlers and manages
 * player session tracking and disconnect handling.
 */

const { roomHandler, handlePlayerLeave } = require('./roomHandler');
const { gameHandler, sendNightPromptToReconnectedPlayer } = require('./gameHandler');
const { chatHandler } = require('./chatHandler');

// Shared state (in-memory)
const rooms = new Map();          // roomCode → Room
const playerSessions = new Map(); // socketId → { playerId, roomCode }

/**
 * Initialize Socket.IO event handling.
 * @param {SocketIO.Server} io
 */
function initializeSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[SOCKET] Connected: ${socket.id}`);

    // Register all event handlers
    roomHandler(io, socket, rooms, playerSessions);
    gameHandler(io, socket, rooms, playerSessions);
    chatHandler(io, socket, rooms, playerSessions);

    /**
     * Handle reconnection attempt.
     * Client sends stored playerId and roomCode to rejoin.
     */
    socket.on('attempt-reconnect', ({ playerId, roomCode }) => {
      if (!playerId || !roomCode) return;

      const room = rooms.get(roomCode);
      if (!room) {
        socket.emit('reconnect-failed', { message: 'Room no longer exists.' });
        return;
      }

      const player = room.players.get(playerId);
      if (!player) {
        socket.emit('reconnect-failed', { message: 'Player not found in room.' });
        return;
      }

      // Cancel any grace period timer from page navigation
      if (player._gracePeriod) {
        clearTimeout(player._gracePeriod);
        player._gracePeriod = null;
      }

      // Update socket reference
      const oldSocketId = player.socketId;
      player.socketId = socket.id;
      player.isConnected = true;

      playerSessions.delete(oldSocketId);
      playerSessions.set(socket.id, { playerId, roomCode });

      socket.join(roomCode);

      // Send full state
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

      // Restore night-action-prompt if player reconnects during night phase
      if (room.state === 'night') {
        sendNightPromptToReconnectedPlayer(socket, room, player);
      }

      // Notify room
      const { sendSystemMessage } = require('./chatHandler');
      sendSystemMessage(io, roomCode, `🔄 ${player.nickname} reconnected.`, 'join');
      socket.to(roomCode).emit('player-reconnected', {
        playerId: player.id,
        players: room.getPublicPlayerList()
      });

      console.log(`[SOCKET] Reconnected: ${player.nickname} → ${roomCode}`);
    });

    /**
     * Handle socket disconnect.
     */
    socket.on('disconnect', () => {
      const session = playerSessions.get(socket.id);
      if (session) {
        handlePlayerLeave(io, socket, rooms, playerSessions, session.roomCode);
      }
      console.log(`[SOCKET] Disconnected: ${socket.id}`);
    });
  });

  // Periodic cleanup of stale rooms (every 5 minutes)
  setInterval(() => {
    const now = Date.now();
    const staleThreshold = 2 * 60 * 60 * 1000; // 2 hours

    for (const [code, room] of rooms) {
      if (now - room.createdAt > staleThreshold) {
        const hasConnected = room.getPlayersArray().some(p => p.isConnected);
        if (!hasConnected) {
          room.clearPhaseTimer();
          rooms.delete(code);
          console.log(`[CLEANUP] Deleted stale room ${code}`);
        }
      }
    }
  }, 5 * 60 * 1000);
}

/**
 * Get room info by code (used by API route).
 */
function getRoomInfo(code) {
  const room = rooms.get(code);
  if (!room) return null;
  return {
    code: room.code,
    state: room.state,
    playerCount: room.players.size,
    maxPlayers: room.settings.maxPlayers
  };
}

module.exports = { initializeSocket, getRoomInfo };
