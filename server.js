const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── REST: check room existence ───────────────────────────────
app.get('/api/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId.toUpperCase()];
  if (!room) return res.json({ exists: false });
  res.json({
    exists: true,
    members: Object.keys(room.members).length,
    hasVideo: !!room.videoUrl
  });
});

// In-memory room store
// rooms[roomId] = { hostId, videoUrl, state: { playing, currentTime, lastUpdate }, members: { socketId: { name } } }
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoomInfo(roomId) {
  const room = rooms[roomId];
  if (!room) return null;
  return {
    roomId,
    hostId: room.hostId,
    videoUrl: room.videoUrl,
    state: room.state,
    members: Object.entries(room.members).map(([id, info]) => ({
      id,
      name: info.name,
      isHost: id === room.hostId
    }))
  };
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // ─── Create Room ───────────────────────────────────────────────
  socket.on('create-room', ({ name, videoUrl }, callback) => {
    let roomId;
    do { roomId = generateRoomCode(); } while (rooms[roomId]);

    rooms[roomId] = {
      hostId: socket.id,
      videoUrl: videoUrl || '',
      state: { playing: false, currentTime: 0, lastUpdate: Date.now() },
      members: { [socket.id]: { name } }
    };

    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`[ROOM] Created: ${roomId} by "${name}"`);
    callback({ success: true, roomInfo: getRoomInfo(roomId) });
  });

  // ─── Join Room ─────────────────────────────────────────────────
  socket.on('join-room', ({ roomId, name }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ success: false, error: 'Комната не найдена.' });

    room.members[socket.id] = { name };
    socket.join(roomId);
    socket.roomId = roomId;

    // Notify others
    socket.to(roomId).emit('user-joined', { id: socket.id, name });
    console.log(`[ROOM] "${name}" joined: ${roomId}`);

    callback({ success: true, roomInfo: getRoomInfo(roomId) });
  });

  // ─── Video Change (host only) ──────────────────────────────────
  socket.on('video-change', ({ roomId, videoUrl }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.videoUrl = videoUrl;
    room.state = { playing: false, currentTime: 0, lastUpdate: Date.now() };
    io.to(roomId).emit('video-changed', { videoUrl, state: room.state });
    console.log(`[SYNC] Video changed in ${roomId}: ${videoUrl}`);
  });

  // ─── Play ──────────────────────────────────────────────────────
  socket.on('video-play', ({ roomId, currentTime }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.state = { playing: true, currentTime, lastUpdate: Date.now() };
    socket.to(roomId).emit('video-played', { currentTime });
    console.log(`[SYNC] Play in ${roomId} at ${currentTime}s`);
  });

  // ─── Pause ─────────────────────────────────────────────────────
  socket.on('video-pause', ({ roomId, currentTime }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.state = { playing: false, currentTime, lastUpdate: Date.now() };
    socket.to(roomId).emit('video-paused', { currentTime });
    console.log(`[SYNC] Pause in ${roomId} at ${currentTime}s`);
  });

  // ─── Seek ──────────────────────────────────────────────────────
  socket.on('video-seek', ({ roomId, currentTime }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    room.state.currentTime = currentTime;
    room.state.lastUpdate = Date.now();
    socket.to(roomId).emit('video-seeked', { currentTime });
    console.log(`[SYNC] Seek in ${roomId} to ${currentTime}s`);
  });

  // ─── Chat Message ──────────────────────────────────────────────
  socket.on('chat-message', ({ roomId, text }) => {
    const room = rooms[roomId];
    if (!room || !room.members[socket.id]) return;
    const name = room.members[socket.id].name;
    const payload = { senderId: socket.id, name, text, ts: Date.now() };
    io.to(roomId).emit('chat-message', payload);
  });

  // ─── Request sync (guest asks for current state) ───────────────
  socket.on('request-sync', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;
    // Ask host to report current time
    io.to(room.hostId).emit('sync-request', { guestId: socket.id });
  });

  socket.on('sync-response', ({ roomId, guestId, currentTime, playing }) => {
    const room = rooms[roomId];
    if (!room || room.hostId !== socket.id) return;
    io.to(guestId).emit('sync-state', { currentTime, playing, videoUrl: room.videoUrl });
  });

  // ─── Disconnect ────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (!roomId) return;
    const room = rooms[roomId];
    if (!room) return;

    const name = room.members[socket.id]?.name || 'Пользователь';
    delete room.members[socket.id];

    if (Object.keys(room.members).length === 0) {
      delete rooms[roomId];
      console.log(`[ROOM] Deleted empty room: ${roomId}`);
      return;
    }

    // Host left → transfer to next member
    if (room.hostId === socket.id) {
      room.hostId = Object.keys(room.members)[0];
      io.to(roomId).emit('host-changed', { newHostId: room.hostId });
      console.log(`[ROOM] Host changed in ${roomId} to ${room.hostId}`);
    }

    socket.to(roomId).emit('user-left', { id: socket.id, name });
    io.to(roomId).emit('room-update', getRoomInfo(roomId));
    console.log(`[-] "${name}" left room ${roomId}`);
  });
});

const PORT = process.env.PORT || 3001;

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIPs();
  console.log('\n🎬 RalliVell server started!');
  console.log(`   Локально:  http://localhost:${PORT}`);
  if (localIPs.length > 0) {
    localIPs.forEach(ip => {
      console.log(`   В сети:    http://${ip}:${PORT}  ← открой на Android`);
    });
  }
  console.log();
});
