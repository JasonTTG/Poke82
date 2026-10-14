// Fantasy snake draft UI
(function (PB) {
  const UI = PB.UI, esc = UI.esc, S = UI.screens, A = UI.actions, F = PB.Fantasy;
  const flt = { pos: 'ALL', type: 'ALL', q: '', sort: 'bst', legend: 'ALL' };
  let viewTeam = null;

  function poolRows(G) {
    let list = F.available(G).map(id => PB.BYID[id]);
    if (flt.pos !== 'ALL') list = list.filter(m => m.pos[0] === flt.pos || m.pos[1] === flt.pos);
    if (flt.type !== 'ALL') list = list.filter(m => m.types.includes(flt.type));
    if (flt.legend === 'LEG') list = list.filter(m => m.leg || m.myth);
    if (flt.legend === 'NON') list = list.filter(m => !m.leg && !m.myth);
    if (flt.q) { const q = flt.q.toLowerCase(); list = list.filter(m => m.name.includes(q)); }
    const v = UI.vis(true);
    let key = flt.sort;
    if ((key === 'ovr' && !v.O) || (RKEYS.includes(key) && !v.R)) key = 'bst';
    const val = m => key === 'ovr' ? m.ovr : key === 'id' ? -m.id : BKEYS.includes(key) ? m[key] : (m.r[key] || 0);
    list.sort((a, b) => (val(b) - val(a)) || a.id - b.id);
    return list;
  }
  UI.actions.fSortCol = (el, d) => { flt.sort = d.k; UI.refresh(); };
  const BKEYS = ['bst', 'hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const RKEYS = ['three', 'dunk', 'pass', 'handle', 'speed', 'intD', 'perD', 'dreb', 'stamina'];
  function tableHtml(G) {
    const v = UI.vis(true);
    const list = poolRows(G);
    const mine = F.current(G) === G.userTeam;
    const TIP = { HP: 'Stamina and durability', ATK: 'Dunking, strength and finishing', DEF: 'Interior defense, rebounding and strength', SPA: 'Shooting (three, mid-range, free throws) and IQ', SPD: 'Passing, IQ and perimeter defense', SPE: 'Speed, handling and steals', BST: 'Total of the six base stats: tracks overall rating closely' };
    const cols = v.R ? [['3PT', 'three'], ['DNK', 'dunk'], ['PAS', 'pass'], ['HDL', 'handle'], ['SPD', 'speed'], ['INT', 'intD'], ['PER', 'perD'], ['REB', 'dreb'], ['STA', 'stamina']]
      : [['HP', 'hp'], ['ATK', 'atk'], ['DEF', 'def'], ['SPA', 'spa'], ['SPD', 'spd'], ['SPE', 'spe'], ['BST', 'bst']];
    const rows = list.slice(0, 80).map(m => `<tr>
      <td><span data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 28)} <b>${esc(m.dispName)}</b></span></td>
      <td>${m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]};font-size:9px">${t}</span>`).join(' ')}</td>
      ${v.P ? `<td>${UI.posBadges(m)}</td>` : ''}${v.O ? `<td class="n"><b>${m.ovr}</b></td>` : ''}${v.A ? `<td class="dim" style="font-size:11px">${m.archOff}</td>` : ''}
      ${cols.map(([, k]) => `<td class="n">${k === 'bst' && !v.R ? '<b>' + m[k] + '</b>' : v.R ? m.r[k] : m[k]}</td>`).join('')}
      <td><button class="small ${mine ? 'primary' : ''}" data-act="fDraft" data-id="${m.id}" ${mine ? '' : 'disabled'}>Draft</button></td></tr>`).join('');
    return `<table class="t"><thead><tr><th>Pokémon</th><th>Type</th>${v.P ? '<th>Pos</th>' : ''}${v.O ? `<th class="n ${flt.sort === 'ovr' ? 'sorted' : ''}" data-act="fSortCol" data-k="ovr" style="cursor:pointer">OVR${flt.sort === 'ovr' ? (' ' + PB.I('down')) : ''}</th>` : ''}${v.A ? '<th>Archetype</th>' : ''}${cols.map(([l, k]) => `<th class="n ${flt.sort === k ? 'sorted' : ''}" data-act="fSortCol" data-k="${k}" style="cursor:pointer" ${!v.R && TIP[l] ? 'title="' + TIP[l] + '"' : ''}>${l === 'BST' && !v.R ? '<b>Total</b>' : l}${flt.sort === k ? (' ' + PB.I('down')) : ''}</th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table>`;
  }
  function sortOptions() {
    const v = UI.vis(true);
    const opts = [];
    if (v.O) opts.push(['ovr', 'Overall']);
    opts.push(['bst', 'Base stat total'], ['hp', 'HP'], ['atk', 'Attack'], ['def', 'Defense'], ['spa', 'Sp. Atk'], ['spd', 'Sp. Def'], ['spe', 'Speed']);
    if (v.R) opts.push(['three', '3PT'], ['dunk', 'Dunk'], ['pass', 'Passing'], ['handle', 'Handling'], ['speed', 'Court speed'], ['intD', 'Interior D'], ['perD', 'Perimeter D'], ['dreb', 'Rebounding'], ['stamina', 'Stamina']);
    opts.push(['id', 'Dex #']);
    return opts;
  }

  S.fantasy = {
    back() { UI.go('menu', {}, true); },
    top() { return `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div><button class="small" data-act="saveFantasy">Save</button><button class="small" data-act="goMenu">Menu</button>`; },
    render() {
      const G = PB.G, D = G.fdraft;
      if (F.done(G)) return `<div class="panel center"><h2>Draft complete!</h2><button class="primary" data-act="fantasyToLineup" autofocus>Set lineup & start season</button></div>`;
      const cur = F.current(G), mine = cur === G.userTeam;
      const n = G.teams.length;
      const up = []; for (let p = D.pick; p < Math.min(D.total, D.pick + 14); p++) up.push(p);
      const T = G.teams[G.userTeam];
      const vt = G.teams[viewTeam == null ? G.userTeam : viewTeam];
      const until = F.picksUntilUser(G);
      return `<div class="row between wrap" style="margin-bottom:10px">
        <div><h2 style="margin:0">Fantasy Draft — Round ${F.round(G) + 1} of 12, Pick ${D.pick % n + 1}</h2>
        <div class="dim">Overall ${D.pick + 1}/${D.total} · snake order · ${mine ? '<b class="gold">YOU ARE ON THE CLOCK</b>' : 'on the clock: ' + UI.teamLabel(G, cur) + ' · your pick in ' + until + ' picks'}${PB.Net && PB.Net.onlineLeague() ? ' · <span class="tag good">ONLINE</span>' : ''}</div></div>
        <div class="row wrap"><button data-act="fToUser" ${mine ? 'disabled' : ''}>${PB.I('ff')} Sim to my pick</button><button data-act="fAuto" ${mine ? '' : 'disabled'}>${PB.I('sparkle')} Auto-pick for me</button><button data-act="fSimAll">${PB.I('skip')} Auto-draft the rest</button></div></div>
        <div class="layout2" style="--side:380px">
          <div class="panel">
            <div class="row wrap" style="margin-bottom:8px">
              ${false ? `<select data-change="fFilter" data-k="pos"><option value="ALL">All positions</option>${PB.POS.map(p => `<option ${flt.pos === p ? 'selected' : ''}>${p}</option>`).join('')}</select>` : ''}
              <select data-change="fFilter" data-k="type"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${flt.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
              <select data-change="fFilter" data-k="legend"><option value="ALL">All</option><option value="LEG" ${flt.legend === 'LEG' ? 'selected' : ''}>Legendary/Mythical</option><option value="NON" ${flt.legend === 'NON' ? 'selected' : ''}>Non-legendary</option></select>
              <select data-change="fFilter" data-k="sort">${sortOptions().map(([v, l]) => `<option value="${v}" ${flt.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
              <input type="text" id="fq" placeholder="search name…" value="${esc(flt.q)}" oninput="PB.UI.fSearch(this.value)">
            </div>
            <div class="scroll" id="ftable">${tableHtml(G)}</div>
          </div>
          <div class="col">
            <div class="panel"><div class="row between"><h3 style="margin:0">${viewTeam == null || viewTeam === G.userTeam ? 'Your roster' : esc(vt.name)} (${vt.roster.length}/12)</h3>
              <select data-change="fViewTeam">${G.teams.map(t => `<option value="${t.id}" ${t.id === vt.id ? 'selected' : ''}>${t.id === G.userTeam ? '(you) ' : ''}${esc(t.abbr)}</option>`).join('')}</select></div>
              <div class="slots" style="margin-top:6px">${vt.roster.map(id => { const m = PB.BYID[id]; return `<div class="slot fill" data-act="inspect" data-id="${m.id}" tabindex="0">${UI.spr(m, 32)}<b class="grow">${esc(m.dispName)}</b>${UI.vis().P ? UI.posBadges(m) : ''}${UI.vis().O ? `<b>${m.ovr}</b>` : ''}</div>`; }).join('')}</div>
              ${UI.vis().R ? PB.needs(vt.roster).map(x => `<div class="need">${x}</div>`).join('') : ''}</div>
            <div class="panel"><h3>Draft order</h3><div style="font-size:12px;max-height:200px;overflow:auto">${up.map((p, i) => { const t = F.teamAt(G, p); return `<div class="row between" style="${i === 0 ? 'font-weight:800;color:var(--gold)' : ''}"><span>R${Math.floor(p / n) + 1}.${p % n + 1}</span><span>${UI.teamLabel(G, t)}</span></div>`; }).join('')}</div></div>
            <div class="panel"><h3>Recent picks</h3><div style="font-size:12px;max-height:180px;overflow:auto">${D.history.slice(-14).reverse().map(h => `<div class="row between"><span class="dim">R${h.round + 1}.${h.pick % n + 1} ${esc(G.teams[h.team].abbr)}</span><span>${esc(PB.BYID[h.mon].dispName)}${UI.vis().O ? ' <b>' + PB.BYID[h.mon].ovr + '</b>' : ''}${UI.vis().P ? ' ' + PB.BYID[h.mon].pos[0] : ''}</span></div>`).join('') || '<span class="dim">No picks yet.</span>'}</div></div>
          </div></div>`;
    },
  };
  UI.fSearch = function (v) { flt.q = v; const G = PB.G; document.getElementById('ftable').innerHTML = tableHtml(G); };
  A.fFilter = (el, d) => { flt[d.k] = el.value; UI.refresh(); };
  A.fViewTeam = el => { viewTeam = +el.value; UI.refresh(); };
  const done = err => { if (err) PB.toast(err, 3000); UI.refresh(); };
  A.fDraft = (el, d) => {
    const G = PB.G;
    if (UI.modalOpen()) UI.closeModal();
    PB.Ops.run('fPick', { tid: G.userTeam, id: +d.id }, done);
  };
  A.fToUser = () => PB.Ops.run('fToMe', {}, done);
  A.fAuto = () => { const G = PB.G; if (F.current(G) !== G.userTeam) return; PB.Ops.run('fAuto', { tid: G.userTeam }, done); };
  A.fSimAll = async () => {
    if (PB.Net && PB.Net.onlineLeague() && !PB.Net.isHost()) { PB.toast('Only the host can auto-draft for everyone'); return; }
    await UI.spin('Auto-drafting…', () => { });
    PB.Ops.run('fRest', {}, done);
  };
  A.fantasyToLineup = () => UI.go('lineup', { ctx: 'fantasyPost' });
  A.saveFantasy = () => { const r = PB.Save.save(PB.G, 1); PB.toast(r.ok ? 'Draft saved (slot 1)' : 'Save failed'); };
  S.fantasy.inspectActions = id => {
    const G = PB.G; if (!G.fdraft || F.done(G) || F.current(G) !== G.userTeam || G.claimed[id] != null) return '';
    return `<button class="primary" data-act="fDraft" data-id="${id}">Draft ${esc(PB.BYID[id].dispName)}</button>`;
  };
})(window.PB);
