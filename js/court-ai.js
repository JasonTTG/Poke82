// AI for the playable engine: offense (spacing, cuts, screens, pick-and-roll, drives, passing), defense (man/zone/press,
// help, transition), rebounding and inbounds. All decisions use the same ratings/Rules as the simulation.
(function (PB) {
  const { clamp, Rules } = PB;
  const M = PB.Match;
  const { W, H, dist } = M.consts;
  const C = PB.Court;
  const ATTACK_X = C.ATTACK_X, DEFEND_X = C.DEFEND_X, DIR = C.DIR;
  const BODY_H = M.consts.BODY_H;
  const A = (s, x, y) => ({ x: s === 0 ? x : W - x, y });     // attack-frame -> world

  // ---- shot estimation (expected points) used for AI decisions -----------------------------------
  M.prototype.estimateShot = function (b, hypo) {
    const s = b.s, bx = ATTACK_X(s);
    const px = hypo ? hypo.x : b.x, py = hypo ? hypo.y : b.y;
    const d = Math.hypot(px - bx, py - 25);
    let type;
    if (d <= 7) type = 'rim'; else if (b.mon.r.pos1 >= 3 && d <= 14 && b.mon.tend.postRate > 0.35) type = 'post';
    else if (C.isThree(px, py, bx)) type = 'three'; else type = 'mid';
    const R = this.effR(b);
    const probe = { x: px, y: py, s, mon: b.mon, pl: b.pl, slot: b.slot };
    let dfd = null, dd = 99;
    for (const o of this.bodies[1 - s]) { const q = Math.hypot(o.x - px, o.y - py); if (q < dd) { dd = q; dfd = o; } }
    const c = clamp(1 - (dd - 1.2) / 5.5, 0, 1) * 0.9;
    const Dr = dfd ? this.effR(dfd) : { perD: 56, intD: 58, strength: 55 };
    const D2 = { perD: 56 + (Dr.perD - 56) * c, intD: 58 + (Dr.intD - 58) * c, strength: Dr.strength };
    const gS = this.gs(s), gO = this.gs(1 - s);
    const T = { spacing: gS.ctx.spacing, playm: gS.ctx.playm, rimProtD: gO.ctx.rimProtD };
    const q = 0.55 + (R[type === 'rim' ? 'layup' : type === 'three' ? 'three' : type === 'post' ? 'post' : 'mid'] - 60) * 0.004;
    const adj = (0.35 - c) * (type === 'rim' ? 0.13 : 0.08) - M.PLAY_TUNE[type] + (q - 0.55) * (type === 'rim' ? 0.10 : 0.28);
    let p = Rules.makeProb(type, R, D2, T, adj);
    let pts = type === 'three' ? 3 : 2;
    let ev = p * pts + (type === 'rim' ? 0.12 : 0) * (1 - c);       // foul-drawing value
    if (d > 28) ev *= 0.45;
    if (d > 33) ev *= 0.4;
    return { type, p, ev, c, d, dd };
  };

  // ---- matchups ----------------------------------------------------------------------------------
  M.prototype.assignMatchups = function () {
    for (let s = 0; s < 2; s++) {
      const D = this.bodies[s], O = this.bodies[1 - s];
      const used = new Set();
      const pairs = [];
      for (const d of D) for (const o of O) pairs.push([Math.hypot(d.x - o.x, d.y - o.y) + Math.abs(d.mon.r.pos1 - o.mon.r.pos1) * 2.5, d, o]);
      pairs.sort((a, b) => a[0] - b[0]);
      const done = new Set();
      for (const [, d, o] of pairs) { if (done.has(d) || used.has(o)) continue; d.man = o; done.add(d); used.add(o); }
    }
  };

  // ---- plan ---------------------------------------------------------------------------------------
  M.planAI = function (m, dt) {
    const t = m.t;
    if (m.phase === 'ft') return;
    const ball = m.ball;
    const poss = m.poss;
    if (!m._matchT || t - m._matchT > 2.5 || m._matchPoss !== poss) { m.assignMatchups(); m._matchT = t; m._matchPoss = poss; }
    // fast-break tracking
    const h = ball.holder;
    const loose = ball.state === 'loose' || (ball.state === 'flight' && m.shot && !m.shot.done);
    for (let s = 0; s < 2; s++) {
      for (const b of m.bodies[s]) {
        if (b.ctl && !m.auto) continue;
        if (ball.state === 'flight' && ball.flight && ball.flight.type === 'pass' && ball.flight.to === b && m.phase !== 'ft') {
          // receiver tracks the incoming pass
          const f = ball.flight; const sp = Math.hypot(ball.vx, ball.vy) || 1;
          const dd = Math.hypot(ball.x - b.x, ball.y - b.y); const tt = Math.min(0.35, dd / sp);
          b.intent = { tx: ball.x + ball.vx * tt * 0.9, ty: ball.y + ball.vy * tt * 0.9, sp: 1.15 }; continue;
        }
        if (b.shootT > 0 || (b.jump && b.jumpKind === 'shot' && b.shotType)) { b.intent = { tx: b.x, ty: b.y, sp: 0.1 }; continue; }
        if (b.stun > 0 && b.stunDir) { b.intent = { tx: b.x + b.stunDir.x * 3, ty: b.y + b.stunDir.y * 3, sp: 0.4 }; continue; }
        if (b.charge > 0) { b.intent = { tx: b.x, ty: b.y, sp: 0 }; continue; }
        if (m.phase === 'inbound') { planInbound(m, b, s); continue; }
        if (loose || (ball.state === 'net')) { planLoose(m, b, s); continue; }
        if (s === poss) planOffense(m, b, s, h); else planDefense(m, b, s, h);
      }
    }
    // screens effect on defenders
    for (const b of m.bodies[poss]) {
      if (b.ai.screenT && t < b.ai.screenT) {
        const holder = b.ai.screenFor || ball.holder;
        if (holder) {
          const dfd = m.nearestDef(holder, 6);
          if (dfd && Math.hypot(b.x - dfd.x, b.y - dfd.y) < 2.8 && Math.hypot(b.x - holder.x, b.y - holder.y) < 6 && !(b.ai.screenHit && t - b.ai.screenHit < 1.5)) {
            const w = m.eff(b, 'strength') - m.eff(dfd, 'strength') * 0.6 + 25;
            dfd.stun = Math.max(dfd.stun, clamp(w / 90, 0.15, 0.6)); dfd.stunDir = { x: (dfd.x - holder.x) * 0.2, y: (dfd.y - holder.y) * 0.2 };
            b.ai.screenHit = t;
          }
        }
      }
    }
    // defenders attempt blocks on incoming shots
    for (const sh of m.bodies[poss]) {
      if (sh.shootT > 0 && sh.shootT < 90 && !sh.ai.blkChecked) {
        sh.ai.blkChecked = t;
        for (const d of m.bodies[1 - poss]) {
          if (d.ctl && !m.auto) continue;
          const dd = dist(d, sh);
          if (dd < 5.2 && !d.jump) {
            const pj = clamp(0.32 + (m.eff(d, 'block') - 55) * 0.008 + (m.eff(d, 'iq') - 55) * 0.004 + (sh.shotType === 'rim' ? 0.15 : 0), 0.03, 0.7);
            if (m.rng.chance(pj)) { m.blockJump(d, false); d.blockTimed = m.rng.chance(0.35 + (m.eff(d, 'iq') - 50) * 0.005); }
          }
        }
      }
      if (sh.shootT <= 0) sh.ai.blkChecked = 0;
    }
  };

  // ---- inbound ------------------------------------------------------------------------------------
  function planInbound(m, b, s) {
    const poss = m.inboundSide;
    if (b === m.inbounder) { b.intent = { tx: b.x, ty: b.y, sp: 0 }; return; }
    const bx = ATTACK_X(poss);
    if (s === poss) {
      // offense: the best ball handler comes to get the inbound; everyone else heads up the floor into lanes
      const ib = m.inbounder;
      const others = m.bodies[s].filter(x => x !== ib).sort((x, y) => y.mon.r.handle - x.mon.r.handle);
      const k = others.indexOf(b);
      if (k === 0) {
        const ax = clamp(fxv(poss, ib.x) + 10, 8, 80);
        b.intent = { tx: fxv(poss, ax), ty: clamp(ib.y < 0 ? 12 : ib.y > H ? 38 : 25 + 6 * Math.sin(m.t * 1.6), 4, 46), sp: 0.75 };
      } else {
        const lane = [[62, 9], [64, 41], [70, 22], [56, 30]][k - 1] || [60, 25];
        const ax = Math.max(lane[0], fxv(poss, ib.x) + 14);
        b.intent = { tx: fxv(poss, Math.min(ax, 82)), ty: lane[1], sp: 0.7 };
      }
    } else {
      // defense: get set (press: deny; otherwise sag back)
      const o = b.man; if (!o) { b.intent = { tx: b.x, ty: b.y, sp: 0 }; return; }
      const press = m.gs(s).strat.def === 'press';
      if (press) { const tx = o.x + (ATTACK_X(poss) - o.x) * 0.06, ty = o.y + (25 - o.y) * 0.1; b.intent = { tx, ty, sp: 0.8 }; }
      else { const oa = fxv(poss, o.x); b.intent = { tx: fxv(poss, Math.min(86, Math.max(oa + 6, 60))), ty: o.y * 0.7 + 25 * 0.3, sp: 1.0 }; }
    }
  }
  M.aiInbound = function (m, ib) {
    const s = ib.s;
    const mates = m.bodies[s].filter(b => b !== ib);
    let best = null, bs = -1e9;
    for (const t of mates) {
      const sc = m.openScore(t, ib) + (fxv(s, t.x) > fxv(s, ib.x) ? 1.5 : 0) + t.mon.r.handle * 0.05 - dist(t, ib) * 0.35;
      if (sc > bs) { bs = sc; best = t; }
    }
    if (best) m.passTo(ib, best, 'chest', 0.6);
  };
  const fxv = (s, x) => s === 0 ? x : W - x;

  // ---- loose ball / rebound ----------------------------------------------------------------------
  function planLoose(m, b, s) {
    const ball = m.ball;
    // landing spot
    let lx = ball.x, ly = ball.y;
    if (ball.state === 'flight' && m.shot) { lx = ATTACK_X(m.shot.shooter.s) - DIR(m.shot.shooter.s) * 2.5; ly = 25; }
    else if (ball.state === 'loose') { lx = ball.x + ball.vx * 0.45; ly = ball.y + ball.vy * 0.45; }
    if (m.rebTarget === b) { b.intent = { tx: ball.x + ball.vx * 0.2, ty: ball.y + ball.vy * 0.2, sp: 1.2 }; return; }
    const isOff = s === m.poss;
    const dBall = Math.hypot(b.x - lx, b.y - ly);
    const basket = ATTACK_X(m.poss);
    const nearBasket = Math.hypot(b.x - basket, b.y - 25) < 17;
    const reb = m.eff(b, isOff ? 'oreb' : 'dreb');
    // who crashes: bigs + anyone close; others get back (defense) / hold spots (offense)
    const crash = dBall < 12 || (nearBasket && (b.mon.r.pos1 >= 2 || reb > 58)) || (b.mon.r.pos1 <= 1 && dBall < 18 && ((m.t * 7 + b.slot) % 3 < 1));
    if (crash || ball.state === 'loose') {
      if (!isOff && b.man && dBall > 5 && b.mon.r.pos1 < 3 && ball.state !== 'loose') {
        // box out: stay between man and basket
        const o = b.man; b.intent = { tx: o.x + (basket - o.x) * 0.15, ty: o.y + (25 - o.y) * 0.15, sp: 0.8 };
      } else b.intent = { tx: lx, ty: ly, sp: 1.15 };
      // jump when the ball is close and low enough
      if (ball.state === 'loose' && !b.jump && dBall < 4.2 && ball.z < BODY_H(b) + 5.5 && ball.vz <= 2) { if (!(b.ctl && !m.auto)) m.jumpForBall(b); }
      if (ball.state === 'flight' && m.shot && ball.vz < 0 && dBall < 6 && !b.jump && ball.z < 13 && m.shot.shooter.s !== s && b.mon.r.pos1 >= 2) { if (m.rng.chance(0.07)) m.jumpForBall(b); }
    } else {
      // others: offense spreads / defense retreats
      if (isOff) { b.intent = { tx: b.x, ty: b.y, sp: 0.2 }; }
      else { const own = DEFEND_X(1 - s) * 0 + basket; b.intent = { tx: b.x + (basket - b.x) * 0.25, ty: b.y + (25 - b.y) * 0.25, sp: 0.5 }; }
    }
  }

  // ---- offense ------------------------------------------------------------------------------------
  const SPOTS = {
    top: [62.5, 25], wingR: [71, 43], wingL: [71, 7], cornerR: [85.5, 46.5], cornerL: [85.5, 3.5], elbowR: [77, 33], elbowL: [77, 17],
    lowR: [84.2, 30], lowL: [84.2, 20], dunker: [86, 25],
  };
  // 4-out/1-in style spacing relative to where the ball is: the handler takes one perimeter spot,
  // shooters fill the remaining perimeter spots farthest from the ball, at most two bigs play inside
  function assignSpots(m, s, handler) {
    const ps = m.bodies[s].filter(b => b !== handler);
    const out = new Map();
    const hA = { x: fxv(s, handler.x), y: handler.y };
    const inside = ps.filter(b => b.mon.r.pos1 >= 3 && b.mon.r.three < 64).sort((a, b) => b.mon.r.post - a.mon.r.post).slice(0, 2);
    const perim = ps.filter(b => !inside.includes(b));
    const strongLeft = hA.y < 25;
    const inSpots = [strongLeft ? 'lowR' : 'lowL', strongLeft ? 'elbowR' : 'elbowL'];
    inside.forEach((b, i) => out.set(b, inSpots[i]));
    // perimeter: drop the spot the handler occupies, keep the ones farthest from the ball
    let P = ['top', 'wingL', 'wingR', 'cornerL', 'cornerR'].map(k => ({ k, d: Math.hypot(SPOTS[k][0] - hA.x, SPOTS[k][1] - hA.y) }))
      .sort((a, b) => b.d - a.d).slice(0, 4).map(x => x.k);
    // greedy: each perimeter player takes the nearest free spot
    const free = new Set(P);
    const order = perim.slice().sort((a, b) => b.mon.r.three - a.mon.r.three);
    for (const b of order) {
      const bA = { x: fxv(s, b.x), y: b.y };
      let best = null, bd = 1e9;
      for (const k of free) { const d = Math.hypot(SPOTS[k][0] - bA.x, SPOTS[k][1] - bA.y); if (d < bd) { bd = d; best = k; } }
      if (best) { out.set(b, best); free.delete(best); } else out.set(b, 'dunker');
    }
    return out;
  }

  function planOffense(m, b, s, h) {
    const t = m.t;
    const bx = ATTACK_X(s), dir = DIR(s);
    const ball = m.ball;
    const mine = h && h.s === s;
    // pass in flight toward me: move to meet it
    if (ball.state === 'flight' && ball.flight && ball.flight.type === 'pass' && ball.flight.to === b) {
      b.intent = { tx: ball.x + ball.vx * 0.12, ty: ball.y + ball.vy * 0.12, sp: 0.9 }; return;
    }
    if (!mine) { b.intent = { tx: b.x, ty: b.y, sp: 0.3 }; return; }
    if (b === h) { planHandler(m, b, s); return; }
    // off-ball
    const ai = b.ai;
    if (m.possT == null) m.possT = t;
    const inFront = fxv(s, h.x) > 44;
    // transition: run the lane
    if (!inFront) {
      // transition: everyone fills their own half-court spot (wings wide, bigs rim-run / trail) instead of the middle
      if (!m._spots || m._spotsFor !== h || t - m._spotsT > 1.6) { m._spots = assignSpots(m, s, h); m._spotsFor = h; m._spotsT = t; }
      const key = m._spots.get(b) || 'wingR';
      const sp0 = SPOTS[key];
      // don't run miles ahead of the ball: at most ~30 ft in front of the handler
      const ax = Math.min(sp0[0], fxv(s, h.x) + 30);
      b.intent = { tx: A(s, ax, sp0[1]).x, ty: sp0[1], sp: 1.0 };
      return;
    }
    // half court: screens (user call or pnr)
    if (ai.screenT && t < ai.screenT && ai.screenFor) {
      const holder = ai.screenFor; const dfd = m.nearestDef(holder, 12) || m.nearestDef(b, 12);
      if (dfd) {
        const spx = holder.x + (dfd.x - holder.x) * 0.55, spy = holder.y + (dfd.y - holder.y) * 0.55;
        b.intent = { tx: spx, ty: spy, sp: 1.0 };
        // roll after set
        if (dist(b, { x: spx, y: spy }) < 1.6 && !ai.screenSet) ai.screenSet = t;
        if (ai.screenSet && t - ai.screenSet > 0.9) { ai.screenT = 0; ai.screenSet = 0; ai.roll = t + 2.2; }
        return;
      }
    }
    if (ai.roll && t < ai.roll) { b.intent = { tx: bx - dir * 4.5, ty: 25 + (b.y < 25 ? -2.5 : 2.5), sp: 1.1 }; ai.cut = true; return; }
    ai.cut = false;
    // play call: pick & roll from the top
    if (!m.playState && inFront && t - m.possT > 1.4 && t - m.possT < 6 && m.rng.chance(dt60 * 0.35)) {
      const hand = h; const bigs = m.bodies[s].filter(x => x !== hand && x.mon.r.pos1 >= 2).sort((a, c) => m.eff(c, 'strength') - m.eff(a, 'strength'));
      if (bigs.length && m.gs(s).strat.off !== 'three') {
        const scr = bigs[0]; m.playState = { type: 'pnr', scr, hand, t0: t };
        scr.ai.screenFor = hand; scr.ai.screenT = t + 3.5; hand.ai.waitScreen = t + 1.4; hand.ai.pnrDrive = t + 1.4;
        m.say && 0;
      }
    }
    // spot assignment (recomputed when handler changes or each possession)
    if (!m._spots || m._spotsFor !== h || t - m._spotsT > 1.6) { m._spots = assignSpots(m, s, h); m._spotsFor = h; m._spotsT = t; }
    const key = m._spots.get(b);
    const sp = SPOTS[key || 'wingR'];
    let spot = A(s, sp[0], sp[1]);
    // drift
    const idx = m.bodies[s].indexOf(b);
    spot.x += Math.sin(t * 0.9 + idx * 2.1) * 0.8; spot.y += Math.cos(t * 0.7 + idx * 1.3) * 0.9;
    // post-up for strong inside players with the ball handler's attention
    // cuts: when defender ball-watching & iq, backdoor
    if (!ai.cutUntil && m.rng.chance(dt60 * 0.12 * (m.eff(b, 'iq') / 70)) && Math.hypot(b.x - bx, b.y - 25) > 14) { ai.cutUntil = t + 1.1; }
    if (ai.cutUntil && t < ai.cutUntil) { ai.cut = true; b.intent = { tx: bx - dir * 3.2, ty: 25 + (b.y < 25 ? -4 : 4), sp: 1.15 }; return; }
    if (ai.cutUntil && t >= ai.cutUntil) { ai.cutUntil = 0; ai.cutRest = t + 3; }
    // keep spacing from teammates
    for (const o of m.bodies[s]) {
      if (o === b) continue;
      const R = o === h ? 13 : 10;
      const dd = Math.hypot(spot.x - o.x, spot.y - o.y);
      if (dd < R && dd > 0.1) { spot.x += (spot.x - o.x) / dd * (R - dd) * 0.8; spot.y += (spot.y - o.y) / dd * (R - dd) * 0.8; }
    }
    spot.x = clamp(spot.x, 1.5, W - 1.5); spot.y = clamp(spot.y, 2, H - 2);
    b.intent = { tx: spot.x, ty: spot.y, sp: 0.75 };
  }
  const dt60 = 1 / 60;

  function planHandler(m, b, s) {
    const t = m.t, ai = b.ai;
    const bx = ATTACK_X(s), dir = DIR(s);
    const ball = m.ball;
    const front = fxv(s, b.x) > 47;
    if (front) { m.frontcourt[s] = true; if (!m.fcT) m.fcT = [null, null]; if (m.fcT[s] == null) m.fcT[s] = t; }
    if (m.possT == null || m._possFor !== m.poss) { m.possT = t; m._possFor = m.poss; m.playState = null; ai.mode = null; }
    // user asked for the ball
    // backcourt advance
    const pr = m.pressure(b);
    if (!m.frontcourt[s]) {
      // pass ahead to a clearly open runner if pressured
      if (pr > 0.65 && t - (ai.lastPass || 0) > 0.6) { const tgt = bestPass(m, b, 0.0); if (tgt && tgt.ev > 0.2) { ai.lastPass = t; m.passTo(b, tgt.t, 'chest', 0.9); return; } }
      b.intent = { tx: A(s, 56, clamp(25 + (b.y - 25) * 0.4, 12, 38)).x, ty: clamp(25 + (b.y - 25) * 0.4, 12, 38), sp: 1.0 };
      // fast break: if free path, attack the rim directly
      const free = m.nearestDefDist(b) > 6 && fxv(s, b.x) > 30;
      if (free) b.intent = { tx: bx - dir * 3, ty: 25, sp: 1.2 };
      return;
    }
    if (!ai.decideT || t > ai.decideT) {
      ai.decideT = t + 0.28 + m.rng.range(0, 0.25);
      const sh = m.estimateShot(b);
      const pas = bestPass(m, b, sh.ev);
      const usage = b.mon.tend.usage;
      const clockLeft = m.shotClock;
      const urgent = clockLeft < 4.2;
      const thr = 1.06 - 0.50 * clamp((16 - clockLeft) / 16, 0, 1) - (usage - 62) * 0.0035 + (m.gs(s).strat.off === 'three' && sh.type === 'three' ? -0.08 : 0) + (m.gs(s).strat.off === 'inside' && sh.type !== 'rim' && sh.type !== 'post' ? 0.07 : 0);
      const tf = t - (m.fcT && m.fcT[s] != null ? m.fcT[s] : t);
      const so = m.gs(s).strat.off;
      const tempo = so === 'fast' ? 7.5 : so === 'inside' ? 12 : so === 'three' ? 10.5 : 11;
      const patience = (sh.type === 'rim' && sh.ev >= 1.55) ? 0 : 0.85 * clamp(1 - tf / tempo, 0, 1);
      const teamFga = m.bodies[s].reduce((t, x) => t + x.pl.st.fga, 0);
      const hog = clamp((b.pl.st.fga - teamFga / 5) * 0.045, -0.12, 0.35);
      const thr2 = thr + patience + hog;
      const drv = driveEV(m, b);
      const waitScreen = ai.waitScreen && t < ai.waitScreen;
      let act = 'probe';
      const best = Math.max(sh.ev, pas ? pas.ev : -1, drv.ev);
      if (urgent && pas && pas.ev > sh.ev + 0.15 && clockLeft > 1.5) act = 'pass';
      else if (urgent) act = sh.ev >= 0.55 || clockLeft < 1.6 ? 'shoot' : (pas ? 'pass' : 'shoot');
      else if (sh.ev >= thr2 && sh.ev >= (pas ? pas.ev - 0.06 : 0) && sh.d > 8 && !waitScreen) act = 'shoot';
      else if (sh.type === 'rim' && sh.ev >= 1.0 + patience + hog * 0.6 && !waitScreen) act = 'shoot';
      else if (pas && pas.ev > Math.max(sh.ev, 0.8) + 0.10 && t - (ai.lastPass || 0) > 0.7) act = 'pass';
      else if (drv.ev >= 1.0 + patience + hog && drv.ev > sh.ev && (!waitScreen)) act = 'drive';
      else if (ai.pnrDrive && t >= ai.pnrDrive) { act = 'drive'; ai.pnrDrive = 0; }
      else if (pr > 0.7 && pas && pas.ev > 0.6 && t - (ai.lastPass || 0) > 0.8) act = 'pass';
      else if (m.playState && m.playState.type === 'post' && b.mon.r.pos1 >= 3) act = 'post';
      ai.act = act; ai.actT = t;
      if (act === 'shoot') { b.face = Math.sign(bx - b.x) || b.face; b.postUp = (sh.type === 'post'); m.startShot(b, false); return; }
      if (act === 'pass' && pas) { ai.lastPass = t; m.passTo(b, pas.t, 'chest', 0.9); return; }
      if (act === 'drive') { ai.mode = 'drive'; ai.driveEnd = t + 2.2; ai.side = (b.y < 25 ? 1 : -1) * (m.rng.chance(0.5) ? 1 : -1) * 0 + (m.nearestDef(b, 8) ? Math.sign(b.y - m.nearestDef(b, 8).y) || 1 : 1); }
      else if (ai.mode === 'drive' && t > ai.driveEnd) ai.mode = null;
    }
    // movement
    if (ai.mode === 'drive' && t < ai.driveEnd) {
      const dfd = m.nearestDef(b, 10);
      let tx = bx - dir * 2.2, ty = 25;
      if (dfd) {
        // curve away from the defender
        const away = Math.sign(b.y - dfd.y) || 1;
        const dToB = Math.hypot(b.x - bx, b.y - 25);
        ty = clamp(25 + away * Math.min(6, dToB * 0.15), 3, 47);
        if (dist(b, dfd) < 3 && b.moveCd !== undefined && t > (b.moveCd || 0) && m.rng.chance(0.05)) m.evadeMove(b, Math.atan2(ty - b.y, tx - b.x) + (away * 0.6), 'cross');
        b.moveCd = Math.max(b.moveCd || 0, 0);
      }
      b.intent = { tx, ty, sp: 1.0 };
      // finish when close
      const dB = Math.hypot(b.x - bx, b.y - 25);
      if (dB < 6.2 && !b.shootT) { ai.mode = null; m.startShot(b, false); return; }
      // abort to pass if help arrives and teammate open
      if (dB < 14 && m.estimateShot(b).c > 0.85) { const pas = bestPass(m, b, 0); if (pas && pas.ev > 1.0 && t - (ai.lastPass || 0) > 0.7) { ai.lastPass = t; ai.mode = null; m.passTo(b, pas.t, 'chest', 0.9); return; } }
      return;
    }
    // post-up play
    if (ai.act === 'post') { b.intent = { tx: bx - dir * 7, ty: 25 + (b.y < 25 ? -6 : 6), sp: 0.7 }; if (Math.hypot(b.x - bx, b.y - 25) < 9.5) { ai.act = 'shoot'; b.postUp = true; m.startShot(b, false); } return; }
    // probing: dribble toward the top/wing, circle slowly
    const k = m.bodies[s].indexOf(b);
    const px = A(s, 64 + Math.sin(t * 0.8 + k) * 4, 25 + Math.cos(t * 0.6 + k) * 9);
    b.intent = { tx: px.x, ty: px.y, sp: 0.6 };
  }

  function bestPass(m, h, minEv) {
    const s = h.s; let best = null;
    for (const t of m.bodies[s]) {
      if (t === h) continue;
      const lane = m.laneBlocked(h, t);
      const d = dist(h, t);
      if (d < 3.5 || d > 38) continue;
      // evaluate shot at receiver's position slightly forward
      const e = m.estimateShot(t, { x: t.x + t.vx * 0.25, y: t.y + t.vy * 0.25 });
      let ev = e.ev * (lane ? 0.3 : 0.97) - (d > 28 ? 0.1 : 0);
      if (t.ai && t.ai.cut) ev += 0.12;
      if (t.ai && t.ai.roll && m.t < t.ai.roll) ev += 0.18;
      // a quick pass-and-shoot is only good for decent shooters
      ev += (t.mon.tend.usage - 62) * 0.002;
      const tf = m.bodies[s].reduce((q, x) => q + x.pl.st.fga, 0);
      ev += clamp((tf / 5 - t.pl.st.fga) * 0.03, -0.15, 0.2);
      if (!best || ev > best.ev) best = { t, ev };
    }
    return best;
  }
  function driveEV(m, b) {
    const s = b.s, bx = ATTACK_X(s);
    const d = Math.hypot(b.x - bx, b.y - 25);
    if (d > 30) return { ev: 0 };
    const dfd = m.nearestDef(b, 12);
    const sepAdv = dfd ? clamp(dist(dfd, b) / 6, 0, 1) : 1;
    const quick = (m.eff(b, 'speed') + m.eff(b, 'accel') + m.eff(b, 'handle') * 0.6) / 2.6;
    const fin = Math.max(m.eff(b, 'layup'), m.eff(b, 'dunk'));
    // is there a rim protector waiting?
    let rimBlock = 0; for (const o of m.bodies[1 - s]) { if (Math.hypot(o.x - bx, o.y - 25) < 8) rimBlock = Math.max(rimBlock, m.eff(o, 'block') * 0.004 + m.eff(o, 'intD') * 0.002); }
    const p = clamp(0.40 + (fin - 55) * 0.004 + (quick - 55) * 0.0035 + sepAdv * 0.12 - rimBlock * 0.55, 0.15, 0.78);
    return { ev: p * 2 + 0.15 };
  }

  // ---- defense ------------------------------------------------------------------------------------
  function planDefense(m, b, s, h) {
    const t = m.t;
    const O = 1 - s;                     // offense side
    const strat = m.gs(s).strat;
    const bx = DEFEND_X(O) * 0 + ATTACK_X(O);       // basket being attacked (the one we defend)
    const ball = m.ball;
    const holder = h && h.s === O ? h : null;
    const bpos = holder || ball;
    const press = strat.def === 'press', lock = strat.def === 'lockdown', zone = strat.def === 'zone';
    const ai = b.ai;
    // transition: retreat when the ball is in the other half / just changed hands
    const handlerFront = holder ? fxv(O, holder.x) > 47 : fxv(O, ball.x) > 47;
    if (!handlerFront && !press) {
      // get back and set the half-court defense: everyone stays in their own half (attack-frame x >= 50),
      // goal-side of their man; the ball handler is picked up around half court, not full court
      const o = b.man || bpos;
      const oa = fxv(O, o.x);
      const onBall = holder && o === holder;
      const ax = onBall ? Math.max(oa + 4, 49) : Math.max(oa + 6, 58 + (Math.abs(o.y - 25) < 10 ? 10 : 0));
      const ty = onBall ? holder.y + (25 - holder.y) * 0.15 : o.y * 0.75 + 25 * 0.25;
      b.intent = { tx: fxv(O, Math.min(ax, 86)), ty, sp: fxv(O, b.x) < ax - 3 ? 1.2 : 0.8 };
      if (onBall && dist(b, holder) < 4) stealLogic(m, b, holder, s, 0.5);
      return;
    }
    if (zone && !press) { planZone(m, b, s, O, bx, holder, bpos); return; }
    const o = b.man;
    if (!o) { b.intent = { tx: b.x, ty: b.y, sp: 0.3 }; return; }
    const isOnBall = holder === o;
    const dBallMan = holder ? dist(holder, o) : Math.hypot(ball.x - o.x, ball.y - o.y);
    let gap = lock ? 2.0 : press ? 1.8 : 2.6;
    let tx, ty;
    const toB = Math.hypot(bx - o.x, 25 - o.y) || 1;
    if (isOnBall) {
      // stay between ball handler and basket, a bit toward the dribble hand
      const dirx = (bx - o.x) / toB, diry = (25 - o.y) / toB;
      gap = (m.eff(o, 'handle') > m.eff(b, 'speed') + 18 ? gap + 1.2 : gap) + (o.sprint ? 0.8 : 0);
      // pick up loosely far from the rim, tighten inside the arc; respect shooters a bit more
      const shooter = clamp((o.mon.r.three - 55) / 35, 0, 1);
      gap += clamp((toB - 24) / 12, 0, 1) * (6 - 3 * shooter) + (press ? -2 : 0);
      gap = Math.max(gap, 1.6);
      tx = o.x + dirx * gap + o.vx * 0.12; ty = o.y + diry * gap + o.vy * 0.12;
      b.intent = { tx, ty, sp: 1.1, onBall: true };
      stealLogic(m, b, o, s, 1);
      // double team in the backcourt press
      if (press && !m.frontcourt[O]) { /* handled below for helper */ }
      return;
    }
    // off-ball
    const near = dBallMan < 20;
    const threat = clamp((Math.max(o.mon.r.three, o.mon.r.mid, Math.max(o.mon.r.layup, o.mon.r.dunk) * 0.9) - 55) / 38, 0, 1);
    let sag = near ? (press ? 2.6 : lock ? 3.5 : 5.0) - 2.0 * threat : Math.max(4.5, Math.min(12, 0.42 * toB) - 2.5 * threat);
    // nobody chases an off-ball man out past ~26 ft: hold position nearer the paint
    if (toB > 26) sag = Math.max(sag, (toB - 26) * 0.7 + sag * 0.6);
    // denying passes on the strong side: shade toward ball
    const dirx = (bx - o.x) / toB, diry = (25 - o.y) / toB;
    const toBallX = bpos.x - o.x, toBallY = bpos.y - o.y, tbl = Math.hypot(toBallX, toBallY) || 1;
    const lean = near ? 0.35 : 0.55;
    tx = o.x + dirx * sag + toBallX / tbl * lean * 3; ty = o.y + diry * sag + toBallY / tbl * lean * 3;
    // help: ball handler penetrating near the paint
    if (holder) {
      const hd = Math.hypot(holder.x - bx, holder.y - 25);
      const hdef = m.bodies[s].find(x => x.man === holder);
      if (hd < 12 && hdef && dist(hdef, holder) > 4.0 && b.mon && Math.hypot(b.x - bx, b.y - 25) < 12) {
        const myHelp = Math.hypot(b.x - holder.x, b.y - holder.y);
        const better = m.bodies[s].every(x => x === b || x === hdef || Math.hypot(x.x - holder.x, x.y - holder.y) > myHelp - 0.01 || Math.hypot(x.x - bx, x.y - 25) > 13);
        if (better) { tx = holder.x + (bx - holder.x) * 0.5; ty = holder.y + (25 - holder.y) * 0.5; }
      }
      // rim protector stays home
      const rim = m.bodies[s].filter(x => x !== hdef).sort((a, c) => m.eff(c, 'block') - m.eff(a, 'block'))[0];
      if (rim === b && hd < 22) { tx = bx - DIR(O) * 4.5 + (holder.x - bx) * 0.05; ty = 25 + (holder.y - 25) * 0.2; }
      // press: trap
      if (press && !m.frontcourt[O] && hdef) {
        const second = m.bodies[s].filter(x => x !== hdef).sort((a, c) => dist(a, holder) - dist(c, holder))[0];
        if (second === b) { tx = holder.x + (bx - holder.x) * 0.1 + (holder.y < 25 ? 0 : 0); ty = holder.y + (holder.y < 25 ? -2.2 : 2.2); }
      }
    }
    // user help call shifts a defender
    if (m.helpCall && m.t - m.helpCall.t < 0.4) { tx += m.helpCall.x * 3.5; ty += m.helpCall.y * 3.5; }
    // jump passing lanes sometimes (steal intent)
    b.intent = { tx: clamp(tx, 1, W - 1), ty: clamp(ty, 1, H - 1), sp: (m.eff(b, 'speed') > 40 ? 1.08 : 0.95) };
  }

  const ZONE = [[13, 17], [13, 33], [5.5, 9], [4.5, 25], [5.5, 41]];   // 2-3 zone: distance from basket along the court, lateral y
  function planZone(m, b, s, O, bx, holder, bpos) {
    // assign by slot size: tallest to the middle low spot
    const order = m.bodies[s].slice().sort((a, c) => c.mon.r.sH - a.mon.r.sH);
    const rank = order.indexOf(b);
    const spotIdx = [3, 2, 4, 0, 1][rank];            // biggest -> low middle, next -> low sides, smallest -> front
    const zp = ZONE[spotIdx];
    const dirOut = -DIR(O);                           // away from the defended basket
    let tx = bx + (-DIR(O)) * -0 + dirOut * zp[0] * -1 * -1;
    tx = bx + dirOut * zp[0] * 1;
    // shift toward ball
    const shiftY = clamp((bpos.y - 25) * 0.28, -8, 8);
    const shiftX = clamp((fxv(O, bpos.x) - 66) * 0.12, -3, 4) * dirOut;
    let ty = zp[1] + shiftY * (zp[0] < 8 ? 0.7 : 1);
    tx += shiftX * -0.2;
    // closeout on whoever is in my area with ball
    const mine = m.bodies[O].filter(o => dist(o, { x: tx, y: ty }) < 6.5);
    let sp = 0.9;
    if (holder && dist(holder, { x: tx, y: ty }) < 7.5) { tx = holder.x + (bx - holder.x) * 0.1; ty = holder.y + (25 - holder.y) * 0.1; sp = 1.1; stealLogic(m, b, holder, s, 0.7); }
    else if (mine.length) { tx = PB.lerp(tx, mine[0].x, 0.35); ty = PB.lerp(ty, mine[0].y, 0.35); }
    b.intent = { tx: clamp(tx, 1, W - 1), ty: clamp(ty, 1, H - 1), sp };
  }

  function stealLogic(m, d, h, s, mult) {
    if (m.phase !== 'live' || d.stealCd > 0 || (d.ctl && !m.auto)) return;
    if (dist(d, h) > 3.2) return;
    const rate = (0.075 + (m.eff(d, 'steal') - 55) * 0.0025) * (m.gs(s).strat.def === 'press' ? 1.35 : m.gs(s).strat.def === 'lockdown' ? 1.15 : 1) * mult;
    if (m.rng.chance(clamp(rate, 0.1, 1.4) * dt60)) { d.stealCd = 0.9; d.reachT = 0.28; m.stealTry(d, h, 0.75 + (m.g.diff[m.gi[s]] ? 0.2 : 0)); }
  }
})(window.PB);
