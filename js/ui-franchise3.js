// Franchise UI: the animated draft lottery and the Scouting tab (scout next year's draft class all season long).
(function (PB) {
  const UI = PB.UI, esc = UI.esc, A = UI.actions, F = PB.Franchise;
  const seen = { lot: null };

  // ---------- draft lottery animation ----------
  // reveal from the last lottery pick up to #1; the drawn picks (the top ones) get the long drum roll
  function lotSteps(G) {
    const D = G.fr.draft, Lt = D && D.lottery; if (!Lt || !Lt.teams.length) return null;
    const A0 = D.added.length, nLot = Lt.teams.length, k = Lt.drawn.length, list = [];
    for (let pos = A0 + nLot - 1; pos >= A0; pos--) { const t = Lt.base[pos]; list.push({ pos, rank: pos - A0 + 1, t, drawn: pos < A0 + k, moved: Lt.teams.indexOf(t) - (pos - A0) }); }
    return { list, A0, nLot, k, Lt };
  }
  const css = document.createElement('style');
  css.textContent = `
    .lot { text-align: center; } .lot-main { display: flex; gap: 18px; flex-wrap: wrap; justify-content: center; margin: 10px 0; }
    .lot-machine { position: relative; width: 270px; height: 210px; border-radius: 50% / 45%; border: 3px solid var(--line); background: radial-gradient(circle at 50% 35%, rgba(255,255,255,.08), rgba(0,0,0,.35)); overflow: hidden; }
    .lball { position: absolute; width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font: 900 11px Segoe UI, sans-serif; border: 2px solid rgba(255,255,255,.7); box-shadow: inset -4px -4px 8px rgba(0,0,0,.35), 0 2px 5px rgba(0,0,0,.5); }
    .lball.pop { animation: lpop .7s ease-in forwards; }
    @keyframes lpop { 0% { transform: scale(1); opacity: 1; } 60% { transform: translate(0, -90px) scale(1.7); opacity: 1; } 100% { transform: translate(0, -110px) scale(0); opacity: 0; } }
    .lot-board { min-width: 250px; text-align: left; } .lot-row { display: flex; gap: 8px; align-items: center; padding: 3px 8px; border-radius: 6px; font-size: 14px; border: 1px solid transparent; }
    .lot-row .no { width: 34px; font-weight: 800; color: var(--dim); } .lot-row.hid { opacity: .35; } .lot-row.me { border-color: var(--gold); background: rgba(255,203,5,.1); }
    .lot-row.fresh { animation: lfresh 1.2s ease-out; } @keyframes lfresh { 0% { background: rgba(255,203,5,.55); transform: scale(1.05); } 100% { transform: scale(1); } }
    .lot-row .up { color: #2fd47a; font-size: 12px; font-weight: 700; } .lot-row .dn { color: #ff5a5f; font-size: 12px; font-weight: 700; }`;
  document.head.appendChild(css);

  let run = null;
  UI.lottery = function (G) {
    const S = lotSteps(G); if (!S) { PB.toast('There is no lottery this year'); return; }
    const me = G.userTeam, fr = G.fr, D = fr.draft;
    const balls = S.Lt.teams.map((t, i) => { const T = G.teams[t], c = PB.teamColors(T), l = PB.Logo ? PB.Logo.spec(T) : { txt: '#fff' };
      const r = (a, b) => (a + Math.random() * (b - a)).toFixed(0);
      return `<div class="lball" data-t="${t}" style="left:${r(10, 215)}px;top:${r(30, 150)}px;background:${c[0]};color:${l.txt};--dx:${r(-90, 90)}px;--dy:${r(-70, 55)}px;--d:${(0.9 + Math.random() * 1.1).toFixed(2)}s;--dl:-${(Math.random() * 2).toFixed(2)}s">${esc(T.abbr)}</div>`; }).join('');
    const rows = Array.from({ length: S.nLot }, (_, i) => `<div class="lot-row hid" data-rank="${i + 1}"><span class="no">#${S.A0 + i + 1}</span><span class="nm">· · ·</span></div>`).join('');
    const odds = S.Lt.odds.slice(0, 6).map(o => `<span class="tag">${esc(G.teams[o.t].abbr)} ${Math.round(o.p * 100)}%</span>`).join(' ');
    UI.modal(`<div class="lot"><h2>🎰 Season ${fr.year} Draft Lottery</h2>
      <div class="dim" style="font-size:13px">${S.nLot} teams missed the playoffs. The top ${S.k} picks are drawn; the rest follow the standings.</div>
      <div class="dim" style="font-size:12px;margin-top:4px">Best odds for the top pick: ${odds}</div>
      <div class="lot-main"><div class="lot-machine" id="lot-machine">${balls}</div><div class="lot-board" id="lot-board">${S.A0 ? `<div class="dim" style="font-size:12px">Expansion teams pick first (${S.A0}).</div>` : ''}${rows}</div></div>
      <div class="row center"><button class="gold" data-act="lotGo" id="lot-go" autofocus>Start the lottery</button><button data-act="lotSkip">Skip to the result</button><button data-act="lotDone">Continue to the draft</button></div></div>`);
    run = { S, i: 0, on: false, me, G, id: ++UI._lotId || (UI._lotId = 1) };
    setTimeout(bounce, 30);
  };
  // the balls really bounce: straight-line motion inside the elliptical drum, reflecting off its wall and off each other (much faster during a draw)
  function bounce() {
    const m = document.getElementById('lot-machine'); if (!m) return;
    const W = m.clientWidth || 270, H = m.clientHeight || 210, R = 19, cx = W / 2, cy = H / 2, rx = W / 2 - R - 3, ry = H / 2 - R - 3;
    const balls = Array.from(m.querySelectorAll('.lball')).map(el => {
      const a = Math.random() * Math.PI * 2, sp = 110 + Math.random() * 90, ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
      return { el, x: cx + Math.cos(ang) * rx * rr * 0.9, y: cy + Math.sin(ang) * ry * rr * 0.9, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp };
    });
    let last = performance.now();
    const tick = now => {
      if (!m.isConnected) return;
      const dt = Math.min(0.04, (now - last) / 1000); last = now;
      const live = balls.filter(b => b.el.isConnected && !b.el.classList.contains('pop')), boost = m.classList.contains('draw') ? 3.2 : 1;
      for (const b of live) {
        b.x += b.vx * dt * boost; b.y += b.vy * dt * boost;
        const nx = (b.x - cx) / rx, ny = (b.y - cy) / ry, d = nx * nx + ny * ny;
        if (d > 1) {                                       // hit the wall: reflect about the ellipse's normal and move back inside
          const gx = nx / rx, gy = ny / ry, gl = Math.hypot(gx, gy) || 1, ux = gx / gl, uy = gy / gl, dot = b.vx * ux + b.vy * uy;
          if (dot > 0) { b.vx -= 2 * dot * ux; b.vy -= 2 * dot * uy; }
          const k = 1 / Math.sqrt(d); b.x = cx + (b.x - cx) * k; b.y = cy + (b.y - cy) * k;
        }
      }
      for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
        const a = live[i], c = live[j], dx = c.x - a.x, dy = c.y - a.y, dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < R * 2) {
          const ux = dx / dist, uy = dy / dist, va = a.vx * ux + a.vy * uy, vc = c.vx * ux + c.vy * uy;
          a.vx += (vc - va) * ux; a.vy += (vc - va) * uy; c.vx += (va - vc) * ux; c.vy += (va - vc) * uy;
          const push = (R * 2 - dist) / 2; a.x -= ux * push; a.y -= uy * push; c.x += ux * push; c.y += uy * push;
        }
      }
      for (const b of live) { b.el.style.left = (b.x - R) + 'px'; b.el.style.top = (b.y - R) + 'px'; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  const board = i => document.querySelector('#lot-board [data-rank="' + i + '"]');
  const reveal = (st, fresh) => {
    const r = run, G = r.G, S = r.S, T = G.teams[st.t], row = board(st.rank); if (!row) return;
    row.className = 'lot-row' + (st.t === r.me ? ' me' : '') + (fresh ? ' fresh' : '');
    row.querySelector('.nm').innerHTML = `${UI.logo ? UI.logo(T, 20) : ''} <b>${esc(T.name)}</b> ${st.moved > 0 ? `<span class="up">▲ up ${st.moved}</span>` : st.moved < 0 ? `<span class="dn">▼ down ${-st.moved}</span>` : ''}`;
    const b = document.querySelector('.lball[data-t="' + st.t + '"]'); if (b) { if (fresh) { b.classList.add('pop'); setTimeout(() => b.remove(), 750); } else b.remove(); }
  };
  const step = () => {
    const r = run; if (!r || !r.on || !document.getElementById('lot-machine')) { if (r) r.on = false; return; }
    if (r.i >= r.S.list.length) { r.on = false; finish(); return; }
    const st = r.S.list[r.i], machine = document.getElementById('lot-machine'), wait = st.drawn ? 1900 : 520;
    machine.classList.toggle('draw', st.drawn);
    setTimeout(() => { if (run !== r || !r.on) return; machine.classList.remove('draw'); reveal(st, true); r.i++; PB.Audio && PB.Audio.play(st.drawn ? 'three' : 'click'); setTimeout(step, st.drawn ? 900 : 260); }, wait);
  };
  function finish() {
    const r = run; if (!r) return; const mine = r.S.list.find(s => s.t === r.me);
    const go = document.getElementById('lot-go'); if (go) { go.disabled = true; go.textContent = 'Lottery complete'; }
    if (mine) PB.toast(`Your pick: #${r.S.A0 + mine.rank}${mine.moved > 0 ? ' (moved up ' + mine.moved + ')' : ''}`, 3500);
    const done = document.querySelector('[data-act="lotDone"]'); if (done) done.focus();
  }
  A.lotGo = () => { if (!run || run.on || run.i >= run.S.list.length) return; run.on = true; const go = document.getElementById('lot-go'); if (go) go.disabled = true; step(); };
  A.lotSkip = () => { if (!run) return; run.on = false; while (run.i < run.S.list.length) { reveal(run.S.list[run.i], false); run.i++; } const m = document.getElementById('lot-machine'); if (m) m.classList.remove('draw'); finish(); };
  A.lotDone = () => { if (run) run.on = false; run = null; UI.closeModal(); UI.refresh(); };
  A.frLottery = () => UI.lottery(PB.G);
  // opens by itself once when a draft begins
  UI.lotteryAuto = function (G) {
    const fr = G.fr, key = fr.year + ':' + (fr.classNo || 0);
    if (fr.stage !== 'draft' || !fr.draft || !fr.draft.lottery || !fr.draft.lottery.teams.length || seen.lot === key) return;
    seen.lot = key; setTimeout(() => { if (!UI.modalOpen() && PB.G === G) UI.lottery(G); }, 350);
  };

  // ---------- scouting tab ----------
  const H = () => UI.frH, sv = { q: '', sort: 'id', type: 'ALL' };
  const inDraft0 = UI.inDraft;
  UI.inDraft = () => inDraft0() || (UI.cur === 'hub' && UI.params && UI.params.tab === 'scouting');       // prospects never show their ratings
  UI.addHubTab('scouting', 'Scouting', 'roster', function (G, lg) {
    const fr = G.fr, h = H(), me = G.userTeam, ids = F.nextClassIds(G), pts = (fr.scoutPts && fr.scoutPts[me]) || 0, v = UI.vis(true);
    const list = h.filterMons(ids.map(id => PB.BYID[id]), { q: sv.q, sort: sv.sort, type: sv.type, hide: true });
    const nLeg = ids.filter(id => PB.isLegend(PB.BYID[id])).length;
    const live = fr.stage === 'draft';
    const scouted = ids.filter(id => F.scouted(G, me, id)).map(id => ({ id, g: F.scoutGrade(G, id) })).sort((a, b) => 'A+A A-B+B B-C+C D'.indexOf(a.g.padEnd(2)) - 'A+A A-B+B B-C+C D'.indexOf(b.g.padEnd(2)));
    const rows = list.slice(0, 120).map(m => `<tr><td>${h.monCell(m)}</td><td>${m.types.map(t => `<span class="pill" style="background:${PB.TYPE_COLORS[t]};font-size:9px">${t}</span>`).join(' ')}${PB.isLegend(m) ? ' <span class="tag leg">' + (m.myth ? 'MYTHICAL' : 'LEGENDARY') + '</span>' : ''}</td>${v.P ? `<td>${UI.posBadges(m)}</td>` : ''}${v.A ? `<td style="font-size:11px">${esc(m.archOff)}<div class="dim">${esc(m.archDef)}</div></td>` : ''}${h.baseCells(m, v)}<td style="font-size:11px">${UI.abilTag ? UI.abilTag(m.id) : ''}</td><td style="font-size:11px">${h.scoutCell(G, m)}</td><td style="font-size:11px;max-width:220px">${h.evoLine(m)}</td></tr>`).join('');
    return `<div class="panel"><div class="row between wrap"><div><h2 style="margin:0">Scouting</h2>
        <div class="dim">${ids.length ? `${live ? 'The draft is under way' : 'The next draft class'}: <b>${ids.length}</b> prospects, ${nLeg} legendary / mythical. Ratings and overall stay hidden until a Pokémon is drafted; scouting reveals a grade for its hidden talent and ceiling.` : 'There are no draft classes left to scout.'}</div></div>
        <div class="kpi"><div><b class="gold">${pts}</b><span>Scouting points</span></div><div><b>${scouted.length}</b><span>Scouted</span></div><div><b>${ids.length}</b><span>Prospects</span></div></div></div>
      ${scouted.length ? `<div class="row wrap" style="margin-top:8px"><span class="dim">Your scouting reports:</span> ${scouted.slice(0, 14).map(x => `<span class="tag" data-act="inspect" data-id="${x.id}" style="cursor:pointer">${esc(PB.BYID[x.id].dispName)} <b class="gold">${x.g}</b></span>`).join(' ')}</div>` : ''}
      <div class="row wrap" style="margin:10px 0 6px"><select data-change="scType"><option value="ALL">All types</option>${PB.TYPES.map(t => `<option ${sv.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${h.sortSelect(sv.sort, 'scSort', true)}<input type="text" id="scq" placeholder="search name…" value="${esc(sv.q)}" oninput="PB.UI.scSearch(this.value)"></div>
      <div class="scroll"><table class="t"><thead><tr><th>Pokémon</th><th>Type</th>${v.P ? '<th>Pos</th>' : ''}${v.A ? '<th>Archetype</th>' : ''}${h.baseHead(v)}<th>Ability</th><th>Scouting</th><th>Evolution line</th></tr></thead><tbody>${rows || '<tr><td colspan="12" class="dim">Nothing to show.</td></tr>'}</tbody></table></div></div>`;
  }, G => G.mode === 'franchise' && G.fr && G.fr.stage !== 'over');
  A.scType = el => { sv.type = el.value; UI.refresh(); };
  A.scSort = el => { sv.sort = el.value; UI.refresh(); };
  UI.scSearch = q => { sv.q = q; UI.refresh(); const e = document.getElementById('scq'); if (e) { e.focus(); e.setSelectionRange(q.length, q.length); } };
})(window.PB);
