// Auto strategy: plays the team against a spread of the league's teams with each offense and defense and keeps the combination with the best scoring margin.
(function (PB) {
  const UI = PB.UI, A = UI.actions;
  const AS = PB.AutoStrat = {};
  const GAMES_PER_OPP = 5, OPPS = 10;
  // team: a sim team ({ roster, starters, bench, ... }); pool: the other teams to test against; done(best, table)
  AS.pick = function (team, pool, done) {
    const opps = pool.slice().sort((a, b) => PB.teamOvr(a) - PB.teamOvr(b));
    const pickOpps = Array.from({ length: Math.min(OPPS, opps.length) }, (_, i) => opps[Math.floor(i * (opps.length - 1) / Math.max(1, Math.min(OPPS, opps.length) - 1))]);
    const table = [];
    const evalCombo = (off, def) => {
      let sum = 0, n = 0;
      const T = Object.assign({}, team, { strat: { off, def } });
      pickOpps.forEach((o, oi) => { for (let k = 0; k < GAMES_PER_OPP; k++) { const home = k % 2 === 0, g = home ? new PB.Game(T, o, { rng: new PB.RNG(7001 + oi * 31 + k), quarterMin: 12 }) : new PB.Game(o, T, { rng: new PB.RNG(7001 + oi * 31 + k), quarterMin: 12 }); g.run(); sum += home ? g.score[0] - g.score[1] : g.score[1] - g.score[0]; n++; } });
      const r = { off, def, margin: sum / n }; table.push(r); return r;
    };
    const offs = Object.keys(PB.OFF_STRATS), defs = Object.keys(PB.DEF_STRATS);
    const steps = offs.map(o => () => evalCombo(o, 'man'));
    let bestOff = 'balanced';
    const run = (queue, after) => { if (!queue.length) { after(); return; } queue.shift()(); setTimeout(() => run(queue, after), 0); };      // one test at a time so the page stays responsive
    run(steps, () => {
      bestOff = table.slice().sort((a, b) => b.margin - a.margin)[0].off;
      run(defs.filter(d => d !== 'man').map(d => () => evalCombo(bestOff, d)), () => done(table.slice().sort((a, b) => b.margin - a.margin)[0], table));
    });
  };
  const label = b => PB.OFF_STRATS[b.off] + ' with ' + PB.DEF_STRATS[b.def];
  // team screen
  A.autoStrat = () => {
    const G = PB.G, T = PB.activeTeam ? PB.activeTeam(G, G.teams[G.userTeam]) : G.teams[G.userTeam];
    PB.toast('Testing strategies against the league…', 4000);
    AS.pick(T, G.teams.filter(t => t.id !== G.userTeam).map(t => PB.activeTeam ? PB.activeTeam(G, t) : t), best => {
      PB.Ops.run('strat', { tid: G.userTeam, off: best.off, def: best.def }, () => { PB.toast('Auto strategy: ' + label(best), 4000); UI.refresh(); });
    });
  };
})(window.PB);
