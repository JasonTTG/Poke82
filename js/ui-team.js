// Team management: starting lineup, positions, bench rotation order, strategies, team profile.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions;
  let sel = null;   // {l:'S'|'B', i}

  function row(G, T, l, i, id) {
    const m = PB.BYID[id];
    const slot = l === 'S' ? i : null;
    const pen = slot != null ? PB.slotPenalty(m, slot) : 0;
    const fit = (slot == null || !UI.vis().P) ? '' : pen === 0 ? '<span class="tag good">fit</span>' : pen < 0.04 ? '<span class="tag" style="background:#6b5b10;color:#ffe27a">stretch</span>' : '<span class="tag bad">out of position −' + Math.round(pen * 100) + '%</span>';
    const label = l === 'S' ? PB.POS[i] : l === 'R' ? 'RES' : 'B' + (i + 1);
    const inj = G.fr && G.fr.inj[id] && G.fr.inj[id].g > 0 ? `<span class="tag bad">${PB.I('medic')} ${UI.esc(G.fr.inj[id].k)} · ${G.fr.inj[id].g}g</span>` : '';
    const on = sel && sel.l === l && sel.i === i;
    return `<div class="slot fill ${on ? 'sel' : ''}" tabindex="0" data-act="lineupClick" data-l="${l}" data-i="${i}">
      <span class="pos p${l === 'S' ? i : 2}" style="min-width:34px">${label}</span>${UI.spr(m, 44)}
      <div class="grow"><b>${esc(m.dispName)}</b> ${fit} ${inj} ${UI.abilTagSmall ? UI.abilTagSmall(m.id) : ''}${slot != null && UI.vis().P && PB.slotPenalty(m, slot) > 0 ? ' <span class="tag">best at ' + m.pos[0] + '</span>' : ''}<div class="dim" style="font-size:11px">${[UI.vis().A ? m.archOff + ' · ' + m.archDef : '', UI.vis().R ? `3PT ${m.r.three} · DNK ${m.r.dunk} · PAS ${m.r.pass} · SPD ${m.r.speed} · STA ${m.r.stamina}` : `HP ${m.hp} · ATK ${m.atk} · DEF ${m.def} · SPA ${m.spa} · SPD ${m.spd} · SPE ${m.spe}`].filter(Boolean).join(' · ')}</div></div>
      <div>${UI.vis().P ? UI.posBadges(m) : ''}</div>${UI.vis().O ? UI.ovrBadge(m.ovr) : ''}
      <button class="small ghost" data-act="inspect" data-id="${m.id}" title="Scouting report">${PB.I('search')}</button></div>`;
  }

  function profileBars(T) {
    const L = T.starters.map((id, slot) => ({ mon: PB.BYID[id], slot }));
    if (L.length < 5) return '';
    const P = PB.profile(L);
    const bench = T.bench.map(id => PB.BYID[id].ovr);
    const rows = [['Spacing', P.spacing / 5 * 100], ['Playmaking', P.playmaking], ['Rim protection', P.rimProt], ['Perimeter D', P.perimD], ['Rebounding', (P.oreb + P.dreb) / 2], ['Speed', P.speed], ['Stamina', P.stamina], ['Bench depth', bench.length ? PB.avg(bench) : 0]];
    return `<div class="bars" style="font-size:12px;gap:5px 8px">${rows.map(([l, v]) => UI.bar(l, Math.round(PB.clamp(v, 0, 99)))).join('')}</div>`;
  }

  S.lineup = {
    back(p) { if (p.ctx === 'hub') UI.go('hub', { tab: 'roster' }, true); else if (p.ctx === 'midDraft') UI.go('draft', {}, true); else UI.go('lineup', p, true); },
    render(p) {
      const G = PB.G, T = G.teams[G.userTeam];
      const errs = PB.validateLineup(T);
      const partial = p.ctx === 'midDraft' || p.ctx === 'postStarters';
      const cont = p.ctx === 'postStarters' ? `<button class="primary" data-act="lineupDone" autofocus>Bench draft</button>`
        : p.ctx === 'midDraft' ? `<button class="primary" data-act="lineupDone" autofocus>Back to draft</button>`
          : p.ctx === 'postDraft' ? `<button class="gold" data-act="startSeason" ${errs.length ? 'disabled' : ''} autofocus>Start season</button>`
            : p.ctx === 'fantasyPost' ? (PB.Net && PB.Net.onlineLeague() ? UI.onlineReadyHtml(G) : `<button class="gold" data-act="startSeason" ${errs.length ? 'disabled' : ''} autofocus>Start the season</button>`)
              : `<button class="primary" data-act="lineupDone" autofocus>Done</button>`;
      return `<div class="row between wrap"><h2 style="margin:0">${esc(T.name)} — Lineup & Rotation</h2><div class="row">${cont}</div></div>
        ${errs.length && !partial ? `<div class="need">${errs.join(' · ')}</div>` : ''}
        ${UI.vis().P && T.starters.length === 5 ? `<div class="dim" style="font-size:12px;margin:4px 0">Position fit: ${T.starters.filter((id, i) => PB.slotPenalty(PB.BYID[id], i) === 0).length}/5 starters in position</div>` : ''}

        <div class="layout2" style="--side:340px">
          <div class="col">
            <div class="panel"><h3>Starting five</h3><div class="slots">${T.starters.map((id, i) => row(G, T, 'S', i, id)).join('')}</div></div>
            <div class="panel"><h3>Bench / rotation order</h3><div class="slots">${T.bench.map((id, i) => row(G, T, 'B', i, id)).join('') || '<div class="dim">No bench yet.</div>'}</div></div>
            ${PB.reserves(T).length ? `<div class="panel"><h3>Reserves <span class="dim" style="font-weight:400;text-transform:none">— do not play until moved into the top 12</span></h3><div class="slots">${PB.reserves(T).map((id, i) => row(G, T, 'R', i, id)).join('')}</div></div>` : ''}
          </div>
          <div class="col">
            ${UI.vis().O || UI.vis().R ? `<div class="panel">${UI.vis().O ? `<div class="kpi"><div><b>${PB.teamOvr(T).toFixed(1)}</b><span>Team OVR</span></div></div>` : ''}
              ${UI.vis().R ? '<h3 style="margin-top:12px">Chemistry</h3>' + profileBars(T) : ''}
              ${UI.vis().R ? PB.needs(T.roster).map(n => `<div class="need">${n}</div>`).join('') : ''}</div>` : ''}
            <div class="panel col"><h3>Strategy</h3>
              <label>Offense <select data-change="setStrat" data-k="off">${Object.entries(PB.OFF_STRATS).map(([k, v]) => `<option value="${k}" ${T.strat.off === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
              <label>Defense <select data-change="setStrat" data-k="def">${Object.entries(PB.DEF_STRATS).map(([k, v]) => `<option value="${k}" ${T.strat.def === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>

              <button data-act="autoStrat" title="Tests every offense and defense against the league and picks the best">Auto strategy</button>
              <button data-act="autoLineup">Auto lineup</button>
              <button data-act="benchByOvr">Sort bench</button>
            </div>
          </div></div>`;
    },
  };
  A.lineupClick = (el, d) => {
    const G = PB.G, T = G.teams[G.userTeam];
    const cur = { l: d.l, i: +d.i };
    if (!sel) { sel = cur; UI.refresh(); return; }
    if (sel.l === cur.l && sel.i === cur.i) { sel = null; UI.refresh(); return; }
    const lists = { S: T.starters.slice(), B: T.bench.slice(), R: PB.reserves(T) };
    const a = lists[sel.l], b = lists[cur.l];
    const t = a[sel.i]; a[sel.i] = b[cur.i]; b[cur.i] = t;
    sel = null;
    PB.Ops.run('lineup', { tid: G.userTeam, starters: lists.S, bench: lists.B }, err => { if (err) PB.toast(err); UI.refresh(); });
  };
  A.setStrat = (el, d) => { const T = PB.G.teams[PB.G.userTeam]; const s = Object.assign({}, T.strat); s[d.k] = el.value; PB.Ops.run('strat', { tid: PB.G.userTeam, off: s.off, def: s.def }, () => UI.refresh()); };
  A.autoLineup = () => { const T = PB.G.teams[PB.G.userTeam]; sel = null; if (T.roster.length >= 12) PB.Ops.run('autoLineup', { tid: PB.G.userTeam }, () => UI.refresh()); else { PB.autoLineupPartial(T); UI.refresh(); } };
  A.benchByOvr = () => { const T = PB.G.teams[PB.G.userTeam]; const b = T.bench.slice().sort((x, y) => PB.BYID[y].ovr - PB.BYID[x].ovr); PB.Ops.run('lineup', { tid: PB.G.userTeam, starters: T.starters.slice(), bench: b }, () => UI.refresh()); };
  A.lineupDone = () => {
    sel = null;
    const p = UI.params;
    if (p.ctx === 'postStarters') { PB.G.draft.phase = 'bench'; UI.go('draft', {}, true); }
    else if (p.ctx === 'midDraft') UI.go('draft', {}, true);
    else UI.go('hub', { tab: 'roster' }, true);
  };

  A.startSeason = async () => {
    const G = PB.G;
    const T = G.teams[G.userTeam];
    const errs = PB.validateLineup(T);
    if (errs.length) { PB.toast(errs[0]); return; }
    await UI.spin('Building the league…', () => {
      if (G.mode === 'main') {
        const ai = G.teams.filter(t => !t.user).map(t => t.id);
        PB.aiDraftRounds(G, G.rng, ai, 0);
      }
      G.league = PB.League.create(G, G.daily ? G.daily.games : 82);
    });
    if (!G.daily) PB.Save.save(G, 1);
    UI.stack = [];
    if (G.daily) { UI.dailyBegin(G); return; }       // daily challenge: pure drafting, the season plays itself on screen
    UI.go('hub', { tab: 'home' }, true);
  };
})(window.PB);
