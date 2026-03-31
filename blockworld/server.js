const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const DATA_FILE = path.join(__dirname, 'data.json');

let data = { users: {}, builds: [] };
if (fs.existsSync(DATA_FILE)) {
  try { data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) {}
}
if (!data.users) data.users = {};
if (!data.builds) data.builds = [];

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const CURSE_WORDS = [
  'fuck','shit','ass','bitch','cunt','damn','piss','cock','dick',
  'pussy','whore','slut','nigger','nigga','faggot','retard','bastard','crap'
];

function hasCurseWord(str) {
  const lower = str.toLowerCase().replace(/[^a-z]/g,'');
  return CURSE_WORDS.some(w => lower.includes(w));
}

// Active sessions
const activeSockets = new Map(); // socketId -> username

// Race state
let raceLobby = [];
let raceCountdownTimer = null;
let raceCountdown = 0;
let raceInProgress = false;
const racePlayers = new Map(); // socketId -> {username, x, y, z, progress}

// Parkour state
const parkourPlayers = new Map(); // socketId -> {username, x, y, progress}

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  // --- USERNAME ---
  socket.on('register-username', (rawName, cb) => {
    if (typeof rawName !== 'string') return cb({ success: false, error: 'Invalid input' });
    const username = rawName.trim();
    if (username.length < 1) return cb({ success: false, error: 'Username is required' });
    if (username.length > 20) return cb({ success: false, error: 'Max 20 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return cb({ success: false, error: 'Only letters, numbers, underscores allowed' });
    if (hasCurseWord(username)) return cb({ success: false, error: 'Username contains inappropriate words' });
    for (const [sid, uname] of activeSockets) {
      if (uname.toLowerCase() === username.toLowerCase() && sid !== socket.id) {
        return cb({ success: false, error: 'Username already taken by online player' });
      }
    }
    activeSockets.set(socket.id, username);
    if (!data.users[username]) { data.users[username] = { wins: 0, title: null }; saveData(); }
    cb({ success: true, username, user: data.users[username] });
  });

  // --- BUILDS ---
  socket.on('get-games', (cb) => {
    const top20 = [...data.builds].sort((a,b) => b.playCount - a.playCount).slice(0,20);
    cb({ builds: top20 });
  });

  socket.on('save-build', ({ name, buildData, type }, cb) => {
    const username = activeSockets.get(socket.id);
    if (!username) return cb({ success: false, error: 'Not logged in' });
    if (!name || name.trim().length === 0) return cb({ success: false, error: 'Name required' });
    if (name.trim().length > 40) return cb({ success: false, error: 'Name too long (max 40)' });
    if (hasCurseWord(name)) return cb({ success: false, error: 'Inappropriate name' });
    const build = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name: name.trim(),
      author: username,
      playCount: 0,
      type: type || '3d',
      data: buildData,
      createdAt: Date.now()
    };
    data.builds.push(build);
    saveData();
    cb({ success: true, build });
  });

  socket.on('load-build', (buildId, cb) => {
    const build = data.builds.find(b => b.id === buildId);
    if (!build) return cb({ success: false, error: 'Not found' });
    build.playCount++;
    saveData();
    cb({ success: true, build });
  });

  // --- RACE LOBBY ---
  socket.on('join-race-lobby', () => {
    const username = activeSockets.get(socket.id);
    if (!username) return;
    if (raceInProgress) { socket.emit('race-status', { status: 'in-progress' }); return; }
    if (!raceLobby.find(p => p.socketId === socket.id)) {
      raceLobby.push({ socketId: socket.id, username });
    }
    broadcastLobby();
    if (raceLobby.length >= 2 && !raceCountdownTimer) startCountdown();
  });

  socket.on('leave-race-lobby', () => {
    removeFromLobby(socket.id);
  });

  socket.on('race-position', ({ x, y, z, progress }) => {
    if (!racePlayers.has(socket.id)) return;
    const p = racePlayers.get(socket.id);
    p.x = x; p.y = y; p.z = z; p.progress = progress;
    socket.broadcast.to('race').emit('race-player-move', {
      socketId: socket.id, username: p.username, x, y, z, progress
    });
  });

  socket.on('race-finish', () => {
    const username = activeSockets.get(socket.id);
    if (!username || !data.users[username]) return;
    if (!racePlayers.has(socket.id)) return;

    data.users[username].wins = (data.users[username].wins || 0) + 1;
    const wins = data.users[username].wins;
    if (wins >= 100) data.users[username].title = 'winner';
    else if (wins >= 1 && !data.users[username].title) data.users[username].title = 'cool person';
    saveData();

    io.to('race').emit('race-winner', {
      username, wins, title: data.users[username].title
    });
    socket.emit('title-update', data.users[username]);

    setTimeout(() => {
      raceInProgress = false;
      for (const [sid] of racePlayers) io.sockets.sockets.get(sid)?.leave('race');
      racePlayers.clear();
      io.emit('race-ended');
    }, 6000);
  });

  // --- PARKOUR ---
  socket.on('join-parkour', () => {
    const username = activeSockets.get(socket.id);
    if (!username) return;
    parkourPlayers.set(socket.id, { username, x: 60, y: 0, progress: 0 });
    socket.join('parkour');
    socket.emit('parkour-all-players', [...parkourPlayers.entries()].map(([sid, p]) => ({ socketId: sid, ...p })));
    socket.to('parkour').emit('parkour-player-joined', { socketId: socket.id, username, x: 60, y: 0 });
  });

  socket.on('leave-parkour', () => {
    parkourPlayers.delete(socket.id);
    socket.leave('parkour');
    io.to('parkour').emit('parkour-player-left', socket.id);
  });

  socket.on('parkour-update', ({ x, y, progress }) => {
    if (!parkourPlayers.has(socket.id)) return;
    const p = parkourPlayers.get(socket.id);
    p.x = x; p.y = y; p.progress = progress;
    socket.to('parkour').emit('parkour-player-move', { socketId: socket.id, x, y, progress });
  });

  socket.on('parkour-finish', () => {
    const username = activeSockets.get(socket.id);
    if (!username) return;
    io.to('parkour').emit('parkour-player-finished', { username });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    activeSockets.delete(socket.id);
    removeFromLobby(socket.id);
    if (racePlayers.has(socket.id)) {
      socket.leave('race');
      racePlayers.delete(socket.id);
      io.to('race').emit('race-player-left', socket.id);
    }
    if (parkourPlayers.has(socket.id)) {
      parkourPlayers.delete(socket.id);
      io.to('parkour').emit('parkour-player-left', socket.id);
    }
  });
});

