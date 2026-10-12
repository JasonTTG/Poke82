// Franchise UI extras: records, league rules, awards ceremony, in-season evolution prompts.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, A = UI.actions, L = PB.League, F = PB.Franchise, TAB = UI.hubTabs, O = PB.Ops;
  const run = (name, args, after) => O.run(name, args, (err, res) => { if (err) { PB.toast(err, 3500); return; } if (after) after(res); UI.refresh(); });

  // ---------- evolve prompt ----------
  A.frEvoOpen = (el, d) => {
    const G = PB.G, id = +d.id, m = PB.BYID[id], opts = F.evoOptions(G, id).filter(o => o.ready);
    if (!opts.length) return;
    UI.modal(`<h2>${esc(m.dispName)} is ready to evolve</h2><div class="dim" style="margin-bottom:8px">${PB.G.league && G.league.phase === 'regular' ? 'It joins your lineup right away.' : ''}</div>
      <div class="col">${opts.map(o => { const t = PB.BYID[o.to], d2 = PB.Abil.describe(o.to); return `<div class="row between wrap panel" style="background:var(--bg2)"><div class="row">${UI.spr(t, 64)}<div><b>${esc(t.dispName)}</b><div>${UI.typePills(t)}</div><div class="dim" style="font-size:11px">${t.hp}/${t.atk}/${t.def}/${t.spa}/${t.spd}/${t.spe} · BST ${t.bst}${UI.vis().O ? ' · OVR ' + t.ovr : ''}</div></div></div><button class="gold" data-act="frEvolve" data-id="${id}" data-to="${t.id}">Evolve</button></div>`; }).join('')}</div>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button data-act="closeModal">Not yet</button></div>`);
  };

  // wrap the home tab: evolution-ready banner (in-season) and awards ceremony button
  const home = TAB.home;
  TAB.home = function (G, lg, p) {
    let html = home(G, lg, p);
    if (G.mode === 'franchise' && lg.phase === 'regular') {
      const ready = F.canEvolveList(G, G.userTeam);
      if (ready.length) html = `<div class="panel row between wrap" style="border-color:var(--gold);margin-bottom:12px"><div><b class="gold">Ready to evolve:</b> ${ready.map(x => esc(PB.BYID[x.id].dispName)).join(', ')}</div><button class="small gold" data-act="hubTab" data-tab="roster">Open roster</button></div>` + html;
    }
    if (G.mode === 'franchise' && lg.phase === 'done') UI.ceremonyAuto(G);
    if (lg.phase === 'done' && lg.awards) html = `<div class="panel row between wrap" style="margin-bottom:12px"><b>Season awards are in.</b><button class="gold" data-act="ceremony">🏆 Watch the awards ceremony</button></div>` + html;
    return html;
  };

  // ---------- league rules ----------
  TAB.rules = function (G) {
    const fr = G.fr, host = !(PB.Net && PB.Net.onlineLeague && PB.Net.onlineLeague()) || PB.Net.isHost();
    return `<div class="panel" style="max-width:640px"><h2>League rules</h2>
      <div class="dim" style="margin-bottom:10px">${host ? 'Changes apply right away where possible (injuries, trade deadline, legendary limit) and otherwise from the next season.' : 'Only the host can change the rules.'}</div>
      <div class="col">${F.RULES.map(r => { const cur = F.getRule(G, r.k); return `<label class="row between">${r.label}<select data-change="frRule" data-k="${r.k}" ${host ? '' : 'disabled'}>${r.opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`; }).join('')}</div>
      <div class="dim" style="font-size:12px;margin-top:8px">The legendary limit applies to drafts, free agency, trades and evolution. A team over the limit after a rules change keeps its Pokémon but cannot add more.</div></div>`;
  };
  A.frRule = (el, d) => run('rules', { rules: { [d.k]: +el.value } });

  // ---------- records ----------
  TAB.records = function (G) {
    const fr = G.fr, R = fr.records || { game: {}, team: {}, season: {} }, v = UI.vis();
    const mon = id => { const m = PB.BYID[id]; return `<span data-act="inspect" data-id="${id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 24)} ${esc(m.dispName)}</span>`; };
    const tm = t => UI.teamLabel(G, t);
    const gameRows = F.GAME_KEYS.map(([k, label]) => { const r = (R.game || {})[k]; return r ? `<tr><td>${label}</td><td class="n"><b>${r.v}</b></td><td>${mon(r.id)}</td><td>${tm(r.t)}</td><td class="dim">S${r.y}</td></tr>` : ''; }).join('');
    const T = R.team || {}, S = R.season || {};
    const teamRows = [['Best record', T.record && `${T.record.w}-${T.record.l}`, T.record && T.record.t, T.record && T.record.y], ['Most points in a game', T.pts && T.pts.v, T.pts && T.pts.t, T.pts && T.pts.y], ['Biggest win', T.margin && '+' + T.margin.v, T.margin && T.margin.t, T.margin && T.margin.y], ['Longest win streak', T.streak && T.streak.v, T.streak && T.streak.t, T.streak && T.streak.y]]
      .filter(r => r[1]).map(r => `<tr><td>${r[0]}</td><td class="n"><b>${r[1]}</b></td><td>${tm(r[2])}</td><td class="dim">S${r[3]}</td></tr>`).join('');
    const seasonRows = [['ppg', 'Points per game'], ['rpg', 'Rebounds per game'], ['apg', 'Assists per game']].map(([k, l]) => S[k] ? `<tr><td>${l}</td><td class="n"><b>${S[k].v.toFixed(1)}</b></td><td>${mon(S[k].id)}</td><td class="dim">S${S[k].y}</td></tr>` : '').join('');
    const career = fr.career || {};
    const top = (key, f) => Object.keys(career).map(id => ({ id: +id, v: f(career[id]) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6);
    const lead = [['Career points', c => c.pts], ['Career rebounds', c => c.reb], ['Career assists', c => c.ast], ['Career steals', c => c.stl], ['Career blocks', c => c.blk], ['Titles', c => c.titles], ['MVP awards', c => c.mvp]].map(([l, f]) => `<div class="panel"><h3>${l}</h3>${top(l, f).map((x, i) => `<div class="row between"><span>${i + 1}. ${mon(x.id)}</span><b>${x.v}</b></div>`).join('') || '<div class="dim">—</div>'}</div>`).join('');
    const hall = fr.hall.filter(h => h.k === 'MVP').map(h => `<div class="row between"><span class="dim">Season ${h.y}</span><span>${mon(h.id)}</span></div>`).join('');
    return `<div class="col"><div class="layout2" style="--side:1fr"><div class="panel"><h3>Single-game records</h3>${gameRows ? `<table class="t"><tbody>${gameRows}</tbody></table>` : '<div class="dim">Play some games first.</div>'}</div>
      <div class="panel"><h3>Team records</h3>${teamRows ? `<table class="t"><tbody>${teamRows}</tbody></table>` : '<div class="dim">—</div>'}<h3 style="margin-top:12px">Season records</h3>${seasonRows ? `<table class="t"><tbody>${seasonRows}</tbody></table>` : '<div class="dim">After the first season.</div>'}</div></div>
      <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(250px,1fr))">${lead}</div>
      ${hall ? `<div class="panel"><h3>MVP history</h3>${hall}</div>` : ''}</div>`;
  };

  // ---------- awards ceremony ----------
  A.ceremony = () => UI.ceremony(PB.G);
  UI.ceremony = function (G) {
    const lg = G.league, a = lg.awards; if (!a) return;
    const steps = [];
    const stat = id => { const s = lg.pstats[id]; if (!s) return ''; const g = s.gp; return `${(s.pts / g).toFixed(1)} pts · ${((s.oreb + s.dreb) / g).toFixed(1)} reb · ${(s.ast / g).toFixed(1)} ast`; };
    const person = (title, id) => { if (id != null) steps.push({ title, ids: [id], sub: stat(id) }); };
    person('Rookie of the Year', a.roy);
    person('Sixth Pokémon of the Year', a.sixth);
    person('Defensive Player of the Year', a.dpoy);
    person('Scoring Champion', a.scoring);
    steps.push({ title: 'All-Defensive Teams', groups: a.allDefense.map((t, i) => ['All-Defensive ' + ['1st', '2nd'][i] + ' Team', t]) });
    steps.push({ title: 'All-League Teams', groups: a.allLeague.map((t, i) => ['All-League ' + ['1st', '2nd', '3rd'][i] + ' Team', t]).reverse() });
    person('Most Valuable Pokémon', a.mvp);
    if (lg.champion != null) steps.push({ title: 'Champions', team: lg.champion, ids: a.playoffMvp != null ? [a.playoffMvp] : [], sub: a.playoffMvp != null ? 'Playoffs MVP · ' + stat(a.playoffMvp) : '' });
    let i = 0;
    const show = () => {
      const s = steps[i], last = i === steps.length - 1;
      const sprites = (s.ids || []).map(id => `<div class="cer-card">${UI.spr(PB.BYID[id], 150)}<div class="cer-name">${esc(PB.BYID[id].dispName)}</div><div class="dim">${esc(G.teams[L.teamOf(G, id)].name)}</div></div>`).join('');
      const groups = (s.groups || []).map(([t, ids]) => `<div style="margin:8px 0"><div class="gold" style="font-weight:800">${esc(t)}</div><div class="row wrap" style="justify-content:center">${ids.map(id => `<div class="center" style="width:84px">${UI.spr(PB.BYID[id], 60)}<div style="font-size:11px">${esc(PB.BYID[id].dispName)}</div><div class="dim" style="font-size:10px">${esc(G.teams[L.teamOf(G, id)].abbr)}</div></div>`).join('')}</div></div>`).join('');
      UI.modal(`<div class="cer"><div class="cer-conf">${s.team != null ? '🎉 🏆 🎉' : '✨'}</div><div class="cer-title">${esc(s.title)}</div>${s.team != null ? `<div class="cer-team" style="color:${PB.teamColors(G.teams[s.team])[0]}">${esc(G.teams[s.team].name)}</div>` : ''}<div class="cer-spot">${sprites}${groups}</div><div class="dim">${esc(s.sub || '')}</div>
        <div class="row center" style="margin-top:14px"><button data-act="cerSkip">Skip</button><button class="gold" data-act="cerNext" autofocus>${last ? 'Done' : 'Next'}</button></div></div>`);
    };
    UI._cer = { next: () => { i++; if (i >= steps.length) { UI._cer = null; UI.closeModal(); } else show(); }, skip: () => { UI._cer = null; UI.closeModal(); } };
    show();
  };
  A.cerNext = () => UI._cer && UI._cer.next();
  A.cerSkip = () => UI._cer && UI._cer.skip();
  // the ceremony opens by itself the first time a franchise season ends
  const review = A.frBegin;
  PB.UI.ceremonyAuto = function (G) { const fr = G.fr; if (fr && fr.stage === 'review' && fr.cerSeen !== fr.year && G.league.awards) { fr.cerSeen = fr.year; setTimeout(() => UI.ceremony(G), 300); } };
})(window.PB);
