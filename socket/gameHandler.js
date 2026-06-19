/**
 * Game Handler
 * Manages all game logic: role assignment, night/day phases,
 * action processing, voting, and win condition checking.
 *
 * Night phase is now SEQUENTIAL:
 *   Mafia step (STEP_DURATION s) → Doctor step → Detective step → Resolve
 */

const { sendSystemMessage } = require('./chatHandler');
const GameHistory = require('../models/GameHistory');
const PlayerStats = require('../models/PlayerStats');

/** Duration (seconds) each role gets during their night step. */
const STEP_DURATION = 15;

/**
 * Role distribution based on player count.
 * 5–6:  1 Mafia, 1 Doctor, 1 Detective, rest Villagers
 * 7–10: 2 Mafia, 1 Doctor, 1 Detective, rest Villagers
 * 11–15: 3 Mafia, 1 Doctor, 1 Detective, rest Villagers
 */
function getRoleDistribution(playerCount) {
  let mafiaCount;
  if (playerCount <= 6) mafiaCount = 1;
  else if (playerCount <= 10) mafiaCount = 2;
  else mafiaCount = 3;

  return {
    mafia: mafiaCount,
    doctor: 1,
    detective: 1,
    villager: playerCount - mafiaCount - 2
  };
}

/**
 * Shuffle an array in-place using Fisher-Yates algorithm.
 */
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Assign roles to all players in a room.
 */
function assignRoles(room) {
  const players = room.getPlayersArray();
  const dist = getRoleDistribution(players.length);

  const roles = [];
  for (let i = 0; i < dist.mafia; i++) roles.push('mafia');
  for (let i = 0; i < dist.doctor; i++) roles.push('doctor');
  for (let i = 0; i < dist.detective; i++) roles.push('detective');
  for (let i = 0; i < dist.villager; i++) roles.push('villager');

  shuffle(roles);
  players.forEach((player, index) => {
    player.role = roles[index];
  });
}

/**
 * Register game-related socket events.
 */
function gameHandler(io, socket, rooms, playerSessions) {

  /**
   * Mafia selects a target during the Mafia night step.
   */
  socket.on('mafia-action', ({ roomCode, targetId }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'night' || room.nightStep !== 'mafia') return;

    const player = room.players.get(session.playerId);
    if (!player || !player.isAlive || player.role !== 'mafia') return;

    const target = room.players.get(targetId);
    if (!target || !target.isAlive || target.role === 'mafia') return;

    room.nightActions.mafiaVotes.set(player.id, targetId);

    // Confirm to the voting mafia player
    socket.emit('action-confirmed', { action: 'mafia', targetId });

    // Notify other mafia members about the vote
    for (const p of room.getAliveByRole('mafia')) {
      if (p.isConnected) {
        io.to(p.socketId).emit('mafia-vote-update', {
          voterId: player.id,
          voterNickname: player.nickname,
          targetId: targetId,
          totalMafia: room.getAliveByRole('mafia').length,
          totalVotes: room.nightActions.mafiaVotes.size
        });
      }
    }

    // If all alive mafia have voted, advance to Doctor step immediately
    const aliveMafia = room.getAliveByRole('mafia');
    if (room.nightActions.mafiaVotes.size >= aliveMafia.length) {
      startDoctorStep(io, room);
    }
  });

  /**
   * Doctor selects a player to protect during the Doctor night step.
   */
  socket.on('doctor-action', ({ roomCode, targetId }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'night' || room.nightStep !== 'doctor') return;

    const player = room.players.get(session.playerId);
    if (!player || !player.isAlive || player.role !== 'doctor') return;

    const target = room.players.get(targetId);
    if (!target || !target.isAlive) return;

    room.nightActions.doctorSave = targetId;
    socket.emit('action-confirmed', { action: 'doctor', targetId });

    // Advance to Detective step immediately
    startDetectiveStep(io, room);
  });

  /**
   * Detective investigates a player during the Detective night step.
   */
  socket.on('detective-action', ({ roomCode, targetId }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'night' || room.nightStep !== 'detective') return;

    const player = room.players.get(session.playerId);
    if (!player || !player.isAlive || player.role !== 'detective') return;

    const target = room.players.get(targetId);
    if (!target || !target.isAlive || target.id === player.id) return;

    room.nightActions.detectiveInvestigate = targetId;

    socket.emit('detective-result', {
      targetId: target.id,
      targetNickname: target.nickname,
      isMafia: target.role === 'mafia'
    });

    socket.emit('action-confirmed', { action: 'detective', targetId });

    // Resolve night immediately after detective acts
    resolveNight(io, room);
  });

  /**
   * Player casts a vote during day voting phase.
   */
  socket.on('cast-vote', ({ roomCode, targetId }) => {
    const session = playerSessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(roomCode);
    if (!room || room.state !== 'day-voting') return;

    const player = room.players.get(session.playerId);
    if (!player || !player.isAlive) return;

    if (targetId !== 'skip') {
      const target = room.players.get(targetId);
      if (!target || !target.isAlive || target.id === player.id) return;
    }

    room.votes.set(player.id, targetId);

    io.to(roomCode).emit('vote-update', {
      voterId: player.id,
      voterNickname: player.nickname,
      totalVotes: room.votes.size,
      totalAlive: room.getAlivePlayers().length
    });

    if (room.votes.size >= room.getAlivePlayers().length) {
      room.clearPhaseTimer();
      resolveVoting(io, room);
    }
  });
}