function broadcastLobby() {
  io.emit('race-lobby-update', { players: raceLobby.map(p => p.username), count: raceLobby.length });
}

function removeFromLobby(socketId) {
  raceLobby = raceLobby.filter(p => p.socketId !== socketId);
  broadcastLobby();
  if (raceLobby.length < 2 && raceCountdownTimer) {
    clearInterval(raceCountdownTimer);
    raceCountdownTimer = null;
    io.emit('race-countdown-cancelled');
  }
}

function startCountdown() {
  raceCountdown = 15;
  io.emit('race-countdown', { countdown: raceCountdown });
  raceCountdownTimer = setInterval(() => {
    raceCountdown--;
    io.emit('race-countdown', { countdown: raceCountdown });
    if (raceCountdown <= 0) {
      clearInterval(raceCountdownTimer);
      raceCountdownTimer = null;
      startRace();
    }
  }, 1000);
}

function startRace() {
  raceInProgress = true;
  for (const p of raceLobby) {
    racePlayers.set(p.socketId, { username: p.username, x: 0, y: 1, z: 0, progress: 0 });
    const s = io.sockets.sockets.get(p.socketId);
    if (s) s.join('race');
  }
  const participants = raceLobby.map(p => p.username);
  raceLobby = [];
  io.emit('race-start', { participants });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`BlockWorld running at http://localhost:${PORT}`));
