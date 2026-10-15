// UI core: router, event delegation, shared components (cards, badges, modals, toasts).
(function (PB) {
  const UI = PB.UI = { screens: {}, actions: {}, cur: null, params: null, stack: [] };
  const $ = (s, r) => (r || document).querySelector(s);
  PB.$ = $;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.esc = esc;

  // ---------- components ----------
  const spr = (m, size) => { size = size || 96; const tight = size <= 40; if (tight) size = Math.round(size * 1.3 / 2) * 2;      // small table and list sprites are trimmed to the visible art and drawn larger so they can be made out
    const c = PB.Atlas && PB.Atlas.css(m, size, tight); return c ? `<span class="spr sp-a" role="img" aria-label="${esc(m.dispName)}" style="${c}"></span>` : sprImg(m, size); };
  const sprImg = (m, size) => `<img class="spr" src="${m.sprite}" onerror="this.onerror=null;this.src='${m.remote}'" width="${size || 96}" height="${size || 96}" alt="${esc(m.dispName)}" loading="lazy">`;
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
  // what each base stat does on the court (how it feeds the basketball ratings), so the link between a Pokémon's stats and its overall is visible
  const ROLE = { hp: ['stamina', 'Stamina and durability'], atk: ['power', 'Dunking, strength and finishing'], def: ['defense', 'Interior defense, rebounding and strength'], spa: ['shooting', 'Three-point, mid-range and free-throw shooting, plus game IQ'], spd: ['passing', 'Passing, game IQ and perimeter defense'], spe: ['speed', 'Speed, ball handling and steals'] };
  const sbar = (label, v, k) => `<span title="${ROLE[k][1]}">${label} <small class="dim">${ROLE[k][0]}</small></span><div class="bar"><i style="width:${Math.min(100, v / 1.8)}%;background:${barColor(Math.min(99, v * 0.75))}"></i></div><b>${v}</b>`;
  // the total of the six base stats tracks overall rating more closely than any single stat
  const totalBar = m => { const v = Math.max(0, Math.min(99, 40 + (m.bst - 200) / 500 * 55)); return `<span title="The sum of the six base stats follows overall rating closely"><b>Total</b></span><div class="bar" style="height:8px"><i style="width:${Math.max(4, Math.min(100, (m.bst - 150) / 6))}%;background:${barColor(v)}"></i></div><b>${m.bst}</b>`; };
  const baseBars = m => `<div class="bars">${BASE.map(([l, k]) => sbar(l, m[k], k)).join('')}<div style="grid-column:1/-1;border-top:1px solid var(--line);margin:2px 0"></div>${totalBar(m)}</div>`;
  // what the player chose to reveal (Settings): basketball ratings, positions, archetypes, overall
  // ratings, positions, archetypes and overall show for drafted Pokemon and in league menus, never for draft prospects.
  // vis(true) = hide everything (draft tables); vis(mon) = hide only if that mon is an undrafted prospect on a draft screen
  UI.inDraft = () => UI.cur === 'draft' || UI.cur === 'fantasy' || (UI.cur === 'hub' && UI.params && UI.params.tab === 'offseason' && PB.G && PB.G.fr && PB.G.fr.stage === 'draft');
  // what a draft prospect shows depends on the mode: Daily / Endless show the suggested positions (unless challenge mode), franchise adds archetypes,
  // fantasy shows whatever the league settings turned on. Ratings and overall stay hidden until a Pokémon is drafted (except in fantasy if allowed).
  UI.draftVis = () => {
    const G = PB.G, s = PB.settings || {}, on = k => s[k] !== false;
    if (G && G.mode === 'fantasy') { const d = G.draftInfo || { R: true, P: true, A: true, O: true }; return { R: !!d.R, P: !!d.P, A: !!d.A, O: !!d.O }; }
    if (G && G.mode === 'franchise') return { R: false, P: on('showPositions'), A: on('showArchetypes'), O: false };
    return { R: false, P: !(G && G.challenge) && on('showPositions'), A: false, O: false };
  };
  UI.vis = hide => {
    const s = PB.settings || {};
    if (hide === true || (hide && hide.id && UI.inDraft() && !(PB.G && PB.G.claimed[hide.id] != null))) return UI.draftVis();
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
      <div class="arch" title="${esc(PB.Abil.describe(m.id).desc)}">${PB.I(PB.Abil.describe(m.id).bad ? 'down' : 'bolt')} <b>${esc(PB.Abil.describe(m.id).ability)}</b> · ${esc(PB.Abil.describe(m.id).badge)}</div>
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
        <h3>Base stats</h3>${baseBars(m)}${m.reg ? `<div class="dim" style="font-size:12px;margin-top:4px">${m.region} regional form</div>` : ''}
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
  // in-app replacements for the browser's confirm() and prompt() (they work with a controller and match the look of the game)
  UI.confirm = function (msg, yes, o) {
    o = o || {}; UI._cf = { yes, no: o.onNo };
    UI.modal(`<div class="center"><h2>${esc(o.title || 'Are you sure?')}</h2><div>${esc(msg)}</div><div class="row center" style="margin-top:14px"><button class="gold" data-act="cfYes">${esc(o.yesLabel || 'Yes')}</button><button data-act="cfNo" autofocus>${esc(o.noLabel || 'Cancel')}</button></div></div>`, { onClose: () => { const c = UI._cf; UI._cf = null; if (c && c.no) c.no(); } });
  };
  UI.actions.cfYes = () => { const c = UI._cf; UI._cf = null; UI.closeModal(); if (c && c.yes) c.yes(); };
  UI.actions.cfNo = () => UI.closeModal();
  UI.prompt = function (msg, def, cb) {
    UI._pp = cb;
    UI.modal(`<div class="center"><h2>${esc(msg)}</h2><input type="text" id="pp-in" maxlength="24" value="${esc(def || '')}" style="width:80%"><div class="row center" style="margin-top:14px"><button class="primary" data-act="ppOk">OK</button><button data-act="closeModal">Cancel</button></div></div>`, { onClose: () => { UI._pp = null; } });
    setTimeout(() => { const i = document.getElementById('pp-in'); if (i) { i.focus(); i.select(); } }, 0);
  };
  UI.actions.ppOk = () => { const i = document.getElementById('pp-in'), cb = UI._pp, v = i ? i.value.trim() : ''; UI._pp = null; UI.closeModal(); if (cb && v) cb(v); };
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
  const NEEDS_GAME = ['draft', 'lineup', 'fantasy', 'hub'];
  UI.go = function (name, params, noStack) {
    if (NEEDS_GAME.includes(name) && !PB.G) { name = 'menu'; params = {}; noStack = true; }      // no game loaded: nothing to show
    if (UI.cur && !noStack) UI.stack.push([UI.cur, UI.params]);
    UI.cur = name; UI.params = params || {};
    UI.render();
  };
  UI.render = function () {
    const sc = UI.screens[UI.cur];
    if (!sc) { $('#screen').innerHTML = '<div class="screen">Unknown screen ' + UI.cur + '</div>'; return; }
    PB.Input.mode = sc.game ? 'game' : 'menu';
    let html, top;
    try { html = sc.render(UI.params); top = sc.top ? sc.top(UI.params) : UI.defaultTop(); }
    catch (e) {
      console.error(e); if (PB.Diag) PB.Diag.err('screen ' + UI.cur + ': ' + e.message, 'render');
      html = `<div class="panel center" style="max-width:520px;margin:30px auto"><h2>This screen could not open</h2><div class="dim">${esc(e.message)}</div><div class="row center" style="margin-top:12px"><button class="primary" data-act="goMenu" autofocus>Back to menu</button><button data-act="diagCopy">Copy problem report</button></div></div>`; top = UI.defaultTop();
    }
    // a redraw of the same screen (a live sim ticking) keeps every horizontally or vertically scrolled box where the player left it
    const SCROLLY = '#screen .bracket, #screen .scroll, #screen .panel, #screen .modal, #screen .subtabs';
    const kept = UI._lastScr === UI.cur ? [...document.querySelectorAll(SCROLLY)].map(e => [e.scrollLeft, e.scrollTop]) : null;
    UI._lastScr = UI.cur;
    $('#top').innerHTML = top;
    $('#screen').innerHTML = `<div class="screen" id="scr">${html}</div>`;
    if (kept) document.querySelectorAll(SCROLLY).forEach((e, i) => { const k = kept[i]; if (k && (k[0] || k[1])) { e.scrollLeft = k[0]; e.scrollTop = k[1]; } });
    if (PB.Audio) PB.Audio.setScene(UI.cur === 'game' ? 'game' : 'menu');      // music on menus, crowd noise in games
    document.querySelectorAll('.tabs button.on, .subtabs button.on').forEach(b => { try { b.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) { } });      // keep the current tab in view on a narrow screen
    if (sc.mount) { try { sc.mount(UI.params); } catch (e) { console.error(e); if (PB.Diag) PB.Diag.err('mount ' + UI.cur + ': ' + e.message, 'mount'); } }
    const f = $('#scr').querySelector('[autofocus]') || $('#scr').querySelector('.mcard, button:not([disabled]), [data-act]');
    if (f && !sc.game && !sc.noFocus && document.body.classList.contains('padnav')) f.focus({ preventScroll: true });      // only when a keyboard / controller is in use
  };
  // run a redraw of part of a screen without losing how far the player had scrolled any box inside it (or the page)
  UI.keepScroll = function (el, redraw) {
    const boxes = () => [el].concat([...el.querySelectorAll('.bracket, .scroll, .panel, .subtabs')], [...(function* () { for (let p = el.parentElement; p && p.id !== 'screen'; p = p.parentElement) yield p; })()]), keep = boxes().map(e => [e.scrollLeft, e.scrollTop]), scr = document.getElementById('scr'), sy = scr ? scr.scrollTop : 0;
    redraw();
    boxes().forEach((e, i) => { const k = keep[i]; if (k && (k[0] || k[1])) { e.scrollLeft = k[0]; e.scrollTop = k[1]; } });
    if (scr) scr.scrollTop = sy;
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
  // league news about a human team is gold only when it is about *your* team (several humans can share a league online)
  UI.newsMine = (G, n) => { if (!n.user) return false; if (G.teams.filter(t => t.user).length < 2) return true; const T = G.teams[G.userTeam]; return n.txt.includes(T.abbr) || n.txt.includes(T.name) || T.roster.some(id => n.txt.includes(PB.BYID[id].dispName)); };
  // one autosave for every mode: slot 1, unless the player turned it off or the league is online (the host saves those)
  UI.autosave = () => { const G = PB.G; if (G && G.settings && G.settings.autosave !== false && !(PB.Net && PB.Net.active && PB.Net.active())) { const r = PB.Save.save(G, 1); if (r && !r.ok) PB.toast('Autosave failed: the browser storage may be full. Export the game from Manage saves.', 5000); } };
  // a Pokémon's name and sprite as a link to its career page (or card), with its team beside it
  UI.monLink = (G, id, tid, size) => { const m = PB.BYID[id], t = G.teams[tid]; return `<span data-act="${PB.Career ? 'career' : 'inspect'}" data-id="${id}" tabindex="0" style="cursor:pointer">${UI.spr(m, size || 20)} ${esc(m.dispName)}</span> <span class="dim">${t ? esc(t.abbr) : ''}</span>`; };
  UI.teamLabel = (G, id) => { const t = G.teams[id]; return `<span style="${id === G.userTeam ? 'color:var(--gold);font-weight:700' : ''}">${UI.logo ? UI.logo(t, 16) + ' ' : ''}${esc(t.name)}</span>`; };
})(window.PB);
