/**
 * API Routes
 * Serves HTML pages and provides REST endpoints.
 */

const express = require('express');
const router = express.Router();
const { getRoomInfo } = require('../socket/index');
const PlayerStats = require('../models/PlayerStats');
const GameHistory = require('../models/GameHistory');

/**
 * GET /api/room/:code
 * Check if a room exists and get basic info.
 */
router.get('/api/room/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase().trim();
  const info = getRoomInfo(code);

  if (!info) {
    return res.status(404).json({ exists: false, message: 'Room not found.' });
  }

  res.json({ exists: true, ...info });
});

/**
 * GET /api/leaderboard
 * Fetch the leaderboard.
 */
router.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await PlayerStats.find({ gamesPlayed: { $gt: 0 } })
      .sort({ gamesWon: -1, gamesPlayed: 1 })
      .limit(15);
    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard data.' });
  }
});

/**
 * GET /api/stats/:nickname
 * Fetch statistics for a specific player.
 */
router.get('/api/stats/:nickname', async (req, res) => {
  try {
    const nickname = (req.params.nickname || '').trim();
    if (!nickname) {
      return res.status(400).json({ error: 'Nickname is required.' });
    }
    const stats = await PlayerStats.findOne({ nickname: new RegExp(`^${nickname}$`, 'i') });
    if (!stats) {
      return res.status(404).json({ error: 'Player statistics not found.' });
    }
    
    // Also retrieve recent game history for this player
    const history = await GameHistory.find({ 'players.nickname': new RegExp(`^${nickname}$`, 'i') })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({ stats, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player stats.' });
  }
});

/**
 * GET /api/health
 * Health check endpoint.
 */
router.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

module.exports = router;
