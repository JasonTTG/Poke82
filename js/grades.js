// Draft, trade and season grades.
// Every Pokémon's time with a team is recorded as a "stint" (games, value produced above a replacement-level bench player, per season). A move is graded on
// what the player actually did for the team that acquired him, from the day of the move until he left, plus honors won there and a projection that fades
// out as real games pile up. Picks are followed to the player drafted with them; trades show every asset's contribution in a chart.
(function (PB) {
  const UI = PB.UI, esc = UI.esc, F = PB.Franchise, FA = PB.Fantasy, L2 = PB.League, clamp = PB.clamp;
  const GR = PB.Grades = {};
  const store = G => (G.grades = G.grades || { drafts: {}, trades: [] });
  const STI = G => { const S = store(G); return S.st || (S.st = {}); };
  const REPL = 3.5;                                        // a replacement-level game score
  const yearOf = G => G.fr ? G.fr.year : (G.careerSeason || 0) + 1;
  let ver = 0;                                              // bumped on every recorded game so cached grades refresh

  // ---------- stints: who played for whom ----------
  const origClaim = PB.Registry.claim;
  const newStint = (t, y) => ({ t, y0: y, e: 0, v: 0, g: 0, ys: {}, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, w: 0, l: 0, pg: 0 });
  PB.Registry.claim = function (G, monId, teamId) {
    origClaim.call(this, G, monId, teamId);
    const st = STI(G), a = st[monId] || (st[monId] = []);
    a.push(newStint(teamId, yearOf(G)));
  };
  const gameScore = PB.gameScore;
  L2.hooks.afterRecord.push(function (G, game, result, playoff) {
    ver++;
    const st = STI(G), gps = G.league.games || 82, y = yearOf(G), tid = [game.h, game.a];
    for (let s = 0; s < 2; s++) for (const id in result.box[s]) {
      const b = result.box[s][id]; if (b.sec <= 0) continue;
      const a = st[id] || (st[id] = []);
      let sti = a[a.length - 1]; if (!sti || sti.t !== tid[s]) { sti = newStint(tid[s], y); a.push(sti); }
      const sv = (gameScore(b) - REPL) / gps;
      sti.v += sv; sti.ys[y] = (sti.ys[y] || 0) + sv; sti.pts += b.pts; sti.reb += b.oreb + b.dreb; sti.ast += b.ast; sti.stl += b.stl; sti.blk += b.blk; sti.fgm += b.fgm; sti.fga += b.fga; sti.tpm += b.tpm; sti.tpa += b.tpa;
      if (result.score[s] > result.score[1 - s]) sti.w++; else sti.l++;
      if (sti.h) sti.h.push(+sti.v.toFixed(2));                           // a game-by-game running total, kept only for traded players and draftees
      if (playoff) sti.pg++; else { sti.g++; sti.e += 1 / gps; }
    }
  });

  // ---------- logging ----------
  PB.logPick = function (G, kind, key, label, pick) {
    const S = store(G), d = S.drafts[key] || (S.drafts[key] = { kind, key, label, year: G.fr ? G.fr.year : 0, picks: [] });
    d.picks.push(pick);
  };
  const origPick = F.draftPick;
  F.draftPick = function (G, tid, monId) {
    const d = G.fr.draft, n = d.pick, alts = d.prospects.slice(0, 10).filter(x => x !== monId), slot = d.slots ? d.slots[n] : null, gen = d.gen;
    origPick(G, tid, monId);
    { const a = STI(G)[monId]; if (a && a[a.length - 1]) { a[a.length - 1].tr = true; a[a.length - 1].h = []; } }
    PB.logPick(G, 'franchise', 'f' + G.fr.year, G.fr.mixed ? 'Season ' + G.fr.year + ' draft (mixed class)' : 'Season ' + G.fr.year + ' draft · ' + PB.REGIONS[gen], { n, t: tid, id: monId, alts, r: slot ? slot.r : null, o: slot ? slot.o : null });
  };
  if (FA) {
    const origMake = FA.make;
    FA.make = function (G, teamId, monId) {
      const D = G.fdraft, n = D.pick, alts = FA.available(G).slice(0, 10).filter(x => x !== monId);
      origMake(G, teamId, monId);
      PB.logPick(G, 'fantasy', 'fantasy', 'Fantasy draft', { n, t: teamId, id: monId, alts });
    };
  }
  // a trade remembers which stint each player started on the new team, so only his time there is credited
  const origTrade = F.trade;
  F.trade = function (G, a, b, giveA, giveB, force, prot) {
    origTrade(G, a, b, giveA, giveB, force, prot);
    const st = STI(G), mk = (list, to) => list.map(x => F.isPick(x) ? { a: x, to } : { a: x, to, si: Math.max(0, (st[x] || []).length - 1) });
    for (const it of mk(giveA, b).concat(mk(giveB, a))) if (it.si != null && st[it.a] && st[it.a][it.si]) { st[it.a][it.si].tr = true; st[it.a][it.si].h = []; }
    store(G).trades.push({ y: G.fr.year, d: G.league ? G.league.day : 0, a, b, ga: giveA.slice(), gb: giveB.slice(), items: mk(giveA, b).concat(mk(giveB, a)), prot: prot ? Object.assign({}, prot) : null });
  };

  // ---------- valuation ----------
  const resolve = (G, id) => { let cur = id; const log = G.fr ? G.fr.evoLog : []; for (let i = 0; i < 6; i++) { const e = log.find(x => x.from === cur); if (!e) break; cur = e.to; } return cur; };
  GR.val = (G, id) => { const cur = resolve(G, id), m = PB.BYID[cur]; return G.fr ? F.mval(m) : m.ovr; };
  // expected value above replacement per season from today's rating: a line fitted to this league's own results (players with at least most of a season
  // on one team), pulled toward a default until there is enough data, so it stays right if ratings are rebalanced
  let calib = null, calibKey = '';
  const prior = x => -30 + 0.5 * x;                       // default: 0 at a rating of 60, +5 for every 10 points above
  const fitCurve = G => {
    const key = ver + ':' + (G.seed || 0);
    if (calib && calibKey === key) return calib;
    const bins = Array.from({ length: 13 }, () => ({ w: 0, y: 0 }));          // 5-point rating bins from 40 to 100
    const st = STI(G);
    for (const id in st) { const x = GR.val(G, +id), b = bins[clamp(Math.round((x - 40) / 5), 0, 12)]; for (const s of st[id]) { if (s.e < 0.8) continue; b.w += s.e; b.y += s.v; } }
    // each bin's average value per season, pulled toward the default until it holds a few seasons of data (so the curve follows the league's real results)
    const est = bins.map((b, k) => (b.y + 3 * prior(40 + 5 * k)) / (b.w + 3));
    calibKey = key; return (calib = est);
  };
  GR.proj = (G, id) => {
    const est = fitCurve(G), x = clamp(GR.val(G, id), 40, 100), f = (x - 40) / 5, k = Math.min(11, Math.floor(f));
    return clamp(est[k] + (est[k + 1] - est[k]) * (f - k), -1, 18);
  };
  const LET = [['A+', 4.3], ['A', 4.0], ['A-', 3.7], ['B+', 3.3], ['B', 3.0], ['B-', 2.7], ['C+', 2.3], ['C', 2.0], ['C-', 1.7], ['D', 1.0], ['F', 0]];
  GR.letter = pts => { for (const [l, p] of LET) if (pts >= p - 0.15) return l; return 'F'; };
  GR.points = l => (LET.find(x => x[0] === l) || [0, 0])[1];
  GR.color = l => l[0] === 'A' ? '#2fd47a' : l[0] === 'B' ? '#9be15d' : l[0] === 'C' ? '#ffcb05' : l[0] === 'D' ? '#ff9a3c' : '#ff5a5f';

  // the stints that make up one player's continuous time with team t, starting at stint si, following him through evolutions
  GR.span = function (G, id, t, si) {
    const S = STI(G), out = []; let cur = id, idx = si || 0;
    for (let hop = 0; hop < 6; hop++) {
      const arr = S[cur] || []; let j = idx;
      while (j < arr.length && arr[j].t === t) { out.push(arr[j]); j++; }
      if (j < arr.length || !G.fr) break;
      const e = G.fr.evoLog.find(x => x.from === cur); if (!e) break;
      cur = e.to; idx = 0; if (!(S[cur] && S[cur][0] && S[cur][0].t === t)) break;
    }
    return out;
  };
  const HONOR_PTS = { 'MVP': 8, 'Playoffs MVP': 3, 'DPOY': 4, 'Rookie of the Year': 2, 'Sixth Pokémon': 2, 'All-League 1st': 4, 'All-League 2nd': 3, 'All-League 3rd': 2, 'All-Defense 1st': 2, 'All-Defense 2nd': 1.5, 'All-Star': 1.5, 'All-Rookie Team': 1, 'Scoring title': 2, 'Rebounding title': 2, 'Assists title': 2 };
  const honorsFor = (G, ids, t, y0) => {
    const C = PB.Career; let pts = 0; const list = [];
    if (!C) return { pts, list };
    for (const id of ids) for (const r of C.rowsOf(G, id)) {
      if (r.t !== t || r.y < y0) continue;
      for (const h of r.honors) if (HONOR_PTS[h]) { pts += HONOR_PTS[h]; list.push((G.fr ? 'S' + r.y + ' ' : '') + h); }
      if (r.champ) { pts += 2; list.push((G.fr ? 'S' + r.y + ' ' : '') + 'Champion'); }
    }
    return { pts, list };
  };
  // what a player was worth to a team: production there + honors there + a projection that fades as real games accumulate
  GR.worth = function (G, id, t, si) {
    const sp = GR.span(G, id, t, si), ids = [id];
    if (G.fr) { let c = id; for (let i = 0; i < 6; i++) { const e = G.fr.evoLog.find(x => x.from === c); if (!e) break; ids.push(e.to); c = e.to; } }
    const prod = sp.reduce((s, x) => s + x.v, 0), e = sp.reduce((s, x) => s + x.e, 0), games = sp.reduce((s, x) => s + x.g, 0);
    const ys = {}; for (const x of sp) for (const y in x.ys) ys[y] = (ys[y] || 0) + x.ys[y];
    const hon = honorsFor(G, ids, t, sp.length ? sp[0].y0 : 0), H = G.fr ? 3 : 1, full = G.fr ? 2.5 : 1, w = clamp(e / full, 0, 1), pr = GR.proj(G, id);
    const fut = (1 - w) * H * pr;
    // value per season counts from the first game played: real output is blended with the rating-based projection, weighted by how much he has played
    const K = G.fr ? 0.6 : 0.25;
    const S = { g: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, w: 0, l: 0 }; for (const x of sp) for (const k in S) S[k] += x[k] || 0;
    let off = 0; const series = []; for (const x of sp) { for (const v of (x.h || [])) series.push(+(off + v).toFixed(2)); if (x.h && x.h.length) off += x.h[x.h.length - 1]; }
    return { st: S, series, prod, hon: hon.pts, honors: hon.list, fut, total: prod + hon.pts + fut, e, games, w, ys, rate: (prod + hon.pts + K * pr) / (e + K), pr };
  };

  // ---------- draft picks ----------
  const memo = new WeakMap();
  GR.draftRows = function (G, d) {
    const c = memo.get(d); if (c && c.ver === ver && c.n === d.picks.length) return c.rows;
    const rows = d.picks.map(p => {
      const sp = (STI(G)[p.id] || []).findIndex(x => x.t === p.t), w = GR.worth(G, p.id, p.t, Math.max(0, sp));
      return { p, w, A: w.rate, inst: GR.gradePick(G, p) };
    });
    const N = rows.length, win = Math.max(3, Math.round(N * 0.06));
    rows.forEach((r, i) => {
      const near = rows.filter((x, j) => j !== i && Math.abs(j - i) <= win).map(x => x.A);
      const mean = near.length ? PB.avg(near) : r.A, sd = near.length > 2 ? Math.sqrt(PB.avg(near.map(v => (v - mean) * (v - mean)))) : 3;
      r.exp = mean; r.z = (r.A - mean) / Math.max(2.5, sd);
      const z = r.z; r.grade = z >= 1.6 ? 'A+' : z >= 1.1 ? 'A' : z >= 0.75 ? 'A-' : z >= 0.4 ? 'B+' : z >= -0.15 ? 'B' : z >= -0.5 ? 'B-' : z >= -0.85 ? 'C+' : z >= -1.2 ? 'C' : z >= -1.6 ? 'C-' : z >= -2.2 ? 'D' : 'F';
    });
    memo.set(d, { ver, n: d.picks.length, rows });
    return rows;
  };
  // draft-day view: the pick against the options on the board at the time (kept as the "instant" grade)
  GR.gradePick = function (G, p) {
    const opts = Array.from(new Set(p.alts.concat([p.id]))), vals = opts.map(id => GR.val(G, id)), me = GR.val(G, p.id);
    const best = Math.max(...vals), bi = vals.indexOf(best), others = vals.filter((v, i) => opts[i] !== p.id), second = others.length ? Math.max(...others) : me;
    const gap = best - me, rank = 1 + vals.filter(v => v > me + 1e-9).length;
    const grade = gap <= 0.001 ? (me - second >= 4 ? 'A+' : 'A') : gap <= 1.5 ? 'A-' : gap <= 3 ? 'B+' : gap <= 5 ? 'B' : gap <= 7 ? 'B-' : gap <= 9 ? 'C+' : gap <= 12 ? 'C' : gap <= 15 ? 'D' : 'F';
    return { grade, gap, rank, of: opts.length, best: opts[bi], bestVal: best, val: me };
  };
  GR.teamDraft = function (G, d, tid) {
    const rows = GR.draftRows(G, d).filter(r => r.p.t === tid).map(r => Object.assign({ p: r.p }, r.inst, { now: r.grade, z: r.z, w: r.w, A: r.A, exp: r.exp, grade: r.grade, instant: r.inst.grade }));
    const gpa = rows.length ? rows.reduce((s, r) => s + GR.points(r.grade), 0) / rows.length : null;
    return { rows, gpa, letter: gpa == null ? '-' : GR.letter(gpa) };
  };

  // ---------- trades ----------
  const itemWorth = (G, it) => {
    if (F.isPick(it.a)) {
      const m = /^p:(\d+)\.(\d+)\.(\d+)/.exec(it.a), y = m ? +m[1] : 0, r = m ? +m[2] : -1, o = m ? +m[3] : -1, d = store(G).drafts['f' + y];
      const pk = d && d.picks.find(x => x.r === r && x.o === o);
      if (pk) {
        const si = (STI(G)[pk.id] || []).findIndex(x => x.t === pk.t), w = GR.worth(G, pk.id, pk.t, Math.max(0, si));
        return Object.assign(w, { pick: true, drafted: pk.id, usedBy: pk.t, label: it.a });
      }
      return { pick: true, drafted: null, prod: 0, hon: 0, honors: [], fut: F.pickVal ? F.pickVal(G, it.a, it.prot) * 3 : 3, total: F.pickVal ? F.pickVal(G, it.a, it.prot) * 3 : 3, e: 0, w: 0, ys: {}, label: it.a };
    }
    return GR.worth(G, it.a, it.to, it.si || 0);
  };
  GR.tradeItems = function (G, t) {
    const items = t.items || t.ga.map(a => ({ a, to: t.b })).concat(t.gb.map(a => ({ a, to: t.a })));       // older saves carry no stint index
    return items.map(it => Object.assign({ it }, itemWorth(G, it)));
  };
  GR.gradeTrade = function (G, t) {
    const items = GR.tradeItems(G, t), side = tid => {
      const got = items.filter(x => x.it.to === tid), gave = items.filter(x => x.it.to !== tid);
      const g1 = got.reduce((s, x) => s + x.total, 0), g2 = gave.reduce((s, x) => s + x.total, 0), s = (g1 - g2) / (Math.abs(g1) + Math.abs(g2) + 8);
      const grade = s >= 0.4 ? 'A+' : s >= 0.28 ? 'A' : s >= 0.18 ? 'A-' : s >= 0.08 ? 'B+' : s >= -0.08 ? 'B' : s >= -0.18 ? 'B-' : s >= -0.28 ? 'C' : s >= -0.4 ? 'D' : 'F';
      const e = Math.max(0, ...items.map(x => x.e));
      return { got: g1, gave: g2, s, grade, items: got, gaveItems: gave, prelim: e < 0.5 };
    };
    return { a: side(t.a), b: side(t.b), all: items };
  };

  // ---------- season grade (used by the season report) ----------
  GR.seasonGrade = function (G, tid) {
    const lg = G.league, rec = lg.rec[tid], n = G.teams.length, gp = rec.w + rec.l, wp = gp ? rec.w / gp : 0;
    const order = L2.sortTeams(G, G.teams.map(t => t.id)), rank = order.indexOf(tid) + 1;
    const first = lg.pr && lg.pr.length ? lg.pr[0].order : null;
    const expected = first ? first.indexOf(tid) + 1 : G.teams.slice().sort((a, b) => PB.teamOvr(b) - PB.teamOvr(a)).findIndex(t => t.id === tid) + 1;
    let roundsWon = 0, made = false, nR = lg.po ? (lg.po.nRounds || lg.po.rounds.length || 4) : 4;
    if (lg.po) lg.po.rounds.forEach(r => r.forEach(s => { if (s.hi !== tid && s.lo !== tid) return; made = true; const mine = s.hi === tid ? 0 : 1; if (s.w[mine] >= (s.need || 4)) roundsWon++; }));
    const champ = lg.champion === tid;
    const parts = [
      { k: 'Record', v: 45 * clamp((wp - 0.25) / 0.55, 0, 1), max: 45, note: rec.w + '-' + rec.l },
      { k: 'Playoffs', v: champ ? 40 : made ? 40 * 0.8 * clamp((roundsWon + 0.3) / nR, 0, 1) : 0, max: 40, note: champ ? 'Champions' : made ? 'won ' + roundsWon + ' round' + (roundsWon === 1 ? '' : 's') : 'missed' },
      { k: 'Vs. expectation', v: 15 * clamp(0.5 + (expected - rank) / Math.max(2, n / 3), 0, 1), max: 15, note: 'ranked #' + expected + ' early, finished #' + rank },
    ];
    const tot = parts.reduce((s, x) => s + x.v, 0);
    const grade = tot >= 93 ? 'A+' : tot >= 87 ? 'A' : tot >= 82 ? 'A-' : tot >= 77 ? 'B+' : tot >= 72 ? 'B' : tot >= 67 ? 'B-' : tot >= 62 ? 'C+' : tot >= 55 ? 'C' : tot >= 48 ? 'C-' : tot >= 38 ? 'D' : 'F';
    return { grade, total: tot, parts, expected, rank };
  };

  // ---------- charts ----------
  const bar = (w, max, col, h) => `<div style="height:${h || 10}px;width:${Math.max(1, Math.round(100 * Math.abs(w) / (max || 1)))}%;background:${col};border-radius:3px"></div>`;
  // one card per asset: what the player actually did for the team that got him (stat bars, scaled against the other assets in the trade), with the value it adds up to
  function assetChart(G, items, mx) {
    if (!items.length) return '<div class="dim" style="font-size:12px">Nothing.</div>';
    const per = (a, g) => g ? a / g : 0, f1 = v => v.toFixed(1);
    const cols = [['pts', 'PTS', '#4aa3ff', 30], ['reb', 'REB', '#2fd47a', 14], ['ast', 'AST', '#ffcb05', 10], ['def', 'STL+BLK', '#ff9a3c', 4]];
    return items.map(x => {
      const nm = x.pick ? (x.drafted != null ? `${UI.spr(PB.BYID[x.drafted], 20)} <b>${esc(PB.BYID[x.drafted].dispName)}</b> <span class="dim">via ${esc(F.pickLabel(G, x.label))}</span>` : `<span class="tag">${esc(F.pickLabel(G, x.label))}</span> <span class="dim">not used yet</span>`) : `${UI.spr(PB.BYID[x.it.a], 20)} <b>${esc(PB.BYID[x.it.a].dispName)}</b>`;
      const S = x.st || { g: 0 }, g = S.g, avg = { pts: per(S.pts, g), reb: per(S.reb, g), ast: per(S.ast, g), def: per(S.stl + S.blk, g) };
      const bars = g ? cols.map(([k, l, c, top]) => `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin:1px 0"><span class="dim" style="width:52px">${l}</span><div style="flex:1;background:var(--bg2);border-radius:3px;height:8px"><div style="width:${Math.min(100, 100 * avg[k] / top).toFixed(0)}%;height:8px;border-radius:3px;background:${c}"></div></div><b style="width:34px;text-align:right">${f1(avg[k])}</b></div>`).join('') : '<div class="dim" style="font-size:12px;margin:4px 0">No games for this team yet.</div>';
      const line = g ? `${g} games · team ${S.w}-${S.l} with him · ${S.fga ? (100 * S.fgm / S.fga).toFixed(0) + '% FG' : ''}${S.tpa ? ' · ' + (100 * S.tpm / S.tpa).toFixed(0) + '% 3P' : ''}` : '';
      const pr = Math.max(0, x.prod), hn = x.hon, fu = Math.max(0, x.fut), tot = Math.max(0.01, pr + hn + fu), sc = Math.max(0.01, Math.abs(x.total)) / tot;
      const seg = (v, bg, tip) => v > 0 ? `<div title="${tip}" style="width:${(100 * v * sc / mx).toFixed(1)}%;background:${bg};height:6px"></div>` : '';
      return `<div style="margin:8px 0;padding-bottom:6px;border-bottom:1px solid var(--line)"><div class="row between" style="font-size:13px"><span>${nm}</span><span class="dim" style="font-size:11px">value <b style="color:${x.total >= 0 ? 'inherit' : '#ff5a5f'}">${x.total.toFixed(1)}</b></span></div>
        ${line ? `<div class="dim" style="font-size:11px">${line}</div>` : ''}${bars}
        <div title="Value: production / honors / projection" style="display:flex;width:100%;background:var(--bg2);border-radius:3px;overflow:hidden;min-height:6px;margin-top:3px">${x.total < 0 ? `<div style="width:${(100 * Math.abs(x.total) / mx).toFixed(1)}%;background:#ff5a5f;height:6px"></div>` : seg(pr, '#4aa3ff', 'Production: ' + pr.toFixed(1)) + seg(hn, '#ffcb05', 'Honors: ' + hn.toFixed(1)) + seg(fu, 'repeating-linear-gradient(45deg,#4aa3ff55,#4aa3ff55 4px,#4aa3ff22 4px,#4aa3ff22 8px)', 'Projected: ' + fu.toFixed(1))}</div>
        ${x.honors && x.honors.length ? `<div class="dim" style="font-size:11px">${esc(x.honors.slice(0, 4).join(', '))}</div>` : ''}</div>`;
    }).join('');
  }
  // how each side's incoming players have produced, game by game since the trade (always drawn; flat until games are played)
  function lineChart(G, g, t) {
    const sideSeries = tid => {
      const ser = g.all.filter(x => x.it.to === tid).map(x => x.series || []);
      const n = Math.max(0, ...ser.map(a => a.length));
      return Array.from({ length: n }, (_, i) => ser.reduce((s, a) => s + (a.length ? a[Math.min(i, a.length - 1)] : 0), 0));
    };
    let A = sideSeries(t.a), B = sideSeries(t.b), note = '';
    if (!A.length && !B.length) {                                                      // older saves: fall back to one point per season
      const yrs = new Set(); for (const x of g.all) for (const y in x.ys) yrs.add(+y);
      const ys = [...yrs].sort((a, b) => a - b), cum = tid => { let c = 0; return ys.map(y => (c += g.all.filter(x => x.it.to === tid).reduce((s, x) => s + (x.ys[y] || 0), 0))); };
      A = cum(t.a); B = cum(t.b);
    }
    const n = Math.max(A.length, B.length), W = 340, H = 120;
    const X = i => 30 + (n > 1 ? i / (n - 1) : 0) * (W - 44), mx = Math.max(1, ...A, ...B), mn = Math.min(0, ...A, ...B), Y = v => H - 20 - (v - mn) / ((mx - mn) || 1) * (H - 36);
    const path = a => a.length ? a.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join(' ') : '';
    const dot = (a, c) => a.length ? `<circle cx="${X(a.length - 1)}" cy="${Y(a[a.length - 1])}" r="3.5" fill="${c}"/>` : '';
    if (!n) note = 'No games played since the trade yet.';
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:400px;background:var(--bg2);border-radius:8px"><line x1="30" x2="${W - 14}" y1="${Y(0)}" y2="${Y(0)}" stroke="#667" stroke-dasharray="3 3"/><text x="4" y="${Y(mx) + 3}" fill="#8a93a8" font-size="9">${mx.toFixed(0)}</text><text x="4" y="${Y(0) + 3}" fill="#8a93a8" font-size="9">0</text>
      <path d="${path(A)}" fill="none" stroke="#4aa3ff" stroke-width="2.4"/><path d="${path(B)}" fill="none" stroke="#ff9a3c" stroke-width="2.4"/>${dot(A, '#4aa3ff')}${dot(B, '#ff9a3c')}
      <text x="34" y="12" fill="#4aa3ff" font-size="10">${esc(G.teams[t.a].abbr)} ${A.length ? A[A.length - 1].toFixed(1) : '0.0'}</text><text x="${W - 14}" y="12" fill="#ff9a3c" font-size="10" text-anchor="end">${esc(G.teams[t.b].abbr)} ${B.length ? B[B.length - 1].toFixed(1) : '0.0'}</text>
      <text x="${(W + 16) / 2}" y="${H - 4}" fill="#8a93a8" font-size="9" text-anchor="middle">${n ? 'games since the trade' : esc(note)}</text></svg>`;
  }

  // ---------- UI ----------
  const view = { draft: null, team: null, tradeFilter: 'mine', open: {} };
  const has = G => !!(G.grades && (Object.keys(G.grades.drafts).length || G.grades.trades.length));
  const chip = (l, pre) => `<span class="gradechip" ${pre ? 'title="Preliminary: only a short time with the team so far"' : ''} style="color:${GR.color(l)};border-color:${GR.color(l)};${pre ? 'border-style:dashed' : ''}">${l}</span>`;
  const nm = (G, a) => F.isPick(a) ? `<span class="tag">${esc(F.pickLabel(G, a))}</span>` : `${UI.spr(PB.BYID[a], 20)} ${esc(PB.BYID[a].dispName)}`;
  const KEY = `<div class="row wrap dim" style="font-size:11px;gap:12px;margin:4px 0"><span><span style="display:inline-block;width:10px;height:10px;background:#4aa3ff"></span> production for the new team</span><span><span style="display:inline-block;width:10px;height:10px;background:#ffcb05"></span> honors won there</span><span><span style="display:inline-block;width:10px;height:10px;background:repeating-linear-gradient(45deg,#4aa3ff88,#4aa3ff88 3px,#4aa3ff22 3px,#4aa3ff22 6px)"></span> projection (fades as games are played)</span></div>`;
  UI.addHubTab('grades', 'Grades', 'power', function (G, lg) {
    const S = store(G), live = G.fr && G.fr.stage === 'draft' ? 'f' + G.fr.year : null;
    const keys = Object.keys(S.drafts).filter(k => k !== live);
    if (!view.draft || !keys.includes(view.draft)) view.draft = keys[keys.length - 1] || null;
    const d = view.draft ? S.drafts[view.draft] : null;
    if (view.team == null || !G.teams[view.team]) view.team = G.userTeam;
    const mine = keys.map(k => GR.teamDraft(G, S.drafts[k], G.userTeam)).filter(x => x.gpa != null), myTr = S.trades.filter(t => t.a === G.userTeam || t.b === G.userTeam).map(t => { const g = GR.gradeTrade(G, t); return t.a === G.userTeam ? g.a : g.b; });
    const pts = mine.map(x => x.gpa).concat(myTr.map(x => GR.points(x.grade))), gm = pts.length ? GR.letter(pts.reduce((a, b) => a + b, 0) / pts.length) : '-';
    let drafts = '<div class="panel dim">No completed drafts yet.</div>';
    if (d) {
      const board = G.teams.map(t => ({ t, r: GR.teamDraft(G, d, t.id) })).filter(x => x.r.rows.length).sort((a, b) => b.r.gpa - a.r.gpa);
      const sel = GR.teamDraft(G, d, view.team), mx = Math.max(5, ...sel.rows.map(r => Math.max(r.A, r.exp)));
      drafts = `<div class="panel"><div class="row between wrap"><h3 style="margin:0">Draft grades</h3><div class="row wrap"><label>Draft <select data-change="grDraft">${keys.map(k => `<option value="${k}" ${k === view.draft ? 'selected' : ''}>${esc(S.drafts[k].label)}</option>`).join('')}</select></label>
        <label>Team <select data-change="grTeam">${G.teams.map(t => `<option value="${t.id}" ${t.id === view.team ? 'selected' : ''}>${esc(t.abbr)}${t.id === G.userTeam ? ' ★' : ''}</option>`).join('')}</select></label></div></div>
        
        <div class="layout2"><div><table class="t"><thead><tr><th>Pick</th><th>Pokémon</th><th class="n">Now</th><th class="n">Draft day</th><th>Value per season vs. similar picks</th></tr></thead><tbody>${sel.rows.map(r => `<tr><td class="dim">${r.p.n + 1}</td><td>${nm(G, r.p.id)}<div class="dim" style="font-size:11px">${r.w.games} games${r.w.honors.length ? ' · ' + esc(r.w.honors.slice(0, 3).join(', ')) : ''}</div></td><td class="n">${chip(r.now, r.w.e < 0.5)}</td><td class="n">${chip(r.instant)}</td>
          <td style="min-width:150px"><div title="This player: ${r.A.toFixed(1)} per season">${bar(Math.max(0, r.A), mx, '#4aa3ff', 9)}</div><div title="Typical for similar picks: ${r.exp.toFixed(1)}" style="margin-top:2px">${bar(Math.max(0, r.exp), mx, '#8a93a888', 5)}</div></td></tr>`).join('') || '<tr><td colspan="5" class="dim">No picks.</td></tr>'}</tbody></table>
        
        <div class="row" style="margin-top:6px"><b>${esc(G.teams[view.team].name)}</b> <span class="dim">draft grade</span> ${chip(sel.letter)}</div></div>
        <div><h3>Class ranking</h3><table class="t"><tbody>${board.map((x, i) => `<tr class="${x.t.id === G.userTeam ? 'me' : ''}" style="cursor:pointer" data-act="grTeamPick" data-t="${x.t.id}"><td class="dim">${i + 1}</td><td>${UI.teamLabel(G, x.t.id)}</td><td class="n">${chip(x.r.letter)}</td></tr>`).join('')}</tbody></table></div></div></div>`;
    }
    const trs = S.trades.map((t, i) => ({ t, i })).filter(x => view.tradeFilter === 'all' || x.t.a === G.userTeam || x.t.b === G.userTeam).reverse();
    const col = (tid, gv) => `<div style="flex:1;min-width:240px"><div class="row between"><b>${esc(G.teams[tid].abbr)} <span class="dim" style="font-weight:400">received</span></b>${chip(gv.grade, gv.prelim)}</div><div class="dim" style="font-size:11px">Total value ${gv.got.toFixed(1)} received · ${gv.gave.toFixed(1)} given up</div></div>`;
    const trades = `<div class="panel" style="margin-top:10px"><div class="row between wrap"><h3 style="margin:0">Trade grades</h3><label>Show <select data-change="grTradeFilter"><option value="mine" ${view.tradeFilter === 'mine' ? 'selected' : ''}>My trades</option><option value="all" ${view.tradeFilter === 'all' ? 'selected' : ''}>All trades</option></select></label></div>
      ${KEY}
      ${trs.length ? trs.map(({ t, i }) => { const g = GR.gradeTrade(G, t), open = !!view.open[i], mx = Math.max(6, ...g.all.map(x => Math.abs(x.total)));
        return `<div class="panel" style="background:var(--bg2);margin-top:6px"><div class="row between"><div class="dim" style="font-size:11px">Season ${t.y}${t.d ? ' · ' + L2.dateStr(t.d) : ''}</div><button class="small" data-act="grOpen" data-i="${i}">${open ? 'Hide breakdown' : 'Show breakdown'}</button></div>
          <div class="row wrap" style="gap:14px">${col(t.a, g.a)}${col(t.b, g.b)}</div>
          ${open ? `<div class="row wrap" style="gap:14px;margin-top:8px"><div style="flex:1;min-width:240px"><b style="font-size:12px">Went to ${esc(G.teams[t.a].abbr)}</b>${assetChart(G, g.all.filter(x => x.it.to === t.a), mx)}</div><div style="flex:1;min-width:240px"><b style="font-size:12px">Went to ${esc(G.teams[t.b].abbr)}</b>${assetChart(G, g.all.filter(x => x.it.to === t.b), mx)}</div></div>
            <div style="margin-top:6px"><b style="font-size:12px">Value since the trade</b>${lineChart(G, g, t)}</div>` : `<div style="font-size:12px;margin-top:4px"><span class="dim">${esc(G.teams[t.a].abbr)} got:</span> ${t.gb.map(a => nm(G, a)).join(', ') || '—'} <span class="dim"> · ${esc(G.teams[t.b].abbr)} got:</span> ${t.ga.map(a => nm(G, a)).join(', ') || '—'}</div>`}</div>`; }).join('') : '<div class="dim">No trades yet.</div>'}</div>`;
    return `<div class="panel row between wrap"><div><h2 style="margin:0">Draft & trade grades</h2></div><div class="row" style="gap:8px"><span class="dim">Your GM grade</span><span class="gradechip big" style="color:${GR.color(gm)};border-color:${GR.color(gm)}">${gm}</span></div></div>${drafts}${trades}`;
  }, G => has(G) || G.mode === 'franchise');
  UI.actions.grDraft = el => { view.draft = el.value; UI.refresh(); };
  UI.actions.grTeam = el => { view.team = +el.value; UI.refresh(); };
  UI.actions.grTeamPick = (el, d) => { view.team = +d.t; UI.refresh(); };
  UI.actions.grTradeFilter = el => { view.tradeFilter = el.value; UI.refresh(); };
  UI.actions.grOpen = (el, d) => { view.open[d.i] = !view.open[d.i]; UI.refresh(); };

  const css = document.createElement('style');
  css.textContent = '.gradechip{display:inline-block;min-width:34px;text-align:center;font-weight:900;border:2px solid;border-radius:8px;padding:1px 7px}.gradechip.big{font-size:24px;padding:4px 12px}';
  document.head.appendChild(css);
})(window.PB);
