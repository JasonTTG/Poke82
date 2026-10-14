// Career pages: a per-Pokémon season log (stats, team, honors) built when each season ends, career highs from every game, and the page itself.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League, F = PB.Franchise;
  const C = PB.Career = {};
  const log = G => (G.careerLog = G.careerLog || {});
  const highs = G => (G.careerHi = G.careerHi || {});
  const KEYS = ['pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'sec', 'pm', 'gp', 'gs'];

  // ---------- career highs from every box score ----------
  const HI = [['pts', 'Points', b => b.pts], ['reb', 'Rebounds', b => b.oreb + b.dreb], ['ast', 'Assists', b => b.ast], ['stl', 'Steals', b => b.stl], ['blk', 'Blocks', b => b.blk], ['tpm', 'Threes', b => b.tpm]];
  C.HI = HI;
  L.hooks.afterRecord.push(function (G, game, result, playoff) {
    const H = highs(G);
    for (let s = 0; s < 2; s++) for (const id in result.box[s]) {
      const b = result.box[s][id]; if (b.sec <= 0) continue;
      const h = H[id] || (H[id] = {});
      for (const [k, , f] of HI) { const v = f(b); if (v > (h[k] || 0)) h[k] = v; }
    }
  });

  // rows are stored as flat arrays to keep saves small: [y, mon, team, champ, honors[], ...KEYS, po?KEYS]
  const pack = r => [r.y, r.m, r.t, r.champ ? 1 : 0, r.honors].concat(KEYS.map(k => r[k]), [r.po ? KEYS.map(k => r.po[k]) : 0]);
  const unpack = a => { const r = { y: a[0], m: a[1], t: a[2], champ: !!a[3], honors: a[4] }; KEYS.forEach((k, i) => { r[k] = a[5 + i]; }); const p = a[5 + KEYS.length]; if (p) { r.po = {}; KEYS.forEach((k, i) => { r.po[k] = p[i]; }); } return r; };
  C.rowsOf = (G, id) => (log(G)[id] || []).map(unpack);

  // ---------- season log ----------
  const honorsOf = (lg, id) => {
    const a = lg.awards || {}, o = [];
    if (a.mvp === id) o.push('MVP'); if (a.dpoy === id) o.push('DPOY'); if (a.roy === id) o.push('Rookie of the Year'); if (a.sixth === id) o.push('Sixth Pokémon');
    if (a.playoffMvp === id) o.push('Playoffs MVP');
    if ((a.allRookie || []).includes(id)) o.push('All-Rookie Team');
    (a.allLeague || []).forEach((t, i) => { if (t.includes(id)) o.push('All-League ' + ['1st', '2nd', '3rd'][i]); });
    (a.allDefense || []).forEach((t, i) => { if (t.includes(id)) o.push('All-Defense ' + ['1st', '2nd'][i]); });
    if (a.scoring === id) o.push('Scoring title'); if (a.rebounding === id) o.push('Rebounding title'); if (a.assists === id) o.push('Assists title');
    if (lg.allStar && lg.allStar.squads) for (const c of Object.values(lg.allStar.squads)) if (c.starters.includes(id) || c.reserves.includes(id)) { o.push('All-Star'); break; }
    return o;
  };
  L.hooks.afterFinish.push(function (G) {
    C.record(G);
  });
  C.record = function (G) {
    const lg = G.league, y = G.fr ? G.fr.year : (G.careerSeason = (G.careerSeason || 0) + 1);
    const LG = log(G);
    for (const id in lg.pstats) {
      const s = lg.pstats[id]; if (!s.gp) continue;
      const row = { y, m: +id, t: L.teamOf(G, +id), champ: lg.champion != null && L.teamOf(G, +id) === lg.champion, honors: honorsOf(lg, +id) };
      for (const k of KEYS) row[k] = s[k] || 0;
      const p = lg.pstatsPO && lg.pstatsPO[id];
      if (p && p.gp) { row.po = {}; for (const k of KEYS) row.po[k] = p[k] || 0; }
      (LG[id] = LG[id] || []).push(pack(row));
    }
  };
  // evolving carries the log over to the new form
  if (F && F.evolve) {
    const origEvolve = F.evolve;
    F.evolve = function (G, id, toId) {
      const r = origEvolve(G, id, toId), LG = log(G), H = highs(G);
      if (LG[id]) { LG[toId] = (LG[toId] || []).concat(LG[id]); delete LG[id]; }
      if (H[id]) { const h = H[toId] = H[toId] || {}; for (const k in H[id]) h[k] = Math.max(h[k] || 0, H[id][k]); delete H[id]; }
      return r;
    };
  }

  // ---------- career totals ----------
  C.totals = function (rows, po) {
    const t = {}; for (const k of KEYS) t[k] = 0;
    let n = 0; for (const r of rows) { const s = po ? r.po : r; if (!s) continue; n++; for (const k of KEYS) t[k] += s[k] || 0; }
    t.seasons = n; return t;
  };
  C.leaders = function (G, key) {      // all-time ranking by a career total (regular season)
    const LG = log(G), out = [];
    for (const id in LG) { const t = C.totals(C.rowsOf(G, id)); out.push({ id: +id, v: key === 'reb' ? t.oreb + t.dreb : t[key] }); }
    return out.sort((a, b) => b.v - a.v);
  };
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) : '-';
  const per = (a, g) => g ? (a / g).toFixed(1) : '-';

  // ---------- page ----------
  const season = (G, y) => G.fr ? 'S' + y : 'Season';
  C.html = function (G, id) {
    const m = PB.BYID[id], rows = C.rowsOf(G, id), tot = C.totals(rows), po = C.totals(rows, true), hi = highs(G)[id] || {};
    const cur = G.claimed ? G.claimed[id] : null, lg = G.league, ps = lg && lg.pstats && lg.pstats[id];
    const live = ps && ps.gp && !(rows.length && lg.phase === 'done' && rows[rows.length - 1].y === (G.fr ? G.fr.year : G.careerSeason));
    const honorCount = {}; for (const r of rows) for (const h of r.honors) honorCount[h] = (honorCount[h] || 0) + 1;
    const titles = rows.filter(r => r.champ).length;
    const evo = G.fr ? G.fr.evoLog.filter(e => e.from === id || e.to === id) : [];
    const vis = UI.vis(m);
    const stat = (r, label) => `<td>${label}</td><td class="dim">${r.t != null && G.teams[r.t] ? esc(G.teams[r.t].abbr) : '-'}</td><td class="n">${r.gp}</td><td class="n">${per(r.sec / 60, r.gp)}</td><td class="n"><b>${per(r.pts, r.gp)}</b></td><td class="n">${per(r.oreb + r.dreb, r.gp)}</td><td class="n">${per(r.ast, r.gp)}</td><td class="n">${per(r.stl, r.gp)}</td><td class="n">${per(r.blk, r.gp)}</td><td class="n">${pct(r.fgm, r.fga)}</td><td class="n">${pct(r.tpm, r.tpa)}</td><td class="n">${pct(r.ftm, r.fta)}</td><td class="n">${pct(r.pts, 2 * (r.fga + 0.44 * r.fta))}</td>`;
    const hdr = '<thead><tr><th>Season</th><th>Tm</th><th class="n">GP</th><th class="n">MPG</th><th class="n">PPG</th><th class="n">RPG</th><th class="n">APG</th><th class="n">SPG</th><th class="n">BPG</th><th class="n">FG%</th><th class="n">3P%</th><th class="n">FT%</th><th class="n">TS%</th></tr></thead>';
    const body = rows.map(r => `<tr class="${r.champ ? 'me' : ''}">${stat(r, season(G, r.y) + (r.m !== id ? ` <span class="dim">(${esc(PB.BYID[r.m].dispName)})</span>` : '') + (r.champ ? ' ' + PB.I('trophy') : ''))}</tr>`).join('')
      + (live ? `<tr style="opacity:.8">${stat(Object.assign({ t: cur, m: id }, ps), (G.fr ? 'S' + G.fr.year : 'This season') + ' <span class="dim">(in progress)</span>')}</tr>` : '');
    const rank = key => { const l = C.leaders(G, key), i = l.findIndex(x => x.id === id); return i >= 0 && tot.gp ? `#${i + 1}` : '-'; };
    return `<div class="row between wrap" style="align-items:flex-start"><div class="row" style="gap:12px">${UI.spr(m, 72)}<div><h2 style="margin:0">${esc(m.dispName)}</h2><div>${UI.typePills(m)}</div><div class="dim" style="font-size:12px">${cur != null && G.teams[cur] ? esc(G.teams[cur].name) : 'Free agent'}${vis.P ? ' · ' + m.pos.join('/') : ''}${vis.O ? ' · OVR ' + m.ovr : ''} · ${PB.I(PB.Abil.describe(id).bad ? 'down' : 'bolt')} ${esc(PB.Abil.describe(id).ability)}${G.fr && PB.Nature && PB.Nature.on(G) && vis.R ? ' · ' + PB.Nature.of(G, id).name + ' nature' : ''}</div></div></div>
      <div class="kpi"><div><b>${rows.length + (live ? 1 : 0)}</b><span>Seasons</span></div><div><b>${titles}</b><span>Titles</span></div><div><b>${honorCount.MVP || 0}</b><span>MVPs</span></div></div></div>
      ${evo.length ? `<div class="dim" style="font-size:12px;margin-top:6px">Evolution: ${evo.map(e => `${esc(PB.BYID[e.from].dispName)} ${PB.I('right')} ${esc(PB.BYID[e.to].dispName)} (S${e.y})`).join(' · ')}</div>` : ''}
      <h3 style="margin-top:12px">Season by season</h3>
      <div class="scroll" style="max-height:260px"><table class="t">${hdr}<tbody>${body || '<tr><td colspan="13" class="dim">No games played yet.</td></tr>'}${rows.length > 1 ? `<tr style="font-weight:800"><td>Career</td><td></td><td class="n">${tot.gp}</td><td class="n">${per(tot.sec / 60, tot.gp)}</td><td class="n">${per(tot.pts, tot.gp)}</td><td class="n">${per(tot.oreb + tot.dreb, tot.gp)}</td><td class="n">${per(tot.ast, tot.gp)}</td><td class="n">${per(tot.stl, tot.gp)}</td><td class="n">${per(tot.blk, tot.gp)}</td><td class="n">${pct(tot.fgm, tot.fga)}</td><td class="n">${pct(tot.tpm, tot.tpa)}</td><td class="n">${pct(tot.ftm, tot.fta)}</td><td class="n">${pct(tot.pts, 2 * (tot.fga + 0.44 * tot.fta))}</td></tr>` : ''}</tbody></table></div>
      <div class="layout2" style="margin-top:8px"><div><h3>Career highs</h3><div class="row wrap">${HI.map(([k, l]) => `<span class="tag">${l}: <b>${hi[k] || 0}</b></span>`).join(' ')}</div>
        ${tot.gp ? `<h3 style="margin-top:10px">Career totals</h3><div class="row wrap"><span class="tag">${tot.pts} pts</span><span class="tag">${tot.oreb + tot.dreb} reb</span><span class="tag">${tot.ast} ast</span><span class="tag">${tot.stl} stl</span><span class="tag">${tot.blk} blk</span><span class="tag">${tot.tpm} threes</span></div>
        <div class="dim" style="font-size:12px;margin-top:4px">All-time rank · points ${rank('pts')} · rebounds ${rank('reb')} · assists ${rank('ast')} · steals ${rank('stl')} · blocks ${rank('blk')}</div>` : ''}
        ${po.seasons ? `<div class="dim" style="font-size:12px;margin-top:6px">Playoffs: ${po.gp} games, ${per(po.pts, po.gp)} pts, ${per(po.oreb + po.dreb, po.gp)} reb, ${per(po.ast, po.gp)} ast</div>` : ''}</div>
        <div><h3>Honors</h3>${Object.keys(honorCount).length ? Object.entries(honorCount).map(([h, n]) => `<div class="row between" style="font-size:13px"><span>${esc(h)}</span><b>${n > 1 ? '×' + n : ''}</b></div>`).join('') : '<div class="dim">None yet.</div>'}
        ${rows.some(r => r.honors.length) ? `<div class="dim" style="font-size:11px;margin-top:6px">${rows.filter(r => r.honors.length).map(r => season(G, r.y) + ': ' + r.honors.join(', ')).join('<br>')}</div>` : ''}</div></div>`;
  };
  UI.career = function (id) {
    const G = PB.G;
    UI.modal(`${C.html(G, id)}<div class="row" style="margin-top:12px;justify-content:flex-end"><button data-act="inspect" data-id="${id}">Pokémon card</button><button data-act="closeModal" autofocus>Close</button></div>`);
  };
  UI.actions.career = (el, d) => UI.career(+d.id);

  // the Pokémon card gets a Career button once there is something to show
  const origInspect = UI.inspect;
  UI.inspect = function (id, actions) {
    const G = PB.G, lg = G && G.league, has = G && ((log(G)[id] || []).length || (lg && lg.pstats && lg.pstats[id] && lg.pstats[id].gp));
    return origInspect(id, (actions || '') + (has && !UI.inDraft() ? `<button data-act="career" data-id="${id}">Career</button>` : ''));
  };
})(window.PB);
