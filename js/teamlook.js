// Team customization: logo shape and symbol, jersey / team colors and the court paint color. Stored on the team (t.custom), changed through
// an op so online leagues see it too, and read by PB.teamColors / PB.Logo so every screen, jersey and the court follow it.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, Logo = PB.Logo;
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const PRESETS = [['#c8102e', '#ffffff'], ['#1d428a', '#ffc72c'], ['#007a33', '#ffffff'], ['#552583', '#fdb927'], ['#ff7a1a', '#101828'], ['#0e2240', '#fec524'], ['#00788c', '#f9a01b'], ['#e03a3e', '#c1d32f'], ['#f5f5f5', '#c8102e'], ['#101828', '#2fd47a'], ['#ffcb05', '#3b4cca'], ['#ec4899', '#1e1b4b']];
  const SYMBOLS = ['', '⚡', '🔥', '🌊', '🌿', '❄️', '🐉', '👻', '⭐', '🏀', '🦅', '🌙', '💎', '🍃'];
  const SHAPES = Logo.SHAPES;

  // colors: [primary, accent, court paint]
  const baseColors = PB.teamColors;
  PB.teamColors = t => { const c = t && t.custom; return c && HEX.test(c.c1 || '') ? [c.c1, HEX.test(c.c2 || '') ? c.c2 : '#ffffff', HEX.test(c.c3 || '') ? c.c3 : c.c1] : baseColors(t); };
  const baseSpec = Logo.spec;
  Logo.spec = function (t) {
    const s = baseSpec(t), c = t && t.custom;
    if (!c) return s;
    if (c.shape && Logo.PATHS[c.shape]) { s.shape = c.shape; s.path = Logo.PATHS[c.shape]; }
    if (c.symbol) s.abbr = Array.from(c.symbol).slice(0, 3).join('');
    return s;
  };

  // the op: only the owner changes a team's look (validated everywhere)
  PB.Ops.handlers.teamLook = (G, a, m) => {
    if (a.tid != null && m && m.from != null && m.from !== a.tid && !m.host) throw new Error('That is not your team');
    const T = G.teams[a.tid != null ? a.tid : m.from], l = a.look;
    if (!l) { delete T.custom; return; }
    if (!HEX.test(l.c1) || !HEX.test(l.c2) || (l.c3 && !HEX.test(l.c3))) throw new Error('Bad colors');
    T.custom = { c1: l.c1, c2: l.c2, c3: l.c3 || l.c1, shape: SHAPES.includes(l.shape) ? l.shape : null, symbol: Array.from(String(l.symbol || '')).slice(0, 3).join('') };
  };

  // ---------- editor ----------
  const E = { tid: 0, c1: '#c8102e', c2: '#ffffff', c3: '#c8102e', shape: null, symbol: '' };
  const preview = () => {
    const G = PB.G, T = G.teams[E.tid], fake = Object.assign({}, T, { custom: { c1: E.c1, c2: E.c2, c3: E.c3, shape: E.shape, symbol: E.symbol } });
    const host = document.getElementById('tl-prev'); if (!host) return;
    host.innerHTML = `<div class="row" style="gap:18px;align-items:center;flex-wrap:wrap">${UI.logo(fake, 84)}
      <svg viewBox="0 0 120 100" width="130" height="108"><path d="M30 8 L45 18 Q60 28 75 18 L90 8 L112 24 L98 46 L88 40 V94 H32 V40 L22 46 L8 24 Z" fill="${E.c1}" stroke="${E.c2}" stroke-width="4" stroke-linejoin="round"/><path d="M45 18 Q60 30 75 18" fill="none" stroke="${E.c2}" stroke-width="4"/><text x="60" y="62" text-anchor="middle" font-size="26" font-weight="900" fill="${E.c2}" font-family="Segoe UI,Arial">${esc(String(PB.G.teams[E.tid].abbr).slice(0, 3))}</text></svg>
      <svg viewBox="0 0 120 70" width="150" height="88"><rect x="0" y="0" width="120" height="70" rx="6" fill="#c98d4f"/><rect x="0" y="22" width="30" height="26" fill="${E.c3}"/><rect x="90" y="22" width="30" height="26" fill="${E.c3}"/><circle cx="60" cy="35" r="11" fill="${E.c3}"/><g fill="none" stroke="#fff" stroke-width="1.2" opacity=".85"><rect x="1" y="1" width="118" height="68"/><line x1="60" y1="1" x2="60" y2="69"/></g></svg></div>`;
  };
  UI.teamLook = function (tid) {
    const G = PB.G, T = G.teams[tid], cur = T.custom, base = PB.teamColors(Object.assign({}, T, { custom: null }));
    const col = cur && HEX.test(cur.c1) ? [cur.c1, cur.c2, cur.c3 || cur.c1] : [base[0], base[1], base[0]];
    Object.assign(E, { tid, c1: col[0], c2: col[1], c3: col[2], shape: cur && cur.shape || null, symbol: cur && cur.symbol || '' });
    const shapeBtns = [null].concat(SHAPES).map(s => `<button class="small ${E.shape === s ? 'primary' : ''}" data-act="tlShape" data-s="${s || ''}" title="${s || 'default'}">${s ? `<svg viewBox="0 0 100 100" width="22" height="22"><path d="${Logo.PATHS[s]}" fill="currentColor"/></svg>` : 'Auto'}</button>`).join('');
    UI.modal(`<h2>Customize ${esc(T.name)}</h2>
      <div id="tl-prev" style="margin-bottom:10px"></div>
      <div class="col" style="gap:8px">
        <div><div class="dim" style="font-size:12px">Logo shape</div><div class="row wrap" id="tl-shapes">${shapeBtns}</div></div>
        <div><div class="dim" style="font-size:12px">Symbol (replaces the letters; up to 3 characters)</div><div class="row wrap"><input type="text" id="tl-sym" value="${esc(E.symbol)}" maxlength="6" style="width:80px" oninput="PB.UI.tlSymbol(this.value)">${SYMBOLS.map(s => `<button class="small" data-act="tlSym" data-s="${s}">${s || 'Letters'}</button>`).join('')}</div></div>
        <div class="row wrap" style="gap:14px"><label>Primary <input type="color" id="tl-c1" value="${E.c1}" oninput="PB.UI.tlColor('c1',this.value)"></label><label>Secondary <input type="color" id="tl-c2" value="${E.c2}" oninput="PB.UI.tlColor('c2',this.value)"></label><label>Court paint <input type="color" id="tl-c3" value="${E.c3}" oninput="PB.UI.tlColor('c3',this.value)"></label></div>
        <div><div class="dim" style="font-size:12px">Color presets</div><div class="row wrap">${PRESETS.map((p, i) => `<button class="small" data-act="tlPreset" data-i="${i}" style="background:linear-gradient(90deg,${p[0]} 50%,${p[1]} 50%);width:44px;height:26px;padding:0"></button>`).join('')}</div></div>
      </div>
      <div class="row" style="margin-top:14px;justify-content:flex-end"><button class="primary" data-act="tlSave" autofocus>Save</button><button data-act="tlReset">Reset to default</button><button data-act="closeModal">Cancel</button></div>`);
    preview();
  };
  UI.tlColor = (k, v) => { E[k] = v; preview(); };
  UI.tlSymbol = v => { E.symbol = Array.from(v).slice(0, 3).join(''); preview(); };
  const setInputs = () => { for (const k of ['c1', 'c2', 'c3']) { const e = document.getElementById('tl-' + k); if (e) e.value = E[k]; } const s = document.getElementById('tl-sym'); if (s) s.value = E.symbol; };
  UI.actions.tlShape = (el, d) => { E.shape = d.s || null; document.querySelectorAll('#tl-shapes button').forEach(b => b.classList.toggle('primary', (b.dataset.s || null) === E.shape)); preview(); };
  UI.actions.tlSym = (el, d) => { E.symbol = d.s; setInputs(); preview(); };
  UI.actions.tlPreset = (el, d) => { const p = PRESETS[+d.i]; E.c1 = p[0]; E.c2 = p[1]; E.c3 = p[0]; setInputs(); preview(); };
  UI.actions.tlSave = () => PB.Ops.run('teamLook', { tid: E.tid, look: { c1: E.c1, c2: E.c2, c3: E.c3, shape: E.shape, symbol: E.symbol } }, err => { if (err) PB.toast(err, 3000); else { UI.closeModal(); UI.refresh(); PB.toast('Team look saved'); } });
  UI.actions.tlReset = () => PB.Ops.run('teamLook', { tid: E.tid, look: null }, err => { if (err) PB.toast(err, 3000); else { UI.closeModal(); UI.refresh(); PB.toast('Back to the default look'); } });
  UI.actions.teamLook = (el, d) => UI.teamLook(+d.tid);
  UI.teamLookButton = tid => `<button data-act="teamLook" data-tid="${tid}">🎨 Customize</button>`;
})(window.PB);
