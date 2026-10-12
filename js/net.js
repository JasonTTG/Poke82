// Online play: WebSocket client for the room relay (tools/serve.py). Hosts order operations, everyone applies them.
(function (PB) {
  const N = PB.Net = {
    ws: null, id: null, room: null, url: '', name: '', connected: false, mode: 'p2p', link: null, peers: [], relay: null,
    session: null,                  // { league: bool, mode, teams: {pid: teamId}, host: bool }
    listeners: {}, pending: {}, cid: 0, seq: 0, lastSeq: 0,
  };
  try { N.name = localStorage.getItem('poke82_name') || ''; } catch (e) { }
  N.active = () => !!(N.connected && N.room);
  N.onlineLeague = () => !!(N.connected && N.session && N.session.league);
  N.isHost = () => !!(N.room && N.room.host === N.id);
  N.on = (k, fn) => { (N.listeners[k] = N.listeners[k] || []).push(fn); };
  N.off = (k, fn) => { N.listeners[k] = (N.listeners[k] || []).filter(f => f !== fn); };
  const fire = (k, ...a) => { for (const f of (N.listeners[k] || []).slice()) { try { f(...a); } catch (e) { console.error(e); } } };

  N.disconnect = function () {
    for (const p of N.peers) { try { p.destroy(); } catch (e) { } }
    N.peers = []; N.relay = null; N.link = null;
    N.ws = null; N.connected = false; N.room = null; N.session = null; N.pending = {};
  };
  N.send = obj => {
    if (N.link) N.link(obj);
  };
  N.create = (mode, max, title) => N.p2pHost(mode, max, title);
  N.join = code => N.p2pJoin(String(code).toUpperCase().trim());
  N.leave = () => {
    if (N.mode === 'p2p') {
      if (N.relay) N.relay.close(); else if (N.conn) { try { N.conn.close(); } catch (e) { } }
      for (const p of N.peers) { try { p.destroy(); } catch (e) { } }
      N.peers = []; N.relay = null; N.link = null; N.conn = null; N.room = null; N.session = null; return;
    }
    N.send({ t: 'leave' }); N.room = null; N.session = null;
  };
  N.list = () => fire('rooms', []);

  // ---------- serverless play: WebRTC through the free PeerJS broker; the host's browser is the relay ----------
  N.loadPeer = () => window.Peer ? Promise.resolve() : new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    s.onload = res; s.onerror = () => rej(new Error('Could not load the connection library (internet needed)'));
    document.head.appendChild(s);
  });
  N.connectP2P = async function (name) {
    N.disconnect();
    N.name = (name || N.name || 'Player').slice(0, 20);
    try { localStorage.setItem('poke82_name', N.name); } catch (e) { }
    await N.loadPeer();
    N.mode = 'p2p'; N.connected = true; N.id = null;
  };
  const openPeer = id => new Promise((res, rej) => {
    const p = id ? new window.Peer(id) : new window.Peer();
    const t = setTimeout(() => { try { p.destroy(); } catch (e) { } rej(new Error('Could not reach the matchmaking service')); }, 10000);
    p.on('open', () => { clearTimeout(t); res(p); });
    p.on('error', e => { clearTimeout(t); try { p.destroy(); } catch (x) { } rej(e); });
  });
  // the relay that serve.py provides, run inside the host's browser
  function Relay(code, mode, max, title) {
    this.code = code; this.mode = mode; this.max = max; this.title = title; this.members = []; this.started = false;
    this.nextId = 2; this.peer = null;
  }
  Relay.prototype = {
    info() { return { code: this.code, mode: this.mode, host: 1, max: this.max, started: this.started, title: this.title, players: this.members.map(m => ({ id: m.id, name: m.name })) }; },
    bcast(obj, skip) { for (const m of this.members.slice()) if (m !== skip) m.send(obj); },
    drop(c) {
      const i = this.members.indexOf(c); if (i < 0) return;
      this.members.splice(i, 1);
      this.bcast({ t: 'room', room: this.info() }); this.bcast({ t: 'peerLeft', id: c.id });
    },
    close() {
      for (const m of this.members.slice()) if (m.id !== 1) { m.send({ t: 'closed', why: 'The host left.' }); try { m.conn.close(); } catch (e) { } }
      this.members = [];
      try { this.peer.destroy(); } catch (e) { }
    },
    handle(c, msg) {
      if (!msg) return;
      switch (msg.t) {
        case 'hello': c.name = String(msg.name || 'Player').slice(0, 20); break;
        case 'join': {
          if (String(msg.code || '').toUpperCase() !== this.code) { c.send({ t: 'error', err: 'No room with code ' + msg.code }); return; }
          if (this.started) { c.send({ t: 'error', err: 'That game has already started.' }); return; }
          if (this.members.length >= this.max) { c.send({ t: 'error', err: 'That room is full.' }); return; }
          c.name = String(msg.name || c.name).slice(0, 20);
          this.members.push(c);
          this.bcast({ t: 'room', room: this.info() });
          c.send({ t: 'joined', you: c.id });
          break;
        }
        case 'leave': this.drop(c); break;
        case 'list': c.send({ t: 'rooms', rooms: [] }); break;
        case 'ping': c.send({ t: 'pong' }); break;
        case 'msg': {
          if (!this.members.includes(c)) return;
          const d = msg.d;
          if (d && d.k === 'start' && c.id === 1) { this.started = true; this.bcast({ t: 'room', room: this.info() }); }
          const out = { t: 'msg', from: c.id, d };
          const to = msg.to == null ? 'all' : msg.to;
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
        conn.on('open', () => { c = { id: relay.nextId++, name: 'Player', conn, send: o => { try { conn.send(o); } catch (e) { } } }; c.send({ t: 'welcome', id: c.id }); });
        conn.on('data', m => { if (c) relay.handle(c, m); });
        conn.on('close', () => { if (c) relay.drop(c); });
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { } });
      N.room = relay.info(); fire('room', N.room);
    } catch (e) { fire('error', e.message || 'Could not host (is the internet reachable?)'); }
  };
  N.p2pJoin = async function (code) {
    try {
      const peer = await openPeer(null); N.peers.push(peer);
      const conn = peer.connect('pokehoops-' + code, { reliable: true });
      N.conn = conn;
      const t = setTimeout(() => { if (!N.room) fire('error', 'No room with code ' + code + ' (or it could not be reached)'); }, 12000);
      peer.on('error', e => { clearTimeout(t); fire('error', e && e.type === 'peer-unavailable' ? 'No room with code ' + code : 'Connection problem: ' + (e && e.type)); });
      conn.on('open', () => {
        N.link = o => { try { conn.send(o); } catch (e) { } };
        N.send({ t: 'hello', name: N.name }); N.send({ t: 'join', code, name: N.name });
      });
      conn.on('data', m => { if (m && m.t === 'joined') clearTimeout(t); N._recv(m); });
      conn.on('close', () => { const had = !!N.room; N.room = null; N.link = null; if (had) { fire('closed', 'The host left or the connection dropped.'); fire('disconnected'); } });
    } catch (e) { fire('error', e.message || 'Could not connect'); }
  };
  N.toAll = d => N.send({ t: 'msg', to: 'all', d });
  N.toHost = d => N.send({ t: 'msg', to: 'host', d });
  N.to = (id, d) => N.send({ t: 'msg', to: id, d });
  N.nameOf = id => { const p = N.room && N.room.players.find(x => x.id === id); return p ? p.name : 'Player'; };

  N._recv = function (m) {
    switch (m.t) {
      case 'welcome': N.id = m.id; break;
      case 'room': N.room = m.room; fire('room', m.room); break;
      case 'joined': fire('joined', m); break;
      case 'rooms': fire('rooms', m.rooms); break;
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
    const cid = ++N.cid;
    if (cb) N.pending[cid] = cb;
    if (N.isHost()) N._hostExec(name, args, N.id, cid);
    else N.toHost({ k: 'op', name, args, cid });
  };
  const HOST_ONLY = ['beginOffseason', 'startDraft', 'startNextSeason', 'simDays', 'advance', 'simRest', 'simSeason', 'simToDay', 'forceDay', 'draftRest', 'fRest', 'fantasyStart'];
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
    PB.toast('Resynchronized with the host');
    fire('applied', { name: 'snapshot' });
  };
})(window.PB);
