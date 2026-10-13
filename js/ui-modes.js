// Quick play: 5v5 exhibition, 3v3 street ball, practice, local co-op and player lock, team builder, daily challenge.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions;
  const Q = { mode: '5v5', team: null, qMin: 5, target: 15, practice: 'range', diff: 'normal', legCap: 0 };
  const B = { q: '', type: 'ALL', gen: 'ALL', leg: 'ALL', sort: 'ovr', pos: 'ALL' };
  const TEAMS_KEY = 'poke82_teams';
  const loadTeams = () => { try { return JSON.parse(localStorage.getItem(TEAMS_KEY) || '[]'); } catch (e) { return []; } };
  const saveTeams = a => { try { localStorage.setItem(TEAMS_KEY, JSON.stringify(a)); } catch (e) { } };
  const need = () => Q.mode === 'practice' ? (Q.practice === 'range' ? 1 : 3) : Q.mode === '3v3' ? 5 : 12;
  const isLeg = m => m.leg || m.myth;
  const rnd = () => (Math.random() * 4294967296) >>> 0;

  // ---------- quick play menu ----------
  S.quick = {
    back() { UI.go('menu', {}, true); },
    render() {
      const n = need();
      if (Q.team && Q.team.length !== n) Q.team = Q.team.slice(0, n);
      const saved = loadTeams().filter(t => t.ids.length === n);
      const btn = (k, v, label) => `<button class="${Q[k] === v ? 'primary' : ''}" data-act="qSet" data-k="${k}" data-v="${v}">${label}</button>`;
      return `<div class="panel" style="max-width:820px;margin:16px auto"><h2>Quick Play</h2>
        <h3>Mode</h3>
        <div class="row wrap">${btn('mode', '5v5', '5v5 Exhibition')}${btn('mode', '3v3', '3v3 Street (half court)')}${btn('mode', 'practice', 'Practice')}</div>
        <div class="dim" style="font-size:12px;margin:4px 0 10px">${Q.mode === '5v5' ? 'Full game, full court, timeouts, fouls and free throws.' : Q.mode === '3v3' ? 'Half-court street ball: 1s and 2s, take it back after a change of possession, first to the target score.' : 'Work on your game without the pressure.'}</div>
        ${Q.mode === 'practice' ? `<div class="row wrap" style="margin-bottom:10px">${btn('practice', 'range', 'Shooting range (1 Pokémon, no defense)')}${btn('practice', 'scrim', 'Scrimmage vs. passive defenders (3 Pokémon)')}</div>` : ''}
        <h3>Your team <span class="dim" style="text-transform:none;font-weight:400">(${n} Pokémon)</span></h3>
        <div class="row wrap" style="margin-bottom:6px">${Q.team && Q.team.length ? Q.team.map(id => UI.spr(PB.BYID[id], 44)).join('') : '<span class="dim">Random AI-drafted team</span>'}</div>
        <div class="row wrap"><button class="gold" data-act="qBuild">Build my team</button><button data-act="qRandomTeam">Random picks</button>${Q.team ? '<button data-act="qClearTeam">Use an AI team</button>' : ''}</div>
        ${saved.length ? `<div style="margin-top:8px"><span class="dim">Saved teams:</span> ${saved.map((t, i) => `<button class="small" data-act="qLoadTeam" data-i="${loadTeams().indexOf(t)}">${esc(t.name)}</button>`).join(' ')}</div>` : ''}
        <h3 style="margin-top:14px">Options</h3>
        <div class="row wrap">
          ${Q.mode === '5v5' ? `<label>Quarter length <select data-change="qOpt" data-k="qMin">${[2, 3, 5, 8, 12].map(v => `<option ${Q.qMin === v ? 'selected' : ''}>${v}</option>`).join('')}</select> min</label>` : ''}
          ${Q.mode === '3v3' ? `<label>Play to <select data-change="qOpt" data-k="target">${[7, 11, 15, 21].map(v => `<option ${Q.target === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` : ''}
          <label>Difficulty <select data-change="qOpt" data-k="diff">${['easy', 'normal', 'hard', 'legend'].map(v => `<option ${Q.diff === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Legendaries per team <select data-change="qOpt" data-k="legCap">${[[0, 'no limit'], [1, 'max 1'], [2, 'max 2'], [3, 'max 3']].map(([v, l]) => `<option value="${v}" ${Q.legCap === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        </div>
        <div class="row" style="margin-top:14px"><button class="primary" data-act="qStart" autofocus>Continue</button><button data-act="goMenu">Back</button></div>
      </div>`;
    },
  };
  A.qSet = (el, d) => { Q[d.k] = d.v; UI.refresh(); };
  A.qOpt = (el, d) => { Q[d.k] = isNaN(+el.value) ? el.value : +el.value; };
  A.qClearTeam = () => { Q.team = null; UI.refresh(); };
  A.qBuild = () => { B.ids = (Q.team || []).slice(); UI.go('builder', {}); };
  A.qRandomTeam = () => {
    const pool = PB.MONS.filter(m => !m.from_ || true);
    const ids = [], n = need();
    let tries = 0;
    while (ids.length < n && tries++ < 2000) { const m = pool[Math.floor(Math.random() * pool.length)]; if (ids.includes(m.id)) continue; if (Q.legCap && isLeg(m) && ids.filter(i => isLeg(PB.BYID[i])).length >= Q.legCap) continue; ids.push(m.id); }
    Q.team = ids; UI.refresh();
  };
  A.qLoadTeam = (el, d) => { const t = loadTeams()[+d.i]; if (t) { Q.team = t.ids.slice(); UI.refresh(); } };

  // ---------- team builder ----------
  S.builder = {
    back() { Q.team = B.ids.length === need() ? B.ids.slice() : Q.team; UI.go('quick', {}, true); },
    render() {
      const n = need(), ids = B.ids, v = UI.vis();
      let list = PB.MONS.filter(m => !ids.includes(m.id));
      if (B.type !== 'ALL') list = list.filter(m => m.types.includes(B.type));
      if (B.gen !== 'ALL') list = list.filter(m => m.gen === +B.gen);
      if (B.pos !== 'ALL') list = list.filter(m => m.pos[0] === B.pos);
      if (B.leg === 'LEG') list = list.filter(isLeg); else if (B.leg === 'NON') list = list.filter(m => !isLeg(m));
      if (B.q) { const q = B.q.toLowerCase(); list = list.filter(m => m.name.includes(q)); }
      const val = m => B.sort === 'ovr' ? m.ovr : B.sort === 'bst' ? m.bst : B.sort === 'id' ? -m.id : (m.r[B.sort] || 0);
      list.sort((a, b) => val(b) - val(a) || a.id - b.id);
      const legN = ids.filter(i => isLeg(PB.BYID[i])).length, capHit = Q.legCap && legN >= Q.legCap;
      const rows = list.slice(0, 60).map(m => { const blocked = ids.length >= n || (capHit && isLeg(m)); return `<tr><td><span data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 28)} <b>${esc(m.dispName)}</b></span>${isLeg(m) ? ' <span class="tag leg">LEG</span>' : ''}</td><td>${UI.posBadges(m)}</td><td class="n"><b>${m.ovr}</b></td><td class="n">${m.r.three}</td><td class="n">${m.r.dunk}</td><td class="n">${m.r.pass}</td><td class="n">${m.r.handle}</td><td class="n">${m.r.speed}</td><td class="n">${m.r.intD}</td><td class="n">${m.r.perD}</td><td class="dim" style="font-size:11px">${esc(PB.Abil.describe(m.id).badge)}</td><td><button class="small primary" data-act="bAdd" data-id="${m.id}" ${blocked ? 'disabled' : ''}>Add</button></td></tr>`; }).join('');
      return `<div class="row between wrap" style="margin-bottom:8px"><div><h2 style="margin:0">Build your team</h2><div class="dim">${ids.length}/${n} chosen${Q.legCap ? ' · legendaries ' + legN + '/' + Q.legCap : ''}</div></div>
        <div class="row wrap"><button data-act="bRandom">Fill randomly</button><button data-act="bBest">Fill with the best</button><button data-act="bClear">Clear</button><button data-act="bSave" ${ids.length === n ? '' : 'disabled'}>Save team</button><button class="gold" data-act="bDone" ${ids.length === n ? '' : 'disabled'}>Done</button></div></div>
      <div class="layout2" style="--side:300px"><div class="panel">
        <div class="row wrap" style="margin-bottom:8px"><select data-change="bF" data-k="type"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${B.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-change="bF" data-k="gen"><option value="ALL">All regions</option>${Object.entries(PB.REGIONS).map(([g, nm]) => `<option value="${g}" ${B.gen == g ? 'selected' : ''}>${nm}</option>`).join('')}</select>
          <select data-change="bF" data-k="pos"><option value="ALL">All positions</option>${PB.POS.map(p => `<option ${B.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
          <select data-change="bF" data-k="leg"><option value="ALL">All</option><option value="LEG" ${B.leg === 'LEG' ? 'selected' : ''}>Legendary</option><option value="NON" ${B.leg === 'NON' ? 'selected' : ''}>Non-legendary</option></select>
          <select data-change="bF" data-k="sort">${[['ovr', 'Overall'], ['bst', 'Base stats'], ['three', '3PT'], ['dunk', 'Dunk'], ['pass', 'Passing'], ['handle', 'Handling'], ['speed', 'Speed'], ['intD', 'Interior D'], ['perD', 'Perimeter D'], ['id', 'Dex #']].map(([k, l]) => `<option value="${k}" ${B.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <input type="text" id="bq" placeholder="search…" value="${esc(B.q)}" oninput="PB.UI.bSearch(this.value)"></div>
        <div class="scroll"><table class="t"><thead><tr><th>Pokémon</th><th>Pos</th><th class="n">OVR</th><th class="n">3PT</th><th class="n">DNK</th><th class="n">PAS</th><th class="n">HDL</th><th class="n">SPD</th><th class="n">INT</th><th class="n">PER</th><th>Badge</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>
        <div class="panel"><h3>Your team</h3><div class="slots">${Array.from({ length: n }, (_, i) => { const id = ids[i], m = id != null ? PB.BYID[id] : null; return m ? `<div class="slot fill"><span class="dim" style="width:20px;font-size:11px">${i < (n === 12 ? 5 : n === 5 ? 3 : n) ? 'S' : 'B'}</span>${UI.spr(m, 34)}<div class="grow"><b>${esc(m.dispName)}</b><div class="dim" style="font-size:10px">${m.pos[0]} · ${m.ovr}</div></div><button class="small ghost" data-act="bRemove" data-id="${id}">✕</button></div>` : `<div class="slot"><span class="dim">empty</span></div>`; }).join('')}</div>
          <div class="dim" style="font-size:11px;margin-top:6px">Starters are chosen automatically from your best fit.</div></div></div>`;
    },
  };
  UI.bSearch = q => { B.q = q; UI.refresh(); const el = document.getElementById('bq'); if (el) { el.focus(); el.setSelectionRange(q.length, q.length); } };
  A.bF = (el, d) => { B[d.k] = el.value; UI.refresh(); };
  A.bAdd = (el, d) => { if (B.ids.length < need()) B.ids.push(+d.id); UI.refresh(); };
  A.bRemove = (el, d) => { B.ids = B.ids.filter(x => x !== +d.id); UI.refresh(); };
  A.bClear = () => { B.ids = []; UI.refresh(); };
  function fill(best) {
    const n = need(); const ids = B.ids.slice();
    let pool = PB.MONS.filter(m => !ids.includes(m.id));
    if (best) pool.sort((a, b) => b.ovr - a.ovr); else pool = pool.sort(() => Math.random() - 0.5);
    for (const m of pool) { if (ids.length >= n) break; if (Q.legCap && isLeg(m) && ids.filter(i => isLeg(PB.BYID[i])).length >= Q.legCap) continue; ids.push(m.id); }
    B.ids = ids; UI.refresh();
  }
  A.bRandom = () => fill(false);
  A.bBest = () => fill(true);
  A.bSave = () => { const nm = prompt('Name this team', 'My team'); if (!nm) return; const t = loadTeams(); t.push({ name: nm.slice(0, 20), ids: B.ids.slice() }); saveTeams(t); PB.toast('Team saved'); };
  A.bDone = () => { Q.team = B.ids.slice(); UI.go('quick', {}, true); };

  // ---------- building the match ----------
  function topIds(team, k) { return team.roster.slice().sort((a, b) => PB.BYID[b].ovr - PB.BYID[a].ovr).slice(0, k); }
  function buildGame(seed) {
    const n = need();
    const G = PB.newGame(seed, 'main', 30, 0);
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: Q.diff });
    const all = G.teams.map(t => t.id), mine = Q.team && Q.team.length === n ? Q.team.slice() : null;
    if (mine) for (const id of mine) PB.Registry.claim(G, id, 0);
    PB.aiDraftRounds(G, G.rng, mine ? all.slice(1) : all, 0);
    const T0 = G.teams[0], opp = 1 + (seed % 29), O = G.teams[opp];
    if (Q.mode === '5v5') { if (mine) PB.autoLineup(T0); }
    else {
      const k = Q.mode === '3v3' ? 5 : (Q.practice === 'range' ? 1 : 3);
      const mineIds = mine || topIds(T0, k);
      const sorted = mineIds.slice().sort((a, b) => PB.BYID[b].ovr - PB.BYID[a].ovr);
      if (Q.mode === '3v3') { T0.starters = sorted.slice(0, 3); T0.bench = sorted.slice(3, 5); }
      else if (Q.practice === 'range') { T0.starters = sorted.slice(0, 1); T0.bench = []; }
      else { T0.starters = sorted.slice(0, 3); T0.bench = []; }
      const oi = topIds(O, 5);
      if (Q.mode === '3v3') { O.starters = oi.slice(0, 3); O.bench = oi.slice(3, 5); }
      else if (Q.practice === 'range') { O.starters = []; O.bench = []; }
      else { O.starters = oi.slice(0, 3); O.bench = []; }
    }
    PB.G = G;
    return { G, opp };
  }

  const QS = { lock: -1, coop: -1 };
  A.qStart = () => {
    const seed = rnd();
    let built;
    try { built = buildGame(seed); } catch (e) { console.error(e); PB.toast('Could not build the match: ' + e.message, 4000); return; }
    UI.quickPregame(built);
  };
  UI.quickPregame = function (built) {
    const { G, opp } = built, T = G.teams[0], O = G.teams[opp];
    QS.lock = -1; QS.coop = -1;
    const s = PB.settings;
    const slotName = i => `${PB.POS[i] && Q.mode === '5v5' ? PB.POS[i] + ' · ' : ''}${esc(PB.BYID[T.starters[i]].dispName)}`;
    const lockSel = `<option value="-1">Follow the ball (default)</option>${T.starters.map((id, i) => `<option value="${i}">${slotName(i)}</option>`).join('')}`;
    const coopSel = `<option value="-1">Off</option>${T.starters.map((id, i) => `<option value="${i}">${slotName(i)}</option>`).join('')}`;
    UI.modal(`<h2>${esc(T.name)} ${Q.mode === 'practice' ? '— practice' : 'vs ' + esc(O.name)}</h2>
      <div class="row wrap" style="margin:6px 0">${T.starters.map(id => `<div class="center" style="width:70px">${UI.spr(PB.BYID[id], 52)}<div style="font-size:11px">${esc(PB.BYID[id].dispName)}</div><div class="dim" style="font-size:10px">${esc(PB.Abil.describe(id).badge)}</div></div>`).join('')}</div>
      ${Q.mode !== 'practice' ? `<div class="row wrap" style="margin:6px 0">${O.starters.map(id => `<div class="center" style="width:70px;opacity:.85">${UI.spr(PB.BYID[id], 44)}<div style="font-size:10px">${esc(PB.BYID[id].dispName)}</div></div>`).join('')}</div>` : ''}
      <div class="col">
        <label>Player lock <select id="q-lock">${lockSel}</select></label>
        <label>Co-op: a second controller plays <select id="q-coop">${coopSel}</select></label>
        <div class="dim" style="font-size:12px">Player lock keeps you on one Pokémon (the rest of your team is AI). Co-op needs a second gamepad: it controls the Pokémon chosen here while you control your locked one.</div>
        <label>Camera <select id="q-cam"><option value="behind" ${s.camera !== 'broadcast' ? 'selected' : ''}>2K (behind the play)</option><option value="broadcast" ${s.camera === 'broadcast' ? 'selected' : ''}>Broadcast</option></select></label>
      </div>
      <div class="row wrap" style="margin-top:12px"><button class="gold" data-act="qTip" autofocus>${Q.mode === 'practice' ? 'Start practice' : 'Tip off'}</button><button data-act="closeModal">Cancel</button></div>`);
    UI._qb = built;
  };
  A.qTip = () => {
    const built = UI._qb; if (!built) return;
    const { G, opp } = built, T = G.teams[0];
    const lock = +document.getElementById('q-lock').value, coop = +document.getElementById('q-coop').value;
    PB.settings.camera = document.getElementById('q-cam').value; PB.Save.settingsSave(PB.settings);
    let ctrls = [{ side: 0 }];
    if (coop >= 0) {
      if (lock === coop) { PB.toast('Pick two different Pokémon for the two players'); return; }
      const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(p => p && p.connected);
      if (pads.length < 2) { PB.toast('Connect a second controller for co-op', 3500); return; }
      const p1 = lock >= 0 ? lock : [0, 1, 2, 3, 4].find(i => i !== coop && i < T.starters.length);
      ctrls = [{ side: 0, lock: p1 }, { side: 0, lock: coop }];
    } else if (lock >= 0) ctrls = [{ side: 0, lock }];
    UI.closeModal();
    const mopts = { oppId: opp, userHome: true, quarterMin: Q.qMin, ctrls, mode: Q.mode === '5v5' ? 'std' : Q.mode === '3v3' ? '3v3' : 'practice', target: Q.target, timeouts: Q.mode === '5v5' ? 5 : 0 };
    if (Q.mode === 'practice') { mopts.sizes = Q.practice === 'range' ? [1, 0] : [3, 3]; mopts.passive = Q.practice === 'scrim'; }
    UI.launchMatch(G, mopts, {
      onEnd: (res, m, forfeit) => {
        UI.go('quick', {}, true);
        if (res && Q.mode !== 'practice') {
          const b = { day: 0, h: m.userHome ? m.teams[0].id : m.teams[1].id, a: m.userHome ? m.teams[1].id : m.teams[0].id, sc: res.score, q: res.q, ot: res.ot, shots: res.shots, box: [0, 1].map(s => { const o = {}; for (const id in res.box[s]) { const x = res.box[s][id]; if (x.sec > 0) o[id] = PB.STAT_KEYS.map(k => x[k]); } return o; }) };
          UI.boxModal(b);
        } else if (Q.mode === 'practice') { const ps = m.pstat || { att: 0, green: 0 }; const u = m.gs(0).court[0]; PB.toast('Practice done: ' + u.st.fgm + '/' + u.st.fga + ' made, ' + ps.green + ' green releases', 4500); }
      },
    });
  };

  // ---------- daily challenge ----------
  const DKEY = 'poke82_daily';
  // the Daily follows the player's own calendar day (everyone with the same date gets the same draft)
  const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  PB.localDay = ymd;
  // how the season ended for the user's team, including how far the playoff run went ("Lost in the conference finals")
  const runResult = PB.runResult = G => {
    const lg = G.league, ut = G.userTeam;
    if (lg.champion === ut) return 'Champions';
    if (!lg.po) return 'Missed playoffs';
    let made = false, exit = 0, last = 0;
    lg.po.rounds.forEach((r, i) => r.forEach(s => { if (s.hi !== ut && s.lo !== ut) return; made = true; last = i + 1; const mine = s.hi === ut ? 0 : 1; if (s.w[mine] < (s.need || 4) && s.w[1 - mine] >= (s.need || 4)) exit = i + 1; }));
    if (!made) return 'Missed playoffs';
    const nm = PB.Report && PB.Report.ROUNDS ? PB.Report.ROUNDS(lg.po, exit || last) : 'round ' + (exit || last);
    return 'Lost in ' + nm;
  };
  const dayStr = () => ymd(new Date());
  const loadDaily = () => { try { return JSON.parse(localStorage.getItem(DKEY) || '{}'); } catch (e) { return {}; } };
  const daySeed = d => [...('pokehoops-' + d)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  S.daily = {
    back() { UI.go('menu', {}, true); },
    render() {
      const d = dayStr(), hist = loadDaily(), today = hist[d];
      const dates = Object.keys(hist).sort().reverse().slice(0, 12);
      let streak = 0; { const t = new Date(); for (;;) { const k = ymd(t); if (hist[k]) { streak++; t.setDate(t.getDate() - 1); } else break; } }
      return `<div class="panel" style="max-width:700px;margin:16px auto"><h2>Daily Challenge · ${d}</h2>
        <div class="dim" style="margin-bottom:10px">Same draft rolls for everyone today. Your team plays its season automatically.</div>
        ${(() => { const k = PB.dailyMod(d), M = k && PB.MODS[k]; return `<div class="panel" style="background:var(--bg2);margin-bottom:10px"><b class="gold">Today's modifier:</b> ${M ? `<b>${esc(M.name)}</b> <span class="dim">${esc(M.desc)}</span>` : '<span class="dim">None, a standard draft</span>'}</div>`; })()}
        ${today ? '' : `<label style="display:block;margin-bottom:10px"><input type="checkbox" ${(PB.settings || {}).challengeMode ? 'checked' : ''} data-change="dailyChal"> <b>Hide the suggested positions</b> <span class="dim">while you draft</span></label>`}
        <div class="kpi"><div><b>${streak}</b><span>Day streak</span></div><div><b>${today ? today.w + '-' + today.l : '—'}</b><span>Today</span></div><div><b>${dates.length ? Math.max(...dates.map(k => hist[k].w)) : '—'}</b><span>Best wins</span></div></div>
        <div class="row" style="margin-top:12px">${today ? `<button class="primary" data-act="dailyCopy" data-d="${d}" autofocus>Copy today's result</button>${hist[d] && hist[d].snap ? UI.teamCardButtonSaved('daily', d, '🖼 Team card') : ''}<button disabled>Come back tomorrow for a new draft</button>` : '<button class="primary" data-act="dailyStart" autofocus>Start the challenge</button>'}<button data-act="goMenu">Back</button></div>
        ${dates.length ? `<h3 style="margin-top:14px">History</h3>${dates.map(k => `<div class="row between"><span>${k}</span><span>${hist[k].w}-${hist[k].l}</span><span class="dim">${esc(hist[k].res)}</span><span>${hist[k].snap ? UI.teamCardButtonSaved('daily', k) : ''}<button class="small" data-act="dailyCopy" data-d="${k}">Copy code</button></span></div>`).join('')}` : ''}</div>`;
    },
  };
  const DLINK = 'https://poke82-beta.vercel.app/';
  const dailyCode = (d, r) => { const k = r.mod !== undefined ? r.mod : PB.dailyMod(d), M = k && PB.MODS[k], tags = (M ? [M.name] : []).concat(r.chal ? ['Hidden positions'] : []); return `PokeHoops 82 ${r.endless ? 'Endless Draft' : 'Daily ' + d}${tags.length ? ' [' + tags.join(' · ') + ']' : ''}: ${r.w}-${r.l}, ${r.res}${r.endless && r.seed != null ? '\nSeed ' + r.seed : ''}\n${DLINK}`; };
  // a team card for a finished run, straight from the saved history (works after going back to the menu or reloading)
  A.runCard = (el, d) => {
    const e = d.kind === 'endless', h = e ? loadEndless()[+d.k] : loadDaily()[d.k]; if (!h || !h.snap) { PB.toast('No lineup saved for that run'); return; }
    UI.teamCard(null, { snap: h.snap, anon: true, title: h.w + '-' + h.l + ' · ' + h.res, foot: e ? 'Endless Draft' : 'Daily ' + d.k });
  };
  A.dailyChal = el => { PB.settings = PB.settings || {}; PB.settings.challengeMode = el.checked; PB.Save.settingsSave(PB.settings); };
  A.dailyCopy = (el, d) => { const r = loadDaily()[d.d]; if (!r) return; (navigator.clipboard ? navigator.clipboard.writeText(dailyCode(d.d, r)) : Promise.reject()).then(() => PB.toast('Result copied'), () => PB.toast(dailyCode(d.d, r).replace(/\n/g, ' '), 6000)); };
  A.dailyStart = () => {
    if (loadDaily()[dayStr()]) { PB.toast("You already played today's challenge. Come back tomorrow!", 3500); return; }
    const d = dayStr(), seed = daySeed(d);
    const G = PB.newGame(seed, 'main', 30, (seed >>> 3) % 30);
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal' });
    const mod = PB.dailyMod(d), MD = mod && PB.MODS[mod];
    G.rules = { legCap: (MD && MD.rules && MD.rules.legCap) || 0, mod: mod || null };
    G.challenge = !!(PB.settings && PB.settings.challengeMode);
    G.daily = { date: d, games: 82, mod: mod || null, chal: G.challenge };
    const T = G.teams[G.userTeam]; T.city = 'Daily'; T.nick = d.slice(5); T.name = T.city + ' ' + T.nick;
    PB.G = G; UI.stack = [];
    G.draft = { phase: 'starters', pick: 0, roll: null, cands: null, picked: [], rerolls: { region: 1, type: 1 } };
    UI.go('draft', {}, true);
  };
  PB.onSeasonDone = function (G) {
    if (!G.daily) return;
    if (G.daily.endless) {
      const lg = G.league, r = lg.rec[G.userTeam], res = runResult(G);
      const h = loadEndless(); const T0 = G.teams[G.userTeam]; h.unshift({ t: Date.now(), w: r.w, l: r.l, res, snap: { s: T0.starters.slice(0, 5), b: T0.bench.slice(0, 7) }, mod: G.daily.mod || null, chal: !!G.daily.chal, seed: G.daily.seed }); h.length = Math.min(h.length, 30);
      try { localStorage.setItem(EKEY, JSON.stringify(h)); } catch (e) { }
      return;
    }
    const lg = G.league, r = lg.rec[G.userTeam], hist = loadDaily();
    const res = runResult(G);
    const cur = hist[G.daily.date];
    const T0 = G.teams[G.userTeam];
    if (!cur) hist[G.daily.date] = { w: r.w, l: r.l, res, snap: { s: T0.starters.slice(0, 5), b: T0.bench.slice(0, 7) }, mod: G.daily.mod || null, chal: !!G.daily.chal, team: G.teams[G.userTeam].starters.slice(0, 3).map(id => PB.BYID[id].dispName).join('/') };
    try { localStorage.setItem(DKEY, JSON.stringify(hist)); } catch (e) { }
  };
  // ---------- daily challenge: the season plays out on screen ----------
  const D = { G: null, pts: [], stage: '', iv: null };
  const dailyRes = G => runResult(G);
  UI.dailyBegin = function (G) { clearInterval(D.iv); D.G = G; D.pts = [0]; D.stage = 'reg'; D.lastGp = 0; UI.go('dailysim', {}, true); };
  const chartSvg = () => {
    const pts = D.pts, W = 640, H = 190, n = D.G.league.games || 82, mx = Math.max(8, ...pts.map(Math.abs)) + 2;
    const X = i => 10 + i / n * (W - 20), Y = v => H / 2 - v / mx * (H / 2 - 12);
    const d = pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ');
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:700px;background:var(--bg2);border-radius:8px"><line x1="10" x2="${W - 10}" y1="${H / 2}" y2="${H / 2}" stroke="#667" stroke-dasharray="4 4"/><text x="14" y="14" fill="#8a93a8" font-size="11">above .500</text><text x="14" y="${H - 6}" fill="#8a93a8" font-size="11">below .500</text><path d="${d}" fill="none" stroke="${last >= 0 ? '#2fd47a' : '#ff5a5f'}" stroke-width="2.5"/><circle cx="${X(pts.length - 1)}" cy="${Y(last)}" r="4" fill="#ffcb05"/></svg>`;
  };
  const bracketHtml = () => {
    const G = D.G, po = G.league.po; if (!po) return '';
    const ab = id => id == null ? '?' : `<span style="${id === G.userTeam ? 'color:var(--gold);font-weight:800' : ''}">${esc(G.teams[id].abbr)}</span>`;
    return `<div class="bracket" style="grid-template-columns:repeat(${po.rounds.length},1fr);margin-top:10px">${po.rounds.map((r, i) => `<div><h3>${['Round 1', 'Semifinals', 'Conf. Finals', 'Finals'][i] || 'Round ' + (i + 1)}</h3>${r.map(s => `<div class="series"><div class="row between ${s.w[0] === (s.need || 4) ? 'w' : ''}"><span>(${s.hiSeed}) ${ab(s.hi)}</span><b>${s.w[0]}</b></div><div class="row between ${s.w[1] === (s.need || 4) ? 'w' : ''}"><span>(${s.loSeed}) ${ab(s.lo)}</span><b>${s.w[1]}</b></div></div>`).join('') || '<div class="dim">TBD</div>'}</div>`).join('')}</div>`;
  };
  const runRes = (G, r, res) => ({ w: r.w, l: r.l, res, mod: G.daily.mod || null, chal: !!G.daily.chal, endless: !!G.daily.endless, seed: G.daily.seed });
  function dailyDraw() {
    const G = D.G, lg = G.league, r = lg.rec[G.userTeam], el = document.getElementById('dl-body'); if (!el) return;
    const mine = r.w + '-' + r.l;
    let head = '', foot = '';
    if (D.stage === 'reg') head = `<div class="dim">Regular season · game ${r.w + r.l} of ${lg.games}</div>`;
    else if (D.stage === 'regdone') {
      const inPo = lg.po && Object.values(lg.po.seeds).some(a => a.includes(G.userTeam));
      head = `<div class="gold" style="font-weight:700">Regular season complete: ${mine}</div><div>${inPo ? 'You made the playoffs!' : 'You missed the playoffs.'}</div>`;
      foot = `<div class="row" style="margin-top:12px"><button class="primary" data-act="dailyPlayoffs" autofocus>${inPo ? 'Sim the playoffs' : 'Sim the rest of the season'}</button></div>`;
    } else if (D.stage === 'po') head = `<div class="dim">Playoffs · day ${lg.day}</div>`;
    else {
      const res = dailyRes(G);
      head = `<div class="gold" style="font-weight:800;font-size:18px">${res === 'Champions' ? '🏆 Champions!' : res}</div>`;
      foot = `<div class="panel" style="margin-top:10px;white-space:pre-line;font-family:monospace">${esc(dailyCode(G.daily.date, runRes(G, r, res)))}</div>
        <div class="row" style="margin-top:10px"><button class="primary" data-act="dailyCopyRun" autofocus>Copy result</button><button data-act="teamCard" data-tid="${G.userTeam}" data-daily="1" data-title="${esc(r.w + '-' + r.l + ' · ' + res)}" data-foot="${G.daily.endless ? 'Endless Draft' : 'Daily ' + G.daily.date}">🖼 Team card</button><button data-act="dailyLeague">View the league</button>${G.daily.endless ? '<button class="gold" data-act="goEndless">Draft again</button>' : ''}<button data-act="goMenu">Back to menu</button></div>`;
    }
    el.innerHTML = `<div style="font-size:34px;font-weight:900;margin:4px 0">${mine}</div>${head}<div style="margin-top:8px">${chartSvg()}</div>${D.stage === 'reg' ? '' : bracketHtml()}${foot}`;
  }
  function dailyTick() {
    if (UI.cur !== 'dailysim') { clearInterval(D.iv); return; }
    const G = D.G, lg = G.league;
    if (D.stage === 'reg') {
      for (let k = 0; k < 2 && lg.phase === 'regular'; k++) {
        PB.League.simDay(G, false);
        const r = lg.rec[G.userTeam], gp = r.w + r.l;
        if (gp > D.lastGp) { D.lastGp = gp; D.pts.push(r.w - r.l); }
      }
      if (lg.phase !== 'regular') { D.stage = 'regdone'; clearInterval(D.iv); }
    } else if (D.stage === 'po') {
      if (lg.phase !== 'done') PB.League.simDay(G, false);
      if (lg.phase === 'done') { D.stage = 'done'; clearInterval(D.iv); }
    }
    dailyDraw();
  }
  S.dailysim = {
    back() { clearInterval(D.iv); UI.go('menu', {}, true); },
    render() { return `<div class="panel" style="max-width:760px;margin:12px auto"><h2>${D.G && D.G.daily.endless ? 'Endless Draft' : 'Daily Challenge · ' + (D.G ? D.G.daily.date : '')}</h2><div id="dl-body"></div></div>`; },
    mount() { dailyDraw(); clearInterval(D.iv); if (D.stage === 'reg') D.iv = setInterval(dailyTick, 60); else if (D.stage === 'po') D.iv = setInterval(dailyTick, 650); },
  };
  A.dailyPlayoffs = () => { D.stage = 'po'; clearInterval(D.iv); D.iv = setInterval(dailyTick, 650); dailyDraw(); };
  A.dailyCopyRun = () => { const G = D.G, r = G.league.rec[G.userTeam], t = dailyCode(G.daily.date, runRes(G, r, dailyRes(G))); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => PB.toast('Result copied'), () => PB.toast(t.replace(/\n/g, ' '), 6000)); };
  A.dailyLeague = () => { UI.stack = []; UI.go('hub', { tab: 'home' }, true); };
  const homeTab = UI.hubTabs.home;
  UI.hubTabs.home = function (G, lg, p) {
    const html = homeTab(G, lg, p);
    if (!G.daily || lg.phase !== 'done') return html;
    const rr = lg.rec[G.userTeam], rs = dailyRes(G), code = G.daily.endless ? dailyCode('', runRes(G, rr, rs)) : (loadDaily()[G.daily.date] ? dailyCode(G.daily.date, loadDaily()[G.daily.date]) : '');
    return `<div class="panel" style="border-color:var(--gold);margin-bottom:12px"><b class="gold">${G.daily.endless ? 'Endless Draft' : 'Daily Challenge ' + G.daily.date}</b> <div style="white-space:pre-line">${esc(code)}</div></div>` + html;  };

  // ---------- endless draft: the daily challenge with no limit ----------
  const EKEY = 'poke82_endless';
  const loadEndless = () => { try { return JSON.parse(localStorage.getItem(EKEY) || '[]'); } catch (e) { return []; } };
  const E = { mod: null };
  try { E.mod = (PB.settings && PB.settings.endlessMod) || null; } catch (e) { }
  S.endless = {
    back() { UI.go('menu', {}, true); },
    render() {
      const s = PB.settings || {}, hist = loadEndless(), best = hist.length ? Math.max(...hist.map(h => h.w)) : null;
      const card = (k, name, desc) => `<div class="menu-card ${E.mod === k ? 'c-gold' : ''}" tabindex="0" data-act="endlessMod" data-k="${k || ''}" style="padding:10px 14px;${E.mod === k ? '' : 'opacity:.85'}"><b>${esc(name)}</b>${E.mod === k ? ' <span class="tag good">selected</span>' : ''}<div class="dim" style="font-size:12px">${esc(desc)}</div></div>`;
      return `<div class="panel" style="max-width:820px;margin:16px auto"><h2>Endless Draft</h2>
        
        <h3>Challenge</h3>
        <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px">${card(null, 'No challenge', 'A standard draft: any Pokémon can come up.')}${Object.entries(PB.MODS).map(([k, M]) => card(k, M.name, M.desc)).join('')}</div>
        <label style="display:block;margin-top:10px"><input type="checkbox" id="en-chal" ${s.challengeMode ? 'checked' : ''}> <b>Hide the suggested positions</b> <span class="dim">while you draft (works with any challenge)</span></label>
        <label style="display:block;margin-top:6px">Seed <input type="text" id="en-seed" placeholder="random" style="width:340px"></label>
        <div class="row" style="margin-top:12px"><button class="primary" data-act="endlessStart" autofocus>Start the draft</button><button data-act="goMenu">Back</button></div>
        ${hist.length ? `<h3 style="margin-top:16px">Recent runs${best != null ? ' <span class="dim" style="text-transform:none;font-weight:400">· best ' + best + ' wins</span>' : ''}</h3>${hist.slice(0, 10).map((h, i) => { const M = h.mod && PB.MODS[h.mod]; return `<div class="row between wrap" style="padding:2px 0"><span>${new Date(h.t).toLocaleDateString()}</span><span>${h.w}-${h.l}</span><span class="dim">${esc(h.res)}</span><span class="dim">${M ? esc(M.name) : 'No challenge'}${h.chal ? ' · hidden positions' : ''}</span><span>${h.snap ? UI.teamCardButtonSaved('endless', i) : ''}<button class="small" data-act="endlessCopy" data-i="${i}">Copy</button></span></div>`; }).join('')}` : ''}</div>`;
    },
  };
  A.goEndless = () => UI.go('endless', {}, true);
  A.endlessMod = (el, d) => { E.mod = d.k || null; PB.settings = PB.settings || {}; PB.settings.endlessMod = E.mod; PB.Save.settingsSave(PB.settings); UI.refresh(); };
  A.endlessCopy = (el, d) => { const h = loadEndless()[+d.i]; if (!h) return; const t = dailyCode('', Object.assign({ endless: true }, h)); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => PB.toast('Result copied'), () => PB.toast(t.replace(/\n/g, ' '), 6000)); };
  A.endlessStart = () => {
    const raw = (document.getElementById('en-seed').value || '').trim();
    const seed = raw ? (/^\d+$/.test(raw) ? (+raw >>> 0) : [...raw].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)) : ((Math.random() * 4294967296) >>> 0);
    const G = PB.newGame(seed, 'main', 30, (seed >>> 3) % 30);
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: 'normal' });
    const mod = E.mod && PB.MODS[E.mod] ? E.mod : null, MD = mod && PB.MODS[mod];
    G.rules = { legCap: (MD && MD.rules && MD.rules.legCap) || 0, mod };
    G.challenge = document.getElementById('en-chal').checked; PB.settings.challengeMode = G.challenge; PB.Save.settingsSave(PB.settings);
    G.daily = { date: 'endless', endless: true, seed: raw || seed, games: 82, mod, chal: G.challenge };
    const T = G.teams[G.userTeam]; T.city = 'Endless'; T.nick = 'Draft'; T.name = 'Endless Draft';
    PB.G = G; UI.stack = [];
    G.draft = { phase: 'starters', pick: 0, roll: null, cands: null, picked: [], rerolls: { region: 1, type: 1 } };
    UI.go('draft', {}, true);
  };
})(window.PB);
