const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

const PORT = 3002;
const GAME_DURATION = 180;
const CATCH_DIST = 3.5;

const room = {
  players: {},
  state: 'lobby',
  pig: null,
  startTime: null,
  timer: null,
  puzzles: Array.from({length:5}, (_,i) => ({ id:i, solved:false, solver:null, solverName:'' })),
};

const bcast = (ev, d) => io.emit(ev, d);

function getRoom() {
  return {
    players: room.players,
    state: room.state,
    pig: room.pig,
    puzzles: room.puzzles,
    timeLeft: room.startTime ? Math.max(0, GAME_DURATION - (Date.now()-room.startTime)/1000) : GAME_DURATION,
  };
}

function checkAllCaught() {
  const hiders = Object.values(room.players).filter(p => p.role==='hider');
  if (hiders.length > 0 && hiders.every(p => !p.alive)) endGame(true);
}

function endGame(pigWins) {
  if (room.state === 'ended') return;
  room.state = 'ended';
  clearInterval(room.timer);
  const winners = Object.keys(room.players).filter(id => {
    const p = room.players[id];
    return pigWins ? id === room.pig : (p.role === 'hider' && p.alive);
  });
  bcast('game_end', { pigWins, winners });
  setTimeout(resetRoom, 12000);
}

function resetRoom() {
  Object.values(room.players).forEach(p => { p.alive=true; p.ready=false; p.role=null; });
  room.state = 'lobby';
  room.pig = null;
  room.startTime = null;
  room.puzzles.forEach(p => { p.solved=false; p.solver=null; p.solverName=''; });
  clearInterval(room.timer);
  bcast('room_update', getRoom());
}

function tryStart() {
  const ps = Object.values(room.players).filter(p => p.role !== 'spectator');
  if (ps.length < 2 || !ps.every(p => p.ready) || room.state !== 'lobby') return;
  room.state = 'countdown';
  let c = 5;
  bcast('countdown', c);
  const cd = setInterval(() => { c--; bcast('countdown', c); if (c <= 0) { clearInterval(cd); startGame(); } }, 1000);
}

function startGame() {
  const ids = Object.keys(room.players).filter(id => room.players[id].role !== 'spectator');
  if (ids.length < 2) { resetRoom(); return; }
  const pigIdx = Math.floor(Math.random() * ids.length);
  room.pig = ids[pigIdx];
  ids.forEach((id, i) => {
    const p = room.players[id];
    p.role = i === pigIdx ? 'pig' : 'hider';
    p.alive = true;
    if (i === pigIdx) { p.x=0; p.y=1.8; p.z=0; p.ry=0; }
    else {
      const adj = i - (i > pigIdx ? 1 : 0);
      const a = (adj / Math.max(1, ids.length - 1)) * Math.PI * 2;
      p.x = Math.cos(a)*45; p.y=1.8; p.z = Math.sin(a)*45; p.ry=0;
    }
  });
  room.state = 'playing';
  room.startTime = Date.now();
  bcast('game_start', { pig: room.pig, players: room.players, duration: GAME_DURATION });
  room.timer = setInterval(() => {
    const left = GAME_DURATION - (Date.now()-room.startTime)/1000;
    bcast('time_update', Math.max(0, left));
    if (left <= 0) endGame(false);
  }, 1000);
}

io.on('connection', socket => {
  console.log('+ connect', socket.id);
  socket.emit('room_update', getRoom());

  socket.on('join', ({ name, skin }) => {
    const inGame = room.state === 'playing' || room.state === 'ended';
    room.players[socket.id] = {
      id: socket.id, name: String(name).slice(0,20), skin: skin||'basic',
      role: inGame ? 'spectator' : null,
      x:0, y:1.8, z:0, ry:0, alive:true, ready:false,
    };
    bcast('room_update', getRoom());
  });

  socket.on('ready', () => {
    const p = room.players[socket.id];
    if (!p || room.state !== 'lobby' || p.role === 'spectator') return;
    p.ready = !p.ready;
    bcast('room_update', getRoom());
    tryStart();
  });

  socket.on('move', ({ x, y, z, ry }) => {
    const p = room.players[socket.id];
    if (!p || room.state !== 'playing' || !p.alive) return;
    p.x=x; p.y=y; p.z=z; p.ry=ry;
    socket.broadcast.emit('player_moved', { id:socket.id, x, y, z, ry });
  });

  socket.on('catch_attempt', ({ targetId }) => {
    if (room.state !== 'playing' || socket.id !== room.pig) return;
    const pig = room.players[socket.id];
    const tgt = room.players[targetId];
    if (!pig || !tgt || !tgt.alive || tgt.role !== 'hider') return;
    const dx=pig.x-tgt.x, dz=pig.z-tgt.z;
    if (Math.sqrt(dx*dx+dz*dz) > CATCH_DIST) return;
    tgt.alive = false;
    bcast('player_caught', { id:targetId });
    checkAllCaught();
  });

  socket.on('solve_puzzle', ({ puzzleId }) => {
    if (room.state !== 'playing') return;
    const pz = room.puzzles[puzzleId];
    if (!pz || pz.solved) return;
    pz.solved=true; pz.solver=socket.id;
    pz.solverName = room.players[socket.id]?.name || '?';
    bcast('puzzle_solved', { puzzleId, solverId:socket.id, solverName:pz.solverName });
  });

  socket.on('sonar', () => {
    if (room.state !== 'playing' || socket.id !== room.pig) return;
    const hiders = Object.entries(room.players)
      .filter(([id,p]) => p.role==='hider' && p.alive)
      .map(([id,p]) => ({ id, x:p.x, z:p.z }));
    socket.emit('sonar_result', hiders);
  });

  socket.on('disconnect', () => {
    console.log('- disconnect', socket.id);
    if (room.players[socket.id]?.role === 'pig' && room.state === 'playing') endGame(false);
    delete room.players[socket.id];
    if (room.state === 'playing') checkAllCaught();
    bcast('room_update', getRoom());
  });
});

server.listen(PORT, () => console.log(`🐷 Pig Hide server → http://localhost:${PORT}`));
