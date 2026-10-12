// Franchise UI: setup, offseason (development, draft, free agency), free agents, trades, roster, history.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions, L = PB.League, F = PB.Franchise, O = PB.Ops;
  const TAB = UI.hubTabs;
  const view = { faQ: '', faSort: 'bst', faType: 'ALL', faPos: 'ALL', faLeg: 'ALL', tTeam: null, tA: [], tB: [], offers: null, dQ: '', dSort: 'bst', dType: 'ALL', histTab: 'seasons' };
  const BKEYS = ['bst', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'];

  function autosave() { const G = PB.G; if (G.settings.autosave !== false && !(PB.Net && PB.Net.active && PB.Net.active())) PB.Save.save(G, 1); }
  function run(name, args, after) { O.run(name, args, (err, res) => { if (err) { PB.toast(err, 3800); UI.refresh(); return; } autosave(); if (after) after(res); UI.refresh(); }); }
  UI.frRun = run;

  // ---------- small components ----------
  function evoLine(m) {
    let root = m; while (root.from_) root = PB.BYID[root.from_];
    const stages = [[root]]; let cur = [root];
    for (;;) { const nxt = [].concat(...cur.map(x => F.kids(x.id).map(k => PB.BYID[k]))); if (!nxt.length) break; stages.push(nxt); cur = nxt; }
    if (stages.length === 1) return '<span class="dim">No evolution</span>';
    const nm = x => x.id === m.id ? `<b>${esc(x.dispName)}</b>` : esc(x.dispName);
    return stages.map(st => st.length > 3 ? st.slice(0, 3).map(nm).join(' / ') + ' +' + (st.length - 3) : st.map(nm).join(' / ')).join(' → ');
  }
  UI.evoLine = evoLine;
  function injTag(G, id) { const i = G.fr.inj[id]; return i && i.g > 0 ? `<span class="tag bad" title="${esc(i.k)}">🩹 ${esc(i.k)} · ${i.g}g</span>` : ''; }
  function devCell(G, id) {
    const m = PB.BYID[id], dev = Math.round(G.fr.dev[id] || 0);
    const opts = F.evoOptions(G, id);
    if (!F.kids(id).length) return '<span class="dim">Final form</span>';
    if (!opts.length) return '<span class="dim">Evolution unavailable</span>';
    const need = Math.min(...opts.map(o => o.need));
    const pct = Math.min(100, dev / need * 100);
    return `<div style="min-width:110px"><div class="meter" style="height:6px"><i style="width:${pct}%;${pct >= 100 ? 'background:#2fd47a' : ''}"></i></div><span style="font-size:11px" class="${pct >= 100 ? 'good' : 'dim'}">${pct >= 100 ? 'Ready to evolve' : dev + ' / ' + need}</span></div>`;
  }
  function baseCells(m, v) {
    return v.R ? [m.r.three, m.r.dunk, m.r.pass, m.r.handle, m.r.speed, m.r.intD, m.r.perD, m.r.dreb].map(x => `<td class="n">${x}</td>`).join('') : [m.hp, m.atk, m.def, m.spa, m.spd, m.spe, m.bst].map(x => `<td class="n">${x}</td>`).join('');
  }
  function baseHead(v) { return (v.R ? ['3PT', 'DNK', 'PAS', 'HDL', 'SPD', 'INT', 'PER', 'REB'] : ['HP', 'ATK', 'DEF', 'SPA', 'SPD', 'SPE', 'BST']).map(l => `<th class="n">${l}</th>`).join(''); }
  function monCell(m) { return `<span data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 28)} <b>${esc(m.dispName)}</b></span>${m.leg || m.myth ? ' <span class="tag leg">' + (m.myth ? 'MYTH' : 'LEG') + '</span>' : ''}`; }
  function filterMons(list, f) {
    const hide = f.hide;
    if (f.type !== 'ALL') list = list.filter(m => m.types.includes(f.type));
    if (f.pos && f.pos !== 'ALL') list = list.filter(m => m.pos[0] === f.pos || m.pos[1] === f.pos);
    if (f.leg === 'LEG') list = list.filter(m => m.leg || m.myth); else if (f.leg === 'NON') list = list.filter(m => !m.leg && !m.myth);
    if (f.q) { const q = f.q.toLowerCase(); list = list.filter(m => m.name.includes(q)); }
    const v = UI.vis(!!hide); let key = f.sort;
    if (key === 'ovr' && !v.O) key = 'bst';
    const val = m => key === 'ovr' ? m.ovr : key === 'id' ? -m.id : key === 'pot' ? F.potential(m) : m[key] != null ? m[key] : (m.r[key] || 0);
    return list.sort((a, b) => (val(b) - val(a)) || a.id - b.id);
  }
  function sortSelect(cur, act, hide) {
    const v = UI.vis(!!hide), o = [];
    if (v.O) o.push(['ovr', 'Overall'], ['pot', 'Potential']);
    o.push(['bst', 'Base stat total'], ['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed'], ['id', 'Dex #']);
    return `<select data-change="${act}" data-k="sort">${o.map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  }

  // ---------- new franchise ----------
  S.frnew = {
    back() { UI.go('menu', {}, true); },
    render(p) {
      const D = F.DEFAULTS;
      const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => PB.MONS.filter(m => m.gen === g && m.from_ === 0).length);
      const sel = (id, opts, def) => `<select id="${id}" onchange="PB.UI.frPreview()">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(def) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
      return `<div class="panel" style="max-width:760px;margin:16px auto">
        <h2>New Franchise</h2>
        <div class="dim" style="margin-bottom:10px">The league starts small with the unevolved Pokémon of the starting regions. Each season a new region's draft class arrives, expansion teams join, and your Pokémon develop and evolve. It ends when there is no region left to draft.</div>
        <div class="layout2" style="--side:1fr">
          <div class="col">
            <label>City <input type="text" id="fr-city" value="Pallet Town" maxlength="22"></label>
            <label>Team name <input type="text" id="fr-nick" value="Trainers" maxlength="22"></label>
            <label>Seed <input type="text" id="fr-seed" placeholder="random"></label>
            <label>Difficulty ${sel('fr-diff', [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['legend', 'Legend']], 'normal')}</label>
            <h3 style="margin-top:6px">League</h3>
            <label>Starting region ${sel('fr-gen', Object.entries(PB.REGIONS).map(([g, n]) => [g, n + ' (' + counts[g - 1] + ')']), D.startGen)}</label>
            <label>Starting regions ${sel('fr-nreg', [1, 2, 3, 4].map(n => [n, n + (n === 1 ? ' region' : ' regions')]), D.startRegions)}</label>
            <label>Starting teams ${sel('fr-teams', [4, 6, 8, 10, 12, 14, 16].map(n => [n, n + ' teams']), D.startTeams)}</label>
            <label>Team cap ${sel('fr-cap', [8, 10, 12, 14, 16, 18, 20, 24, 28, 30].map(n => [n, n + ' teams']), D.teamCap)}</label>
            <label>Roster limit ${sel('fr-roster', [15, 16, 18, 20, 22, 25].map(n => [n, n + ' Pokémon']), D.rosterMax)}</label>
          </div>
          <div class="col">
            <h3>Season</h3>
            <label>Games per team ${sel('fr-games', [[0, 'Scaled to league size'], [20, '20'], [30, '30'], [40, '40'], [60, '60'], [82, '82']], 0)}</label>
            <label>Playoff teams ${sel('fr-po', [[0, 'Automatic'], [2, '2'], [4, '4'], [8, '8'], [16, '16']], 0)}</label>
            <label>Series length ${sel('fr-series', [[3, 'Best of 3'], [5, 'Best of 5'], [7, 'Best of 7']], 7)}</label>
            <label>Draft rounds per team ${sel('fr-rounds', [1, 2, 3, 4, 5, 6].map(n => [n, n]), D.draftRounds)}</label>
            <label>Injuries ${sel('fr-inj', [[0, 'Off'], [0.5, 'Rare'], [1, 'Normal'], [2, 'Frequent']], 1)}</label>
            <label>Evolution speed ${sel('fr-evo', [[0.7, 'Slow'], [1, 'Normal'], [1.5, 'Fast']], 1)}</label>
            <label><input type="checkbox" id="fr-deadline" checked> Trade deadline</label>
            <div class="panel" id="fr-prev" style="background:var(--bg2)"></div>
          </div></div>
        <div class="row" style="margin-top:12px"><button class="primary" data-act="frStart" autofocus>${p && p.online ? 'Start the online league' : 'Start franchise'}</button><button data-act="${p && p.online ? 'olBackLobby' : 'goMenu'}">Cancel</button></div>
      </div>`;
    },
    mount() { UI.frPreview(); },
  };
  function readCfg() {
    const v = id => document.getElementById(id).value;
    return { startGen: +v('fr-gen'), startRegions: +v('fr-nreg'), startTeams: +v('fr-teams'), teamCap: +v('fr-cap'), rosterMax: +v('fr-roster'), games: +v('fr-games'), playoffTeams: +v('fr-po'), seriesLen: +v('fr-series'), draftRounds: +v('fr-rounds'), injuries: +v('fr-inj') > 0, injRate: +v('fr-inj') || 1, evoSpeed: +v('fr-evo'), tradeDeadline: document.getElementById('fr-deadline').checked };
  }
  A.olBackLobby = () => UI.go('lobby', {}, true);
  UI.frPreview = function () {
    const el = document.getElementById('fr-prev'); if (!el) return;
    const c = readCfg(), order = []; for (let i = 0; i < c.startRegions; i++) order.push(((c.startGen - 1 + i) % 9) + 1);
    const pool = F.unevolvedOf(order).length, per = Math.min(c.rosterMax, Math.floor(pool / c.startTeams));
    const g = c.games > 0 ? c.games : F.gamesFor(c.startTeams, c);
    const ok = pool >= c.startTeams * 12;
    el.innerHTML = `<b>${order.map(g => PB.REGIONS[g]).join(' + ')}</b>: ${pool} unevolved Pokémon<br>${c.startTeams} teams × ${per} Pokémon${pool - per * c.startTeams > 0 ? ' (+' + (pool - per * c.startTeams) + ' free agents)' : ''}<br>${g} games per team · ${F.playoffN(c.startTeams, c)} make the playoffs
      ${ok ? '' : '<div class="bad">Not enough Pokémon for that many teams.</div>'}`;
  };
  A.frStart = async () => {
    const val = id => document.getElementById(id).value;
    let seed = val('fr-seed').trim();
    seed = seed ? (/^\d+$/.test(seed) ? (+seed >>> 0) : [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)) : ((Math.random() * 4294967296) >>> 0);
    if (UI.params && UI.params.online) { UI.onlineStartFranchise(readCfg(), seed); return; }
    const cfg = readCfg(), city = val('fr-city').trim(), nick = val('fr-nick').trim(), diff = val('fr-diff');
    let G;
    try { await UI.spin('Building the league…', () => { G = F.create(seed, cfg); }); } catch (e) { PB.toast(e.message, 5000); return; }
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: diff });
    PB.settings = G.settings; PB.Save.settingsSave(PB.settings);
    const T = G.teams[G.userTeam];
    T.city = city || T.city; T.nick = nick || T.nick; T.name = T.city + ' ' + T.nick; T.abbr = PB.teamAbbr(T.city);
    PB.G = G; UI.stack = [];
    F.startLeague(G);
    PB.Save.save(G, 1);
    UI.go('hub', { tab: 'home' }, true);
  };

  // ---------- home ----------
  const origHome = TAB.home;
  TAB.home = function (G, lg, p) {
    if (G.mode !== 'franchise') return origHome(G, lg, p);
    if (lg.phase === 'done') return TAB.offseason(G, lg);
    const fr = G.fr;
    const next = F.nextRegion(G);
    const banner = `<div class="panel row between wrap" style="margin-bottom:12px"><div><b>Season ${fr.year}</b> <span class="dim">· ${fr.gens.map(g => PB.REGIONS[g]).join(', ')} · ${G.teams.length} teams · ${lg.games} games each · ${lg.poN} make the playoffs</span></div><div class="dim">${next != null ? 'Next draft class: <b>' + PB.REGIONS[next] + '</b>' : '<b class="gold">Final season</b> — there are no regions left to draft'}</div></div>`;
    const inj = G.teams[G.userTeam].roster.filter(id => F.isInj(G, id));
    const news = fr.news.slice(0, 8);
    const extra = `<div class="layout2" style="--side:360px;margin-top:14px"><div class="panel"><h3>Injury report</h3>${inj.length ? inj.map(id => `<div class="row between"><span data-act="inspect" data-id="${id}" tabindex="0" style="cursor:pointer">${UI.spr(PB.BYID[id], 26)} ${esc(PB.BYID[id].dispName)}</span>${injTag(G, id)}</div>`).join('') : '<div class="dim">Everyone is healthy.</div>'}</div>
      <div class="panel"><h3>League news</h3>${news.map(n => `<div style="font-size:12px;padding:2px 0;${n.user ? 'color:var(--gold)' : ''}"><span class="dim">S${n.y}</span> ${esc(n.txt)}</div>`).join('') || '<div class="dim">Nothing yet.</div>'}</div></div>`;
    return banner + origHome(G, lg, p) + extra;
  };

  // ---------- offseason ----------
  TAB.offseason = function (G, lg) {
    const fr = G.fr;
    if (lg.phase !== 'done') return '<div class="panel dim">The season is still in progress.</div>';
    switch (fr.stage) {
      case 'review': return reviewPanel(G, lg);
      case 'dev': return devPanel(G);
      case 'draft': return draftPanel(G);
      case 'fa': return faPanel(G);
      case 'over': return overPanel(G);
    }
    return '<div class="panel dim">…</div>';
  };

  function reviewPanel(G, lg) {
    const fr = G.fr, h = fr.history[fr.history.length - 1], next = F.nextRegion(G);
    const champ = G.teams[lg.champion], mvp = lg.awards && PB.BYID[lg.awards.mvp];
    const r = lg.rec[G.userTeam];
    return `<div class="panel" style="max-width:820px;margin:0 auto"><h2>Season ${fr.year} complete</h2>
      <div class="kpi"><div><b>${esc(champ.abbr)}</b><span>Champion</span></div><div><b>${r.w}-${r.l}</b><span>Your record</span></div><div><b style="font-size:15px">${esc(h.result)}</b><span>Your result</span></div>${mvp ? `<div><b style="font-size:15px">${esc(mvp.dispName)}</b><span>MVP</span></div>` : ''}</div>
      <div class="row wrap" style="margin-top:12px"><button data-act="hubTab" data-tab="awards">Awards</button><button data-act="hubTab" data-tab="standings">Final standings</button><button data-act="hubTab" data-tab="playoffs">Bracket</button></div>
      <hr style="border-color:var(--line);margin:16px 0">
      ${next != null ? `<div>Next up: the <b>${PB.REGIONS[next]}</b> draft class. Your Pokémon will develop in the offseason${lg.awards ? '' : ''}, and some will be ready to evolve.</div>
      <div class="row" style="margin-top:12px"><button class="primary" data-act="frBegin" autofocus>Begin offseason</button></div>`
        : `<div class="gold"><b>That was the final season</b> — every region has been drafted.</div><div class="row" style="margin-top:12px"><button class="primary" data-act="frBegin" autofocus>See the franchise results</button></div>`}
    </div>`;
  }
  A.frBegin = () => run('beginOffseason', {}, () => UI.go('hub', { tab: 'offseason' }, true));

  function devPanel(G) {
    const fr = G.fr, T = G.teams[G.userTeam];
    const ready = F.canEvolveList(G, G.userTeam);
    const others = T.roster.filter(id => !ready.some(x => x.id === id)).map(id => PB.BYID[id]).sort((a, b) => (fr.dev[b.id] || 0) - (fr.dev[a.id] || 0));
    const evo = ready.map(x => {
      const m = PB.BYID[x.id];
      return `<div class="panel" style="background:var(--bg2)"><div class="row wrap"><div class="center" style="min-width:110px">${UI.spr(m, 72)}<div><b>${esc(m.dispName)}</b></div></div>
        <div class="grow col">${x.opts.map(o => { const t = PB.BYID[o.to]; return `<div class="row between wrap"><div class="row">${UI.spr(t, 48)}<div><b>${esc(t.dispName)}</b><div>${UI.typePills(t)}</div><div class="dim" style="font-size:11px">${t.hp}/${t.atk}/${t.def}/${t.spa}/${t.spd}/${t.spe} · BST ${t.bst}${UI.vis().O ? ' · OVR ' + t.ovr : ''}</div></div></div>
          <button class="${o.ready ? 'gold' : ''}" ${o.ready ? '' : 'disabled'} data-act="frEvolve" data-id="${m.id}" data-to="${t.id}">${o.ready ? 'Evolve' : Math.round(fr.dev[m.id] || 0) + '/' + o.need}</button></div>`; }).join('')}</div></div></div>`;
    }).join('');
    return `<div class="col" style="max-width:980px;margin:0 auto">
      <div class="row between wrap"><div><h2 style="margin:0">Player development</h2><div class="dim">Season ${fr.year} is over. Your Pokémon gained development from playing time and offseason training${Object.keys(fr.focus).length ? '' : ''}.</div></div>
        <button class="primary" data-act="frStartDraft" autofocus>Continue to the ${PB.REGIONS[F.nextRegion(G)]} draft</button></div>
      ${ready.length ? `<div class="panel"><h3>Ready to evolve</h3>${evo}</div>` : '<div class="panel dim">No one on your roster is ready to evolve yet.</div>'}
      <div class="panel"><h3>Development progress</h3><table class="t"><tbody>${others.map(m => `<tr><td>${monCell(m)}</td><td>${evoLine(m)}</td><td>${devCell(G, m.id)}</td></tr>`).join('')}</tbody></table></div>
      ${fr.evoLog.filter(e => e.y === fr.year).length ? `<div class="panel"><h3>League evolutions this offseason</h3><div style="font-size:12px;max-height:160px;overflow:auto">${fr.evoLog.filter(e => e.y === fr.year).map(e => `<div>${esc(G.teams[e.t].abbr)}: ${esc(PB.BYID[e.from].dispName)} → <b>${esc(PB.BYID[e.to].dispName)}</b></div>`).join('')}</div></div>` : ''}
    </div>`;
  }
  A.frEvolve = (el, d) => run('evolve', { tid: PB.G.userTeam, id: +d.id, to: +d.to }, () => { if (UI.modalOpen()) UI.closeModal(); });
  A.frStartDraft = () => run('startDraft', {}, () => UI.go('hub', { tab: 'offseason' }, true));

  // ----- draft -----
  function draftPanel(G) {
    const fr = G.fr, D = fr.draft, me = G.userTeam;
    const cur = F.draftCurrent(G), mine = cur === me;
    const v = UI.vis(true);
    const prospects = filterMons(D.prospects.map(id => PB.BYID[id]), { q: view.dQ, sort: view.dSort, type: view.dType, hide: true });
    const up = D.seq.slice(D.pick, D.pick + 12);
    const myCount = D.history.filter(h => h.t === me).length, myLeft = D.seq.slice(D.pick).filter(t => t === me).length;
    const T = G.teams[me];
    const rows = prospects.slice(0, 70).map(m => `<tr><td>${monCell(m)}</td><td>${m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]};font-size:9px">${t}</span>`).join(' ')}</td>${v.P ? `<td>${UI.posBadges(m)}</td>` : ''}${v.O ? `<td class="n"><b>${m.ovr}</b></td><td class="n">${F.potential(m)}</td>` : ''}${baseCells(m, v)}<td style="font-size:11px;max-width:220px">${evoLine(m)}</td>
      <td><button class="small ${mine ? 'primary' : ''}" data-act="frDraftPick" data-id="${m.id}" ${mine ? '' : 'disabled'}>Draft</button></td></tr>`).join('');
    return `<div class="row between wrap" style="margin-bottom:10px">
      <div><h2 style="margin:0">${PB.REGIONS[D.gen]} Draft Class</h2><div class="dim">Pick ${Math.min(D.pick + 1, D.seq.length)} of ${D.seq.length} · ${D.prospects.length} Pokémon left · ${mine ? '<b class="gold">YOU ARE ON THE CLOCK</b>' : 'on the clock: ' + (cur != null ? UI.teamLabel(G, cur) : '—') + (myLeft ? ' · you pick in ' + (D.seq.slice(D.pick).indexOf(me)) : '')}</div>
      ${D.added.length ? `<div class="dim" style="font-size:12px">Expansion: ${D.added.map(id => esc(G.teams[id].name)).join(', ')} (pick first)</div>` : ''}</div>
      <div class="row wrap"><button data-act="frDraftToMe" ${mine ? 'disabled' : ''}>⏩ Sim to my pick</button><button data-act="frDraftAuto" ${mine ? '' : 'disabled'}>✨ Auto-pick for me</button><button data-act="frDraftRest">⏭ Auto-draft the rest</button></div></div>
      <div class="layout2" style="--side:340px"><div class="panel">
        <div class="row wrap" style="margin-bottom:8px"><select data-change="frDFilter" data-k="type"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${view.dType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${sortSelect(view.dSort, 'frDFilter', true)}
          <input type="text" id="frdq" placeholder="search name…" value="${esc(view.dQ)}" oninput="PB.UI.frDSearch(this.value)"></div>
        <div class="scroll" id="frdtable"><table class="t"><thead><tr><th>Pokémon</th><th>Type</th>${v.P ? '<th>Pos</th>' : ''}${v.O ? '<th class="n">OVR</th><th class="n">POT</th>' : ''}${baseHead(v)}<th>Evolution line</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
        <div class="col">
          <div class="panel"><h3>Your roster (${T.roster.length}/${fr.cfg.rosterMax})</h3><div class="dim" style="font-size:12px">${myCount} drafted · ${myLeft} picks left</div>
            <div class="slots" style="margin-top:6px;max-height:260px;overflow:auto">${T.roster.map(id => { const m = PB.BYID[id]; const nw = D.history.some(h => h.mon === id); return `<div class="slot fill" data-act="inspect" data-id="${id}" tabindex="0">${UI.spr(m, 30)}<b class="grow">${esc(m.dispName)}</b>${nw ? '<span class="tag good">NEW</span>' : ''}</div>`; }).join('')}</div></div>
          <div class="panel"><h3>Draft order</h3><div style="font-size:12px;max-height:160px;overflow:auto">${up.map((t, i) => `<div class="row between" style="${i === 0 ? 'font-weight:800;color:var(--gold)' : ''}"><span>#${D.pick + i + 1}</span><span>${UI.teamLabel(G, t)}</span></div>`).join('')}</div></div>
          <div class="panel"><h3>Recent picks</h3><div style="font-size:12px;max-height:200px;overflow:auto">${D.history.slice(-12).reverse().map(h => `<div class="row between"><span class="dim">#${h.n + 1} ${esc(G.teams[h.t].abbr)}</span><span>${esc(PB.BYID[h.mon].dispName)}</span></div>`).join('') || '<span class="dim">No picks yet.</span>'}</div></div>
        </div></div>`;
  }
  UI.frDSearch = function (q) { view.dQ = q; const G = PB.G; if (G.fr.stage !== 'draft') return; UI.refresh(); const el = document.getElementById('frdq'); if (el) { el.focus(); el.setSelectionRange(q.length, q.length); } };
  A.frDFilter = (el, d) => { view[d.k === 'type' ? 'dType' : 'dSort'] = el.value; UI.refresh(); };
  A.frDraftPick = (el, d) => { if (UI.modalOpen()) UI.closeModal(); run('draftPick', { tid: PB.G.userTeam, id: +d.id }); };
  A.frDraftAuto = () => run('draftAuto', { tid: PB.G.userTeam });
  A.frDraftToMe = () => run('draftToMe', {});
  A.frDraftRest = async () => { await UI.spin('Auto-drafting…', () => { }); run('draftRest', {}); };

  // ----- free agency stage -----
  function faPanel(G) {
    const fr = G.fr, T = G.teams[G.userTeam];
    const errs = F.userRosterErrors(G);
    const nextN = fr.year + 1;
    const newTeams = fr.draft ? fr.draft.added : [];
    return `<div class="col" style="max-width:860px;margin:0 auto">
      <div class="panel"><h2>Free agency · Season ${nextN} preview</h2>
        <div class="dim">The ${PB.REGIONS[fr.draft.gen]} class has been drafted. Sign free agents, make trades, release extras and set your lineup. The AI teams fill their rosters when the season starts.</div>
        <div class="kpi" style="margin-top:10px"><div><b>${T.roster.length}/${fr.cfg.rosterMax}</b><span>Roster</span></div><div><b>${G.teams.length}</b><span>Teams</span></div><div><b>${F.gamesFor(G.teams.length, fr.cfg)}</b><span>Games each</span></div><div><b>${F.freeAgents(G).length}</b><span>Free agents</span></div></div>
        ${newTeams.length ? `<div class="dim" style="margin-top:8px">New teams this year: ${newTeams.map(id => esc(G.teams[id].name)).join(', ')}</div>` : ''}
        ${errs.map(e => `<div class="need">${esc(e)}</div>`).join('')}
        <div class="row wrap" style="margin-top:12px"><button data-act="hubTab" data-tab="fa">Free agents</button><button data-act="hubTab" data-tab="trades">Trades</button><button data-act="hubTab" data-tab="roster">Roster</button><button data-act="editLineup">Lineup & strategy</button>
          <button class="gold" data-act="frNextSeason" ${errs.length ? 'disabled' : ''} autofocus>Start season ${nextN}</button></div></div>
      <div class="panel"><h3>Roster</h3>${rosterTable(G, T, false)}</div></div>`;
  }
  A.frNextSeason = async () => {
    let err = null;
    await UI.spin('Starting the new season…', () => { });
    run('startNextSeason', {}, () => { UI.stack = []; UI.go('hub', { tab: 'home' }, true); });
  };

  function overPanel(G) {
    const fr = G.fr, tally = {};
    fr.history.forEach(h => { if (h.champ != null) tally[h.champ] = (tally[h.champ] || 0) + 1; });
    const ranking = Object.keys(tally).map(Number).sort((a, b) => tally[b] - tally[a]);
    const mine = fr.history.filter(h => h.champ === G.userTeam).length;
    return `<div class="col" style="max-width:900px;margin:0 auto"><div class="panel center" style="border-color:var(--gold)"><h2 class="gold">Franchise complete</h2>
      <div>All ${fr.gens.length} regions have been drafted — ${fr.history.length} seasons played.</div>
      <div class="kpi" style="justify-content:center;margin-top:10px"><div><b>${mine}</b><span>Your titles</span></div><div><b>${ranking.length ? esc(G.teams[ranking[0]].abbr) : '-'}</b><span>Most titles</span></div><div><b>${G.teams.length}</b><span>Teams</span></div></div></div>
      <div class="layout2" style="--side:1fr"><div class="panel"><h3>Champions</h3>${fr.history.map(h => `<div class="row between"><span class="dim">Season ${h.y}</span><span>${UI.teamLabel(G, h.champ)}</span></div>`).join('')}</div>
      <div class="panel"><h3>Titles</h3>${ranking.map(t => `<div class="row between"><span>${UI.teamLabel(G, t)}</span><b>${tally[t]}</b></div>`).join('')}</div></div>
      <div class="row center"><button class="primary" data-act="hubTab" data-tab="history">Full history</button><button data-act="goMenu">Main menu</button></div></div>`;
  }

  // ---------- roster ----------
  function rosterTable(G, T, editable) {
    const lg = G.league, v = UI.vis(), fr = G.fr;
    const ids = T.starters.concat(T.bench, PB.reserves(T));
    const lab = i => i < 5 ? `<span class="pos p${i}">${PB.POS[i]}</span>` : i < 12 ? '<span class="tag">BENCH</span>' : '<span class="tag" style="background:#3a3a4a">RESERVE</span>';
    return `<div class="scroll"><table class="t"><thead><tr><th></th><th>Pokémon</th>${v.P ? '<th>Pos</th>' : ''}${v.O ? '<th class="n">OVR</th>' : ''}<th>Status</th><th>Development</th><th class="n">GP</th><th class="n">MPG</th><th class="n">PPG</th><th class="n">RPG</th><th class="n">APG</th>${editable ? '<th>Train</th><th></th>' : ''}</tr></thead><tbody>
      ${ids.map((id, i) => { const m = PB.BYID[id], s = lg.pstats[id], g = s ? s.gp : 0;
        return `<tr><td>${lab(i)}</td><td>${monCell(m)}</td>${v.P ? `<td>${UI.posBadges(m)}</td>` : ''}${v.O ? `<td class="n"><b>${m.ovr}</b></td>` : ''}<td>${injTag(G, id) || '<span class="dim">Healthy</span>'}</td><td>${devCell(G, id)}</td>
        <td class="n">${g}</td><td class="n">${g ? (s.sec / g / 60).toFixed(1) : '-'}</td><td class="n">${g ? (s.pts / g).toFixed(1) : '-'}</td><td class="n">${g ? ((s.oreb + s.dreb) / g).toFixed(1) : '-'}</td><td class="n">${g ? (s.ast / g).toFixed(1) : '-'}</td>
        ${editable ? `<td><button class="small ${fr.focus[id] ? 'gold' : 'ghost'}" data-act="frFocus" data-id="${id}" title="Training focus: bonus development this offseason">★</button></td><td><button class="small ghost" data-act="frRelease" data-id="${id}" title="Release to free agency">✕</button></td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
  }
  const origRoster = TAB.roster;
  TAB.roster = function (G, lg) {
    if (G.mode !== 'franchise') return origRoster(G, lg);
    const T = G.teams[G.userTeam], fr = G.fr;
    return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">${esc(T.name)} roster</h2><div class="dim">${T.roster.length}/${fr.cfg.rosterMax} Pokémon · training focus ★ ${Object.keys(fr.focus).length}/3 (extra development at season's end)</div></div><button class="primary" data-act="editLineup">Lineup & strategy</button></div>
      <div class="panel">${rosterTable(G, T, true)}</div>`;
  };
  A.frFocus = (el, d) => run('focus', { tid: PB.G.userTeam, id: +d.id });
  A.frRelease = (el, d) => {
    const m = PB.BYID[+d.id];
    if (!confirm('Release ' + m.dispName + ' to free agency?')) return;
    run('release', { tid: PB.G.userTeam, id: +d.id });
  };

  // ---------- free agents ----------
  TAB.fa = function (G, lg) {
    const fr = G.fr, T = G.teams[G.userTeam], v = UI.vis();
    const closed = lg.phase === 'playoffs' ? 'Free agency is closed during the playoffs.' : fr.stage === 'over' ? 'The franchise is over.' : fr.stage === 'draft' ? 'Free agency opens after the draft.' : null;
    const full = T.roster.length >= fr.cfg.rosterMax;
    const list = filterMons(F.freeAgents(G).map(id => PB.BYID[id]), { q: view.faQ, sort: view.faSort, type: view.faType, pos: view.faPos, leg: view.faLeg });
    const rows = list.slice(0, 80).map(m => `<tr><td>${monCell(m)}</td><td>${m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]};font-size:9px">${t}</span>`).join(' ')}</td>${v.P ? `<td>${UI.posBadges(m)}</td>` : ''}${v.O ? `<td class="n"><b>${m.ovr}</b></td><td class="n">${F.potential(m)}</td>` : ''}${baseCells(m, v)}<td style="font-size:11px;max-width:200px">${evoLine(m)}</td>
      <td><button class="small primary" data-act="frSign" data-id="${m.id}" ${closed || full ? 'disabled' : ''}>Sign</button></td></tr>`).join('');
    return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">Free agents</h2><div class="dim">${F.freeAgents(G).length} available · your roster ${T.roster.length}/${fr.cfg.rosterMax}${full ? ' — release someone first' : ''}${closed ? ' · ' + closed : ''}</div></div></div>
      <div class="panel"><div class="row wrap" style="margin-bottom:8px">
        <select data-change="frFaFilter" data-k="faType"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${view.faType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        ${v.P ? `<select data-change="frFaFilter" data-k="faPos"><option value="ALL">All positions</option>${PB.POS.map(p => `<option ${view.faPos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>` : ''}
        <select data-change="frFaFilter" data-k="faLeg"><option value="ALL">All</option><option value="LEG" ${view.faLeg === 'LEG' ? 'selected' : ''}>Legendary/Mythical</option><option value="NON" ${view.faLeg === 'NON' ? 'selected' : ''}>Non-legendary</option></select>
        ${sortSelect(view.faSort, 'frFaFilter')}
        <input type="text" id="frfq" placeholder="search name…" value="${esc(view.faQ)}" oninput="PB.UI.frFaSearch(this.value)"></div>
      <div class="scroll"><table class="t"><thead><tr><th>Pokémon</th><th>Type</th>${v.P ? '<th>Pos</th>' : ''}${v.O ? '<th class="n">OVR</th><th class="n">POT</th>' : ''}${baseHead(v)}<th>Evolution line</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  UI.frFaSearch = function (q) { view.faQ = q; UI.refresh(); const el = document.getElementById('frfq'); if (el) { el.focus(); el.setSelectionRange(q.length, q.length); } };
  A.frFaFilter = (el, d) => { view[d.k === 'sort' ? 'faSort' : d.k] = el.value; UI.refresh(); };
  A.frSign = (el, d) => { if (UI.modalOpen()) UI.closeModal(); run('sign', { tid: PB.G.userTeam, id: +d.id }, () => PB.toast(PB.BYID[+d.id].dispName + ' signed')); };

  // ---------- trades ----------
  function tradeSide(G, T, sel, side) {
    return `<div class="panel"><h3>${esc(T.name)} <span class="dim">(${T.roster.length})</span></h3><div class="slots">${T.roster.map(id => { const m = PB.BYID[id], on = sel.includes(id);
      return `<div class="slot fill ${on ? 'sel' : ''}" tabindex="0" data-act="frTradeSel" data-side="${side}" data-id="${id}">${UI.spr(m, 30)}<div class="grow"><b>${esc(m.dispName)}</b> ${injTag(G, id)}<div class="dim" style="font-size:10px">${m.hp}/${m.atk}/${m.def}/${m.spa}/${m.spd}/${m.spe}${UI.vis().O ? ' · OVR ' + m.ovr : ''}</div></div>${on ? '<span class="tag good">✓</span>' : ''}</div>`; }).join('')}</div></div>`;
  }
  TAB.trades = function (G, lg) {
    const fr = G.fr, me = G.teams[G.userTeam];
    const blocked = F.tradeBlocked(G);
    const others = G.teams.filter(t => t.id !== G.userTeam);
    if (view.tTeam == null || view.tTeam === G.userTeam || !G.teams[view.tTeam]) { view.tTeam = others[0].id; view.tA = []; view.tB = []; }
    const other = G.teams[view.tTeam];
    view.tA = view.tA.filter(id => G.claimed[id] === me.id); view.tB = view.tB.filter(id => G.claimed[id] === other.id);
    let verdict = '', canGo = false;
    if (view.tA.length || view.tB.length) {
      const ev = F.evalTrade(G, me.id, other.id, view.tA, view.tB);
      if (other.user) { canGo = !ev.reason || ev.vin != null; verdict = canGo ? 'Send this offer to ' + esc(other.name) + '.' : esc(ev.reason); }
      else { canGo = ev.ok; verdict = ev.ok ? `<span class="good">${esc(other.name)} would accept.</span>` : `<span class="bad">${esc(ev.reason)}</span>`; }
    }
    const incoming = (fr.offers || []).filter(o => o.b === me.id);
    const out = (fr.offers || []).filter(o => o.a === me.id);
    const list = ids => ids.map(i => esc(PB.BYID[i].dispName)).join(', ');
    const offers = view.offers;
    return `<div class="row between wrap" style="margin-bottom:10px"><div><h2 style="margin:0">Trades</h2><div class="dim">${blocked ? '<span class="bad">' + esc(blocked) + '</span>' : 'Select Pokémon on both sides. The AI values talent, potential and development.'}</div></div>
      <div class="row"><label>Trade with <select data-change="frTradeTeam">${others.map(t => `<option value="${t.id}" ${t.id === other.id ? 'selected' : ''}>${esc(t.name)}${t.user ? ' ★' : ''}</option>`).join('')}</select></label></div></div>
      ${incoming.length ? `<div class="panel" style="border-color:var(--gold);margin-bottom:10px"><h3>Offers for you</h3>${incoming.map(o => `<div class="row between wrap"><span><b>${esc(G.teams[o.a].name)}</b> give ${list(o.giveA)} for ${list(o.giveB)}</span><span class="row"><button class="small gold" data-act="frOfferReply" data-id="${o.id}" data-accept="1">Accept</button><button class="small" data-act="frOfferReply" data-id="${o.id}" data-accept="">Decline</button></span></div>`).join('')}</div>` : ''}
      ${out.length ? `<div class="panel" style="margin-bottom:10px"><h3>Your pending offers</h3>${out.map(o => `<div>To <b>${esc(G.teams[o.b].name)}</b>: ${list(o.giveA)} for ${list(o.giveB)}</div>`).join('')}</div>` : ''}
      <div class="layout2" style="--side:1fr">${tradeSide(G, me, view.tA, 'A')}${tradeSide(G, other, view.tB, 'B')}</div>
      <div class="panel row between wrap" style="margin-top:10px"><div>${verdict || '<span class="dim">Nothing selected.</span>'}<div class="dim" style="font-size:12px">You give ${view.tA.length}, receive ${view.tB.length}. Rosters stay between 12 and ${fr.cfg.rosterMax}.</div></div>
        <div class="row"><button class="gold" data-act="frTradeGo" ${canGo && !blocked ? '' : 'disabled'}>${other.user ? 'Send offer' : 'Propose trade'}</button><button data-act="frTradeClear">Clear</button></div></div>
      <div class="panel" style="margin-top:10px"><div class="row between"><h3 style="margin:0">Offers from AI teams</h3><button class="small" data-act="frFindOffers" ${blocked ? 'disabled' : ''}>Look for offers</button></div>
        ${offers ? (offers.length ? offers.map((o, i) => `<div class="row between wrap" style="padding:4px 0"><span><b>${esc(G.teams[o.team].name)}</b> would give ${list(o.give)} for your ${list(o.ask)}</span><button class="small primary" data-act="frTakeOffer" data-i="${i}" ${blocked ? 'disabled' : ''}>Accept</button></div>`).join('') : '<div class="dim">No AI team has an offer right now.</div>') : '<div class="dim">See who around the league wants your players.</div>'}</div>`;
  };
  A.frTradeTeam = el => { view.tTeam = +el.value; view.tA = []; view.tB = []; UI.refresh(); };
  A.frTradeSel = (el, d) => { const a = d.side === 'A' ? view.tA : view.tB, id = +d.id, i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); UI.refresh(); };
  A.frTradeClear = () => { view.tA = []; view.tB = []; UI.refresh(); };
  A.frTradeGo = () => {
    const G = PB.G, me = G.userTeam, other = G.teams[view.tTeam];
    const args = { a: me, b: other.id, giveA: view.tA.slice(), giveB: view.tB.slice() };
    run(other.user ? 'tradeOffer' : 'trade', args, () => { view.tA = []; view.tB = []; PB.toast(other.user ? 'Offer sent' : 'Trade completed'); });
  };
  A.frFindOffers = () => { const G = PB.G; view.offers = F.offersFor(G, G.userTeam); UI.refresh(); };
  A.frTakeOffer = (el, d) => {
    const G = PB.G, o = view.offers[+d.i];
    run('trade', { a: G.userTeam, b: o.team, giveA: o.ask, giveB: o.give }, () => { view.offers = null; PB.toast('Trade completed'); });
  };
  A.frOfferReply = (el, d) => run('tradeReply', { id: +d.id, accept: !!d.accept });

  // ---------- history ----------
  TAB.history = function (G) {
    const fr = G.fr;
    const seasons = fr.history.map(h => `<tr class="${h.champ === G.userTeam ? 'me' : ''}"><td>${h.y}</td><td class="dim">${h.gens.map(g => PB.REGIONS[g]).join(', ')}</td><td class="n">${h.teams}</td><td class="n">${h.games}</td><td>${UI.teamLabel(G, h.champ)}</td><td>${h.mvp != null ? esc(PB.BYID[h.mvp].dispName) : '-'}</td><td class="n">${h.rec}</td><td>${esc(h.result)}</td></tr>`).join('');
    const evo = fr.evoLog.slice().reverse().slice(0, 60).map(e => `<div style="font-size:12px"><span class="dim">S${e.y}</span> ${esc(G.teams[e.t].abbr)}: ${esc(PB.BYID[e.from].dispName)} → <b>${esc(PB.BYID[e.to].dispName)}</b></div>`).join('');
    return `<div class="col"><div class="panel"><h3>Seasons</h3>${seasons ? `<table class="t"><thead><tr><th>Season</th><th>Regions</th><th class="n">Teams</th><th class="n">GP</th><th>Champion</th><th>MVP</th><th class="n">You</th><th>Result</th></tr></thead><tbody>${seasons}</tbody></table>` : '<div class="dim">No completed seasons yet.</div>'}</div>
      <div class="layout2" style="--side:1fr"><div class="panel"><h3>Evolutions</h3><div style="max-height:320px;overflow:auto">${evo || '<div class="dim">None yet.</div>'}</div></div>
      <div class="panel"><h3>League news</h3><div style="max-height:320px;overflow:auto">${fr.news.map(n => `<div style="font-size:12px;${n.user ? 'color:var(--gold)' : ''}"><span class="dim">S${n.y}</span> ${esc(n.txt)}</div>`).join('') || '<div class="dim">Nothing yet.</div>'}</div></div></div></div>`;
  };

  // ---------- scouting actions from the Pokémon card ----------
  const origInspect = S.hub.inspectActions;
  S.hub.inspectActions = id => {
    const G = PB.G; if (G.mode !== 'franchise') return origInspect ? origInspect(id) : '';
    const fr = G.fr, me = G.userTeam;
    if (fr.stage === 'draft' && fr.draft && F.draftCurrent(G) === me && fr.draft.prospects.includes(id)) return `<button class="primary" data-act="frDraftPick" data-id="${id}">Draft ${esc(PB.BYID[id].dispName)}</button>`;
    if (fr.pool[id] && G.claimed[id] == null && fr.stage !== 'draft' && G.league.phase !== 'playoffs' && G.teams[me].roster.length < fr.cfg.rosterMax) return `<button class="primary" data-act="frSign" data-id="${id}">Sign ${esc(PB.BYID[id].dispName)}</button>`;
    return '';
  };

  // franchise saves
  UI.frActive = G => G && G.mode === 'franchise';
})(window.PB);
