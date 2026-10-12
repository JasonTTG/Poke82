// Franchise extras: hidden talent variance and scouting, draft lottery and tradable picks, in-season evolution,
// rookies, records and career stats, league rules.
(function (PB) {
  const F = PB.Franchise, { clamp } = PB;
  const isHuman = (G, tid) => !!G.teams[tid].user;
  F.DEFAULTS.variance = 1;          // 0 off, 0.5 low, 1 normal, 2 high

  // ---------- talent variance: every Pokemon has a hidden talent (and a form that changes each season) ----------
  const V = PB.Var = { snap: false };
  const hash = (a, b) => { let h = (a ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ b, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xc2b2ae35) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const gauss = (seed, id) => (hash(seed, id * 2 + 1) + hash(seed, id * 2 + 2) - 1) * 2.45;
  V.talent = (G, id) => clamp(gauss(G.seed >>> 0, id), -2, 2);          // roughly -2 .. +2
  V.form = (G, id) => clamp(gauss((G.seed ^ Math.imul(G.fr.year, 7919)) >>> 0, id + 5000), -2, 2);
  V.devMul = (G, id) => (G.fr && G.fr.cfg.variance) ? clamp(1 + V.talent(G, id) * 0.12 * G.fr.cfg.variance, 0.75, 1.25) : 1;
  V.snapshot = function () {
    if (V.snap) return; V.snap = true;
    for (const m of PB.MONS) { m._r0 = Object.assign({}, m.r); m._o0 = m.ovr; m._u0 = m.tend.usage; }
  };
  V.reset = function () { if (!V.snap) return; for (const m of PB.MONS) { Object.assign(m.r, m._r0); m.ovr = m._o0; m.tend.usage = m._u0; m._pot = null; } };
  V.apply = function (G) {
    V.snapshot(); V.reset();
    if (!G || !G.fr || !G.fr.cfg.variance) return;
    const sc = G.fr.cfg.variance, keys = Object.keys(PB.RLABELS);
    for (const m of PB.MONS) {
      const off = (V.talent(G, m.id) * 2.4 + V.form(G, m.id) * 1.2) * sc;
      if (Math.abs(off) < 0.05) continue;
      for (const k of keys) m.r[k] = clamp(Math.round(m._r0[k] + off + (hash(G.seed >>> 0, m.id * 31 + k.length * 7 + k.charCodeAt(0)) - 0.5) * 1.6 * sc), 20, 99);
      m.ovr = clamp(Math.round(m._o0 + off * 0.8), 30, 99);
      m.tend.usage = m._u0 + off * 0.5; m._pot = null;
    }
    if (PB.Abil) PB.Abil.clearCache();
  };
  // PB.G is an accessor so that variance follows whichever game is active
  let _G = null;
  Object.defineProperty(PB, 'G', { get() { return _G; }, set(v) { _G = v; try { V.apply(v); } catch (e) { console.error(e); } }, configurable: true });

  // scouting: points per draft; a scouted prospect shows a grade that blends hidden talent and ceiling
  F.scoutGrade = (G, id) => {
    const m = PB.BYID[id], x = V.talent(G, id) + (F.potential(m) - m.ovr) / 12;
    return x > 1.5 ? 'A+' : x > 1.05 ? 'A' : x > 0.65 ? 'A-' : x > 0.3 ? 'B+' : x > 0 ? 'B' : x > -0.3 ? 'B-' : x > -0.7 ? 'C+' : x > -1.1 ? 'C' : 'D';
  };
  F.scoutNote = (G, id) => { const t = V.talent(G, id), m = PB.BYID[id], up = F.potential(m) - m.ovr; return (t > 0.8 ? 'Natural talent' : t < -0.8 ? 'Raw, may struggle' : 'Typical talent') + (up > 9 ? ' · big ceiling after evolving' : up > 3 ? ' · grows when it evolves' : ' · what you see is what you get'); };
  F.scout = function (G, tid, id) {
    const fr = G.fr;
    if (fr.stage !== 'draft' || !fr.draft || !fr.draft.prospects.includes(id)) throw new Error('You can only scout draft prospects');
    fr.scoutPts = fr.scoutPts || {}; fr.scouted = fr.scouted || {};
    if ((fr.scoutPts[tid] || 0) <= 0) throw new Error('No scouting points left');
    if (fr.scouted[tid + ':' + id]) return;
    fr.scoutPts[tid]--; fr.scouted[tid + ':' + id] = 1;
  };
  F.scouted = (G, tid, id) => !!(G.fr.scouted && G.fr.scouted[tid + ':' + id]);

  // ---------- draft picks as assets + lottery ----------
  const pkey = (y, r, o) => 'p:' + y + '.' + r + '.' + o;
  const pparse = k => { const [y, r, o] = k.slice(2).split('.').map(Number); return { y, r, o }; };
  F.isPick = a => typeof a === 'string';
  F.pickLabel = (G, key) => { const p = pparse(key); return 'S' + p.y + ' R' + (p.r + 1) + (p.o === undefined ? '' : ' (' + G.teams[p.o].abbr + ')'); };
  F.ensurePicks = function (G) {
    const fr = G.fr; fr.pk = fr.pk || {};
    for (let y = fr.year; y <= fr.year + 1; y++) for (let r = 0; r < fr.cfg.draftRounds; r++) for (const t of G.teams) { const k = pkey(y, r, t.id); if (fr.pk[k] == null) fr.pk[k] = t.id; }
  };
  F.ownedPicks = (G, tid) => { F.ensurePicks(G); const fr = G.fr; return Object.keys(fr.pk).filter(k => fr.pk[k] === tid).sort((a, b) => { const x = pparse(a), y = pparse(b); return x.y - y.y || x.r - y.r || x.o - y.o; }); };
  F.pickVal = function (G, key) {
    const fr = G.fr, lg = G.league, p = pparse(key);
    let base = [3.6, 1.5, 0.8, 0.45, 0.3, 0.2][Math.min(p.r, 5)];
    const d = fr.draft;
    if (fr.stage === 'draft' && d && p.y === fr.year) {
      const idx = d.slots.findIndex(s => s.o === p.o && s.r === p.r);
      if (idx < d.pick) return 0;
      if (idx >= 0) base *= 1.7 - 1.3 * (idx / d.seq.length);
    } else if (p.y > fr.year) base *= 0.85;
    if (lg && lg.rec) {
      const ids = G.teams.map(t => t.id).filter(id => lg.rec[id]), ord = PB.League.sortTeams(G, ids).reverse();   // worst first (expansion teams have no record yet)
      const rank = ord.indexOf(p.o); if (rank >= 0) base *= 0.75 + 0.7 * (1 - rank / Math.max(1, ids.length - 1));
    }
    return base;
  };
  const assetVal = (G, a) => F.isPick(a) ? F.pickVal(G, a) : F.tval(G, a);
  const owns = (G, tid, a) => F.isPick(a) ? G.fr.pk[a] === tid : G.claimed[a] === tid;

  const origStart = F.startDraft;
  F.startDraft = function (G) {
    const d = origStart(G);
    if (!d) return d;
    F.ensurePicks(G);
    F.buildOrder(G, d);
    const fr = G.fr;
    fr.scoutPts = {}; fr.scouted = {};
    for (const t of G.teams) if (isHuman(G, t.id)) fr.scoutPts[t.id] = 6 + fr.cfg.draftRounds;
    return d;
  };
  F.buildOrder = function (G, d) {
    const fr = G.fr, cfg = fr.cfg, lg = G.league, R = cfg.draftRounds, added = d.added;
    const old = G.teams.filter(t => !added.includes(t.id)).map(t => t.id);
    const po = new Set(lg && lg.po ? (lg.po.seeds.League || []) : []);
    const worst = PB.League.sortTeams(G, old).reverse();
    const lot = worst.filter(id => !po.has(id)), rest = worst.filter(id => po.has(id));
    const rng = new PB.RNG((G.seed ^ Math.imul(fr.year, 2654435761) ^ 0x1077) >>> 0);
    const wts = lot.map((id, j) => Math.pow(lot.length - j, 1.8)), tot = wts.reduce((a, b) => a + b, 0);
    const odds = lot.map((id, j) => ({ t: id, p: wts[j] / (tot || 1) }));
    const pool = lot.slice(), drawn = [];
    const k = pool.length > 3 ? 3 : pool.length > 1 ? 1 : 0;
    for (let i = 0; i < k; i++) { const idx = rng.weighted(pool.map((id, j) => Math.pow(pool.length - j, 1.8))); drawn.push(pool.splice(idx, 1)[0]); }
    const base = rng.shuffle(added.slice()).concat(drawn, pool, rest);
    const quota = {}; for (const t of G.teams) quota[t.id] = added.includes(t.id) ? cfg.rosterMax : R;
    const maxQ = Math.max(...Object.values(quota)), total = d.prospects.length + d.history.length;
    const slots = [];
    for (let r = 0; r < maxQ && slots.length < total; r++) { const act = base.filter(id => quota[id] > r); if (r % 2) act.reverse(); for (const o of act) slots.push({ r, o }); }
    slots.length = Math.min(slots.length, total);
    d.slots = slots;
    d.seq = slots.map(sl => (!added.includes(sl.o) && sl.r < R && fr.pk[pkey(fr.year, sl.r, sl.o)] != null) ? fr.pk[pkey(fr.year, sl.r, sl.o)] : sl.o);
    d.lottery = { teams: lot, odds, drawn, base };
  };
  // after the class is drafted, the year's picks are spent
  const origFinish = F.finishDraft;
  F.finishDraft = function (G) {
    origFinish(G);
    const fr = G.fr;
    for (const k of Object.keys(fr.pk)) if (pparse(k).y <= fr.year) delete fr.pk[k];
  };
  const origPick = F.draftPick;
  F.draftPick = function (G, tid, monId) {
    if (!PB.legalAdd(G, tid, monId)) throw new Error('Legendary limit reached (' + G.rules.legCap + ' per team)');
    origPick(G, tid, monId);
    const fr = G.fr; fr.rookie = fr.rookie || {}; fr.rookie[monId] = fr.year + 1;
  };

  // ---------- in-season evolution ----------
  F.evolve = function (G, id, toId) {
    const fr = G.fr, tid = G.claimed[id], lg = G.league;
    if (tid == null) throw new Error('Not on a team');
    if (lg && lg.phase === 'playoffs') throw new Error('Evolution waits until the playoffs are over');
    const opt = F.evoOptions(G, id).find(o => o.to === toId);
    if (!opt) throw new Error('That evolution is not available');
    if (!opt.ready) throw new Error('Not enough development yet (' + Math.round(fr.dev[id] || 0) + '/' + opt.need + ')');
    if (!PB.legalAdd(G, tid, toId, [id])) throw new Error('Legendary limit reached');
    const T = G.teams[tid];
    const rep = a => a.map(x => x === id ? toId : x);
    T.roster = rep(T.roster); T.starters = rep(T.starters); T.bench = rep(T.bench);
    delete G.claimed[id]; G.claimed[toId] = tid;
    fr.dev[toId] = Math.max(0, (fr.dev[id] || 0) - opt.need); delete fr.dev[id];
    for (const mp of [fr.inj, fr.focus, fr.rookie, fr.career]) if (mp && mp[id] != null) { mp[toId] = mp[id]; delete mp[id]; }
    if (lg) {
      if (lg.honors && lg.honors[id]) lg.honors[toId] = (lg.honors[toId] || []).concat(lg.honors[id]);
      for (const key of ['pstats', 'pstatsPO']) if (lg[key] && lg[key][id]) { lg[key][toId] = lg[key][id]; delete lg[key][id]; }
      if (lg.lastTeam) { lg.lastTeam[toId] = tid; delete lg.lastTeam[id]; }
    }
    PB.Abil.evolveCarry(G, id, toId);
    fr.evoLog.push({ y: fr.year, t: tid, from: id, to: toId, d: lg ? lg.day : 0 });
    F.news(G, PB.BYID[id].dispName + ' evolved into ' + PB.BYID[toId].dispName + '!', isHuman(G, tid));
    PB.Var.apply(G);
    return toId;
  };
  const origWeekly = F.aiWeekly;
  F.aiWeekly = function (G) { origWeekly(G); if (G.league && G.league.phase === 'regular') F.aiEvolve(G); };

  // ---------- trades with picks ----------
  F.tradeBlocked = function (G) {
    const lg = G.league, fr = G.fr;
    if (!lg) return 'No season';
    if (lg.phase === 'playoffs') return 'Trades are closed during the playoffs.';
    if (lg.phase === 'regular' && fr.cfg.tradeDeadline && lg.day > Math.floor(lg.lastDay * 0.7)) return 'The trade deadline has passed.';
    if (fr.stage === 'dev') return 'Trades reopen when the draft begins.';
    if (fr.stage === 'review') return 'Trades reopen in the offseason.';
    if (fr.stage === 'over') return 'The franchise is over.';
    return null;
  };
  F.evalTrade = function (G, a, b, giveA, giveB) {
    const fr = G.fr, A = G.teams[a], B = G.teams[b];
    const lim = fr.cfg.rosterMax + ((fr.stage === 'draft' || fr.stage === 'fa') ? 8 : 0);
    if (!giveA.length && !giveB.length) return { ok: false, reason: 'Select players or picks to trade.' };
    for (const x of giveA) if (!owns(G, a, x)) return { ok: false, reason: 'Invalid asset.' };
    for (const x of giveB) if (!owns(G, b, x)) return { ok: false, reason: 'Invalid asset.' };
    const pa = giveA.filter(x => !F.isPick(x)), pb = giveB.filter(x => !F.isPick(x));
    const na = A.roster.length - pa.length + pb.length, nb = B.roster.length - pb.length + pa.length;
    if (na > lim) return { ok: false, reason: A.name + ' would have more than ' + lim + ' Pokémon.' };
    if (nb > lim) return { ok: false, reason: B.name + ' would have more than ' + lim + ' Pokémon.' };
    if (na < 12 || nb < 12) return { ok: false, reason: 'Both teams need at least 12 Pokémon.' };
    for (const id of pb) if (!PB.legalAdd(G, a, id, pa)) return { ok: false, reason: A.name + ' would exceed the legendary limit.' };
    for (const id of pa) if (!PB.legalAdd(G, b, id, pb)) return { ok: false, reason: B.name + ' would exceed the legendary limit.' };
    const vin = giveA.reduce((s, x) => s + assetVal(G, x), 0), vout = giveB.reduce((s, x) => s + assetVal(G, x), 0);
    const ratio = vout > 0 ? vin / vout : 9;
    const need = 1.07 + 0.04 * Math.max(0, pa.length - pb.length);
    return { ok: ratio >= need, ratio, need, vin, vout, reason: ratio >= need ? '' : (ratio >= need * 0.85 ? 'Close — ask for a little less or add something.' : 'They want a lot more value.') };
  };
  F.trade = function (G, a, b, giveA, giveB, force) {
    const blocked = F.tradeBlocked(G); if (blocked) throw new Error(blocked);
    const ev = F.evalTrade(G, a, b, giveA, giveB);
    if (!ev.ok && !(force && ev.vin != null)) throw new Error(ev.reason || 'Rejected');
    const fr = G.fr, d = fr.draft;
    for (const x of giveA.concat(giveB)) if (!F.isPick(x)) PB.Registry.release(G, x);
    for (const x of giveA) { if (F.isPick(x)) fr.pk[x] = b; else PB.Registry.claim(G, x, b); }
    for (const x of giveB) { if (F.isPick(x)) fr.pk[x] = a; else PB.Registry.claim(G, x, a); }
    // picks in the draft that is under way change hands on the board too
    if (fr.stage === 'draft' && d) for (const x of giveA.concat(giveB)) if (F.isPick(x)) { const p = pparse(x); if (p.y === fr.year) d.slots.forEach((sl, i) => { if (i >= d.pick && sl.o === p.o && sl.r === p.r && sl.r < fr.cfg.draftRounds) d.seq[i] = fr.pk[x]; }); }
    for (const t of [a, b]) { if (isHuman(G, t)) PB.fixLineup(G.teams[t]); else PB.autoLineup(G.teams[t]); }
    const nm = x => F.isPick(x) ? F.pickLabel(G, x) : PB.BYID[x].dispName;
    F.news(G, G.teams[a].abbr + ' and ' + G.teams[b].abbr + ' trade: ' + giveA.map(nm).join(', ') + ' for ' + giveB.map(nm).join(', ') + '.', isHuman(G, a) || isHuman(G, b));
  };

  // ---------- legendary cap in free agency / AI drafting ----------
  F.aiPick = function (G, tid) {
    const d = G.fr.draft, t = G.teams[tid];
    let best = null, bv = -1e9, seen = 0;
    for (const id of d.prospects) {
      if (!PB.legalAdd(G, tid, id)) continue;
      const m = PB.BYID[id];
      const v = F.mval(m) + (PB.draftValue(t, t.roster, m, G.rng, 0) - m.ovr) * 0.9 + G.rng.gauss() * 1.5 + PB.Var.talent(G, id) * 1.2;
      if (v > bv) { bv = v; best = id; }
      if (++seen >= 14) break;
    }
    return best != null ? best : d.prospects[0];
  };

  // ---------- records, career stats, rookie of the year ----------
  const GAME_KEYS = [['pts', 'Points', b => b.pts], ['reb', 'Rebounds', b => b.oreb + b.dreb], ['ast', 'Assists', b => b.ast], ['stl', 'Steals', b => b.stl], ['blk', 'Blocks', b => b.blk], ['tpm', 'Threes made', b => b.tpm]];
  F.GAME_KEYS = GAME_KEYS;
  const origAfter = F.afterGame;
  F.afterGame = function (G, game, result) {
    origAfter(G, game, result);
    const fr = G.fr, lg = G.league;
    fr.records = fr.records || { game: {}, team: {}, season: {} };
    const R = fr.records; R.team = R.team || {}; R.game = R.game || {};
    for (let s = 0; s < 2; s++) {
      const tid = s === 0 ? game.h : game.a;
      for (const id in result.box[s]) {
        const b = result.box[s][id]; if (b.sec <= 0) continue;
        for (const [k, , f] of GAME_KEYS) { const v = f(b); if (v > ((R.game[k] && R.game[k].v) || 0)) R.game[k] = { v, id: +id, t: tid, y: fr.year, day: game.day, opp: s === 0 ? game.a : game.h }; }
      }
      const sc = result.score[s], margin = sc - result.score[1 - s];
      if (sc > ((R.team.pts && R.team.pts.v) || 0)) R.team.pts = { v: sc, t: tid, y: fr.year };
      if (margin > ((R.team.margin && R.team.margin.v) || 0)) R.team.margin = { v: margin, t: tid, y: fr.year, opp: s === 0 ? game.a : game.h };
      if (lg.phase === 'regular') { const st = lg.rec[tid].strk; if (st > ((R.team.streak && R.team.streak.v) || 0)) R.team.streak = { v: st, t: tid, y: fr.year }; }
    }
  };
  const origEnd = F.onSeasonEnd;
  F.onSeasonEnd = function (G) {
    origEnd(G);
    const fr = G.fr, lg = G.league, R = fr.records = fr.records || { game: {}, team: {} };
    R.season = R.season || {}; R.team = R.team || {}; R.game = R.game || {};
    fr.career = fr.career || {};
    for (const id in lg.pstats) {
      const s = lg.pstats[id], c = fr.career[id] = fr.career[id] || { gp: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tpm: 0, seasons: 0, mvp: 0, titles: 0 };
      c.gp += s.gp; c.pts += s.pts; c.reb += s.oreb + s.dreb; c.ast += s.ast; c.stl += s.stl; c.blk += s.blk; c.tpm += s.tpm; c.seasons++;
    }
    if (lg.awards && lg.awards.mvp != null) { const c = fr.career[lg.awards.mvp]; if (c) c.mvp++; }
    if (lg.champion != null) for (const id of G.teams[lg.champion].roster) { const c = fr.career[id]; if (c) c.titles++; }
    const best = PB.League.sortTeams(G, G.teams.map(t => t.id))[0], br = lg.rec[best];
    const cur = R.team.record;
    if (!cur || PB.League.pct(br) > cur.pct) R.team.record = { w: br.w, l: br.l, pct: PB.League.pct(br), t: best, y: fr.year };
    const sc = {}; for (const id in lg.pstats) { const s = lg.pstats[id]; if (s.gp >= lg.games * 0.5) { const g = s.pts / s.gp; if (g > ((R.season.ppg && R.season.ppg.v) || 0)) R.season.ppg = { v: g, id: +id, y: fr.year }; const rb = (s.oreb + s.dreb) / s.gp; if (rb > ((R.season.rpg && R.season.rpg.v) || 0)) R.season.rpg = { v: rb, id: +id, y: fr.year }; const ap = s.ast / s.gp; if (ap > ((R.season.apg && R.season.apg.v) || 0)) R.season.apg = { v: ap, id: +id, y: fr.year }; } }
  };
  // R.season exists from the start
  const origCreate = F.create;
  F.create = function (seed, cfg, humans) {
    const G = origCreate(seed, cfg, humans);
    G.fr.records = { game: {}, team: {}, season: {} }; G.fr.career = {}; G.fr.rookie = {}; G.fr.pk = {};
    G.rules = G.rules || { legCap: (cfg && cfg.legCap) || 0 };
    F.ensurePicks(G);
    PB.G = G;
    return G;
  };
  const origNext = F.startNextSeason;
  F.startNextSeason = function (G) {
    const lg = origNext(G);
    F.ensurePicks(G);
    PB.Var.apply(G);
    return lg;
  };

  // ---------- league rules ----------
  F.RULES = [
    { k: 'legCap', label: 'Legendaries per team', opts: [[0, 'No limit'], [1, 'Max 1'], [2, 'Max 2'], [3, 'Max 3']], where: 'rules' },
    { k: 'playoffTeams', label: 'Playoff teams', opts: [[0, 'Automatic'], [2, '2'], [4, '4'], [8, '8'], [16, '16']] },
    { k: 'seriesLen', label: 'Playoff series', opts: [[3, 'Best of 3'], [5, 'Best of 5'], [7, 'Best of 7']] },
    { k: 'games', label: 'Games per team', opts: [[0, 'Scaled to league size'], [20, '20'], [30, '30'], [40, '40'], [60, '60'], [82, '82']] },
    { k: 'draftRounds', label: 'Draft rounds', opts: [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']] },
    { k: 'rosterMax', label: 'Roster limit', opts: [[15, '15'], [16, '16'], [18, '18'], [20, '20'], [22, '22'], [25, '25']] },
    { k: 'teamCap', label: 'Team cap', opts: [[8, '8'], [10, '10'], [12, '12'], [14, '14'], [16, '16'], [20, '20'], [24, '24'], [30, '30']] },
    { k: 'injRate', label: 'Injuries', opts: [[0, 'Off'], [0.5, 'Rare'], [1, 'Normal'], [2, 'Frequent']] },
    { k: 'evoSpeed', label: 'Evolution speed', opts: [[0.7, 'Slow'], [1, 'Normal'], [1.5, 'Fast']] },
    { k: 'variance', label: 'Talent variance', opts: [[0, 'Off'], [0.5, 'Low'], [1, 'Normal'], [2, 'High']] },
    { k: 'tradeDeadline', label: 'Trade deadline', opts: [[1, 'On'], [0, 'Off']] },
  ];
  F.getRule = (G, k) => k === 'legCap' ? ((G.rules && G.rules.legCap) || 0) : k === 'injRate' ? (G.fr.cfg.injuries ? G.fr.cfg.injRate : 0) : k === 'tradeDeadline' ? (G.fr.cfg.tradeDeadline ? 1 : 0) : G.fr.cfg[k];
  F.setRules = function (G, changes) {
    const fr = G.fr, cfg = fr.cfg;
    for (const k in changes) {
      const def = F.RULES.find(r => r.k === k); if (!def) continue;
      const v = +changes[k]; if (!def.opts.some(o => o[0] === v)) continue;
      if (k === 'legCap') { G.rules = G.rules || {}; G.rules.legCap = v; }
      else if (k === 'injRate') { cfg.injuries = v > 0; if (v > 0) cfg.injRate = v; }
      else if (k === 'tradeDeadline') cfg.tradeDeadline = !!v;
      else if (k === 'teamCap') cfg.teamCap = Math.max(v + (v % 2), G.teams.length);
      else cfg[k] = v;
    }
    if (changes.variance != null) PB.Var.apply(G);
    F.news(G, 'League rules were updated.');
  };
})(window.PB);
