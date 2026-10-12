// UI extras: abilities, position clarity, Pokedex + compare tool, draft pick reveals and the lottery show.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, A = UI.actions, S = UI.screens;

  // ---------- abilities / positions ----------
  UI.abilBlock = id => { const d = PB.Abil.describe(id), m = PB.BYID[id], opts = PB.Abil.options(m).map(a => PB.Abil.fmt(a)); return `<div><b>${esc(d.ability)}</b> <span class="tag leg">${esc(d.badge)}</span><div class="dim" style="font-size:12px">${esc(d.desc)}</div>${opts.length > 1 ? `<div class="dim" style="font-size:11px">Could have had: ${esc(opts.join(' / '))}</div>` : ''}</div>`; };
  UI.abilTagSmall = id => { const d = PB.Abil.describe(id); return `<span class="tag" title="${esc(d.ability + ' — ' + d.badge + ': ' + d.desc)}">${esc(d.badge)}</span>`; };
  UI.posFitHtml = m => {
    const fits = PB.POS.map((p, i) => ({ p, i, pen: PB.slotPenalty(m, i) }));
    return `<div class="posfit">${fits.map(f => `<div class="pf ${f.i === m.r.pos1 ? 'pri' : f.i === m.r.pos2 ? 'sec' : ''}"><b>${f.p}</b><span>${f.pen === 0 ? 'fits' : '−' + Math.round(f.pen * 100) + '%'}</span></div>`).join('')}</div>
      <div class="dim" style="font-size:12px;margin-top:4px">Best at <b>${m.pos[0]}</b>${m.pos[1] !== m.pos[0] ? ', can also play <b>' + m.pos[1] + '</b>' : ''}. Playing 2+ spots away costs rating points.</div>`;
  };

  // ---------- compare ----------
  const cmp = { a: null, b: null, q: '', type: 'ALL' };
  const STATS = [['HP', 'hp'], ['ATK', 'atk'], ['DEF', 'def'], ['SPA', 'spa'], ['SPD', 'spd'], ['SPE', 'spe']];
  const RATES = [['3PT', 'three'], ['Mid', 'mid'], ['Dunk', 'dunk'], ['Layup', 'layup'], ['Pass', 'pass'], ['Handle', 'handle'], ['Speed', 'speed'], ['Strength', 'strength'], ['Int. D', 'intD'], ['Per. D', 'perD'], ['Steal', 'steal'], ['Block', 'block'], ['Reb', 'dreb'], ['Stamina', 'stamina']];
  UI.compareHtml = (ida, idb) => {
    const a = PB.BYID[ida], b = PB.BYID[idb], v = UI.vis(a);
    const row = (l, x, y, fmt) => { const w = x > y ? 'a' : y > x ? 'b' : ''; return `<tr><td class="n ${w === 'a' ? 'good' : ''}"><b>${fmt ? fmt(x) : x}</b></td><td class="center dim" style="font-size:11px">${l}</td><td class="${w === 'b' ? 'good' : ''}"><b>${fmt ? fmt(y) : y}</b></td></tr>`; };
    const head = m => `<div class="center">${UI.spr(m, 110)}<div><b style="font-size:17px">${esc(m.dispName)}</b></div><div>${UI.typePills(m)}</div><div class="dim" style="font-size:11px">${PB.fmtHeight(m.h)} · ${PB.fmtWeight(m.w)}</div>${UI.abilTagSmall(m.id)}${v.P ? '<div>' + UI.posBadges(m) + '</div>' : ''}</div>`;
    return `<div class="row" style="align-items:flex-start;justify-content:space-around;gap:8px">${head(a)}${head(b)}</div>
      <table class="t" style="margin-top:8px"><tbody>${STATS.map(([l, k]) => row(l, a[k], b[k])).join('')}${row('Total', a.bst, b.bst)}${v.O ? row('Overall', a.ovr, b.ovr) : ''}${v.R ? RATES.map(([l, k]) => row(l, a.r[k], b.r[k])).join('') : ''}</tbody></table>`;
  };
  UI.compareModal = function (ida) {
    cmp.a = ida; cmp.b = cmp.b && cmp.b !== ida ? cmp.b : null;
    const list = PB.MONS.filter(m => m.id !== ida && (!cmp.q || m.name.includes(cmp.q.toLowerCase()))).sort((x, y) => y.bst - x.bst).slice(0, 24);
    UI.modal(`<div class="row between"><h2 style="margin:0">Compare</h2><button data-act="closeModal">Close</button></div>
      ${cmp.b ? UI.compareHtml(cmp.a, cmp.b) + '<div class="row" style="margin-top:8px"><button class="small" data-act="cmpClear">Pick a different Pokémon</button></div>' :
        `<div class="dim" style="margin:6px 0">Compare <b>${esc(PB.BYID[ida].dispName)}</b> with…</div><input type="text" id="cmpq" placeholder="search name…" value="${esc(cmp.q)}" oninput="PB.UI.cmpSearch(this.value)" style="width:100%">
        <div class="scroll" style="max-height:340px;margin-top:6px">${list.map(m => `<div class="slot fill" tabindex="0" data-act="cmpSet" data-id="${m.id}" style="margin:3px 0">${UI.spr(m, 32)}<b class="grow">${esc(m.dispName)}</b>${UI.typePills(m)}<span class="dim">BST ${m.bst}</span></div>`).join('')}</div>`}`);
  };
  UI.cmpSearch = q => { cmp.q = q; UI.compareModal(cmp.a); const e = document.getElementById('cmpq'); if (e) { e.focus(); e.setSelectionRange(q.length, q.length); } };
  A.cmpStart = (el, d) => { cmp.b = null; cmp.q = ''; UI.compareModal(+d.id); };
  A.cmpSet = (el, d) => { cmp.b = +d.id; UI.compareModal(cmp.a); };
  A.cmpClear = () => { cmp.b = null; UI.compareModal(cmp.a); };

  // ---------- Pokedex ----------
  const dex = { q: '', type: 'ALL', gen: 'ALL', sort: 'id', pick: [] };
  S.dex = {
    back() { UI.go('menu', {}, true); },
    render() {
      let list = PB.MONS.slice();
      if (dex.type !== 'ALL') list = list.filter(m => m.types.includes(dex.type));
      if (dex.gen !== 'ALL') list = list.filter(m => m.gen === +dex.gen);
      if (dex.q) { const q = dex.q.toLowerCase(); list = list.filter(m => m.name.includes(q)); }
      list.sort((a, b) => dex.sort === 'id' ? a.id - b.id : dex.sort === 'bst' ? b.bst - a.bst : b.ovr - a.ovr);
      const picked = dex.pick;
      return `<div class="row between wrap" style="margin-bottom:8px"><h2 style="margin:0">Pokédex & Compare</h2><button data-act="goMenu">Back</button></div>
        ${picked.length === 2 ? `<div class="panel" style="margin-bottom:10px">${UI.compareHtml(picked[0], picked[1])}<button class="small" data-act="dexClear">Clear</button></div>` : picked.length ? `<div class="panel" style="margin-bottom:10px">Comparing: <b>${esc(PB.BYID[picked[0]].dispName)}</b> — pick a second Pokémon below. <button class="small" data-act="dexClear">Clear</button></div>` : ''}
        <div class="panel"><div class="row wrap" style="margin-bottom:8px"><input type="text" id="dexq" placeholder="search name…" value="${esc(dex.q)}" oninput="PB.UI.dexSearch(this.value)">
          <select data-change="dexF" data-k="type"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${dex.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select data-change="dexF" data-k="gen"><option value="ALL">All regions</option>${Object.entries(PB.REGIONS).map(([g, n]) => `<option value="${g}" ${dex.gen == g ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <select data-change="dexF" data-k="sort"><option value="id">Dex #</option><option value="bst" ${dex.sort === 'bst' ? 'selected' : ''}>Base stats</option><option value="ovr" ${dex.sort === 'ovr' ? 'selected' : ''}>Overall</option></select></div>
          <div class="scroll"><table class="t"><thead><tr><th>#</th><th>Pokémon</th><th>Type</th><th>Badge</th>${STATS.map(([l]) => `<th class="n">${l}</th>`).join('')}<th></th></tr></thead><tbody>
          ${list.slice(0, 100).map(m => `<tr class="${picked.includes(m.id) ? 'sel' : ''}"><td class="dim">${m.id > 1025 ? '+' : m.id}</td><td><span data-act="inspect" data-id="${m.id}" tabindex="0" style="cursor:pointer">${UI.spr(m, 26)} <b>${esc(m.dispName)}</b></span></td><td>${m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]};font-size:9px">${t}</span>`).join(' ')}</td><td>${UI.abilTagSmall(m.id)}</td>${STATS.map(([, k]) => `<td class="n">${m[k]}</td>`).join('')}<td><button class="small" data-act="dexPick" data-id="${m.id}">Compare</button></td></tr>`).join('')}</tbody></table></div></div>`;
    },
  };
  UI.dexSearch = q => { dex.q = q; UI.refresh(); const e = document.getElementById('dexq'); if (e) { e.focus(); e.setSelectionRange(q.length, q.length); } };
  A.dexF = (el, d) => { dex[d.k] = el.value; UI.refresh(); };
  A.dexPick = (el, d) => { const id = +d.id; if (dex.pick.includes(id)) dex.pick = dex.pick.filter(x => x !== id); else { dex.pick.push(id); if (dex.pick.length > 2) dex.pick.shift(); } UI.refresh(); };
  A.dexClear = () => { dex.pick = []; UI.refresh(); };
  A.goDex = () => UI.go('dex');

  // ---------- draft pick reveals ----------
  let layer = null, queue = [], busy = false;
  function ensureLayer() { if (layer) return layer; layer = document.createElement('div'); layer.id = 'reveal'; document.body.appendChild(layer); return layer; }
  function playNext() {
    if (busy || !queue.length) return; busy = true;
    const q = queue.shift(), el = ensureLayer();
    el.innerHTML = q.html; el.classList.add('on');
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => { busy = false; playNext(); }, 250); }, q.ms || 1500);
  }
  UI.reveal = (html, ms) => { queue.push({ html, ms }); playNext(); };
  UI.pickReveal = function (G, tid, monId, overall, extra) {
    const m = PB.BYID[monId], t = G.teams[tid], d = PB.Abil.describe(monId);
    UI.reveal(`<div class="rv-card" style="border-color:${PB.teamColors(t)[0]}"><div class="rv-top">${UI.logo(t, 36)} <span>${esc(t.name)} select…</span></div>
      ${overall != null ? `<div class="rv-n">PICK ${overall}</div>` : ''}<div class="rv-spr">${UI.spr(m, 150)}</div><div class="rv-name">${esc(m.dispName)}</div><div>${UI.typePills(m)}</div>
      <div class="dim">${esc(d.ability)} · ${esc(d.badge)}${extra ? ' · ' + esc(extra) : ''}</div></div>`, 1600);
  };
  // watch the draft board: reveal the user's picks and the very top of the class
  let seenF = 0, seenFr = 0;
  PB.Ops.on(name => {
    const G = PB.G; if (!G) return;
    if (G.fr && G.fr.draft && /^draft|^startDraft/.test(name)) {
      const D = G.fr.draft;
      if (name === 'startDraft') { seenFr = 0; return; }       // the lottery animation opens from the draft screen (js/ui-franchise3.js)
      const fresh = D.history.slice(seenFr); seenFr = D.history.length;
      let shown = 0;
      for (const h of fresh) if ((h.t === G.userTeam || h.n < 3) && shown++ < 4) UI.pickReveal(G, h.t, h.mon, h.n + 1, G.fr.scouted && G.fr.scouted[G.userTeam + ':' + h.mon] ? 'scouting grade ' + PB.Franchise.scoutGrade(G, h.mon) : '');
    }
    if (G.fdraft && /^f(Pick|Auto|ToMe|Rest)$/.test(name)) {
      const fresh = G.fdraft.history.slice(seenF); seenF = G.fdraft.history.length;
      let shown = 0;
      for (const h of fresh) if ((h.team === G.userTeam || h.pick < 3) && shown++ < 3) UI.pickReveal(G, h.team, h.mon, h.pick + 1);
    }
  });
})(window.PB);
