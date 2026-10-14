// Auto strategy: plays the team against a spread of the league's teams with each offense and defense, shows how each did (with the margin of error),
// and sets the best combination.
(function (PB) {
  const UI = PB.UI, A = UI.actions, esc = UI.esc;
  const AS = PB.AutoStrat = {};
  const OPPS = 8, GAMES_PER_OPP = 8;
  // team: a sim team; pool: the other teams to test against; progress(done, total); done(best, table)
  AS.pick = function (team, pool, done, progress, fail) {
    const opps = pool.slice().sort((a, b) => PB.teamOvr(a) - PB.teamOvr(b)), n0 = Math.min(OPPS, opps.length);
    const pickOpps = Array.from({ length: n0 }, (_, i) => opps[Math.floor(i * (opps.length - 1) / Math.max(1, n0 - 1))]);
    const table = [], offs = Object.keys(PB.OFF_STRATS), defs = Object.keys(PB.DEF_STRATS), total = offs.length + defs.length - 1;
    const evalCombo = (off, def) => {
      const ms = [], T = Object.assign({}, team, { strat: { off, def } });
      pickOpps.forEach((o, oi) => { for (let k = 0; k < GAMES_PER_OPP; k++) { const home = k % 2 === 0, rng = new PB.RNG(7001 + oi * 31 + k), g = home ? new PB.Game(T, o, { rng, quarterMin: 12 }) : new PB.Game(o, T, { rng, quarterMin: 12 }); g.run(); ms.push(home ? g.score[0] - g.score[1] : g.score[1] - g.score[0]); } });
      const mean = PB.avg(ms), sd = Math.sqrt(PB.avg(ms.map(v => (v - mean) * (v - mean)))), r = { off, def, margin: mean, se: sd / Math.sqrt(ms.length) };
      table.push(r); if (progress) progress(table.length, total); return r;
    };
    const run = (queue, after) => { if (!queue.length) { after(); return; } try { queue.shift()(); } catch (err) { PB.warn && PB.warn('autostrat', err); if (fail) fail(err); return; } setTimeout(() => run(queue, after), 0); };      // one test at a time so the page stays responsive
    run(offs.map(o => () => evalCombo(o, 'man')), () => {
      const bestOff = table.slice().sort((a, b) => b.margin - a.margin)[0].off;
      run(defs.filter(d => d !== 'man').map(d => () => evalCombo(bestOff, d)), () => done(table.slice().sort((a, b) => b.margin - a.margin)[0], table.slice().sort((a, b) => b.margin - a.margin)));
    });
  };
  // the teams to test against: the league's own teams once they are built; before that (a draft that has not finished) a freshly drafted league of the same kind
  const built = t => t.starters && t.starters.length >= 5 && t.bench && t.bench.length >= 5 && t.starters.concat(t.bench).every(id => PB.BYID[id]);
  AS.pool = function (G, mineId) {
    const act = t => PB.activeTeam ? PB.activeTeam(G, t) : t, own = G.teams.filter(t => t.id !== mineId && built(t));
    if (own.length >= 6) return own.map(act);
    const S = PB.newGame(4242, 'main', 30, 0); PB.aiDraftRounds(S, S.rng, S.teams.map(t => t.id), 0);
    return S.teams.filter(built);
  };
  const label = b => PB.OFF_STRATS[b.off] + ' with ' + PB.DEF_STRATS[b.def];
  // the modal: progress, then the ranked results with a button to use any of them
  AS.open = function (team, pool, o) {
    AS._o = o;
    const ready = team && team.starters && team.starters.length >= 5 && team.starters.every(id => PB.BYID[id]) && team.bench && team.bench.length >= 5 && pool.length;
    if (!ready) { UI.modal(`<div class="center"><h2>Auto strategy</h2><div class="dim" style="margin:8px 0 14px">Your starting five has to be complete first.</div><button class="gold" data-act="asClose" autofocus>OK</button></div>`, { onClose: o.back }); return; }
    UI.modal(`<div class="center"><h2>Auto strategy</h2><div id="as-msg" class="dim">Testing 0 of 7…</div><div class="bar" style="margin:10px auto;max-width:320px;height:8px"><i id="as-bar" style="width:0%;background:#4aa3ff"></i></div></div>`, { onClose: o.back });
    AS.pick(team, pool, (best, table) => {
      const noise = best.se * 1.5, close = table.filter(t => best.margin - t.margin < noise).length;
      AS._table = table;
      UI.modal(`<h2>Auto strategy</h2>
        <div style="margin-bottom:8px">Best: <b class="gold">${esc(label(best))}</b> <span class="dim">(${best.margin >= 0 ? '+' : ''}${best.margin.toFixed(1)} per game against the league)</span></div>
        <table class="t"><thead><tr><th>Strategy</th><th class="n">Margin</th><th class="n">±</th><th></th></tr></thead><tbody>${table.map((t, i) => `<tr class="${i === 0 ? 'me' : ''}"><td>${esc(label(t))}</td><td class="n"><b>${t.margin >= 0 ? '+' : ''}${t.margin.toFixed(1)}</b></td><td class="n dim">${(t.se * 1.5).toFixed(1)}</td><td><button class="small" data-act="asUse" data-i="${i}">Use</button></td></tr>`).join('')}</tbody></table>
        <div class="dim" style="font-size:12px;margin-top:6px">${close > 1 ? close + ' options are within the margin of error of the best, so the order between them is not certain.' : 'The best option is clearly ahead of the rest.'}</div>
        <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="gold" data-act="asUse" data-i="0" autofocus>Use the best</button><button data-act="asClose">Keep my current strategy</button></div>`, { onClose: o.back });
    }, (d, total) => { const m = document.getElementById('as-msg'), b = document.getElementById('as-bar'); if (m) m.textContent = 'Testing ' + d + ' of ' + total + '…'; if (b) b.style.width = Math.round(100 * d / total) + '%'; }, () => UI.modal(`<div class="center"><h2>Auto strategy</h2><div class="dim" style="margin:8px 0 14px">The test could not run for this lineup.</div><button class="gold" data-act="asClose" autofocus>OK</button></div>`, { onClose: o.back }));
  };
  A.asUse = (el, d) => { const t = AS._table && AS._table[+d.i], o = AS._o; if (!t || !o) return; UI._modalBack = null; UI.closeModal(); o.apply(t); PB.toast('Strategy set: ' + label(t), 3500); if (o.back) o.back(); };
  A.asClose = () => UI.closeModal();
  // team screen
  A.autoStrat = () => {
    const G = PB.G, act = t => PB.activeTeam ? PB.activeTeam(G, t) : t;
    AS.open(act(G.teams[G.userTeam]), AS.pool(G, G.userTeam), { apply: b => PB.Ops.run('strat', { tid: G.userTeam, off: b.off, def: b.def }, () => UI.refresh()) });
  };
})(window.PB);
