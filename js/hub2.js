// League hub extras: power rankings (weekly snapshots), more tabs hooked in through UI.tabsFor / UI.hubTabs.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League, TAB = UI.hubTabs;

  // ---------- tab registry: other modules add [key, label, afterKey] ----------
  const extra = [];
  UI.addHubTab = function (key, label, after, fn, when) { extra.push({ key, label, after, when }); TAB[key] = fn; };
  const baseTabs = UI.tabsFor;
  UI.tabsFor = G => {
    const t = baseTabs(G).slice();
    for (const e of extra) {
      if (e.when && !e.when(G)) continue;
      const i = t.findIndex(x => x[0] === e.after);
      t.splice(i >= 0 ? i + 1 : t.length - 1, 0, [e.key, e.label]);
    }
    return t;
  };

  // ---------- power rankings ----------
  const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
  const zs = a => { const m = mean(a), sd = Math.sqrt(mean(a.map(v => (v - m) * (v - m)))) || 1; return a.map(v => (v - m) / sd); };
  L.powerScores = function (G) {
    const lg = G.league, n = G.teams.length;
    const gp = G.teams.map(t => lg.rec[t.id].w + lg.rec[t.id].l), avgGp = mean(gp);
    const wp = G.teams.map((t, i) => (lg.rec[t.id].w + 6) / (gp[i] + 12));
    const mov = G.teams.map((t, i) => gp[i] ? (lg.rec[t.id].pf - lg.rec[t.id].pa) / gp[i] : 0);
    const l10 = G.teams.map(t => { const l = lg.rec[t.id].last; return l.length ? (mean(l) * l.length + 5 * 0.5) / (l.length + 5) : 0.5; });
    const ovr = G.teams.map(t => PB.teamOvr(PB.activeTeam ? PB.activeTeam(G, t) : t));
    const zw = zs(wp), zm = zs(mov), zl = zs(l10), zo = zs(ovr);
    const wo = 0.55 - 0.40 * Math.min(1, avgGp / 30);           // early in the season the roster counts for more than the record
    const rest = 1 - wo;
    const raw = G.teams.map((t, i) => wo * zo[i] + rest * (0.40 * zw[i] + 0.42 * zm[i] + 0.18 * zl[i]));
    const lo = Math.min(...raw), hi = Math.max(...raw);
    return G.teams.map((t, i) => ({ id: t.id, raw: raw[i], score: Math.round(100 * (raw[i] - lo) / ((hi - lo) || 1)), mov: mov[i], l10: lg.rec[t.id].last.reduce((a, b) => a + b, 0), l10n: lg.rec[t.id].last.length, ovr: ovr[i] })).sort((a, b) => b.raw - a.raw);
  };
  L.snapPower = function (G) {
    const lg = G.league; lg.pr = lg.pr || [];
    const order = L.powerScores(G).map(r => r.id);
    const last = lg.pr[lg.pr.length - 1];
    if (last && last.day === lg.day) { last.order = order; return; }
    lg.pr.push({ day: lg.day, order });
  };
  // weekly: hook into the day loop
  const simDay = L.simDay;
  L.simDay = function (G, skipUser) {
    const lg = G.league, before = lg.day, was = lg.phase;
    const r = simDay.call(L, G, skipUser);
    if (lg.day !== before && lg.phase === 'regular' && lg.day % 7 === 0 && lg.pr !== false) L.snapPower(G);
    if (was === 'regular' && lg.phase === 'playoffs') L.snapPower(G);
    return r;
  };

  const lineSvg = (hist, n) => {
    if (hist.length < 2) return '<div class="dim" style="padding:6px 0">The trend line appears after two weekly rankings.</div>';
    const W = 560, H = 120, X = i => 12 + i / (hist.length - 1) * (W - 24), Y = r => 10 + (r - 1) / Math.max(1, n - 1) * (H - 20);
    const d = hist.map((r, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(r).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:640px;background:var(--bg2);border-radius:8px"><text x="14" y="12" fill="#8a93a8" font-size="10">#1</text><text x="14" y="${H - 4}" fill="#8a93a8" font-size="10">#${n}</text><path d="${d}" fill="none" stroke="#ffcb05" stroke-width="2.4"/>${hist.map((r, i) => `<circle cx="${X(i)}" cy="${Y(r)}" r="3" fill="#ffcb05"/>`).join('')}</svg>`;
  };

  UI.addHubTab('power', 'Power Rankings', 'standings', function (G, lg) {
    const rows = L.powerScores(G), prev = lg.pr && lg.pr.length ? (lg.pr[lg.pr.length - 1].day === lg.day && lg.pr.length > 1 ? lg.pr[lg.pr.length - 2] : lg.pr[lg.pr.length - 1]) : null;
    const pr = id => prev ? prev.order.indexOf(id) + 1 : 0;
    const mv = rows.map((r, i) => (pr(r.id) ? pr(r.id) - (i + 1) : 0));
    const hist = (lg.pr || []).map(s => s.order.indexOf(G.userTeam) + 1).concat([rows.findIndex(r => r.id === G.userTeam) + 1]);
    const risers = rows.map((r, i) => ({ r, d: mv[i] })).filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3), fallers = rows.map((r, i) => ({ r, d: mv[i] })).filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 3);
    const chip = (x, up) => `<span class="tag" style="${up ? 'color:#2fd47a' : 'color:#ff5a5f'}">${up ? '▲' : '▼'}${Math.abs(x.d)} ${esc(G.teams[x.r.id].abbr)}</span>`;
    const O = UI.vis().O;
    return `<div class="panel"><h3>Power rankings</h3><div class="dim" style="font-size:12px;margin-bottom:8px">Blends record, scoring margin, the last 10 games and roster strength (the roster counts for more early in the season). Updated every week of the season.</div>
      <div class="row wrap" style="margin-bottom:8px">${risers.length ? '<span class="dim">Rising</span> ' + risers.map(x => chip(x, true)).join(' ') : ''} ${fallers.length ? '<span class="dim" style="margin-left:10px">Falling</span> ' + fallers.map(x => chip(x, false)).join(' ') : ''}</div>
      <table class="t"><thead><tr><th>#</th><th></th><th>Team</th><th class="n">Rec</th><th class="n">L10</th><th class="n">MOV</th>${O ? '<th class="n">OVR</th>' : ''}<th class="n">Power</th></tr></thead><tbody>${rows.map((r, i) => { const t = G.teams[r.id], rc = lg.rec[r.id]; const d = mv[i];
        return `<tr class="${t.user ? 'me' : ''}"><td class="dim">${i + 1}</td><td style="width:42px;font-size:12px;color:${d > 0 ? '#2fd47a' : d < 0 ? '#ff5a5f' : '#8a93a8'}">${d > 0 ? '▲' + d : d < 0 ? '▼' + -d : '–'}</td><td>${UI.teamLabel(G, r.id)}</td><td class="n">${rc.w}-${rc.l}</td><td class="n">${r.l10}-${r.l10n - r.l10}</td><td class="n ${r.mov >= 0 ? 'good' : 'bad'}">${r.mov >= 0 ? '+' : ''}${r.mov.toFixed(1)}</td>${O ? `<td class="n">${r.ovr.toFixed(1)}</td>` : ''}<td class="n"><b>${r.score}</b></td></tr>`; }).join('')}</tbody></table></div>
      <div class="panel" style="margin-top:10px"><h3>Your ranking over the season</h3>${lineSvg(hist, G.teams.length)}</div>`;
  });
})(window.PB);

