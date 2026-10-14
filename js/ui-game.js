// Playable game screen: pregame, 2.5D perspective renderer (camera behind the play or broadcast),
// broadcast scoreboard, pause/substitutions, results.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, A = UI.actions;
  const W = 94, H = 50;
  const wrap = () => document.getElementById('gamewrap');
  const cv = () => document.getElementById('court');
  let startLatch = false;
  let match = null, running = false, paused = false, ctx = null, raf = 0, last = 0, cur = null;
  const GFX = PB.GFX;
  GFX.getMatch = () => match; GFX.getDt = () => frameDt;
  const { sprite, drawSprite, cam, updateCamera, proj, polyPath, fillPoly, strokeLine, arc, LINES, buildCrowd, hypeCrowd, drawArena, courtsideItems, drawMeter, shade, hexDist } = GFX;
  // ---------- pregame ----------
  UI.pregame = function (G, ug, opts) {
    opts = opts || {};
    const T = G.teams[G.userTeam];
    const oppId = ug.h === G.userTeam ? ug.a : ug.h;
    const O = G.teams[oppId];
    const s = PB.settings;
    const showO = s.showOverall;
    UI.modal(`<h2>${esc(T.name)} ${ug.h === G.userTeam ? 'vs' : '@'} ${esc(O.name)}</h2>
      ${showO ? `<div><b>OVR</b> ${PB.teamOvr(T).toFixed(1)} vs ${PB.teamOvr(O).toFixed(1)}</div>` : ''}
      <div class="row wrap" style="margin:10px 0">${O.starters.map(id => `<div class="center" style="width:70px">${UI.spr(PB.BYID[id], 56)}<div style="font-size:11px">${esc(PB.BYID[id].dispName)}</div><div class="dim" style="font-size:10px" title="${esc(PB.Abil.describe(id).desc)}">⚡ ${esc(PB.Abil.describe(id).badge)}</div>${showO ? `<b>${PB.BYID[id].ovr}</b>` : ''}</div>`).join('')}</div>
      <label>Quarter length: <b id="pq">${s.quarterMin}</b> min <input type="range" min="1" max="12" value="${s.quarterMin}" id="pqr" oninput="document.getElementById('pq').textContent=this.value"></label>
      <label style="margin-left:14px">Camera <select id="pcam"><option value="behind" ${s.camera !== 'broadcast' ? 'selected' : ''}>2K (behind the play)</option><option value="broadcast" ${s.camera === 'broadcast' ? 'selected' : ''}>Broadcast (sideline)</option></select></label>
      <div class="row wrap" style="margin-top:12px"><button class="gold" data-act="tipOff" data-opp="${oppId}" autofocus>Tip off</button><button data-act="closeModal">Cancel</button></div>`);
    cur = { G, ug, opts, oppId };
  };
  A.tipOff = () => {
    PB.settings.quarterMin = +document.getElementById('pqr').value;
    PB.settings.camera = document.getElementById('pcam').value;
    PB.Save.settingsSave(PB.settings);
    UI.closeModal();
    startGame(cur.G, cur.ug, cur.oppId, PB.settings.quarterMin, cur.opts);
  };

  UI.exhibition = function () {
    const seed = (Math.random() * 4294967296) >>> 0;
    const G = PB.newGame(seed, 'main', 30, 0);
    G.settings = Object.assign(PB.defaultSettings(), PB.settings);
    PB.aiDraftRounds(G, G.rng, G.teams.map(t => t.id), 0);
    PB.G = G;
    const opp = 1 + (seed % 29);
    cur = { G, ug: { h: 0, a: opp, day: 0, exhibition: true }, opts: { exhibition: true }, oppId: opp };
    UI.pregame(G, cur.ug, cur.opts);
  };
  A.exhibition = () => UI.exhibition();

  // ---------- game start / stop ----------
  function startGame(G, ug, oppId, qMin, opts) {
    paused = false;
    PB.Input.mode = 'game';
    match = new PB.Match(G, { oppId, quarterMin: qMin, userHome: ug.h === G.userTeam, gameSpeed: PB.settings.gameSpeed || 1, rng: new PB.RNG(((Math.random() * 4294967296) >>> 0)) });
    match.ugame = ug; match.exhibition = !!(opts && opts.exhibition);
    beginScreen();
  }
  // any custom match: quick play, 3v3, practice, co-op. hooks.onEnd(result, match, forfeited)
  UI.launchMatch = function (G, mopts, hooks) {
    paused = false; PB.Input.mode = 'game';
    match = new PB.Match(G, Object.assign({ gameSpeed: PB.settings.gameSpeed || 1, rng: new PB.RNG((Math.random() * 4294967296) >>> 0) }, mopts));
    match.custom = hooks || {}; match.exhibition = true; match.ugame = null;
    startLatch = true;
    beginScreen();
  };
  UI.activeMatch = () => match;
  // two people, two computers: both run the same match from the same seed and exchange controller input every tick
  const TICK = 1 / 60;
  const NEUTRAL = { mx: 0, my: 0, rx: 0, ry: 0, rt: 0, lt: 0, held: {}, pressed: {}, acts: [] };
  UI.startOnlineMatch = function (cfg) {
    paused = false; PB.Input.mode = 'game';
    match = new PB.Match(cfg.G, { oppId: cfg.oppId, userTeam: cfg.userTeam, quarterMin: cfg.qMin, userHome: cfg.userHome, gameSpeed: cfg.speed || 1, rng: new PB.RNG(cfg.seed), twoHumans: true, ctrls: cfg.ctrls, me: cfg.me, meCi: cfg.meCi != null ? cfg.meCi : cfg.me, noDiff: true, shotMeter: cfg.shotMeter !== false });
    match.ugame = cfg.ugame || null; match.exhibition = !!cfg.exhibition;
    const D = 6;
    const N = match.online = { cfg, D, gen: 0, sim: 0, acc: 0, q: [new Map(), new Map()], out: [], sent: new Map(), ackBy: D - 1, nextRecv: D, rcvd: new Set(), nSend: 0, pressedAcc: {}, acts: [], cs: {}, rcs: {}, stallT: 0, paused: false, pauser: null, lastInp: null, ended: false };
    for (let t = 0; t < D; t++) { N.q[0].set(t, NEUTRAL); N.q[1].set(t, NEUTRAL); }
    // watchers: the player who is controller 0 announces the match; the room's host relays every input frame to them
    if (match.meCi === 0 && PB.Net && PB.Net.spectatorsAllowed !== false) PB.Net.toSpec({ k: 'mstart', pids: [PB.Net.id, cfg.peer], cfg: { oppId: cfg.oppId, userTeam: cfg.userTeam, qMin: cfg.qMin, userHome: cfg.userHome, seed: cfg.seed, ctrls: cfg.ctrls || null, gseed: cfg.gseed != null ? cfg.gseed : null, ugame: cfg.ugame || null } });
    startLatch = true;
    beginScreen();
  };
  // ---- watching someone else's online match: replay their input frames through the same simulation ----
  UI.startSpectate = function (msg) {
    const cfg = msg.cfg; let G = PB.G;
    if (cfg.gseed != null) {            // exhibition / co-op: the two players built this league from a seed
      G = PB.newGame(cfg.gseed, 'main', 30, 0); G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal' });
      PB.aiDraftRounds(G, G.rng, G.teams.map(t => t.id), 0); PB.G = G;
    }
    if (!G || !G.teams[cfg.userTeam] || !G.teams[cfg.oppId]) return;
    if (running) return;
    paused = false; PB.Input.mode = 'game';
    match = new PB.Match(G, { oppId: cfg.oppId, userTeam: cfg.userTeam, quarterMin: cfg.qMin, userHome: cfg.userHome, gameSpeed: 1, rng: new PB.RNG(cfg.seed), twoHumans: true, ctrls: cfg.ctrls || undefined, me: 0, meCi: 0, noDiff: true, shotMeter: true });
    match.exhibition = true; match.ugame = null;
    const D = 6, N = match.online = { spec: true, cfg: { onEnd: () => UI.spectateDone() }, pids: msg.pids, D, sim: 0, q: [new Map(), new Map()], paused: false, pauser: null, ended: false, got: 0 };
    for (let t = 0; t < D; t++) { N.q[0].set(t, NEUTRAL); N.q[1].set(t, NEUTRAL); }
    startLatch = true;
    beginScreen(true);
  };
  UI.spectating = () => !!(match && match.online && match.online.spec && running);
  UI.spectateFrames = function (d) {
    if (!match || !match.online || !match.online.spec) return;
    const N = match.online, s = N.pids.indexOf(d.pid); if (s < 0) return;
    for (const [t, a] of d.fr) { N.q[s].set(t, decodeFrame(a)); N.got++; }
  };
  UI.spectateEnd = function () { if (UI.spectating()) { const m = match; m.online.remoteEnd = true; } };
  UI.spectateDone = function () {
    stopGame(); UI.closeModal();
    const Nt = PB.Net;
    if (Nt && Nt.active() && UI.cur !== 'hub' && !(Nt.session && Nt.session.league)) UI.go('lobby', {}, true);
    else if (PB.G && PB.G.league && Nt && Nt.session && Nt.session.league) UI.go('hub', { tab: 'home' }, true);
    else UI.go('menu', {}, true);
  };
  A.spectateStop = () => { if (match && match.online && match.online.spec) { match._finished = true; UI.spectateDone(); } };
  A.spectateKeep = () => { UI.closeModal(); PB.Input.mode = 'game'; };
  function spectateFrame(dt) {
    const m = match, N = m.online, inp = inputState();
    if (!UI.modalOpen() && (inp.pressed.START || inp.pressed.BACK)) { PB.Input.mode = 'menu'; UI.modal(`<div class="center"><h2>Stop watching?</h2><div class="dim">The match keeps going without you.</div><div class="row center" style="margin-top:12px"><button class="primary" data-act="spectateKeep" autofocus>Keep watching</button><button data-act="spectateStop">Stop watching</button></div></div>`, { onClose: () => { PB.Input.mode = 'game'; } }); }
    const back = Math.min(N.q[0].size, N.q[1].size), max = back > 40 ? 90 : 8;     // far behind (joined mid-match): fast-forward
    let n = 0;
    while (n < max && !m.over && N.q[0].has(N.sim) && N.q[1].has(N.sim)) {
      const f0 = N.q[0].get(N.sim), f1 = N.q[1].get(N.sim);
      N.q[0].delete(N.sim); N.q[1].delete(N.sim);
      for (let s = 0; s < 2; s++) for (const a of (s === 0 ? f0 : f1).acts) { if (a[0] === 'P') N.paused = true; else if (a[0] === 'R') N.paused = false; else applyAct(s, a); }
      if (!N.paused) m.update(TICK, f0, f1);
      N.sim++; n++;
      if (N.sim % 120 === 0) (N.hist || (N.hist = {}))[N.sim] = Math.round(m.t * 1000) + ':' + m.g.score[0] + '-' + m.g.score[1] + ':' + Math.round(m.ball.x * 100) + ',' + Math.round(m.ball.y * 100) + ':' + Math.round(m.bodies[0][0].x * 100);
    }
    N.catching = back > 40;
  }
  function beginScreen(noTouch) {
    if (PB.Touch && !noTouch) PB.Touch.show();
    cam.fx = 47; cam.fy = 25; cam.init = false; cam.yaw = 0;
    // court players' sprites load first, fans after
    for (const t of match.teams) for (const id of t.roster) sprite(PB.BYID[id]);
    buildCrowd();
    wrap().classList.add('open');
    document.getElementById('app').style.visibility = 'hidden';
    ctx = cv().getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    running = true; last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stopGame() {
    if (PB.Touch) PB.Touch.hide();
    running = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    wrap().classList.remove('open');
    document.getElementById('app').style.visibility = '';
    PB.Input.mode = 'menu';
  }
  function resize() {
    const c = cv(); const dpr = Math.min(2, window.devicePixelRatio || 1) * (+PB.settings.renderScale || 1);      // render scale < 1 draws fewer pixels (the canvas is stretched to the window)
    c.width = Math.max(320, Math.floor(window.innerWidth * dpr)); c.height = Math.max(180, Math.floor(window.innerHeight * dpr));
  }

  // ---------- input (screen-relative sticks) ----------
  function inputState() {
    const I = PB.Input;
    I.poll();
    const held = {}, pressed = {};
    for (const b of I.BTN) { held[b] = I.held(b); pressed[b] = I.pressed(b); }
    // stick: right = screen right, up = into the screen
    const map = (sx, sy) => {
      if (!cam.fwd) return [sx, sy];
      return [cam.right[0] * sx - cam.fwd[0] * sy, cam.right[1] * sx - cam.fwd[1] * sy];
    };
    const [mx, my] = map(I.lx, I.ly), [rx, ry] = map(I.rx, I.ry);
    return { mx, my, rx, ry, held, pressed, rt: I.rt, lt: I.lt };
  }
  // ---------- instant replay ----------
  let replay = null;
  UI.startReplay = function (clip, fromPause) {
    if (!match || !clip || clip.frames.length < 4) return;
    UI._modalBack = null; UI.closeModal();
    const rm = Object.create(match);
    rm.bodies = [[], []]; rm.replay = true; rm.meter = null; rm.ft = null; rm.events = []; rm.phase = 'live'; rm._netT = null; rm._rnt = -1;
    for (const bm of clip.bodies) rm.bodies[bm.s].push({ s: bm.s, slot: bm.slot, mon: bm.mon, pl: bm.pl, r: bm.r, x: 0, y: 0, z: 0, vx: 0, vy: 0, jump: 0, face: 1, ctl: false, shootT: 0 });
    rm.allBodies = () => rm.bodies[0].concat(rm.bodies[1]);
    rm.ball = { x: 0, y: 0, z: 3, holder: null, state: 'loose' };
    replay = { clip, acc: 0, rm, fromPause: !!fromPause, was: paused };
    paused = true; PB.Input.mode = 'game';
  };
  function stepReplay(dt) {
    const R = replay, fr = R.clip.frames;
    R.acc += dt * 0.7;
    const pos = R.acc * 15, i = Math.floor(pos), f = pos - i;
    if (i >= fr.length - 1) { endReplay(); return false; }
    const a = fr[i], b = fr[i + 1], rm = R.rm, bodies = rm.allBodies();
    for (let k = 0; k < bodies.length; k++) {
      const p = a.b[k], q = b.b[k], o = bodies[k];
      o.x = p[0] + (q[0] - p[0]) * f; o.y = p[1] + (q[1] - p[1]) * f; o.z = p[2] + (q[2] - p[2]) * f; o.vx = p[3]; o.vy = p[4]; o.jump = p[5]; o.face = p[6]; o.shootT = p[7];
    }
    rm.ball.x = a.ball[0] + (b.ball[0] - a.ball[0]) * f; rm.ball.y = a.ball[1] + (b.ball[1] - a.ball[1]) * f; rm.ball.z = a.ball[2] + (b.ball[2] - a.ball[2]) * f;
    rm.ball.holder = a.ball[3] ? true : null; rm.t = a.t + (b.t - a.t) * f; rm.poss = a.p; rm._rnt = a.nt != null ? a.nt : -1; rm._rnb = a.nb;
    return true;
  }
  function endReplay() {
    const R = replay; replay = null; if (!R) return;
    last = performance.now();
    if (R.fromPause) pause(); else { paused = false; startLatch = true; PB.Input.mode = 'game'; }
    if (match) match.replayOffer = null;
  }
  A.watchClip = (el, d) => { const c = match.highlights[+d.i]; if (c) UI.startReplay(c, true); };
  function inputState2() {
    const I = PB.Input;
    const p = I.poll2();
    const map = (sx, sy) => cam.fwd ? [cam.right[0] * sx - cam.fwd[0] * sy, cam.right[1] * sx - cam.fwd[1] * sy] : [sx, sy];
    const [mx, my] = map(p.lx, p.ly), [rx, ry] = map(p.rx, p.ry);
    return { mx, my, rx, ry, held: p.held, pressed: p.pressed, rt: p.rt, lt: p.lt };
  }
  function frame(now) {
    if (!running) return;
    const cap = +PB.settings.fpsCap || 0;
    if (cap && now - last < 1000 / cap - 2) { raf = requestAnimationFrame(frame); return; }      // frame-rate limit: the skipped time carries into the next step
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (replay) {
      const inp = inputState();
      if (inp.pressed.A || inp.pressed.B || inp.pressed.X || inp.pressed.Y || inp.pressed.START || inp.pressed.BACK) endReplay();
      else if (stepReplay(dt)) {
        const keep = match; match = replay.rm;
        try { render(dt); } finally { match = keep; }
        const g = ctx, w = cv().width, h = cv().height, fs = Math.round(h * 0.034);
        g.font = `900 italic ${fs}px Segoe UI, sans-serif`; g.textAlign = 'left'; g.fillStyle = 'rgba(8,12,22,.8)';
        const lbl = '◀ REPLAY  ' + replay.clip.label + '  ·  Q' + replay.clip.q + ' ' + replay.clip.clock;
        const tw = g.measureText(lbl).width + fs; g.fillRect(14, 14, tw, fs * 1.7); g.fillStyle = '#ffd23f'; g.fillText(lbl, 14 + fs / 2, 14 + fs * 1.2);
        g.font = `600 ${Math.round(fs * 0.5)}px Segoe UI, sans-serif`; g.fillStyle = '#cfd8ea'; g.fillText('press any button to skip', 14 + fs / 2, 14 + fs * 2.1);
      }
      raf = requestAnimationFrame(frame); return;
    }
    if (match.online && match.online.spec) spectateFrame(dt);
    else if (match.online) onlineFrame(dt);
    else if (!paused) {
      const inp = inputState();
      if (inp.pressed.BACK && match.replayOffer && match.t < match.replayOffer.until && !match.online) { UI.startReplay(match.replayOffer.clip, false); raf = requestAnimationFrame(frame); return; }
      const second = match.U.length > 1 && match.U[1].side === match.U[0].side;
      const inp2 = second ? inputState2() : null;
      // the Start/Esc press that closed the pause menu must be released before it can pause again
      if (startLatch && !inp.held.START) startLatch = false;
      if (inp.pressed.START && !startLatch) pause();
      else {
        let rem = dt, first = true;
        const np = i => Object.assign({}, i, { pressed: {} });
        while (rem > 1e-4) {
          const d = Math.min(1 / 60, rem); rem -= d;
          if (!match.over) match.update(d, first ? inp : np(inp), second ? (first ? inp2 : np(inp2)) : undefined);
          first = false;
        }
      }
    }
    if (match.sfx.length) for (const n of match.sfx.splice(0)) { if (typeof n === 'object') { hypeCrowd(n.kind, n.side); PB.Audio.play('cheer'); continue; } PB.Audio.play(n); }
    if (PB.Touch && PB.Touch.shown) PB.Touch.sync(match);
    render(dt);
    if (match.online && match.online.spec) {
      const g = ctx, h = cv().height, fs = Math.round(h * 0.03);
      g.font = `800 ${fs}px Segoe UI, sans-serif`; g.textAlign = 'left'; g.fillStyle = 'rgba(8,12,22,.75)'; const lbl = match.online.catching ? '👁 SPECTATING · catching up…' : '👁 SPECTATING';
      g.fillRect(12, 12, g.measureText(lbl).width + fs, fs * 1.7); g.fillStyle = '#7cc4ff'; g.fillText(lbl, 12 + fs / 2, 12 + fs * 1.2);
    } else if (match.online && match.meCi === 0 && match.over && !match._mendSent) { match._mendSent = true; if (PB.Net) PB.Net.toSpec({ k: 'mend' }); }
    if (match.over && !match._ended) { match._ended = true; showFinal(); }
    raf = requestAnimationFrame(frame);
  }

  // ---------- online lockstep ----------
  const BTNS = () => PB.Input.BTN;
  function encodeFrame(inp, acts) {
    const q = v => Math.round(v * 100);
    let hm = 0, pm = 0; BTNS().forEach((b, i) => { if (inp.held[b]) hm |= 1 << i; if (inp.pressed[b]) pm |= 1 << i; });
    return [q(inp.mx), q(inp.my), q(inp.rx), q(inp.ry), q(inp.rt), q(inp.lt), hm, pm, acts && acts.length ? acts : 0];
  }
  function decodeFrame(a) {
    const held = {}, pressed = {};
    BTNS().forEach((b, i) => { if (a[6] & (1 << i)) held[b] = true; if (a[7] & (1 << i)) pressed[b] = true; });
    return { mx: a[0] / 100, my: a[1] / 100, rx: a[2] / 100, ry: a[3] / 100, rt: a[4] / 100, lt: a[5] / 100, held, pressed, acts: a[8] || [] };
  }
  function queueAct(a) { if (match && match.online) match.online.acts.push(a); }
  function applyAct(s, a) {
    const N = match.online;
    switch (a[0]) {
      case 'P': N.paused = true; N.pauser = s; if (s !== match.meCi) PB.toast(match.teams[match.U[s].side].abbr + ' paused the game'); break;
      case 'R': N.paused = false; if (s !== match.meCi && paused) { UI._modalBack = null; UI.closeModal(); resume(); } break;
      case 'S': { const sd = match.gs(match.U[s].side), pl = sd.players[a[2]]; if (pl && a[1] >= 0 && a[1] < sd.court.length && sd.bench.includes(pl) && !pl.dq) match.forceSub(match.U[s].side, a[1], pl); break; }
      case 'T': if ((a[1] === 'off' && PB.OFF_STRATS[a[2]]) || (a[1] === 'def' && PB.DEF_STRATS[a[2]]) || (a[1] === 'foul' && ['auto', 'safe', 'ride'].includes(a[2])) || (a[1] === 'hack' && ['auto', 'on', 'off'].includes(a[2]))) match.gs(match.U[s].side).strat[a[1]] = a[2]; break;
      case 'A': { const sd = match.gs(match.U[s].side); sd.auto = !sd.auto; break; }
      case 'O': match.callTimeout(match.U[s].side); break;
    }
  }
  PB.Net && PB.Net.on('mi', d => {
    if (!match || !match.online) return;
    const N = match.online, r = 1 - match.meCi;
    for (const [t, a] of d.fr) if (!N.rcvd.has(t)) { N.rcvd.add(t); N.q[r].set(t, decodeFrame(a)); }
    while (N.rcvd.has(N.nextRecv)) N.nextRecv++;
    if (d.ack != null && d.ack > N.ackBy) { for (let t = N.ackBy + 1; t <= d.ack; t++) N.sent.delete(t); N.ackBy = d.ack; }
    if (d.cs) for (const k in d.cs) N.rcs[k] = d.cs[k];
  });
  PB.Net && PB.Net.on('mleave', () => { if (match && match.online && !match.over && !match._ended) onlineLeft('Your opponent left the match.'); });
  PB.Net && PB.Net.on('peerLeft', () => { if (match && match.online && !match.over && !match._ended) onlineLeft('Your opponent disconnected.'); });
  PB.Net && PB.Net.on('disconnected', () => { if (match && match.online && !match.over && !match._ended) onlineLeft('Lost the connection.'); });
  function onlineLeft(msg) {
    const m = match, N = m.online; if (N.ended) return; N.ended = true;
    const cfg = N.cfg;
    stopGame(); UI.closeModal();
    PB.toast(msg + ' You win by forfeit.', 4000);
    const res = m.g.result(0), me = m.gi[m.me], other = m.gi[1 - m.me];
    if (res.score[me] <= res.score[other]) res.score[me] = res.score[other] + 1;
    res.winner = res.score[0] > res.score[1] ? 0 : 1;
    if (!m.g.qScores[0].length) res.q = [[res.score[0]], [res.score[1]]];
    m._ended = m._finished = true;
    cfg.onEnd && cfg.onEnd(res, m, true);
  }
  function onlineFrame(dt) {
    const m = match, N = m.online;
    let inp = null;
    if (!paused) {
      inp = inputState();
      if (startLatch && !inp.held.START) startLatch = false;
      if (inp.pressed.START && !startLatch) { pause(); queueAct(['P']); inp = null; }
    }
    if (inp) { N.lastInp = inp; for (const b in inp.pressed) if (inp.pressed[b]) N.pressedAcc[b] = true; } else N.lastInp = null;
    // generate local ticks at real time (a few ticks ahead of the simulation at most)
    N.acc += dt;
    while (N.acc >= TICK) {
      if (N.gen - N.sim >= N.D + 10) { N.acc = Math.min(N.acc, TICK * 2); break; }
      N.acc -= TICK;
      const li = N.lastInp;
      const f = encodeFrame(li ? { mx: li.mx, my: li.my, rx: li.rx, ry: li.ry, rt: li.rt, lt: li.lt, held: li.held, pressed: N.pressedAcc } : NEUTRAL, N.acts);
      N.acts = []; N.pressedAcc = {};
      const t = N.gen + N.D; N.gen++;
      N.q[m.meCi].set(t, decodeFrame(f)); N.out.push([t, f]); N.sent.set(t, f);
    }
    // frames go out as they are made; every quarter second the whole unacknowledged window is repeated, so anything sent before the
    // other side's match had started (or lost) still arrives. Acknowledgements ride along.
    N.nSend++;
    if (N.out.length || N.nSend % 15 === 0) {
      let fr = N.out;
      if (N.nSend % 15 === 0) { fr = []; for (let t = N.ackBy + 1; t < N.gen + N.D && fr.length < 150; t++) { const f = N.sent.get(t); if (f) fr.push([t, f]); } }
      const msg = { k: 'mi', fr, ack: N.nextRecv - 1 }; if (Object.keys(N.cs).length) { msg.cs = N.cs; N.cs = {}; } PB.Net.to(N.cfg.peer, msg); N.out = [];
    }
    // advance the shared simulation whenever both players' input for the next tick is here
    let n = 0, moved = false;
    while (n < 8 && !m.over && N.q[0].has(N.sim) && N.q[1].has(N.sim)) {
      const f0 = N.q[0].get(N.sim), f1 = N.q[1].get(N.sim);
      N.q[0].delete(N.sim); N.q[1].delete(N.sim);
      for (let s = 0; s < 2; s++) for (const a of (s === 0 ? f0 : f1).acts) applyAct(s, a);
      if (!N.paused) m.update(TICK, f0, f1);
      N.sim++; n++; moved = true;
      if (N.sim % 120 === 0) {
        const cs = Math.round(m.t * 1000) + ':' + m.g.score[0] + '-' + m.g.score[1] + ':' + Math.round(m.ball.x * 100) + ',' + Math.round(m.ball.y * 100) + ':' + Math.round(m.bodies[0][0].x * 100);
        N.cs[N.sim] = cs; (N.hist || (N.hist = {}))[N.sim] = cs; if (N.rcs[N.sim] != null && N.rcs[N.sim] !== cs && !N.warned) { N.warned = true; PB.toast('The two games went out of sync — results may differ', 5000); console.warn('desync', N.sim, cs, N.rcs[N.sim]); }
        if (N.rcs[N.sim] != null) delete N.rcs[N.sim];
      }
    }
    N.stallT = moved || N.paused ? 0 : N.stallT + dt;
  }

  // ---------- pause menu ----------
  // pause-menu controls view: both keyboard and controller bindings, remappable mid-match
  const PADN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L-Stick', 'R-Stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide'];
  const CTRL_ROWS = [['A', 'Pass', 'Switch player'], ['B', 'Bounce pass', 'Take charge'], ['X', 'Shoot (hold, release at the top)', 'Steal · hold = hand in the shooter\'s face'], ['Y', 'Lob / alley-oop to a cutter', 'Block / rebound'],
    ['RB', 'Icon pass (+ A/B/X/Y)', 'Next defender · hold = deny the pass'], ['LB', 'Call screen', 'Change defense'], ['LT', 'Post up, then right stick: toward the rim = drop step, sideways = hook/spin, back = fadeaway', 'Defensive stance · hold on a rebound = box out'], ['RT', 'Sprint', 'Sprint'], ['START', 'Pause (timeouts here)', 'Pause']];
  function controlsView() {
    const I = PB.Input;
    const kb = a => (I.keyMap[a] || []).map(I.keyLabel).join(' / ') || '—';
    return `<div class="row between"><h2 style="margin:0">Controls</h2><button data-act="pauseView" data-v="main" autofocus>Back</button></div>
      <table class="t" style="margin-top:8px"><thead><tr><th>Button</th><th>Offense</th><th>Defense</th><th>Keyboard</th><th>Controller</th></tr></thead><tbody>
      ${CTRL_ROWS.map(([a, o, d]) => `<tr><td><b>${a}</b></td><td>${o}</td><td>${d}</td>
        <td><button class="small" data-act="gRebindKey" data-a="${a}">${esc(kb(a))}</button></td>
        <td><button class="small" data-act="gRebindPad" data-a="${a}">${PADN[I.padMap[a]] || 'Button ' + I.padMap[a]}</button></td></tr>`).join('')}
      <tr><td><b>Move</b></td><td colspan="2">Move player</td><td>W A S D</td><td>Left stick</td></tr>
      <tr><td><b>Moves</b></td><td>Dribble moves (toward the rim near the basket = euro step)</td><td>Help position</td><td>Arrow keys</td><td>Right stick</td></tr>
      </tbody></table>
      <div class="row" style="margin-top:10px"><button class="small" data-act="gResetControls">Reset to defaults</button></div>`;
  }
  A.pauseView = (el, d) => { UI._pauseView = d.v; pause(); };
  A.gRebindKey = (el, d) => { el.textContent = 'press a key…'; PB.Input.rebind = { kind: 'key', action: d.a, cb: () => pause() }; };
  A.gRebindPad = (el, d) => { PB.Input._rbWait = true; el.textContent = 'press a button…'; PB.Input.rebind = { kind: 'pad', action: d.a, cb: () => pause() }; };
  A.gResetControls = () => { PB.Input.resetConfig(); pause(); };

  function pause() {
    paused = true; PB.Input.mode = 'menu';
    if (UI._pauseView === 'controls') {
      // B/Esc goes back to the pause menu; Start resumes the game
      UI.modal(controlsView(), { onClose: () => { UI._pauseView = 'main'; setTimeout(pause, 0); } });
      UI.onStart = () => { UI._modalBack = null; UI.closeModal(); resume(); };
      return;
    }
    if (UI._pauseView === 'clips') {
      UI.modal(`<div class="row between"><h2 style="margin:0">Highlights</h2><button data-act="pauseView" data-v="main" autofocus>Back</button></div><div class="col" style="margin-top:8px">${match.highlights.map((c, i) => `<div class="row between"><span><b>${esc(c.label)}</b> <span class="dim">Q${c.q} ${c.clock}</span></span><button class="small primary" data-act="watchClip" data-i="${i}">Watch</button></div>`).reverse().join('') || '<div class="dim">No highlights yet.</div>'}</div>`, { onClose: () => { UI._pauseView = 'main'; setTimeout(pause, 0); } });
      UI.onStart = () => { UI._modalBack = null; UI.closeModal(); resume(); };
      return;
    }
    const sd = match.gs(match.me);
    const lead0 = match.g.score[match.gi[match.me]] - match.g.score[1 - match.gi[match.me]];
    const foulSev = pl => PB.Rules.trouble(pl.st.pf, match.q, match.clock, lead0);
    const pfStyle = pl => pl.st.pf >= 5 ? 'color:#ff5a5f;font-weight:800' : foulSev(pl) ? 'color:#ffb02e;font-weight:700' : '';
    const showO = PB.settings.showOverall;
    const on = !!match.online;
    const rows = list => list.map(pl => `<div class="slot fill ${UI._subSel && UI._subSel.pl === pl ? 'sel' : ''}" tabindex="0" data-act="subPick" data-id="${pl.id}"><span class="pos p${pl.slot != null ? pl.slot : 2}" style="min-width:30px">${pl.slot != null ? PB.POS[pl.slot] : 'BN'}</span>${UI.spr(pl.mon, 34)}<div class="grow"><b>${esc(pl.mon.dispName)}</b> <span class="dim" style="font-size:11px">${pl.st.pts} pts · <span style="${pfStyle(pl)}">${pl.st.pf} PF</span> · ${Math.round(pl.st.sec / 60)}m</span> <span class="tag" style="font-size:10px" title="${esc(PB.Abil.describe(pl.id).desc)}">⚡ ${esc(PB.Abil.describe(pl.id).badge)}</span>${foulSev(pl) ? ' <span class="tag bad" style="font-size:10px">foul trouble</span>' : ''}<div class="meter" style="height:6px;margin-top:3px"><i style="width:${Math.round(pl.en)}%"></i></div></div>${pl.dq ? '<span class="tag bad">OUT</span>' : ''}${showO ? `<b>${pl.mon.ovr}</b>` : ''}</div>`).join('');
    UI.modal(`<h2>${esc(match.teams[0].abbr)} ${match.sc(0)} – ${match.sc(1)} ${esc(match.teams[1].abbr)}</h2>${on ? '<div class="dim" style="margin-bottom:6px">Online match — the game is paused for both players.</div>' : ''}
      <div class="row wrap"><button class="gold" data-act="resumeGame" autofocus>Resume</button><button data-act="toggleAutoSub">${sd.auto ? 'Auto-subs: ON' : 'Auto-subs: OFF'}</button><button data-act="toggleBadges">Badge pop-ups: ${PB.settings.showBadges === false ? 'OFF' : 'ON'}</button><button data-act="cycleGfx">Graphics: ${({ high: 'High', medium: 'Medium', low: 'Low' })[PB.settings.gfx || 'high']}</button><button data-act="toggleCam">Camera: ${PB.settings.camera === 'broadcast' ? 'Broadcast' : '2K'}</button><button data-act="pauseView" data-v="controls">Controls</button>${match.mode3 ? '' : `<button data-act="callTimeout" ${match.timeouts[match.me] > 0 ? '' : 'disabled'}>Timeout (${match.timeouts[match.me]})</button>`}<button data-act="pauseView" data-v="clips" ${match.highlights.length ? '' : 'disabled'}>Replays (${match.highlights.length})</button><button data-act="cycleMeter">Meter: ${UI.meterSkins[PB.settings.meterSkin || 'bar']}</button>${on ? '' : '<button data-act="autoFinish">Sim to end</button>'}<button data-act="quitGame">${on ? 'Leave match' : match.mode === 'practice' ? 'End practice' : 'Forfeit'}</button></div>
      <div class="row wrap" style="margin:8px 0"><label>Offense <select data-change="gSetStrat" data-k="off">${Object.entries(PB.OFF_STRATS).map(([k, v]) => `<option value="${k}" ${sd.strat.off === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Defense <select data-change="gSetStrat" data-k="def">${Object.entries(PB.DEF_STRATS).map(([k, v]) => `<option value="${k}" ${sd.strat.def === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button data-act="gAutoStrat" title="Tests every offense and defense against the league and picks the best">Auto strategy</button>
      <label title="What a player with too many fouls does: play it safe (fewer fouls, softer defense), or keep playing hard and risk fouling out">Foul trouble <select data-change="gSetStrat" data-k="foul">${[['auto', 'Play it safe when in trouble'], ['safe', 'Play it safe from 3 fouls'], ['ride', 'Ride them hard (risk fouling out)']].map(([k, v]) => `<option value="${k}" ${(sd.strat.foul || 'auto') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label title="Foul the ball handler to stop the clock when you are behind late in the game">Late-game fouling <select data-change="gSetStrat" data-k="hack">${[['auto', 'Off'], ['on', 'Foul when behind late']].map(([k, v]) => `<option value="${k}" ${(sd.strat.hack || 'auto') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
      <div class="layout2" style="--side:1fr"><div><h3>On court</h3><div class="slots">${rows(sd.court)}</div></div><div><h3>Bench</h3><div class="slots">${rows(sd.bench)}</div></div></div>
`, { onClose: resume });
    UI.onStart = () => UI.closeModal();
    UI._subSel = null;
  }
  // closing the pause menu any way (button, B/Esc, Start) resumes play
  function resume() {
    if (!paused || !match || match.over) return;
    if (match.online) queueAct(['R']);
    paused = false; PB.Input.mode = 'game'; last = performance.now(); UI.onStart = null; startLatch = true; UI._pauseView = 'main';
  }
  A.resumeGame = () => { UI.closeModal(); resume(); };
  A.callTimeout = () => {
    if (match.online) { queueAct(['O']); UI.closeModal(); return; }
    if (match.callTimeout(match.me)) { UI.closeModal(); } else PB.toast('You can only call a timeout with the ball, or on a dead ball.', 3000);
  };
  A.cycleMeter = () => { const k = Object.keys(UI.meterSkins), i = k.indexOf(PB.settings.meterSkin || 'bar'); PB.settings.meterSkin = k[(i + 1) % k.length]; PB.Save.settingsSave(PB.settings); pause(); };
  A.toggleAutoSub = () => { if (match.online) { queueAct(['A']); setTimeout(() => { if (paused) pause(); }, 260); return; } const sd = match.gs(0); sd.auto = !sd.auto; pause(); };
  A.cycleGfx = () => { const o = ['high', 'medium', 'low'], c = PB.settings.gfx || 'high'; PB.settings.gfx = o[(o.indexOf(c) + 1) % 3]; PB.Save.settingsSave(PB.settings); pause(); };
  A.toggleCam = () => { PB.settings.camera = PB.settings.camera === 'broadcast' ? 'behind' : 'broadcast'; PB.Save.settingsSave(PB.settings); cam.init = false; pause(); };
  A.gSetStrat = (el, d) => { if (match.online) queueAct(['T', d.k, el.value]); else match.gs(0).strat[d.k] = el.value; };
  A.gAutoStrat = () => {
    const sd = match.gs(match.me), G = PB.G; if (!G || !PB.AutoStrat) return;
    PB.AutoStrat.open(sd.team, G.teams.filter(t => t !== sd.team && t.id !== sd.team.id).map(t => PB.activeTeam ? PB.activeTeam(G, t) : t), {
      apply: best => { if (match.online) { queueAct(['T', 'off', best.off]); queueAct(['T', 'def', best.def]); } else { sd.strat.off = best.off; sd.strat.def = best.def; } },
      back: () => { setTimeout(() => { if (match && !match.over && !UI.modalOpen()) pause(); }, match.online ? 300 : 0); },
    });
  };
  A.toggleBadges = () => { PB.settings.showBadges = PB.settings.showBadges === false; PB.Save.settingsSave(PB.settings); pause(); };
  A.subPick = (el, d) => {
    const sd = match.gs(match.me); const pl = sd.players[d.id];
    const sel = UI._subSel;
    if (!sel) { UI._subSel = { pl }; el.classList.add('sel'); return; }
    if (sel.pl === pl) { UI._subSel = null; el.classList.remove('sel'); return; }
    const a = sel.pl, b = pl;
    const court = sd.court.includes(a) ? a : sd.court.includes(b) ? b : null, bench = sd.bench.includes(a) ? a : sd.bench.includes(b) ? b : null;
    if (court && bench) {
      if (bench.dq) { PB.toast('Fouled out'); UI._subSel = null; return; }
      if (match.online) { queueAct(['S', sd.court.indexOf(court), bench.id]); UI._subSel = null; setTimeout(() => { if (paused) pause(); }, 260); return; }
      match.forceSub(0, sd.court.indexOf(court), bench);
      UI._subSel = null; pause();
    } else UI._subSel = { pl };
  };
  A.autoFinish = () => {
    UI.closeModal();
    match.auto = true; match.ctrl = null; paused = false; PB.Input.mode = 'game';
    for (let i = 0; i < 400000 && !match.over; i++) match.update(1 / 30, null);
  };
  A.quitGame = () => {
    if (match.mode === 'practice') return doQuit();
    UI.confirm(match.online ? 'Leave this online match? You forfeit.' : 'Forfeit this game? It counts as a loss.', doQuit, { yesLabel: match.online ? 'Leave' : 'Forfeit', onNo: () => { if (match && !match.over) pause(); } });
  };
  function doQuit() {
    UI.closeModal();
    const m = match;
    if (m.custom && m.custom.onEnd && !m.online) {
      stopGame(); m._ended = m._finished = true;
      const res = m.g.result(0), ui = m.gi[0];
      if (m.mode === 'practice') { m.custom.onEnd(null, m, true); return; }
      if (res.score[ui] >= res.score[1 - ui]) res.score[1 - ui] = res.score[ui] + 1;
      res.winner = res.score[0] > res.score[1] ? 0 : 1;
      if (!m.g.qScores[0].length) res.q = [[res.score[0]], [res.score[1]]];
      m.custom.onEnd(res, m, true);
      return;
    }
    if (m.online) {
      const N = m.online, cfg = N.cfg; N.ended = true;
      PB.Net.to(cfg.peer, { k: 'mleave' });
      stopGame();
      const res = m.g.result(0), me = m.gi[m.me], other = m.gi[1 - m.me];
      if (res.score[me] >= res.score[other]) res.score[other] = res.score[me] + 1;
      res.winner = res.score[0] > res.score[1] ? 0 : 1;
      if (!m.g.qScores[0].length) res.q = [[res.score[0]], [res.score[1]]];
      m._ended = m._finished = true;
      cfg.onEnd && cfg.onEnd(res, m, true);
      return;
    }
    stopGame();
    if (m.exhibition) { UI.go('menu', {}, true); return; }
    const res = m.g.result(0);
    const ui = m.gi[0];
    if (res.score[ui] >= res.score[1 - ui]) res.score[1 - ui] = res.score[ui] + 1;
    res.winner = res.score[0] > res.score[1] ? 0 : 1;
    if (!m.g.qScores[0].length) res.q = [[res.score[0]], [res.score[1]]];
    UI.finishPlayed(PB.G, m.ugame, res);
  };

  // ---------- final ----------
  function showFinal() {
    const m = match, res = m.resultObj, ui = m.gi[m.me];
    if (m.online && m.online.spec) {
      paused = true; PB.Input.mode = 'menu';
      UI.modal(`<div class="center"><h2>Final</h2><div style="font-size:30px;font-weight:800">${esc(m.teams[0].abbr)} ${m.sc(0)} – ${m.sc(1)} ${esc(m.teams[1].abbr)}${m.ot ? ' (OT)' : ''}</div><div class="row center" style="margin-top:14px"><button class="gold" data-act="finishGame" autofocus>Close</button></div></div>`, { onClose: () => A.finishGame() });
      return;
    }
    const won = res.score[ui] > res.score[1 - ui];
    paused = true; PB.Input.mode = 'menu';
    UI.modal(`<div class="center"><h2 class="${won ? 'good' : 'bad'}">${won ? 'WIN' : 'LOSS'}</h2>
      <div style="font-size:30px;font-weight:800">${esc(m.teams[0].abbr)} ${m.sc(0)} – ${m.sc(1)} ${esc(m.teams[1].abbr)}${m.ot ? ' (OT)' : ''}</div>
      <div class="row center" style="margin-top:14px"><button class="gold" data-act="finishGame" autofocus>Continue</button></div></div>`, { onClose: () => A.finishGame() });
  }
  A.finishGame = () => {
    const m = match;
    if (!m || m._finished) return; m._finished = true;
    UI.closeModal(); stopGame();
    const G = PB.G;
    if (m.online) { m.online.ended = true; m.online.cfg.onEnd && m.online.cfg.onEnd(m.resultObj, m, false); return; }
    if (m.custom && m.custom.onEnd) { m.custom.onEnd(m.resultObj, m, false); return; }
    if (m.exhibition) {
      UI.go('menu', {}, true);
      const res = m.resultObj;
      const b = { day: 0, h: m.userHome ? m.teams[0].id : m.teams[1].id, a: m.userHome ? m.teams[1].id : m.teams[0].id, sc: res.score, q: res.q, ot: res.ot, shots: res.shots, box: [0, 1].map(s => { const o = {}; for (const id in res.box[s]) { const x = res.box[s][id]; if (x.sec > 0) o[id] = PB.STAT_KEYS.map(k => x[k]); } return o; }) };
      UI.boxModal(b);
    } else UI.finishPlayed(G, m.ugame, m.resultObj);
  };

  // ---------- rendering ----------
  let frameDt = 1 / 60;
  function render(dt) {
    frameDt = paused ? 0 : Math.min(0.05, dt || 1 / 60) * (match ? match.speed : 1);
    const c = cv(), g = ctx, m = match;
    const w = c.width, h = c.height;
    updateCamera(w, h, dt || 1 / 60);
    const home = m.teams[m.userHome ? 0 : 1];
    const homeCol = PB.teamColors(home);
    drawArena(g, m, w, h, home, homeCol);
    // floor
    if (polyPath(g, [[0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0]])) {
      const p0 = proj(47, 25, 0) || [w / 2, h / 2];
      const fl = g.createRadialGradient(p0[0], p0[1], 10, p0[0], p0[1], w * 0.9);
      fl.addColorStop(0, '#e6b277'); fl.addColorStop(0.6, '#d29a5c'); fl.addColorStop(1, '#a8723f');
      g.fillStyle = fl; g.fill();
    }
    // planks
    if ((PB.settings.gfx || 'high') === 'high') for (let y = 1.5; y < H; y += 1.5) strokeLine(g, [[0, y, .01], [W, y, .01]], 'rgba(110,60,25,.16)', 0.06);
    // paint + center circle
    for (const left of [true, false]) {
      const X = x => left ? x : W - x;
      fillPoly(g, [[X(0), 17, .01], [X(19), 17, .01], [X(19), 33, .01], [X(0), 33, .01]], homeCol[2] || homeCol[0]);
    }
    fillPoly(g, arc(47, 25, 6, 0, Math.PI * 2, 40), homeCol[2] || homeCol[0]);
    // center logo text (affine-mapped onto the floor)
    {
      const o = proj(47, 25, 0), ex = proj(47 + cam.right[0], 25 + cam.right[1], 0), ey = proj(47 - cam.fwd[0], 25 - cam.fwd[1], 0);
      if (o && ex && ey) {
        g.save(); g.setTransform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
        PB.Logo.canvas(g, home, 0, 0, 8, true); g.restore();
      }
    }
    for (const l of LINES) strokeLine(g, l.p, 'rgba(255,255,255,.92)', 0.17, l.closed);
    // shadows + floor rings (drawn before bodies)
    const items = [];
    for (let s = 0; s < 2; s++) for (const b of m.bodies[s]) {
      const p = proj(b.x, b.y, 0); if (!p) continue;
      items.push({ d: p[2], kind: 'body', b, p });
      const sh = arc(b.x, b.y, Math.max(0.9, b.r * 0.6) * (1 - b.z * 0.05), 0, Math.PI * 2, 14, 0.02);
      fillPoly(g, sh, 'rgba(0,0,0,.33)');
      const mine = m.isMine(b), partner = b.ctl && !mine && b.s === m.me && !m.online ? true : false;
      const col = mine ? '#ffd23f' : partner ? '#4aa3ff' : sideCols(m)[b.s][0];
      strokeLine(g, arc(b.x, b.y, Math.max(1.0, b.r * 0.72), 0, Math.PI * 2, 18, 0.03), col, b.ctl ? 0.32 : 0.16, true);
    }
    const ball = m.ball;
    fillPoly(g, arc(ball.x, ball.y, 0.6, 0, Math.PI * 2, 10, 0.02), 'rgba(0,0,0,.3)');
    const bp = proj(ball.x, ball.y, ball.z);
    if (bp) items.push({ d: bp[2] - 0.3, kind: 'ball', p: bp });
    // the hoop sorts by where its backboard stands on the floor, not by the rim's height: a player in front of the board draws over it, one behind it draws under
    for (const bx of [5.25, W - 5.25]) { const p = proj(bx < 47 ? 3.6 : W - 3.6, 25, 0); if (p) items.push({ d: p[2], kind: 'hoop', bx }); }
    courtsideItems(m, items);
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.kind === 'prop') it.draw(g);
      else if (it.kind === 'body') drawBody(g, it.b, it.p, m);
      else if (it.kind === 'ball') drawBall(g, it.p);
      else drawHoop(g, it.bx, m);
    }
    overlays(g, m, w, h);
    scoreboard(g, m, w, h);
  }

  function drawHoop(g, bx, m) {
    // the hoop nearest the camera fades so it never hides the inbounder / play under it
    const hp = proj(bx, 25, 10);
    g.save(); if (hp && hp[2] < 36) g.globalAlpha = 0.25 + 0.75 * PB.clamp((hp[2] - 16) / 20, 0, 1);
    drawHoopInner(g, bx, m);
    g.restore();
  }
  function drawHoopInner(g, bx, m) {
    const left = bx < 47, s = left ? 1 : -1;
    const bb = left ? 4 : W - 4, base = left ? -3.5 : W + 3.5;
    // stanchion
    fillPoly(g, [[base - 1.2, 23.8, 0], [base + 1.2, 23.8, 0], [base + 1.2, 26.2, 0], [base - 1.2, 26.2, 0]], '#1a2233');
    strokeLine(g, [[base, 25, 0], [base, 25, 12.5], [bb - s * 0.2, 25, 12.5]], '#2c3a55', 0.45);
    strokeLine(g, [[base, 25, 5], [bb - s * 0.4, 25, 10.4]], '#2c3a55', 0.3);
    // backboard
    fillPoly(g, [[bb, 22, 9], [bb, 28, 9], [bb, 28, 12.5], [bb, 22, 12.5]], 'rgba(220,235,255,.35)');
    strokeLine(g, [[bb, 22, 9], [bb, 28, 9], [bb, 28, 12.5], [bb, 22, 12.5]], '#f4f7ff', 0.12, true);
    strokeLine(g, [[bb, 24, 10], [bb, 26, 10], [bb, 26, 11.5], [bb, 24, 11.5]], '#ff4d4d', 0.09, true);
    // net (sways after a make)
    // (in a replay the sway age comes from the recorded frame, since the replay clock jumps around)
    const age = m.replay ? m._rnt : (m._netT != null ? m.t - m._netT : -1), nb = m.replay ? m._rnb : m._netBx;
    const sway = age >= 0 && age < 0.6 && nb === bx ? Math.sin(age * 30) * 0.15 * (1 - age / 0.6) : 0;
    const top = arc(bx, 25, 0.75, 0, Math.PI * 2, 12, 10), bot = arc(bx + sway, 25, 0.42, 0, Math.PI * 2, 12, 8.4 + sway);
    for (let i = 0; i < 12; i++) strokeLine(g, [top[i], bot[(i + 1) % 12]], 'rgba(255,255,255,.75)', 0.04);
    strokeLine(g, bot, 'rgba(255,255,255,.7)', 0.04, true);
    strokeLine(g, [[bb, 25, 10], [bx - s * 0.75, 25, 10]], '#ff7a1a', 0.12);
    strokeLine(g, top, '#ff7a1a', 0.14, true);
  }

  function bodyFt(b) { return 4.2 + 4.0 * b.mon.r.sH; }
  function drawBody(g, b, pf, m) {
    const hFt = bodyFt(b);
    const p = proj(b.x, b.y, b.z) || pf;
    const sz = hFt * cam.F / p[2];
    // facing: screen-space horizontal velocity
    const sv = b.vx * cam.right[0] + b.vy * cam.right[1];
    // facing flips only after a sustained sideways run (no flicker); lean is smoothed
    const want = sv > 2.5 ? -1 : sv < -2.5 ? 1 : 0;      // front sprites face left by default
    if (want && want !== b._sf) { b._sfT = (b._sfT || 0) + 1 / 60; if (b._sfT > 0.12 || b._sf == null) { b._sf = want; b._sfT = 0; } } else b._sfT = 0;
    b._lean = (b._lean || 0) + (PB.clamp(-sv / 70, -0.14, 0.14) - (b._lean || 0)) * 0.15;
    const sp = Math.hypot(b.vx, b.vy);
    // step bounce: phase is accumulated per body (frequency follows speed) so speed changes never jump the phase
    if (b._bobPh == null) b._bobPh = b.slot;
    // fatigue (0 fresh .. 1 spent) shows in the body: slower, heavier steps, a slight stoop, and sweat when badly tired
    const en = b.pl && !m.replay ? b.pl.en : 100, tired = PB.clamp((70 - en) / 50, 0, 1);
    b._bobPh += frameDt * (7 + sp * 0.45) * (1 - 0.3 * tired);
    b._bobAmp = (b._bobAmp || 0) + (Math.min(1, sp / 9) - (b._bobAmp || 0)) * Math.min(1, frameDt * 6);
    const bob = Math.abs(Math.sin(b._bobPh)) * b._bobAmp * sz * 0.045 * (1 + 0.5 * tired);
    g.save();
    g.translate(p[0], p[1] - bob);
    // lean into the run (momentum)
    g.rotate(b._lean);
    if (b.jump) g.scale(1, 1 + Math.min(0.12, b.z * 0.03));
    else if (tired > 0) { g.scale(1, 1 - 0.04 * tired); g.rotate(0.05 * tired * ((b._sf || 1) < 0 ? 1 : -1)); }
    if (tired > 0.4) g.globalAlpha = 1 - 0.18 * tired;
    if ((b._sf || 1) < 0) g.scale(-1, 1);
    if (!drawSprite(g, b.mon, 0, 0, sz * 0.82, false)) { g.fillStyle = PB.TYPE_COLORS[b.mon.types[0]]; g.beginPath(); g.arc(0, -sz / 2, sz / 3, 0, Math.PI * 2); g.fill(); }
    g.restore();
    if (en < 40 && PB.settings.gfx !== 'low') {                                  // sweat drops running down
      g.fillStyle = '#9fd8ff';
      for (let k = 0; k < 3; k++) { const ph = ((m.t * 1.4 + k / 3 + (b.slot || 0) * 0.17) % 1), a = 1 - ph; g.globalAlpha = a * 0.9; g.beginPath(); g.arc(p[0] + (k - 1) * sz * 0.11, p[1] - sz * 0.74 + ph * sz * 0.22 - bob, Math.max(1.2, sz * 0.018), 0, Math.PI * 2); g.fill(); }
      g.globalAlpha = 1;
    }
    // labels
    const fs = Math.max(11, Math.min(18, sz * 0.13));
    const mineCtl = m.isMine(b), partnerCtl = b.ctl && !mineCtl && b.s === m.me;
    if (mineCtl || partnerCtl || m.ball.holder === b || (b.ctl && m.online)) {
      g.font = `800 ${fs}px Segoe UI, sans-serif`; g.textAlign = 'center';
      const ty = p[1] - sz * 0.86 - bob;
      if (mineCtl || partnerCtl) { g.fillStyle = mineCtl ? '#ffd23f' : '#4aa3ff'; g.beginPath(); g.moveTo(p[0] - fs * 0.45, ty - fs * 1.35); g.lineTo(p[0] + fs * 0.45, ty - fs * 1.35); g.lineTo(p[0], ty - fs * 0.75); g.closePath(); g.fill(); }
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(b.mon.dispName, p[0], ty - fs * 1.6);
      g.fillStyle = mineCtl ? '#ffd23f' : partnerCtl ? '#7cc4ff' : '#fff'; g.fillText(b.mon.dispName, p[0], ty - fs * 1.6);
      if ((mineCtl || partnerCtl) && PB.settings.showBadges !== false) { g.font = `700 ${Math.round(fs * 0.72)}px Segoe UI, sans-serif`; g.lineWidth = 3; g.strokeText('⚡ ' + PB.Abil.describe(b.mon.id).badge, p[0], ty - fs * 0.62 + 0); g.fillStyle = '#ffe27a'; g.fillText('⚡ ' + PB.Abil.describe(b.mon.id).badge, p[0], ty - fs * 0.62); }
    }
    { const hot = b.pl.hot || 0; if (hot > 0.55 || hot < -0.55) { g.font = `${Math.max(12, sz * 0.14)}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.fillText(hot > 0 ? '🔥' : '❄️', p[0] + sz * 0.28, p[1] - sz * 0.78 - bob); } }
    { const pf = b.pl.st.pf; if (pf >= (b.s === m.me ? 2 : 4)) { g.font = `800 ${Math.max(10, sz * 0.11)}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.fillStyle = pf >= 5 ? '#ff5a5f' : pf >= 4 ? '#ffb02e' : '#e8ecf5'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; const ly = p[1] + sz * 0.2 + 14; g.strokeText(pf + ' PF', p[0], ly); g.fillText(pf + ' PF', p[0], ly); } }
    // stamina pip for user's team
    if (b.s === m.me) {
      const en = b.pl.en / 100, bw = Math.max(20, sz * 0.38), bh = Math.max(3, sz * 0.03);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(p[0] - bw / 2, p[1] + 4, bw, bh);
      const lowE = en < 0.3, pulse = lowE ? 0.55 + 0.45 * Math.abs(Math.sin(m.t * 6)) : 1;
      g.globalAlpha = pulse; g.fillStyle = en > 0.55 ? '#2fd47a' : en > 0.3 ? '#ffcb05' : '#ff5a5f'; g.fillRect(p[0] - bw / 2, p[1] + 4, bw * en, bh); g.globalAlpha = 1;
      if (lowE && (b.ctl || en < 0.18)) { g.font = `800 ${Math.max(9, sz * 0.095)}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.fillStyle = '#ff5a5f'; g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText('TIRED', p[0], p[1] + 4 + bh + Math.max(10, sz * 0.1)); g.fillText('TIRED', p[0], p[1] + 4 + bh + Math.max(10, sz * 0.1)); }
    }
    b._scr = { x: p[0], y: p[1] - sz * 0.82, sz };
  }
  function drawBall(g, p) {
    const r = Math.max(3, 0.62 * cam.F / p[2]);
    const gr = g.createRadialGradient(p[0] - r * 0.35, p[1] - r * 0.35, r * 0.15, p[0], p[1], r);
    gr.addColorStop(0, '#ffb36b'); gr.addColorStop(1, '#b8510a');
    g.fillStyle = gr; g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,15,0,.85)'; g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.moveTo(p[0] - r, p[1]); g.lineTo(p[0] + r, p[1]); g.moveTo(p[0], p[1] - r); g.quadraticCurveTo(p[0] + r * 0.6, p[1], p[0], p[1] + r); g.stroke();
  }

  function overlays(g, m, w, h) {
    // shot meter (vertical, beside the shooter)
    const mb = m.meter ? m.meter.body : (m.ft && m.ft.state === 'meter' ? m.ft.shooter : null);
    const mv = m.meter ? m.meter.v : (m.ft && m.ft.state === 'meter' ? m.ft.meterV : 0);
    if (mb && m.shotMeterOn && mb._scr && (!m.online || mb.s === m.me)) drawMeter(g, mb, mv, m.meterWindows(mb, !!m.ft));
    // timing feedback
    if (m.feedback && m.t - m.feedback.t < 1.0 && m.feedback.b && m.feedback.b._scr) {
      const fb = m.feedback, s = fb.b._scr;
      g.globalAlpha = 1 - (m.t - fb.t);
      g.font = `900 ${Math.max(14, s.sz * 0.16)}px Segoe UI, sans-serif`; g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(fb.text, s.x, s.y - s.sz * 0.25 - (m.t - fb.t) * 30);
      g.fillStyle = fb.col; g.fillText(fb.text, s.x, s.y - s.sz * 0.25 - (m.t - fb.t) * 30);
      g.globalAlpha = 1;
    }
    if (PB.Net && PB.Net.lost && m.online) { const fs = Math.round(h * 0.035); g.font = `800 ${fs}px Segoe UI, sans-serif`; g.textAlign = 'center'; g.fillStyle = 'rgba(120,20,30,.85)'; const t = 'Connection lost. Waiting for the other player…', tw = g.measureText(t).width + fs * 2; g.fillRect(w / 2 - tw / 2, h * 0.12, tw, fs * 1.8); g.fillStyle = '#fff'; g.fillText(t, w / 2, h * 0.12 + fs * 1.3); }
    if (m.foulWarn && !m.replay && m.t - m.foulWarn.t0 < 3.5) {
      const fw = m.foulWarn, fs = Math.round(h * 0.03), t = fw.txt + ' · pause to sub', age = m.t - fw.t0;
      g.globalAlpha = age < 0.2 ? age / 0.2 : age > 3 ? 1 - (age - 3) / 0.5 : 1;
      g.font = `800 ${fs}px Segoe UI, sans-serif`; g.textAlign = 'center'; const tw = g.measureText(t).width + fs * 2;
      g.fillStyle = fw.bad ? 'rgba(130,24,34,.9)' : 'rgba(110,70,10,.9)'; g.fillRect(w / 2 - tw / 2, h * 0.19, tw, fs * 1.8); g.fillStyle = '#fff'; g.fillText(t, w / 2, h * 0.19 + fs * 1.3); g.globalAlpha = 1;
    }
    // badge pop-ups: the ability that just changed a play rises above the player
    if (m.pops && !m.replay) {
      m.pops = m.pops.filter(q => m.t - q.t0 < 1.6);
      for (const q of m.pops) {
        const s = q.b._scr; if (!s) continue; const age = (m.t - q.t0) / 1.6, mine = q.b.s === m.me;
        const fs = Math.max(11, Math.min(20, s.sz * 0.14)), y = s.y - s.sz * 0.2 - age * s.sz * 0.35;
        g.globalAlpha = age < 0.12 ? age / 0.12 : age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
        g.font = `900 ${fs}px Segoe UI, sans-serif`; g.textAlign = 'center';
        const txt = (q.plain ? '' : '⚡ ') + q.txt, tw = g.measureText(txt).width + fs;
        g.fillStyle = mine ? 'rgba(60,45,0,.82)' : 'rgba(70,20,28,.82)'; g.beginPath(); g.roundRect ? g.roundRect(s.x - tw / 2, y - fs * 1.05, tw, fs * 1.5, fs * 0.5) : g.rect(s.x - tw / 2, y - fs * 1.05, tw, fs * 1.5); g.fill();
        g.lineWidth = 2; g.strokeStyle = mine ? '#ffcb05' : '#ff7a85'; g.stroke();
        g.fillStyle = mine ? '#ffe27a' : '#ffb3ba'; g.fillText(txt, s.x, y + fs * 0.1);
        g.globalAlpha = 1;
      }
    }
    // team energy strip (only once someone is tired)
    if (!m.replay && m.phase !== 'jump') {
      const mine = m.bodies[m.me].slice().sort((a, b) => a.slot - b.slot);
      if (mine.length && mine.some(b => b.pl.en < 55)) {
        const fs = Math.max(10, Math.round(h * 0.018)), bw = fs * 5.2, x0 = 12, y0 = h - 12 - mine.length * fs * 1.45 - fs * 1.6;
        g.fillStyle = 'rgba(8,12,22,.6)'; g.fillRect(x0 - 6, y0 - 4, bw + fs * 3.4, mine.length * fs * 1.45 + fs * 1.9);
        g.font = `800 ${Math.round(fs * 0.8)}px Segoe UI, sans-serif`; g.textAlign = 'left'; g.fillStyle = '#9aa7c2'; g.fillText('ENERGY', x0, y0 + fs * 0.8);
        mine.forEach((b, i) => { const y = y0 + fs * 1.5 + i * fs * 1.45, e = b.pl.en / 100; g.fillStyle = '#e8ecf5'; g.font = `700 ${Math.round(fs * 0.85)}px Segoe UI, sans-serif`; g.fillText(b.mon.dispName.slice(0, 6), x0, y + fs * 0.7); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x0 + fs * 3.4, y, bw - fs * 1.3, fs * 0.8); g.globalAlpha = e < 0.3 ? 0.55 + 0.45 * Math.abs(Math.sin(m.t * 6)) : 1; g.fillStyle = e > 0.55 ? '#2fd47a' : e > 0.3 ? '#ffcb05' : '#ff5a5f'; g.fillRect(x0 + fs * 3.4, y, (bw - fs * 1.3) * e, fs * 0.8); g.globalAlpha = 1; });
      }
    }
    // icon passing
    if (PB.Input.held('RB') && m.poss === m.me && m.ball.holder && m.ball.holder.s === m.me && m.onCtl(m.meCi, () => m.ctrl) === m.ball.holder) {
      for (const it of m.onCtl(m.meCi, () => m.iconTargets())) {
        const s = it.b._scr; if (!s) continue;
        const r = Math.max(12, s.sz * 0.12);
        g.fillStyle = { A: '#2fd47a', B: '#ff5a5f', X: '#4aa3ff', Y: '#ffcb05' }[it.key];
        g.beginPath(); g.arc(s.x, s.y - r * 1.6, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#111'; g.font = `900 ${r * 1.1}px Segoe UI`; g.textAlign = 'center'; g.fillText(it.key, s.x, s.y - r * 1.2);
      }
    }
    if (m.replayOffer && m.t < m.replayOffer.until && !m.replay && !m.online) {
      const fs2 = Math.round(h * 0.026); g.font = `800 ${fs2}px Segoe UI`; g.textAlign = 'right'; g.fillStyle = 'rgba(8,12,22,.75)';
      const tx = (PB.settings.touchControls ? 'Tap ⏪ for instant replay' : 'Press ' + (PB.Input.keyLabel((PB.Input.keyMap.BACK || ['Tab'])[0]) || 'Tab') + ' / View for instant replay') + ' — ' + m.replayOffer.clip.label;
      const tw2 = g.measureText(tx).width + fs2; g.fillRect(w - tw2 - 14, 14, tw2, fs2 * 1.7); g.fillStyle = '#ffd23f'; g.fillText(tx, w - 14 - fs2 / 2, 14 + fs2 * 1.15);
    }
    if (m.online) {
      const N = m.online, fs0 = Math.round(h * 0.03);
      if (N.paused || N.stallT > 0.7) {
        g.font = `800 ${fs0}px Segoe UI`; g.textAlign = 'center'; g.fillStyle = 'rgba(0,0,0,.6)'; const txt = N.paused ? 'PAUSED' : 'Waiting for your opponent…';
        const tw = g.measureText(txt).width + fs0;
        g.fillRect(w / 2 - tw / 2, h * 0.3 - fs0, tw, fs0 * 1.6); g.fillStyle = '#ffd23f'; g.fillText(txt, w / 2, h * 0.3);
      }
    }
    if (m.mode === 'practice') {
      const ps = m.pstat || { att: 0, green: 0, ok: 0, bad: 0, err: 0 }, u = m.gs(0).court[0], fs1 = Math.round(h * 0.022);
      const lines = ['PRACTICE', 'Shots ' + u.st.fga + ' · Made ' + u.st.fgm + (u.st.fga ? ' (' + Math.round(u.st.fgm / u.st.fga * 100) + '%)' : ''), 'Timing: ' + ps.green + ' green · ' + ps.ok + ' close · ' + ps.bad + ' off' + (ps.att ? ' · avg ' + (ps.err / ps.att * 100).toFixed(0) + '% off' : '')];
      g.font = `700 ${fs1}px Segoe UI`; g.textAlign = 'left';
      const tw = Math.max(...lines.map(l => g.measureText(l).width)) + fs1;
      g.fillStyle = 'rgba(8,12,22,.75)'; g.fillRect(14, 14, tw, fs1 * 1.5 * lines.length + 8);
      lines.forEach((l, i) => { g.fillStyle = i ? '#e8edf5' : '#ffd23f'; g.fillText(l, 14 + fs1 / 2, 14 + fs1 * 1.4 * (i + 1)); });
    }
    // free throw banner
    if (m.ft) {
      const fs = Math.round(h * 0.024);
      g.font = `800 ${fs}px Segoe UI`; g.textAlign = 'center'; g.fillStyle = '#fff';
      g.fillText('FREE THROW ' + (m.ft.i + 1) + ' OF ' + m.ft.n, w / 2, h * 0.24);
    }
  }

  // broadcast-style score bug
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function scoreboard(g, m, w, h) {
    const H0 = Math.round(Math.max(40, h * 0.06));
    const unit = H0;
    const teamW = unit * 3.0, clockW = unit * 2.6, scW = unit * 1.1;
    const total = teamW * 2 + clockW + scW;
    const x0 = (w - total) / 2, y0 = h - H0 - Math.max(30, h * 0.045);
    // drop shadow + base
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 18;
    rr(g, x0, y0, total, H0, 6); g.fillStyle = '#0c1220'; g.fill(); g.restore();
    // away first (left), then home
    const order = m.userHome ? [1, 0] : [0, 1];
    order.forEach((s, i) => {
      const t = m.teams[s], col = sideCols(m)[s];
      const x = x0 + i * teamW;
      const grd = g.createLinearGradient(0, y0, 0, y0 + H0); grd.addColorStop(0, col[0]); grd.addColorStop(1, shade(col[0], -0.35));
      g.save(); rr(g, x, y0, teamW, H0, i === 0 ? 6 : 0); g.clip();
      g.fillStyle = grd; g.fillRect(x, y0, teamW, H0);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x + teamW * 0.58, y0, teamW * 0.42, H0);
      g.restore();
      PB.Logo.canvas(g, t, x + unit * 0.4, y0 + H0 * 0.44, unit * 0.62, false);
      g.fillStyle = '#fff'; g.font = `900 ${unit * 0.36}px Segoe UI, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(t.abbr, x + unit * 0.78, y0 + H0 * 0.46);
      g.font = `900 ${unit * 0.58}px Segoe UI, sans-serif`; g.textAlign = 'center';
      g.fillText(String(m.sc(s)), x + teamW * 0.79, y0 + H0 * 0.52);
      // bonus / fouls strip
      const tf = m.teamFouls[s];
      for (let k = 0; k < 5; k++) { g.fillStyle = k < tf ? (tf >= 5 ? '#ff5a5f' : '#ffd23f') : 'rgba(255,255,255,.2)'; g.fillRect(x + unit * 0.24 + k * unit * 0.17, y0 + H0 * 0.8, unit * 0.12, Math.max(2, H0 * 0.06)); }
      if (tf >= 5) { g.font = `800 ${unit * 0.18}px Segoe UI`; g.textAlign = 'left'; g.fillStyle = '#ffd23f'; g.fillText('BONUS', x + unit * 1.15, y0 + H0 * 0.83); }
      // possession arrow
      if (m.poss === s && m.phase !== 'ft') { g.fillStyle = '#ffd23f'; const ax = x + teamW * 0.56, ay = y0 + H0 * 0.47; g.beginPath(); g.moveTo(ax - unit * 0.1, ay - unit * 0.1); g.lineTo(ax + unit * 0.02, ay); g.lineTo(ax - unit * 0.1, ay + unit * 0.1); g.closePath(); g.fill(); }
    });
    // clock block
    const cx = x0 + teamW * 2;
    g.fillStyle = '#16203a'; g.fillRect(cx, y0, clockW, H0);
    const qn = m.mode3 ? (m.mode === 'practice' ? 'PRAC' : '3v3') : m.q <= 4 ? ['1ST', '2ND', '3RD', '4TH'][m.q - 1] : 'OT' + (m.q > 5 ? m.q - 4 : '');
    const cl = Math.max(0, m.clock), mm = Math.floor(cl / 60), ss = Math.floor(cl - mm * 60);
    const clStr = m.mode3 ? (m.mode === 'practice' ? '' : 'TO ' + m.target) : cl < 60 ? cl.toFixed(1) : mm + ':' + String(ss).padStart(2, '0');
    g.fillStyle = '#9fb0d0'; g.font = `800 ${unit * 0.26}px Segoe UI`; g.textAlign = 'center';
    g.fillText(qn, cx + clockW * 0.22, y0 + H0 * 0.5);
    g.fillStyle = '#fff'; g.font = `800 ${unit * 0.46}px ui-monospace, Consolas, monospace`;
    g.fillText(clStr, cx + clockW * 0.64, y0 + H0 * 0.52);
    // shot clock
    const sx = cx + clockW;
    rr(g, sx, y0, scW, H0, 6); g.fillStyle = '#05080f'; g.fill();
    const sc = Math.max(0, m.shotClock);
    g.fillStyle = sc < 5 && m.phase === 'live' ? '#ff4d4d' : '#ffd23f'; g.font = `900 ${unit * 0.46}px ui-monospace, Consolas, monospace`;
    g.fillText(m.phase === 'ft' || m.mode === 'practice' ? '–' : String(Math.ceil(sc)), sx + scW / 2, y0 + H0 * 0.52);
    g.textBaseline = 'alphabetic';
    // top accent line
    g.fillStyle = '#ffd23f'; g.fillRect(x0 + 6, y0 - 3, total - 12, 3);
    // event ticker above the bug
    const ev = m.events.filter(e => !e.q).slice(-1)[0];
    if (ev && m.t - ev.t < 4) {
      g.font = `700 ${unit * 0.26}px Segoe UI`; g.textAlign = 'center';
      const tw = g.measureText(ev.txt).width + unit * 0.6;
      g.globalAlpha = Math.min(1, 4 - (m.t - ev.t));
      rr(g, w / 2 - tw / 2, y0 - unit * 0.62, tw, unit * 0.48, 4); g.fillStyle = 'rgba(12,18,32,.85)'; g.fill();
      g.fillStyle = '#e8edf5'; g.fillText(ev.txt, w / 2, y0 - unit * 0.28);
      g.globalAlpha = 1;
    }
  }
  function sideCols(m) {
    if (m._cols) return m._cols;
    const a = PB.teamColors(m.teams[0]), b = PB.teamColors(m.teams[1]).slice();
    if (hexDist(a[0], b[0]) < 140) { const alt = [b[1], '#3b82f6', '#2fd47a', '#f5f5f5'].find(c => hexDist(c, a[0]) >= 140 && c !== '#000000' && c !== '#ffffff') || '#f5f5f5'; b[0] = alt; }
    return (m._cols = [a, b]);
  }
  UI.screens.game = { game: true, render: () => '' };
})(window.PB);
