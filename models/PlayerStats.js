const mongoose = require('mongoose');

const PlayerStatsSchema = new mongoose.Schema({
  nickname: { type: String, required: true, unique: true, index: true },
  gamesPlayed: { type: Number, default: 0 },
  gamesWon: { type: Number, default: 0 },
  gamesLost: { type: Number, default: 0 },
  mafiaPlayed: { type: Number, default: 0 },
  mafiaWins: { type: Number, default: 0 },
  villagerPlayed: { type: Number, default: 0 },
  villagerWins: { type: Number, default: 0 },
  doctorPlayed: { type: Number, default: 0 },
  doctorWins: { type: Number, default: 0 },
  detectivePlayed: { type: Number, default: 0 },
  detectiveWins: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PlayerStats', PlayerStatsSchema);
