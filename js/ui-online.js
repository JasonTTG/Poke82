// Online play UI: connect, rooms and lobbies, online exhibition, online leagues (franchise / fantasy draft), live matches between people.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions, N = PB.Net, L = PB.League, F = PB.Franchise, O = PB.Ops;
  const view = { modes: Object.keys({ exhibition: 1, coop: 1, franchise: 1, fantasy: 1 }), url: '', status: '', rooms: null, code: '', ex: { picks: {}, qMin: 5 }, fOpts: { teams: 12 } };
  const MODES = { exhibition: 'Exhibition (2 players)', coop: 'Co-op vs AI (2 players, one team)', franchise: 'Franchise league', fantasy: 'Fantasy draft league' };

  // ---------- connect / browse ----------
  S.online = {
    back() { if (N.active()) N.leave(); UI.go('menu', {}, true); },
    render() {
      const connected = N.connected, vm = view.modes, leagueKind = vm.includes('franchise') ? 'Franchise' : vm.includes('fantasy') ? 'Fantasy' : null;
      const title = vm.length === 1 ? MODES[vm[0]].replace(/ \(.*\)/, '') + ' · online' : vm.includes('exhibition') ? 'Quick Play · online' : 'Play online';
      return `<div class="panel" style="max-width:760px;margin:16px auto"><h2>${title}</h2>
        
        <div class="col">
          <label>Your name <input type="text" id="ol-name" maxlength="20" value="${esc(N.name || '')}" placeholder="Trainer"></label>
          <div class="dim" style="font-size:12px">The host's browser runs the game room; friends join with the code. Uses a free public matchmaking service and needs internet; very strict networks can block it.</div>
          <div class="row wrap"><button class="primary" data-act="olConnect" ${connected ? 'disabled' : ''} autofocus>${connected ? 'Connected ✓' : 'Connect'}</button>${connected ? '<button data-act="olDisconnect">Disconnect</button>' : ''}<span class="dim">${esc(view.status)}</span></div>
        </div>
        ${connected ? `<hr style="border-color:var(--line);margin:16px 0">
        ${leagueKind ? `<h3>Resume a saved league (you host)</h3>
        <div class="col">${[1, 2].map(n => { let m = saveMeta(n); if (m && m.label.indexOf(leagueKind) !== 0) m = null; return `<div class="row between"><span>${m ? `<b>Slot ${n}</b> · ${esc(m.label)} <span class="dim">${new Date(m.t).toLocaleString()}</span>` : `<span class="dim">Slot ${n}: empty</span>`}</span><button class="small primary" data-act="olResume" data-slot="${n}" ${m ? '' : 'disabled'}>Resume</button></div>`; }).join('')}
          <label class="row">Or from a file <input type="file" id="ol-file" accept=".json" onchange="PB.UI.olFile(this)"></label></div>` : ''}
        ${(() => { try { const l = JSON.parse(localStorage.getItem('poke82_lastroom')); return l && Date.now() - l.t < 6 * 3600e3 ? `<div class="panel" style="background:var(--bg2);margin-bottom:10px"><div class="row between wrap"><span>Dropped out of room <b>${esc(l.code)}</b>? You can walk back in as ${esc(l.name)}.</span><button class="primary" data-act="olRejoin">Rejoin</button></div></div>` : ''; } catch (e) { return ''; } })()}
        <h3 style="margin-top:16px">Host a game</h3>
        <div class="menu-grid" style="margin-top:6px">
          ${Object.entries(MODES).filter(([k]) => vm.includes(k)).map(([k, l]) => `<div class="menu-card" tabindex="0" data-act="olHost" data-mode="${k}"><h3>${l}</h3><div class="dim" style="font-size:12px">${k === 'exhibition' ? 'One-on-one live game on the court' : k === 'coop' ? 'You and a friend each control a Pokémon on the same team' : k === 'franchise' ? 'Several people each run a team in one growing league' : 'Snake draft with friends, then a full season'}</div></div>`).join('')}
        </div>
        <h3 style="margin-top:16px">Join a game</h3>
        <div class="row wrap"><input type="text" id="ol-code" maxlength="4" placeholder="CODE" value="${esc(view.code)}" style="width:90px;text-transform:uppercase"><button data-act="olJoinCode">Join</button><button data-act="olWatchCode" title="Watch a game or league without playing">👁 Watch</button></div>` : ''}
        <div class="row" style="margin-top:14px"><button data-act="goMenu">Back</button></div></div>`;
    },

  };
  UI.setOnlineModes = m => { view.modes = m; };
  function nameVal() { const e = document.getElementById('ol-name'); return e ? e.value.trim() : ''; }
  A.olConnect = async () => {
    N.name = nameVal() || N.name || 'Trainer';
    view.status = 'Connecting…'; UI.refresh();
    try { await N.connectP2P(N.name); view.status = ''; }
    catch (e) { view.status = e.message; }
    UI.refresh();
  };
  A.olDisconnect = () => { N.disconnect(); view.rooms = null; UI.refresh(); };
  A.olRefresh = () => N.list();
  A.olHost = (el, d) => {
    N.name = nameVal() || N.name || 'Trainer';
    const mode = d.mode; view.resume = null;
    view.ex = { picks: {}, qMin: PB.settings.quarterMin || 5 };
    N.create(mode, (mode === 'exhibition' || mode === 'coop') ? 2 : 8, MODES[mode]);
  };
  A.olWatchCode = () => { view.code = document.getElementById('ol-code').value.trim().toUpperCase(); N.name = nameVal() || N.name || 'Trainer'; if (view.code.length !== 4) { PB.toast('Enter the 4-letter room code'); return; } N.p2pJoin(view.code, false, true); };
  A.olJoinCode = () => { view.code = document.getElementById('ol-code').value.trim().toUpperCase(); N.name = nameVal() || N.name || 'Trainer'; PB.toast('Joining ' + view.code + '…', 2500); N.join(view.code); };
  A.olJoin = (el, d) => { N.name = nameVal() || N.name || 'Trainer'; N.join(d.code); };

  N.on('rooms', list => { view.rooms = list; if (UI.cur === 'online') UI.refresh(); });
  N.on('error', err => PB.toast(err, 3500));
  N.on('status', msg => PB.toast(msg, 2500));
  N.on('room', room => {
    if (UI.cur === 'online' && room) UI.go('lobby', {}, true);
    else if (UI.cur === 'lobby') UI.refresh();
  });
  N.on('closed', why => { if (reconnect()) return; PB.toast(why || 'The room was closed', 3500); if (UI.cur === 'lobby' || UI.cur === 'extpick') UI.go('online', {}, true); else if (N.session) { N.session = null; UI.go('menu', {}, true); } });
  N.on('disconnected', () => { if (N.session && N.session.league && !N.isHost()) return; PB.toast('Disconnected from the server', 4000); if (UI.cur === 'lobby') UI.go('online', {}, true); });

  // ---------- lobby ----------
  S.lobby = {
    back() { N.leave(); UI.go('online', {}, true); },
    render() {
      const r = N.room; if (!r) return '<div class="panel">Not in a room.</div>';
      const host = N.isHost(), full = r.players.length >= 2, spec = N.spectator;
      let settings = '';
      if (r.mode === 'exhibition' || r.mode === 'coop') settings = host ? `<label>Quarter length <select id="lb-q">${[2, 3, 5, 8, 12].map(n => `<option ${view.ex.qMin === n ? 'selected' : ''}>${n}</option>`).join('')}</select> min</label>` : '';
      else if (r.mode === 'fantasy') settings = host ? `<label>League size <select id="lb-teams">${[8, 12, 16, 20, 24, 30].filter(n => n >= r.players.length).map(n => `<option ${view.fOpts.teams === n ? 'selected' : ''}>${n}</option>`).join('')}</select> teams (AI teams fill the rest)</label><div class="dim" style="font-size:12px">What the draft shows about the Pokémon still on the board:</div><div class="row wrap">${[['R', 'Ratings'], ['P', 'Positions'], ['A', 'Archetypes'], ['O', 'Overall']].map(([k, l]) => `<label><input type="checkbox" id="lb-i${k}" checked> ${l}</label>`).join('')}</div>` : '';
      const rs = view.resume;
      if (rs && host) {
        const mk = h => { const m = r.players.find(p => p.name === h.name); return ['<option value="">— AI team —</option>'].concat(r.players.map(p => `<option value="${p.id}" ${m && m.id === p.id ? 'selected' : ''}>${esc(p.name)}</option>`)).join(''); };
        settings = `<div class="dim">Resuming <b>${esc(rs.label)}</b>. Pick who plays each team (others can join with the code first).</div>` + rs.humans.map(h => `<label class="row between">${esc(h.teamName)} <span class="dim">was ${esc(h.name)}</span><select id="as-${h.team}">${mk(h)}</select></label>`).join('');
      }
      const startLabel = rs ? 'Resume the league' : r.mode === 'exhibition' || r.mode === 'coop' ? 'Start match' : r.mode === 'franchise' ? 'Set up the league…' : 'Start the draft';
      const canStart = host && (r.mode === 'exhibition' || r.mode === 'coop' ? full : r.players.length >= 1);
      return `<div class="panel" style="max-width:640px;margin:16px auto"><h2>${esc(MODES[r.mode] || r.mode)}</h2>
        <div class="row between"><div class="dim">Room code</div><div style="font-size:34px;font-weight:900;letter-spacing:.2em" class="gold">${esc(r.code)}</div></div>
        ${spec ? '<div class="tag" style="margin-top:8px">👁 You are watching</div>' : ''}
        <h3 style="margin-top:12px">Players (${r.players.length}/${r.max})${r.spectators ? ' · 👁 ' + r.spectators + ' watching' : ''}</h3>
        ${r.players.map(p => `<div class="row" style="padding:3px 0"><span style="font-size:18px">${p.id === r.host ? '👑' : '🎮'}</span><b>${esc(p.name)}</b>${p.id === N.id ? '<span class="tag good">you</span>' : ''}</div>`).join('')}
        <div class="col" style="margin-top:12px">${settings}</div>
        <div class="row" style="margin-top:14px">${host ? `<button class="gold" data-act="lbStart" ${canStart ? '' : 'disabled'} autofocus>${startLabel}</button>` : `<span class="dim">${spec ? 'Waiting for the game to start. It will open here.' : 'Waiting for the host to start…'}</span>`}<button data-act="lbLeave">Leave</button></div>
        ${host && r.mode === 'exhibition' && !full ? '<div class="dim" style="margin-top:8px">Waiting for a second player to join with the code above.</div>' : ''}</div>`;
    },
  };
  A.lbLeave = () => { N.leave(); UI.go('online', {}, true); };
  A.lbStart = () => {
    const r = N.room; if (!r || !N.isHost()) return;
    const seed = (Math.random() * 4294967296) >>> 0;
    if (view.resume) {
      const rs = view.resume, teams = {}, names = {};
      for (const h of rs.humans) { const v = document.getElementById('as-' + h.team).value; if (v && !(+v in teams)) { teams[+v] = h.team; names[+v] = N.nameOf(+v); } }
      if (!(N.id in teams)) { PB.toast('Assign yourself to a team first'); return; }
      const start = { k: 'start', kind: 'resume', mode: rs.kind, data: rs.G, teams, names };
      N.toAll(start); UI.onlineBegin(start); return;
    }
    if (r.mode === 'exhibition' || r.mode === 'coop') {
      const q = document.getElementById('lb-q'); view.ex.qMin = q ? +q.value : 5;
      const start = { k: 'start', kind: r.mode, seed, qMin: view.ex.qMin, players: r.players.map(p => p.id) };
      N.toAll(start); UI.onlineBegin(start);
    } else if (r.mode === 'franchise') {
      UI.go('frnew', { online: true });
    } else {
      const t = document.getElementById('lb-teams'); const n = t ? +t.value : 12;
      view.fOpts.teams = n;
      const start = onlineStartData('fantasy', seed, n, null);
      const chk = k => { const e = document.getElementById('lb-i' + k); return e ? e.checked : true; };
      start.info = { R: chk('R'), P: chk('P'), A: chk('A'), O: chk('O') };
      N.toAll(start); UI.onlineBegin(start);
    }
  };
  function onlineStartData(kind, seed, n, cfg) {
    const r = N.room, pids = r.players.map(p => p.id);
    const rng = new PB.RNG((seed ^ 0x51ed) >>> 0);
    const slots = rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, pids.length);
    const teams = {}, names = {}; pids.forEach((pid, i) => { teams[pid] = slots[i]; names[pid] = N.nameOf(pid); });
    return { k: 'start', kind, seed, cfg, n, teams, names };
  }
  UI.onlineStartFranchise = function (cfg, seed) {
    const n = cfg.startTeams + (cfg.startTeams % 2);
    const start = onlineStartData('franchise', seed, n, cfg);
    N.toAll(start); UI.onlineBegin(start);
  };

  N.on('start', d => { if (N.spectator && (d.kind === 'exhibition' || d.kind === 'coop')) { PB.toast('Waiting for the match to start…'); return; } UI.onlineBegin(d); });

  // ---------- starting a session ----------
  function finishSetup(G, start) {
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal', autosave: false });
    G.userTeam = N.spectator ? Object.values(start.teams)[0] : start.teams[N.id];
    for (const pid in start.teams) {
      const T = G.teams[start.teams[pid]];
      T.user = true; T.identity = 'user'; T.strat = { off: 'balanced', def: 'man' };
      T.nick = String(start.names[pid] || 'Trainer').slice(0, 16); T.name = T.city + ' ' + T.nick;
    }
    PB.G = G; PB.settings = G.settings;
    N.session = { league: true, mode: start.mode || start.kind, teams: start.teams, names: Object.assign({}, start.names) };
    N.lastCode = N.room ? N.room.code : N.lastCode;
    try { if (!N.isHost()) localStorage.setItem('poke82_lastroom', JSON.stringify({ code: N.lastCode, name: N.name, t: Date.now() })); } catch (e) { }
    N.seq = 0; N.lastSeq = 0;
    UI.stack = [];
  }
  UI.onlineBegin = function (start) {
    if (start.kind === 'coop') {
      const G = PB.newGame(start.seed, 'main', 30, 0);
      G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal' });
      PB.aiDraftRounds(G, G.rng, G.teams.map(t => t.id), 0);
      PB.G = G; view.co = { picks: {}, start };
      N.session = { league: false, mode: 'coop', teams: {} };
      UI.go('cooppick', {}, true);
      return;
    }
    if (start.kind === 'exhibition') {
      const G = PB.newGame(start.seed, 'main', 30, 0);
      G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal' });
      PB.aiDraftRounds(G, G.rng, G.teams.map(t => t.id), 0);
      PB.G = G; view.ex = { picks: {}, qMin: start.qMin, start };
      N.session = { league: false, mode: 'exhibition', teams: {} };
      UI.go('extpick', {}, true);
      return;
    }
    if (start.kind === 'resume') {
      const G = PB.Save.deserialize(start.data); PB.Save.relink(G);
      const playing = Object.values(start.teams);
      for (const t of G.teams) if (t.user && !playing.includes(t.id)) { t.user = false; t.identity = 'balanced'; t.strat = { off: 'balanced', def: 'man' }; }
      const keep = {}; for (const id of playing) keep[id] = G.teams[id].nick;
      finishSetup(G, start);
      for (const id of playing) { G.teams[id].nick = keep[id]; G.teams[id].name = G.teams[id].city + ' ' + keep[id]; }
      if (G.league) UI.go('hub', { tab: 'home' }, true);
      else if (G.fdraft && G.fdraft.pick < G.fdraft.total) UI.go('fantasy', {}, true);
      else UI.go('lineup', { ctx: 'fantasyPost' }, true);
      return;
    }
    if (start.kind === 'franchise') {
      const G = F.create(start.seed, start.cfg, Object.values(start.teams));
      finishSetup(G, start);
      F.startLeague(G);
      UI.go('hub', { tab: 'home' }, true);
      return;
    }
    if (start.kind === 'fantasy') {
      const humans = Object.values(start.teams);
      const G = PB.newGame(start.seed, 'fantasy', start.n, humans[0]);
      if (start.info) G.draftInfo = start.info;
      for (const h of humans) { const T = G.teams[h]; T.user = true; T.identity = 'user'; T.strat = { off: 'balanced', def: 'man' }; }
      finishSetup(G, start);
      const keep = G.userTeam; G.userTeam = humans[0];
      PB.Fantasy.start(G, null);
      G.userTeam = keep;
      PB.Fantasy.runToHuman(G);
      UI.go('fantasy', {}, true);
    }
  };

  // ---------- online exhibition: choose teams ----------
  S.extpick = {
    back() { },
    top() { return `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div><span class="tag good">ONLINE ${N.room ? esc(N.room.code) : ''}</span><button class="small" data-act="exLeave">Leave</button>`; },
    render() {
      const G = PB.G, picks = view.ex.picks;
      const mine = picks[N.id];
      const taken = new Set(Object.values(picks));
      const who = tid => { const pid = Object.keys(picks).find(p => picks[p] === tid); return pid ? N.nameOf(+pid) : ''; };
      return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">Pick your team</h2><div class="dim">${N.room ? N.room.players.map(p => esc(p.name) + (picks[p.id] != null ? ' ✓' : ' …')).join(' · ') : ''}</div></div></div>
        <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${G.teams.map(t => `<div class="mcard ${picks[N.id] === t.id ? 'sel' : ''}" tabindex="0" data-act="exPick" data-t="${t.id}" style="${taken.has(t.id) && picks[N.id] !== t.id ? 'opacity:.5' : ''}">
          <div class="top"><div><div class="name">${esc(t.name)}</div><div class="dim" style="font-size:11px">${PB.OFF_STRATS[t.strat.off]} · ${PB.DEF_STRATS[t.strat.def]}</div></div>${UI.vis().O ? UI.ovrBadge(Math.round(PB.teamOvr(t))) : ''}</div>
          <div class="row" style="flex-wrap:wrap;gap:0">${t.starters.map(id => UI.spr(PB.BYID[id], 40)).join('')}</div>
          ${who(t.id) ? `<div class="tag good">${esc(who(t.id))}</div>` : ''}</div>`).join('')}</div>`;
    },
  };
  A.exLeave = () => { if (N.active()) N.leave(); N.session = null; UI.go('menu', {}, true); };
  A.exPick = (el, d) => {
    const t = +d.t;
    if (N.isHost()) hostPick(N.id, t); else N.toHost({ k: 'exPick', t });
  };
  function hostPick(pid, t) {
    const picks = view.ex.picks;
    if (Object.keys(picks).some(p => +p !== pid && picks[p] === t)) { if (pid !== N.id) N.to(pid, { k: 'exDeny' }); else PB.toast('Already taken'); return; }
    picks[pid] = t;
    N.toAll({ k: 'exState', picks });
    if (UI.cur === 'extpick') UI.refresh();
    const ids = N.room.players.map(p => p.id);
    if (ids.length === 2 && ids.every(id => picks[id] != null)) {
      const go = { k: 'exGo', picks, seed: (Math.random() * 4294967296) >>> 0, qMin: view.ex.qMin };
      N.toAll(go); startExhibitionMatch(go);
    }
  }
  N.on('exPick', (d, from) => { if (N.isHost()) hostPick(from, d.t); });
  N.on('exDeny', () => PB.toast('That team is taken'));
  N.on('exState', d => { view.ex.picks = d.picks; if (UI.cur === 'extpick') UI.refresh(); });
  N.on('exGo', d => startExhibitionMatch(d));
  function startExhibitionMatch(go) {
    if (N.spectator) return;
    const G = PB.G, ids = N.room.players.map(p => p.id);
    const hostId = N.room.host, guestId = ids.find(i => i !== hostId);
    const me = N.id === hostId ? 0 : 1, peer = me === 0 ? guestId : hostId;
    UI.closeModal();
    UI.startOnlineMatch({ G, userTeam: go.picks[hostId], oppId: go.picks[guestId], userHome: true, qMin: go.qMin, speed: 1, shotMeter: true, seed: go.seed, me, peer, exhibition: true, gseed: view.ex.start.seed,
      onEnd: (res, m) => {
        view.ex.picks = {};
        UI.go('extpick', {}, true);
        const b = { day: 0, h: m.teams[0].id, a: m.teams[1].id, sc: res.score, q: res.q, ot: res.ot, box: [0, 1].map(s => { const o = {}; for (const id in res.box[s]) { const x = res.box[s][id]; if (x.sec > 0) o[id] = PB.STAT_KEYS.map(k => x[k]); } return o; }) };
        UI.boxModal(b);
      } });
  }

  // ---------- online co-op: each person is locked to one Pokemon on the same team ----------
  S.cooppick = {
    back() { },
    top() { return `<div class="logo">POKÉHOOPS 82</div><div class="spacer"></div><span class="tag good">CO-OP ${N.room ? esc(N.room.code) : ''}</span><button class="small" data-act="exLeave">Leave</button>`; },
    render() {
      const G = PB.G, T = G.teams[0], picks = view.co.picks;
      const who = slot => { const pid = Object.keys(picks).find(p => picks[p] === slot); return pid ? N.nameOf(+pid) : ''; };
      return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">Choose your Pokémon</h2><div class="dim">${N.room ? N.room.players.map(p => esc(p.name) + (picks[p.id] != null ? ' ✓' : ' …')).join(' · ') : ''} — you play ${esc(T.name)} against an AI team</div></div></div>
        <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">${T.starters.map((id, i) => `<div class="mcard ${picks[N.id] === i ? 'sel' : ''}" tabindex="0" data-act="coopPick" data-i="${i}" style="${who(i) && picks[N.id] !== i ? 'opacity:.5' : ''}"><div class="top"><div class="name">${esc(PB.BYID[id].dispName)}</div></div><div class="sprwrap">${UI.spr(PB.BYID[id], 96)}</div><div class="dim center">${PB.POS[i]} · ${esc(PB.Abil.describe(id).badge)}</div>${who(i) ? `<div class="tag good">${esc(who(i))}</div>` : ''}</div>`).join('')}</div>`;
    },
  };
  A.coopPick = (el, d) => { const i = +d.i; if (N.isHost()) coopHostPick(N.id, i); else N.toHost({ k: 'coopPick', i }); };
  function coopHostPick(pid, i) {
    const picks = view.co.picks;
    if (Object.keys(picks).some(p => +p !== pid && picks[p] === i)) { if (pid !== N.id) N.to(pid, { k: 'exDeny' }); else PB.toast('Already taken'); return; }
    picks[pid] = i; N.toAll({ k: 'coopState', picks }); if (UI.cur === 'cooppick') UI.refresh();
    const ids = N.room.players.map(p => p.id);
    if (ids.length === 2 && ids.every(id => picks[id] != null)) { const go = { k: 'coopGo', picks, seed: (Math.random() * 4294967296) >>> 0, qMin: view.co.start.qMin }; N.toAll(go); startCoopMatch(go); }
  }
  N.on('coopPick', (d, from) => { if (N.isHost()) coopHostPick(from, d.i); });
  N.on('coopState', d => { view.co.picks = d.picks; if (UI.cur === 'cooppick') UI.refresh(); });
  N.on('coopGo', d => startCoopMatch(d));
  function startCoopMatch(go) {
    if (N.spectator) return;
    const G = PB.G, ids = N.room.players.map(p => p.id), hostId = N.room.host, guestId = ids.find(i => i !== hostId);
    const meCi = N.id === hostId ? 0 : 1, peer = meCi === 0 ? guestId : hostId, opp = 1 + (view.co.start.seed % 29);
    UI.closeModal();
    UI.startOnlineMatch({ G, userTeam: 0, oppId: opp, userHome: true, qMin: go.qMin, speed: 1, shotMeter: true, seed: go.seed, me: 0, meCi, peer, exhibition: true, gseed: view.co.start.seed, ctrls: [{ side: 0, lock: go.picks[hostId] }, { side: 0, lock: go.picks[guestId] }],
      onEnd: (res, m) => {
        view.co.picks = {}; UI.go('cooppick', {}, true);
        const b = { day: 0, h: m.teams[0].id, a: m.teams[1].id, sc: res.score, q: res.q, ot: res.ot, shots: res.shots, box: [0, 1].map(s => { const o = {}; for (const id in res.box[s]) { const x = res.box[s][id]; if (x.sec > 0) o[id] = PB.STAT_KEYS.map(k => x[k]); } return o; }) };
        UI.boxModal(b);
      } });
  }

  // ---------- reconnecting ----------
  let rc = null;
  function reconnect() {
    if (rc || N.spectator || !N.session || !N.session.league || N.isHost() || !N.lastCode) return false;
    rc = { n: 0, timer: null };
    UI.modal(`<div class="center"><h2>Connection lost</h2><div class="dim" id="rc-msg">Trying to get you back in…</div><div class="row center" style="margin-top:12px"><button data-act="rcGiveUp">Give up</button></div></div>`);
    const attempt = () => {
      if (!rc) return;
      rc.n++; const el = document.getElementById('rc-msg'); if (el) el.textContent = 'Reconnecting… attempt ' + rc.n + ' of 12';
      N.p2pJoin(N.lastCode, true);
      rc.timer = setTimeout(() => { if (!rc) return; if (rc.n >= 12) { A.rcGiveUp(); return; } attempt(); }, 6000);
    };
    attempt();
    return true;
  }
  A.rcGiveUp = () => { if (rc) { clearTimeout(rc.timer); rc = null; } UI.closeModal(); N.session = null; UI.stack = []; UI.go('menu', {}, true); PB.toast('Could not rejoin. Open Play Online → Rejoin to try again.', 5000); };
  N.on('rejoin', d => {
    if (rc) { clearTimeout(rc.timer); rc = null; UI.closeModal(); }
    const G = PB.Save.deserialize(d.data); PB.Save.relink(G);
    N.session = { league: true, mode: d.mode, teams: d.teams, names: d.names };
    G.userTeam = d.teams[N.id]; G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal', autosave: false });
    PB.G = G; PB.settings = G.settings; N.lastSeq = d.seq; N.seq = d.seq;
    UI.stack = []; if (G.league) UI.go('hub', { tab: 'home' }, true); else if (G.fdraft && G.fdraft.pick < G.fdraft.total) UI.go('fantasy', {}, true); else UI.go('lineup', { ctx: 'fantasyPost' }, true);
    PB.toast('Back in the game');
  });
  N.on('teams', d => { if (N.session) { N.session.teams = d.teams; N.session.names = d.names; } });
  N.on('error', () => { if (rc) { /* the next attempt is already scheduled */ } });
  A.olRejoin = async () => {
    let last = null; try { last = JSON.parse(localStorage.getItem('poke82_lastroom')); } catch (e) { }
    if (!last) return;
    N.name = last.name; view.status = 'Connecting…'; UI.refresh();
    try { await N.connectP2P(last.name); view.status = ''; N.session = { league: true, teams: {}, names: {} }; N.p2pJoin(last.code, true); }
    catch (e) { view.status = e.message; UI.refresh(); }
  };


  // ---------- spectating ----------
  N.on('spectate', d => {
    if (!N.spectator) return;
    const G = PB.Save.deserialize(d.data); PB.Save.relink(G);
    N.session = { league: true, mode: d.mode, teams: d.teams, names: d.names, spectator: true };
    G.userTeam = Object.values(d.teams)[0] != null ? Object.values(d.teams)[0] : 0; G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal', autosave: false });
    PB.G = G; PB.settings = G.settings; N.lastSeq = d.seq; N.seq = d.seq;
    UI.stack = []; if (G.league) UI.go('hub', { tab: 'home' }, true); else if (G.fdraft && G.fdraft.pick < G.fdraft.total) UI.go('fantasy', {}, true); else UI.go('lineup', { ctx: 'fantasyPost' }, true);
    PB.toast('You are watching this league (read only)', 3500);
  });
  N.on('mstart', d => { if (N.spectator) UI.startSpectate(d); });
  N.on('msi', d => { if (N.spectator) UI.spectateFrames(d); });
  N.on('mend', () => { if (N.spectator) UI.spectateEnd(); });
  // ---------- online leagues ----------
  const isOn = () => N.onlineLeague();
  const hostOnly = fn => (el, d) => { if (!N.isHost()) { PB.toast('Only the host advances the league'); return; } fn(el, d); };
  function wrap(name, fn) { const orig = A[name]; A[name] = (el, d) => isOn() ? fn(el, d) : (orig && orig(el, d)); }
  const run = (name, args, after) => O.run(name, args, (err, res) => { if (err) { PB.toast(err, 3500); return; } if (after) after(res); });
  wrap('simDays', hostOnly((el, d) => run('simDays', { n: +d.n, all: true })));
  wrap('simRest', hostOnly(() => run('simRest', {})));
  wrap('simAllSeason', hostOnly(() => run('simSeason', {})));
  wrap('toNextGame', hostOnly(() => run('advance', {})));
  wrap('simToDate', hostOnly(() => { const v = document.getElementById('simdate').value; if (!v) return; run('simToDay', { day: L.dayFromISO(v) }); }));
  wrap('simGame', () => run('simMyGame', { tid: PB.G.userTeam }));
  wrap('playGame', () => UI.onlinePlay());
  wrap('frBegin', hostOnly(() => run('beginOffseason', {})));
  wrap('frStartDraft', hostOnly(() => run('startDraft', {})));
  wrap('frNextSeason', hostOnly(() => run('startNextSeason', {}, () => { UI.stack = []; UI.go('hub', { tab: 'home' }, true); })));
  wrap('frDraftRest', hostOnly(() => run('draftRest', {})));
  wrap('goMenu', () => { if (!confirm('Leave the online game?')) return; N.leave(); N.session = null; UI.stack = []; UI.go('menu', {}, true); });

  const origFinish = UI.finishPlayed;
  UI.finishPlayed = function (G, ug, result) {
    if (!isOn()) return origFinish(G, ug, result);
    run('result', { day: ug.day, h: ug.h, a: ug.a, result });
    UI.go('hub', { tab: 'home' }, true);
  };

  const pidOfTeam = tid => { const s = N.session && N.session.teams; return s ? +Object.keys(s).find(p => s[p] === tid) : null; };
  let req = null;
  UI.onlinePlay = function () {
    const G = PB.G, me = G.userTeam, ug = L.gamesFor(G, me); if (!ug) return;
    const oppId = ug.h === me ? ug.a : ug.h, opp = G.teams[oppId];
    if (!opp.user) { UI.pregame(G, ug); return; }
    const pid = pidOfTeam(oppId); if (!pid) { PB.toast('That player is not connected'); return; }
    req = { pid, ug: { day: ug.day, h: ug.h, a: ug.a }, seed: (Math.random() * 4294967296) >>> 0, q: PB.settings.quarterMin || 5 };
    UI.modal(`<div class="center"><h2>Waiting for ${esc(N.nameOf(pid))}…</h2><div class="dim">${esc(opp.name)} must accept to play today's game live.</div><div class="row center" style="margin-top:12px"><button data-act="olCancelReq">Cancel</button></div></div>`);
    N.to(pid, { k: 'matchReq', ug: req.ug, seed: req.seed, q: req.q, from: me });
  };
  A.olCancelReq = () => { if (req) N.to(req.pid, { k: 'matchCancel' }); req = null; UI.closeModal(); };
  N.on('matchReq', (d, from) => {
    const G = PB.G; if (!isOn() || !G) return;
    const mine = L.gamesFor(G, G.userTeam);
    if (!mine || mine.h !== d.ug.h || mine.a !== d.ug.a) { N.to(from, { k: 'matchAck', yes: false }); return; }
    UI.modal(`<div class="center"><h2>${esc(N.nameOf(from))} wants to play live</h2><div class="dim">${esc(G.teams[d.ug.a].name)} @ ${esc(G.teams[d.ug.h].name)} · ${d.q}-minute quarters</div>
      <div class="row center" style="margin-top:12px"><button class="gold" data-act="olAccept" autofocus>Play live</button><button data-act="olDecline">Not now</button></div></div>`);
    UI._pendingReq = { d, from };
  });
  A.olAccept = () => {
    const p = UI._pendingReq; if (!p) return; UI._pendingReq = null; UI.closeModal();
    N.to(p.from, { k: 'matchAck', yes: true });
    beginLeagueMatch(p.d.ug, p.d.seed, p.d.q, p.from, false);
  };
  A.olDecline = () => { const p = UI._pendingReq; UI._pendingReq = null; UI.closeModal(); if (p) N.to(p.from, { k: 'matchAck', yes: false }); };
  N.on('matchAck', (d, from) => {
    if (!req || req.pid !== from) return;
    UI.closeModal();
    const r = req; req = null;
    if (d.yes) beginLeagueMatch(r.ug, r.seed, r.q, from, true); else PB.toast('They declined — you can simulate the game instead.', 3500);
  });
  N.on('matchCancel', () => { if (UI._pendingReq) { UI._pendingReq = null; UI.closeModal(); PB.toast('The challenge was cancelled'); } });
  function beginLeagueMatch(ug, seed, q, peer, requester) {
    const G = PB.G, lg = G.league;
    const reqTeam = requester ? G.userTeam : (ug.h === G.userTeam ? ug.a : ug.h);
    const other = ug.h === reqTeam ? ug.a : ug.h;
    const game = lg.phase === 'playoffs' ? { day: ug.day, h: ug.h, a: ug.a } : { day: ug.day, h: ug.h, a: ug.a };
    UI.startOnlineMatch({ G, userTeam: reqTeam, oppId: other, userHome: ug.h === reqTeam, qMin: q, speed: 1, shotMeter: true, seed, me: requester ? 0 : 1, peer, ugame: game, requester,
      onEnd: (res, m, forfeit) => {
        if (requester || forfeit) O.run('result', { day: ug.day, h: ug.h, a: ug.a, result: res }, () => { });
        UI.go('hub', { tab: 'home' }, true);
      } });
  }

  // fantasy: ready / start the season
  UI.onlineReadyHtml = function (G) {
    const ready = G.ready || {}, humans = G.teams.filter(t => t.user);
    const errs = PB.validateLineup(G.teams[G.userTeam]);
    return `<div class="row wrap"><button class="gold" data-act="olReady" ${errs.length || ready[G.userTeam] ? 'disabled' : ''}>${ready[G.userTeam] ? 'Ready ✓' : 'I am ready'}</button>
      ${N.isHost() ? `<button class="primary" data-act="olStartSeason" ${humans.every(t => ready[t.id]) ? '' : ''}>Start the season (${humans.filter(t => ready[t.id]).length}/${humans.length} ready)</button>` : `<span class="dim">${humans.filter(t => ready[t.id]).length}/${humans.length} ready — the host starts the season</span>`}</div>`;
  };
  A.olReady = () => run('ready', { tid: PB.G.userTeam }, () => UI.refresh());
  A.olStartSeason = () => { if (!N.isHost()) return; run('fantasyStart', {}); };


  // ---------- online banner in the hub ----------
  const TAB = UI.hubTabs;
  const homeTab = TAB.home;
  TAB.home = function (G, lg, p) {
    const html = homeTab(G, lg, p);
    if (!isOn()) return html;
    const host = N.isHost();
    const mine = lg.phase !== 'done' ? L.gamesFor(G, G.userTeam) : null;
    const humans = G.teams.filter(t => t.user);
    const rows = humans.map(t => {
      const g = lg.phase !== 'done' ? L.gamesFor(G, t.id) : null;
      const pid = pidOfTeam(t.id);
      return `<div class="row between" style="font-size:12px"><span>${t.id === G.userTeam ? '★ ' : ''}<b>${esc(t.name)}</b> <span class="dim">${esc(N.nameOf(pid))}</span></span><span class="${g ? 'gold' : 'dim'}">${lg.phase === 'done' ? '' : g ? 'game pending' : 'done for today'}</span></div>`;
    }).join('');
    if (N.spectator) return `<div class="panel" style="margin-bottom:12px;border-color:var(--blue)"><b>👁 Spectating ${N.room ? esc(N.room.code) : ''}</b> <span class="dim">You can browse standings, stats and rosters, but only the players change anything. Live matches between players open on their own.</span></div>` + html;
    const info = `<div class="panel" style="margin-bottom:12px;border-color:var(--blue)"><div class="row between wrap"><b>🌐 Online league <span class="gold">${esc(N.room ? N.room.code : '')}</span></b><span class="dim">${host ? 'You are the host: you advance the calendar.' : 'The host advances the calendar.'}</span></div>${rows}
      ${mine && !host ? '<div class="dim" style="font-size:12px;margin-top:6px">Play or simulate your game; the host moves the league forward once everyone is done.</div>' : ''}</div>`;
    return info + html;
  };
  const hubTop = S.hub.top;
  S.hub.top = function (p) {
    let h = hubTop(p);
    if (isOn()) h = h.replace('<div class="spacer"></div>', `<div class="spacer"></div><span class="tag good">${N.spectator ? '👁 WATCHING' : 'ONLINE'} ${N.room ? esc(N.room.code) : ''}${N.room && N.room.spectators && !N.spectator ? ' · 👁 ' + N.room.spectators : ''}</span>`);
    return h;
  };

  // ---------- host save / resume ----------
  const OKEY = n => 'poke82_online_' + n;
  function saveMeta(n) { try { return JSON.parse(localStorage.getItem(OKEY(n) + '_meta')); } catch (e) { return null; } }
  function packLeague() {
    const G = PB.G, ses = N.session;
    const humans = Object.entries(ses.teams).map(([pid, t]) => ({ team: t, teamName: G.teams[t].name, name: N.nameOf(+pid) }));
    const label = (ses.mode === 'franchise' ? 'Franchise S' + (G.fr ? G.fr.year : 1) : 'Fantasy league') + ' · ' + humans.map(h => h.name).join(', ');
    return { v: 1, kind: ses.mode, t: Date.now(), label, humans, G: PB.Save.serialize(G) };
  }
  UI.onlineSave = function (n, quiet) {
    try {
      const d = packLeague();
      localStorage.setItem(OKEY(n), JSON.stringify(d));
      localStorage.setItem(OKEY(n) + '_meta', JSON.stringify({ t: d.t, label: d.label }));
      if (!quiet) PB.toast('Online league saved to slot ' + n);
      return true;
    } catch (e) { if (!quiet) PB.toast('Save failed: ' + e.message, 4000); return false; }
  };
  A.olSaveSlot = (el, d) => { if (!N.isHost()) return PB.toast('Only the host can save'); UI.onlineSave(+d.slot); UI.refresh(); };
  A.olSaveFile = () => {
    if (!N.isHost()) return PB.toast('Only the host can save');
    const blob = new Blob([JSON.stringify(packLeague())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pokehoops-online-league.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  function hostResume(d) {
    if (!d || !d.G || !d.humans) { PB.toast('Not a valid league save'); return; }
    view.resume = d; N.name = nameVal() || N.name || 'Trainer';
    N.create(d.kind, 8, 'Resumed league');
  }
  A.olResume = (el, d) => { try { hostResume(JSON.parse(localStorage.getItem(OKEY(+d.slot)))); } catch (e) { PB.toast('Could not read that save'); } };
  UI.olFile = input => {
    const f = input.files && input.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { hostResume(JSON.parse(r.result)); } catch (e) { PB.toast('Could not read that file'); } };
    r.readAsText(f);
  };
  const origSave = TAB.save;
  TAB.save = function (G, lg) {
    if (!isOn()) return origSave(G, lg);
    const host = N.isHost();
    const slot = n => { const m = saveMeta(n); return `<div class="panel row between"><div><b>Online slot ${n}</b><div class="dim" style="font-size:12px">${m ? esc(m.label) + ' · ' + new Date(m.t).toLocaleString() : 'Empty'}</div></div><button data-act="olSaveSlot" data-slot="${n}" ${host ? '' : 'disabled'}>Save here</button></div>`; };
    return `<div class="col" style="max-width:700px"><div class="panel" style="border-color:var(--blue)"><h3>Online league</h3><div class="dim" style="font-size:12px;margin-bottom:6px">${host ? 'You are the host. Saves live in this browser (or a file); resume from Play Online → Resume. The league also autosaves to slot 1 as it progresses.' : 'Only the host can save this league.'}</div>${slot(1)}${slot(2)}<div class="row" style="margin-top:8px"><button data-act="olSaveFile" ${host ? '' : 'disabled'}>Download save file</button></div></div></div>`;
  };
  let lastAuto = 0;
  N.on('applied', () => { if (isOn() && N.isHost() && Date.now() - lastAuto > 8000) { lastAuto = Date.now(); UI.onlineSave(1, true); } });

  // every applied operation redraws the current screen (unless a live match is on)
  N.on('applied', d => {
    if (d && d.name === 'fantasyStart') { UI.stack = []; UI.go('hub', { tab: 'home' }, true); return; }
    if (UI.cur === 'game' || document.getElementById('gamewrap').classList.contains('open')) return;
    if (d && d.name === 'startNextSeason') { UI.stack = []; UI.go('hub', { tab: 'home' }, true); return; }
    if (['hub', 'fantasy', 'lineup'].includes(UI.cur) && !UI.modalOpen()) UI.refresh();
    else if (UI.cur === 'hub') UI.refresh();
  });
  // when the league season finishes for an online league the hub switches to the offseason view on its own
})(window.PB);
