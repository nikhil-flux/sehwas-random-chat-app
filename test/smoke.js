'use strict';
// Starts the server and checks pages + matching + signaling + chat + disconnect.
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

const PORT = 3999;
const URL = `http://localhost:${PORT}`;
const server = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT } , stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const fail = (m) => { console.error('FAIL:', m); server.kill(); process.exit(1); };
const ok = (m) => console.log('ok  -', m);

(async () => {
  await sleep(800);

  let r = await fetch(URL + '/');
  let t = await r.text();
  if (!t.includes(`<link rel="canonical" href="${URL}/">`)) fail('canonical not filled');
  ok('home page + canonical');
  t = await (await fetch(URL + '/sitemap.xml')).text();
  if (!t.includes(`${URL}/terms.html`)) fail('sitemap');
  ok('sitemap.xml');
  t = await (await fetch(URL + '/robots.txt')).text();
  if (!t.includes(`Sitemap: ${URL}/sitemap.xml`)) fail('robots');
  ok('robots.txt');
  const ice = await (await fetch(URL + '/api/ice')).json();
  if (!ice.iceServers.length) fail('ice');
  ok('ice servers');

  const a = io(URL, { transports: ['websocket'] });
  const b = io(URL, { transports: ['websocket'] });
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  const ma = once(a, 'matched');
  const mb = once(b, 'matched');
  a.emit('join'); b.emit('join');
  const [infoA, infoB] = await Promise.all([ma, mb]);
  if (infoA.room !== infoB.room || infoA.initiator === infoB.initiator) fail('matching');
  ok('two users matched, one initiator');

  const gotSig = once(b, 'signal');
  a.emit('signal', { room: infoA.room, sdp: { type: 'offer', sdp: 'x' } });
  const sig = await gotSig;
  if (sig.sdp.type !== 'offer') fail('signal relay');
  ok('signal relayed');

  const stale = Promise.race([once(b, 'signal').then(() => 'got'), sleep(400).then(() => 'none')]);
  a.emit('signal', { room: 'wrong-room', sdp: { type: 'offer' } });
  if ((await stale) !== 'none') fail('stale signal was relayed');
  ok('stale room signal dropped');

  const gotChat = once(b, 'chat');
  a.emit('chat', 'hello');
  if ((await gotChat) !== 'hello') fail('chat');
  ok('chat relayed');

  const left = once(b, 'partner-left');
  a.emit('leave');
  await left;
  ok('partner-left on leave');

  // private rooms: friends with the same code match each other, not the public pool
  const x = io(URL, { transports: ['websocket'] }), y = io(URL, { transports: ['websocket'] }), z = io(URL, { transports: ['websocket'] });
  await Promise.all([once(x, 'connect'), once(y, 'connect'), once(z, 'connect')]);
  const my = once(y, 'matched');
  x.emit('join', { code: 'friends1' });
  await sleep(100);
  z.emit('join');
  const zWaiting = once(z, 'waiting');
  await zWaiting;
  y.emit('join', { code: 'friends1' });
  const infoY = await my;
  if (!infoY.room) fail('private room match');
  ok('private room matches only same code');
  x.close(); y.close(); z.close();

  a.close(); b.close();
  console.log('\nALL TESTS PASSED');
  server.kill();
  process.exit(0);
})().catch((e) => fail(e.stack || e));