// ---------- grouped hub navigation: a few main sections, each with its own sub-tabs ----------
(function (PB) {
  const UI = PB.UI, A = UI.actions, S = UI.screens, esc = UI.esc;
  const GROUPS = [
    ['home', 'Home', ['home']],
    ['offseason', 'Offseason', ['offseason']],
    ['team', 'Team', ['roster', 'scouting', 'fa', 'trades', 'grades']],
    ['league', 'League', ['standings', 'power', 'schedule', 'playoffs', 'boxes', 'rules']],
    ['stats', 'Stats', ['stats', 'adv', 'charts']],
    ['history', 'History', ['awards', 'records', 'history', 'report']],
    ['save', 'Save / Load', ['save']],
  ];
  const SUB = { stats: 'Leaders', records: 'Record Book', power: 'Power Rankings' };
  UI.tabGroups = function (G) {
    const all = UI.tabsFor(G), label = new Map(all), used = new Set();
    const gs = GROUPS.map(([id, name, keys]) => ({ id, label: name, tabs: keys.filter(k => label.has(k)).map(k => { used.add(k); return [k, SUB[k] || label.get(k)]; }) }));
    const rest = all.filter(([k]) => !used.has(k)); if (rest.length) gs.push({ id: 'more', label: 'More', tabs: rest });
    return gs.filter(g => g.tabs.length);
  };
  const last = {};
  S.hub.top = function (p) {
    const G = PB.G, lg = G.league, T = G.teams[G.userTeam], r = lg.rec[G.userTeam], cur = p.tab || 'home';
    const gs = UI.tabGroups(G), ag = gs.find(g => g.tabs.some(t => t[0] === cur)) || gs[0];
    last[ag.id] = cur;
    return `<div class="logo">POKÉ<b>HOOPS</b> 82</div>
      <div class="tabs">${gs.map(g => `<button class="${g.id === ag.id ? 'on' : ''}" data-act="hubGroup" data-g="${g.id}">${g.label}</button>`).join('')}</div>
      <div class="spacer"></div>
      <span style="font-size:13px">${G.mode === 'franchise' ? 'Season ' + G.fr.year + ' · ' : ''}<b class="gold">${esc(T.name)}</b> ${r.w}-${r.l}</span>
      <button class="small" data-act="goSettings">⚙</button><button class="small" data-act="goMenu">Menu</button>
      ${ag.tabs.length > 1 ? `<div class="subtabs">${ag.tabs.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="hubTab" data-tab="${k}">${l}</button>`).join('')}</div>` : ''}`;
  };
  A.hubGroup = (el, d) => {
    const g = UI.tabGroups(PB.G).find(x => x.id === d.g); if (!g) return;
    UI.params.tab = last[g.id] && g.tabs.some(t => t[0] === last[g.id]) ? last[g.id] : g.tabs[0][0];
    UI.refresh();
  };
  const css = document.createElement('style');
  css.textContent = `.topbar { flex-wrap: wrap; } .topbar .tabs { flex-wrap: nowrap; overflow-x: auto; min-width: 0; }
    .topbar .subtabs { order: 6; flex-basis: 100%; display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 1px; -webkit-overflow-scrolling: touch; }
    .subtabs button { white-space: nowrap; padding: 4px 12px; font-size: 12.5px; border-radius: 99px; background: transparent; border: 1px solid var(--line); color: var(--dim); }
    .subtabs button:hover { color: var(--ink); } .subtabs button.on { background: var(--accent2, #3b82f6); border-color: transparent; color: #fff; font-weight: 700; }`;
  document.head.appendChild(css);
})(window.PB);
