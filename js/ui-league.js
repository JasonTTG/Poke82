// League hub: home/sim controls, schedule, standings, stats, playoffs, box scores, roster, saves.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions, L = PB.League;
  const view = { sched: null, schedDay: null, standMode: 'conf', statsTab: 'leaders', statsPO: false, rosterSort: 'ppg', tstatSort: 'pts' };

  const tabs = [['home', 'Home'], ['schedule', 'Schedule'], ['standings', 'Standings'], ['stats', 'Stats'], ['playoffs', 'Playoffs'], ['awards', 'Awards'], ['boxes', 'Box Scores'], ['roster', 'Roster'], ['save', 'Save / Load']];

  const recStr = r => r.w + '-' + r.l;
  const dayLabel = (lg, day) => lg.phase === 'regular' || day <= lg.lastDay ? L.dateStr(day) : 'Playoffs · ' + L.dateStr(day);

  function nextUserGame(G) {
    const lg = G.league;
    if (lg.phase === 'regular') return lg.sched.filter(g => !g.done && (G.teams[g.h].user || G.teams[g.a].user)).sort((a, b) => a.day - b.day)[0] || null;
    return null;
  }

  S.hub = {
    back() { UI.go('menu', {}, true); },
    top(p) {
      const G = PB.G, lg = G.league, T = G.teams[G.userTeam], r = lg.rec[G.userTeam];
      return `<div class="logo">POKÉ<b>HOOPS</b> 82</div>
        <div class="tabs">${tabs.map(([k, l]) => `<button class="${(p.tab || 'home') === k ? 'on' : ''}" data-act="hubTab" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="spacer"></div>
        <span style="font-size:13px"><b class="gold">${esc(T.name)}</b> ${recStr(r)}</span>
        <button class="small" data-act="goSettings">⚙</button><button class="small" data-act="goMenu">Menu</button>`;
    },
    render(p) {
      const G = PB.G, lg = G.league;
      const fn = TAB[p.tab || 'home'];
      return fn(G, lg, p);
    },
  };
  A.hubTab = (el, d) => { UI.params.tab = d.tab; UI.refresh(); };

  // ---------------- HOME ----------------
  function seasonSummary(G, lg) {
    const a = lg.ach, T = G.teams[G.userTeam], r = lg.rec[G.userTeam];
    const champ = lg.champion;
    const items = [
      ['Achieved 82-0', a.perfect, `Regular season record ${r.w}-${r.l}`],
      ['Best record in the league', a.bestRecord, ''],
      ['Made the playoffs', a.madePlayoffs, ''],
      ['Won the championship', a.champion, champ != null ? 'Champion: ' + G.teams[champ].name : ''],
      ['Undefeated championship season (82-0 and a perfect run)', a.undefeatedChampion, a.perfect ? 'Playoff losses: ' + a.poRecordLosses : 'Requires an undefeated regular season'],
    ];
    const mvp = lg.awards ? PB.BYID[lg.awards.mvp] : null;
    return `<div class="panel" style="border-color:${a.undefeatedChampion ? 'var(--gold)' : 'var(--line)'}"><h2>${a.undefeatedChampion ? '🏆 PERFECTION! ' : ''}Season Complete</h2>
      <div class="kpi"><div><b>${r.w}-${r.l}</b><span>Final record</span></div><div><b>${champ != null ? esc(G.teams[champ].abbr) : '-'}</b><span>Champion</span></div>${mvp ? `<div><b>${esc(mvp.dispName)}</b><span>League MVP</span></div>` : ''}</div>
      <div class="col" style="margin-top:12px">${items.map(([t, ok, sub]) => `<div class="row"><span style="font-size:22px">${ok ? '✅' : '⬜'}</span><div><b class="${ok ? 'gold' : 'dim'}">${t}</b><div class="dim" style="font-size:12px">${sub}</div></div></div>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button data-act="hubTab" data-tab="standings">Final standings</button><button data-act="goMenu" class="primary">Main menu</button></div></div>`;
  }

  const TAB = {};
  TAB.home = function (G, lg) {
    const T = G.teams[G.userTeam], r = lg.rec[G.userTeam];
    if (lg.phase === 'done') return seasonSummary(G, lg);
    const ug = L.userGameToday(G);
    const nxt = ug || nextUserGame(G);
    const confRank = L.confStandings(G, T.conf).indexOf(G.userTeam) + 1;
    const gp = r.w + r.l;
    const opp = ug ? G.teams[ug.h === G.userTeam ? ug.a : ug.h] : nxt ? G.teams[nxt.h === G.userTeam ? nxt.a : nxt.h] : null;
    const last = lg.userBoxes.slice(-5).reverse();
    const po = lg.phase === 'playoffs';
    let userSer = null;
    if (po) userSer = lg.po.rounds[lg.po.round - 1].find(s => s.hi === G.userTeam || s.lo === G.userTeam);
    const perfectNote = lg.phase === 'regular' ? (r.l === 0 && gp ? `<span class="gold">Perfect: ${r.w}-0</span>` : '') : '';
    const gameCard = ug ? `<div class="panel" style="border-color:var(--gold)"><h3>${po ? 'Playoff game ' + ug.n : 'Game day'} · ${dayLabel(lg, lg.day)}</h3>
        <div class="row between wrap" style="font-size:20px"><b>${ug.h === G.userTeam ? esc(T.name) : esc(opp.name)} ${ug.h === G.userTeam ? '' : ''}</b><span class="dim">${ug.h === G.userTeam ? 'vs' : '@'}</span><b>${ug.h === G.userTeam ? esc(opp.name) : esc(T.name)}</b></div>
        <div class="dim">${UI.vis().O ? `OVR ${PB.teamOvr(opp).toFixed(1)} vs ${PB.teamOvr(T).toFixed(1)} · ` : ''}${PB.OFF_STRATS[opp.strat.off]} / ${PB.DEF_STRATS[opp.strat.def]}</div>
        <div class="row wrap" style="margin-top:10px"><button class="gold" data-act="playGame" autofocus>🏀 Play game</button><button data-act="simGame">Simulate game</button><button data-act="hubTab" data-tab="roster">Adjust lineup</button></div></div>`
      : `<div class="panel"><h3>${po ? 'Playoffs' : 'Next game'}</h3>
        ${nxt ? `<div style="font-size:18px">${nxt.h === G.userTeam ? 'vs' : '@'} <b>${esc(opp.name)}</b> <span class="dim">· ${L.dateStr(nxt.day)}</span></div>` : po ? (userSer ? `<div>Series vs ${esc(G.teams[userSer.hi === G.userTeam ? userSer.lo : userSer.hi].name)}</div>` : '<div class="dim">Your team is not in the playoffs / was eliminated.</div>') : ''}
        <div class="row wrap" style="margin-top:10px"><button class="primary" data-act="toNextGame" autofocus>${po ? 'Advance playoffs to my next game' : 'Sim to my next game'}</button></div></div>`;
    return `<div class="layout2" style="--side:360px">
      <div class="col">
        <div class="row wrap"><div class="kpi"><div><b>${recStr(r)}</b><span>Record</span></div><div><b>${gp ? (r.w / gp * 100).toFixed(0) + '%' : '-'}</b><span>Win %</span></div><div><b>${po ? 'PO' : '#' + confRank}</b><span>${po ? 'Playoffs' : T.conf + ' seed'}</span></div>${UI.vis().O ? `<div><b>${PB.teamOvr(T).toFixed(1)}</b><span>Team OVR</span></div>` : ''}<div><b>${lg.games - gp}</b><span>Games left</span></div></div></div>
        <div>${perfectNote}</div>
        ${(lg.allStar && !lg.allStarSeen) || (lg.awards && !lg.awardsSeen) ? `<div class="panel row between" style="border-color:var(--gold)"><b>${lg.awards && !lg.awardsSeen ? 'Season awards announced' : 'All-Star rosters announced'}</b><button class="small gold" data-act="hubTab" data-tab="awards">View</button></div>` : ''}
        ${gameCard}
        <div class="panel"><h3>Simulation controls</h3>
          <div class="row wrap">
            <button data-act="simDays" data-n="1">Sim 1 day</button><button data-act="simDays" data-n="7">Sim 1 week</button><button data-act="simDays" data-n="30">Sim 1 month</button>
            <button data-act="simRest" ${lg.phase !== 'regular' ? 'disabled' : ''}>Sim rest of regular season</button>
            <button data-act="simAllSeason">Sim to season end</button></div>
          <div class="row wrap" style="margin-top:8px"><label>Sim to date: <input type="date" id="simdate" min="${L.dateISO(1)}" max="${L.dateISO(lg.lastDay)}" value="${L.dateISO(Math.min(lg.lastDay, lg.day))}"></label><button data-act="simToDate" ${lg.phase !== 'regular' ? 'disabled' : ''}>Go</button></div>
        </div>
      </div>
      <div class="col">
        <div class="panel"><h3>Recent results</h3>${last.length ? last.map(b => { const mine = b.h === G.userTeam; const my = mine ? b.sc[0] : b.sc[1], th = mine ? b.sc[1] : b.sc[0]; const o = G.teams[mine ? b.a : b.h]; return `<div class="row between" data-act="openBox" data-i="${lg.userBoxes.indexOf(b)}" tabindex="0" style="cursor:pointer;padding:3px 0"><span class="dim">${L.dateStr(b.day)}</span><span>${mine ? 'vs' : '@'} ${esc(o.abbr)}</span><b class="${my > th ? 'good' : 'bad'}">${my > th ? 'W' : 'L'} ${my}-${th}${b.ot ? ' (OT)' : ''}</b></div>`; }).join('') : '<div class="dim">No games played yet.</div>'}</div>
        <div class="panel"><h3>Your team</h3><div class="slots">${T.starters.map((id, i) => { const m = PB.BYID[id]; return `<div class="slot fill" data-act="inspect" data-id="${m.id}" tabindex="0"><span class="pos p${i}">${PB.POS[i]}</span>${UI.spr(m, 32)}<b class="grow">${esc(m.dispName)}</b>${UI.vis().O ? `<b>${m.ovr}</b>` : ''}</div>`; }).join('')}</div></div>
      </div></div>`;
  };

  // ---------------- SCHEDULE ----------------
  TAB.schedule = function (G, lg) {
    const tid = view.sched == null ? G.userTeam : view.sched;
    const games = lg.sched.filter(g => g.h === tid || g.a === tid).sort((a, b) => a.day - b.day);
    const sday = view.schedDay == null ? Math.min(lg.day, lg.lastDay) : view.schedDay;
    const dayGames = lg.sched.filter(g => g.day === sday);
    let w = 0, l = 0;
    return `<div class="layout2" style="--side:1fr">
      <div class="panel"><div class="row between"><h3>Team schedule</h3><select data-change="schedTeam">${G.teams.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Date</th><th></th><th>Opponent</th><th>Result</th><th class="n">Record</th></tr></thead><tbody>
        ${games.map((g, i) => { const home = g.h === tid; const o = G.teams[home ? g.a : g.h]; let res = '', rc = ''; if (g.done) { const my = home ? g.sc[0] : g.sc[1], th = home ? g.sc[1] : g.sc[0]; if (my > th) w++; else l++; res = `<b class="${my > th ? 'good' : 'bad'}">${my > th ? 'W' : 'L'} ${my}-${th}${g.ot ? ' OT' : ''}</b>`; rc = w + '-' + l; }
          return `<tr class="${g.day === lg.day ? 'me' : ''}"><td class="dim">${i + 1}</td><td>${L.dateStr(g.day)}</td><td>${home ? 'vs' : '@'}</td><td>${UI.teamLabel(G, o.id)}</td><td>${res || '<span class="dim">—</span>'}</td><td class="n">${rc}</td></tr>`; }).join('')}</tbody></table></div></div>
      <div class="panel"><div class="row between"><h3>Games by date</h3><div class="row"><button class="small" data-act="schedDay" data-d="-1">◀</button><b>${L.dateStr(sday)}</b><button class="small" data-act="schedDay" data-d="1">▶</button></div></div>
        <table class="t"><tbody>${dayGames.map(g => `<tr><td>${UI.teamLabel(G, g.a)}</td><td class="n">${g.done ? g.sc[1] : ''}</td><td>@</td><td>${UI.teamLabel(G, g.h)}</td><td class="n">${g.done ? g.sc[0] : ''}</td><td class="dim">${g.done ? 'F' + (g.ot ? '/OT' : '') : ''}</td></tr>`).join('') || '<tr><td class="dim">No games.</td></tr>'}</tbody></table>
        </div></div>`;
  };
  A.schedTeam = el => { view.sched = +el.value; UI.refresh(); };
  A.schedDay = (el, d) => { const lg = PB.G.league; const cur = view.schedDay == null ? Math.min(lg.day, lg.lastDay) : view.schedDay; view.schedDay = PB.clamp(cur + +d.d, 1, lg.lastDay); UI.refresh(); };

  // ---------------- STANDINGS ----------------
  TAB.standings = function (G, lg) {
    const hdr = `<thead><tr><th>#</th><th>Team</th><th class="n">W</th><th class="n">L</th><th class="n">PCT</th><th class="n">GB</th><th class="n">Home</th><th class="n">Away</th><th class="n">Conf</th><th class="n">Div</th><th class="n">PPG</th><th class="n">OPP</th><th class="n">DIFF</th><th class="n">STRK</th><th class="n">L10</th>${UI.vis().O ? '<th class="n">OVR</th>' : ''}</tr></thead>`;
    const table = (title, ids) => {
      const top = lg.rec[ids[0]];
      return `<div class="panel"><h3>${title}</h3><table class="t">${hdr}<tbody>${ids.map((id, i) => {
        const r = lg.rec[id], gp = r.w + r.l; const t = G.teams[id];
        const gb = ((top.w - r.w) + (r.l - top.l)) / 2;
        const l10 = r.last.reduce((a, b) => a + b, 0);
        return `<tr class="${t.user ? 'me' : ''}"><td class="dim">${i + 1}</td><td>${UI.teamLabel(G, id)}</td><td class="n">${r.w}</td><td class="n">${r.l}</td><td class="n">${gp ? (r.w / gp).toFixed(3).replace(/^0/, '') : '.000'}</td><td class="n">${i === 0 ? '-' : gb.toFixed(1)}</td>
          <td class="n">${r.hw}-${r.hl}</td><td class="n">${r.aw}-${r.al}</td><td class="n">${r.cw}-${r.cl}</td><td class="n">${r.dw}-${r.dl}</td>
          <td class="n">${gp ? (r.pf / gp).toFixed(1) : '-'}</td><td class="n">${gp ? (r.pa / gp).toFixed(1) : '-'}</td><td class="n ${r.pf >= r.pa ? 'good' : 'bad'}">${gp ? ((r.pf - r.pa) / gp).toFixed(1) : '-'}</td>
          <td class="n">${r.strk > 0 ? 'W' + r.strk : r.strk < 0 ? 'L' + -r.strk : '-'}</td><td class="n">${l10}-${r.last.length - l10}</td>${UI.vis().O ? `<td class="n">${PB.teamOvr(t).toFixed(1)}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>`;
    };
    let html = '';
    if (view.standMode === 'league') html = table('League', L.sortTeams(G, G.teams.map(t => t.id)));
    else if (view.standMode === 'div') for (const d of PB.DIVISIONS) html += table(d.conf + ' — ' + d.name + ' Division', L.divStandings(G, d.conf, d.name));
    else for (const c of ['East', 'West']) html += table(c + 'ern Conference', L.confStandings(G, c));
    return `<div class="row" style="margin-bottom:10px">${[['conf', 'Conference'], ['div', 'Division'], ['league', 'League']].map(([k, l]) => `<button class="${view.standMode === k ? 'primary' : ''}" data-act="standMode" data-m="${k}">${l}</button>`).join('')}</div><div class="col">${html}</div>`;
  };
  A.standMode = (el, d) => { view.standMode = d.m; UI.refresh(); };

  // ---------------- STATS ----------------
  const LEAD = [['ppg', 'Points', v => v.toFixed(1)], ['rpg', 'Rebounds', v => v.toFixed(1)], ['apg', 'Assists', v => v.toFixed(1)], ['spg', 'Steals', v => v.toFixed(2)], ['bpg', 'Blocks', v => v.toFixed(2)], ['fg', 'FG%', v => (v * 100).toFixed(1)], ['tp', '3P%', v => (v * 100).toFixed(1)]];
  TAB.stats = function (G, lg) {
    const sub = view.statsTab;
    const nav = `<div class="row wrap" style="margin-bottom:10px">${[['leaders', 'League leaders'], ['players', 'All players'], ['teams', 'Team stats']].map(([k, l]) => `<button class="${sub === k ? 'primary' : ''}" data-act="statsTab" data-t="${k}">${l}</button>`).join('')}
      <label class="dim"><input type="checkbox" ${view.statsPO ? 'checked' : ''} data-change="statsPO"> Playoffs</label></div>`;
    if (sub === 'leaders') {
      return nav + `<div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${LEAD.map(([k, lbl, f]) => {
        const rows = L.leaders(G, k, 8, view.statsPO);
        return `<div class="panel"><h3>${lbl}</h3>${rows.map((r, i) => { const m = PB.BYID[r.id]; const tid = G.claimed[r.id]; return `<div class="row between" data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer"><span>${i + 1}. ${UI.spr(m, 24)} ${esc(m.dispName)} <span class="dim">${esc(G.teams[tid].abbr)}</span></span><b>${f(r.v)}</b></div>`; }).join('') || '<div class="dim">No data yet.</div>'}</div>`;
      }).join('')}</div>`;
    }
    if (sub === 'players') {
      const map = view.statsPO ? lg.pstatsPO : lg.pstats;
      let rows = Object.keys(map).map(id => ({ id: +id, s: map[id] })).filter(r => r.s.gp > 0);
      const key = view.rosterSort;
      const val = r => { const s = r.s; return key === 'ppg' ? s.pts / s.gp : key === 'rpg' ? (s.oreb + s.dreb) / s.gp : key === 'apg' ? s.ast / s.gp : key === 'mpg' ? s.sec / s.gp : key === 'spg' ? s.stl / s.gp : key === 'bpg' ? s.blk / s.gp : key === 'pm' ? s.pm / s.gp : s.gp; };
      rows.sort((a, b) => val(b) - val(a));
      return nav + `<div class="panel"><div class="row" style="margin-bottom:6px"><span class="dim">Sort by</span><select data-change="rosterSort">${['ppg', 'rpg', 'apg', 'spg', 'bpg', 'mpg', 'pm', 'gp'].map(k => `<option ${key === k ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
        <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Pokémon</th><th>Team</th>${UI.vis().P ? '<th>Pos</th>' : ''}<th class="n">GP</th><th class="n">MPG</th><th class="n">PPG</th><th class="n">RPG</th><th class="n">APG</th><th class="n">SPG</th><th class="n">BPG</th><th class="n">TOV</th><th class="n">FG%</th><th class="n">3P%</th><th class="n">FT%</th><th class="n">+/-</th></tr></thead><tbody>
        ${rows.slice(0, 120).map((r, i) => { const m = PB.BYID[r.id], s = r.s, g = s.gp; const tid = G.claimed[r.id]; return `<tr class="${G.teams[tid].user ? 'me' : ''}"><td class="dim">${i + 1}</td><td>${UI.spr(m, 24)} <span data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer">${esc(m.dispName)}</span></td><td>${esc(G.teams[tid].abbr)}</td>${UI.vis().P ? `<td>${m.pos[0]}</td>` : ''}<td class="n">${g}</td><td class="n">${(s.sec / g / 60).toFixed(1)}</td><td class="n">${(s.pts / g).toFixed(1)}</td><td class="n">${((s.oreb + s.dreb) / g).toFixed(1)}</td><td class="n">${(s.ast / g).toFixed(1)}</td><td class="n">${(s.stl / g).toFixed(1)}</td><td class="n">${(s.blk / g).toFixed(1)}</td><td class="n">${(s.tov / g).toFixed(1)}</td><td class="n">${UI.pct(s.fgm, s.fga)}</td><td class="n">${UI.pct(s.tpm, s.tpa)}</td><td class="n">${UI.pct(s.ftm, s.fta)}</td><td class="n">${(s.pm / g).toFixed(1)}</td></tr>`; }).join('')}</tbody></table></div></div>`;
    }
    const rows = G.teams.map(t => ({ t, s: lg.tstats[t.id], g: lg.tgp[t.id], r: lg.rec[t.id] })).filter(r => r.g > 0).sort((a, b) => b.s.pts / b.g - a.s.pts / a.g);
    return nav + `<div class="panel"><table class="t"><thead><tr><th>Team</th><th class="n">W-L</th><th class="n">PPG</th><th class="n">FG%</th><th class="n">3P%</th><th class="n">FT%</th><th class="n">3PA</th><th class="n">REB</th><th class="n">AST</th><th class="n">STL</th><th class="n">BLK</th><th class="n">TOV</th></tr></thead><tbody>
      ${rows.map(({ t, s, g, r }) => `<tr class="${t.user ? 'me' : ''}"><td>${UI.teamLabel(G, t.id)}</td><td class="n">${r.w}-${r.l}</td><td class="n">${(s.pts / g).toFixed(1)}</td><td class="n">${UI.pct(s.fgm, s.fga)}</td><td class="n">${UI.pct(s.tpm, s.tpa)}</td><td class="n">${UI.pct(s.ftm, s.fta)}</td><td class="n">${(s.tpa / g).toFixed(1)}</td><td class="n">${((s.oreb + s.dreb) / g).toFixed(1)}</td><td class="n">${(s.ast / g).toFixed(1)}</td><td class="n">${(s.stl / g).toFixed(1)}</td><td class="n">${(s.blk / g).toFixed(1)}</td><td class="n">${(s.tov / g).toFixed(1)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  A.statsTab = (el, d) => { view.statsTab = d.t; UI.refresh(); };
  A.statsPO = el => { view.statsPO = el.checked; UI.refresh(); };
  A.rosterSort = el => { view.rosterSort = el.value; UI.refresh(); };

  // ---------------- PLAYOFFS ----------------
  TAB.playoffs = function (G, lg) {
    if (!lg.po) {
      const e = L.confStandings(G, 'East').slice(0, 8), w = L.confStandings(G, 'West').slice(0, 8);
      const list = (n, a) => `<div class="panel"><h3>${n} </h3>${a.map((id, i) => `<div class="row between"><span>${i + 1}. ${UI.teamLabel(G, id)}</span><span class="dim">${recStr(lg.rec[id])}</span></div>`).join('')}</div>`;
      return `<div class="layout2" style="--side:1fr">${list('East', e)}${list('West', w)}</div>`;
    }
    const po = lg.po;
    const ser = s => {
      const hiWin = s.w[0] === 4, loWin = s.w[1] === 4;
      const line = (id, seed, w, win) => `<div class="row between ${win ? 'w' : (hiWin || loWin) ? 'l' : ''}"><span>${seed ? '(' + seed + ') ' : ''}${UI.teamLabel(G, id)}</span><b>${w}</b></div>`;
      return `<div class="series">${line(s.hi, s.hiSeed, s.w[0], hiWin)}${line(s.lo, s.loSeed, s.w[1], loWin)}${s.games.length ? `<div class="dim" style="font-size:10px;margin-top:2px">${s.games.map(g => `${g.sc[0]}-${g.sc[1]}`).join(' · ')}</div>` : ''}</div>`;
    };
    const roundName = ['First Round', 'Conference Semifinals', 'Conference Finals', 'Finals'];
    const cols = [0, 1, 2, 3].map(i => `<div><h3>${roundName[i]}</h3>${(po.rounds[i] || []).map(ser).join('') || '<div class="dim">TBD</div>'}</div>`).join('');
    return `${lg.champion != null ? `<div class="panel center" style="border-color:var(--gold);margin-bottom:10px"><h2 class="gold">🏆 ${esc(G.teams[lg.champion].name)} are champions!</h2></div>` : ''}<div class="panel"><div class="bracket">${cols}</div></div>`;
  };

  // ---------------- AWARDS ----------------
  TAB.awards = function (G, lg) {
    lg.allStarSeen = true; lg.awardsSeen = !!lg.awards;
    const who = id => { if (id == null) return '<span class="dim">—</span>'; const m = PB.BYID[id], t = G.teams[G.claimed[id]]; return `<span data-act="inspect" data-id="${id}" tabindex="0" style="cursor:pointer;${t.user ? 'color:var(--gold);font-weight:700' : ''}">${UI.spr(m, 28)} ${esc(m.dispName)} <span class="dim">${esc(t.abbr)}</span></span>`; };
    const line = id => { const s = lg.pstats[id]; if (!s) return ''; const g = s.gp; return `<span class="dim" style="font-size:12px">${(s.pts / g).toFixed(1)} pts · ${((s.oreb + s.dreb) / g).toFixed(1)} reb · ${(s.ast / g).toFixed(1)} ast</span>`; };
    const list = ids => ids.map(id => `<div class="row between">${who(id)}${line(id)}</div>`).join('');
    let html = '';
    const A = lg.awards;
    if (A) {
      html += `<div class="panel"><h3>Season awards</h3>
        ${[['MVP', A.mvp], ['Defensive Player of the Year', A.dpoy], ['Sixth Pokémon of the Year', A.sixth], ['Scoring Title', A.scoring], ['Rebounding Title', A.rebounding], ['Assists Title', A.assists], ['Playoffs MVP', A.playoffMvp]].filter(x => x[1] != null).map(([n, id]) => `<div class="row between" style="padding:3px 0"><b style="min-width:230px">${n}</b>${who(id)}${line(id)}</div>`).join('')}</div>
        <div class="layout2" style="--side:1fr">
          <div class="panel">${['1st', '2nd', '3rd'].map((n, i) => `<h3 style="margin-top:${i ? 10 : 0}px">All-League ${n} Team</h3>${list(A.allLeague[i])}`).join('')}</div>
          <div class="panel">${['1st', '2nd'].map((n, i) => `<h3 style="margin-top:${i ? 10 : 0}px">All-Defensive ${n} Team</h3>${list(A.allDefense[i])}`).join('')}
            <h3 style="margin-top:10px">MVP voting</h3>${list(A.mvpVotes)}</div></div>`;
    }
    if (lg.allStar) {
      const a = lg.allStar;
      html += `<div class="panel" style="margin-top:12px"><h3>All-Star Game ${a.game ? `— East ${a.game.score[0]}, West ${a.game.score[1]}` : ''}</h3>
        ${a.game && a.game.mvp ? `<div style="margin-bottom:8px"><b>All-Star MVP</b> ${who(a.game.mvp)}</div>` : ''}
        <div class="layout2" style="--side:1fr">${['East', 'West'].map(c => `<div><h3>${c}</h3><div class="dim" style="font-size:11px">Starters</div>${list(a.squads[c].starters)}<div class="dim" style="font-size:11px;margin-top:6px">Reserves</div>${list(a.squads[c].reserves)}</div>`).join('')}</div></div>`;
    }
    return html || '<div class="panel dim">No awards yet.</div>';
  };

  // ---------------- BOX SCORES ----------------
  function boxTable(G, tid, boxArr) {
    const rows = Object.keys(boxArr).map(id => ({ id: +id, s: Array.isArray(boxArr[id]) ? L.unpackBox(boxArr[id]) : boxArr[id] })).sort((a, b) => b.s.sec - a.s.sec);
    const tot = PB.newStat(); rows.forEach(r => PB.STAT_KEYS.forEach(k => tot[k] += r.s[k]));
    return `<h3>${esc(G.teams[tid].name)}</h3><table class="t"><thead><tr><th>Pokémon</th><th class="n">MIN</th><th class="n">PTS</th><th class="n">FG</th><th class="n">3P</th><th class="n">FT</th><th class="n">REB</th><th class="n">AST</th><th class="n">STL</th><th class="n">BLK</th><th class="n">TO</th><th class="n">PF</th><th class="n">+/-</th></tr></thead><tbody>
      ${rows.map(r => { const m = PB.BYID[r.id], s = r.s; return `<tr><td>${UI.spr(m, 22)} ${esc(m.dispName)} <span class="dim">${UI.vis().P && G.teams[tid].starters.includes(m.id) ? m.pos[0] : ''}</span></td><td class="n">${Math.round(s.sec / 60)}</td><td class="n"><b>${s.pts}</b></td><td class="n">${s.fgm}-${s.fga}</td><td class="n">${s.tpm}-${s.tpa}</td><td class="n">${s.ftm}-${s.fta}</td><td class="n">${s.oreb + s.dreb}</td><td class="n">${s.ast}</td><td class="n">${s.stl}</td><td class="n">${s.blk}</td><td class="n">${s.tov}</td><td class="n">${s.pf}</td><td class="n">${s.pm > 0 ? '+' : ''}${s.pm}</td></tr>`; }).join('')}
      <tr style="font-weight:800"><td>Total</td><td class="n"></td><td class="n">${tot.pts}</td><td class="n">${tot.fgm}-${tot.fga} (${UI.pct(tot.fgm, tot.fga)}%)</td><td class="n">${tot.tpm}-${tot.tpa}</td><td class="n">${tot.ftm}-${tot.fta}</td><td class="n">${tot.oreb + tot.dreb}</td><td class="n">${tot.ast}</td><td class="n">${tot.stl}</td><td class="n">${tot.blk}</td><td class="n">${tot.tov}</td><td class="n">${tot.pf}</td><td></td></tr></tbody></table>`;
  }
  UI.boxModal = function (b) {
    const G = PB.G;
    const q = b.q;
    const qh = q[0].map((_, i) => `<th class="n">${i < 4 ? 'Q' + (i + 1) : 'OT' + (i - 3)}</th>`).join('');
    UI.modal(`<div class="row between"><h2 style="margin:0">${esc(G.teams[b.a].name)} @ ${esc(G.teams[b.h].name)} ${b.po ? '<span class="tag">PLAYOFFS</span>' : ''}</h2><button data-act="closeModal" autofocus>Close</button></div>
      <table class="t" style="max-width:420px;margin:8px 0"><thead><tr><th></th>${qh}<th class="n">T</th></tr></thead><tbody>
      <tr><td>${esc(G.teams[b.a].abbr)}</td>${q[1].map(x => `<td class="n">${x}</td>`).join('')}<td class="n"><b>${b.sc[1]}</b></td></tr>
      <tr><td>${esc(G.teams[b.h].abbr)}</td>${q[0].map(x => `<td class="n">${x}</td>`).join('')}<td class="n"><b>${b.sc[0]}</b></td></tr></tbody></table>
      ${boxTable(G, b.a, b.box[1])}<div style="height:10px"></div>${boxTable(G, b.h, b.box[0])}`);
  };
  TAB.boxes = function (G, lg) {
    const list = lg.userBoxes.map((b, i) => ({ b, i })).reverse();
    return `<div class="panel"><h3>Your games — click for the full box score</h3><table class="t"><thead><tr><th>Date</th><th></th><th>Opponent</th><th>Result</th><th>Top performer</th></tr></thead><tbody>
      ${list.map(({ b, i }) => { const mine = b.h === G.userTeam; const my = mine ? b.sc[0] : b.sc[1], th = mine ? b.sc[1] : b.sc[0]; const side = mine ? 0 : 1; const top = Object.keys(b.box[side]).map(id => ({ id, s: L.unpackBox(b.box[side][id]) })).sort((x, y) => y.s.pts - x.s.pts)[0];
        return `<tr data-act="openBox" data-i="${i}" tabindex="0" style="cursor:pointer"><td>${L.dateStr(b.day)}${b.po ? ' <span class="tag">PO</span>' : ''}</td><td>${mine ? 'vs' : '@'}</td><td>${UI.teamLabel(G, mine ? b.a : b.h)}</td><td><b class="${my > th ? 'good' : 'bad'}">${my > th ? 'W' : 'L'} ${my}-${th}${b.ot ? ' OT' : ''}</b></td><td class="dim">${top ? esc(PB.BYID[top.id].dispName) + ' ' + top.s.pts + ' pts' : ''}</td></tr>`; }).join('') || '<tr><td class="dim">No games played yet.</td></tr>'}</tbody></table></div>`;
  };
  A.openBox = (el, d) => UI.boxModal(PB.G.league.userBoxes[+d.i]);

  // ---------------- ROSTER ----------------
  TAB.roster = function (G, lg) {
    const T = G.teams[G.userTeam];
    const all = T.starters.concat(T.bench);
    return `<div class="row between wrap" style="margin-bottom:10px"><h2 style="margin:0">${esc(T.name)} roster</h2><button class="primary" data-act="editLineup">Lineup & strategy</button></div>
      <div class="panel"><table class="t"><thead><tr><th>Pokémon</th>${UI.vis().P ? '<th>Pos</th>' : ''}${UI.vis().O ? '<th class="n">OVR</th>' : ''}${UI.vis().A ? '<th>Archetype</th>' : ''}<th class="n">GP</th><th class="n">MPG</th><th class="n">PPG</th><th class="n">RPG</th><th class="n">APG</th><th class="n">SPG</th><th class="n">BPG</th><th class="n">FG%</th><th class="n">3P%</th></tr></thead><tbody>
      ${all.map((id, i) => { const m = PB.BYID[id], s = lg.pstats[id], g = s ? s.gp : 0; return `<tr><td>${UI.spr(m, 28)} <span data-act="inspect" data-id="${id}" tabindex="0" style="cursor:pointer"><b>${esc(m.dispName)}</b></span> ${i < 5 ? '<span class="tag good">START</span>' : ''}</td>${UI.vis().P ? `<td>${UI.posBadges(m)}</td>` : ''}${UI.vis().O ? `<td class="n"><b>${m.ovr}</b></td>` : ''}${UI.vis().A ? `<td class="dim">${m.archOff} / ${m.archDef}</td>` : ''}
        <td class="n">${g}</td><td class="n">${g ? (s.sec / g / 60).toFixed(1) : '-'}</td><td class="n">${g ? (s.pts / g).toFixed(1) : '-'}</td><td class="n">${g ? ((s.oreb + s.dreb) / g).toFixed(1) : '-'}</td><td class="n">${g ? (s.ast / g).toFixed(1) : '-'}</td><td class="n">${g ? (s.stl / g).toFixed(1) : '-'}</td><td class="n">${g ? (s.blk / g).toFixed(1) : '-'}</td><td class="n">${g ? UI.pct(s.fgm, s.fga) : '-'}</td><td class="n">${g ? UI.pct(s.tpm, s.tpa) : '-'}</td></tr>`; }).join('')}</tbody></table></div>`;
  };
  A.editLineup = () => UI.go('lineup', { ctx: 'hub' });

  // ---------------- SAVE ----------------
  TAB.save = function (G) {
    const slot = n => { const m = PB.Save.meta(n); return `<div class="panel row between"><div><b>Slot ${n}</b><div class="dim" style="font-size:12px">${m ? esc(m.team) + ' · ' + esc(m.phase) + ' ' + esc(m.rec || '') + ' · ' + new Date(m.t).toLocaleString() : 'Empty'}</div></div><div class="row"><button data-act="doSave" data-slot="${n}">Save here</button><button data-act="loadSlot" data-slot="${n}" ${m ? '' : 'disabled'}>Load</button></div></div>`; };
    return `<div class="col" style="max-width:700px">${slot(1)}${slot(2)}<div class="dim" style="font-size:12px">Seed ${G.seed}</div>
      <label><input type="checkbox" ${G.settings.autosave === false ? '' : 'checked'} data-change="toggleAuto"> Autosave to slot 1 after each game / sim</label></div>`;
  };
  A.doSave = (el, d) => { const r = PB.Save.save(PB.G, +d.slot); PB.toast(r.ok ? 'Saved to slot ' + d.slot + ' (' + Math.round(r.bytes / 1024) + ' KB)' : 'Save failed: ' + r.error, 3000); UI.refresh(); };
  A.toggleAuto = el => { PB.G.settings.autosave = el.checked; };
  const autosave = () => { if (PB.G.settings.autosave !== false) PB.Save.save(PB.G, 1); };

  // ---------------- SIM CONTROLS ----------------
  let simming = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function runSim(label, stepFn) {
    if (simming) return; simming = true;
    const G = PB.G, lg = G.league;
    const speed = +(PB.settings.simSpeed != null ? PB.settings.simSpeed : 1);
    UI.stopSim = false;
    UI.modal(`<div class="center"><h2>${esc(label)}</h2><div id="simprog" class="dim">Starting…</div><div class="meter" style="margin:12px 0"><i id="simbar" style="width:0%"></i></div><button data-act="stopSim">Stop</button></div>`);
    const per = speed === 0 ? 40 : speed === 1 ? 6 : 1, delay = speed === 0 ? 0 : speed === 1 ? 16 : speed === 2 ? 60 : 200;
    let guard = 0;
    try {
      while (!UI.stopSim && guard++ < 5000) {
        let finished = false;
        for (let i = 0; i < per && !finished; i++) finished = stepFn();
        const done = lg.sched.filter(g => g.done).length;
        const p = document.getElementById('simprog'); if (p) p.textContent = (lg.phase === 'regular' ? dayLabel(lg, Math.min(lg.day, lg.lastDay)) + ' · ' + done + '/' + lg.sched.length + ' games' : lg.phase === 'playoffs' ? 'Playoffs · round ' + lg.po.round : 'Season complete');
        const b = document.getElementById('simbar'); if (b) b.style.width = Math.min(100, done / lg.sched.length * 100) + '%';
        if (finished) break;
        await sleep(delay);
      }
    } catch (e) { console.error(e); PB.toast('Simulation error: ' + e.message, 5000); }
    simming = false;
    if (UI.modalOpen()) UI.closeModal();
    autosave();
    UI.refresh();
    if (lg.phase === 'done') PB.toast('Season complete!', 3000);
  }
  A.stopSim = () => { UI.stopSim = true; };
  A.simDays = (el, d) => {
    const G = PB.G, lg = G.league; let n = +d.n;
    // a "day" is a calendar day of the regular season; fast-forward through days without games too
    const target = lg.day + n;
    runSim('Simulating…', () => { if (lg.phase === 'done') return true; L.simDay(G, false); return lg.phase === 'done' || (lg.phase === 'regular' ? lg.day >= target : (n--, n <= 0)); });
  };
  A.simRest = () => { const G = PB.G; runSim('Simulating regular season…', () => { L.simDay(G, false); return G.league.phase !== 'regular'; }); };
  A.simAllSeason = () => { const G = PB.G; runSim('Simulating season…', () => { if (G.league.phase === 'done') return true; L.simDay(G, false); return G.league.phase === 'done'; }); };
  A.simToDate = () => {
    const G = PB.G, lg = G.league; const v = document.getElementById('simdate').value; if (!v) return;
    const target = L.dayFromISO(v);
    if (target <= lg.day) { PB.toast('Pick a date after today'); return; }
    runSim('Simulating to ' + L.dateStr(target) + '…', () => { L.simDay(G, false); return lg.phase !== 'regular' || lg.day >= target; });
  };
  A.toNextGame = () => {
    const G = PB.G, lg = G.league;
    runSim('Advancing to your next game…', () => { if (L.userGameToday(G) || lg.phase === 'done') return true; L.simDay(G, true); return !!L.userGameToday(G) || lg.phase === 'done'; });
  };
  A.simGame = () => {
    const G = PB.G, lg = G.league, ug = L.userGameToday(G);
    if (!ug) return;
    let res;
    if (lg.phase === 'playoffs') res = L.poPlay(G, ug); else res = L.simOne(G, ug, false);
    L.simDay(G, true);
    autosave();
    const b = lg.userBoxes[lg.userBoxes.length - 1];
    UI.refresh();
    if (b) UI.boxModal(b);
    if (lg.phase === 'done') PB.toast('Season complete!', 3000);
  };
  A.playGame = () => {
    const G = PB.G, ug = L.userGameToday(G);
    if (!ug) return;
    UI.pregame(G, ug);
  };

  // result handler for playable games
  UI.finishPlayed = function (G, ug, result) {
    const lg = G.league;
    if (lg.phase === 'playoffs') L.poPlay(G, ug, result); else L.record(G, ug, result, false);
    L.simDay(G, true);
    autosave();
    UI.go('hub', { tab: 'home' }, true);
    const b = lg.userBoxes[lg.userBoxes.length - 1];
    if (b) UI.boxModal(b);
    if (lg.phase === 'done') PB.toast('Season complete!', 3000);
  };
})(window.PB);
