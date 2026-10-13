// Season shot charts: every game's shots are binned into floor zones (real locations for games you play, estimated ones for simulated
// games that still add up to the box score), kept per player and per team, and drawn as a heat map against the league average.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, L = PB.League;
  const Z = PB.Zones = {};
  Z.NAMES = ['Restricted area', 'In the paint', 'Mid-range left', 'Mid-range center', 'Mid-range right', 'Left corner 3', 'Left wing 3', 'Top of the key 3', 'Right wing 3', 'Right corner 3'];
  const BASE = [0.62, 0.46, 0.40, 0.42, 0.40, 0.38, 0.35, 0.35, 0.35, 0.38];     // typical make rates, used when estimating simulated games
  const N = Z.NAMES.length;

  // zone of a floor point in the attack frame (basket at x = 88.75, y = 25); kind: 0 rim, 1 mid, 2 post, 3 three
  Z.zoneOf = function (x, y, kind) {
    const dx = 88.75 - x, dy = y - 25, d = Math.hypot(dx, dy);
    if (kind === 3 || (kind == null && (dx < 14 ? Math.abs(dy) >= 22 : d >= 23.75))) {
      if (dx < 14) return dy < 0 ? 5 : 9;
      const a = Math.atan2(dy, dx);
      return a < -0.55 ? 6 : a > 0.55 ? 8 : 7;
    }
    if (kind === 0 || (kind == null && d < 4.2)) return d < 4.5 ? 0 : 1;
    if (Math.abs(dy) < 8 && dx < 19 && d < 17) return 1;
    return dy < -8 ? 2 : dy > 8 ? 4 : 3;
  };
  const blank = () => new Array(N * 2).fill(0);
  const add = (map, key, z, made) => { const a = map[key] || (map[key] = blank()); a[z * 2]++; if (made) a[z * 2 + 1]++; };

  // simulated games: spread a player's attempts over zones from their tendencies, then pick exactly their made shots
  function estimate(box, rng) {
    const out = [];
    for (const id in box) {
      const x = box[id], m = PB.BYID[id]; if (!x || !x.fga) continue;
      const t = m.tend, two = x.fga - x.tpa, made2 = x.fgm - x.tpm;
      const side = (m.id % 3) - 1;                      // a slight, stable left / right lean
      const mine = [];
      const rimW = t.rimRate + 0.1, midW = t.midRate * 0.7 + 0.05, postW = t.postRate;
      for (let i = 0; i < two; i++) {
        const k = rng.weighted([rimW, midW, postW]);
        mine.push(k === 0 ? (rng.chance(0.75) ? 0 : 1) : k === 2 ? 1 : [2, 3, 4][rng.weighted([1 - side * 0.3, 1.2, 1 + side * 0.3])]);
      }
      for (let i = 0; i < x.tpa; i++) mine.push([5, 6, 7, 8, 9][rng.weighted([0.8 + side * 0.1, 1.2 + side * 0.15, 1.5, 1.2 - side * 0.15, 0.8 - side * 0.1])]);
      // makes: weighted draw without replacement by each zone's typical rate, two-pointers and threes kept separate
      const pick = (idx, n) => { const pool = idx.slice(), w = pool.map(i => BASE[mine[i]]), res = []; while (res.length < n && pool.length) { const j = rng.weighted(w); res.push(pool[j]); pool.splice(j, 1); w.splice(j, 1); } return res; };
      const twos = [], threes = []; mine.forEach((z, i) => (z >= 5 ? threes : twos).push(i));
      const madeIdx = new Set(pick(twos, made2).concat(pick(threes, x.tpm)));
      mine.forEach((z, i) => out.push([+id, z, madeIdx.has(i) ? 1 : 0]));
    }
    return out;
  }

  const origRecord = L.record;
  L.record = function (G, game, result, playoff) {
    origRecord(G, game, result, playoff);
    const lg = G.league; lg.zones = lg.zones || { reg: { p: {}, t: {}, d: {} }, po: { p: {}, t: {}, d: {} } };
    const Zs = lg.zones[playoff ? 'po' : 'reg'], tid = [game.h, game.a];
    const rng = new PB.RNG((((game.day + 3) * 2654435761) ^ (game.h * 131 + game.a * 7919)) >>> 0);
    for (let s = 0; s < 2; s++) {
      let shots;
      if (result.shots && result.shots.length) shots = result.shots.filter(sh => sh[0] === s).map(sh => [sh[5], Z.zoneOf(sh[1], sh[2], sh[4]), sh[3] ? 1 : 0]);
      else shots = estimate(result.box[s], rng);
      for (const [pid, z, made] of shots) { add(Zs.p, pid, z, made); add(Zs.t, tid[s], z, made); add(Zs.d, tid[1 - s], z, made); }
    }
  };

  // ---------- chart ----------
  let grid = null;
  const cells = () => {
    if (grid) return grid;
    const rows = [];
    for (let Y = 0; Y < 47; Y++) { const row = []; for (let X = 0; X < 50; X++) row.push(Z.zoneOf(94 - (Y + 0.5), X + 0.5, null)); rows.push(row); }
    const cen = Array.from({ length: N }, () => [0, 0, 0]);
    rows.forEach((row, Y) => row.forEach((z, X) => { cen[z][0] += X + 0.5; cen[z][1] += Y + 0.5; cen[z][2]++; }));
    return grid = { rows, cen: cen.map(c => [c[0] / (c[2] || 1), c[1] / (c[2] || 1)]) };
  };
  const sumZ = list => { const t = blank(); for (const a of list) if (a) for (let i = 0; i < t.length; i++) t[i] += a[i]; return t; };
  Z.league = (lg, po) => sumZ(Object.values(lg.zones[po ? 'po' : 'reg'].p));
  const heat = (r, lgr, att) => {            // diverging colour: cold blue .. neutral .. hot red, by FG% relative to the league in that zone
    if (att < 3) return 'rgba(120,130,150,.18)';
    const d = Math.max(-0.2, Math.min(0.2, r - lgr)) / 0.2;
    const a = 0.25 + 0.5 * Math.abs(d) + Math.min(0.2, att / 80);
    return d >= 0 ? `rgba(${200 + 55 * d | 0},${150 - 70 * d | 0},60,${a.toFixed(2)})` : `rgba(${80 + 40 * d | 0},${130 - 20 * d | 0},${200 - 20 * d | 0},${a.toFixed(2)})`;
  };
  Z.svg = function (data, ref) {
    const g = cells(), parts = [];
    g.rows.forEach((row, Y) => {
      let s = 0;
      for (let X = 1; X <= 50; X++) if (X === 50 || row[X] !== row[s]) { const z = row[s], at = data[z * 2], mk = data[z * 2 + 1], lr = ref[z * 2] ? ref[z * 2 + 1] / ref[z * 2] : BASE[z]; parts.push(`<rect x="${s}" y="${Y}" width="${X - s}" height="1.02" fill="${heat(at ? mk / at : 0, lr, at)}"/>`); s = X; }
    });
    const labels = g.cen.map(([cx, cy], z) => { const at = data[z * 2], mk = data[z * 2 + 1]; if (!at) return ''; return `<text x="${cx.toFixed(1)}" y="${(cy - 0.2).toFixed(1)}" text-anchor="middle" font-size="2.7" font-weight="800" fill="#fff" stroke="#000" stroke-width=".35" paint-order="stroke">${Math.round(mk / at * 100)}%</text><text x="${cx.toFixed(1)}" y="${(cy + 2.6).toFixed(1)}" text-anchor="middle" font-size="1.9" fill="#fff" stroke="#000" stroke-width=".3" paint-order="stroke">${mk}/${at}</text>`; }).join('');
    return `<svg viewBox="-1 -1 52 49" style="width:100%;max-width:480px;background:#27324a;border-radius:8px"><g>${parts.join('')}</g><g fill="none" stroke="#fff" stroke-width=".35" opacity=".85"><rect x="0" y="0" width="50" height="47"/><rect x="17" y="0" width="16" height="19"/><path d="M19 19 A6 6 0 0 0 31 19"/><path d="M19 19 A6 6 0 0 1 31 19" stroke-dasharray="1 1"/><path d="M3 0 V14 A23.75 23.75 0 0 0 47 14 V0"/><circle cx="25" cy="5.25" r="4"/><path d="M22 4 H28"/></g><circle cx="25" cy="5.25" r=".75" fill="none" stroke="#ff7a1a" stroke-width=".3"/>${labels}</svg>`;
  };

  const view = { mode: 'player', team: null, pid: null, po: false };
  UI.addHubTab('charts', 'Shot Charts', 'stats', function (G, lg) {
    if (!lg.zones) return '<div class="panel dim">Shot charts fill in as games are played.</div>';
    const Zs = lg.zones[view.po ? 'po' : 'reg'], hasPO = Object.keys(lg.zones.po.p).length;
    if (view.po && !hasPO) view.po = false;
    if (view.team == null || !G.teams[view.team]) view.team = G.userTeam;
    const ids = G.teams[view.team].roster.filter(id => Zs.p[id]).sort((a, b) => Zs.p[b].reduce((s, v, i) => s + (i % 2 ? 0 : v), 0) - Zs.p[a].reduce((s, v, i) => s + (i % 2 ? 0 : v), 0));
    if (!view.pid || !ids.includes(+view.pid)) view.pid = ids[0];
    const ref = Z.league(lg, view.po);
    const data = view.mode === 'player' ? (Zs.p[view.pid] || blank()) : view.mode === 'team' ? (Zs.t[view.team] || blank()) : view.mode === 'allowed' ? (Zs.d[view.team] || blank()) : ref;
    const att = data.reduce((s, v, i) => s + (i % 2 ? 0 : v), 0), mk = data.reduce((s, v, i) => s + (i % 2 ? v : 0), 0);
    const rows = Z.NAMES.map((n, z) => { const a = data[z * 2], m = data[z * 2 + 1], la = ref[z * 2], lm = ref[z * 2 + 1], fg = a ? m / a : 0, lfg = la ? lm / la : 0, d = a >= 3 ? (fg - lfg) * 100 : null; return `<tr><td>${n}</td><td class="n">${m}-${a}</td><td class="n">${a ? (fg * 100).toFixed(0) + '%' : '-'}</td><td class="n dim">${la ? (lfg * 100).toFixed(0) + '%' : '-'}</td><td class="n ${d == null ? 'dim' : d >= 3 ? 'good' : d <= -3 ? 'bad' : ''}">${d == null ? '-' : (d > 0 ? '+' : '') + d.toFixed(0)}</td></tr>`; }).join('');
    const hot = data.map((v, i) => i).filter(i => i % 2 === 0 && data[i] >= 8).map(i => ({ z: i / 2, d: data[i + 1] / data[i] - (ref[i] ? ref[i + 1] / ref[i] : 0.4) })).sort((a, b) => b.d - a.d);
    return `<div class="panel"><div class="row between wrap"><h3 style="margin:0">Season shot charts</h3><div class="row wrap">
        <label>View <select data-change="szMode">${[['player', 'Player'], ['team', 'Team shooting'], ['allowed', 'Shots allowed'], ['league', 'Whole league']].map(([v, l]) => `<option value="${v}" ${view.mode === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${view.mode !== 'league' ? `<label>Team <select data-change="szTeam">${G.teams.map(t => `<option value="${t.id}" ${t.id === view.team ? 'selected' : ''}>${esc(t.abbr)}${t.id === G.userTeam ? ' ★' : ''}</option>`).join('')}</select></label>` : ''}
        ${view.mode === 'player' ? `<label>Pokémon <select data-change="szPid">${ids.map(id => `<option value="${id}" ${id === +view.pid ? 'selected' : ''}>${esc(PB.BYID[id].dispName)}</option>`).join('')}</select></label>` : ''}
        ${hasPO ? `<label><input type="checkbox" data-change="szPO" ${view.po ? 'checked' : ''}> Playoffs</label>` : ''}</div></div>
      <div class="dim" style="font-size:12px;margin:6px 0">Warm zones are above the league average, cool zones below.</div>
      <div class="row wrap" style="align-items:flex-start"><div class="grow" style="min-width:280px">${Z.svg(data, ref)}</div>
        <div style="min-width:260px;font-size:13px"><div class="kpi"><div><b>${mk}-${att}</b><span>FG</span></div><div><b>${att ? (mk / att * 100).toFixed(1) : 0}%</b><span>FG%</span></div></div>
        ${hot.length ? `<div style="margin-top:6px"><span class="tag good">Hot: ${Z.NAMES[hot[0].z]}</span> ${hot.length > 1 ? `<span class="tag bad">Cold: ${Z.NAMES[hot[hot.length - 1].z]}</span>` : ''}</div>` : ''}
        <table class="t" style="margin-top:8px"><thead><tr><th>Zone</th><th class="n">FG</th><th class="n">FG%</th><th class="n">Lg</th><th class="n">+/-</th></tr></thead><tbody>${rows}</tbody></table></div></div></div>`;
  });
  UI.actions.szMode = el => { view.mode = el.value; UI.refresh(); };
  UI.actions.szTeam = el => { view.team = +el.value; view.pid = null; UI.refresh(); };
  UI.actions.szPid = el => { view.pid = +el.value; UI.refresh(); };
  UI.actions.szPO = el => { view.po = el.checked; UI.refresh(); };
})(window.PB);