/**
 * Start the game: assign roles and begin the first night.
 */
function startGame(io, room) {
  assignRoles(room);
  room.state = 'starting';

  for (const player of room.players.values()) {
    if (player.isConnected) {
      const mafiaMembers = player.role === 'mafia'
        ? room.getAliveByRole('mafia')
            .filter(p => p.id !== player.id)
            .map(p => ({ id: p.id, nickname: p.nickname }))
        : [];

      io.to(player.socketId).emit('game-started', {
        role: player.role,
        mafiaMembers: mafiaMembers,
        players: room.getPublicPlayerList(),
        settings: room.settings
      });
    }
  }

  sendSystemMessage(io, room.code, '🎙️ **God:** The game has begun! Roles have been assigned.', 'phase');

  setTimeout(() => {
    startNightPhase(io, room);
  }, 8000);
}

/**
 * Start the night phase — announces night, then begins the sequential steps:
 *   Mafia → Doctor → Detective → Resolve
 */
function startNightPhase(io, room) {
  room.state = 'night';
  room.round++;
  room.nightStep = null;
  room.resetNightActions();

  sendSystemMessage(io, room.code, `🎙️ **God:** Night ${room.round} falls... Everyone close your eyes.`, 'phase');

  // Announce night to all (short 3s animation before first step)
  io.to(room.code).emit('phase-change', {
    phase: 'night',
    round: room.round,
    duration: 3,
    alivePlayers: room.getAlivePlayers().map(p => p.toPublic())
  });

  room.phaseTimer = setTimeout(() => {
    startMafiaStep(io, room);
  }, 3000);
}

/**
 * Night Step 1 — Mafia chooses a target (STEP_DURATION seconds).
 */
function startMafiaStep(io, room) {
  if (room.state !== 'night') return;
  room.clearPhaseTimer();
  room.nightStep = 'mafia';

  const aliveMafia = room.getAliveByRole('mafia');
  if (aliveMafia.length === 0) {
    startDoctorStep(io, room);
    return;
  }

  sendSystemMessage(io, room.code, `🐺 **God:** Mafia, wake up. Choose your target.`, 'phase');

  io.to(room.code).emit('night-step', {
    step: 'mafia',
    duration: STEP_DURATION,
    round: room.round
  });

  const mafiaTargets = room.getAlivePlayers()
    .filter(p => p.role !== 'mafia')
    .map(p => p.toPublic());

  for (const player of room.getAlivePlayers()) {
    if (!player.isConnected) continue;
    if (player.role === 'mafia') {
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'mafia',
        prompt: 'Choose a player to eliminate',
        targets: mafiaTargets
      });
    } else {
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'sleeping',
        prompt: 'Mafia is awake... Keep your eyes closed.',
        targets: []
      });
    }
  }

  room.phaseTimer = setTimeout(() => {
    startDoctorStep(io, room);
  }, STEP_DURATION * 1000);
}

/**
 * Night Step 2 — Doctor chooses who to protect (STEP_DURATION seconds).
 */
