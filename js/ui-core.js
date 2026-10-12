// UI core: router, event delegation, shared components (cards, badges, modals, toasts).
(function (PB) {
  const UI = PB.UI = { screens: {}, actions: {}, cur: null, params: null, stack: [] };
  const $ = (s, r) => (r || document).querySelector(s);
  PB.$ = $;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.esc = esc;

  // ---------- components ----------
  const spr = (m, size) => `<img class="spr" src="${m.sprite}" onerror="this.onerror=null;this.src='${m.remote}'" width="${size || 96}" height="${size || 96}" alt="${esc(m.dispName)}" loading="lazy">`;
  const tier = n => n >= 90 ? 't5' : n >= 80 ? 't4' : n >= 70 ? 't3' : n >= 60 ? 't2' : 't1';
  const ovrBadge = n => `<div class="ovr ${tier(n)}">${n}</div>`;
  const typePills = m => m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]}">${t}</span>`).join(' ');
  const posBadges = m => `<span class="pos p${m.r.pos1}">${m.pos[0]}</span><span class="pos p${m.r.pos2}" style="opacity:.7">${m.pos[1]}</span>`;
  const barColor = v => v >= 80 ? '#2fd47a' : v >= 65 ? '#8fd14f' : v >= 50 ? '#ffcb05' : '#ff7a5a';
  const bar = (label, v) => `<span>${label}</span><div class="bar"><i style="width:${v}%;background:${barColor(v)}"></i></div><b>${v}</b>`;
  const KEYBARS = [['3PT', 'three'], ['MID', 'mid'], ['DNK', 'dunk'], ['LAY', 'layup'], ['PAS', 'pass'], ['HDL', 'handle'], ['SPD', 'speed'], ['INT', 'intD'], ['PER', 'perD'], ['REB', 'dreb'], ['STA', 'stamina']];
  const miniBars = (m, keys) => `<div class="bars">${(keys || KEYBARS.slice(0, 8)).map(([l, k]) => bar(l, m.r[k])).join('')}</div>`;
  // official base stats (always visible); bars scaled to 200
  const BASE = [['HP', 'hp'], ['ATK', 'atk'], ['DEF', 'def'], ['SPA', 'spa'], ['SPD', 'spd'], ['SPE', 'spe']];
  const sbar = (label, v) => `<span>${label}</span><div class="bar"><i style="width:${Math.min(100, v / 1.8)}%;background:${barColor(Math.min(99, v * 0.75))}"></i></div><b>${v}</b>`;
  const baseBars = m => `<div class="bars">${BASE.map(([l, k]) => sbar(l, m[k])).join('')}</div>`;
  // what the player chose to reveal (Settings): basketball ratings, positions, archetypes, overall
  // ratings, positions, archetypes and overall show for drafted Pokemon and in league menus, never for draft prospects.
  // vis(true) = hide everything (draft tables); vis(mon) = hide only if that mon is an undrafted prospect on a draft screen
  UI.inDraft = () => UI.cur === 'draft' || UI.cur === 'fantasy' || (UI.cur === 'hub' && UI.params && UI.params.tab === 'offseason' && PB.G && PB.G.fr && PB.G.fr.stage === 'draft');
  UI.vis = hide => {
    const s = PB.settings || {};
    if (hide === true || (hide && hide.id && UI.inDraft() && !(PB.G && PB.G.claimed[hide.id] != null))) return { R: false, P: false, A: false, O: false };
    return { R: s.showRatings !== false, P: s.showPositions !== false, A: s.showArchetypes !== false, O: s.showOverall !== false };
  };
  Object.assign(UI, { spr, tier, ovrBadge, typePills, posBadges, bar, miniBars, KEYBARS, baseBars, BASE });

  UI.mcard = function (m, o) {
    o = o || {};
    const v = UI.vis(m);
    const legend = m.leg || m.myth;
    return `<div class="mcard ${legend ? 'legend' : ''} ${o.sel ? 'sel' : ''}" tabindex="0" data-act="${o.act || 'inspect'}" data-id="${m.id}" ${o.extra || ''}>
      <div class="top"><div><div class="name">${esc(m.dispName)}</div><div>${typePills(m)}</div></div>${v.O ? ovrBadge(m.ovr) : ''}</div>
      <div class="sprwrap">${spr(m, 96)}</div>
      <div class="row between"><div>${v.P ? posBadges(m) : ''}</div><div class="dim" style="font-size:11px">${PB.fmtHeight(m.h)} · ${PB.fmtWeight(m.w)}</div></div>
      ${v.A ? `<div class="arch"><b>${m.archOff}</b> · ${m.archDef}</div>` : ''}
      <div class="arch" title="${esc(PB.Abil.describe(m.id).desc)}">⚡ <b>${esc(PB.Abil.describe(m.id).ability)}</b> · ${esc(PB.Abil.describe(m.id).badge)}</div>
      ${v.R ? miniBars(m) : baseBars(m)}
      <div>${legend ? '<span class="tag leg">' + (m.myth ? 'MYTHICAL' : 'LEGENDARY') + '</span>' : ''}</div>
      ${o.btn ? `<button class="${o.btnClass || 'primary'}" data-act="${o.btnAct}" data-id="${m.id}">${o.btn}</button>` : ''}
    </div>`;
  };

  UI.fullCard = function (m, extra) {
    const v = UI.vis(m);
    const keys = Object.keys(PB.RLABELS);
    return `<div class="row wrap" style="align-items:flex-start;gap:18px">
      <div class="col" style="align-items:center;min-width:170px">${spr(m, 160)}<div class="center"><b style="font-size:20px">${esc(m.dispName)}</b><div>${typePills(m)}</div><div class="dim" style="font-size:12px">#${m.id} · ${m.region} · ${PB.fmtHeight(m.h)} · ${PB.fmtWeight(m.w)} · ${m.shape}</div></div>
        ${v.O ? ovrBadge(m.ovr) : ''}${v.P ? `<div>${posBadges(m)}</div>` : ''}${v.A ? `<div class="dim center" style="font-size:12px"><b>${m.archOff}</b><br>${m.archDef}</div>` : ''}</div>
      <div class="grow" style="min-width:280px">
        <h3>Base stats</h3>${baseBars(m)}<div class="dim" style="font-size:12px;margin-top:4px">Total ${m.bst}${m.reg ? ' · ' + m.region + ' regional form' : ''}</div>
        <h3 style="margin-top:12px">Ability</h3>${UI.abilBlock(m.id)}
        ${v.P ? `<h3 style="margin-top:12px">Position fit</h3>${UI.posFitHtml(m)}` : ''}
        ${v.R ? `<h3 style="margin-top:12px">Basketball ratings</h3><div class="bars" style="font-size:12px;gap:4px 8px">${keys.map(k => bar(PB.RLABELS[k], m.r[k])).join('')}</div>
        <div style="margin-top:8px">${m.strengths.map(s => `<span class="tag good">${s}</span>`).join('')} ${m.weaknesses.map(s => `<span class="tag bad">${s}</span>`).join('')}</div>` : ''}
        ${extra || ''}
      </div></div>`;
  };

  // ---------- modals / toasts ----------
  UI.modal = function (html, o) {
    let layer = $('#modal');
    layer.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    layer.classList.add('open');
    UI._modalBack = o && o.onClose;
    const f = layer.querySelector('[autofocus]') || layer.querySelector('button, [data-act]');
    if (f) f.focus();
  };
  UI.closeModal = function () {
    const layer = $('#modal'); layer.classList.remove('open'); layer.innerHTML = '';
    const cb = UI._modalBack; UI._modalBack = null; cb && cb();
    const a = $('#app'); const f = a && a.querySelector('.mcard, button, [data-act]'); if (f && document.activeElement === document.body) f.focus();
  };
  UI.modalOpen = () => $('#modal').classList.contains('open');
  PB.toast = function (msg, ms) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 2200);
  };
  UI.inspect = function (id, actions) {
    const m = PB.BYID[id];
    UI.modal(`${UI.fullCard(m, UI.honorsHtml(id))}<div class="row" style="margin-top:14px;justify-content:flex-end">${actions || ''}<button data-act="cmpStart" data-id="${id}">Compare</button><button data-act="closeModal" autofocus>Close</button></div>`);
  };

  // ---------- router ----------
  UI.go = function (name, params, noStack) {
    if (UI.cur && !noStack) UI.stack.push([UI.cur, UI.params]);
    UI.cur = name; UI.params = params || {};
    UI.render();
  };
  UI.render = function () {
    const sc = UI.screens[UI.cur];
    if (!sc) { $('#screen').innerHTML = '<div class="screen">Unknown screen ' + UI.cur + '</div>'; return; }
    PB.Input.mode = sc.game ? 'game' : 'menu';
    const html = sc.render(UI.params);
    $('#top').innerHTML = sc.top ? sc.top(UI.params) : UI.defaultTop();
    $('#screen').innerHTML = `<div class="screen" id="scr">${html}</div>`;
    if (sc.mount) sc.mount(UI.params);
    const f = $('#scr').querySelector('[autofocus]') || $('#scr').querySelector('.mcard, button:not([disabled]), [data-act]');
    if (f && !sc.game && !sc.noFocus) f.focus({ preventScroll: true });
  };
  UI.refresh = function () { const y = $('#scr') ? $('#scr').scrollTop : 0; UI.render(); const s = $('#scr'); if (s) s.scrollTop = y; };
  UI.defaultTop = () => `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div>
    ${PB.G ? `<button class="small" data-act="goMenu">Main Menu</button>` : ''}`;
  UI.back = function () {
    if (UI.modalOpen()) { UI.closeModal(); return; }
    const sc = UI.screens[UI.cur];
    if (sc && sc.back) { sc.back(UI.params); return; }
    if (UI.stack.length) { const [n, p] = UI.stack.pop(); UI.cur = n; UI.params = p; UI.render(); }
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    const fn = UI.actions[act];
    if (fn) { e.stopPropagation(); if (PB.Audio) PB.Audio.play('click'); fn(el, el.dataset); }
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]'); if (!el) return;
    const fn = UI.actions[el.dataset.change]; if (fn) fn(el, el.dataset);
  });
  UI.actions.closeModal = () => UI.closeModal();
  UI.actions.inspect = (el, d) => {
    const act = UI.screens[UI.cur] && UI.screens[UI.cur].inspectActions ? UI.screens[UI.cur].inspectActions(+d.id) : '';
    UI.inspect(+d.id, act);
  };
  // honors earned this season appear on the player card
  UI.honorsHtml = id => {
    const lg = PB.G && PB.G.league; const h = lg && lg.honors && lg.honors[id];
    return h && h.length ? `<div style="margin-top:10px">${h.map(x => `<span class="tag leg">${UI.esc(x)}</span>`).join(' ')}</div>` : '';
  };
  UI.actions.goMenu = () => { UI.stack = []; UI.go('menu', {}, true); };

  // ---------- helpers ----------
  UI.spin = function (msg, fn) {
    UI.modal(`<div class="center"><h2>${esc(msg)}</h2><div class="dim">Please wait…</div></div>`);
    return new Promise(res => setTimeout(() => { try { res(fn()); } finally { UI.closeModal(); } }, 30));
  };
  UI.pct = (a, b) => b ? (a / b * 100).toFixed(1) : '0.0';
  UI.fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
  UI.teamLabel = (G, id) => { const t = G.teams[id]; return `<span style="${t.user ? 'color:var(--gold);font-weight:700' : ''}">${UI.logo ? UI.logo(t, 16) + ' ' : ''}${esc(t.name)}</span>`; };
})(window.PB);
