// Match rules and feedback that sit on top of the live court engine: foul trouble and late-game fouling, badge and event pop-ups, tired-player and foul alerts.
// (Added to Match.prototype so court.js stays about movement, shooting and rebounding.)
(function (PB) {
  const { Rules } = PB;
  Object.assign(PB.Match.prototype, {
    // ---------------------------------------------------------------- foul management
    // How deep in foul trouble a player is right now (0 = fine), judged by the quarter, the clock and the score.
    foulTrouble(b) {
      const g = this.g, si = this.gi[b.s];
      return Rules.trouble(b.pl.st.pf, this.q, this.clock, g.score[si] - g.score[1 - si]);
    },
    // A player in foul trouble plays it safe: fewer fouls, but softer defense. Strategy 'foul': auto (when in trouble) / safe (from 3 fouls) / ride (never).
    playsSafe(b) {
      const mode = this.gs(b.s).strat.foul || 'auto';
      if (mode === 'ride') return false;
      return mode === 'safe' ? b.pl.st.pf >= 3 : this.foulTrouble(b) > 0;
    },
    // Trailing late, a human-coached defense can be told to stop the clock by fouling the ball handler. strategy 'hack': on / off (CPU teams decide for themselves in court-ai.js).
    intentionalFoul(dt) {
      if (this.phase !== 'live' || this.q < 4 || this.clock > 45 || this.clock < 1.5 || !this.ball.holder) return;
      this._hackCd = (this._hackCd || 0) - dt; if (this._hackCd > 0) return;
      const h = this.ball.holder, ds = 1 - h.s, trail = this.sc(h.s) - this.sc(ds);
      if (trail <= 0 || trail > 10) return;                               // the defense must be the team that is behind
      if ((this.gs(ds).strat.hack || 'auto') !== 'on') return;                 // CPU teams use their own late-game fouling in court-ai.js
      if (this.t - (this.possT || 0) < 1.3) return;
      const cand = this.bodies[ds].filter(x => x.pl.st.pf < 5 && Math.hypot(x.x - h.x, x.y - h.y) < 6).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
      if (!cand) return;
      this._hackCd = 5;
      this.nonShootingFoul(cand, h, 'Intentional foul');
    },
    // floating badge pop-ups above a player (drawn by the renderer)
    badgePop(body, name, text, bad) {
      if (!body || PB.settings.showBadges === false) return;
      this._popCd = this._popCd || {};
      const k = body.mon.id + name; if (this.t - (this._popCd[k] || -9) < 3) return;
      this._popCd[k] = this.t;
      (this.pops = this.pops || []).push({ b: body, txt: name + (text || ''), t0: this.t, bad: !!bad });
      if (this.pops.length > 8) this.pops.shift();
    },
    // short plain-text callouts over a player (box outs and the like); they use the same pop-up layer as badges
    eventPop(body, txt) {
      if (!body || PB.settings.showBadges === false) return;
      this._popCd = this._popCd || {}; const k = body.mon.id + txt; if (this.t - (this._popCd[k] || -9) < 2) return; this._popCd[k] = this.t;
      (this.pops = this.pops || []).push({ b: body, txt, t0: this.t, plain: true }); if (this.pops.length > 8) this.pops.shift();
    },
    tiredNote() {
      if (this.phase !== 'live') return;
      for (const b of this.bodies[this.me]) {
        if (b.pl.en < 28 && !b._tired) { b._tired = true; if (this.isMine(b) || !this.online) this.say(b.mon.dispName + ' is gassed. Rest him!'); }
        else if (b.pl.en > 45) b._tired = false;
      }
    },
    // a banner when one of your players gets into foul trouble (or has five)
    foulAlert(b) {
      if (b.s !== this.me || this.over) return;
      const pf = b.pl.st.pf, sev = this.foulTrouble(b);
      if (pf >= 6 || (pf < 5 && !sev) || (b._alertPf === pf)) return;
      b._alertPf = pf;
      this.foulWarn = { txt: b.mon.dispName + ' has ' + pf + ' fouls' + (pf >= 5 ? ' (one more and he is out)' : ' (foul trouble)'), t0: this.t, bad: pf >= 5 };
    },
  });
})(window.PB);
