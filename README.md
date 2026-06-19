# 🐺 Mafia — The Party Game

A full-stack, real-time multiplayer Mafia/Werewolf party game built with Node.js, Express, Socket.IO, and a modern dark-themed responsive UI.

## ✨ Features

- **Real-time multiplayer** via WebSockets (Socket.IO)
- **Room system** with 6-character room codes
- **4 roles**: Mafia, Doctor, Detective, Villager
- **Full game loop**: Night → Day Discussion → Day Voting
- **Responsive design**: Works on mobile, tablet, and desktop
- **Reconnection support**: Rejoin if you refresh or disconnect
- **Spectator mode**: Watch the game after elimination
- **Sound effects**: Web Audio API generated sounds
- **Chat system**: Phase-aware with spectator chat
- **Host controls**: Start game, kick players, play again
- **Dark modern UI**: Glassmorphism, animations, and gradients

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) v16 or higher
- npm (comes with Node.js)

### Installation

```bash
# Clone or navigate to the project directory
cd mafia

# Install dependencies
npm install

# Start the server
npm start

# Or start with auto-reload (development)
npm run dev
```

### Play
1. Open `http://localhost:3000` in your browser
2. Enter a nickname and click **Create Room**
3. Share the room code with friends
4. Once 5+ players join, the host clicks **Start Game**

> **Tip**: Open multiple browser tabs to test with yourself!

## 🎮 How to Play

### Roles
| Role | Team | Night Action |
|------|------|------|
| 🐺 **Mafia** | Evil | Choose a player to eliminate |
| 🩺 **Doctor** | Good | Choose a player to protect |
| 🔍 **Detective** | Good | Investigate a player's alignment |
| 👤 **Villager** | Good | No night action — vote wisely! |

### Role Distribution
| Players | Mafia Count |
|---------|-------------|
| 5–6 | 1 Mafia |
| 7–10 | 2 Mafia |
| 11–15 | 3 Mafia |

*Every game always has exactly 1 Doctor and 1 Detective.*

### Game Flow
1. **Night Phase** (30s): Mafia, Doctor, and Detective perform actions secretly
2. **Day Discussion** (90s): Night results are revealed, players discuss
3. **Day Voting** (30s): Vote to eliminate a suspect or skip
4. Repeat until a win condition is met

### Win Conditions
- **🏘️ Villagers Win**: All Mafia members are eliminated
- **🐺 Mafia Wins**: Mafia count equals or exceeds non-Mafia count

## 📁 Folder Structure

```
mafia/
├── server.js              # Express + Socket.IO server
├── package.json           # Dependencies and scripts
├── README.md              # This file
├── models/
│   ├── Player.js          # Player data model
│   └── Room.js            # Room state model
├── routes/
│   └── index.js           # API routes
├── socket/
│   ├── index.js           # Socket.IO master handler
│   ├── roomHandler.js     # Room management events
│   ├── gameHandler.js     # Game logic and phases
│   └── chatHandler.js     # Chat messaging
└── public/
    ├── index.html         # Home page
    ├── lobby.html         # Lobby page
    ├── game.html          # Game page
    ├── css/
    │   ├── styles.css     # Design system + components
    │   └── animations.css # Keyframe animations
    └── js/
        ├── app.js         # Socket init, session, utilities
        ├── home.js        # Home page logic
        ├── lobby.js       # Lobby page logic
        ├── game.js        # Game page logic
        ├── chat.js        # Chat module
        └── audio.js       # Web Audio API sounds
```

## 🔒 Security

- Roles are only sent to individual players, never broadcast
- All actions validated server-side (alive check, role check, phase check)
- Duplicate votes rejected
- Messages sanitized to prevent XSS
- Room access requires valid room code + player membership
- Actions tagged with round numbers to prevent replay

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Real-time**: Socket.IO
- **Frontend**: Vanilla HTML5, CSS3, JavaScript
- **Fonts**: Google Fonts (Outfit, Inter)
- **Audio**: Web Audio API (no external files)

## 📝 License

MIT
