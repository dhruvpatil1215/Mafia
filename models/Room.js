/**
 * Room Model
 * Represents a game room with all state needed for a full Mafia game.
 * All state is held in-memory (no database persistence).
 */

class Room {
  /**
   * @param {string} code - 6-character room code
   * @param {string} hostId - Player ID of the room host
   */
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;

    // Map of playerId → Player instance
    this.players = new Map();

    // Game state: 'lobby' | 'night' | 'day-transition' | 'day-discussion' | 'day-voting' | 'game-over'
    this.state = 'lobby';
    this.round = 0;

    // Transition tracking
    this.transitionStep = null; // 'wakeup' | 'result'
    this.transitionData = null; // { killedPlayer, wasSaved }

    // Night action tracking (reset each night)
    this.nightActions = {
      mafiaVotes: new Map(),    // mafiaPlayerId → targetPlayerId
      doctorSave: null,          // targetPlayerId
      detectiveInvestigate: null // targetPlayerId
    };
    this.nightStep = null; // 'mafia' | 'doctor' | 'detective' | null

    // Day voting: voterId → targetPlayerId
    this.votes = new Map();

    // Players eliminated during the game (for spectator reference)
    this.eliminatedPlayers = [];

    // Winner: null | 'mafia' | 'villagers'
    this.winner = null;

    // Phase timer reference (so we can clear it)
    this.phaseTimer = null;

    // Timestamps
    this.createdAt = Date.now();

    // Settings
    this.settings = {
      nightDuration: 30,      // seconds
      dayDiscussionDuration: 30,
      dayVotingDuration: 30,
      minPlayers: 5,
      maxPlayers: 15
    };
  }

  /**
   * Add a player to the room.
   * @param {Player} player
   * @returns {boolean} success
   */
  addPlayer(player) {
    if (this.players.size >= this.settings.maxPlayers) return false;
    if (this.state !== 'lobby') return false;
    this.players.set(player.id, player);
    return true;
  }

  /**
   * Remove a player from the room.
   * @param {string} playerId
   * @returns {Player|null} the removed player
   */
  removePlayer(playerId) {
    const player = this.players.get(playerId);
    if (player) {
      this.players.delete(playerId);
    }
    return player || null;
  }

  /**
   * Get all players as an array.
   * @returns {Player[]}
   */
  getPlayersArray() {
    return Array.from(this.players.values());
  }

  /**
   * Get alive players.
   * @returns {Player[]}
   */
  getAlivePlayers() {
    return this.getPlayersArray().filter(p => p.isAlive);
  }

  /**
   * Get alive players with a specific role.
   * @param {string} role
   * @returns {Player[]}
   */
  getAliveByRole(role) {
    return this.getAlivePlayers().filter(p => p.role === role);
  }

  /**
   * Get public player list (safe to broadcast).
   * @returns {object[]}
   */
  getPublicPlayerList() {
    return this.getPlayersArray().map(p => p.toPublic());
  }

  /**
   * Reset night actions for a new night phase.
   */
  resetNightActions() {
    this.nightActions = {
      mafiaVotes: new Map(),
      doctorSave: null,
      detectiveInvestigate: null
    };
    this.nightStep = null;
  }

  /**
   * Reset votes for a new voting phase.
   */
  resetVotes() {
    this.votes = new Map();
  }

  /**
   * Determine the Mafia's kill target from their votes.
   * Uses majority; if tied, picks randomly among tied targets.
   * @returns {string|null} targetPlayerId
   */
  getMafiaTarget() {
    const voteCounts = new Map();
    for (const targetId of this.nightActions.mafiaVotes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }
    if (voteCounts.size === 0) return null;

    let maxVotes = 0;
    for (const count of voteCounts.values()) {
      if (count > maxVotes) maxVotes = count;
    }

    const topTargets = [];
    for (const [targetId, count] of voteCounts) {
      if (count === maxVotes) topTargets.push(targetId);
    }

    // Random pick among ties
    return topTargets[Math.floor(Math.random() * topTargets.length)];
  }

  /**
   * Tally day votes and determine elimination target.
   * Requires strict majority (> 50% of alive players) to eliminate.
   * @returns {{ targetId: string|null, tally: object }}
   */
  tallyVotes() {
    const voteCounts = new Map();
    for (const targetId of this.votes.values()) {
      if (targetId === 'skip') continue;
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }

    const aliveCount = this.getAlivePlayers().length;
    const tally = {};
    let maxVotes = 0;
    let maxTarget = null;

    for (const [targetId, count] of voteCounts) {
      tally[targetId] = count;
      if (count > maxVotes) {
        maxVotes = count;
        maxTarget = targetId;
      }
    }

    // Count skip votes
    let skipCount = 0;
    for (const targetId of this.votes.values()) {
      if (targetId === 'skip') skipCount++;
    }
    tally['skip'] = skipCount;

    // Need more votes than any other option and more than skip
    if (maxVotes === 0 || skipCount >= maxVotes) {
      return { targetId: null, tally };
    }

    // Check for ties
    const tiedTargets = [];
    for (const [targetId, count] of voteCounts) {
      if (count === maxVotes) tiedTargets.push(targetId);
    }

    if (tiedTargets.length > 1) {
      return { targetId: null, tally }; // Tie = no elimination
    }

    return { targetId: maxTarget, tally };
  }

  /**
   * Check win conditions.
   * @returns {string|null} 'mafia' | 'villagers' | null
   */
  checkWinCondition() {
    const aliveMafia = this.getAliveByRole('mafia').length;
    const aliveNonMafia = this.getAlivePlayers().length - aliveMafia;

    if (aliveMafia === 0) return 'villagers';
    if (aliveMafia >= aliveNonMafia) return 'mafia';
    return null;
  }

  /**
   * Clear any active phase timer.
   */
  clearPhaseTimer() {
    if (this.phaseTimer) {
      clearTimeout(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  /**
   * Reset room to lobby state for a new game.
   */
  resetForNewGame() {
    this.state = 'lobby';
    this.round = 0;
    this.transitionStep = null;
    this.transitionData = null;
    this.resetNightActions();
    this.resetVotes();
    this.eliminatedPlayers = [];
    this.winner = null;
    this.clearPhaseTimer();
    this.nightStep = null;

    for (const player of this.players.values()) {
      player.role = null;
      player.isAlive = true;
      player.isReady = false;
    }
  }
}

module.exports = Room;
