// Online play: peer to peer over WebRTC (PeerJS broker for the handshake). The host's browser runs the room: the host orders operations, everyone applies them.
(function (PB) {
  const N = PB.Net = {
    id: null, room: null, name: '', connected: false, mode: 'p2p', link: null, peers: [], relay: null,
    session: null,                  // { league: bool, mode, teams: {pid: teamId}, host: bool }
    listeners: {}, pending: {}, cid: 0, seq: 0, lastSeq: 0, spectator: false,
  };
  try { N.name = localStorage.getItem('poke82_name') || ''; } catch (e) { PB.warn('net', e); }
  N.active = () => !!(N.connected && N.room);
  N.onlineLeague = () => !!(N.connected && N.session && N.session.league);
  N.isHost = () => !!(N.room && N.room.host === N.id);
  N.on = (k, fn) => { (N.listeners[k] = N.listeners[k] || []).push(fn); };
  N.off = (k, fn) => { N.listeners[k] = (N.listeners[k] || []).filter(f => f !== fn); };
  const fire = (k, ...a) => { for (const f of (N.listeners[k] || []).slice()) { try { f(...a); } catch (e) { console.error(e); } } };

  N.disconnect = function () {
    for (const p of N.peers) { try { p.destroy(); } catch (e) { PB.warn('net', e); } }
    N.peers = []; N.relay = null; N.link = null;
    N.connected = false; N.room = null; N.session = null; N.pending = {}; N.spectator = false;
  };
  N.send = obj => {
    if (N.link) N.link(obj);
  };
  N.create = (mode, max, title) => N.p2pHost(mode, max, title);
  N.join = code => N.p2pJoin(String(code).toUpperCase().trim());
  N.leave = () => {
    if (N.relay) N.relay.close(); else if (N.conn) { try { N.conn.close(); } catch (e) { PB.warn('net', e); } }
    for (const p of N.peers) { try { p.destroy(); } catch (e) { PB.warn('net', e); } }
    N.peers = []; N.relay = null; N.link = null; N.conn = null; N.room = null; N.session = null; N.spectator = false;
  };

  // ---------- serverless play: WebRTC through the free PeerJS broker; the host's browser is the relay ----------
  N.loadPeer = () => window.Peer ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the connection library (internet needed)'));
    document.head.appendChild(s);
  });
  N.connectP2P = async function (name) {
    N.disconnect();
    N.name = (name || N.name || 'Player').slice(0, 20);
    try { localStorage.setItem('poke82_name', N.name); } catch (e) { PB.warn('net', e); }
    await N.loadPeer();
    N.mode = 'p2p'; N.connected = true; N.id = null;
  };
  // latency: guests ping the host's relay every few seconds; no answer for 12 s means the connection is lost
  let pingT = null;
  const netPill = () => { for (const el of document.querySelectorAll('.netpill')) { el.textContent = N.lost ? 'connection lost' : N.isHost() ? 'host' : N.rtt != null ? N.rtt + ' ms' : '…'; el.className = 'tag netpill ' + (N.lost || (N.rtt || 0) > 400 ? 'bad' : (N.rtt || 0) > 160 ? 'warn' : 'good'); } };
  N.pingStart = () => {
    clearInterval(pingT); N.lastPong = Date.now(); N.lost = false; N.rtt = null;
    pingT = setInterval(() => {
      if (!N.room || !N.link) { clearInterval(pingT); return; }
      if (N.isHost()) { N.rtt = 0; netPill(); return; }
      N.send({ t: 'ping', ts: Date.now() });
      if (!N.lost && Date.now() - N.lastPong > 12000) { N.lost = true; if (PB.Diag) PB.Diag.log('conn', 'no answer from the host for 12 s'); fire('conn', 'lost'); netPill(); }
    }, 4000);
  };
  const J = m => typeof m === 'string' ? JSON.parse(m) : m;        // everything travels as JSON text
  // STUN finds a direct route; the TURN relay is the fallback when two players' networks block direct connections (the usual reason a code "does not work")
  const ICE = { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ] };
  const openPeerOnce = id => new Promise((res, rej) => {
    const opts = { config: ICE, debug: 0 };
    const p = id ? new window.Peer(id, opts) : new window.Peer(opts);
    const t = setTimeout(() => { try { p.destroy(); } catch (e) { PB.warn('net', e); } rej(new Error('Could not reach the matchmaking service')); }, 9000);
    p.on('open', () => { clearTimeout(t); res(p); });
    p.on('error', e => { clearTimeout(t); try { p.destroy(); } catch (x) { } rej(e); });
  });
  // the matchmaking broker sometimes drops a request: try a few times before giving up (a taken room code is not retried)
  const openPeer = async id => {
    let last = null;
    for (let i = 0; i < 3; i++) {
      try { return await openPeerOnce(id); } catch (e) { last = e; if (e && e.type === 'unavailable-id') throw e; await new Promise(r => setTimeout(r, 400 + i * 600)); }
    }
    throw last;
  };
  // the relay that serve.py provides, run inside the host's browser
  function Relay(code, mode, max, title) {
    this.code = code; this.mode = mode; this.max = max; this.title = title; this.members = []; this.started = false;
    this.nextId = 2; this.peer = null;
    this.sStart = null; this.sFr = {};          // spectators: the running match's start message and every input frame so far
  }
  Relay.prototype = {
    info() { return { code: this.code, mode: this.mode, host: 1, max: this.max, started: this.started, title: this.title, players: this.members.filter(m => !m.spec).map(m => ({ id: m.id, name: m.name })), spectators: this.members.filter(m => m.spec).length }; },
    toSpec(d) { const out = { t: 'msg', from: 1, d }; for (const m of this.members) if (m.spec) m.send(out); },
    // remember (and pass on) the input frames of the match being played so a spectator can join at any time and catch up
    specTap(c, d) {
      if (!d) return;
      if (d.k === 'mstart') { this.sStart = d; this.sFr = {}; } else if (d.k === 'mend') { this.sStart = null; this.sFr = {}; }
      this.toSpec(d);
    },
    specFrames(c, d) {
      if (!this.sStart || !this.sStart.pids.includes(c.id) || !d.fr) return;
      const mem = this.sFr[c.id] || (this.sFr[c.id] = new Map()), fresh = [];
      for (const [t, f] of d.fr) if (!mem.has(t)) { mem.set(t, f); fresh.push([t, f]); }
      if (fresh.length) this.toSpec({ k: 'msi', pid: c.id, fr: fresh });
    },
    bcast(obj, skip) { for (const m of this.members.slice()) if (m !== skip) m.send(obj); },
    drop(c) {
      const i = this.members.indexOf(c); if (i < 0) return;
      this.members.splice(i, 1);
      this.bcast({ t: 'room', room: this.info() }); if (!c.spec) this.bcast({ t: 'peerLeft', id: c.id });
    },
    close() {
      for (const m of this.members.slice()) if (m.id !== 1) { m.send({ t: 'closed', why: 'The host left.' }); try { m.conn.close(); } catch (e) { PB.warn('net', e); } }
      this.members = [];
      try { this.peer.destroy(); } catch (e) { PB.warn('net', e); }
    },
    handle(c, msg) {
      if (!msg) return;
      switch (msg.t) {
        case 'hello': c.name = String(msg.name || 'Player').slice(0, 20); break;
        case 'join': {
          if (String(msg.code || '').toUpperCase() !== this.code) { c.send({ t: 'error', err: 'No room with code ' + msg.code }); return; }
          if (msg.spectate) {         // watchers can come and go at any time and never count as players
            c.name = String(msg.name || c.name).slice(0, 20); c.spec = true; this.members.push(c);
            this.bcast({ t: 'room', room: this.info() }); c.send({ t: 'joined', you: c.id, spectator: true });
            N.hostSpectate(c, this); break;
          }
          let back = null;
          if (this.started) {
            const names = (N.session && N.session.league && N.session.names) || {};
            const old = msg.rejoin ? Object.keys(names).find(pid => names[pid] === String(msg.name || '').slice(0, 20) && !this.members.some(m => String(m.id) === pid)) : null;
            if (old == null) { c.send({ t: 'error', err: 'That game has already started.' }); return; }
            back = +old;
          }
          if (this.members.filter(m => !m.spec).length >= this.max) { c.send({ t: 'error', err: 'That room is full.' }); return; }
          c.name = String(msg.name || c.name).slice(0, 20);
          this.members.push(c);
          this.bcast({ t: 'room', room: this.info() });
          c.send({ t: 'joined', you: c.id });
          if (back != null) N.hostRejoin(c, back);
          break;
        }
        case 'leave': this.drop(c); break;
        case 'ping': c.send({ t: 'pong', ts: msg.ts }); break;
        case 'msg': {
          if (!this.members.includes(c)) return;
          const d = msg.d;
          if (c.spec && !(d && d.k === 'resync')) return;           // spectators only listen
          if (d && d.k === 'start' && c.id === 1) { this.started = true; this.bcast({ t: 'room', room: this.info() }); }
          const out = { t: 'msg', from: c.id, d };
          const to = msg.to == null ? 'all' : msg.to;
          if (to === 'spec') { this.specTap(c, d); return; }
          if (d && d.k === 'mi') this.specFrames(c, d);
          if (to === 'all') this.bcast(out, c);
          else for (const m of this.members) if ((to === 'host' && m.id === 1 && c.id !== 1) || m.id === to) m.send(out);
          break;
        }
      }
    },
  };
  N.p2pHost = async function (mode, max, title) {
    try {
      let peer = null, code = '';
      for (let i = 0; i < 6 && !peer; i++) {
        code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
        try { peer = await openPeer('pokehoops-' + code); } catch (e) { if (!(e && e.type === 'unavailable-id')) throw e; }
      }
      if (!peer) throw new Error('Could not create a room, try again');
      N.peers.push(peer);
      const relay = N.relay = new Relay(code, mode, max, title); relay.peer = peer;
      const local = { id: 1, name: N.name, send: o => setTimeout(() => N._recv(o), 0) };
      relay.members.push(local);
      N.id = 1; N.link = o => setTimeout(() => relay.handle(local, o), 0);
      peer.on('connection', conn => {
        let c = null;
        conn.on('open', () => { c = { id: relay.nextId++, name: 'Player', conn, send: o => { try { conn.send(JSON.stringify(o)); } catch (e) { PB.warn('net', e); } } }; c.send({ t: 'welcome', id: c.id }); });
        conn.on('data', m => { if (c) { try { relay.handle(c, J(m)); } catch (e) { console.error(e); } } });
        conn.on('close', () => { if (c) relay.drop(c); });
      });
      // if the broker connection drops, new players can no longer find the room: keep reconnecting
      const keep = () => { if (peer.destroyed) return; try { peer.reconnect(); } catch (e) { PB.warn('net', e); } setTimeout(() => { if (!peer.destroyed && peer.disconnected) keep(); }, 3000); };
      peer.on('disconnected', keep);
      peer.on('error', e => { console.warn('room peer', e && e.type); if (e && e.type === 'network') keep(); });
      N.room = relay.info(); N.pingStart(); fire('room', N.room);
    } catch (e) { fire('error', e.message || 'Could not host (is the internet reachable?)'); }
  };
  // the host hands a returning player their team and the current league
  N.hostRejoin = function (c, oldPid) {
    const ses = N.session; if (!ses) return;
    const team = ses.teams[oldPid]; delete ses.teams[oldPid]; delete ses.names[oldPid];
    ses.teams[c.id] = team; ses.names[c.id] = c.name;
    N.toAll({ k: 'teams', teams: ses.teams, names: ses.names });
    N.to(c.id, { k: 'rejoin', data: PB.Save.serialize(PB.G), teams: ses.teams, names: ses.names, mode: ses.mode, seq: N.seq });
    fire('teams', { teams: ses.teams, names: ses.names });
  };
  // one attempt at joining: resolves { ok } once the host says "joined", { fatal } for a definite no (wrong code, full, started), { retry } if it just went quiet
  const tryJoin = (code, rejoin, spectate) => new Promise(async resolve => {
    let done = false, peer = null, timer = null;
    const fin = r => {
      if (done) return; done = true; clearTimeout(timer);
      if (PB.Diag) PB.Diag.log('join', r.ok ? 'joined' : (r.fatal ? 'refused: ' + r.fatal : 'no answer: ' + r.retry));
      if (!r.ok) { try { peer && peer.destroy(); } catch (e) { PB.warn('net', e); } N.peers = N.peers.filter(x => x !== peer); }
      resolve(r);
    };
    if (PB.Diag) PB.Diag.log('join', 'attempt for ' + code);
    timer = setTimeout(() => fin({ retry: 'No room with code ' + code + ' (or it could not be reached)' }), 12000);
    try { peer = await openPeer(null); } catch (e) { return fin({ retry: 'Could not reach the matchmaking service' }); }
    if (done) { try { peer.destroy(); } catch (e) { PB.warn('net', e); } return; }
    N.peers.push(peer);
    peer.on('error', e => { if (e && e.type === 'peer-unavailable') fin({ fatal: 'No room with code ' + code }); else if (!done) fin({ retry: 'Connection problem: ' + (e && e.type) }); });
    const conn = peer.connect('pokehoops-' + code, { reliable: true });
    conn.on('open', () => {
      const direct = o => { try { conn.send(JSON.stringify(o)); } catch (e) { PB.warn('net', e); } };
      direct({ t: 'hello', name: N.name }); direct({ t: 'join', code, name: N.name, rejoin: !!rejoin, spectate: !!spectate });
    });
    conn.on('data', raw => {
      const m = J(raw);
      if (m && m.t === 'error' && !done) { fin({ fatal: m.err }); return; }          // the host refused us (full, already started, wrong code)
      if (m && m.t === 'joined') { N.conn = conn; N.link = o => { try { conn.send(JSON.stringify(o)); } catch (e) { PB.warn('net', e); } }; N._recv(m); fin({ ok: true }); return; }
      N._recv(m);
    });
    conn.on('close', () => {
      if (!done) { fin({ retry: 'The connection closed before joining' }); return; }
      if (N.conn !== conn) return;
      const had = !!N.room; N.room = null; N.link = null; if (had) { fire('closed', 'The host left or the connection dropped.'); fire('disconnected'); }
    });
  });
  N.p2pJoin = async function (code, rejoin, spectate) {
    try {
      code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 4) { fire('error', 'Room codes are 4 letters'); return; }
      if (rejoin) { for (const p of N.peers) { try { p.destroy(); } catch (e) { PB.warn('net', e); } } N.peers = []; }
      N.lastCode = code;
      let msg = 'Could not connect';
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt) fire('status', 'Still trying… (' + (attempt + 1) + ' of 3)');
        const r = await tryJoin(code, rejoin, spectate);
        if (r.ok) return;
        if (r.fatal) { fire('error', r.fatal); return; }
        msg = r.retry;
      }
      fire('error', msg + '. Check the code, and that the host still has the lobby open.');
    } catch (e) { fire('error', e.message || 'Could not connect'); }
  };
  N.toAll = d => N.send({ t: 'msg', to: 'all', d });
  N.toSpec = d => N.send({ t: 'msg', to: 'spec', d });
  // a spectator joins: the current league (if any) and, if a match is under way, its start and every input so far
  N.hostSpectate = function (c, relay) {
    const ses = N.session;
    if (ses && ses.league && PB.G) N.to(c.id, { k: 'spectate', data: PB.Save.serialize(PB.G), teams: ses.teams, names: ses.names, mode: ses.mode, seq: N.seq });
    if (relay.sStart) {
      c.send({ t: 'msg', from: 1, d: relay.sStart });
      for (const pid in relay.sFr) { const all = Array.from(relay.sFr[pid]); for (let i = 0; i < all.length; i += 400) c.send({ t: 'msg', from: 1, d: { k: 'msi', pid: +pid, fr: all.slice(i, i + 400) } }); }
    }
  };
  N.toHost = d => N.send({ t: 'msg', to: 'host', d });
  N.to = (id, d) => N.send({ t: 'msg', to: id, d });
  N.nameOf = id => { const p = N.room && N.room.players.find(x => x.id === id); return p ? p.name : 'Player'; };

  N._recv = function (m) {
    if (PB.Diag && m.t !== 'msg' && m.t !== 'pong') PB.Diag.log('recv', m.t + (m.err ? ' ' + m.err : ''));
    switch (m.t) {
      case 'pong': N.rtt = Date.now() - (m.ts || Date.now()); N.lastPong = Date.now(); if (N.lost) { N.lost = false; fire('conn', 'ok'); } netPill(); break;
      case 'welcome': N.id = m.id; break;
      case 'room': N.room = m.room; fire('room', m.room); break;
      case 'joined': N.spectator = !!m.spectator; N.pingStart(); fire('joined', m); break;
      case 'error': fire('error', m.err); break;
      case 'closed': N.room = null; N.session = null; fire('closed', m.why); break;
      case 'peerLeft': fire('peerLeft', m.id); break;
      case 'msg': N._msg(m.from, m.d); break;
    }
  };
  N._msg = function (from, d) {
    if (!d) return;
    switch (d.k) {
      case 'op': N._hostExec(d.name, d.args, from, d.cid); break;
      case 'applied': N._applied(d); break;
      case 'opErr': { const cb = N.pending[d.cid]; delete N.pending[d.cid]; cb && cb(d.err); break; }
      case 'resync': if (N.isHost() && PB.G) N.to(from, { k: 'snapshot', data: PB.Save.serialize(PB.G), seq: N.seq }); break;
      case 'snapshot': N._snapshot(d); break;
      default: fire(d.k, d, from);
    }
    fire('msg', d, from);
  };

  // ---- operations ----
  N.checksum = function (G) {
    const lg = G.league, fr = G.fr, F = G.fdraft;
    let h = (G.rng.s >>> 0) ^ Object.keys(G.claimed).length * 2654435761;
    const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
    if (lg) { mix(lg.day); mix(lg.simSeq); mix(lg.phase.length); G.teams.forEach((t, i) => { const r = lg.rec[i]; if (r) { mix(r.w * 131 + r.l); mix(r.pf); } }); }
    if (fr) { mix(fr.year); mix(fr.stage.length); if (fr.draft) mix(fr.draft.pick); mix(Object.keys(fr.pool).length); G.teams.forEach(t => mix(t.roster.length)); }
    if (F) mix(F.pick);
    return h;
  };
  N.sendOp = function (name, args, cb) {
    if (N.spectator) { const m = 'You are spectating: only the players can change things.'; if (cb) cb(m); else if (PB.toast) PB.toast(m, 3000); return; }
    const cid = ++N.cid;
    if (cb) N.pending[cid] = cb;
    if (N.isHost()) N._hostExec(name, args, N.id, cid);
    else N.toHost({ k: 'op', name, args, cid });
  };
  const HOST_ONLY = ['beginOffseason', 'startDraft', 'startNextSeason', 'simDays', 'advance', 'simRest', 'simSeason', 'simToDay', 'forceDay', 'draftRest', 'fRest', 'fantasyStart', 'rules'];
  N._hostExec = function (name, args, fromPid, cid) {
    const team = N.session && N.session.teams[fromPid];
    if (fromPid !== N.id && HOST_ONLY.includes(name)) { N.to(fromPid, { k: 'opErr', cid, err: 'Only the host can do that.' }); return; }
    const r = PB.Ops.apply(name, args, { from: team });
    if (r.err) {
      if (fromPid === N.id) { const cb = N.pending[cid]; delete N.pending[cid]; cb && cb(r.err); }
      else N.to(fromPid, { k: 'opErr', cid, err: r.err });
      return;
    }
    N.seq++;
    const msg = { k: 'applied', seq: N.seq, name, args, from: team, pid: fromPid, cid, cs: N.checksum(PB.G) };
    N.toAll(msg);
    if (fromPid === N.id) { const cb = N.pending[cid]; delete N.pending[cid]; cb && cb(null, r.res); }
    fire('applied', msg);
  };
  N._applied = function (d) {
    if (N.isHost()) return;
    if (d.seq !== N.lastSeq + 1 && N.lastSeq !== 0) { N.toHost({ k: 'resync' }); }
    N.lastSeq = d.seq;
    const r = PB.Ops.apply(d.name, d.args, { from: d.from, host: true });
    if (d.pid === N.id) { const cb = N.pending[d.cid]; delete N.pending[d.cid]; cb && cb(r.err || null, r.res); }
    if (!r.err && N.checksum(PB.G) !== d.cs) { console.warn('desync after ' + d.name); N.toHost({ k: 'resync' }); }
    fire('applied', d);
  };
  N._snapshot = function (d) {
    const keep = PB.G ? PB.G.userTeam : 0;
    const G = PB.Save.deserialize(d.data); PB.Save.relink(G);
    G.userTeam = keep; G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}); G.settings.difficulty = 'normal';
    PB.G = G; N.lastSeq = d.seq;
    if (PB.Diag) PB.Diag.log('sync', 'resynchronized with the host');
    fire('applied', { name: 'snapshot' });
  };
})(window.PB);
