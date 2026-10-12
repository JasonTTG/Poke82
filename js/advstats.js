// Advanced stats: efficiency, usage and rate stats from the season's box totals, with a sortable table and league / team filters.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League;
  const A = PB.Adv = {};
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);

  // league-wide and per-team context from team totals (regular season)
  A.context = function (G) {
    const lg = G.league, ts = lg.tstats, ids = G.teams.map(t => t.id);
    const T = id => ts[id] || PB.newStat();
    const lgT = {}; for (const k of PB.STAT_KEYS) lgT[k] = sum(ids, id => T(id)[k]);
    const lgGp = sum(ids, id => lg.tgp[id] || 0) / 2 || 1;
    const pace = lgT.fga + 0.44 * lgT.fta - lgT.oreb + lgT.tov;
    const lgPpp = lgT.pts / (pace || 1);
    return { lgT, lgGp, lgPpp, ts, tgp: lg.tgp, T, vop: lgPpp, drbp: lgT.dreb / ((lgT.dreb + lgT.oreb) || 1) };
  };
  // per-player rows
  A.rows = function (G, po) {
    const lg = G.league, map = po ? lg.pstatsPO : lg.pstats, ctx = A.context(G), out = [];
    for (const id in map) {
      const s = map[id], tid = L.teamOf(G, +id); if (tid == null || !s.gp) continue;
      const tm = ctx.T(tid), min = s.sec / 60; if (min < 1) continue;
      const tmMin = (tm.sec || 1) / 60, teamGp = ctx.tgp[tid] || 1;
      const fga = s.fga, fta = s.fta, reb = s.oreb + s.dreb;
      const tsa = fga + 0.44 * fta;
      const lgT = ctx.lgT, per36 = v => v / min * 36;
      // Hollinger-style unadjusted PER
      const tmAstR = tm.ast / (tm.fgm || 1), lgAstR = lgT.ast / (lgT.fgm || 1), factor = (2 / 3) - (0.5 * lgAstR) / (2 * (lgT.fgm / (lgT.ftm || 1)));
      const vop = ctx.vop > 0 ? (lgT.pts / ((lgT.fga - lgT.oreb + lgT.tov + 0.44 * lgT.fta) || 1)) : 1.0, drbp = ctx.drbp;
      const uper = (1 / min) * (s.tpm + (2 / 3) * s.ast + (2 - factor * tmAstR) * s.fgm + s.ftm * 0.5 * (1 + (1 - tmAstR) + (2 / 3) * tmAstR)
        - vop * s.tov - vop * drbp * (fga - s.fgm) - vop * 0.44 * (0.44 + 0.56 * drbp) * (fta - s.ftm)
        + vop * (1 - drbp) * (reb - s.oreb) + vop * drbp * s.oreb + vop * s.stl + vop * drbp * s.blk
        - s.pf * (lgT.ftm / (lgT.pf || 1) - 0.44 * (lgT.fta / (lgT.pf || 1)) * vop));
      const gsc = s.pts + 0.4 * s.fgm - 0.7 * fga - 0.4 * (fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov;
      out.push({
        id: +id, tid, gp: s.gp, mpg: min / s.gp, pts: s.pts / s.gp, reb: reb / s.gp, ast: s.ast / s.gp, stl: s.stl / s.gp, blk: s.blk / s.gp, tov: s.tov / s.gp,
        ts: s.pts / ((2 * tsa) || 1), efg: (s.fgm + 0.5 * s.tpm) / (fga || 1), tpr: s.tpa / (fga || 1), ftr: fta / (fga || 1),
        usg: 100 * (tsa + s.tov) * (tmMin / 5) / (min * ((tm.fga + 0.44 * tm.fta + tm.tov) || 1)),
        astp: 100 * s.ast / (((min / (tmMin / 5)) * tm.fgm - s.fgm) || 1),
        rebp: 100 * (reb * (tmMin / 5)) / (min * ((tm.oreb + tm.dreb + (lgT.oreb + lgT.dreb) / G.teams.length) || 1)),
        tovp: 100 * s.tov / ((tsa + s.tov) || 1),
        stl36: per36(s.stl), blk36: per36(s.blk), gs36: per36(gsc) , pm36: per36(s.pm || 0), uper, min,
      });
    }
    // PER scaled so the league average (by minutes) is 15
    const totMin = sum(out, r => r.min) || 1, avg = sum(out, r => r.uper * r.min) / totMin || 1;
    for (const r of out) r.per = r.uper * 15 / avg;
    // estimated win shares: production above a replacement level, scaled so the league total matches the wins
    if (!po) {
      const sorted = out.filter(r => r.min >= 200).map(r => r.gs36).sort((a, b) => a - b), repl = sorted.length ? sorted[Math.floor(sorted.length * 0.2)] : 0;
      const raw = out.map(r => Math.max(0, (r.gs36 - repl) * r.min / 36)), totRaw = sum(raw, x => x) || 1, wins = sum(G.teams, t => G.league.rec[t.id].w);
      out.forEach((r, i) => { r.ws = raw[i] * wins / totRaw; r.ws48 = r.ws / (r.min / 48 || 1); });
    } else out.forEach(r => { r.ws = null; r.ws48 = null; });
    return out;
  };

  const COLS = [
    ['gp', 'GP', 0], ['mpg', 'MPG', 1], ['per', 'PER', 1], ['ts', 'TS%', 'pct'], ['efg', 'eFG%', 'pct'], ['usg', 'USG%', 1], ['astp', 'AST%', 1], ['rebp', 'REB%', 1], ['tovp', 'TOV%', 1],
    ['tpr', '3PAr', 'pct'], ['ftr', 'FTr', 'pct'], ['stl36', 'STL/36', 1], ['blk36', 'BLK/36', 1], ['gs36', 'GmSc/36', 1], ['pm36', '+/-/36', 1], ['ws', 'WS', 1], ['ws48', 'WS/48', 3],
  ];
  const view = { sort: 'per', desc: true, team: 'all', po: false, qual: 0.4, minMin: 0 };
  const fmt = (v, d) => v == null || !isFinite(v) ? '-' : d === 'pct' ? (v * 100).toFixed(1) : d === 3 ? v.toFixed(3).replace(/^0/, '') : v.toFixed(d);

  UI.addHubTab('adv', 'Advanced', 'stats', function (G, lg) {
    let rows = A.rows(G, view.po);
    const topGp = Math.max(1, ...Object.values(lg.tgp));
    rows = rows.filter(r => r.gp >= (view.po ? 1 : Math.round(topGp * view.qual)) && (view.team === 'all' || r.tid === +view.team));
    rows.sort((a, b) => ((b[view.sort] == null ? -1e9 : b[view.sort]) - (a[view.sort] == null ? -1e9 : a[view.sort])) * (view.desc ? 1 : -1));
    const hasPO = lg.pstatsPO && Object.keys(lg.pstatsPO).length;
    const th = ([k, l]) => `<th class="n ${view.sort === k ? 'sorted' : ''}" data-act="advSort" data-k="${k}" style="cursor:pointer" title="Sort by ${l}">${l}${view.sort === k ? (view.desc ? ' ▼' : ' ▲') : ''}</th>`;
    return `<div class="panel"><div class="row between wrap"><h3 style="margin:0">Advanced stats</h3><div class="row wrap">
        <label>Team <select data-change="advTeam"><option value="all">All teams</option>${G.teams.map(t => `<option value="${t.id}" ${String(view.team) === String(t.id) ? 'selected' : ''}>${esc(t.abbr)}</option>`).join('')}</select></label>
        <label>Qualify <select data-change="advQual">${[[0, 'Everyone'], [0.2, '20% of games'], [0.4, '40% of games'], [0.7, '70% of games']].map(([v, l]) => `<option value="${v}" ${view.qual === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${hasPO ? `<label><input type="checkbox" data-change="advPO" ${view.po ? 'checked' : ''}> Playoffs</label>` : ''}</div></div>
      <div class="dim" style="font-size:12px;margin:6px 0">Click a column to sort. PER is scaled so the league average is 15. WS is an estimate (production above a replacement player, scaled to the league's total wins). USG% is the share of team plays used while on the floor.</div>
      <div class="scroll" style="max-height:none"><table class="t"><thead><tr><th>#</th><th>Pokémon</th><th>Tm</th>${COLS.map(th).join('')}</tr></thead><tbody>${rows.slice(0, 80).map((r, i) => { const m = PB.BYID[r.id], t = G.teams[r.tid];
        return `<tr class="${t.user ? 'me' : ''}"><td class="dim">${i + 1}</td><td data-act="inspect" data-id="${r.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 22)} ${esc(m.dispName)}</td><td class="dim">${esc(t.abbr)}</td>${COLS.map(([k, , d]) => `<td class="n ${view.sort === k ? 'sorted' : ''}">${fmt(r[k], d)}</td>`).join('')}</tr>`; }).join('') || '<tr><td colspan="20" class="dim">Nobody qualifies yet.</td></tr>'}</tbody></table></div></div>`;
  });
  UI.actions.advSort = (el, d) => { if (view.sort === d.k) view.desc = !view.desc; else { view.sort = d.k; view.desc = d.k !== 'tovp'; } UI.refresh(); };
  UI.actions.advTeam = el => { view.team = el.value; UI.refresh(); };
  UI.actions.advQual = el => { view.qual = +el.value; UI.refresh(); };
  UI.actions.advPO = el => { view.po = el.checked; UI.refresh(); };
  const css = document.createElement('style'); css.textContent = 'th.sorted,td.sorted{background:rgba(255,203,5,.08)}'; document.head.appendChild(css);
})(window.PB);
