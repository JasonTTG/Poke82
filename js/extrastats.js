// Extra statistics and all-time award counts.
//  - Milestone games (double-doubles, triple-doubles, 20/30/40-point games, 15+ rebounds, 10+ assists, 5+ steals / blocks / threes, foul-outs)
//    kept per season and for each Pokémon's career, plus the team's record when each player plays.
//  - Team splits: home, away, close games, blowouts, overtime and games against winning teams.
//  - "Award counts": every honor each Pokémon has won, all-time, and championships by team.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League, F = PB.Franchise;
  const X = PB.XStats = {};
  const MS = [['dd', 'Double-doubles'], ['td', 'Triple-doubles'], ['p20', '20+ point games'], ['p30', '30+ point games'], ['p40', '40+ point games'], ['r15', '15+ rebound games'], ['a10', '10+ assist games'], ['s5', '5+ steal games'], ['b5', '5+ block games'], ['t5', '5+ threes made'], ['fo', 'Fouled out']];
  X.MS = MS;
  const blank = () => { const o = { w: 0, l: 0 }; for (const [k] of MS) o[k] = 0; return o; };
  const seasonMx = G => (G.league.mx = G.league.mx || {});
  const careerMx = G => (G.mxCareer = G.mxCareer || {});
  const splits = G => (G.league.sp = G.league.sp || {});
  const blankSp = () => ({ cw: 0, cl: 0, bw: 0, bl: 0, ow: 0, ol: 0, qw: 0, ql: 0 });      // close, blowout, overtime, vs. winning teams

  // read before this game changes the records: [home's opponent, away's opponent]
  L.hooks.beforeRecord.push((G, game, result, playoff, ctx) => { const lg = G.league; ctx.oppWinning = [lg.rec[game.a].w > lg.rec[game.a].l, lg.rec[game.h].w > lg.rec[game.h].l]; });
  L.hooks.afterRecord.push(function (G, game, result, playoff, ctx) {
    const oppWinning = ctx.oppWinning;
    const S = seasonMx(G), Cr = careerMx(G), sc = result.score, tid = [game.h, game.a];
    for (let s = 0; s < 2; s++) {
      const won = sc[s] > sc[1 - s], margin = Math.abs(sc[0] - sc[1]);
      if (!playoff) {
        const sp = splits(G)[tid[s]] || (splits(G)[tid[s]] = blankSp());
        if (margin <= 5) won ? sp.cw++ : sp.cl++;
        if (margin >= 15) won ? sp.bw++ : sp.bl++;
        if (result.ot) won ? sp.ow++ : sp.ol++;
        if (oppWinning[s]) won ? sp.qw++ : sp.ql++;
      }
      for (const id in result.box[s]) {
        const b = result.box[s][id]; if (b.sec <= 0) continue;
        const reb = b.oreb + b.dreb, dbl = [b.pts, reb, b.ast, b.stl, b.blk].filter(v => v >= 10).length;
        const hit = { dd: dbl >= 2, td: dbl >= 3, p20: b.pts >= 20, p30: b.pts >= 30, p40: b.pts >= 40, r15: reb >= 15, a10: b.ast >= 10, s5: b.stl >= 5, b5: b.blk >= 5, t5: b.tpm >= 5, fo: b.pf >= 6 };
        for (const M of playoff ? [] : [S, Cr]) {
          const o = M[id] || (M[id] = blank());
          won ? o.w++ : o.l++;
          for (const k in hit) if (hit[k]) o[k]++;
        }
        if (playoff) { const o = Cr[id] || (Cr[id] = blank()); for (const k in hit) if (hit[k]) o[k]++; }
      }
    }
  });
  // evolving keeps the career counters
  if (F && F.evolve) {
    const origEvolve = F.evolve;
    F.evolve = function (G, id, toId) {
      const r = origEvolve(G, id, toId), C = careerMx(G);
      if (C[id]) { const t = C[toId] || (C[toId] = blank()); for (const k in C[id]) t[k] = (t[k] || 0) + C[id][k]; delete C[id]; }
      return r;
    };
  }

  // ---------- Milestones tab ----------
  const view = { scope: 'season', team: 'all' };
  const who = (G, id) => UI.monLink(G, id, L.teamOf(G, id));
  const page = function (G, lg) {
    const src = view.scope === 'career' ? careerMx(G) : seasonMx(G);
    const ids = Object.keys(src).map(Number).filter(id => view.team === 'all' || L.teamOf(G, id) === +view.team);
    const card = ([k, name]) => {
      const rows = ids.filter(id => src[id][k] > 0).sort((a, b) => src[b][k] - src[a][k]).slice(0, 8);
      return `<div class="panel" style="padding:10px"><b>${name}</b>${rows.length ? rows.map((id, i) => `<div class="row between" style="padding:2px 0;${L.teamOf(G, id) === G.userTeam ? 'color:var(--gold)' : ''}"><span><span class="dim" style="display:inline-block;width:18px">${i + 1}</span>${who(G, id)}</span><b>${src[id][k]}</b></div>`).join('') : '<div class="dim" style="font-size:12px;margin-top:4px">None yet.</div>'}</div>`;
    };
    // team record when a player plays (your team)
    const ut = G.userTeam, mine = Object.keys(seasonMx(G)).map(Number).filter(id => L.teamOf(G, id) === ut).map(id => ({ id, o: seasonMx(G)[id] })).filter(x => x.o.w + x.o.l > 0).sort((a, b) => (b.o.w + b.o.l) - (a.o.w + a.o.l));
    const sp = splits(G), R = lg.rec, ord = L.sortTeams(G, G.teams.map(t => t.id));
    const cell = (w, l) => `<td class="n">${w}-${l}</td>`;
    const splitRows = ord.map(tid => { const t = G.teams[tid], r = R[tid], s = sp[tid] || blankSp(); return `<tr class="${t.id === G.userTeam ? 'me' : ''}"><td>${UI.teamLabel(G, tid)}</td>${cell(r.hw, r.hl)}${cell(r.aw, r.al)}${cell(s.cw, s.cl)}${cell(s.bw, s.bl)}${cell(s.ow, s.ol)}${cell(s.qw, s.ql)}</tr>`; }).join('');
    return `<div class="panel"><div class="row between wrap"><div><h2 style="margin:0">Milestones & splits</h2></div>
        <div class="row wrap"><label>Show <select data-change="xsScope"><option value="season" ${view.scope === 'season' ? 'selected' : ''}>This season</option><option value="career" ${view.scope === 'career' ? 'selected' : ''}>Career (all seasons)</option></select></label>
        <label>Team <select data-change="xsTeam"><option value="all">All teams</option>${G.teams.map(t => `<option value="${t.id}" ${String(view.team) === String(t.id) ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('')}</select></label></div></div></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px;margin-top:10px">${MS.map(card).join('')}</div>
      <div class="panel" style="margin-top:10px"><h3>Team splits (regular season)</h3><div class="scroll"><table class="t"><thead><tr><th>Team</th><th class="n">Home</th><th class="n">Away</th><th class="n" title="Decided by 5 points or fewer">Close</th><th class="n" title="Decided by 15 or more">Blowouts</th><th class="n">Overtime</th><th class="n" title="Against teams over .500 at the time">vs. winning</th></tr></thead><tbody>${splitRows}</tbody></table></div></div>
      <div class="panel" style="margin-top:10px"><h3>${esc(G.teams[ut].name)}: record when each Pokémon plays</h3>${mine.length ? `<div class="scroll"><table class="t"><thead><tr><th>Pokémon</th><th class="n">Games</th><th class="n">Team W-L</th><th class="n">Win %</th><th class="n">Double-doubles</th><th class="n">20+ pts</th></tr></thead><tbody>${mine.map(x => `<tr><td>${who(G, x.id)}</td><td class="n">${x.o.w + x.o.l}</td><td class="n">${x.o.w}-${x.o.l}</td><td class="n">${((100 * x.o.w) / (x.o.w + x.o.l)).toFixed(0)}%</td><td class="n">${x.o.dd}</td><td class="n">${x.o.p20}</td></tr>`).join('')}</tbody></table></div>` : '<div class="dim">Appears once games are played.</div>'}</div>`;
  };
  UI.statViews.push({ key: 'milestones', label: 'Milestones', fn: page });
  UI.actions.xsScope = el => { view.scope = el.value; UI.refresh(); };
  UI.actions.xsTeam = el => { view.team = el.value; UI.refresh(); };

  // a Pokémon's career page also lists its milestones
  const C = PB.Career;
  if (C) {
    const origHtml = C.html;
    C.html = function (G, id) {
      const o = careerMx(G)[id], base = origHtml(G, id);
      if (!o || !MS.some(([k]) => o[k] > 0)) return base;
      return base + `<h3 style="margin-top:10px">Milestones</h3><div class="row wrap">${MS.filter(([k]) => o[k] > 0).map(([k, n]) => `<span class="tag">${n}: <b>${o[k]}</b></span>`).join(' ')}</div>`;
    };
  }

  // ---------- all-time award counts ----------
  const AW = [['MVP', 'MVP', 'MVP'], ['Playoffs MVP', 'Finals MVP', 'FMVP'], ['DPOY', 'Defensive Player', 'DPOY'], ['Rookie of the Year', 'Rookie of the Year', 'ROY'], ['Sixth Pokémon', 'Sixth Pokémon', '6th'], ['All-League', 'All-League teams', 'All-Lg'], ['All-Defense', 'All-Defense teams', 'All-Def'], ['All-Star', 'All-Star games', 'All-Star'], ['All-Rookie Team', 'All-Rookie teams', 'All-Rk'], ['Scoring title', 'Scoring titles', 'Scoring'], ['Rebounding title', 'Rebounding titles', 'Reb'], ['Assists title', 'Assists titles', 'Ast']];
  const SCORE = { 'MVP': 8, 'Playoffs MVP': 3, 'DPOY': 4, 'Rookie of the Year': 2, 'Sixth Pokémon': 2, 'All-League': 3, 'All-Defense': 1.5, 'All-Star': 1.5, 'All-Rookie Team': 1, 'Scoring title': 2, 'Rebounding title': 2, 'Assists title': 2, titles: 3 };
  X.awardCounts = function (G) {
    const C2 = PB.Career, out = [], teamTitles = {}, seen = new Set();
    if (!C2 || !G.careerLog) return { players: out, teams: teamTitles };
    for (const id in G.careerLog) {
      const rows = C2.rowsOf(G, id), c = { id: +id, titles: 0, seasons: rows.length, last: null };
      for (const [k] of AW) c[k] = 0;
      for (const r of rows) {
        if (r.champ) { c.titles++; const key = r.y + ':' + r.t; if (!seen.has(key) && r.t != null) { seen.add(key); teamTitles[r.t] = (teamTitles[r.t] || 0) + 1; } }
        for (const h of r.honors) for (const [k] of AW) if (h === k || h.startsWith(k + ' ') || (k === 'All-League' && h.startsWith('All-League')) || (k === 'All-Defense' && h.startsWith('All-Defense'))) { c[k]++; break; }
        c.last = r.t;
      }
      c.score = AW.reduce((s, [k]) => s + c[k] * (SCORE[k] || 1), 0) + c.titles * SCORE.titles;
      if (c.score > 0 || c.titles) out.push(c);
    }
    return { players: out, teams: teamTitles };
  };
  const av = { sort: 'score', desc: true, team: 'all' };
  const awardsPage = function (G, lg) {
    const D = X.awardCounts(G);
    let rows = D.players.filter(r => av.team === 'all' || (G.claimed[r.id] != null ? G.claimed[r.id] : r.last) === +av.team);
    rows.sort((a, b) => ((b[av.sort] || 0) - (a[av.sort] || 0)) * (av.desc ? 1 : -1) || b.score - a.score);
    const th = (k, l, tip) => `<th class="n ${av.sort === k ? 'sorted' : ''}" data-act="awSort" data-k="${k}" style="cursor:pointer" title="${tip || ''}">${l}${av.sort === k ? (av.desc ? ' ▼' : ' ▲') : ''}</th>`;
    const tt = Object.entries(D.teams).sort((a, b) => b[1] - a[1]);
    return `<div class="panel"><div class="row between wrap"><div><h2 style="margin:0">Award counts</h2></div>
        <label>Team <select data-change="awTeam"><option value="all">All teams</option>${G.teams.map(t => `<option value="${t.id}" ${String(av.team) === String(t.id) ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('')}</select></label></div></div>
      <div class="layout2" style="margin-top:10px"><div class="panel"><div class="scroll" style="max-height:none"><table class="t"><thead><tr><th>#</th><th>Pokémon</th>${th('titles', 'Titles', 'Championships won')}${AW.map(([k, n, s]) => th(k, s, n)).join('')}${th('score', 'Total', 'Weighted award score')}</tr></thead>
        <tbody>${rows.slice(0, 60).map((r, i) => `<tr class="${(G.claimed[r.id] != null ? G.claimed[r.id] : r.last) === G.userTeam ? 'me' : ''}"><td class="dim">${i + 1}</td><td>${who(G, r.id)}</td><td class="n">${r.titles || ''}</td>${AW.map(([k]) => `<td class="n">${r[k] || ''}</td>`).join('')}<td class="n"><b>${r.score}</b></td></tr>`).join('') || '<tr><td colspan="16" class="dim">No awards handed out yet. They appear when a season ends.</td></tr>'}</tbody></table></div></div>
        <div class="panel"><h3>Championships by team</h3>${tt.length ? tt.map(([t, n]) => `<div class="row between" style="padding:2px 0;${+t === G.userTeam ? 'color:var(--gold)' : ''}"><span>${G.teams[t] ? UI.teamLabel(G, +t) : '?'}</span><b>${n}</b></div>`).join('') : '<div class="dim">No champions yet.</div>'}</div></div>`;
  };
  UI.addHubTab('awardcounts', 'Award Counts', 'awards', awardsPage, G => !!G.league);
  UI.actions.awSort = (el, d) => { if (av.sort === d.k) av.desc = !av.desc; else { av.sort = d.k; av.desc = true; } UI.refresh(); };
  UI.actions.awTeam = el => { av.team = el.value; UI.refresh(); };
  // ---------- every player in the league: sort, filter, search ----------
  const pv = { sort: 'ovr', desc: true, team: 'all', pos: 'all', q: '', lim: 60 };
  const players = function (G, lg, po) {
    const vis = UI.vis(), fa = G.fr && G.fr.pool ? Object.keys(G.fr.pool).map(Number) : [];
    const stat = id => { const m = po ? lg.pstatsPO : lg.pstats; return m && m[id]; }, per = (a, g) => g ? a / g : 0;
    let rows = G.teams.flatMap(t => t.roster.map(id => ({ id, tid: t.id }))).concat(fa.map(id => ({ id, tid: -1 })));
    rows = rows.filter(r => (pv.team === 'all' || String(r.tid) === pv.team) && (pv.pos === 'all' || PB.BYID[r.id].r.pos1 === +pv.pos) && (!pv.q || PB.BYID[r.id].dispName.toLowerCase().includes(pv.q.toLowerCase())));
    const val = r => { const m = PB.BYID[r.id], s = stat(r.id) || {}, g = s.gp || 0; switch (pv.sort) {
      case 'name': return m.dispName; case 'team': return r.tid < 0 ? 'zzz' : G.teams[r.tid].abbr; case 'pos': return m.r.pos1; case 'ovr': return m.ovr;
      case 'gp': return g; case 'ppg': return per(s.pts, g); case 'rpg': return per((s.oreb || 0) + (s.dreb || 0), g); case 'apg': return per(s.ast, g); case 'spg': return per(s.stl, g); case 'bpg': return per(s.blk, g);
      case 'fg': return s.fga ? s.fgm / s.fga : -1; case 'tp': return s.tpa ? s.tpm / s.tpa : -1; default: return 0; } };
    rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * (pv.desc ? -1 : 1); });
    const th = (k, l, left) => `<th class="${left ? '' : 'n'} ${pv.sort === k ? 'sorted' : ''}" data-act="plSort" data-k="${k}" style="cursor:pointer">${l}${pv.sort === k ? (pv.desc ? ' ▼' : ' ▲') : ''}</th>`;
    const f1 = v => v.toFixed(1), pct = (a, b) => b ? (100 * a / b).toFixed(1) : '-';
    return `<div class="panel"><div class="row between wrap"><div><h2 style="margin:0">Players</h2></div>
      <div class="row wrap"><label>Team <select data-change="plTeam"><option value="all">All teams</option>${G.teams.map(t => `<option value="${t.id}" ${pv.team === String(t.id) ? 'selected' : ''}>${esc(t.abbr)} · ${esc(t.name)}</option>`).join('')}${fa.length ? `<option value="-1" ${pv.team === '-1' ? 'selected' : ''}>Free agents</option>` : ''}</select></label>
      ${vis.P ? `<label>Position <select data-change="plPos"><option value="all">All</option>${PB.POS.map((n, i) => `<option value="${i}" ${pv.pos === String(i) ? 'selected' : ''}>${n}</option>`).join('')}</select></label>` : ''}
      <label>Search <input type="text" id="pl-q" value="${esc(pv.q)}" placeholder="name, then Enter" style="width:120px" data-change="plSearch"></label></div></div>
      <div class="dim" style="font-size:12px;margin-top:4px">${rows.length} Pokémon</div>
      <div class="scroll" style="max-height:none"><table class="t"><thead><tr><th>#</th>${th('name', 'Pokémon', 1)}${th('team', 'Team', 1)}${vis.P ? th('pos', 'Pos', 1) : ''}${vis.O ? th('ovr', 'OVR') : ''}${th('gp', 'GP')}${th('ppg', 'PPG')}${th('rpg', 'RPG')}${th('apg', 'APG')}${th('spg', 'SPG')}${th('bpg', 'BPG')}${th('fg', 'FG%')}${th('tp', '3P%')}</tr></thead>
      <tbody>${rows.slice(0, pv.lim).map((r, i) => { const m = PB.BYID[r.id], s = stat(r.id), g = s ? s.gp : 0, t = r.tid >= 0 ? G.teams[r.tid] : null;
        return `<tr class="${r.tid === G.userTeam ? 'me' : ''}"><td class="dim">${i + 1}</td><td data-act="${PB.Career ? 'career' : 'inspect'}" data-id="${r.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 22)} ${esc(m.dispName)}</td><td class="dim">${t ? esc(t.abbr) : 'FA'}</td>${vis.P ? `<td>${UI.posBadges ? UI.posBadges(m) : esc(m.pos[0])}</td>` : ''}${vis.O ? `<td class="n"><b>${m.ovr}</b></td>` : ''}<td class="n">${g || '-'}</td><td class="n">${g ? f1(per(s.pts, g)) : '-'}</td><td class="n">${g ? f1(per(s.oreb + s.dreb, g)) : '-'}</td><td class="n">${g ? f1(per(s.ast, g)) : '-'}</td><td class="n">${g ? f1(per(s.stl, g)) : '-'}</td><td class="n">${g ? f1(per(s.blk, g)) : '-'}</td><td class="n">${g ? pct(s.fgm, s.fga) : '-'}</td><td class="n">${g ? pct(s.tpm, s.tpa) : '-'}</td></tr>`; }).join('')}</tbody></table></div>
      ${rows.length > pv.lim ? `<div class="row" style="margin-top:8px;justify-content:center"><button data-act="plMore">Show 60 more</button></div>` : ''}</div>`;
  };
  UI.playersView = players;
  UI.actions.plSort = (el, d) => { if (pv.sort === d.k) pv.desc = !pv.desc; else { pv.sort = d.k; pv.desc = d.k !== 'name' && d.k !== 'team'; } UI.refresh(); };
  UI.actions.plTeam = el => { pv.team = el.value; pv.lim = 60; UI.refresh(); };
  UI.actions.plPos = el => { pv.pos = el.value; pv.lim = 60; UI.refresh(); };
  UI.actions.plMore = () => { pv.lim += 60; UI.refresh(); };
  UI.actions.plSearch = el => { pv.q = el.value; pv.lim = 60; UI.refresh(); const i = document.getElementById('pl-q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
})(window.PB);
