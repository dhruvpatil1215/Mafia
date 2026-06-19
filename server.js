/**
 * Mafia Game Server
 * Main entry point for the application.
 * Sets up Express, Socket.IO, connects to MongoDB, and serves the static React frontend.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const routes = require('./routes/index');
const { initializeSocket } = require('./socket/index');

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mafia_online';
console.log(`[DB] Attempting to connect to MongoDB...`);
mongoose.connect(MONGODB_URI)
  .then(() => console.log('[DB] MongoDB connected successfully.'))
  .catch((err) => {
    console.warn('\n⚠️  [DB WARNING] MongoDB connection failed:', err.message);
    console.warn('⚠️  The game will run with in-memory fallback (stats and history will not be saved).\n');
  });

// Initialize Socket.IO with CORS configuration
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from React build directory
app.use(express.static(path.join(__dirname, 'client/dist')));

// API Routes
app.use('/', routes);

// Fallback all page routes to React SPA index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

// Initialize Socket.IO handlers
initializeSocket(io);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║       🐺 MAFIA ONLINE SERVER 🐺          ║
  ║                                          ║
  ║   Running on http://localhost:${PORT}       ║
  ║   Press Ctrl+C to stop                   ║
  ╚══════════════════════════════════════════╝
  `);
});
