// Draft and trade grades. Every pick is logged with the alternatives that were on the board; a pick's grade compares how the player
// is rated now (rating, plus potential in franchise) with those alternatives. Trades are graded by the value each side got vs gave today.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, F = PB.Franchise, FA = PB.Fantasy, L2 = PB.League;
  const GR = PB.Grades = {};
  const store = G => (G.grades = G.grades || { drafts: {}, trades: [] });

  // ---------- logging ----------
  PB.logPick = function (G, kind, key, label, pick) {
    const S = store(G), d = S.drafts[key] || (S.drafts[key] = { kind, key, label, year: G.fr ? G.fr.year : 0, picks: [] });
    d.picks.push(pick);
  };
  // main (random) draft: the AI teams log inside aiDraftRounds, the player in the draft screen
  // franchise
  const origPick = F.draftPick;
  F.draftPick = function (G, tid, monId) {
    const d = G.fr.draft, n = d.pick, alts = d.prospects.slice(0, 10).filter(x => x !== monId), slot = d.slots ? d.slots[n] : null, gen = d.gen;
    origPick(G, tid, monId);
    PB.logPick(G, 'franchise', 'f' + G.fr.year, G.fr.mixed ? 'Season ' + G.fr.year + ' draft (mixed class)' : 'Season ' + G.fr.year + ' draft · ' + PB.REGIONS[gen], { n, t: tid, id: monId, alts, r: slot ? slot.r : null, o: slot ? slot.o : null });
  };
  // fantasy
  if (FA) {
    const origMake = FA.make;
    FA.make = function (G, teamId, monId) {
      const D = G.fdraft, n = D.pick, alts = FA.available(G).slice(0, 10).filter(x => x !== monId);
      origMake(G, teamId, monId);
      PB.logPick(G, 'fantasy', 'fantasy', 'Fantasy draft', { n, t: teamId, id: monId, alts });
    };
  }
  // trades
  const origTrade = F.trade;
  F.trade = function (G, a, b, giveA, giveB, force, prot) {
    origTrade(G, a, b, giveA, giveB, force, prot);
    store(G).trades.push({ y: G.fr.year, d: G.league ? G.league.day : 0, a, b, ga: giveA.slice(), gb: giveB.slice() });
  };

  // ---------- valuation ----------
  const resolve = (G, id) => { let cur = id; const log = G.fr ? G.fr.evoLog : []; for (let i = 0; i < 6; i++) { const e = log.find(x => x.from === cur); if (!e) break; cur = e.to; } return cur; };
  GR.val = (G, id) => { const cur = resolve(G, id), m = PB.BYID[cur]; return G.fr ? F.mval(m) : m.ovr; };
  const LET = [['A+', 4.3], ['A', 4.0], ['A-', 3.7], ['B+', 3.3], ['B', 3.0], ['B-', 2.7], ['C+', 2.3], ['C', 2.0], ['C-', 1.7], ['D', 1.0], ['F', 0]];
  GR.letter = pts => { for (const [l, p] of LET) if (pts >= p - 0.15) return l; return 'F'; };
  GR.points = l => (LET.find(x => x[0] === l) || [0, 0])[1];
  GR.color = l => l[0] === 'A' ? '#2fd47a' : l[0] === 'B' ? '#9be15d' : l[0] === 'C' ? '#ffcb05' : l[0] === 'D' ? '#ff9a3c' : '#ff5a5f';

  // a pick: chosen vs the options that were on the board
  GR.gradePick = function (G, p) {
    const opts = Array.from(new Set(p.alts.concat([p.id]))), vals = opts.map(id => GR.val(G, id)), me = GR.val(G, p.id);
    const best = Math.max(...vals), bi = vals.indexOf(best), others = vals.filter((v, i) => opts[i] !== p.id), second = others.length ? Math.max(...others) : me;
    const gap = best - me, rank = 1 + vals.filter(v => v > me + 1e-9).length;
    const grade = gap <= 0.001 ? (me - second >= 4 ? 'A+' : 'A') : gap <= 1.5 ? 'A-' : gap <= 3 ? 'B+' : gap <= 5 ? 'B' : gap <= 7 ? 'B-' : gap <= 9 ? 'C+' : gap <= 12 ? 'C' : gap <= 15 ? 'D' : 'F';
    return { grade, gap, rank, of: opts.length, best: opts[bi], bestVal: best, val: me };
  };
  GR.teamDraft = function (G, d, tid) {
    const rows = d.picks.filter(p => p.t === tid).map(p => Object.assign({ p }, GR.gradePick(G, p)));
    const gpa = rows.length ? rows.reduce((s, r) => s + GR.points(r.grade), 0) / rows.length : null;
    return { rows, gpa, letter: gpa == null ? '-' : GR.letter(gpa) };
  };

  // trades: today's value of what each side received vs what it gave (picks count as the player taken with them, or the pick value if unused)
  const tv = v => Math.exp((v - 52) / 8);
  GR.assetVal = function (G, a) {
    if (F.isPick(a)) {
      const m = /^p:(\d+)\.(\d+)\.(\d+)/.exec(a), y = m ? +m[1] : 0, r = m ? +m[2] : -1, o = m ? +m[3] : -1, d = store(G).drafts['f' + y];
      if (d) { const pk = d.picks.find(x => x.r === r && x.o === o); if (pk) return tv(GR.val(G, pk.id)); }
      return F.pickVal ? F.pickVal(G, a) : 1;
    }
    return tv(GR.val(G, a));
  };
  GR.gradeTrade = function (G, t) {
    const sum = arr => arr.reduce((s, a) => s + GR.assetVal(G, a), 0);
    const side = (got, gave) => { const g1 = sum(got), g2 = sum(gave), s = (g1 - g2) / ((g1 + g2) || 1); const grade = s >= 0.4 ? 'A+' : s >= 0.25 ? 'A' : s >= 0.12 ? 'A-' : s >= 0.04 ? 'B+' : s >= -0.04 ? 'B' : s >= -0.12 ? 'B-' : s >= -0.25 ? 'C' : s >= -0.4 ? 'D' : 'F'; return { got: g1, gave: g2, s, grade }; };
    return { a: side(t.gb, t.ga), b: side(t.ga, t.gb) };
  };

  // ---------- UI ----------
  const view = { draft: null, team: null, tradeFilter: 'mine' };
  const has = G => !!(G.grades && (Object.keys(G.grades.drafts).length || G.grades.trades.length));
  const chip = l => `<span class="gradechip" style="color:${GR.color(l)};border-color:${GR.color(l)}">${l}</span>`;
  const nm = (G, a) => F.isPick(a) ? `<span class="tag">${esc(F.pickLabel(G, a))}</span>` : `${UI.spr(PB.BYID[a], 20)} ${esc(PB.BYID[a].dispName)}`;
  UI.addHubTab('grades', 'Grades', 'power', function (G, lg) {
    const S = store(G), live = G.fr && G.fr.stage === 'draft' ? 'f' + G.fr.year : null;
    const keys = Object.keys(S.drafts).filter(k => k !== live);
    if (!view.draft || !keys.includes(view.draft)) view.draft = keys[keys.length - 1] || null;
    const d = view.draft ? S.drafts[view.draft] : null;
    if (view.team == null || !G.teams[view.team]) view.team = G.userTeam;
    const mine = keys.map(k => GR.teamDraft(G, S.drafts[k], G.userTeam)).filter(x => x.gpa != null), myTr = S.trades.filter(t => t.a === G.userTeam || t.b === G.userTeam).map(t => { const g = GR.gradeTrade(G, t); return t.a === G.userTeam ? g.a : g.b; });
    const pts = mine.map(x => x.gpa).concat(myTr.map(x => GR.points(x.grade))), gm = pts.length ? GR.letter(pts.reduce((a, b) => a + b, 0) / pts.length) : '-';
    let drafts = '<div class="panel dim">No completed drafts yet.</div>';
    if (d) {
      const board = G.teams.map(t => ({ t, r: GR.teamDraft(G, d, t.id) })).filter(x => x.r.rows.length).sort((a, b) => b.r.gpa - a.r.gpa);
      const sel = GR.teamDraft(G, d, view.team);
      drafts = `<div class="panel"><div class="row between wrap"><h3 style="margin:0">Draft grades</h3><div class="row wrap"><label>Draft <select data-change="grDraft">${keys.map(k => `<option value="${k}" ${k === view.draft ? 'selected' : ''}>${esc(S.drafts[k].label)}</option>`).join('')}</select></label>
        <label>Team <select data-change="grTeam">${G.teams.map(t => `<option value="${t.id}" ${t.id === view.team ? 'selected' : ''}>${esc(t.abbr)}${t.user ? ' ★' : ''}</option>`).join('')}</select></label></div></div>
        <div class="dim" style="font-size:12px;margin:6px 0">Each pick is graded against the other players who were on the board: A means you took the best of them as they look today (rating and potential), lower grades mean a better option was left behind.</div>
        <div class="layout2"><div><table class="t"><thead><tr><th>Pick</th><th>Pokémon</th><th class="n">Grade</th><th>Best alternative</th><th class="n">Gap</th></tr></thead><tbody>${sel.rows.map(r => `<tr><td class="dim">${r.p.n + 1}</td><td>${nm(G, r.p.id)}</td><td class="n">${chip(r.grade)}</td><td>${r.rank === 1 ? '<span class="dim">best pick</span>' : nm(G, r.best)}</td><td class="n dim">${r.gap > 0.001 ? '-' + r.gap.toFixed(1) : '0'}</td></tr>`).join('') || '<tr><td colspan="5" class="dim">No picks.</td></tr>'}</tbody></table>
        <div class="row" style="margin-top:6px"><b>${esc(G.teams[view.team].name)}</b> <span class="dim">draft grade</span> ${chip(sel.letter)}</div></div>
        <div><h3>Class ranking</h3><table class="t"><tbody>${board.map((x, i) => `<tr class="${x.t.user ? 'me' : ''}" style="cursor:pointer" data-act="grTeamPick" data-t="${x.t.id}"><td class="dim">${i + 1}</td><td>${UI.teamLabel(G, x.t.id)}</td><td class="n">${chip(x.r.letter)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
    const trs = S.trades.filter(t => view.tradeFilter === 'all' || t.a === G.userTeam || t.b === G.userTeam).slice().reverse();
    const col = (tid, gv, got, gave) => `<div style="flex:1;min-width:220px"><div class="row between"><b>${esc(G.teams[tid].abbr)}</b>${chip(gv.grade)}</div><div style="font-size:12px"><span class="dim">Got:</span> ${got.map(a => nm(G, a)).join(', ') || '—'}</div><div style="font-size:12px"><span class="dim">Gave:</span> ${gave.map(a => nm(G, a)).join(', ') || '—'}</div></div>`;
    const trades = `<div class="panel" style="margin-top:10px"><div class="row between wrap"><h3 style="margin:0">Trade grades</h3><label>Show <select data-change="grTradeFilter"><option value="mine" ${view.tradeFilter === 'mine' ? 'selected' : ''}>My trades</option><option value="all" ${view.tradeFilter === 'all' ? 'selected' : ''}>All trades</option></select></label></div>
      <div class="dim" style="font-size:12px;margin:6px 0">Value received vs value given up, measured today. Draft picks count as the player eventually taken with them.</div>
      ${trs.length ? trs.map(t => { const g = GR.gradeTrade(G, t); return `<div class="panel" style="background:var(--bg2);margin-top:6px"><div class="dim" style="font-size:11px;margin-bottom:4px">Season ${t.y}${t.d ? ' · ' + L2.dateStr(t.d) : ''}</div><div class="row wrap" style="gap:14px">${col(t.a, g.a, t.gb, t.ga)}${col(t.b, g.b, t.ga, t.gb)}</div></div>`; }).join('') : '<div class="dim">No trades yet.</div>'}</div>`;
    return `<div class="panel row between wrap"><div><h2 style="margin:0">Draft & trade grades</h2><div class="dim">Look back at every draft and trade, graded against the alternatives.</div></div><div class="row" style="gap:8px"><span class="dim">Your GM grade</span><span class="gradechip big" style="color:${GR.color(gm)};border-color:${GR.color(gm)}">${gm}</span></div></div>${drafts}${trades}`;
  }, G => has(G) || G.mode === 'franchise');
  UI.actions.grDraft = el => { view.draft = el.value; UI.refresh(); };
  UI.actions.grTeam = el => { view.team = +el.value; UI.refresh(); };
  UI.actions.grTeamPick = (el, d) => { view.team = +d.t; UI.refresh(); };
  UI.actions.grTradeFilter = el => { view.tradeFilter = el.value; UI.refresh(); };

  const css = document.createElement('style');
  css.textContent = '.gradechip{display:inline-block;min-width:34px;text-align:center;font-weight:900;border:2px solid;border-radius:8px;padding:1px 7px}.gradechip.big{font-size:24px;padding:4px 12px}';
  document.head.appendChild(css);
})(window.PB);
