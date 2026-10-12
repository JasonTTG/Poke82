// League record book: single-game, season, team and career records for every mode, kept as top-10 lists, with a toast when one falls.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League, C = PB.Career;
  const R = PB.Records = {};
  const rb = G => (G.rb = G.rb || { game: {}, season: {}, team: {} });
  const yearOf = G => G.fr ? G.fr.year : 1;
  const GAME = [['pts', 'Points', b => b.pts], ['reb', 'Rebounds', b => b.oreb + b.dreb], ['ast', 'Assists', b => b.ast], ['stl', 'Steals', b => b.stl], ['blk', 'Blocks', b => b.blk], ['tpm', 'Threes made', b => b.tpm]];
  const SEASON = [['ppg', 'Points per game', s => s.pts / s.gp, 1], ['rpg', 'Rebounds per game', s => (s.oreb + s.dreb) / s.gp, 1], ['apg', 'Assists per game', s => s.ast / s.gp, 1], ['spg', 'Steals per game', s => s.stl / s.gp, 1], ['bpg', 'Blocks per game', s => s.blk / s.gp, 1], ['pts', 'Total points', s => s.pts, 0], ['tpm', 'Threes made', s => s.tpm, 0]];
  const CAREER = [['pts', 'Points'], ['reb', 'Rebounds'], ['ast', 'Assists'], ['stl', 'Steals'], ['blk', 'Blocks'], ['tpm', 'Threes made'], ['gp', 'Games played']];
  R.GAME = GAME; R.SEASON = SEASON;

  // insert into a descending top-N list; returns the new rank (0 = record) or -1
  const put = (list, e, max) => {
    max = max || 10;
    if (list.length >= max && e.v <= list[list.length - 1].v) return -1;
    list.push(e); list.sort((a, b) => b.v - a.v);
    const i = list.indexOf(e); if (list.length > max) list.length = max;
    return i < max ? i : -1;
  };
  const userSide = (G, ...tids) => tids.some(t => G.teams[t] && G.teams[t].user);

  const origRecord = L.record;
  L.record = function (G, game, result, playoff) {
    origRecord(G, game, result, playoff);
    const B = rb(G), y = yearOf(G), tid = [game.h, game.a];
    for (let s = 0; s < 2; s++) {
      for (const id in result.box[s]) {
        const b = result.box[s][id]; if (b.sec <= 0) continue;
        for (const [k, name, f] of GAME) {
          const v = f(b); if (v < 3 && k !== 'pts') continue;
          const list = B.game[k] = B.game[k] || [], was = list.length ? list[0].v : 0, settled = list.length >= 10 && (G.league.day > 25 || (G.fr && G.fr.year > 1));
          const rank = put(list, { v, id: +id, t: tid[s], y, d: game.day, opp: tid[1 - s], po: playoff ? 1 : 0 });
          if (rank === 0 && v > was && settled && userSide(G, tid[0], tid[1]) && PB.toast) PB.toast(`NEW LEAGUE RECORD: ${v} ${name.toLowerCase()} in a game, ${PB.BYID[id].dispName}!`, 4200);
        }
      }
      const sc = result.score[s], margin = sc - result.score[1 - s];
      put(B.team.pts = B.team.pts || [], { v: sc, t: tid[s], y, d: game.day, opp: tid[1 - s] });
      if (margin > 0) put(B.team.margin = B.team.margin || [], { v: margin, t: tid[s], y, d: game.day, opp: tid[1 - s] });
      if (!playoff) { const st = G.league.rec[tid[s]].strk; if (st > 0) { const list = B.team.streak = B.team.streak || [], mine = list.find(e => e.t === tid[s] && e.y === y); if (mine) { if (st > mine.v) { mine.v = st; list.sort((a, b) => b.v - a.v); } } else put(list, { v: st, t: tid[s], y }); } }
    }
  };

  const origFinish = L.finishSeason;
  L.finishSeason = function (G) {
    origFinish(G);
    const lg = G.league, B = rb(G), y = yearOf(G);
    const need = Math.max(1, Math.round(lg.games * 0.5));
    for (const id in lg.pstats) {
      const s = lg.pstats[id], tid = L.teamOf(G, +id); if (!s.gp) continue;
      for (const [k, , f, avg] of SEASON) { if (avg && s.gp < need) continue; const v = f(s); if (v > 0) put(B.season[k] = B.season[k] || [], { v: avg ? Math.round(v * 100) / 100 : v, id: +id, t: tid, y }); }
    }
    for (const t of G.teams) {
      const r = lg.rec[t.id], gp = r.w + r.l; if (!gp) continue;
      put(B.team.wins = B.team.wins || [], { v: r.w, w: r.w, l: r.l, t: t.id, y });
      put(B.team.losses = B.team.losses || [], { v: r.l, w: r.w, l: r.l, t: t.id, y });
    }
  };

  // ---------- page ----------
  const TEAM = [['pts', 'Most points in a game'], ['margin', 'Biggest margin of victory'], ['streak', 'Longest win streak'], ['wins', 'Most wins in a season'], ['losses', 'Most losses in a season']];
  const view = { open: {} };
  const who = (G, e) => { const m = PB.BYID[e.id], t = G.teams[e.t]; return `<span data-act="${C ? 'career' : 'inspect'}" data-id="${e.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 20)} ${esc(m.dispName)}</span> <span class="dim">${t ? esc(t.abbr) : ''}</span>`; };
  const tm = (G, e) => `${UI.logo ? UI.logo(G.teams[e.t], 16) + ' ' : ''}${esc(G.teams[e.t].name)}`;
  const when = (G, e) => (G.fr && e.y ? 'S' + e.y : '') + (e.d ? (G.fr && e.y ? ' · ' : '') + L.dateStr(e.d) : '') + (e.po ? ' · playoffs' : '');
  const card = (G, key, title, list, row, fmtV) => {
    const open = !!view.open[key], n = open ? 10 : 3;
    return `<div class="panel" style="padding:10px"><div class="row between"><b>${title}</b>${list.length > 3 ? `<button class="small" data-act="rbMore" data-k="${key}">${open ? 'Top 3' : 'Top 10'}</button>` : ''}</div>
      ${list.length ? list.slice(0, n).map((e, i) => `<div class="row between" style="padding:2px 0;${(G.teams[e.t] && G.teams[e.t].user) ? 'color:var(--gold)' : ''}"><span><span class="dim" style="display:inline-block;width:18px">${i + 1}</span>${row(e)}</span><span><b>${fmtV(e.v)}</b> <span class="dim" style="font-size:11px">${when(G, e)}</span></span></div>`).join('') : '<div class="dim" style="font-size:12px">No record yet.</div>'}</div>`;
  };
  const page = function (G, lg) {
    const B = rb(G), grid = c => `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px">${c}</div>`;
    const game = grid(GAME.map(([k, n]) => card(G, 'g' + k, n + ' in a game', B.game[k] || [], e => who(G, e), v => v)).join(''));
    const season = grid(SEASON.map(([k, n, , avg]) => card(G, 's' + k, n + (avg ? '' : ' in a season'), B.season[k] || [], e => who(G, e), v => avg ? v.toFixed(1) : v)).join(''));
    const team = grid(TEAM.map(([k, n]) => card(G, 't' + k, n, B.team[k] || [], e => tm(G, e), v => v)).join(''));
    let career = '';
    if (C && G.careerLog && Object.keys(G.careerLog).length) {
      career = `<h3 style="margin:14px 0 6px">Career</h3>` + grid(CAREER.map(([k, n]) => { const list = C.leaders(G, k === 'gp' ? 'gp' : k).slice(0, 10).filter(x => x.v > 0).map(x => ({ v: x.v, id: x.id, t: G.claimed ? (G.claimed[x.id] != null ? G.claimed[x.id] : 0) : 0, y: 0 })); return card(G, 'c' + k, n, list, e => who(G, e), v => v); }).join(''));
    }
    return `<div class="panel"><h2 style="margin:0">Record book</h2><div class="dim">Single-game, season, team and career records for this league. Your teams are in gold. A message appears when one is broken in a game you are part of.</div></div>
      <h3 style="margin:14px 0 6px">Single game</h3>${game}<h3 style="margin:14px 0 6px">Season</h3>${season}<h3 style="margin:14px 0 6px">Teams</h3>${team}${career}`;
  };
  UI.addHubTab('records', 'Record Book', 'awards', page, G => G.mode !== 'franchise');
  UI.hubTabs.records = page;                 // franchise leagues already have a Records tab: swap in the full record book
  UI.actions.rbMore = (el, d) => { view.open[d.k] = !view.open[d.k]; UI.refresh(); };
})(window.PB);
