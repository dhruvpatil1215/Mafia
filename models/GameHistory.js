const mongoose = require('mongoose');

const GameHistorySchema = new mongoose.Schema({
  roomCode: { type: String, required: true },
  winner: { type: String, required: true }, // 'mafia' | 'villagers'
  roundCount: { type: Number, required: true },
  players: [{
    nickname: { type: String, required: true },
    role: { type: String, required: true },
    isAlive: { type: Boolean, required: true },
    wasKilled: { type: Boolean, default: false },
    wasVotedOut: { type: Boolean, default: false }
  }],
  durationSeconds: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('GameHistory', GameHistorySchema);
