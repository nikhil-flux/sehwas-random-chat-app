'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const REPORT_LIMIT = 3;
const BAN_MS = 30 * 60 * 1000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e5 });

app.disable('x-powered-by');
app.set('trust proxy', true);

const siteUrl = (req) =>
  (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

app.get('/healthz', (_req, res) => res.send('ok'));

app.get('/api/ice', (_req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  res.json({ iceServers });
});

// Serve text files with %SITE_URL% filled in
const templated = (file, type) => (req, res) => {
  fs.readFile(path.join(PUBLIC, file), 'utf8', (err, txt) => {
    if (err) return res.status(404).end();
    res.type(type).send(txt.replace(/%SITE_URL%/g, siteUrl(req)));
  });
};
app.get(['/', '/index.html'], templated('index.html', 'html'));
app.get('/terms.html', templated('terms.html', 'html'));
app.get('/sitemap.xml', templated('sitemap.xml', 'xml'));
app.get('/robots.txt', templated('robots.txt', 'text'));
app.use(express.static(PUBLIC, { index: false }));

/* ---------- matching ---------- */
const waiting = new Map();     // code ('' = public) -> socket id waiting for a partner
const partners = new Map();    // socket id -> { room, peer }
const reports = new Map();     // ip -> count
const bans = new Map();        // ip -> expiry
let roomSeq = 0;

const ipOf = (s) => s.handshake.address;
const broadcastOnline = () => io.emit('online', io.engine.clientsCount);

function unpair(socket, notify = true) {
  const code = socket.data.code || '';
  if (waiting.get(code) === socket.id) waiting.delete(code);
  const p = partners.get(socket.id);
  if (!p) return;
  partners.delete(socket.id);
  partners.delete(p.peer);
  socket.leave(p.room);
  const other = io.sockets.sockets.get(p.peer);
  if (other) {
    other.leave(p.room);
    if (notify) other.emit('partner-left');
  }
}

io.on('connection', (socket) => {
  broadcastOnline();

  socket.on('join', (opts) => {
    const raw = opts && typeof opts.code === 'string' ? opts.code : '';
    const code = raw.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24).toLowerCase();
    const until = bans.get(ipOf(socket));
    if (until && until > Date.now()) return socket.emit('banned');
    unpair(socket, true);
    socket.data.code = code;
    const wid = waiting.get(code);
    const other = wid && wid !== socket.id ? io.sockets.sockets.get(wid) : null;
    if (other) {
      waiting.delete(code);
      const room = `room-${++roomSeq}`;
      partners.set(socket.id, { room, peer: other.id });
      partners.set(other.id, { room, peer: socket.id });
      socket.join(room); other.join(room);
      other.emit('matched', { room, initiator: true });
      socket.emit('matched', { room, initiator: false });
    } else {
      waiting.set(code, socket.id);
      socket.emit('waiting');
    }
  });

  socket.on('signal', (m) => {
    const p = partners.get(socket.id);
    if (!p || !m || m.room !== p.room) return;
    socket.to(p.room).emit('signal', m);
  });

  socket.on('chat', (t) => {
    const p = partners.get(socket.id);
    if (!p || typeof t !== 'string') return;
    const text = t.trim().slice(0, 500);
    if (text) socket.to(p.room).emit('chat', text);
  });

  socket.on('report', () => {
    const p = partners.get(socket.id);
    if (p) {
      const target = io.sockets.sockets.get(p.peer);
      if (target) {
        const ip = ipOf(target);
        const n = (reports.get(ip) || 0) + 1;
        reports.set(ip, n);
        if (n >= REPORT_LIMIT) { bans.set(ip, Date.now() + BAN_MS); reports.delete(ip); }
      }
    }
    unpair(socket, true);
    socket.emit('reported');
  });

  socket.on('leave', () => unpair(socket, true));
  socket.on('disconnect', () => { unpair(socket, true); setTimeout(broadcastOnline, 0); });
});

server.listen(PORT, () => console.log(`Sehwas running on http://localhost:${PORT}`));
