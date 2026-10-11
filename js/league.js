// League: schedule, standings, stats, playoffs, simulation controls, achievements.
(function (PB) {
  const { avg } = PB;
  const L = PB.League = {};
  const START = Date.UTC(2026, 9, 22);   // Oct 22 (month index 9)
  L.dateOf = day => new Date(START + (day - 1) * 86400000);
  L.dateStr = day => { const d = L.dateOf(day); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };
  L.dateISO = day => L.dateOf(day).toISOString().slice(0, 10);
  L.dayFromISO = iso => Math.round((Date.parse(iso + 'T00:00:00Z') - START) / 86400000) + 1;

  // ----- schedule -----------------------------------------------------------
  // Returns list of {h,a} pairings with correct NBA-style counts (82 games each at 30 teams, 6 divisions of 5).
  L.pairings = function (teams, rng, gamesTarget) {
    const n = teams.length;
    const pairs = [];
    const divOf = t => t.conf + '/' + t.div;
    const divs = {};
    teams.forEach(t => { (divs[divOf(t)] = divs[divOf(t)] || []).push(t.id); });
    const pos = {}; Object.values(divs).forEach(arr => arr.forEach((id, i) => pos[id] = i));
    const gamesFor = (a, b) => {
      const A = teams[a], B = teams[b];
      if (A.conf !== B.conf) return 2;
      if (A.div === B.div) return 4;
      // 3 or 4 games between same-conference, different-division teams
      const [x, y] = A.div < B.div ? [a, b] : [b, a];
      const d = ((pos[x] - pos[y]) % 5 + 5) % 5;
      return d <= 1 ? 3 : 4;
    };
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      let g = gamesFor(a, b);
      if (n !== 30) g = Math.max(1, Math.round(g * gamesTarget / 82));
      let ha = Math.floor(g / 2), hb = Math.floor(g / 2);
      if (g % 2) { if (rng.chance(0.5)) ha++; else hb++; }
      for (let i = 0; i < ha; i++) pairs.push({ h: a, a: b });
      for (let i = 0; i < hb; i++) pairs.push({ h: b, a: a });
    }
    return pairs;
  };

  L.makeSchedule = function (teams, rng, gamesTarget) {
    const pairs = rng.shuffle(L.pairings(teams, rng, gamesTarget));
    const remaining = new Array(teams.length).fill(0);
    pairs.forEach(p => { remaining[p.h]++; remaining[p.a]++; });
    const total = pairs.length;
    const days = Math.ceil(gamesTarget * 2.07);                 // ~170 days for 82 games
    const perDay = total / days;
    const sched = [];
    let pool = pairs, day = 1, lastPlayed = new Array(teams.length).fill(0);
    while (pool.length) {
      const used = new Set(); const taken = [];
      const quota = Math.min(Math.floor(teams.length / 2), Math.max(1, Math.round(perDay + (rng.next() - 0.5) * 3)));
      // prefer teams with the most games left / longest rest
      const order = pool.map((g, i) => ({ g, i, s: remaining[g.h] + remaining[g.a] + (day - lastPlayed[g.h]) * 0.8 + (day - lastPlayed[g.a]) * 0.8 + rng.next() * 6 }))
        .sort((x, y) => y.s - x.s);
      const takeIdx = new Set();
      for (const o of order) {
        if (taken.length >= quota) break;
        if (used.has(o.g.h) || used.has(o.g.a)) continue;
        used.add(o.g.h); used.add(o.g.a); taken.push(o.g); takeIdx.add(o.i);
      }
      if (!taken.length) { day++; continue; }
      for (const g of taken) { sched.push({ day, h: g.h, a: g.a, done: false }); remaining[g.h]--; remaining[g.a]--; lastPlayed[g.h] = day; lastPlayed[g.a] = day; }
      pool = pool.filter((_, i) => !takeIdx.has(i));
      day++;
    }
    return sched;
  };

  // ----- creation -----------------------------------------------------------
  L.create = function (G, gamesTarget) {
    gamesTarget = gamesTarget || 82;
    const err = PB.Registry.verify(G);
    if (err) throw new Error('Cannot start league: ' + err);
    for (const t of G.teams) { const e = PB.validateLineup(t); if (e.length) throw new Error(t.name + ': ' + e.join('; ')); }
    const rng = new PB.RNG((G.seed ^ 0x9e3779b9) >>> 0);
    const lg = {
      season: 1, games: gamesTarget, phase: 'regular', day: 1, userDone: false,
      sched: L.makeSchedule(G.teams, rng, gamesTarget),
      rec: G.teams.map(() => ({ w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, cw: 0, cl: 0, dw: 0, dl: 0, pf: 0, pa: 0, strk: 0, last: [] })),
      pstats: {}, pstatsPO: {}, tstats: G.teams.map(() => PB.newStat()), tgp: G.teams.map(() => 0),
      userBoxes: [], po: null, champion: null, seed: (G.seed * 7 + 13) >>> 0, simSeq: 0,
      awards: null, ach: null,
    };
    lg.lastDay = lg.sched[lg.sched.length - 1].day;
    return lg;
  };

  L.seasonDone = lg => lg.phase === 'done';

  // ----- recording results --------------------------------------------------
  function addP(map, id, box) {
    const s = map[id] || (map[id] = Object.assign(PB.newStat(), { gp: 0, gs: 0 }));
    for (const k of PB.STAT_KEYS) s[k] += box[k];
    s.gp += box.gp; s.gs += box.gs;
  }

  L.record = function (G, game, result, playoff) {
    const lg = G.league;
    const h = G.teams[game.h], a = G.teams[game.a];
    game.done = true; game.sc = result.score.slice(); game.ot = result.ot;
    const hw = result.score[0] > result.score[1];
    if (!playoff) {
      const rh = lg.rec[h.id], ra = lg.rec[a.id];
      const win = hw ? rh : ra, loss = hw ? ra : rh;
      win.w++; loss.l++;
      if (hw) { rh.hw++; ra.al++; } else { ra.aw++; rh.hl++; }
      const same = h.conf === a.conf, sd = h.conf === a.conf && h.div === a.div;
      if (same) { win.cw++; loss.cl++; }
      if (sd) { win.dw++; loss.dl++; }
      rh.pf += result.score[0]; rh.pa += result.score[1]; ra.pf += result.score[1]; ra.pa += result.score[0];
      win.strk = win.strk > 0 ? win.strk + 1 : 1; loss.strk = loss.strk < 0 ? loss.strk - 1 : -1;
      win.last.push(1); loss.last.push(0); if (win.last.length > 10) win.last.shift(); if (loss.last.length > 10) loss.last.shift();
    }
    const map = playoff ? lg.pstatsPO : lg.pstats;
    for (let s = 0; s < 2; s++) {
      const tid = s === 0 ? h.id : a.id;
      for (const id in result.box[s]) { const b = result.box[s][id]; if (b.sec > 0) addP(map, id, b); }
      if (!playoff) { lg.tgp[tid]++; for (const id in result.box[s]) for (const k of PB.STAT_KEYS) lg.tstats[tid][k] += result.box[s][id][k]; }
    }
    if (h.user || a.user) {
      const box = [{}, {}];
      for (let s = 0; s < 2; s++) for (const id in result.box[s]) { const b = result.box[s][id]; if (b.sec > 0) box[s][id] = PB.STAT_KEYS.map(k => b[k]); }
      lg.userBoxes.push({ day: game.day, h: h.id, a: a.id, sc: result.score, q: result.q, ot: result.ot, po: !!playoff, box });
    }
  };

  // box stored for user games: array-form, readable by UI
  L.unpackBox = arr => { const o = {}; PB.STAT_KEYS.forEach((k, i) => o[k] = arr[i]); return o; };

  // ----- simulation ---------------------------------------------------------
  const settingsDiff = G => {
    const d = G.settings.difficulty;
    return d === 'easy' ? -0.02 : d === 'hard' ? 0.02 : d === 'legend' ? 0.045 : 0;   // adjustment applied to AI opponent of the user
  };

  L.simOne = function (G, game, playoff) {
    const lg = G.league;
    const h = G.teams[game.h], a = G.teams[game.a];
    const rng = new PB.RNG((lg.seed + (lg.simSeq++) * 2654435761) >>> 0);
    const diff = [0, 0];
    if (h.user) diff[1] = settingsDiff(G); else if (a.user) diff[0] = settingsDiff(G);
    const g = new PB.Game(h, a, { rng, diff, quarterMin: 12 });
    const res = g.run();
    L.record(G, game, res, playoff);
    return res;
  };

  L.userTeam = G => G.teams[G.userTeam];
  L.gamesOnDay = (lg, day) => lg.sched.filter(g => g.day === day);

  // simulate the whole current day. skipUser: leave the user's game unplayed
  L.simDay = function (G, skipUser) {
    const lg = G.league;
    if (lg.phase === 'regular') {
      const games = L.gamesOnDay(lg, lg.day).filter(g => !g.done);
      for (const g of games) {
        if (skipUser && (G.teams[g.h].user || G.teams[g.a].user)) continue;
        L.simOne(G, g, false);
      }
      const pending = lg.sched.some(g => g.day === lg.day && !g.done);
      if (!pending) {
        lg.day++;
        if (!lg.allStar && lg.day > Math.floor(lg.lastDay * 0.55)) L.allStarBreak(G);
        if (lg.day > lg.lastDay && lg.sched.every(g => g.done)) { L.seasonAwards(G); L.startPlayoffs(G); }
      }
      return !pending;
    }
    if (lg.phase === 'playoffs') {
      const games = L.poGamesToday(lg);
      for (const g of games) {
        if (skipUser && (G.teams[g.h].user || G.teams[g.a].user)) continue;
        L.poPlay(G, g);
      }
      const pending = L.poGamesToday(lg).some(g => G.teams[g.h].user || G.teams[g.a].user) && skipUser;
      if (!pending) L.poAdvance(G);
      return !pending;
    }
    return true;
  };

  L.userGameToday = function (G) {
    const lg = G.league;
    if (lg.phase === 'regular') return L.gamesOnDay(lg, lg.day).find(g => !g.done && (G.teams[g.h].user || G.teams[g.a].user)) || null;
    if (lg.phase === 'playoffs') return L.poGamesToday(lg).find(g => G.teams[g.h].user || G.teams[g.a].user) || null;
    return null;
  };

  // Sim until a user game would be played (returns true if reached a user game) or until done
  L.simUntilUserGame = function (G, maxDays) {
    let n = 0;
    while (L.simPhaseOpen(G) && n++ < (maxDays || 9999)) {
      const ug = L.userGameToday(G);
      if (ug) return ug;
      L.simDay(G, true);
    }
    return null;
  };
  L.simPhaseOpen = G => G.league.phase !== 'done';

  // sim everything through a target day (user games included, simulated)
  L.simToDay = function (G, target) {
    const lg = G.league;
    let guard = 0;
    while (lg.phase === 'regular' && lg.day <= target && guard++ < 400) L.simDay(G, false);
  };
  L.simRegularSeason = function (G) {
    const lg = G.league; let guard = 0;
    while (lg.phase === 'regular' && guard++ < 500) L.simDay(G, false);
  };
  L.simAll = function (G) {
    const lg = G.league; let guard = 0;
    while (lg.phase !== 'done' && guard++ < 2000) L.simDay(G, false);
  };

  // ----- standings ----------------------------------------------------------
  L.pct = r => (r.w + r.l) ? r.w / (r.w + r.l) : 0;
  L.sortTeams = (G, ids) => {
    const lg = G.league;
    return ids.slice().sort((x, y) => {
      const a = lg.rec[x], b = lg.rec[y];
      return (L.pct(b) - L.pct(a)) || ((b.pf - b.pa) - (a.pf - a.pa)) || (x - y);
    });
  };
  L.confStandings = (G, conf) => L.sortTeams(G, G.teams.filter(t => t.conf === conf).map(t => t.id));
  L.divStandings = (G, conf, div) => L.sortTeams(G, G.teams.filter(t => t.conf === conf && t.div === div).map(t => t.id));

  // ----- playoffs -----------------------------------------------------------
  // Top 8 in each conference by record. Bracket: 1v8, 4v5, 3v6, 2v7 -> semis -> conf finals -> finals.
  L.startPlayoffs = function (G) {
    const lg = G.league;
    lg.phase = 'playoffs';
    const east = L.confStandings(G, 'East').slice(0, 8), west = L.confStandings(G, 'West').slice(0, 8);
    const seedsE = east, seedsW = west;
    const mk = (conf, seeds) => [[0, 7], [3, 4], [2, 5], [1, 6]].map(([a, b]) => ({ conf, hi: seeds[a], lo: seeds[b], hiSeed: a + 1, loSeed: b + 1, w: [0, 0], games: [] }));
    lg.po = {
      round: 1, day: 0,
      rounds: [[...mk('East', seedsE), ...mk('West', seedsW)], [], [], []],
      gameNo: 1, seeds: { East: seedsE, West: seedsW },
    };
    lg.day = lg.lastDay + 2;      // a rest day before the playoffs
    lg.po.day = lg.day;
  };
  const HOME_PATTERN = [1, 1, 0, 0, 1, 0, 1];   // 1 => higher seed hosts (2-2-1-1-1)
  L.poSeriesGameInfo = (ser) => {
    const n = ser.w[0] + ser.w[1];
    const hiHome = HOME_PATTERN[n] === 1;
    return { h: hiHome ? ser.hi : ser.lo, a: hiHome ? ser.lo : ser.hi, n };
  };
  L.poActiveSeries = lg => lg.po.rounds[lg.po.round - 1].filter(s => s.w[0] < 4 && s.w[1] < 4);
  L.poGamesToday = function (lg) {
    if (!lg.po || lg.phase !== 'playoffs') return [];
    return L.poActiveSeries(lg).filter(s => s.lastDay !== lg.day).map(s => {
      const i = L.poSeriesGameInfo(s);
      return { day: lg.day, h: i.h, a: i.a, ser: s, done: false, n: i.n + 1, po: true };
    });
  };
  L.poPlay = function (G, g, res) {
    const lg = G.league;
    const result = res || null;
    let r = result;
    if (!r) r = L.simOne(G, g, true);
    else L.record(G, g, r, true);
    const ser = g.ser; ser.lastDay = g.day;
    const hiWon = (r.score[0] > r.score[1]) === (g.h === ser.hi);
    ser.w[hiWon ? 0 : 1]++;
    ser.games.push({ h: g.h, a: g.a, sc: r.score.slice(), ot: r.ot, day: g.day });
    return r;
  };
  // advance playoff rounds: round winners seed the next round within each conference
  L.poAdvance = function (G) {
    const lg = G.league, po = lg.po;
    const cur = po.rounds[po.round - 1];
    const done = cur.every(s => s.w[0] === 4 || s.w[1] === 4);
    if (!done) { lg.day++; return; }
    const win = s => s.w[0] === 4 ? s.hi : s.lo;
    if (po.round === 4) { lg.champion = win(cur[0]); lg.day++; L.finishSeason(G); return; }
    const mkSer = (conf, a, b) => {
      const seeds = po.seeds[conf];
      const hi = seeds.indexOf(a) < seeds.indexOf(b) ? a : b, lo = hi === a ? b : a;
      return { conf, hi, lo, hiSeed: seeds.indexOf(hi) + 1, loSeed: seeds.indexOf(lo) + 1, w: [0, 0], games: [] };
    };
    const next = [];
    if (po.round === 1 || po.round === 2) {
      for (const conf of ['East', 'West']) {
        const w = cur.filter(s => s.conf === conf).map(win);
        if (po.round === 1) { next.push(mkSer(conf, w[0], w[1])); next.push(mkSer(conf, w[2], w[3])); }
        else next.push(mkSer(conf, w[0], w[1]));
      }
    } else { // round 3 -> finals
      const eT = win(cur.find(s => s.conf === 'East')), wT = win(cur.find(s => s.conf === 'West'));
      const eR = lg.rec[eT], wR = lg.rec[wT];
      const hi = (L.pct(eR) > L.pct(wR) || (L.pct(eR) === L.pct(wR) && eT < wT)) ? eT : wT, lo = hi === eT ? wT : eT;
      next.push({ conf: 'Finals', hi, lo, hiSeed: 1, loSeed: 1, w: [0, 0], games: [] });
    }
    po.round++;
    po.rounds[po.round - 1] = next;
    lg.day += 2;     // rest days between rounds
  };

  L.finishSeason = function (G) {
    const lg = G.league;
    lg.phase = 'done';
    const ut = G.userTeam, rec = lg.rec[ut];
    const poGames = lg.userBoxes.filter(b => b.po);
    const poLosses = poGames.filter(b => (b.h === ut) === (b.sc[0] < b.sc[1])).length;
    const best = Math.max(...lg.rec.map(r => r.w));
    lg.ach = {
      perfect: rec.w === lg.games && rec.l === 0,
      bestRecord: rec.w === best,
      champion: lg.champion === ut,
      undefeatedChampion: rec.w === lg.games && rec.l === 0 && lg.champion === ut && poLosses === 0,
      madePlayoffs: lg.po.seeds.East.concat(lg.po.seeds.West).includes(ut),
      wins: rec.w, losses: rec.l, poRecordLosses: poLosses,
    };
    if (!lg.awards) L.seasonAwards(G);
    L.playoffMvp(G);
  };

  // ----- stats views --------------------------------------------------------
  L.perGame = (s, k) => s.gp ? s[k] / s.gp : 0;
  L.leaders = function (G, key, n, playoff) {
    const map = playoff ? G.league.pstatsPO : G.league.pstats;
    const minGp = Math.max(1, Math.floor((G.league.tgp[0] || 0) * 0.35));
    let rows = Object.keys(map).map(id => ({ id: +id, s: map[id] }));
    if (!playoff) rows = rows.filter(r => r.s.gp >= minGp);
    const val = r => {
      const s = r.s;
      switch (key) {
        case 'ppg': return s.pts / s.gp; case 'rpg': return (s.oreb + s.dreb) / s.gp; case 'apg': return s.ast / s.gp;
        case 'spg': return s.stl / s.gp; case 'bpg': return s.blk / s.gp;
        case 'fg': return s.fga >= 3 * minGp ? s.fgm / s.fga : -1; case 'tp': return s.tpa >= 1 * minGp ? s.tpm / s.tpa : -1;
        default: return 0;
      }
    };
    return rows.sort((a, b) => val(b) - val(a)).slice(0, n).map(r => ({ id: r.id, v: val(r), s: r.s }));
  };
  // ----- awards & honors -------------------------------------------------------
  // per-game "game score" (Hollinger-style) from box totals
  const gscore = s => (s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov) / Math.max(1, s.gp);
  const isG = id => PB.BYID[id].r.pos1 <= 1, isC = id => PB.BYID[id].r.pos1 === 4, isF = id => !isG(id) && !isC(id);
  L.honor = function (lg, id, label) { lg.honors = lg.honors || {}; (lg.honors[id] = lg.honors[id] || []).push(label); };
  function eligible(G, frac) {
    const lg = G.league;
    return Object.keys(lg.pstats).map(id => ({ id: +id, s: lg.pstats[id], t: G.claimed[id] })).filter(r => r.s.gp >= Math.max(1, (lg.tgp[r.t] || 0) * frac));
  }
  const winPct = (lg, t) => { const r = lg.rec[t]; return (r.w + r.l) ? r.w / (r.w + r.l) : 0.5; };
  const mvpScore = (lg, r) => gscore(r.s) * (0.65 + 0.7 * winPct(lg, r.t)) * Math.min(1, r.s.gp / Math.max(1, lg.tgp[r.t] * 0.8));
  function defScore(G, r) {
    const lg = G.league, s = r.s, g = Math.max(1, s.gp);
    const opp = lg.rec[r.t], gp = Math.max(1, opp.w + opp.l);
    const lgOpp = PB.avg(lg.rec.map(x => x.pa / Math.max(1, x.w + x.l)));
    return 2.2 * s.stl / g + 1.9 * s.blk / g + 0.3 * s.dreb / g + (lgOpp - opp.pa / gp) * 0.12 + (s.sec / g / 60) * 0.04;
  }
  // pick `teams` five-man units with 2 guards, 2 forwards, 1 center (falls back to best available)
  function positional(rows, teams) {
    const used = new Set(), out = [];
    for (let k = 0; k < teams; k++) {
      const five = [];
      const take = (pred, n) => { for (const r of rows) { if (n <= 0) break; if (!used.has(r.id) && pred(r.id)) { used.add(r.id); five.push(r.id); n--; } } return n; };
      let left = take(isG, 2) + take(isF, 2) + take(isC, 1);
      if (left) take(() => true, left);
      out.push(five);
    }
    return out;
  }
  L.allStarBreak = function (G) {
    const lg = G.league;
    const rows = eligible(G, 0.4).map(r => Object.assign(r, { v: mvpScore(lg, r) })).sort((a, b) => b.v - a.v);
    const squads = {};
    for (const conf of ['East', 'West']) {
      const pool = rows.filter(r => G.teams[r.t].conf === conf);
      const starters = positional(pool, 1)[0];
      const reserves = pool.filter(r => !starters.includes(r.id)).slice(0, 7).map(r => r.id);
      squads[conf] = { starters, reserves };
      for (const id of starters.concat(reserves)) L.honor(lg, id, 'All-Star' + (starters.includes(id) ? ' (starter)' : ''));
    }
    // exhibition game between the two squads (not counted in standings)
    const mk = (conf, i) => ({ id: 100 + i, name: conf + ' All-Stars', abbr: conf.toUpperCase().slice(0, 3), starters: squads[conf].starters.slice(), bench: squads[conf].reserves.slice(), strat: { off: 'fast', def: 'man' } });
    let game = null;
    try {
      const E = mk('East', 0), Wt = mk('West', 1);
      const res = PB.simGame(E, Wt, { rng: new PB.RNG(lg.seed ^ 0xa5a5), quarterMin: 12 });
      const win = res.score[0] > res.score[1] ? 0 : 1;
      let mvp = null, best = -1e9;
      for (const id in res.box[win]) { const b = res.box[win][id]; const v = b.pts + b.oreb + b.dreb + b.ast; if (v > best) { best = v; mvp = +id; } }
      game = { score: res.score, winner: win ? 'West' : 'East', mvp };
      if (mvp) L.honor(lg, mvp, 'All-Star Game MVP');
    } catch (e) { console.error(e); }
    lg.allStar = { day: lg.day, squads, game };
    lg.news = { t: 'allstar', day: lg.day };
  };
  L.seasonAwards = function (G) {
    const lg = G.league;
    const rows = eligible(G, 0.6);
    if (!rows.length) return;
    const byMvp = rows.map(r => Object.assign({}, r, { v: mvpScore(lg, r) })).sort((a, b) => b.v - a.v);
    const byDef = rows.map(r => Object.assign({}, r, { v: defScore(G, r) })).sort((a, b) => b.v - a.v);
    const bench = rows.filter(r => r.s.gs < r.s.gp * 0.35).map(r => Object.assign({}, r, { v: gscore(r.s) })).sort((a, b) => b.v - a.v);
    const lead = (k, f) => rows.slice().sort((a, b) => f(b.s) - f(a.s))[0];
    const A = {
      mvp: byMvp[0].id, mvpVotes: byMvp.slice(0, 5).map(r => r.id),
      dpoy: byDef[0].id, sixth: bench.length ? bench[0].id : null,
      scoring: lead('pts', s => s.pts / s.gp).id, rebounding: lead('reb', s => (s.oreb + s.dreb) / s.gp).id, assists: lead('ast', s => s.ast / s.gp).id,
      allLeague: positional(byMvp, 3), allDefense: positional(byDef, 2),
    };
    lg.awards = A;
    L.honor(lg, A.mvp, 'MVP'); L.honor(lg, A.dpoy, 'Defensive Player of the Year');
    if (A.sixth) L.honor(lg, A.sixth, 'Sixth Pokémon of the Year');
    L.honor(lg, A.scoring, 'Scoring Title'); L.honor(lg, A.rebounding, 'Rebounding Title'); L.honor(lg, A.assists, 'Assists Title');
    ['1st', '2nd', '3rd'].forEach((n, i) => A.allLeague[i].forEach(id => L.honor(lg, id, 'All-League ' + n + ' Team')));
    ['1st', '2nd'].forEach((n, i) => A.allDefense[i].forEach(id => L.honor(lg, id, 'All-Defensive ' + n + ' Team')));
    lg.news = { t: 'awards', day: lg.day };
  };
  L.playoffMvp = function (G) {
    const lg = G.league;
    if (lg.champion == null || !lg.awards) return;
    const ids = G.teams[lg.champion].roster.filter(id => lg.pstatsPO[id]);
    if (!ids.length) return;
    const best = ids.map(id => ({ id, v: gscore(lg.pstatsPO[id]) * Math.sqrt(lg.pstatsPO[id].gp) })).sort((a, b) => b.v - a.v)[0];
    lg.awards.playoffMvp = best.id;
    L.honor(lg, best.id, 'Playoffs MVP');
    for (const id of G.teams[lg.champion].roster) L.honor(lg, id, 'Champion');
  };

  // ----- player/team info ---------------------------------------------------
  L.teamStr = (G, id) => PB.teamOvr(G.teams[id]);
})(window.PB);
