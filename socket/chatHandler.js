/**
 * Chat Handler
 * Manages real-time chat messaging and system announcements.
 */

/**
 * Sanitize a string to prevent HTML/script injection.
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Register chat-related socket events.
 * @param {SocketIO.Server} io
 * @param {SocketIO.Socket} socket
 * @param {Map} rooms - shared rooms map
 * @param {Map} playerSessions - shared player sessions map
 */
function chatHandler(io, socket, rooms, playerSessions) {
  /**
   * Handle incoming chat messages.
   * Messages are only allowed during certain game phases.
   */
  socket.on('send-message', ({ roomCode, message }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.get(session.playerId);
    if (!player) return;

    // Sanitize message content
    const cleanMessage = sanitize(message).trim();
    if (!cleanMessage || cleanMessage.length > 500) return;

    // Determine if chat is allowed based on game state
    const allowedStates = ['lobby', 'day-discussion', 'day-voting', 'game-over'];
    if (!allowedStates.includes(room.state)) {
      // During night, only dead players (spectators) can chat
      if (room.state === 'night' && player.isAlive) {
        socket.emit('chat-error', { message: 'Chat is disabled during the night phase.' });
        return;
      }
    }

    // Dead players can only chat with other dead players (spectator chat)
    if (!player.isAlive && room.state !== 'lobby' && room.state !== 'game-over') {
      // Send to spectators only
      const spectatorMsg = {
        type: 'spectator',
        playerId: player.id,
        nickname: player.nickname,
        message: cleanMessage,
        timestamp: Date.now()
      };

      // Emit only to dead players in the room
      for (const p of room.players.values()) {
        if (!p.isAlive && p.isConnected) {
          io.to(p.socketId).emit('chat-message', spectatorMsg);
        }
      }
      return;
    }

    // Normal message broadcast to room
    const chatMsg = {
      type: 'player',
      playerId: player.id,
      nickname: player.nickname,
      message: cleanMessage,
      timestamp: Date.now()
    };

    io.to(roomCode).emit('chat-message', chatMsg);
  });
}

/**
 * Send a system announcement to an entire room.
 * @param {SocketIO.Server} io
 * @param {string} roomCode
 * @param {string} message
 * @param {string} subtype - optional subtype for styling (e.g., 'death', 'phase', 'join')
 */
function sendSystemMessage(io, roomCode, message, subtype = 'info') {
  io.to(roomCode).emit('chat-message', {
    type: 'system',
    subtype: subtype,
    message: message,
    timestamp: Date.now()
  });
}

module.exports = { chatHandler, sendSystemMessage };
