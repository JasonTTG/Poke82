// Playable 5-on-5 engine: real-time physics + rules. Shares ratings/Rules/Game bookkeeping with the sim.
// Coordinates are feet: court 94 x 50. Side 0 (the user's team) attacks the RIGHT basket, side 1 attacks LEFT.
(function (PB) {
  const { clamp, Rules } = PB;
  const W = 94, H = 50, RIM_Z = 10, BASKET = [5.25, 88.75];  // BASKET[s] = x of the basket side s ATTACKS: s0 -> 88.75
  const ATTACK_X = s => s === 0 ? 88.75 : 5.25;
  const DEFEND_X = s => s === 0 ? 5.25 : 88.75;
  const DIR = s => s === 0 ? 1 : -1;
  const fx = (s, x) => s === 0 ? x : W - x;               // attack-frame <-> world (mirror about x)
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const len = (x, y) => Math.hypot(x, y);

  // is (x,y) a three-point location for a shooter attacking basket at bx?
  function isThree(x, y, bx) {
    const fromBase = Math.abs(x - (bx > 47 ? W : 0));
    if (fromBase <= 14) return Math.abs(y - 25) >= 22;
    return Math.hypot(x - bx, y - 25) >= 23.75;
  }
  PB.Court = { W, H, isThree, ATTACK_X, DEFEND_X, DIR, fx, RIM_Z };

  const SHOT_METER_T = 0.78;      // seconds to fill the shot meter
  const SWEET = 0.80;             // sweet spot on the meter
  const PASS_SPEED = 44;
  const BODY_H = b => 3.0 + 4.6 * b.mon.r.sH;     // feet (3.0 .. 7.6)

  class Match {
    constructor(G, opts) {
      opts = opts || {};
      this.G = G; this.opts = opts;
      this.rng = opts.rng || new PB.RNG((Math.random() * 4294967296) >>> 0);
      const U = PB.activeTeam(G, G.teams[opts.userTeam != null ? opts.userTeam : G.userTeam]);
      const O = PB.activeTeam(G, G.teams[opts.oppId]);
      this.userHome = opts.userHome !== false;
      this.gi = this.userHome ? [0, 1] : [1, 0];
      const diff = [0, 0];
      const d = opts.noDiff ? 'normal' : G.settings.difficulty;
      const adj = d === 'easy' ? -0.02 : d === 'hard' ? 0.02 : d === 'legend' ? 0.045 : 0;
      diff[this.gi[1]] = adj;
      this.qMin = opts.quarterMin || 5;
      this.g = new PB.Game(this.userHome ? U : O, this.userHome ? O : U, { rng: this.rng, quarterMin: this.qMin, diff, userSide: this.gi[0] });
      this.g.qLen = this.qMin * 60; this.g.otLen = Math.max(60, Math.round(this.qMin * 60 * 5 / 12));
      this.teams = [U, O];
      this.speed = opts.gameSpeed || 1;
      this.auto = !!opts.auto;                  // user's team also AI-controlled (testing)
      this.humans = [!this.auto, !this.auto && !!opts.twoHumans];      // which sides have a person on the sticks
      this.me = opts.me || 0;                   // the side this screen belongs to (UI only)
      this.shotMeterOn = opts.shotMeter != null ? !!opts.shotMeter : PB.settings.shotMeter !== false;
      this.t = 0; this.q = 1; this.ot = 0;
      this.clock = this.g.qLen; this.shotClock = 24;
      this.phase = 'inbound';                   // 'inbound' | 'live' | 'ft' | 'dead' | 'over'
      this.poss = this.rng.int(0, 1); this.firstPoss = this.poss;
      this.qScore = [[], []]; this.qStart = [0, 0];
      this.teamFouls = [0, 0];
      this.events = []; this.cnt = {}; this.sstat = {}; this.sfx = []; this.flash = null; this.flashT = 0;
      this.meter = null;                        // {body, v, locked}
      this.ft = null;
      this.lastPass = null; this.lastTouch = null;
      this.shot = null;
      this.pauseSubs = false;
      this.bodies = [[], []];
      this.ball = { x: 47, y: 25, z: 3, vx: 0, vy: 0, vz: 0, holder: null, state: 'held', flight: null };
      this.U = [0, 1].map(() => ({ ctrl: null, ctrlLock: 0, _ctrlPoss: null, askBall: null, helpCall: null }));
      this.us = 0;                              // the side whose person-controlled state the accessors below refer to
      this.stratOverride = null;
      this.sim = { clockRun: false };
      this.rebT = 0;
      this.over = false;
      for (let s = 0; s < 2; s++) for (let i = 0; i < 5; i++) this._mkBody(s, i);
      this.startQuarter(1);
    }

    gs(s) { return this.g.sides[this.gi[s]]; }
    sc(s) { return this.g.score[this.gi[s]]; }
    opp(s) { return 1 - s; }
    isHuman(s) { return this.humans[s] && !this.auto; }
    onSide(s, fn) { const o = this.us; this.us = s; try { return fn(); } finally { this.us = o; } }
    clearLocks() { this.U[0].ctrlLock = 0; this.U[1].ctrlLock = 0; }

    _mkBody(s, slot) {
      const pl = this.gs(s).court[slot];
      const b = { s, slot, pl, mon: pl.mon, x: 47, y: 25, vx: 0, vy: 0, face: s === 0 ? 1 : -1, z: 0, vz: 0, jump: 0, jumpKind: null,
        sprint: false, stance: false, evade: 0, stun: 0, charge: 0, screen: 0, shootT: 0, block: 0, ai: {}, intent: { tx: 47, ty: 25, sp: 0.6 }, ctl: false, stealCd: 0, reachT: 0, immune: 0, body: null };
      b.r = 1.1 + 0.9 * b.mon.r.sW;
      this.bodies[s][slot] = b;
      return b;
    }
    // rebuild body binding after a substitution (incoming player inherits court position)
    rebind(s, slot) {
      const old = this.bodies[s][slot];
      const pl = this.gs(s).court[slot];
      if (old.pl === pl) return;
      const hadBall = this.ball.holder === old;
      old.pl = pl; old.mon = pl.mon; old.r = 1.1 + 0.9 * old.mon.r.sW; old.ai = {};
      if (hadBall) this.ball.holder = old;
    }

    eff(b, key) {
      return b.mon.r[key] * Rules.fatigueMult(b.pl.en) * (1 - PB.slotPenalty(b.mon, b.slot));
    }
    effR(b) { const o = {}; for (const k of ['three', 'mid', 'layup', 'dunk', 'post', 'ft', 'pass', 'handle', 'steal', 'block', 'perD', 'intD', 'strength', 'iq', 'oreb', 'dreb', 'speed', 'accel', 'stamina']) o[k] = this.eff(b, k); return o; }
    // top speed spreads widely with the speed rating; acceleration falls with mass (momentum)
    vmax(b) { return 8.0 + 0.135 * (this.eff(b, 'speed') - 30); }
    acc(b) { return (16 + 0.30 * this.eff(b, 'accel')) * (1.25 - 0.5 * b.mon.r.sW); }
    decel(b) { return (24 + 0.30 * this.eff(b, 'accel')) * (1.3 - 0.5 * b.mon.r.sW); }
    reach(b) { return BODY_H(b) + 1.4 + b.z; }
    jumpH(b) { return 0.8 + (this.eff(b, 'dunk') * 0.5 + this.eff(b, 'speed') * 0.5) * 0.028; }   // feet of vertical leap 1.4..3.6
    allBodies() { return this.bodies[0].concat(this.bodies[1]); }
    bodyOfPl(pl) { for (const b of this.allBodies()) if (b.pl === pl) return b; return null; }
    holder() { return this.ball.holder; }

    say(txt, big) { const k = txt.split(' ')[0] + (txt.indexOf('intercepted') > 0 ? '-icpt' : ''); this.cnt[k] = (this.cnt[k] || 0) + 1; this.events.push({ t: this.t, txt }); if (this.events.length > 8) this.events.shift(); if (big) { this.flash = txt; this.flashT = 1.4; } }

    // ---------------------------------------------------------------- periods
    startQuarter(q) {
      this.q = q;
      const len = q <= 4 ? this.g.qLen : this.g.otLen;
      this.clock = len; this.g.q = q; this.g.clock = len;
      this.teamFouls = [0, 0]; this.g.teamFouls = [0, 0];
      this.qStart = this.g.score.slice();
      const dir = [this.firstPoss, 1 - this.firstPoss, 1 - this.firstPoss, this.firstPoss];
      const p = q <= 4 ? dir[q - 1] : this.rng.int(0, 1);
      // quarter-break recovery
      for (const s of this.g.sides) for (const pl of s.court) pl.en = Math.min(100, pl.en + (q === 3 ? 22 : 10));
      for (let si = 0; si < 2; si++) { this.g.refresh(si); }
      this.doSubs();
      this.poss = p;
      this.shotClock = 24;
      if (q === 1 || q > 4) this.startJumpBall();
      else this.setInbound(p, 47, 0.0, 'quarter');
    }

    // ---------------------------------------------------------------- jump ball (opening tip and overtime)
    startJumpBall() {
      this.phase = 'jump'; this.frontcourt = [false, false]; this.fcT = [null, null]; this.inboundSpot = null; this.inbounder = null; this.sim.clockRun = false; this.shot = null; this.meter = null; this.ft = null; this.lastPass = null;
      this._clearActions();
      const jumper = s => this.bodies[s].slice().sort((a, b) => (BODY_H(b) + this.jumpH(b) * 1.5 + this.eff(b, 'block') * 0.02) - (BODY_H(a) + this.jumpH(a) * 1.5 + this.eff(a, 'block') * 0.02))[0];
      const J = [jumper(0), jumper(1)];
      this.jb = { t: 0, J, tipped: false, aiJump: [0.42 + this.rng.range(-0.08, 0.1), 0.42 + this.rng.range(-0.08, 0.1)] };
      const ring = [[-6.5, -6.5], [-6.5, 6.5], [-13, -2.5], [-13, 9]];
      for (let s = 0; s < 2; s++) {
        const dir = DIR(s);
        const j = J[s]; j.x = 47 - dir * 1.3; j.y = 25; j.vx = j.vy = 0; j.ai = {};
        this.bodies[s].filter(b => b !== j).forEach((b, i) => { const r = ring[i]; b.x = 47 + dir * r[0] * (i < 2 ? 1 : 1); b.y = 25 + r[1] * (s === 0 ? 1 : -1); b.vx = b.vy = 0; b.ai = {}; });
        for (const b of this.bodies[s]) b.intent = { tx: b.x, ty: b.y, sp: 0 };
      }
      this.ball.holder = null; this.ball.state = 'toss'; this.ball.flight = null;
      this.ball.x = 47; this.ball.y = 25; this.ball.z = 6; this.ball.vx = this.ball.vy = 0; this.ball.vz = 15;
      this.say('JUMP BALL', true);
      for (let s = 0; s < 2; s++) if (this.isHuman(s)) this.onSide(s, () => { if (this.ctrl) this.ctrl.ctl = false; this.ctrl = J[s]; J[s].ctl = true; });
    }
    updateJumpBall(dt, inps) {
      const jb = this.jb, ball = this.ball;
      jb.t += dt;
      // user's jumper: jump on Y / X / A; AI jumps near the top of the toss
      for (let s = 0; s < 2; s++) {
        const j = jb.J[s];
        const userSide = this.isHuman(s);
        const inp = inps && inps[s];
        const press = userSide && inp && (inp.pressed.Y || inp.pressed.X || inp.pressed.A);
        if (!j.jump && !jb.tipped && ((userSide && press) || (!userSide && jb.t >= jb.aiJump[s]))) { j.jump = 1; j.jumpKind = 'tip'; j.vz = 9 + this.jumpH(j) * 1.6; j.tipJumpT = jb.t; }
      }
      for (const b of this.allBodies()) this.moveBody(b, dt);
      if (ball.state === 'toss') {
        ball.vz -= 32.2 * dt; ball.z += ball.vz * dt;
        // the tip happens when the falling ball meets the higher hand
        const reachOf = j => BODY_H(j) + 1.6 + j.z;
        const top = Math.max(reachOf(jb.J[0]), reachOf(jb.J[1]));
        if (!jb.tipped && ball.vz < 0 && ball.z <= top + 0.2) {
          const sc = jb.J.map(j => reachOf(j) + this.rng.range(0, 1.4) + this.eff(j, 'block') * 0.01);
          const w = sc[0] >= sc[1] ? 0 : 1;
          this.tipTo(jb.J[w]);
        } else if (ball.z < 3) { this.tipTo(jb.J[this.rng.int(0, 1)]); }
      } else {
        this.updateBall(dt);
        this.ballContests(dt);
      }
      this.energy(dt, false);
    }
    tipTo(j) {
      const jb = this.jb; jb.tipped = true;
      const s = j.s;
      const mates = this.bodies[s].filter(b => b !== j).sort((a, b) => (a.x - 47) * DIR(s) - (b.x - 47) * DIR(s));
      const tgt = mates[0];
      this.poss = s; this.firstPoss = s;
      this.ball.holder = j; this.ball.state = 'held';
      this.passTo(j, tgt, 'chest', 0.4);
      this.ball.z = BODY_H(j) + 2 + j.z;
      this.say(j.mon.dispName + ' wins the tip');
    }
    endQuarter() {
      const gScore = this.g.score;
      this.g.qScores[0].push(gScore[0] - this.qStart[0]); this.g.qScores[1].push(gScore[1] - this.qStart[1]);
      if (this.q >= 4 && gScore[0] !== gScore[1]) { this.finish(); return; }
      this.sfx.push('buzzer');
      this.say('End of ' + (this.q <= 4 ? 'quarter ' + this.q : 'overtime'), true);
      this.phase = 'dead'; this.deadT = 2.0; this.afterDead = () => { if (this.q >= 4) this.ot++; this.startQuarter(this.q + 1); };
    }
    finish() {
      this.phase = 'over'; this.over = true; this.sfx.push('buzzer'); this.say('FINAL', true);
      this.resultObj = this.g.result(this.ot);
      // ensure result.ot consistent
    }

    // ---------------------------------------------------------------- formations
    // Put the ball inbound for `side` at (x,y). If y is ~0 it means the sideline (nearest)
    setInbound(side, x, y, reason) {
      this.phase = 'inbound'; this.inboundSide = side; this.poss = side;
      this.sim.clockRun = false; this.ball.state = 'held'; this.ball.flight = null; this.shot = null; this.meter = null; this.ft = null;
      this.lastPass = null; this.passPending = null;
      this.shotClock = 24; this.frontcourt = [false, false]; this.fcT = [null, null];
      this.inboundT = 0;
      const baseline = reason === 'made';
      let ix = x, iy = y;
      if (baseline) { ix = DEFEND_X(side) * 0 + (side === 0 ? 0 : W) ; ix = side === 0 ? -1.5 : W + 1.5; iy = 25; }
      else if (reason === 'quarter') { ix = 47; iy = (this.q % 2 === 1) ? -1.5 : H + 1.5; }
      else { iy = y < 25 ? -1.5 : H + 1.5; ix = clamp(x, 6, W - 6); }
      this.inboundSpot = { x: ix, y: iy, baseline };
      this.doSubs();
      // place everyone
      const O = this.bodies[side], D = this.bodies[1 - side];
      const inbounder = this._pickInbounder(side);
      this.inbounder = inbounder;
      const bxA = fx(side, ix);                       // attack-frame x of the inbound spot (0 = own baseline)
      const pos = baseline ? [[9, 14], [14, 38], [19, 24], [27, 32]] : [[bxA + 5, 12], [bxA + 9, 38], [bxA + 13, 22], [bxA + 17, 30]];
      const others = O.filter(b => b !== inbounder).sort((a, b) => b.mon.r.handle - a.mon.r.handle);
      others.forEach((b, i) => { const p = pos[i]; b.x = fx(side, clamp(p[0], 4, 88)); b.y = clamp(p[1], 4, 46); b.vx = b.vy = 0; b.ai = {}; });
      inbounder.x = ix; inbounder.y = iy; inbounder.vx = inbounder.vy = 0; inbounder.ai = {};
      // defenders shadow their men (loosely goal-side)
      const dBasket = ATTACK_X(side);
      const taken = new Set();
      for (const d of D) {
        let best = null, bd = 1e9;
        for (const o of O) { if (taken.has(o) || o === inbounder) continue; const dd = Math.abs(o.mon.r.pos1 - d.mon.r.pos1) * 3 + Math.hypot(o.x - d.x, o.y - d.y) * 0.01; if (dd < bd) { bd = dd; best = o; } }
        if (!best) best = inbounder;
        taken.add(best); d.man = best;
        d.x = clamp(best.x + (dBasket - best.x) * 0.1, 1, W - 1); d.y = clamp(best.y + (25 - best.y) * 0.1 + (best === inbounder ? (iy < 25 ? 3 : -3) : 0), 1, H - 1); d.vx = d.vy = 0; d.ai = {};
      }
      // give ball
      this.ball.holder = inbounder; this.ball.x = inbounder.x; this.ball.y = inbounder.y; this.ball.z = 4;
      this._clearActions();
      this.pickCtrl(true);
      this.inboundDelay = 0.9;
    }
    _pickInbounder(side) {
      const O = this.bodies[side];
      return O.slice().sort((a, b) => (b.mon.r.pass + b.mon.r.iq) - (a.mon.r.pass + a.mon.r.iq))[0];
    }
    _clearActions() {
      for (const b of this.allBodies()) { b.jump = 0; b.z = 0; b.vz = 0; b.shootT = 0; b.block = 0; b.charge = 0; b.evade = 0; b.stun = 0; b.screen = 0; b.reachT = 0; b.sprint = false; b.stance = false; }
    }

    // ---------------------------------------------------------------- substitutions
    doSubs() {
      const g = this.g;
      g.elapsed = this.t;
      for (let si = 0; si < 2; si++) {
        const sd = g.sides[si];
        for (let slot = 0; slot < 5; slot++) if (sd.court[slot].dq) {
          const cand = sd.bench.filter(b => !b.dq).sort((a, b) => b.mon.ovr * Rules.fatigueMult(b.en) - a.mon.ovr * Rules.fatigueMult(a.en))[0];
          if (cand) { g.swap(si, slot, cand); this.rebind(this.gi.indexOf(si), slot); this.say('SUB: ' + cand.mon.dispName + ' in (foul out)'); }
        }
      }
      for (let si = 0; si < 2; si++) {
        const before = g.sides[si].court.map(p => p);
        g.subs(si);
        for (let slot = 0; slot < 5; slot++) {
          const sIdx = g.sides[si].court[slot];
          if (before[slot] !== sIdx) { const s = this.gi.indexOf(si); this.rebind(s, slot); this.say((s === this.me ? 'SUB: ' : 'Opp SUB: ') + sIdx.mon.dispName + ' in'); }
        }
      }
    }
    forceSub(s, slot, benchPl) {
      const si = this.gi[s];
      this.g.swap(si, slot, benchPl); this.rebind(s, slot); this.say('SUB: ' + benchPl.mon.dispName + ' in');
    }

    // ---------------------------------------------------------------- control
    // Offense: control follows the ball. Defense: the user keeps their defender (only A/RB switch),
    // except once at the moment the team goes on defense.
    pickCtrl(force) {
      if (this.auto) { this.U[0].ctrl = null; this.U[1].ctrl = null; return; }
      for (let sd = 0; sd < 2; sd++) if (this.humans[sd]) this.onSide(sd, () => this._pickCtrl(force));
    }
    _pickCtrl(force) {
      if (this.ctrlLock > 0 && !force) return;
      const side = this.us, other = 1 - side;
      const mine = this.bodies[side];
      const hb = this.ball.holder;
      let pick = null;
      if (hb && hb.s === side) pick = hb;
      else if (this.ball.state === 'flight' && this.ball.flight && this.ball.flight.type === 'pass' && this.ball.flight.to && this.ball.flight.to.s === side) pick = this.ball.flight.to;
      else if (this.poss === other && this._ctrlPoss !== other) {
        // just went on defense: take whoever guards the ball (or is nearest to it)
        const tgt = hb || this.ball;
        let best = 1e9;
        for (const b of mine) { const d = (b.man && b.man === hb ? -50 : 0) + Math.hypot(b.x - tgt.x, b.y - tgt.y); if (d < best) { best = d; pick = b; } }
      }
      if (!this.ctrl) pick = pick || mine[0];
      this._ctrlPoss = this.poss;
      if (pick && pick !== this.ctrl) { if (this.ctrl) this.ctrl.ctl = false; this.ctrl = pick; }
      if (this.ctrl) this.ctrl.ctl = true;
    }
    setCtrl(b) { if (this.ctrl) this.ctrl.ctl = false; this.ctrl = b; b.ctl = true; this.ctrlLock = 0.45; }

    // ---------------------------------------------------------------- main update
    update(dt0, inp, inp1) {
      const inps = [inp, inp1];
      if (this.over) return;
      const dt = Math.min(dt0, 1 / 30) * this.speed;
      this.t += dt;
      if (this.flashT > 0) this.flashT -= dt;
      for (const u of this.U) if (u.ctrlLock > 0) u.ctrlLock -= dt;
      if (this.phase === 'dead') { this.deadT -= dt; if (this.deadT <= 0) { const f = this.afterDead; this.afterDead = null; f && f(); } return; }
      if (this.phase === 'ft') { this.updateFT(dt, inps); this.energy(dt, false); return; }
      if (this.phase === 'jump') { this.updateJumpBall(dt, inps); return; }
      // user input -> user actions
      this.userInput(dt, inps);
      // AI intents
      PB.Match.planAI(this, dt);
      // integrate
      for (const b of this.allBodies()) this.moveBody(b, dt);
      this.collide(dt);
      this.updateBall(dt);
      this.ballContests(dt);
      // clocks
      if (this.phase === 'inbound') this.updateInbound(dt);
      else if (this.phase === 'live') {
        const used = Math.min(dt, Math.max(0, this.clock));
        this.clock -= dt; this.shotClock -= dt;
        this.g.clock = this.clock;
        for (let si = 0; si < 2; si++) for (const pl of this.g.sides[si].court) pl.st.sec += used;
        if (this.shotClock <= 0 && !(this.ball.state === 'flight' && this.shot)) this.violation('shot');
        else if (this.clock <= 0) {
          if (this.shot && !this.shot.done) { this.clock = 0.01; } else { this.clock = 0; this.endQuarter(); }
        }
      }
      this.energy(dt, this.phase === 'live');
      this.pickCtrl();
      if (this.q > 4) { /* overtime handled in endQuarter */ }
    }

    energy(dt, live) {
      const g = this.g;
      for (let si = 0; si < 2; si++) {
        const s = g.sides[si];
        const stratMult = (s.strat.def === 'press' ? 1.12 : s.strat.def === 'lockdown' ? 1.15 : 1) * (s.strat.off === 'fast' ? 1.04 : 1);
        for (const pl of s.court) {
          const b = this.bodyOfPl(pl); const sp = b ? Math.hypot(b.vx, b.vy) / Math.max(8, this.vmax(b)) : 0;
          const act = live ? (0.75 + 0.9 * clamp(sp, 0, 1.2)) * (b && b.sprint ? 1.7 : 1) : 0.3;
          pl.en = Math.max(0, pl.en - Rules.drainPerSec(pl.mon.r.stamina, stratMult) * act * dt);
        }
        for (const pl of s.bench) pl.en = Math.min(100, pl.en + Rules.recoverPerSec(pl.mon.r.stamina) * dt);
      }
      this._rfT = (this._rfT || 0) + dt;
      if (this._rfT > 2) { this._rfT = 0; this.g.refresh(0); this.g.refresh(1); }
    }

    // ---------------------------------------------------------------- user input handling
    userInput(dt, inps) {
      if (this.auto) return;
      for (let sd = 0; sd < 2; sd++) if (this.humans[sd] && inps[sd]) this.onSide(sd, () => this._userInput(dt, inps[sd]));
    }
    _userInput(dt, inp) {
      const c = this.ctrl;
      const side = this.us;
      const hasBall = this.ball.holder === c;
      const offense = this.poss === side;
      // meter progress
      if (this.meter && this.meter.body.s === side) {
        // meter position tracks the jump: SWEET == apex of the shooter's jump
        this.meter.el += dt; this.meter.v = this.meter.el / this.meter.tApex * SWEET;
        if (!inp.held.X || this.meter.v >= 1.15) { this.releaseShot(this.meter.body, clamp(this.meter.v, 0, 1)); this.meter = null; }
      }
      if (!c) return;
      c.sprint = inp.rt > 0.3;
      c.stance = inp.held.LT && !offense;
      c.postUp = inp.held.LT && offense && hasBall;
      // movement intent
      const mag = Math.hypot(inp.mx, inp.my);
      if (c.stun <= 0 && c.shootT <= 0 && !(this.meter)) {
        const mv = mag > 0.05 ? 1 : 0;
        c.intent = { tx: c.x + inp.mx * 10, ty: c.y + inp.my * 10, sp: clamp(mag, 0, 1) * (c.sprint ? 1.25 : 1), manual: true, mx: inp.mx, my: inp.my };
        if (!mv) c.intent.sp = 0;
      } else c.intent = { tx: c.x, ty: c.y, sp: 0, manual: true, mx: 0, my: 0 };
      const P = inp.pressed;
      if (this.phase === 'inbound') {
        if (this.inboundSide === side && this.inbounder && this.inbounder.s === side) {
          // user inbounds with A (directional) when ready
          if (P.A || P.B) { this.userPassAction(inp, true, P.B ? 'bounce' : 'chest'); }
        }
        return;
      }
      if (this.phase !== 'live') return;
      if (offense) {
        if (hasBall) {
          if (inp.held.RB) this.iconPassCheck(inp);
          else {
            if (P.A) this.userPassAction(inp, false, 'chest');
            if (P.B) this.userPassAction(inp, false, 'bounce');
            if (P.X && !c.shootT && !this.meter) this.startShot(c, true);
            if (P.Y) this.lobPass(c);
          }
          if (Math.hypot(inp.rx, inp.ry) > 0.6) this.dribbleMove(c, inp.rx, inp.ry);
        } else {
          if (P.Y) this.jumpForBall(c);
          if (P.A) this.askBall = { b: c, t: this.t };
        }
        if (P.LB) this.callScreen();
      } else {
        // defense
        if (P.A) this.switchDefender();
        if (P.RB) this.cycleDefender(1);
        if (P.X) this.stealAttempt(c);
        if (P.Y) { if (this.ball.state === 'flight' && this.shot) this.blockJump(c, true); else this.jumpForBall(c); }
        if (P.B) this.chargeStance(c);
        if (P.LB) this.cycleDefScheme();
        if (Math.hypot(inp.rx, inp.ry) > 0.35) this.helpCall = { x: inp.rx, y: inp.ry, t: this.t }; else if (this.helpCall && this.t - this.helpCall.t > 0.2) this.helpCall = null;
      }
      // any key on a loose ball near me -> rebound jump
      if (P.Y && (this.ball.state === 'loose' || (this.shot && !this.shot.done))) this.jumpForBall(c);
    }

    // ---------------------------------------------------------------- passing
    // pass to a teammate; kind: 'chest' | 'lob' | 'bounce'
    passTo(from, to, kind, quality) {
      if (this.ball.holder !== from || !to) return false;
      const s = from.s;
      const lead = kind === 'lob' ? 0.5 : 0.16;
      const tx = to.x + to.vx * lead, ty = to.y + to.vy * lead;
      const dx = tx - from.x, dy = ty - from.y, d = Math.max(0.5, Math.hypot(dx, dy));
      // accuracy
      const pr = this.eff(from, 'pass');
      const press = this.pressure(from);
      let err = (this.rng.gauss() * (0.012 + (100 - pr) * 0.0014)) * (1 + press * 1.2) * (quality || 1);
      const ang = Math.atan2(dy, dx) + err;
      const sp = PASS_SPEED * (kind === 'lob' ? 0.8 : kind === 'bounce' ? 0.8 : 1);
      this.ball.holder = null; this.ball.state = 'flight';
      this.ball.x = from.x + Math.cos(ang) * 1.2; this.ball.y = from.y + Math.sin(ang) * 1.2;
      this.ball.z = kind === 'lob' ? 7 : 4.5;
      this.ball.vx = Math.cos(ang) * sp; this.ball.vy = Math.sin(ang) * sp;
      this.ball.vz = kind === 'lob' ? 12 : 0.4;
      this.ball.flight = { type: 'pass', from, to, kind, t0: this.t, dist: d, interceptChecked: false, bounce: kind === 'bounce' };
      this.lastTouch = from; this.lastPass = { from, to, t: this.t };
      from.immune = 0; from.passT = 0.25;
      if (this.isHuman(from.s) && to.s === from.s) this.onSide(from.s, () => { this.ctrlLock = 0; this.setCtrl(to); this.ctrlLock = 0.1; });
      return true;
    }
    userPassAction(inp, inbound, kind) {
      const c = inbound ? this.inbounder : this.ctrl;
      if (!c || this.ball.holder !== c) return;
      const mates = this.bodies[this.us].filter(b => b !== c);
      let tgt = null;
      const mag = Math.hypot(inp.mx, inp.my);
      if (mag > 0.4) {
        // directional pass: closest-angle teammate, weighted by distance
        const ang = Math.atan2(inp.my, inp.mx);
        let best = 1e9;
        for (const m of mates) {
          const a = Math.atan2(m.y - c.y, m.x - c.x);
          let da = Math.abs(((a - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (da > 1.1) continue;
          const sc = da * 18 + dist(c, m) * 0.12;
          if (sc < best) { best = sc; tgt = m; }
        }
      }
      if (!tgt) {
        // smart default: best open teammate toward the basket
        let best = -1e9;
        for (const m of mates) { const sc = this.openScore(m, c); if (sc > best) { best = sc; tgt = m; } }
      }
      if (tgt) this.passTo(c, tgt, kind || 'chest');
    }
    iconPassCheck(inp) {
      // while RB held, A/B/X/Y pass to icons (assigned left->right by court x in attack direction)
      const c = this.ctrl; if (!c || this.ball.holder !== c) return;
      const mates = this.bodies[this.us].filter(b => b !== c).sort((a, b) => a.slot - b.slot);
      const map = { A: 0, B: 1, X: 2, Y: 3 };
      for (const k of ['A', 'B', 'X', 'Y']) if (inp.pressed[k] && mates[map[k]]) { this.passTo(c, mates[map[k]], 'chest'); return; }
    }
    iconTargets() {
      const c = this.ctrl; if (!c) return [];
      return this.bodies[this.us].filter(b => b !== c).sort((a, b) => a.slot - b.slot).map((b, i) => ({ b, key: ['A', 'B', 'X', 'Y'][i] }));
    }
    lobPass(c) {
      // alley-oop to the teammate nearest the rim
      const mates = this.bodies[this.us].filter(b => b !== c);
      const bx = ATTACK_X(this.us);
      let best = null, bd = 1e9;
      for (const m of mates) { const d = Math.hypot(m.x - bx, m.y - 25); if (d < bd) { bd = d; best = m; } }
      if (best) { best.ai.alley = this.t + 2.0; this.passTo(c, best, 'lob'); }
    }
    openScore(m, from) {
      const s = m.s; const bx = ATTACK_X(s);
      const dd = this.nearestDefDist(m);
      const toBasket = Math.hypot(m.x - bx, m.y - 25);
      const laneBlock = this.laneBlocked(from, m) ? 14 : 0;
      return dd * 2.2 - toBasket * 0.35 + m.mon.ovr * 0.1 - laneBlock + (m.ai.cut ? 4 : 0);
    }
    nearestDefDist(b) {
      let d = 99; for (const o of this.bodies[1 - b.s]) { const dd = dist(o, b); if (dd < d) d = dd; } return d;
    }
    nearestDef(b, maxD) {
      let best = null, bd = maxD || 99; for (const o of this.bodies[1 - b.s]) { const dd = dist(o, b); if (dd < bd) { bd = dd; best = o; } } return best;
    }
    laneBlocked(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      for (const o of this.bodies[1 - a.s]) {
        const t = clamp(((o.x - a.x) * dx + (o.y - a.y) * dy) / L2, 0, 1);
        const px = a.x + dx * t, py = a.y + dy * t;
        if (t > 0.1 && t < 0.9 && Math.hypot(o.x - px, o.y - py) < 2.3) return true;
      }
      return false;
    }
    pressure(b) { const d = this.nearestDefDist(b); return clamp(1 - (d - 1.5) / 6, 0, 1); }

    // ---------------------------------------------------------------- moves
    dribbleMove(c, rx, ry) {
      if (c.evade > 0 || c.moveCd > this.t) return;
      c.moveCd = this.t + 0.55;
      this.evadeMove(c, Math.atan2(ry, rx), 'cross');
    }
    // evade: burst in direction ang, test vs the nearest defender
    evadeMove(c, ang, kind) {
      const d = this.nearestDef(c, 6);
      c.evade = kind === 'step' ? 0.34 : 0.42; c.evadeAng = ang; c.evadeKind = kind;
      c.vx += Math.cos(ang) * 8; c.vy += Math.sin(ang) * 8;
      if (d) {
        const win = this.eff(c, 'handle') + this.eff(c, 'accel') * 0.3 - this.eff(d, 'perD') * 0.8 - this.eff(d, 'speed') * 0.3 + this.rng.gauss() * 12 + (kind === 'euro' ? 6 : 0);
        if (win > 4) { d.stun = 0.30 + clamp(win / 80, 0, 0.35); d.stunDir = { x: -Math.cos(ang), y: -Math.sin(ang) }; c.immune = 0.55; c.beat = this.t; if (kind === 'step') c.stepBack = this.t; }
        else if (win < -14 && this.rng.chance(0.3)) { this.stealTry(d, c, 0.5); }
      }
    }
    callScreen() {
      const c = this.ctrl; if (!c) return;
      const mates = this.bodies[this.us].filter(b => b !== c && b !== this.ball.holder);
      let best = null, bs = -1e9;
      for (const m of mates) { const sc = this.eff(m, 'strength') * 0.5 + m.mon.r.sW * 20 - dist(m, c) * 1.2; if (sc > bs) { bs = sc; best = m; } }
      if (!best) return;
      const h = this.ball.holder || c;
      const dfd = this.nearestDef(h, 20);
      best.ai.screenFor = h; best.ai.screenT = this.t + 3.0; best.screenDef = dfd;
      this.say('Screen!');
    }
    switchDefender() {
      // A on defense: switch to the defender nearest the ball
      const tgt = this.ball.holder || this.ball;
      let best = null, bd = 1e9;
      for (const b of this.bodies[this.us]) { if (b === this.ctrl) continue; const d = Math.hypot(b.x - tgt.x, b.y - tgt.y); if (d < bd) { bd = d; best = b; } }
      if (best) this.setCtrl(best);
    }
    cycleDefender(dir) {
      const list = this.bodies[this.us].slice().sort((a, b) => a.slot - b.slot);
      const i = list.indexOf(this.ctrl);
      this.setCtrl(list[(i + dir + 5) % 5]);
    }
    cycleDefScheme() {
      const keys = Object.keys(PB.DEF_STRATS);
      const s = this.gs(this.us).strat; const i = keys.indexOf(s.def);
      s.def = keys[(i + 1) % keys.length];
      this.say('Defense: ' + PB.DEF_STRATS[s.def], true);
    }
    chargeStance(c) { c.charge = 0.9; c.stance = true; }

    // ---------------------------------------------------------------- shooting
    shotTypeFor(b) {
      const s = b.s; const bx = ATTACK_X(s);
      const d = Math.hypot(b.x - bx, b.y - 25);
      if (d <= 7.0) return 'rim';
      if (b.postUp && d <= 17) return 'post';
      if (isThree(b.x, b.y, bx)) return 'three';
      return 'mid';
    }
    startShot(b, user) {
      if (this.ball.holder !== b || b.shootT > 0) return;
      const type = this.shotTypeFor(b);
      b.shotType = type; b.relSpeed = Math.hypot(b.vx, b.vy);
      const bx = ATTACK_X(b.s);
      // facing the basket
      b.face = Math.sign(bx - b.x) || b.face;
      if (type === 'rim') {
        // layup / dunk animation, no meter
        const dunk = this.eff(b, 'dunk') > 55 && (b.sprint || Math.hypot(b.vx, b.vy) > 7 || Math.hypot(b.x - bx, b.y - 25) < 3.5) && this.eff(b, 'dunk') * 0.6 + this.jumpH(b) * 8 > 44;
        b.rimKind = dunk ? 'dunk' : 'layup';
        b.shootT = dunk ? 0.5 : 0.42; b.shootTotal = b.shootT; b.vz = 11; b.jump = 1; b.jumpKind = 'shot';
        b.rimStart = { x: b.x, y: b.y };
        b.shotAim = { quality: 0.6 };
        b.shotUser = user;
        return;
      }
      // jumper: short gather (dip), then the jump; the ideal release is at the apex like a real jump shot
      const GATHER = 0.16;
      const vz = 7.2 + this.jumpH(b) * 1.1;                // 8.7 .. 11 ft/s takeoff
      const tApex = GATHER + vz / 32.2;
      b.gather = GATHER; b.gatherVz = vz; b.jumpKind = 'shot';
      b.shotUser = user;
      if (user && this.shotMeterOn && this.isHuman(b.s)) {
        this.meter = { body: b, v: 0, el: 0, tApex };
        b.shootT = 99;      // held until release
      } else {
        // AI/no-meter: release near the apex, quality from ratings
        const r = type === 'three' ? 'three' : type === 'post' ? 'post' : 'mid';
        const q = clamp(0.55 + (this.eff(b, r) - 60) * 0.004 + this.rng.gauss() * 0.16, 0.02, 0.99);
        b.shotAim = { quality: q };
        b.shootT = tApex; b.release = true;
      }
    }
    // user released the meter at fill level v
    // timing windows (fraction of the meter): green = perfect, inside yw = slightly early/late, beyond = bad
    meterWindows(b, ft) {
      const key = ft ? 'ft' : b.shotType === 'three' ? 'three' : b.shotType === 'post' ? 'post' : 'mid';
      const r = this.eff(b, key);
      return { gw: 0.022 + r * 0.0004, yw: 0.085 + r * 0.0005 };
    }
    gradeTiming(v, win) {
      const e = v - SWEET, ae = Math.abs(e);
      const side = e < 0 ? 'Early' : 'Late';
      if (ae <= win.gw) return { grade: 'green', text: 'EXCELLENT', col: '#2fd47a', e: ae };
      if (ae <= win.yw) return { grade: 'ok', text: 'Slightly ' + side, col: '#ffcb05', e: ae };
      return { grade: 'bad', text: 'Very ' + side, col: '#ff5a5f', e: ae };
    }
    // apply the timing grade to a base make probability (contest c dampens greens)
    applyTiming(p, g, win, c) {
      if (g.grade === 'green') return p + (1 - p) * 0.62 * (1 - 0.45 * c);
      if (g.grade === 'ok') return p * (1 - 0.40 * (g.e - win.gw) / (win.yw - win.gw));
      return p * Math.max(0.12, 0.5 - (g.e - win.yw) * 2.5);
    }
    releaseShot(b, v) {
      const win = this.meterWindows(b);
      const g = this.gradeTiming(v, win);
      b.shotAim = { quality: 0.55, meter: v, grade: g, win };
      this.feedback = { text: g.text, col: g.col, t: this.t, b };
      b.shootT = 0.02; b.release = true;
    }
    // called when body shotT expires with release flag: ball leaves hand
    launchShot(b) {
      const s = b.s, bx = ATTACK_X(s);
      const type = b.shotType;
      const R = this.effR(b);
      const dfd = this.contester(b);
      const dd = dfd ? dist(dfd, b) : 12;
      // contest quality: distance, whether defender is in the shooting lane (between shooter and basket), jumped (block) bonus
      let c = clamp(1 - (dd - 1.2) / 5.5, 0, 1);
      if (dfd) {
        const toB = Math.atan2(25 - b.y, bx - b.x), toD = Math.atan2(dfd.y - b.y, dfd.x - b.x);
        const da = Math.abs(((toD - toB + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        c *= (0.55 + 0.45 * clamp(1 - da / 1.6, 0, 1));
        if (dfd.block > 0 || dfd.jump) c = Math.min(1, c + 0.15);
        c *= clamp(0.75 + (this.reach(dfd) - this.reach(b)) * 0.07, 0.5, 1.15);
      }
      let Dr = dfd ? this.effR(dfd) : { perD: 56, intD: 58, strength: 55, iq: 55, block: 55 };
      Dr = { perD: 56 + (Dr.perD - 56) * c, intD: 58 + (Dr.intD - 58) * c, strength: Dr.strength, iq: Dr.iq, block: Dr.block };
      const gS = this.gs(s), gO = this.gs(1 - s);
      const T = { spacing: gS.ctx.spacing, playm: gS.ctx.playm, rimProtD: gO.ctx.rimProtD };
      const q = b.shotAim ? b.shotAim.quality : 0.55;
      let adj = (0.35 - c) * (type === 'rim' ? 0.13 : 0.08) - Match.PLAY_TUNE[type];
      adj += (q - 0.55) * (type === 'rim' ? 0.10 : 0.22);
      adj += (this.userHome === (s === 0) ? 0.008 : 0);                 // home court
      adj += this.g.form[this.gi[s]] - this.g.form[this.gi[1 - s]] * 0.5 + (this.g.diff[this.gi[s]] - this.g.diff[this.gi[1 - s]]) * 0.5;
      const strat = gS.strat, dstrat = gO.strat;
      if (dstrat.def === 'lockdown') adj -= 0.004;
      if (dstrat.def === 'zone') adj += type === 'three' ? 0.008 : type === 'rim' ? -0.018 : 0;
      if (b.stepBack && this.t - b.stepBack < 1.2 && type !== 'rim') adj += 0.05;
      if (b.beat && this.t - b.beat < 0.9) adj += 0.03;
      if (b.rimKind === 'dunk') adj += 0.07;
      if (b.ai && b.ai.alley && this.t < b.ai.alley) adj += 0.12;
      if (this.shot && this.shot.catchShoot) adj += 0.01;
      // momentum: jumpers off a hard run are harder, attacking the rim at speed is easier
      const spd = b.relSpeed || 0;
      if (type === 'rim') adj += 0.006 * Math.min(spd, 15) * (b.mon.r.mob || 1);
      else if (!(b.stepBack && this.t - b.stepBack < 1.2)) adj -= Math.min(0.14, 0.012 * Math.max(0, spd - 6.5));
      let pMake = Rules.makeProb(type === 'rim' ? 'rim' : type, R, Dr, T, adj);
      if (type === 'rim' && b.rimKind === 'dunk') pMake = clamp(pMake + 0.06 + (R.dunk - 60) * 0.002, 0.2, 0.97);
      if (b.shotAim && b.shotAim.grade) pMake = clamp(this.applyTiming(pMake, b.shotAim.grade, b.shotAim.win, c), 0.02, 0.97);
      // shooting foul
      const fProb = dfd ? Rules.foulProb(type, R, this.effR(dfd)) * (0.8 + c * 1.5) * (b.rimKind === 'dunk' ? 0.8 : 1) : 0;
      const fouled = dfd && this.rng.chance(fProb);
      if (fouled) pMake *= 0.82;
      // block: defender jumping near shooter
      let blocked = false;
      if (dfd && (dfd.block > 0 || dfd.jump) && dd < 4.5) {
        const pb = Rules.blockProb(type, R, this.effR(dfd)) * (dfd.blockTimed ? 2.2 : 1.1) * (0.5 + c);
        blocked = this.rng.chance(clamp(pb, 0, 0.55));
        if (blocked) { this.blockShot(b, dfd, type); return; }
      }
      const made = this.rng.chance(pMake);
      this._shootBall(b, type, made, fouled ? dfd : null, c, q);
    }
    contester(b) {
      let best = null, bs = 1e9;
      for (const o of this.bodies[1 - b.s]) {
        const d = dist(o, b); if (d > 9) continue;
        const sc = d - (o.block > 0 ? 1.5 : 0);
        if (sc < bs) { bs = sc; best = o; }
      }
      return best;
    }
    _shootBall(b, type, made, foulBy, c, q) {
      const bx = ATTACK_X(b.s);
      const isTh = type === 'three';
      this.shot = { shooter: b, type, made, foulBy, c, q, three: isTh, x0: b.x, y0: b.y, done: false, t0: this.t, dist: Math.hypot(b.x - bx, b.y - 25), catchShoot: this.shot && this.shot.catchShoot };
      b.pl.st.fga++; if (isTh) b.pl.st.tpa++;
      { const k = type + (made ? '-make' : '-miss'); this.sstat[k] = (this.sstat[k] || 0) + 1; const c10 = 'c' + Math.min(4, Math.floor(c * 5)) + (made ? 'm' : 'x'); this.sstat[c10] = (this.sstat[c10] || 0) + 1; }
      // assist context
      if (this.lastPass && this.lastPass.to === b && this.t - this.lastPass.t < 1.8 && this.lastPass.from !== b) this.shot.assist = this.lastPass.from;
      this.ball.holder = null; this.ball.state = 'flight';
      const d = this.shot.dist;
      const hx = bx, hy = 25;
      // aim target: make -> center ; miss -> off the rim
      let tx = hx, ty = hy;
      if (!made) { const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(0.7, 1.1); tx = hx + Math.cos(a) * r; ty = hy + Math.sin(a) * r; }
      const dx = tx - b.x, dy = ty - b.y, D = Math.max(1, Math.hypot(dx, dy));
      const vh = clamp(D / (0.55 + D * 0.018), 6, 40);      // horizontal speed
      const T = D / vh;
      this.ball.x = b.x; this.ball.y = b.y; this.ball.z = BODY_H(b) + 1.2 + b.z;
      this.ball.vx = dx / T; this.ball.vy = dy / T;
      const g = 32.2; this.ball.vz = (RIM_Z - this.ball.z + 0.5 * g * T * T) / T;
      this.ball.flight = { type: 'shot', T, t0: this.t, tx, ty };
      this.lastTouch = b;
      this.clearLocks();
      this.pickShotCtrl();
      if (foulBy) { this.shot.foul = true; this.whistleShootingFoul(foulBy, b); }
      b.shotAim = null; b.release = false;
      this.shotClockFrozen = false;
    }
    pickShotCtrl() { }
    blockShot(b, d, type) {
      d.pl.st.blk++; this.sfx.push('block'); this.sfx.push({ kind: 'block', side: d.s }); b.pl.st.fga++; if (type === 'three') b.pl.st.tpa++;
      this.say('BLOCKED by ' + d.mon.dispName + '!', true);
      this.ball.holder = null; this.ball.state = 'loose'; this.ball.flight = null;
      const a = Math.atan2(b.y - d.y, b.x - d.x) + this.rng.range(-1, 1);
      const sp = this.rng.range(10, 20);
      this.ball.x = b.x + (d.x - b.x) * 0.5; this.ball.y = b.y + (d.y - b.y) * 0.5; this.ball.z = this.reach(d);
      this.ball.vx = Math.cos(a) * sp; this.ball.vy = Math.sin(a) * sp; this.ball.vz = 3;
      this.lastTouch = d; this.shot = null; this.blockedBall = true; this.lastPass = null;
      b.jumpKind = null;
    }
    whistleShootingFoul(def, shooter) {
      def.pl.st.pf++; this.teamFouls[def.s]++; this.g.teamFouls[this.gi[def.s]] = this.teamFouls[def.s]; this.sfx.push('whistle');
      if (def.pl.st.pf >= 6) def.pl.dq = true;
      this.say('Shooting foul on ' + def.mon.dispName, true);
    }

    // ---------------------------------------------------------------- defensive actions
    stealAttempt(d) {
      if (d.stealCd > 0) return;
      d.stealCd = 0.7; d.reachT = 0.28;
      const h = this.ball.holder;
      if (!h || h.s === d.s) { return; }
      this.stealTry(d, h, 1.0);
    }
    stealTry(d, h, mult) {
      const dd = dist(d, h);
      if (dd > 3.4) { return; }
      if (h.immune > 0) return;
      const sr = this.eff(d, 'steal'), hr = this.eff(h, 'handle');
      let p = clamp(0.22 + (sr - hr) * 0.0075 + (this.pressure(h) * 0.05), 0.04, 0.6) * mult;
      if (d.stance) p *= 1.15;
      if (h.sprint) p *= 0.8;
      if (this.rng.chance(p)) {
        this.stealBall(d, h);
      } else if (this.rng.chance(0.15 * (this.gs(d.s).strat.def === 'press' ? 1.2 : 1) * (1 + (this.eff(h, 'iq') - this.eff(d, 'iq')) * 0.004))) {
        this.nonShootingFoul(d, h, 'Reach-in foul');
      }
    }
    stealBall(d, h) {
      d.pl.st.stl++; h.pl.st.tov++; this.sfx.push('steal'); this.sfx.push({ kind: 'steal', side: d.s });
      this.say('STEAL by ' + d.mon.dispName + '!', true);
      this.ball.holder = d; this.ball.state = 'held'; this.ball.flight = null;
      this.changePoss(d.s, true);
      this.lastPass = null; d.immune = 0.4;
    }
    blockJump(c, user) {
      if (c.jump || c.block > 0) return;
      c.block = 0.55; c.jump = 1; c.jumpKind = 'block'; c.vz = 9 + this.jumpH(c);
      c.blockTimed = !!(this.shot && !this.shot.done && this.t - this.shot.t0 < 0.2 + this.shot.dist * 0.01) || (this.shot && this.shot.shooter.shootT > 0);
    }
    jumpForBall(c) {
      if (c.jump) return;
      c.jump = 1; c.jumpKind = 'reb'; c.vz = 9 + this.jumpH(c); c.rebJump = this.t;
    }

    nonShootingFoul(def, off, text) {
      def.pl.st.pf++; this.teamFouls[def.s]++; this.g.teamFouls[this.gi[def.s]] = this.teamFouls[def.s]; this.sfx.push('whistle');
      if (def.pl.st.pf >= 6) def.pl.dq = true;
      this.say((text || 'Foul') + ' on ' + def.mon.dispName, true);
      this.stopForFoul(def, off);
    }
    stopForFoul(def, off) {
      this.shot = null;
      const inBonus = this.teamFouls[def.s] >= 5;
      if (inBonus) { this.startFT(off.s, off, 2, false); return; }
      this.setInbound(off.s, this.ball.holder ? this.ball.holder.x : off.x, this.ball.holder ? (off.y < 25 ? 0 : 50) : (off.y < 25 ? 0 : 50), 'foul');
      this.shotClock = Math.max(this.shotClock, 14);
    }
    offensiveFoul(off, def) {
      this.sfx.push('whistle'); off.pl.st.pf++; off.pl.st.tov++; this.teamFouls[off.s]++; this.g.teamFouls[this.gi[off.s]] = this.teamFouls[off.s];
      if (off.pl.st.pf >= 6) off.pl.dq = true;
      this.say('OFFENSIVE FOUL on ' + off.mon.dispName, true);
      this.shot = null;
      this.changePoss(1 - off.s, false);
      this.setInbound(1 - off.s, off.x, off.y < 25 ? 0 : 50, 'foul');
    }

    // ---------------------------------------------------------------- free throws
    startFT(side, shooter, n, andOne, continuePoss) {
      this.phase = 'ft'; this.sim.clockRun = false;
      this.ft = { side, shooter, n, i: 0, made: 0, t: 1.0, state: 'wait', meter: null, andOne, nBase: n };
      this.ball.holder = shooter; this.ball.state = 'held'; this.ball.flight = null; this.shot = null; this.meter = null;
      this.doSubs();
      this.rebindFTShooter();
      this.arrangeFT();
      this.clearLocks();
      if (this.isHuman(shooter.s)) this.onSide(shooter.s, () => { this.ctrl && (this.ctrl.ctl = false); this.ctrl = shooter; shooter.ctl = true; });
      this.say(shooter.mon.dispName + ' to the line (' + n + ')');
    }
    rebindFTShooter() { }
    arrangeFT() {
      const f = this.ft, s = f.side;
      const bx = ATTACK_X(s), dir = DIR(s);
      const lineX = bx - dir * 15.5 - 0.0;
      const sh = f.shooter;
      sh.x = bx - dir * 15.0 - dir * 0.0; sh.y = 25; sh.vx = sh.vy = 0; sh.face = dir;
      // lane spots (x offsets from basket along the lane)
      const laneSpots = [[-dir * 6, 19], [-dir * 6, 31], [-dir * 10.5, 19], [-dir * 10.5, 31], [-dir * 14, 22]];
      const spotsOff = [[bx - dir * 12, 18.5], [bx - dir * 12, 31.5], [bx - dir * 19, 20], [bx - dir * 19, 30]];
      const offOthers = this.bodies[s].filter(b => b !== sh);
      const defs = this.bodies[1 - s];
      const lane = [[bx - dir * 6.5, 18.2], [bx - dir * 6.5, 31.8], [bx - dir * 10.5, 18.2], [bx - dir * 10.5, 31.8]];
      defs.slice(0, 4).forEach((d, i) => { d.x = lane[i][0]; d.y = lane[i][1]; d.vx = d.vy = 0; });
      defs[4].x = bx - dir * 24; defs[4].y = 25; defs[4].vx = defs[4].vy = 0;
      offOthers.slice(0, 4).forEach((o, i) => { const sp = [[bx - dir * 8.5, 18.2], [bx - dir * 8.5, 31.8], [bx - dir * 12.5, 18.2], [bx - dir * 12.5, 31.8]][i]; o.x = sp[0]; o.y = sp[1]; o.vx = o.vy = 0; });
      this.ball.x = sh.x; this.ball.y = sh.y; this.ball.z = 4.5;
    }
    updateFT(dt, inps) {
      const f = this.ft, sh = f.shooter;
      const inp = inps && inps[sh.s];
      const user = this.isHuman(sh.s);
      if (f.state === 'wait') {
        f.t -= dt;
        if (f.t <= 0) {
          if (user && this.shotMeterOn) { f.state = 'meter'; f.meterV = 0; }
          else { f.state = 'aim'; f.t = 0.7; }
        }
      } else if (f.state === 'meter') {
        f.meterV += dt / 0.85;
        if ((inp && inp.pressed.X) || f.meterV >= 1.1) { const win = this.meterWindows(f.shooter, true); f.grade = this.gradeTiming(clamp(f.meterV, 0, 1.1), win); f.win = win; this.feedback = { text: f.grade.text, col: f.grade.col, t: this.t, b: f.shooter }; f.state = 'aim'; f.t = 0.15; f.meterV = clamp(f.meterV, 0, 1.1); }
        else if (inp && inp.pressed.B === undefined) { }
      } else if (f.state === 'aim') {
        f.t -= dt;
        if (f.t <= 0) this.shootFT();
      } else if (f.state === 'fly') {
        f.t -= dt;
        // animate ball
        const T = 0.75, u = clamp(1 - f.t / T, 0, 1);
        const bx = ATTACK_X(f.side);
        this.ball.x = PB.lerp(sh.x, bx, u); this.ball.y = 25; this.ball.z = 5 + Math.sin(u * Math.PI) * 7 + (RIM_Z - 5) * u * 0.6;
        if (f.t <= 0) this.resolveFT();
      } else if (f.state === 'between') {
        f.t -= dt; if (f.t <= 0) { f.state = 'wait'; f.t = 0.5; this.ball.x = sh.x; this.ball.y = sh.y; this.ball.z = 4.5; this.ball.holder = sh; this.ball.state = 'held'; }
      }
    }
    shootFT() {
      const f = this.ft, sh = f.shooter;
      sh.pl.st.fta++;
      const user = this.isHuman(sh.s) && this.shotMeterOn;
      let p = Rules.ftProb(this.eff(sh, 'ft')) + this.g.form[this.gi[sh.s]] * 0.3;
      if (user && f.grade) p = this.applyTiming(clamp(p, 0.1, 0.95), f.grade, f.win, 0);
      f.grade = null;
      f.made1 = this.rng.chance(clamp(p, 0.15, 0.985));
      f.state = 'fly'; f.t = 0.75; this.ball.holder = null; this.ball.state = 'flight'; this.ball.flight = { type: 'ft' };
      f.q = null;
    }
    resolveFT() {
      const f = this.ft, sh = f.shooter;
      f.i++;
      this.sfx.push(f.made1 ? 'swish' : 'rim');
      if (f.made1) { sh.pl.st.ftm++; this.g._addPoints(this.gi[sh.s], 1, sh.pl); f.made++; }
      const last = f.i >= f.n;
      if (!last) { f.state = 'between'; f.t = 0.6; this.ball.flight = null; this.ball.state = 'held'; return; }
      // sequence over
      this.ft = null; this.ball.flight = null;
      if (f.made1) {
        // made last: other team inbounds at baseline (unless ending quarter)
        this.afterScore(sh.s);
      } else {
        // missed last: live rebound
        this.phase = 'live'; this.sim.clockRun = true; this.shotClock = 14; this.poss = sh.s;
        const bx = ATTACK_X(sh.s);
        this.ball.state = 'loose'; this.ball.holder = null;
        this.ball.x = bx - DIR(sh.s) * 1.0; this.ball.y = 25 + this.rng.range(-1.5, 1.5); this.ball.z = 10;
        this.ball.vx = -DIR(sh.s) * this.rng.range(2, 9); this.ball.vy = this.rng.range(-5, 5); this.ball.vz = 0;
        this.shot = { shooter: sh, type: 'ft', made: false, done: false, ftMiss: true, three: false, t0: this.t, dist: 15 };
        this.rebT = 0;
        // line up for the rebound
        const bodies = this.allBodies();
        this.lastTouch = sh;
        this.clearLocks(); this.pickCtrl(true);
      }
    }

    // ---------------------------------------------------------------- scoring & possessions
    afterScore(scoringSide) {
      // made basket or last free throw: opponent inbounds from baseline; clock stopped until pass
      this.shot = null;
      if (this.clock <= 0.01) { this.clock = 0; this.endQuarter(); return; }
      this.changePoss(1 - scoringSide, false);
      this.setInbound(1 - scoringSide, 0, 25, 'made');
    }
    changePoss(side, live) {
      this.poss = side; this.shotClock = 24; this.frontcourt = [false, false];
      this.ai0 = null; this.fcT = [null, null];
      this.press = this.gs(1 - side).strat.def === 'press';
      this.passPending = null;
      this.possT = this.t;
      this.playState = null;
    }
    score(b, type, made) {
      // credit made basket (called by ball resolution)
      const pts = type === 'three' ? 3 : 2;
      const st = b.pl.st; st.fgm++; if (type === 'three') st.tpm++;
      this.g._addPoints(this.gi[b.s], pts, b.pl);
      const as = this.shot && this.shot.assist;
      if (as && as !== b) { const p = as.pl.st; p.ast++; }
      this.sfx.push(type === 'rim' && b.rimKind === 'dunk' ? 'dunk' : 'swish');
      if (type === 'three' || (type === 'rim' && b.rimKind === 'dunk')) this.sfx.push({ kind: type === 'three' ? 'three' : 'dunk', side: b.s });
      this.say((type === 'three' ? '3PT! ' : type === 'rim' && b.rimKind === 'dunk' ? 'DUNK! ' : '') + b.mon.dispName + ' scores (' + this.sc(b.s) + '-' + this.sc(1 - b.s) + ')', type === 'three' || (b.rimKind === 'dunk' && type === 'rim'));
    }
    violation(kind) {
      const s = this.poss;
      if (kind === 'shot') {
        this.say('SHOT CLOCK VIOLATION', true); this.sfx.push('buzzer');
        const h = this.ball.holder; if (h) h.pl.st.tov++; else if (this.lastTouch && this.lastTouch.s === s) this.lastTouch.pl.st.tov++;
      }
      this.shot = null;
      this.changePoss(1 - s, false);
      const bx = this.ball.x, by = this.ball.y;
      this.setInbound(1 - s, clamp(bx, 6, W - 6), by < 25 ? 0 : 50, 'oob');
    }
    outOfBounds(lastTouchBody) {
      // ball left the court: opponent of last toucher gets it
      const s = lastTouchBody ? 1 - lastTouchBody.s : 1 - this.poss;
      this.say('Out of bounds', true);
      if (lastTouchBody) { if (this.ball.flight && this.ball.flight.type === 'pass' || lastTouchBody.s === this.poss) lastTouchBody.pl.st.tov += (lastTouchBody.s === this.poss ? 1 : 0); }
      this.shot = null;
      const bx = clamp(this.ball.x, 6, W - 6), by = this.ball.y;
      this.changePoss(s, false);
      let y = by < 25 ? 0 : 50;
      let x = bx;
      this.setInbound(s, x, y, 'oob');
    }

    // ---------------------------------------------------------------- physics
    moveBody(b, dt) {
      b.stealCd = Math.max(0, b.stealCd - dt); b.immune = Math.max(0, b.immune - dt); b.reachT = Math.max(0, b.reachT - dt);
      b.passT = Math.max(0, (b.passT || 0) - dt);
      if (b.charge > 0) b.charge -= dt; else if (b.charge <= 0) { b.charge = 0; }
      if (b.block > 0) b.block -= dt;
      // jump-shot gather, then takeoff
      if (b.gather > 0) { b.gather -= dt; if (b.gather <= 0) { b.gather = 0; b.jump = 1; b.vz = b.gatherVz; } }
      // vertical
      if (b.jump) {
        b.vz -= 32.2 * dt; b.z += b.vz * dt;
        if (b.z <= 0) { b.z = 0; b.vz = 0; b.jump = 0; b.jumpKind = b.jumpKind === 'shot' ? b.jumpKind : null; b.blockTimed = false; }
      }
      // shooting windup / release
      if (b.shootT > 0) {
        b.shootT -= dt;
        if (b.rimKind && b.jumpKind === 'shot' && b.shotType === 'rim') {
          // drift toward rim during layup/dunk
          const bx = ATTACK_X(b.s);
          b.x += (bx - b.x) * Math.min(1, dt * 4.5); b.y += (25 - b.y) * Math.min(1, dt * 3.5);
          if (b.shootT <= (b.shootTotal || 0.4) * 0.45 && this.ball.holder === b && !b.released) { b.released = true; this.launchShot(b); }
        } else if (b.release && b.shootT <= 0 && this.ball.holder === b) { b.release = false; this.launchShot(b); }
        if (b.shootT <= 0 && b.shootT > -1) { b.shootT = 0; b.released = false; if (b.rimKind) { b.rimKind = null; } }
      }
      if (b.stun > 0) b.stun -= dt;
      if (b.evade > 0) b.evade -= dt;
      const it = b.intent;
      // AI targets are low-pass filtered so tiny frame-to-frame changes don't make bodies twitch
      if (!it.manual) {
        if (b._tx == null || Math.hypot(it.tx - b._tx, it.ty - b._ty) > 12) { b._tx = it.tx; b._ty = it.ty; }
        else { const kf = Math.min(1, dt * 6); b._tx += (it.tx - b._tx) * kf; b._ty += (it.ty - b._ty) * kf; }
      }
      let tx = it.manual ? it.tx : b._tx, ty = it.manual ? it.ty : b._ty, sp = it.sp;
      let dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
      // arrival dead-zone with hysteresis: settle instead of oscillating around the spot
      if (!it.manual) { if (b._settled ? d < 1.6 : d < 0.7) { b._settled = true; d = 0; dx = dy = 0; } else b._settled = false; }
      let vmax = this.vmax(b) * (it.manual ? 1 : 1);
      if (it.manual) { const mx = it.mx, my = it.my; const m = Math.hypot(mx, my); dx = m > 0.01 ? mx / m : 0; dy = m > 0.01 ? my / m : 0; d = m > 0.01 ? 1 : 0; }
      if (this.ball.holder === b) vmax *= 0.90 + 0.10 * this.eff(b, 'handle') / 100;
      if (b.stance) vmax *= 0.72;
      if (b.sprint || sp > 1) vmax *= (it.onBall ? 1.12 : 1.18);
      else if (it.onBall) vmax *= 1.05;
      if (b.stun > 0) vmax *= 0.35;
      if (b.shootT > 0 || (b.jump && b.jumpKind === 'shot')) vmax *= 0.25;
      if (b.charge > 0) vmax *= 0.1;
      if (b.postUp && this.ball.holder === b) vmax *= 0.55;
      let want = clamp(sp, 0, 1.3) * vmax;
      if (!it.manual) { const slow = clamp(d / 4, 0, 1); want *= slow; }
      let wvx = d > 0.01 ? dx / d * want : 0, wvy = d > 0.01 ? dy / d * want : 0;
      // steer around bodies in the way instead of grinding into them (stops pile-ups)
      if (want > 1 && b.shootT <= 0 && !it.onBall) {
        const hx = wvx / want, hy = wvy / want;
        let ax = 0, ay = 0;
        for (const o of this.allBodies()) {
          if (o === b) continue;
          const ox = o.x - b.x, oy = o.y - b.y, od = Math.hypot(ox, oy);
          const R = (b.r + o.r) * 0.62 + 2.2;
          if (od > R || od < 0.01) continue;
          const ahead = (ox * hx + oy * hy) / od;           // 1 = straight ahead
          if (ahead < 0.2) continue;
          if (this.ball.holder === b && o.s !== b.s) continue; // ball handler drives through/around defenders by choice
          // sidestep to the side the other body is not on
          const side = (hx * oy - hy * ox) > 0 ? -1 : 1;
          const w = (1 - od / R) * ahead * 1.6;
          ax += -hy * side * w; ay += hx * side * w;
        }
        if (ax || ay) { wvx += ax * want; wvy += ay * want; const l = Math.hypot(wvx, wvy); if (l > want) { wvx *= want / l; wvy *= want / l; } }
      }
      // AI desired velocity is smoothed (~0.15 s) so decisions and mirrored defenders don't zig-zag frame to frame
      if (!it.manual && b.evade <= 0) {
        if (b._wvx == null) { b._wvx = wvx; b._wvy = wvy; }
        const kf = Math.min(1, dt / 0.15);
        b._wvx += (wvx - b._wvx) * kf; b._wvy += (wvy - b._wvy) * kf;
        wvx = b._wvx; wvy = b._wvy;
      } else { b._wvx = wvx; b._wvy = wvy; }
      if (b.evade > 0) { const k = 1.7; wvx = Math.cos(b.evadeAng) * vmax * k; wvy = Math.sin(b.evadeAng) * vmax * k; }
      // accelerate toward wanted velocity
      // momentum: velocity along the current heading changes with accel/decel limits; sideways velocity bleeds off
      // at the (mass-dependent) braking rate, so fast/heavy bodies carve wide turns and can't stop on a dime
      const boost = (b.evade > 0 ? 2.2 : 1) * (b.stun > 0 ? 0.5 : 1) * (it.onBall ? 1.3 : 1);
      const cs = Math.hypot(b.vx, b.vy);
      if (cs < 0.5) {
        let ax = wvx - b.vx, ay = wvy - b.vy; const am = Math.hypot(ax, ay), maxd = this.acc(b) * boost * dt;
        if (am > maxd) { ax = ax / am * maxd; ay = ay / am * maxd; }
        b.vx += ax; b.vy += ay;
      } else {
        const hx = b.vx / cs, hy = b.vy / cs;                  // heading
        const wPar = wvx * hx + wvy * hy, wPerX = wvx - wPar * hx, wPerY = wvy - wPar * hy;
        // along heading
        let np = cs + clamp(wPar - cs, -this.decel(b) * boost * dt, this.acc(b) * boost * dt);
        // sideways (turning) authority shrinks with speed
        const turnRate = this.acc(b) * boost * dt * (1.15 - 0.45 * clamp(cs / 16, 0, 1));
        let sx = clamp(wPerX, -turnRate, turnRate), sy = clamp(wPerY, -turnRate, turnRate);
        const sm = Math.hypot(sx, sy); if (sm > turnRate) { sx *= turnRate / sm; sy *= turnRate / sm; }
        b.vx = hx * np + sx; b.vy = hy * np + sy;
        if (np < 0) { b.vx = sx; b.vy = sy; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (Math.abs(b.vx) > 2.5) b.face = Math.sign(b.vx);
      // boundaries (handlers stepping OOB is a violation; others are clamped)
      const hold = this.ball.holder === b && this.phase === 'live';
      const mx = 0.4;
      if (hold && !b.ai.noOOB) {
        if (b.x < -mx || b.x > W + mx || b.y < -mx || b.y > H + mx) { b.pl.st.tov++; this.say('Stepped out of bounds', true); this.shot = null; this.ball.holder = null; this.changePoss(1 - b.s, false); this.setInbound(1 - b.s, clamp(b.x, 6, W - 6), b.y < 25 ? 0 : 50, 'oob'); return; }
      } else if (this.phase !== 'inbound' || b !== this.inbounder) {
        b.x = clamp(b.x, 0.5, W - 0.5); b.y = clamp(b.y, 0.5, H - 0.5);
      }
    }

    collide(dt) {
      const all = this.allBodies();
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        if (this.phase === 'inbound' && (a === this.inbounder || b === this.inbounder)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = (a.r + b.r) * 0.62;
        if (d < min && d > 0.001) {
          const ma = 1 + a.mon.r.sW * 2 + this.eff(a, 'strength') * 0.02, mb = 1 + b.mon.r.sW * 2 + this.eff(b, 'strength') * 0.02;
          const push = (min - d);
          const wa = mb / (ma + mb), wb = ma / (ma + mb);
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push * wa * 0.4; a.y -= ny * push * wa * 0.4; b.x += nx * push * wb * 0.4; b.y += ny * push * wb * 0.4;
          // momentum exchange along the contact normal (heavier/faster body wins the bump)
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) {
            const jimp = -rv * 0.8 / (1 / ma + 1 / mb);
            a.vx -= jimp / ma * nx; a.vy -= jimp / ma * ny; b.vx += jimp / mb * nx; b.vy += jimp / mb * ny;
            if (a.s !== b.s && -rv > 7) {
              const pa = ma * Math.hypot(a.vx, a.vy), pb = mb * Math.hypot(b.vx, b.vy);
              const loser = pa > pb * 1.6 ? b : pb > pa * 1.6 ? a : null;
              if (loser && loser.stun <= 0) { loser.stun = 0.25; loser.stunDir = { x: (loser === a ? -nx : nx), y: (loser === a ? -ny : ny) }; }
            }
          }
          // contact events: charge / blocking foul
          if (a.s !== b.s && this.phase === 'live') {
            const [off, def] = a.s === this.poss ? [a, b] : [b, a];
            if (this.ball.holder === off && !off.ai.noOOB) {
              const closing = Math.hypot(off.vx - def.vx, off.vy - def.vy);
              if (def.charge > 0 && closing > 6.5 && (off.immune <= 0 || closing > 11) && !this.chargeCd) {
                this.chargeCd = 1; this.offensiveFoul(off, def); return;
              } else if (def.charge <= 0 && closing > 10 && Math.hypot(off.x - ATTACK_X(off.s), off.y - 25) < 14 && this.rng.chance(dt * 0.3 * (1 - this.eff(def, 'iq') * 0.004))) {
                // blocking foul on defender (sliding in the way late)
                if (this.rng.chance(0.5)) { this.nonShootingFoul(def, off, 'Blocking foul'); return; }
              }
            }
          }
        }
      }
      if (this.chargeCd) this.chargeCd = Math.max(0, this.chargeCd - dt);
    }

    // ---------------------------------------------------------------- ball
    updateBall(dt) {
      const ball = this.ball;
      if (ball.holder) {
        const h = ball.holder;
        // dribble bounce
        const ph = (this.t * 6.3 + h.slot) % (Math.PI * 2);
        const fxd = h.face || 1;
        // dribble hand offset eases across instead of snapping when the handler changes direction
        h._hand = (h._hand == null ? fxd : h._hand) + (fxd - (h._hand == null ? fxd : h._hand)) * Math.min(1, dt * 8);
        ball.x = h.x + h._hand * 0.9 + h.vx * 0.04; ball.y = h.y + 0.7 + h.vy * 0.04;
        if (h.shootT > 0 || (h.jump && h.jumpKind === 'shot')) ball.z = BODY_H(h) + 0.8 + h.z;
        else ball.z = 1.5 + Math.abs(Math.sin(ph)) * 2.4;
        return;
      }
      if (this.phase === 'ft') return;
      const fl = ball.flight;
      if (ball.state === 'flight' && fl && fl.type === 'shot') {
        ball.vz -= 32.2 * dt;
        ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
        const s = this.shot;
        // arrives at rim height descending near the target
        const bx = ATTACK_X(s.shooter.s);
        const dxr = ball.x - bx, dyr = ball.y - 25;
        if (ball.vz < 0 && ball.z <= RIM_Z && ball.z + 0.5 > RIM_Z - 0.6 && !s.passedRim) {
          s.passedRim = true;
          if (s.made) {
            // swish: drop through the net
            s.done = true; ball.state = 'net'; ball.vx = 0; ball.vy = 0; ball.vz = -8; ball.x = bx; ball.y = 25; ball.netT = 0;
            this.score(s.shooter, s.type, true); this._netT = this.t;
            this.netPending = { side: s.shooter.s, foul: s.foul, shooter: s.shooter, t: 0.5 };
            if (s.foul) { /* and-one: free throw after */ }
          } else {
            // rim bounce
            const rim = Math.hypot(dxr, dyr);
            ball.vx = -DIR(s.shooter.s) * this.rng.range(1, 12) * (s.dist > 20 ? 1.3 : 0.8) + this.rng.range(-3, 3);
            ball.vy = this.rng.range(-8, 8); ball.vz = this.rng.range(5, 13);
            ball.state = 'loose'; ball.flight = null; this.lastTouch = s.shooter;
            s.done = true; this.rebT = 0; s.missed = true;
            if (s.foul) { this.shot = s; }
            this.shotMissed = true; this.sfx.push('rim');
            if (s.foul) { this.startFT(s.shooter.s, s.shooter, s.three ? 3 : 2, false); return; }
          }
        } else if (ball.z < 0.5 && ball.vz < 0) { ball.state = 'loose'; ball.flight = null; s.done = true; }
        return;
      }
      if (ball.state === 'net') {
        ball.netT += dt; ball.z += ball.vz * dt; ball.vz -= 20 * dt;
        if (ball.z <= 6) {
          const np = this.netPending; this.ball.state = 'held';
          if (np) {
            this.netPending = null;
            this.shot = null;
            if (np.foul) { this.startFT(np.side, np.shooter, 1, true); }
            else this.afterScore(np.side);
          }
        }
        return;
      }
      if (ball.state === 'flight' && fl && fl.type === 'pass') {
        ball.x += ball.vx * dt; ball.y += ball.vy * dt;
        if (fl.kind === 'lob') { ball.vz -= 18 * dt; ball.z += ball.vz * dt; ball.z = Math.max(ball.z, 6.5); }
        else { const u = clamp((fl.trav || 0) / Math.max(1, fl.dist), 0, 1); ball.z = fl.kind === 'bounce' ? 0.4 + 3.8 * Math.abs(1 - 2 * u) : 4.2 + Math.sin(u * Math.PI) * 0.8; }
        // out of court?
        if (ball.x < -0.5 - (this.phase === 'inbound' && this.t - fl.t0 < 0.2 ? 3 : 0) || ball.x > W + 0.5 + (this.phase === 'inbound' && this.t - fl.t0 < 0.2 ? 3 : 0) || ball.y < -0.5 - (this.phase === 'inbound' && this.t - fl.t0 < 0.2 ? 3 : 0) || ball.y > H + 0.5 + (this.phase === 'inbound' && this.t - fl.t0 < 0.2 ? 3 : 0)) { if (this.phase === 'live' || this.phase === 'inbound') this.outOfBounds(this.lastTouch); return; }
        // overshoot / stray pass becomes a loose ball
        fl.trav = (fl.trav || 0) + Math.hypot(ball.vx, ball.vy) * dt;
        if (fl.trav > fl.dist + 4 || this.t - fl.t0 > 2.2) { ball.state = 'loose'; ball.flight = null; ball.vx *= 0.35; ball.vy *= 0.35; ball.vz = 0; ball.z = Math.max(ball.z, 3); if (this.phase === 'inbound' || this.phase === 'jump') this.beginLive(); }
        return;
      }
      if (ball.state === 'loose') {
        ball.vz -= 32.2 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
        if (ball.z <= 0.4) { ball.z = 0.4; ball.vz = -ball.vz * 0.55; if (Math.abs(ball.vz) < 2) ball.vz = 0; ball.vx *= 0.93; ball.vy *= 0.93; }
        if (ball.z > 9.2 && ball.z < 10.8 && Math.hypot(ball.x - ATTACK_X(this.poss), ball.y - 25) < 0.9 && this.rebT < 0.2) { }
        this.rebT += dt;
        if ((this.phase === 'live' || this.phase === 'inbound') && (ball.x < -0.5 || ball.x > W + 0.5 || ball.y < -0.5 || ball.y > H + 0.5)) { this.outOfBounds(this.lastTouch); }
      }
    }

    // players contesting / catching the ball
    ballContests(dt) {
      const ball = this.ball;
      if (this.phase !== 'live' && this.phase !== 'inbound' && this.phase !== 'jump') return;
      // pass reception / interception
      if (ball.state === 'flight' && ball.flight && ball.flight.type === 'pass') {
        const fl = ball.flight;
        for (const b of this.allBodies()) {
          if (b === fl.from && this.t - fl.t0 < 0.3) continue;
          const d = Math.hypot(b.x - ball.x, b.y - ball.y);
          const reach = (b === fl.to ? 3.8 : 1.6) + b.r * 0.35 + (b.jump ? 0.8 : 0);
          if (d > reach) continue;
          if (ball.z > this.reach(b) + 1.6 && fl.kind !== 'lob') continue;
          if (b === fl.to) {
            if (fl.kind === 'lob' && b.ai.alley && this.t < b.ai.alley && this.phase === 'live') {
              // alley-oop: catch & finish in the air
              this.catchBall(b, fl); b.postUp = false;
              if (Math.hypot(b.x - ATTACK_X(b.s), b.y - 25) < 9) { b.ai.alley = 0; this.alleyFinish(b); }
              return;
            }
            this.catchBall(b, fl); return;
          }
          if (b.s !== fl.from.s) {
            // interception chance per frame near the line
            const pi = clamp(0.006 + (this.eff(b, 'steal') - this.eff(fl.from, 'pass')) * 0.0002 + (this.eff(b, 'iq') - 55) * 0.0001, 0.001, 0.04) * (this.phase === 'inbound' ? 0.4 : 1) * (fl.kind === 'bounce' ? 0.45 : 1);
            if (this.rng.chance(pi)) {
              b.pl.st.stl++; fl.from.pl.st.tov++;
              this.say('STEAL by ' + b.mon.dispName + '! (intercepted)', true);
              this.catchBall(b, fl, true); this.changePoss(b.s, true); return;
            }
          } else if (b !== fl.from && this.rng.chance(0.15)) { /* teammate tip, ignore */ }
        }
        return;
      }
      if (ball.state === 'loose') this.resolveLoose(dt);
    }
    catchBall(b, fl, intercept) {
      const ball = this.ball;
      ball.holder = b; ball.state = 'held'; ball.flight = null; ball.vx = ball.vy = 0;
      this.lastTouch = b;
      if (this.phase === 'inbound' || this.phase === 'jump') { this.beginLive(); }
      if (this.poss !== b.s && !intercept) this.changePoss(b.s, true);
      if (this.shot && !this.shot.done) { }
      if (this.isHuman(b.s)) this.onSide(b.s, () => { this.ctrlLock = 0; this.setCtrl(b); this.ctrlLock = 0.2; });
      b.ai.caught = this.t;
      if (b.s === this.poss) { const fcx = fx(b.s, b.x); if (fcx > 47) this.frontcourt[b.s] = true; }
    }
    alleyFinish(b) {
      b.shotType = 'rim'; b.rimKind = 'dunk'; b.shootT = 0.4; b.shootTotal = 0.4; b.jump = 1; b.jumpKind = 'shot'; b.vz = 12; b.shotAim = { quality: 0.85 }; b.released = false;
    }
    resolveLoose(dt) {
      const ball = this.ball;
      const s0 = this.shot;
      // missed-shot rebounds: pick the rebounder from everyone nearby (rating + position + effort), then the ball caroms to them
      if (s0 && (s0.missed || s0.ftMiss) && !this.rebTarget && ball.vz < 0 && ball.z < 9.5) {
        const cands = [];
        for (const b of this.allBodies()) {
          const d = Math.hypot(b.x - ball.x, b.y - ball.y);
          if (d > 18) continue;
          const isOff = this.poss === b.s;
          const reb = this.eff(b, isOff ? 'oreb' : 'dreb');
          let w = Math.pow(reb / 60, 2.2) * Math.pow(BODY_H(b) / 5.5, 0.8) * Math.exp(-d / 6.5) * (isOff ? 0.42 : 1);
          if (b.jump && b.jumpKind === 'reb') w *= 1.6;
          cands.push([b, w]);
        }
        if (cands.length) {
          const win = cands[this.rng.weighted(cands.map(c => c[1]))][0];
          this.rebTarget = win; this.rebT0 = this.t;
          const T = 0.35; ball.vx = (win.x - ball.x) / T; ball.vy = (win.y - ball.y) / T; ball.vz = Math.max(ball.vz, -6);
        }
      }
      if (this.rebTarget && this.t - this.rebT0 > 1.4) { this.rebTarget = null; if (s0) s0.rebFree = true; }
      if (s0 && (s0.missed || s0.ftMiss) && !this.rebTarget && !s0.rebFree) return;
      if (ball.z > 11) return;
      // candidates near ball under reach; winner drawn by weight so rebounds spread realistically
      const cands = [];
      for (const b of this.allBodies()) {
        if (this.rebTarget && b !== this.rebTarget) continue;
        const d = Math.hypot(b.x - ball.x, b.y - ball.y);
        const rr = 3.2 + b.r * 0.4 + (b.jump ? 1.2 : 0);
        if (d > rr) continue;
        if (ball.z > this.reach(b) + 0.8) continue;
        const isOff = this.poss === b.s;
        const reb = this.eff(b, isOff ? 'oreb' : 'dreb');
        let sc = reb * 0.3 + BODY_H(b) * 1.8 + b.mon.r.sW * 4 + this.eff(b, 'strength') * 0.06 - d * 2.5;
        if (b.jump && b.jumpKind === 'reb') sc += 6 + (b.ctl ? 6 : 0);
        if (!isOff) sc += 5;
        cands.push([b, sc]);
      }
      if (!cands.length) return;
      const mx = Math.max(...cands.map(c => c[1]));
      const best = cands[this.rng.weighted(cands.map(c => Math.exp((c[1] - mx) / 9)))][0];
      // grab it
      const b = best;
      const missShot = this.shot && (this.shot.missed || this.shot.ftMiss);
      const wasLiveShot = !!missShot;
      ball.holder = b; ball.state = 'held'; ball.vx = ball.vy = 0; ball.flight = null;
      this.lastTouch = b;
      const isOff = this.poss === b.s;
      if (wasLiveShot || this.blockedBall) {
        // rebound stats; shot stats were counted on release
        if (isOff) { b.pl.st.oreb++; this.shotClock = Math.max(this.shotClock, 14); this.say('Offensive rebound: ' + b.mon.dispName); }
        else { b.pl.st.dreb++; this.changePoss(b.s, true); }
      } else if (this.poss !== b.s) { this.changePoss(b.s, true); }
      this.shot = null; this.blockedBall = false; this.rebTarget = null;
      if (this.shot === null && this.shotMissed) { this.shotMissed = false; }
      b.ai.caught = this.t; b.immune = 0.3;
      if (this.poss === b.s) { const fcx = fx(b.s, b.x); this.frontcourt[b.s] = this.frontcourt[b.s] || fcx > 47; }
      if (this.humans[b.s]) this.onSide(b.s, () => { this.ctrlLock = 0; this.setCtrl(b); });
      // free throw miss foul-rebound edge handled elsewhere
      // putback: if the offense gets the ball near basket and body is tall, AI will handle
      this.lastPass = null;
    }

    // inbound handling
    updateInbound(dt) {
      this.inboundDelay -= dt;
      const ib = this.inbounder;
      if (!ib || this.ball.holder !== ib) {
        if (!this.ball.holder && this.ball.state === 'flight') return;
        return;
      }
      const isUser = this.isHuman(ib.s);
      if (this.inboundDelay <= 0 && !isUser) PB.Match.aiInbound(this, ib);
      else if (this.inboundDelay < -5 && isUser) PB.Match.aiInbound(this, ib);   // 5s inbound violation avoided
    }
    beginLive() { this.phase = 'live'; this.sim.clockRun = true; this.inboundSpot = null; this.inbounder = null; if (this.ball.holder && this.ball.holder.s !== this.poss) this.changePoss(this.ball.holder.s, true); }
  }

  // ctrl, ctrlLock, ... belong to whichever human side `this.us` points at (see onSide)
  for (const k of ['ctrl', 'ctrlLock', '_ctrlPoss', 'askBall', 'helpCall']) {
    Object.defineProperty(Match.prototype, k, { get() { return this.U[this.us][k]; }, set(v) { this.U[this.us][k] = v; } });
  }
  Match.PLAY_TUNE = { rim: 0.08, three: 0.025, mid: 0.025, post: 0.07 };   // calibration so AI-vs-AI efficiency matches the simulation
  PB.Match = Match;
  PB.Match.consts = { W, H, SHOT_METER_T, SWEET, BODY_H, PASS_SPEED, dist };
})(window.PB);
