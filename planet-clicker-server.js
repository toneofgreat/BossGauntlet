const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

const PORT = 3006;
const players = {}; // socketId → { name, strength, timePlayed, lastSeen }

// Serve the game file directly
app.use(express.static(path.join(__dirname)));

// Build top-40 leaderboard for a given stat
function getTop40(stat) {
  return Object.values(players)
    .filter(p => p.name)
    .sort((a, b) => b[stat] - a[stat])
    .slice(0, 40)
    .map(p => ({ name: p.name, value: p[stat] }));
}

function broadcastLeaderboards() {
  io.emit('leaderboard', {
    strength: getTop40('strength'),
    time: getTop40('timePlayed'),
  });
}

// Broadcast every 2 seconds
setInterval(broadcastLeaderboards, 2000);

// Remove stale connections (inactive > 2 minutes)
setInterval(() => {
  const cutoff = Date.now() - 120000;
  for (const id of Object.keys(players)) {
    if (players[id].lastSeen < cutoff) delete players[id];
  }
}, 30000);

io.on('connection', socket => {
  players[socket.id] = { name: '', strength: 0, timePlayed: 0, lastSeen: Date.now() };
  console.log(`[+] ${socket.id} connected  (${Object.keys(players).length} online)`);

  socket.on('update', data => {
    const p = players[socket.id];
    if (!p) return;
    p.name = (data.name || '').toUpperCase().slice(0, 12) || 'PLAYER';
    p.strength = Math.max(0, Number(data.strength) || 0);
    p.timePlayed = Math.max(0, Number(data.timePlayed) || 0);
    p.lastSeen = Date.now();
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    console.log(`[-] ${socket.id} disconnected  (${Object.keys(players).length} online)`);
  });
});

server.listen(PORT, () => {
  console.log(`🪐 Planet Clicker server running at http://localhost:${PORT}`);
  console.log(`   Open: http://localhost:${PORT}/planet-clicker.html`);
});
