/**
 * Player Model
 * Represents a player in the Mafia game.
 * All state is held in-memory (no database persistence).
 */

class Player {
  /**
   * @param {string} id - Unique player ID (UUID)
   * @param {string} nickname - Display name chosen by player
   * @param {string} socketId - Current Socket.IO socket ID
   * @param {string} roomCode - Room code the player belongs to
   */
  constructor(id, nickname, socketId, roomCode) {
    this.id = id;
    this.nickname = nickname;
    this.socketId = socketId;
    this.roomCode = roomCode;
    this.role = null;          // 'mafia' | 'doctor' | 'detective' | 'villager'
    this.isAlive = true;
    this.isHost = false;
    this.isConnected = true;
    this.isReady = false;
    this.joinedAt = Date.now();
  }

  /**
   * Return a safe representation of the player (no role info).
   * Used when broadcasting player list to the room.
   */
  toPublic() {
    return {
      id: this.id,
      nickname: this.nickname,
      isAlive: this.isAlive,
      isHost: this.isHost,
      isConnected: this.isConnected,
      isReady: this.isReady,
    };
  }

  /**
   * Return full player data including role.
   * Only sent to the player themselves.
   */
  toPrivate() {
    return {
      ...this.toPublic(),
      role: this.role,
    };
  }
}

module.exports = Player;