function startDoctorStep(io, room) {
  if (room.state !== 'night') return;
  room.clearPhaseTimer();
  room.nightStep = 'doctor';

  const aliveDoctor = room.getAliveByRole('doctor');
  if (aliveDoctor.length === 0) {
    startDetectiveStep(io, room);
    return;
  }

  sendSystemMessage(io, room.code, `🩺 **God:** Doctor, wake up. Choose someone to protect.`, 'phase');

  io.to(room.code).emit('night-step', {
    step: 'doctor',
    duration: STEP_DURATION,
    round: room.round
  });

  for (const player of room.getAlivePlayers()) {
    if (!player.isConnected) continue;
    if (player.role === 'doctor') {
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'doctor',
        prompt: 'Choose a player to protect',
        targets: room.getAlivePlayers().map(p => p.toPublic())
      });
    } else {
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'sleeping',
        prompt: 'Doctor is awake... Keep your eyes closed.',
        targets: []
      });
    }
  }

  room.phaseTimer = setTimeout(() => {
    startDetectiveStep(io, room);
  }, STEP_DURATION * 1000);
}

/**
 * Night Step 3 — Detective investigates a player (STEP_DURATION seconds).
 */
function startDetectiveStep(io, room) {
  if (room.state !== 'night') return;
  room.clearPhaseTimer();
  room.nightStep = 'detective';

  const aliveDetective = room.getAliveByRole('detective');
  if (aliveDetective.length === 0) {
    resolveNight(io, room);
    return;
  }

  sendSystemMessage(io, room.code, `🔍 **God:** Detective, wake up. Investigate a player.`, 'phase');

  io.to(room.code).emit('night-step', {
    step: 'detective',
    duration: STEP_DURATION,
    round: room.round
  });

  for (const player of room.getAlivePlayers()) {
    if (!player.isConnected) continue;
    if (player.role === 'detective') {
      const targets = room.getAlivePlayers()
        .filter(p => p.id !== player.id)
        .map(p => p.toPublic());
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'detective',
        prompt: 'Choose a player to investigate',
        targets: targets
      });
    } else {
      io.to(player.socketId).emit('night-action-prompt', {
        role: 'sleeping',
        prompt: 'Detective is investigating... Keep your eyes closed.',
        targets: []
      });
    }
  }

  room.phaseTimer = setTimeout(() => {
    resolveNight(io, room);
  }, STEP_DURATION * 1000);
}

/**
 * Send the correct night-action-prompt to a player who just reconnected.
 * Called after emitting 'reconnected' if room.state === 'night'.
 */
function sendNightPromptToReconnectedPlayer(socket, room, player) {
  if (!player.isAlive || room.state !== 'night' || !room.nightStep) return;

  const step = room.nightStep;
  const sleepingMsgs = {
    mafia: 'Mafia is awake... Keep your eyes closed.',
    doctor: 'Doctor is awake... Keep your eyes closed.',
    detective: 'Detective is investigating... Keep your eyes closed.'
  };

  if (step === 'mafia' && player.role === 'mafia') {
    const mafiaTargets = room.getAlivePlayers()
      .filter(p => p.role !== 'mafia')
      .map(p => p.toPublic());
    socket.emit('night-action-prompt', {
      role: 'mafia',
      prompt: 'Choose a player to eliminate',
      targets: mafiaTargets
    });
  } else if (step === 'doctor' && player.role === 'doctor') {
    socket.emit('night-action-prompt', {
      role: 'doctor',
      prompt: 'Choose a player to protect',
      targets: room.getAlivePlayers().map(p => p.toPublic())
    });
  } else if (step === 'detective' && player.role === 'detective') {
    const targets = room.getAlivePlayers()
      .filter(p => p.id !== player.id)
      .map(p => p.toPublic());
    socket.emit('night-action-prompt', {
      role: 'detective',
      prompt: 'Choose a player to investigate',
      targets: targets
    });
  } else {
    socket.emit('night-action-prompt', {
      role: 'sleeping',
      prompt: sleepingMsgs[step] || 'Wait for morning...',
      targets: []
    });
  }
}

/**
 * Resolve the night phase: process kills, saves, and check win condition.
 */
function resolveNight(io, room) {
  if (room.state !== 'night') return; // Prevent double resolution

  room.clearPhaseTimer();
  room.nightStep = null;

  const mafiaTarget = room.getMafiaTarget();
  const doctorSave = room.nightActions.doctorSave;

  let killedPlayer = null;
  let wasSaved = false;

  if (mafiaTarget) {
    if (mafiaTarget === doctorSave) {
      wasSaved = true;
    } else {
      const target = room.players.get(mafiaTarget);
      if (target) {
        target.isAlive = false;
        killedPlayer = target;
        room.eliminatedPlayers.push({
          id: target.id,
          nickname: target.nickname,
          role: target.role,
          round: room.round,
          eliminatedBy: 'mafia'
        });
      }
    }
  }

  const winner = room.checkWinCondition();
  if (winner) {
    endGame(io, room, winner);
    return;
  }

  startDayTransition(io, room, killedPlayer, wasSaved);
}

