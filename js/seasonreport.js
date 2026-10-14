// Season report: an end-of-season summary page (and shareable text) for your team: finish, playoff run, top performers, league awards,
// biggest moments, moves, and a season grade against what was expected of the roster.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League, GR = PB.Grades;
  const R = PB.Report = {};
  const LINK = 'https://poke82-beta.vercel.app/';
  const ROUNDS = (po, n) => po && po.conf ? (n === po.nRounds ? 'the Finals' : n === po.nRounds - 1 ? 'the conference finals' : n === po.nRounds - 2 ? 'the conference semifinals' : 'round ' + n) : po && po.single ? (n === po.nRounds ? 'the Finals' : n === po.nRounds - 1 && po.nRounds > 2 ? 'the semifinals' : n === 1 ? 'the first round' : 'round ' + n) : (['the first round', 'the semifinals', 'the conference finals', 'the Finals'][n - 1] || 'round ' + n);
  R.ROUNDS = ROUNDS;
  const gsc = PB.gameScorePG;

  R.build = function (G) {
    const lg = G.league, ut = G.userTeam, T = G.teams[ut], rec = lg.rec[ut], n = G.teams.length;
    const order = L.sortTeams(G, G.teams.map(t => t.id)), leagueRank = order.indexOf(ut) + 1;
    const confRank = lg.single ? leagueRank : L.confStandings(G, T.conf).indexOf(ut) + 1;
    // playoff run
    let run = { made: false, rounds: 0, exit: null, series: [] };
    if (lg.po) {
      lg.po.rounds.forEach((r, i) => r.forEach(s => {
        if (s.hi !== ut && s.lo !== ut) return;
        const mine = s.hi === ut ? 0 : 1, need = s.need || 4, won = s.w[mine] >= need, opp = s.hi === ut ? s.lo : s.hi;
        run.made = true; run.rounds = i + 1; run.series.push({ round: i + 1, opp, w: s.w[mine], l: s.w[1 - mine], won });
        if (!won) run.exit = i + 1;
      }));
    }
    const champ = lg.champion === ut;
    const finish = champ ? 'Won the championship' : run.made ? 'Lost in ' + ROUNDS(lg.po, run.exit || run.rounds) : 'Missed the playoffs';
    // top performers on your team
    const mine = Object.keys(lg.pstats).filter(id => L.teamOf(G, +id) === ut && lg.pstats[id].gp >= 5).map(id => ({ id: +id, s: lg.pstats[id], g: gsc(lg.pstats[id]) })).sort((a, b) => b.g - a.g).slice(0, 3);
    const lead = (k) => L.leaders(G, k, 1, false)[0];
    const leaders = { ppg: lead('ppg'), rpg: lead('rpg'), apg: lead('apg') };
    // moments from your games
        const marg = b => (b.h === ut ? b.sc[0] - b.sc[1] : b.sc[1] - b.sc[0]);
    const withM = lg.userBoxes.map(b => ({ b, m: marg(b) }));
    const bigWin = withM.filter(x => x.m > 0).sort((a, b) => b.m - a.m)[0], bigLoss = withM.filter(x => x.m < 0).sort((a, b) => a.m - b.m)[0];
    let streak = 0, best = 0; for (const x of withM.filter(x => !x.b.po)) { streak = x.m > 0 ? streak + 1 : 0; best = Math.max(best, streak); }
    let star = null; // best single game by one of your Pokémon (points)
    for (const b of lg.userBoxes) { const side = b.h === ut ? 0 : 1; for (const id in b.box[side]) { const v = b.box[side][id][0]; if (!star || v > star.pts) star = { id: +id, pts: v, b }; } }
    // expectation: roster strength rank early in the season vs where you finished
    const first = lg.pr && lg.pr.length ? lg.pr[0].order : null;
    const expected = first ? first.indexOf(ut) + 1 : G.teams.slice().sort((a, b) => PB.teamOvr(b) - PB.teamOvr(a)).findIndex(t => t.id === ut) + 1;
    const sg = GR.seasonGrade(G, ut), grade = sg.grade;
    // moves
    let moves = null;
    if (GR && G.grades) {
      const S = G.grades, y = G.fr ? G.fr.year : 0, keys = Object.keys(S.drafts), dk = G.fr ? 'f' + y : 'main';
      const d = S.drafts[dk] || (keys.length ? S.drafts[keys[keys.length - 1]] : null);
      const dr = d ? GR.teamDraft(G, d, ut) : null;
      const picks = dr ? dr.rows.slice().sort((a, b) => b.z - a.z) : [];
      const trades = S.trades.filter(t => (t.a === ut || t.b === ut) && (!G.fr || t.y === y)).map(t => { const g = GR.gradeTrade(G, t), me = t.a === ut ? g.a : g.b; return { t, g: me, pts: GR.points(me.grade), s: me.s }; }).sort((a, b) => b.s - a.s);
      moves = { draft: dr && dr.rows.length ? { letter: dr.letter, best: picks[0], worst: picks[picks.length - 1] } : null, bestTrade: trades[0] || null, worstTrade: trades.length > 1 ? trades[trades.length - 1] : null };
    }
    return { year: G.fr ? G.fr.year : 1, ut, rec, leagueRank, confRank, run, champ, finish, mine, leaders, awards: lg.awards, bigWin, bigLoss, bestStreak: best, star, expected, grade, sg, moves, champion: lg.champion, teams: n };
  };
  R.text = function (G, r) {
    const T = G.teams[r.ut], lines = [`PokeHoops 82${G.fr ? ' · Season ' + r.year : ''} report`, `${T.name}: ${r.rec.w}-${r.rec.l} (#${r.leagueRank} of ${r.teams}) · ${r.finish}`];
    if (r.mine[0]) { const s = r.mine[0].s; lines.push(`Top performer: ${PB.BYID[r.mine[0].id].dispName} (${(s.pts / s.gp).toFixed(1)} pts, ${((s.oreb + s.dreb) / s.gp).toFixed(1)} reb, ${(s.ast / s.gp).toFixed(1)} ast)`); }
    if (r.awards && r.awards.mvp != null) lines.push('League MVP: ' + PB.BYID[r.awards.mvp].dispName);
    lines.push('Season grade: ' + r.grade, LINK);
    return lines.join('\n');
  };

  const tag = (G, id) => `${UI.spr(PB.BYID[id], 22)} ${esc(PB.BYID[id].dispName)}`;
  const line = (s, gp) => `${(s.pts / gp).toFixed(1)} pts · ${((s.oreb + s.dreb) / gp).toFixed(1)} reb · ${(s.ast / gp).toFixed(1)} ast`;
  const oppOf = (G, b) => G.teams[b.h === G.userTeam ? b.a : b.h];
  const color = l => GR ? GR.color(l) : '#ffcb05';
  R.html = function (G) {
    const lg = G.league, r = R.build(G), T = G.teams[r.ut], A = r.awards;
    const mm = (x, label) => x ? `<div class="row between" style="padding:3px 0"><span class="dim">${label}</span><span>${x}</span></div>` : '';
    const award = (name, id) => id != null ? `<div class="row between" style="padding:2px 0"><span class="dim">${name}</span><span style="${L.teamOf(G, id) === r.ut ? 'color:var(--gold);font-weight:700' : ''}">${tag(G, id)}</span></div>` : '';
    const series = r.run.series.map(s => `<div class="row between"><span>${['Round 1', 'Semifinals', 'Conference finals', 'Finals'][s.round - 1] || 'Round ' + s.round} vs ${esc(G.teams[s.opp].abbr)}</span><b style="color:${s.won ? '#2fd47a' : '#ff5a5f'}">${s.won ? 'W' : 'L'} ${s.w}-${s.l}</b></div>`).join('');
    const mv = r.moves;
    const moveLine = (label, x, fn) => x ? `<div class="row between" style="padding:2px 0"><span class="dim">${label}</span><span>${fn(x)}</span></div>` : '';
    return `<div class="panel" style="border-color:${r.champ ? 'var(--gold)' : 'var(--line)'}"><div class="row between wrap"><div><div class="dim">${G.fr ? 'Season ' + r.year : 'Season'} report</div><h2 style="margin:0">${UI.logo ? UI.logo(T, 28) + ' ' : ''}${esc(T.name)}</h2><div style="font-size:18px"><b class="${r.champ ? 'gold' : ''}">${r.champ ? PB.I('trophy') + ' ' : ''}${esc(r.finish)}</b></div></div>
        <div class="kpi"><div><b>${r.rec.w}-${r.rec.l}</b><span>Record</span></div><div><b>#${r.leagueRank}</b><span>of ${r.teams}</span></div><div><b style="color:${color(r.grade)}">${r.grade}</b><span>Season grade</span></div></div></div>
      <div style="margin-top:8px"><div class="dim" style="font-size:12px;margin-bottom:4px">How the grade adds up (${r.sg.total.toFixed(0)} of 100)</div>${r.sg.parts.map(x => `<div style="margin:3px 0"><div class="row between" style="font-size:12px"><span>${x.k} <span class="dim">· ${esc(x.note)}</span></span><b>${x.v.toFixed(0)} / ${x.max}</b></div><div style="background:var(--bg2);border-radius:3px;height:8px"><div style="width:${(100 * x.v / x.max).toFixed(0)}%;height:8px;border-radius:3px;background:${color(r.grade)}"></div></div></div>`).join('')}</div></div>
      <div class="layout2" style="margin-top:10px"><div>
        <div class="panel"><h3>Top performers</h3>${r.mine.map(x => `<div class="row between" style="padding:3px 0"><span data-act="${PB.Career ? 'career' : 'inspect'}" data-id="${x.id}" tabindex="0" style="cursor:pointer">${tag(G, x.id)}</span><span class="dim">${line(x.s, x.s.gp)}</span></div>`).join('') || '<div class="dim">No data.</div>'}</div>
        ${series ? `<div class="panel" style="margin-top:10px"><h3>Playoff run</h3>${series}</div>` : ''}
        <div class="panel" style="margin-top:10px"><h3>Biggest moments</h3>
          ${mm(r.bigWin ? `${r.bigWin.b.h === r.ut ? r.bigWin.b.sc[0] : r.bigWin.b.sc[1]}-${r.bigWin.b.h === r.ut ? r.bigWin.b.sc[1] : r.bigWin.b.sc[0]} vs ${esc(oppOf(G, r.bigWin.b).abbr)}, +${r.bigWin.m}` : '', 'Biggest win')}
          ${mm(r.bigLoss ? `${r.bigLoss.b.h === r.ut ? r.bigLoss.b.sc[0] : r.bigLoss.b.sc[1]}-${r.bigLoss.b.h === r.ut ? r.bigLoss.b.sc[1] : r.bigLoss.b.sc[0]} vs ${esc(oppOf(G, r.bigLoss.b).abbr)}, ${r.bigLoss.m}` : '', 'Worst loss')}
          ${mm(r.bestStreak > 1 ? r.bestStreak + ' straight wins' : '', 'Longest streak')}
          ${mm(r.star ? `${tag(G, r.star.id)} ${r.star.pts} pts vs ${esc(oppOf(G, r.star.b).abbr)}` : '', 'Best single game')}
          ${!r.bigWin ? '<div class="dim" style="font-size:12px">Moments are tracked from games you play yourself.</div>' : ''}</div>
      </div><div>
        <div class="panel"><h3>League awards</h3>${A ? award('MVP', A.mvp) + award('Defensive Player', A.dpoy) + award('Rookie of the Year', A.roy) + award('Sixth Pokémon', A.sixth) + award('Scoring title', A.scoring) + award('Rebounding title', A.rebounding) + award('Assists title', A.assists) + award('Playoffs MVP', A.playoffMvp) : '<div class="dim">Awards are announced at the end of the season.</div>'}</div>
        <div class="panel" style="margin-top:10px"><h3>League leaders</h3>${[['Points', r.leaders.ppg], ['Rebounds', r.leaders.rpg], ['Assists', r.leaders.apg]].map(([n, x]) => x ? `<div class="row between" style="padding:2px 0"><span class="dim">${n}</span><span>${tag(G, x.id)} <b>${x.v.toFixed(1)}</b></span></div>` : '').join('')}</div>
        ${mv && (mv.draft || mv.bestTrade) ? `<div class="panel" style="margin-top:10px"><h3>Your moves</h3>${mv.draft ? `<div class="row between"><span class="dim">Draft grade</span><b style="color:${color(mv.draft.letter)}">${mv.draft.letter}</b></div>${moveLine('Best pick', mv.draft.best, x => tag(G, x.p.id) + ' <b style="color:' + color(x.grade) + '">' + x.grade + '</b>')}${mv.draft.worst && mv.draft.worst !== mv.draft.best ? moveLine('Worst pick', mv.draft.worst, x => tag(G, x.p.id) + ' <b style="color:' + color(x.grade) + '">' + x.grade + '</b>') : ''}` : ''}
          ${moveLine('Best trade', mv.bestTrade, x => esc(G.teams[x.t.a === r.ut ? x.t.b : x.t.a].abbr) + ' <b style="color:' + color(x.g.grade) + '">' + x.g.grade + '</b>')}${moveLine('Worst trade', mv.worstTrade, x => esc(G.teams[x.t.a === r.ut ? x.t.b : x.t.a].abbr) + ' <b style="color:' + color(x.g.grade) + '">' + x.g.grade + '</b>')}</div>` : ''}
      </div></div>
      <div class="panel" style="margin-top:10px"><div class="row between wrap"><div><b>Share your season</b><pre style="margin:6px 0 0;white-space:pre-wrap;font:12px monospace" class="dim">${esc(R.text(G, r))}</pre></div><div class="row"><button class="primary" data-act="rpCopy">Copy report</button>${UI.teamCardButton ? UI.teamCardButton(G.userTeam) : ''}</div></div></div>`;
  };
  UI.addHubTab('report', 'Season Report', 'home', (G, lg) => R.html(G), G => G.league && G.league.phase === 'done');
  UI.actions.rpCopy = () => { const G = PB.G, t = R.text(G, R.build(G)); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => PB.toast('Season report copied'), () => PB.toast(t.replace(/\n/g, ' · '), 7000)); };

  // the season-complete panel on Home points at it
  const home = UI.hubTabs.home;
  UI.hubTabs.home = function (G, lg, p) {
    const html = home(G, lg, p);
    if (lg.phase !== 'done') return html;
    return `<div class="panel row between wrap" style="border-color:var(--gold);margin-bottom:12px"><div><b class="gold">Your season report is ready</b></div><button class="primary" data-act="hubTab" data-tab="report">Open report</button></div>` + html;
  };
})(window.PB);
