// Shareable team card: a PNG of your starters, record and logo, drawn on a canvas; download it or copy it to the clipboard.
(function (PB) {
  const UI = PB.UI, esc = UI.esc;
  const TC = PB.TeamCard = {};
  const LINK = 'poke82-beta.vercel.app';
  const imgCache = {};
  const load = src => imgCache[src] || (imgCache[src] = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16), f = c => Math.max(0, Math.min(255, Math.round(c * k))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

  // opts: showName (default true), title (second line, e.g. record and result)
  TC.draw = async function (G, tid, opts) {
    opts = opts || {};
    // opts.snap = { s: starter ids, b: bench ids } draws a saved lineup (Daily / Endless history) without needing the game that produced it
    const T = opts.snap ? { name: '', city: '', nick: '', id: 0 } : G.teams[tid], W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), spec = opts.snap ? { c1: '#3a4a8a', c2: '#ffffff' } : PB.Logo.spec(T), vis = opts.snap ? { P: true, O: true } : UI.vis();
    const starters = (opts.snap ? opts.snap.s : T.starters).slice(0, 5).map(id => PB.BYID[id]), bench = (opts.snap ? opts.snap.b : T.bench).slice(0, 7).map(id => PB.BYID[id]);
    const imgs = await Promise.all(starters.concat(bench).map(m => (PB.Atlas ? PB.Atlas.crop(m) : Promise.resolve(null)).then(c => c || load(m.sprite))));
    // background
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, shade(spec.c1, 0.55)); bg.addColorStop(0.55, '#0e1424'); bg.addColorStop(1, shade(spec.c2 === '#ffffff' ? spec.c1 : spec.c2, 0.35));
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.07; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(W - 120, H + 40, 380, 0, Math.PI * 2); g.stroke(); g.strokeRect(-30, H - 150, 330, 280); g.globalAlpha = 1;
    // header
    g.textBaseline = 'middle'; g.textAlign = 'left';
    if (opts.anon) {        // Daily / Endless: no team name or logo, just the result
      g.fillStyle = '#ffcb05'; g.font = '900 56px Segoe UI, Arial, sans-serif'; g.fillText(opts.title || 'My lineup', 50, 100, W - 470);
    } else {
      PB.Logo.canvas(g, T, 100, 100, 130, false);
      const name = opts.showName === false ? 'My Team' : T.name;
      g.fillStyle = '#fff'; g.font = '900 52px Segoe UI, Arial, sans-serif'; g.fillText(name, 190, 82, W - 460);
      g.fillStyle = '#ffcb05'; g.font = '700 28px Segoe UI, Arial, sans-serif'; g.fillText(opts.title || '', 192, 130, W - 460);
    }
    g.textAlign = 'right'; g.fillStyle = '#e8ecf5'; g.font = '900 30px Segoe UI, Arial, sans-serif'; g.fillText('POKÉHOOPS 82', W - 50, 70);
    g.fillStyle = '#9aa7c2'; g.font = '600 20px Segoe UI, Arial, sans-serif'; g.fillText(opts.sub || '', W - 50, 104);
    // starters
    const cw = 204, gap = 14, x0 = (W - (cw * 5 + gap * 4)) / 2, y0 = 190, ch = 300;
    starters.forEach((m, i) => {
      const x = x0 + i * (cw + gap);
      g.fillStyle = 'rgba(8,12,24,.62)'; rr(g, x, y0, cw, ch, 20); g.fill();
      g.strokeStyle = m.leg || m.myth ? '#ffcb05' : 'rgba(255,255,255,.18)'; g.lineWidth = m.leg || m.myth ? 3 : 2; rr(g, x, y0, cw, ch, 20); g.stroke();
      const im = imgs[i]; if (im) { const s = 150 / Math.max(im.width, im.height), w = im.width * s, h = im.height * s; g.imageSmoothingEnabled = false; g.drawImage(im, x + cw / 2 - w / 2, y0 + 22 + (150 - h) / 2, w, h); }
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '800 22px Segoe UI, Arial, sans-serif'; g.fillText(m.dispName, x + cw / 2, y0 + 205, cw - 20);
      if (vis.P) { g.fillStyle = '#9aa7c2'; g.font = '700 17px Segoe UI, Arial, sans-serif'; g.fillText(['PG', 'SG', 'SF', 'PF', 'C'][i] + ' · ' + m.pos[0], x + cw / 2, y0 + 232); }
      if (vis.O) { g.fillStyle = m.ovr >= 85 ? '#ffcb05' : m.ovr >= 70 ? '#2fd47a' : '#7cc4ff'; g.font = '900 34px Segoe UI, Arial, sans-serif'; g.fillText(String(m.ovr), x + cw / 2, y0 + 270); }
    });
    // bench
    g.textAlign = 'left'; g.fillStyle = '#9aa7c2'; g.font = '700 16px Segoe UI, Arial, sans-serif'; g.fillText('BENCH', x0, 520);
    bench.forEach((m, i) => { const im = imgs[5 + i]; if (!im) return; const s = 50 / Math.max(im.width, im.height); g.imageSmoothingEnabled = false; g.drawImage(im, x0 + 78 + i * 60 + (50 - im.width * s) / 2, 494 + (50 - im.height * s) / 2, im.width * s, im.height * s); });
    // footer
    g.textAlign = 'left'; g.fillStyle = '#e8ecf5'; g.font = '600 20px Segoe UI, Arial, sans-serif';
    g.fillText(opts.foot || '', x0, 596);
    g.textAlign = 'right'; g.fillStyle = '#ffcb05'; g.font = '800 22px Segoe UI, Arial, sans-serif'; g.fillText(LINK, W - 50, 596);
    return c;
  };
  TC.blob = c => new Promise(res => c.toBlob(res, 'image/png'));

  // ---------- modal ----------
  const st = { tid: 0, snap: null, showName: true, anon: false, title: '', sub: '', foot: '', canvas: null, busy: 0 };
  const redraw = async () => {
    const G = PB.G, seq = ++st.busy;
    const c = await TC.draw(G, st.tid, { snap: st.snap, showName: st.showName, anon: st.anon, title: st.title, sub: st.sub, foot: st.foot });
    if (seq !== st.busy) return; st.canvas = c;
    const host = document.getElementById('tc-host'); if (host) { host.innerHTML = ''; c.style.cssText = 'width:100%;max-width:760px;border-radius:10px;display:block'; host.appendChild(c); }
  };
  UI.teamCard = function (tid, o) {
    o = o || {};
    const G = PB.G || {}, lg = G.league, r = lg && tid != null && !o.snap ? lg.rec[tid] : null;
    st.snap = o.snap || null; st.tid = tid; st.showName = o.showName !== false; st.anon = !!o.anon;
    st.title = o.title != null ? o.title : r ? `${r.w}-${r.l}${lg.phase === 'done' && lg.champion === tid ? ' · Champions' : ''}` : '';
    st.sub = o.sub != null ? o.sub : o.snap ? '' : G.fr ? 'Season ' + G.fr.year : (G.daily ? 'Daily ' + G.daily.date : '');
    st.foot = o.foot != null ? o.foot : '';
    UI.modal(`<h2>Team card</h2>
      <div id="tc-host" style="min-height:200px"></div>
      ${st.anon ? '' : `<div class="row wrap" style="margin-top:10px"><label><input type="checkbox" data-change="tcName" ${st.showName ? 'checked' : ''}> Show my team name</label></div>`}
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button class="primary" data-act="tcDownload">Download PNG</button><button data-act="tcCopy">Copy image</button><button data-act="closeModal" autofocus>Close</button></div>`);
    redraw();
  };
  UI.actions.teamCard = (el, d) => UI.teamCard(+d.tid, d.daily ? { showName: false, anon: true, title: d.title || '', foot: d.foot || '' } : {});
  UI.teamCardButtonSaved = (kind, key, label) => `<button class="small" data-act="runCard" data-kind="${kind}" data-k="${key}">${label || '🖼 Team card'}</button>`;
  UI.actions.tcName = el => { st.showName = el.checked; redraw(); };
  UI.actions.tcDownload = async () => {
    if (!st.canvas) return;
    const b = await TC.blob(st.canvas), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'pokehoops-team.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };
  UI.actions.tcCopy = async () => {
    if (!st.canvas) return;
    try { const b = await TC.blob(st.canvas); await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]); PB.toast('Image copied'); }
    catch (e) { PB.toast('Copying images is not supported here. Use Download instead.', 3500); }
  };
  UI.teamCardButton = (tid, label) => `<button data-act="teamCard" data-tid="${tid}">${label || '🖼 Team card'}</button>`;

  // roster tab gets a button
  const roster = UI.hubTabs.roster;
  UI.hubTabs.roster = function (G, lg, p) { return `<div class="row" style="justify-content:flex-end;margin-bottom:6px">${UI.teamLookButton ? UI.teamLookButton(G.userTeam) : ''}${UI.teamCardButton(G.userTeam)}</div>` + roster(G, lg, p); };
})(window.PB);