/**
 * Start the narrative morning transition phase.
 */
function startDayTransition(io, room, killedPlayer, wasSaved) {
  room.state = 'day-transition';
  room.transitionStep = 'wakeup';
  room.transitionData = { killedPlayer, wasSaved };

  sendSystemMessage(io, room.code, "🎙️ **God:** Wake up, everyone! Morning has come.", 'phase');

  io.to(room.code).emit('phase-change', {
    phase: 'day-transition',
    step: 'wakeup',
    round: room.round,
    duration: 4,
    allPlayers: room.getPublicPlayerList()
  });

  room.phaseTimer = setTimeout(() => {
    announceTransitionResult(io, room);
  }, 4000);
}

/**
 * Announce who was killed (second step of day transition).
 */
function announceTransitionResult(io, room) {
  if (room.state !== 'day-transition') return;

  room.transitionStep = 'result';
  const { killedPlayer, wasSaved } = room.transitionData;

  let nightResultMessage;
  if (killedPlayer) {
    nightResultMessage = `🎙️ **God:** **${killedPlayer.nickname}** was found dead last night. They were a **${killedPlayer.role}**.`;
  } else if (wasSaved) {
    nightResultMessage = `🎙️ **God:** The Mafia tried to strike, but the Doctor saved the target! No one died tonight.`;
  } else {
    nightResultMessage = `🎙️ **God:** The night was peaceful. No one was killed.`;
  }

  sendSystemMessage(io, room.code, nightResultMessage, 'death');

  io.to(room.code).emit('phase-change', {
    phase: 'day-transition',
    step: 'result',
    round: room.round,
    duration: 5,
    killedPlayer: killedPlayer ? {
      id: killedPlayer.id,
      nickname: killedPlayer.nickname,
      role: killedPlayer.role
    } : null,
    wasSaved: wasSaved,
    allPlayers: room.getPublicPlayerList()
  });

  room.phaseTimer = setTimeout(() => {
    startDayPhase(io, room, killedPlayer, wasSaved);
  }, 5000);
}

/**
 * Start the day discussion phase.
 */
function startDayPhase(io, room, killedPlayer, wasSaved) {
  room.state = 'day-discussion';
  room.transitionStep = null;
  room.transitionData = null;

  sendSystemMessage(io, room.code, `🎙️ **God:** Discussion time! You have ${room.settings.dayDiscussionDuration} seconds to discuss.`, 'phase');

  io.to(room.code).emit('phase-change', {
    phase: 'day-discussion',
    round: room.round,
    duration: room.settings.dayDiscussionDuration,
    killedPlayer: killedPlayer ? {
      id: killedPlayer.id,
      nickname: killedPlayer.nickname,
      role: killedPlayer.role
    } : null,
    wasSaved: wasSaved,
    alivePlayers: room.getAlivePlayers().map(p => p.toPublic()),
    allPlayers: room.getPublicPlayerList()
  });

  room.phaseTimer = setTimeout(() => {
    startVotingPhase(io, room);
  }, room.settings.dayDiscussionDuration * 1000);
}

/**
 * Start the day voting phase.
 */
function startVotingPhase(io, room) {
  room.state = 'day-voting';
  room.resetVotes();

  sendSystemMessage(io, room.code, `🎙️ **God:** Voting time! Choose who to eliminate or skip. You have ${room.settings.dayVotingDuration} seconds.`, 'phase');

  const alivePlayers = room.getAlivePlayers().map(p => p.toPublic());

  io.to(room.code).emit('phase-change', {
    phase: 'day-voting',
    round: room.round,
    duration: room.settings.dayVotingDuration,
    alivePlayers: alivePlayers
  });

  room.phaseTimer = setTimeout(() => {
    resolveVoting(io, room);
  }, room.settings.dayVotingDuration * 1000);
}

/**
 * Resolve day voting: eliminate the player with most votes.
 */
