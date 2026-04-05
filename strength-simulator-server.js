const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

const PORT = 3003;
const players = {};

// Broadcast leaderboard every 1.5s
setInterval(() => {
  const lb = Object.values(players)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 30)
    .map(p => ({ id:p.id, name:p.name, strength:p.strength, rebirths:p.rebirths, title:p.title, pvp:p.pvp, hp:p.hp, maxHp:p.maxHp }));
  io.emit('leaderboard', lb);
}, 1500);

// HP regen every second
setInterval(() => {
  const now = Date.now();
  Object.values(players).forEach(p => {
    if (p.hp < p.maxHp && now - p.lastHit > 5000) {
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.05));
      io.to(p.id).emit('hp_update', { hp: p.hp, maxHp: p.maxHp });
    }
  });
}, 1000);

io.on('connection', socket => {
  console.log('+', socket.id);

  socket.on('join', ({ name }) => {
    players[socket.id] = {
      id: socket.id, name: String(name).slice(0, 20),
      strength: 0, rebirths: 0, title: 'Beginner',
      pvp: false, hp: 500, maxHp: 500, lastHit: 0,
    };
    socket.emit('joined', { id: socket.id });
  });

  socket.on('update', ({ strength, rebirths, title, maxHp }) => {
    const p = players[socket.id];
    if (!p) return;
    p.strength = Number(strength) || 0;
    p.rebirths = Number(rebirths) || 0;
    p.title = String(title || 'Beginner').slice(0, 30);
    const newMaxHp = Number(maxHp) || 500;
    if (newMaxHp > p.maxHp) { const diff = newMaxHp - p.maxHp; p.hp += diff; }
    p.maxHp = newMaxHp;
    p.hp = Math.min(p.hp, p.maxHp);
  });

  socket.on('pvp_toggle', ({ pvp }) => {
    const p = players[socket.id];
    if (p) p.pvp = !!pvp;
  });

  socket.on('attack', ({ targetId }) => {
    const att = players[socket.id];
    const tgt = players[targetId];
    if (!att || !tgt || !att.pvp || !tgt.pvp) return;

    const attStr = Math.max(1, att.strength);
    const dmg = Math.max(5, Math.floor(
      (Math.log10(attStr + 10) * 20 + att.rebirths * 50) * (att.rebirths + 1)
    ));

    tgt.hp = Math.max(0, tgt.hp - dmg);
    tgt.lastHit = Date.now();

    socket.emit('attack_landed', { damage: dmg, targetName: tgt.name, targetHp: tgt.hp, targetMaxHp: tgt.maxHp });
    io.to(targetId).emit('hit', { damage: dmg, attackerName: att.name, hp: tgt.hp, maxHp: tgt.maxHp });

    if (tgt.hp <= 0) {
      const lost = Math.floor(tgt.strength * 0.4);
      tgt.strength = Math.max(0, tgt.strength - lost);
      tgt.hp = tgt.maxHp;
      io.to(targetId).emit('defeated', { attackerName: att.name, strLost: lost });
      socket.emit('eliminated', { targetName: tgt.name });
    }
  });

  socket.on('disconnect', () => {
    console.log('-', socket.id);
    delete players[socket.id];
  });
});

server.listen(PORT, () => console.log(`💪 Strength Simulator → http://localhost:${PORT}`));
