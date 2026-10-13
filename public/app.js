(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const els = {
    landing: $('#landing'), chat: $('#chat'), start: $('#startBtn'),
    remote: $('#remote'), local: $('#local'), status: $('#status'),
    log: $('#log'), form: $('#chatForm'), msg: $('#msg'), send: $('#sendBtn'),
    next: $('#nextBtn'), mute: $('#muteBtn'), cam: $('#camBtn'), report: $('#reportBtn'), stop: $('#stopBtn'),
    invite: $('#inviteBtn'), copyLink: $('#copyBtn'), inviteNote: $('#inviteNote'), roomTag: $('#roomTag'),
    gate: $('#gate'), gateYes: $('#gateYes'), gateNo: $('#gateNo'), online: $('#onlineCount'),
  };
  $('#year').textContent = new Date().getFullYear();

  let socket = null, pc = null, stream = null, room = null, iceServers = null;
  let pendingCandidates = [];
  let code = '';
  const urlCode = (new URLSearchParams(location.search).get('r') || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

  /* ---------- helpers ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };
  const setStatus = (t) => { els.status.textContent = t || ''; els.status.classList.toggle('hide', !t); };
  const addLine = (cls, text) => {
    const d = document.createElement('div');
    d.className = cls;
    d.textContent = text; // textContent: never innerHTML, so chat can't inject HTML
    els.log.appendChild(d);
    els.log.scrollTop = els.log.scrollHeight;
  };
  const chatEnabled = (on) => { els.msg.disabled = !on; els.send.disabled = !on; };

  async function getIce() {
    if (iceServers) return iceServers;
    try { iceServers = (await (await fetch('/api/ice')).json()).iceServers; }
    catch { iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]; }
    return iceServers;
  }

  /* ---------- private rooms (friends) ---------- */
  let pendingMode = 'public';
  const roomLink = () => `${location.origin}/?r=${code}`;
  const newCode = () => Math.random().toString(36).slice(2, 8);
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch { window.prompt('Copy this link and send it to your friend:', t); return false; }
  }
  if (urlCode) {
    els.inviteNote.hidden = false;
    els.start.textContent = 'Join your friend';
    els.invite.hidden = true;
  }

  /* ---------- age gate ---------- */
  function requestStart(mode) {
    pendingMode = mode;
    if (store.get('sehwas_ok') === '1') begin(); else els.gate.hidden = false;
  }
  els.start.addEventListener('click', () => requestStart(urlCode ? 'friend-join' : 'public'));
  els.invite.addEventListener('click', () => requestStart('friend-host'));
  els.copyLink.addEventListener('click', async () => {
    const ok = await copyText(roomLink());
    els.copyLink.textContent = ok ? 'Link copied!' : 'Copy invite link';
    setTimeout(() => { els.copyLink.textContent = 'Copy invite link'; }, 2000);
  });
  els.gateNo.addEventListener('click', () => { els.gate.hidden = true; });
  els.gateYes.addEventListener('click', () => { store.set('sehwas_ok', '1'); els.gate.hidden = true; begin(); });

  /* ---------- start / stop ---------- */
  async function begin() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true });
    } catch (e) {
      alert('Camera and microphone access is needed to use Sehwas. Please allow it in your browser and try again.');
      return;
    }
    els.local.srcObject = stream;
    if (pendingMode === 'friend-host') {
      code = newCode();
      history.replaceState(null, '', `/?r=${code}`);
      copyText(roomLink());
    } else if (pendingMode === 'friend-join') {
      code = urlCode;
    } else {
      code = '';
    }
    els.copyLink.hidden = !code;
    els.roomTag.hidden = !code;
    els.landing.hidden = true;
    els.chat.hidden = false;
    connectSocket();
    findPartner();
  }

  function stopAll() {
    closePeer();
    if (socket) { socket.emit('leave'); socket.disconnect(); socket = null; }
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    els.local.srcObject = null;
    els.log.innerHTML = '';
    chatEnabled(false);
    els.chat.hidden = true;
    els.landing.hidden = false;
    if (code && !urlCode) history.replaceState(null, '', '/');
    code = '';
  }

  function closePeer() {
    room = null;
    pendingCandidates = [];
    if (pc) { pc.ontrack = pc.onicecandidate = pc.onnegotiationneeded = pc.onconnectionstatechange = null; pc.close(); pc = null; }
    els.remote.srcObject = null;
  }

  function findPartner() {
    closePeer();
    chatEnabled(false);
    els.log.innerHTML = '';
    setStatus('Looking for someone...');
    socket.emit('join', { code });
  }

  /* ---------- socket ---------- */
  function connectSocket() {
    socket = io();
    socket.on('online', (n) => { els.online.textContent = n; });
    socket.on('waiting', () => setStatus('Looking for someone...'));
    socket.on('matched', async ({ room: r, initiator }) => {
      closePeer();
      room = r;
      setStatus('Connecting...');
      addLine('sys', 'You are connected. Say hi!');
      chatEnabled(true);
      await createPeer(initiator);
    });
    socket.on('signal', async (m) => {
      if (!pc || m.room !== room) return;
      try {
        if (m.sdp) {
          await pc.setRemoteDescription(m.sdp);
          for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {});
          pendingCandidates = [];
          if (m.sdp.type === 'offer') {
            await pc.setLocalDescription(await pc.createAnswer());
            socket.emit('signal', { room, sdp: pc.localDescription });
          }
        } else if (m.candidate) {
          if (pc.remoteDescription) await pc.addIceCandidate(m.candidate).catch(() => {});
          else pendingCandidates.push(m.candidate);
        }
      } catch (e) { console.warn('signal error', e); }
    });
    socket.on('chat', (t) => addLine('m', t));
    socket.on('partner-left', () => {
      addLine('sys', 'Stranger left the chat.');
      findPartner();
    });
    socket.on('reported', () => { addLine('sys', 'Thanks, report sent.'); findPartner(); });
    socket.on('banned', () => { alert('You have been temporarily blocked after multiple reports.'); stopAll(); });
    socket.on('connect_error', () => setStatus('Connection problem. Retrying...'));
  }

  /* ---------- WebRTC ---------- */
  async function createPeer(initiator) {
    pc = new RTCPeerConnection({ iceServers: await getIce() });
    const mine = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => { els.remote.srcObject = e.streams[0]; setStatus(''); };
    pc.onicecandidate = (e) => { if (e.candidate && mine === pc) socket.emit('signal', { room, candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (mine !== pc) return;
      if (pc.connectionState === 'failed') { addLine('sys', 'Connection failed. Finding someone new...'); findPartner(); }
    };
    if (initiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { room, sdp: pc.localDescription });
    }
  }

  /* ---------- UI ---------- */
  els.next.addEventListener('click', findPartner);
  els.stop.addEventListener('click', stopAll);
  els.report.addEventListener('click', () => {
    if (confirm('Report this person and move on?')) socket.emit('report');
  });
  els.mute.addEventListener('click', () => {
    const t = stream && stream.getAudioTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; els.mute.textContent = t.enabled ? 'Mute' : 'Unmute';
  });
  els.cam.addEventListener('click', () => {
    const t = stream && stream.getVideoTracks()[0]; if (!t) return;
    t.enabled = !t.enabled; els.cam.textContent = t.enabled ? 'Camera off' : 'Camera on';
  });
  els.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.msg.value.trim();
    if (!text || !socket) return;
    socket.emit('chat', text);
    addLine('m me', text);
    els.msg.value = '';
  });
  window.addEventListener('beforeunload', () => { if (socket) socket.emit('leave'); });
})();