function resolveVoting(io, room) {
  if (room.state !== 'day-voting') return;

  room.clearPhaseTimer();

  const { targetId, tally } = room.tallyVotes();
  let eliminatedPlayer = null;

  if (targetId) {
    const target = room.players.get(targetId);
    if (target) {
      target.isAlive = false;
      eliminatedPlayer = target;
      room.eliminatedPlayers.push({
        id: target.id,
        nickname: target.nickname,
        role: target.role,
        round: room.round,
        eliminatedBy: 'vote'
      });
      sendSystemMessage(io, room.code, `🎙️ **God:** The town has spoken! **${target.nickname}** has been eliminated. They were a **${target.role}**.`, 'death');
    }
  } else {
    sendSystemMessage(io, room.code, `🎙️ **God:** The vote was inconclusive. No one was eliminated.`, 'phase');
  }

  const tallyWithNames = {};
  for (const [id, count] of Object.entries(tally)) {
    if (id === 'skip') {
      tallyWithNames['Skip'] = count;
    } else {
      const p = room.players.get(id);
      tallyWithNames[p ? p.nickname : 'Unknown'] = count;
    }
  }

  io.to(room.code).emit('vote-results', {
    eliminatedPlayer: eliminatedPlayer ? {
      id: eliminatedPlayer.id,
      nickname: eliminatedPlayer.nickname,
      role: eliminatedPlayer.role
    } : null,
    tally: tallyWithNames,
    allPlayers: room.getPublicPlayerList()
  });

  const winner = room.checkWinCondition();
  if (winner) {
    setTimeout(() => endGame(io, room, winner), 3000);
    return;
  }

  setTimeout(() => {
    startNightPhase(io, room);
  }, 5000);
}

/**
 * Save game stats to MongoDB database.
 */
async function saveGameStats(room, winner) {
  try {
    const playersArray = room.getPlayersArray();
    const durationSeconds = Math.round((Date.now() - room.createdAt) / 1000);

    const historyPlayers = playersArray.map(p => {
      const elimRecord = room.eliminatedPlayers.find(ep => ep.id === p.id);
      return {
        nickname: p.nickname,
        role: p.role,
        isAlive: p.isAlive,
        wasKilled: elimRecord ? elimRecord.eliminatedBy === 'mafia' : false,
        wasVotedOut: elimRecord ? elimRecord.eliminatedBy === 'vote' : false
      };
    });

    const history = new GameHistory({
      roomCode: room.code,
      winner: winner,
      roundCount: room.round,
      players: historyPlayers,
      durationSeconds: durationSeconds
    });
    await history.save();
    console.log(`[DB] Saved game history for room ${room.code}`);

    const promises = playersArray.map(async (p) => {
      const won = (winner === 'mafia' && p.role === 'mafia') ||
                  (winner === 'villagers' && p.role !== 'mafia');

      const incData = {
        gamesPlayed: 1,
        gamesWon: won ? 1 : 0,
        gamesLost: won ? 0 : 1,
      };

      if (p.role === 'mafia') {
        incData.mafiaPlayed = 1;
        incData.mafiaWins = won ? 1 : 0;
      } else if (p.role === 'doctor') {
        incData.doctorPlayed = 1;
        incData.doctorWins = won ? 1 : 0;
      } else if (p.role === 'detective') {
        incData.detectivePlayed = 1;
        incData.detectiveWins = won ? 1 : 0;
      } else {
        incData.villagerPlayed = 1;
        incData.villagerWins = won ? 1 : 0;
      }

      await PlayerStats.findOneAndUpdate(
        { nickname: p.nickname },
        {
          $inc: incData,
          $set: { lastActive: new Date() }
        },
        { upsert: true, new: true }
      );
    });

    await Promise.all(promises);
    console.log(`[DB] Updated player stats for all players in room ${room.code}`);
  } catch (err) {
    console.error('[DB ERROR] Failed to save game history and stats:', err.message);
  }
}

/**
 * End the game and declare a winner.
 */
function endGame(io, room, winner) {
  room.state = 'game-over';
  room.winner = winner;
  room.clearPhaseTimer();

  const winMessage = winner === 'mafia'
    ? '🎙️ **God:** The Mafia has taken over the town! Mafia wins!'
    : '🎙️ **God:** All Mafia members have been eliminated! The Villagers win!';

  sendSystemMessage(io, room.code, winMessage, 'phase');

  const allPlayersFull = room.getPlayersArray().map(p => ({
    id: p.id,
    nickname: p.nickname,
    role: p.role,
    isAlive: p.isAlive
  }));

  io.to(room.code).emit('game-over', {
    winner: winner,
    message: winMessage,
    players: allPlayersFull,
    eliminatedPlayers: room.eliminatedPlayers
  });

  saveGameStats(room, winner);
}

module.exports = { gameHandler, startGame, startNightPhase, sendNightPromptToReconnectedPlayer };
