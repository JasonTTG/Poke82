// Possession-based basketball simulation + shared Rules used by the playable engine too.
(function (PB) {
  const { clamp } = PB;

  // ---------- shared rules -------------------------------------------------
  const Rules = PB.Rules = {
    // energy 0..100 -> multiplier on all ratings
    fatigueMult(en) { return 1 - 0.30 * Math.pow(1 - clamp(en, 0, 100) / 100, 1.4); },
    drainPerSec(stamina, stratMult) { return 0.072 * (1.6 - stamina / 100) * (stratMult || 1); },
    recoverPerSec(stamina) { return 0.10 + (stamina - 50) * 0.0004; },
    ftProb(ft) { return clamp(0.46 + ft * 0.0058, 0.35, 0.96); },
    // base field goal probability. S = shooter eff ratings, D = defender eff ratings, T = team context
    // type: 'rim' | 'mid' | 'three' | 'post'; adj = extra additive (contest, timing, etc.)
    // LEV scales how much rating gaps matter (higher = stars/size/skill decide more games)
    LEV: 1.35,
    makeProb(type, S, D, T, adj) {
      const V = Rules.LEV;
      let p;
      switch (type) {
        case 'three': p = 0.366 + ((S.three - 60) * 0.0040 - (D.perD - 56) * 0.0028) * V + (T.spacing - 2.5) * 0.006 + (T.playm - 60) * 0.0008; break;
        case 'mid': p = 0.405 + ((S.mid - 60) * 0.0045 - (D.perD - 56) * 0.0020) * V - (T.rimProtD - 58) * 0.0006; break;
        case 'post': p = 0.495 + ((S.post - 60) * 0.0042 - (D.intD - 58) * 0.0030 + (S.strength - D.strength) * 0.0008) * V - (T.rimProtD - 58) * 0.0008; break;
        default: p = 0.590 + ((Math.max(S.layup, S.dunk * 0.95) - 60) * 0.0050 - (Math.max(D.intD, T.rimProtD) - 58) * 0.0034) * V + (T.spacing - 2.5) * 0.010 + (T.playm - 60) * 0.0006; break;
      }
      return clamp(p + (adj || 0), 0.05, 0.93);
    },
    blockProb(type, S, D) {
      const base = type === 'rim' ? 0.055 : type === 'post' ? 0.045 : type === 'mid' ? 0.022 : 0.008;
      return clamp(base + (D.block - 55) * 0.0016 - (S.strength - 55) * 0.0004 - (S.iq - 55) * 0.0003, 0, 0.30);
    },
    foulProb(type, S, D) { // shooting foul
      const base = type === 'rim' ? 0.165 : type === 'post' ? 0.145 : type === 'mid' ? 0.055 : 0.028;
      return clamp(base + (S.strength - D.strength) * 0.0006 + (S.handle - 50) * 0.0003 - (D.iq - 55) * 0.0008, 0.005, 0.3);
    },
    nonShootingFoulProb: 0.075,
  };

  const STAT_KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'sec', 'pm'];
  PB.STAT_KEYS = STAT_KEYS;
  PB.newStat = () => { const o = {}; for (const k of STAT_KEYS) o[k] = 0; return o; };

  function mkPlayer(id, slot, starter) {
    const mon = PB.BYID[id];
    return { id, mon, slot, en: 100, st: PB.newStat(), starter, dq: false, onCourt: false, restUntil: 0, gp: 0 };
  }

  // ------------------------------------------------------------------------
  class Game {
    constructor(teamH, teamA, opts) {
      opts = opts || {};
      this.rng = opts.rng || new PB.RNG((Math.random() * 4294967296) >>> 0);
      this.qLen = (opts.quarterMin || 12) * 60;
      this.otLen = 300;
      this.verbose = !!opts.verbose;
      this.log = [];
      this.sides = [this._mkSide(teamH, opts.userSide === 0), this._mkSide(teamA, opts.userSide === 1)];
      this.sides[0].home = true;
      this.score = [0, 0];
      this.qScores = [[], []];
      this.q = 1; this.clock = this.qLen; this.elapsed = 0;
      this.poss = this.rng.int(0, 1);
      this.firstPoss = this.poss;
      this.form = [this.rng.gauss() * 0.006, this.rng.gauss() * 0.006]; // per-game shooting variance
      this.teamFouls = [0, 0];
      this.diff = opts.diff || [0, 0];     // difficulty rating adjust (fraction) per side
      this.over = false;
      this.refresh(0); this.refresh(1);
    }

    _mkSide(team, isUser) {
      const players = {};
      const court = [], bench = [];
      team.starters.forEach((id, slot) => { const p = mkPlayer(id, slot, true); p.onCourt = true; p.gp = 1; players[id] = p; court.push(p); });
      team.bench.forEach((id, i) => { const p = mkPlayer(id, null, false); p.rot = (team.bench.length - i) * 0.7; players[id] = p; bench.push(p); });
      return { team, players, court, bench, strat: Object.assign({}, team.strat), ctx: null, since: 0, isUser: !!isUser, auto: true };
    }

    // team context from current on-court players (fatigue + position adjusted)
    refresh(si) {
      const s = this.sides[si];
      const L = s.court;
      const e = (p, k) => p.mon.r[k] * Rules.fatigueMult(p.en) * (1 - PB.slotPenalty(p.mon, p.slot));
      s.R = L.map(p => {
        const o = {}; for (const k in p.mon.r) { if (k === 'sH' || k === 'sW' || k === 'hands' || k === 'mob' || k === 'rawOvr' || k === 'posC' || k === 'pos1' || k === 'pos2') continue; o[k] = e(p, k); }
        return o;
      });
      const R = s.R;
      const sum = f => { let t = 0; for (let i = 0; i < R.length; i++) t += f(R[i], i); return t; };
      const playm = R.map(r => 0.55 * r.pass + 0.45 * r.handle).sort((a, b) => b - a);
      const rim = R.map((r, i) => 0.5 * r.block + 0.5 * r.intD * (0.85 + 0.3 * L[i].mon.r.sH)).sort((a, b) => b - a);
      s.ctx = {
        spacing: sum(r => clamp((r.three - 45) / 30, 0, 1)),
        playm: playm[0] * 0.7 + playm[1] * 0.3,
        rimProtD: rim[0] * 0.65 + rim[1] * 0.35,
        perD: sum(r => r.perD) / 5, steal: sum(r => r.steal) / 5, speed: sum(r => r.speed) / 5,
        passAvg: sum(r => r.pass) / 5, iq: sum(r => r.iq) / 5,
        oreb: sum(r => r.oreb) / 5, dreb: sum(r => r.dreb) / 5,
        handle: sum(r => r.handle) / 5, stamina: sum(r => r.stamina) / 5,
      };
      s.since = 0;
    }

    // ---- helpers ----
    _weightedPlayer(si, wf) {
      const s = this.sides[si];
      const w = s.court.map((p, i) => Math.max(0.0001, wf(s.R[i], p, i)));
      const i = this.rng.weighted(w);
      return i;
    }

    _addPoints(si, pts, pl) {
      this.score[si] += pts; pl.st.pts += pts;
      for (let s = 0; s < 2; s++) for (const p of this.sides[s].court) p.st.pm += (s === si ? pts : -pts);
    }

    _tick(dt) {
      // time passes: clocks + energy
      dt = Math.min(dt, this.clock);
      this.clock -= dt; this.elapsed += dt;
      for (let si = 0; si < 2; si++) {
        const s = this.sides[si];
        const stratMult = (s.strat.def === 'press' ? 1.12 : s.strat.def === 'lockdown' ? 1.15 : 1) * (s.strat.off === 'fast' ? 1.04 : 1);
        for (const p of s.court) { p.en = Math.max(0, p.en - Rules.drainPerSec(p.mon.r.stamina, stratMult) * dt); p.st.sec += dt; }
        for (const p of s.bench) { p.en = Math.min(100, p.en + Rules.recoverPerSec(p.mon.r.stamina) * dt); }
      }
      return dt;
    }

    // ---- AI coach substitutions ----
    subs(si) {
      const s = this.sides[si];
      if (s.isUser && !s.auto) return;
      const lead = this.score[si] - this.score[1 - si];
      const garbage = this.q === 4 && this.clock < 360 && Math.abs(lead) >= 22;
      const val = (p, slot, onCourt) => {
        let v = p.mon.ovr * Rules.fatigueMult(p.en) * (1 - PB.slotPenalty(p.mon, slot));
        if (onCourt) v -= 0.22 * (100 - p.en);
        else v += 0;
        if (p.starter) v += 3;
        v += p.rot || 0;
        if (p.st.pf >= 5) v -= 10; else if (p.st.pf >= 4 && this.q <= 3) v -= 6; else if (p.st.pf >= 3 && this.q <= 2) v -= 3;
        if (garbage) v += (p.starter ? -30 : 10) * (lead > 0 ? 1 : (p.starter ? 0.3 : 1));
        return v;
      };
      for (let i = 0; i < 5; i++) {
        const p = s.court[i];
        let best = null, bv = -1e9;
        for (const b of s.bench) {
          if (b.dq || b.restUntil > this.elapsed) continue;
          const v = val(b, i, false);
          if (v > bv) { bv = v; best = b; }
        }
        if (!best) continue;
        const cur = p.dq ? -999 : val(p, i, true);
        if (bv > cur + 6) this.swap(si, i, best);
      }
    }

    swap(si, idx, inP) {
      const s = this.sides[si];
      const out = s.court[idx];
      s.court[idx] = inP; s.bench[s.bench.indexOf(inP)] = out;
      inP.slot = idx; inP.onCourt = true; inP.gp = 1; inP.restUntil = 0;
      out.onCourt = false; out.slot = null; out.restUntil = this.elapsed + 150;
      this.refresh(si);
    }

    // ---- possession ----
    _paceSeconds(o, d) {
      const so = o.strat.off, sd = d.strat.def;
      let base = so === 'fast' ? 14.6 : so === 'inside' ? 18.2 : so === 'three' ? 16.8 : 17.2;
      base -= (o.ctx.speed - 58) * 0.035;
      if (sd === 'press') base -= 0.5;
      if (sd === 'zone') base += 0.5;
      return clamp(base + this.rng.gauss() * 2.6, 4.5, 23.5);
    }

    _foulOn(di) {
      // personal foul on defender side; returns bonus state
      const d = this.sides[di];
      const i = this._weightedPlayer(di, (r, p) => 30 + (100 - r.iq) * 0.6 + (p.mon.r.sW * 20));
      const pl = d.court[i];
      pl.st.pf++;
      this.teamFouls[di]++;
      if (pl.st.pf >= 6) { pl.dq = true; }
      return pl;
    }

    _freeThrows(si, shooter, n, lastLive) {
      let made = 0;
      for (let k = 0; k < n; k++) {
        shooter.st.fta++;
        const ok = this.rng.chance(clamp(Rules.ftProb(shooter.mon.r.ft * Rules.fatigueMult(shooter.en)) + this.form[si] * 0.3, 0.3, 0.97));
        if (ok) { shooter.st.ftm++; this._addPoints(si, 1, shooter); made++; }
        if (k === n - 1 && !ok && lastLive) return { made, miss: true };
      }
      return { made, miss: false };
    }

    // returns after one full possession; sets this.poss to next
    possession() {
      const rng = this.rng;
      const oi = this.poss, di = 1 - oi;
      const O = this.sides[oi], D = this.sides[di];
      if (O.since++ > 3 || D.since > 3) { this.refresh(0); this.refresh(1); }
      D.since++;
      let total = this._paceSeconds(O, D);
      let clockUsed = 0;
      let nextPoss = di;
      let scoredThisPoss = false;
      let secondChance = false;
      const quarterEndsAfter = () => this.clock <= 0.01;

      for (let loop = 0; loop < 4; loop++) {          // loop handles offensive-rebound continuations
        let dur = secondChance ? clamp(rng.range(2, 9), 1, 24) : total;
        dur = Math.min(dur, this.clock);
        const lastShot = dur >= this.clock - 0.01;
        // ---- non-shooting foul / turnover happen at some point before the shot
        const ocs = O.ctx, dcs = D.ctx;
        const pressure = (D.strat.def === 'press' ? 0.034 : D.strat.def === 'lockdown' ? 0.004 : D.strat.def === 'zone' ? -0.010 : 0);
        const pressScale = D.strat.def === 'press' ? (0.6 + clamp((dcs.speed - 50) / 40, 0, 1)) : 1;
        let tov = 0.116 - (ocs.playm - 60) * 0.0016 + (dcs.steal - 55) * 0.0012 + pressure * pressScale
          + (O.strat.off === 'fast' ? 0.006 : O.strat.off === 'inside' ? -0.008 : 0) - (ocs.iq - 55) * 0.0006 - (ocs.handle - 55) * 0.0008;
        if (secondChance) tov *= 0.4;
        tov = clamp(tov, 0.05, 0.24);
        if (rng.chance(tov)) {
          const bi = this._weightedPlayer(oi, (r, p) => (110 - r.handle * 0.5 - r.pass * 0.3 - r.iq * 0.2) * (p.mon.tend.usage / 60));
          const bp = O.court[bi]; bp.st.tov++;
          const t = this._tick(Math.max(1, dur * rng.range(0.25, 0.8)));
          // steal?
          const stealP = clamp(0.52 + (dcs.steal - 55) * 0.006, 0.25, 0.8);
          if (rng.chance(stealP)) {
            const si = this._weightedPlayer(di, (r) => Math.pow(r.steal, 3) / 1000);
            D.court[si].st.stl++;
            this._log('TOV+STL', oi, bp, D.court[si]);
          } else this._log('TOV', oi, bp);
          nextPoss = di;
          // live-ball turnovers sometimes feed a fast break layup
          if (stealP > 0 && this.clock > 3 && rng.chance(0.20 + (dcs.speed - 55) * 0.003)) {
            this._fastBreakLayup(di, oi);
          }
          return this._endPoss(nextPoss);
        }
        // non-shooting foul on the defense
        if (rng.chance(Rules.nonShootingFoulProb + (D.strat.def === 'press' ? 0.012 : D.strat.def === 'lockdown' ? 0.006 : 0) - (dcs.iq - 55) * 0.0004)) {
          const fp = this._foulOn(di);
          this._tick(Math.max(0.5, dur * rng.range(0.1, 0.6)));
          this._log('FOUL', di, fp);
          if (this.teamFouls[di] > 4 && this._qFoulBonus(di)) {
            const sh = O.court[this._weightedPlayer(oi, (r) => r.ft * r.ft / 100)];
            const res = this._freeThrows(oi, sh, 2, true);
            if (res.miss) { nextPoss = this._ftRebound(oi, di); if (nextPoss === oi) { secondChance = true; continue; } } else nextPoss = di;
            return this._endPoss(nextPoss);
          }
          // side-out: possession continues with a fresh (shorter) clock
          secondChance = true; total = Math.min(14, total); continue;
        }
        // ---- the shot attempt
        const w = O.court.map((p, i) => {
          const r = O.R[i];
          return Math.pow(p.mon.tend.usage, 2.6) / 1e4 * (0.75 + 0.5 * (r.iq / 100)) * (secondChance ? (p.mon.r.pos1 >= 3 ? 1.6 : 0.8) : 1);
        });
        const shooterIdx = rng.weighted(w);
        const sp = O.court[shooterIdx];
        const SR = O.R[shooterIdx];
        // shot type
        const strat = O.strat.off;
        const t = sp.mon.tend;
        let w3 = (0.25 + t.threeRate * 1.25) * (strat === 'three' ? 1.4 : strat === 'inside' ? 0.65 : strat === 'fast' ? 0.95 : 1) * (D.strat.def === 'zone' ? 1.12 : 1);
        let wr = (0.15 + t.rimRate * 0.80) * (strat === 'inside' ? 1.35 : strat === 'three' ? 0.8 : strat === 'fast' ? 1.25 : 1) * (D.strat.def === 'zone' ? 0.85 : 1);
        let wm = (0.05 + t.midRate * 0.45) * (strat === 'three' ? 0.55 : 1);
        let wp = t.postRate * (strat === 'inside' ? 1.8 : 1) * 0.8;
        if (secondChance) { w3 *= 0.2; wm *= 0.3; wr *= 2.5; wp *= 1.5; }
        const type = ['three', 'rim', 'mid', 'post'][rng.weighted([w3, wr, wm, wp])];
        // matchup defender
        let dIdx = shooterIdx;
        if (D.strat.def === 'zone') dIdx = clamp(shooterIdx + rng.int(-1, 1), 0, 4);
        else if (rng.chance(0.12)) dIdx = clamp(shooterIdx + (rng.chance(0.5) ? -1 : 1), 0, 4); // switches
        const DR = D.R[dIdx];
        // adjust for strategies and form
        let adj = this.form[oi] - this.form[di] * 0.5 + (O.home ? 0.008 : 0) + (this.diff[oi] - this.diff[di]) * 0.5;
        if (D.strat.def === 'lockdown') adj -= 0.003;
        if (D.strat.def === 'zone') adj += type === 'three' ? 0.008 : type === 'rim' ? -0.018 : 0;
        if (D.strat.def === 'press' && !secondChance) adj += (type === 'rim' ? 0.006 : 0);
        if (O.strat.off === 'fast' && type === 'rim') adj += 0.016 + 0.014 * clamp((ocs.speed - dcs.speed) / 12, -1, 1.5);
                        if (secondChance && type === 'rim') adj += 0.06;
                const Tctx = { spacing: ocs.spacing, playm: ocs.playm, rimProtD: dcs.rimProtD };
        // blocks
        const blkIdx = this._weightedPlayer(di, (r, p, i) => Math.pow(r.block, 3) / 1000 * (i === dIdx ? 1.4 : 1));
        const pBlk = Rules.blockProb(type, SR, D.R[blkIdx]) * (D.strat.def === 'zone' && type === 'rim' ? 1.1 : 1);
        const pFoul = Rules.foulProb(type, SR, DR) * (D.strat.def === 'press' ? 1.1 : 1) * (secondChance ? 1.2 : 1);
        const tUsed = this._tick(Math.max(0.5, dur));
        clockUsed += tUsed;
        sp.st.fga += 1; if (type === 'three') sp.st.tpa++;
        const isBlocked = rng.chance(pBlk);
        if (isBlocked) {
          D.court[blkIdx].st.blk++;
          this._log('BLK', oi, sp, D.court[blkIdx]);
          // block rebounding
          const nx = this._rebound(oi, di, 0.95);
          if (nx === oi) { secondChance = true; continue; }
          return this._endPoss(di);
        }
        const fouled = rng.chance(pFoul);
        let pMake = Rules.makeProb(type, SR, DR, Tctx, adj);
        if (fouled) pMake *= 0.82;
        const made = rng.chance(pMake);
        if (fouled) {
          const fp = this._foulOn(di);
          this._log('SFOUL', di, fp);
          if (made) {
            const pts = type === 'three' ? 3 : 2;
            sp.st.fgm++; if (type === 'three') sp.st.tpm++;
            this._addPoints(oi, pts, sp);
            this._assist(oi, shooterIdx, type);
            if (rng.chance(0.88)) {
              this._freeThrows(oi, sp, 1, false); // and-one
            }
            return this._endPoss(di);
          } else {
            const n = type === 'three' ? 3 : 2;
            const res = this._freeThrows(oi, sp, n, true);
            if (res.miss) {
              const nx = this._ftRebound(oi, di);
              if (nx === oi) { secondChance = true; continue; }
            }
            return this._endPoss(di);
          }
        }
        if (made) {
          sp.st.fgm++; if (type === 'three') sp.st.tpm++;
          this._addPoints(oi, type === 'three' ? 3 : 2, sp);
          this._assist(oi, shooterIdx, type);
          this._log('MAKE-' + type, oi, sp);
          return this._endPoss(di);
        }
        this._log('MISS-' + type, oi, sp);
        // missed shot -> rebound
        const nx = this._rebound(oi, di, type === 'three' ? 1.04 : 1);
        if (nx === oi) {
          if (quarterEndsAfter()) return this._endPoss(di);
          secondChance = true; continue;
        }
        return this._endPoss(di);
      }
      return this._endPoss(nextPoss);
    }

    _qFoulBonus(di) { return this.teamFouls[di] >= 5; }

    _assist(oi, shooterIdx, type) {
      const O = this.sides[oi];
      const base = type === 'three' ? 0.90 : type === 'rim' ? 0.68 : type === 'mid' ? 0.56 : 0.36;
      const p = clamp(base * Math.pow(O.ctx.passAvg / 58, 0.7), 0.1, 0.95);
      if (!this.rng.chance(p)) return;
      const ai = this._weightedPlayer(oi, (r, pl, i) => i === shooterIdx ? 0 : Math.pow(r.pass / 60, 4.5) * Math.pow(r.handle / 60, 1.5) * (pl.mon.r.pos1 <= 1 ? 1.5 : pl.mon.r.pos1 >= 4 ? 0.6 : 1));
      if (ai !== shooterIdx) O.court[ai].st.ast++;
    }

    _rebound(oi, di, offMod) {
      const O = this.sides[oi], D = this.sides[di];
      let po = 0.265 + (O.ctx.oreb - D.ctx.dreb + 3) * 0.0042;
      po *= offMod * (D.strat.def === 'press' ? 1.06 : 1) * (O.strat.off === 'fast' ? 0.92 : 1) * (O.strat.off === 'inside' ? 1.06 : 1);
      po = clamp(po, 0.12, 0.42);
      if (this.rng.chance(po)) {
        const i = this._weightedPlayer(oi, (r, p) => Math.pow(r.oreb, 3.2) / 1000);
        O.court[i].st.oreb++;
        return oi;
      }
      const i = this._weightedPlayer(di, (r, p) => Math.pow(r.dreb, 3.2) / 1000);
      D.court[i].st.dreb++;
      return di;
    }
    _ftRebound(oi, di) {
      const O = this.sides[oi], D = this.sides[di];
      if (this.rng.chance(0.13)) { const i = this._weightedPlayer(oi, (r) => Math.pow(r.oreb, 3) / 1000); O.court[i].st.oreb++; return oi; }
      const i = this._weightedPlayer(di, (r) => Math.pow(r.dreb, 3) / 1000); D.court[i].st.dreb++; return di;
    }

    _fastBreakLayup(oi, di) {
      const O = this.sides[oi], D = this.sides[di];
      if (this.clock < 1) return;
      this._tick(Math.min(this.clock, this.rng.range(3, 6)));
      const si = this._weightedPlayer(oi, (r, p) => Math.pow(r.speed, 2.2) * (p.mon.tend.rimRate + 0.1) / 100);
      const sp = O.court[si]; const SR = O.R[si];
      sp.st.fga++;
      const dr = D.R[this.rng.int(0, 4)];
      const p = Rules.makeProb('rim', SR, dr, { spacing: 2.5, playm: 60, rimProtD: 50 }, 0.07 + this.form[oi]);
      if (this.rng.chance(p)) { sp.st.fgm++; this._addPoints(oi, 2, sp); this._assist(oi, si, 'rim'); }
      else {
        const nx = this._rebound(oi, di, 0.8);
        // ignore extended continuation; if offense gets it, treat as immediate putback attempt
        if (nx === oi) {
          sp.st.fga++;
          if (this.rng.chance(0.62)) { sp.st.fgm++; this._addPoints(oi, 2, sp); }
        }
      }
    }

    _log(kind, si, p, p2) {
      if (!this.verbose) return;
      this.log.push({ q: this.q, c: Math.round(this.clock), kind, s: si, p: p && p.id, p2: p2 && p2.id, sc: this.score.slice() });
    }

    _endPoss(next) {
      this.poss = next;
      // dead-ball substitutions
      this.subs(0); this.subs(1);
      // DQ'd players still on court -> forced swap
      for (let si = 0; si < 2; si++) {
        const s = this.sides[si];
        for (let i = 0; i < 5; i++) if (s.court[i].dq) {
          const cand = s.bench.filter(b => !b.dq).sort((a, b) => b.mon.ovr * Rules.fatigueMult(b.en) - a.mon.ovr * Rules.fatigueMult(a.en))[0];
          if (cand) this.swap(si, i, cand);
        }
      }
      return next;
    }

    // ---- period handling ----
    playQuarter() {
      this.clock = this.q <= 4 ? this.qLen : this.otLen;
      this.teamFouls = [0, 0];
      const startScore = this.score.slice();
      let guard = 0;
      while (this.clock > 0.01 && guard++ < 400) {
        this.possession();
      }
      this.qScores[0].push(this.score[0] - startScore[0]);
      this.qScores[1].push(this.score[1] - startScore[1]);
    }

    run() {
      const dir = [this.firstPoss, 1 - this.firstPoss, 1 - this.firstPoss, this.firstPoss];
      for (this.q = 1; this.q <= 4; this.q++) {
        this.poss = dir[this.q - 1];
        this._qBreak();
        this.playQuarter();
      }
      let ot = 0;
      while (this.score[0] === this.score[1] && ot < 10) {
        this.q = 5 + ot; ot++;
        this.poss = this.rng.int(0, 1);
        this._qBreak();
        this.playQuarter();
      }
      this.over = true;
      return this.result(ot);
    }

    _qBreak() {
      // breaks: partial recovery on court players; subs at quarter break
      for (const s of this.sides) for (const p of s.court) p.en = Math.min(100, p.en + (this.q === 3 ? 22 : 10));
      this.refresh(0); this.refresh(1);
      this.subs(0); this.subs(1);
    }

    result(ot) {
      const box = [{}, {}];
      for (let si = 0; si < 2; si++) for (const id in this.sides[si].players) {
        const p = this.sides[si].players[id];
        box[si][id] = Object.assign({}, p.st, { gp: p.st.sec > 0 ? 1 : 0, gs: p.starter ? 1 : 0 });
      }
      return {
        teams: [this.sides[0].team.id, this.sides[1].team.id], score: this.score.slice(), q: this.qScores, ot, box,
        winner: this.score[0] > this.score[1] ? 0 : 1, log: this.log,
      };
    }
  }

  PB.Game = Game;
  // Convenience: simulate a full game between two teams
  PB.simGame = function (teamH, teamA, opts) {
    const g = new Game(teamH, teamA, opts);
    return g.run();
  };
})(window.PB);
