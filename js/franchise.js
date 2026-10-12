// Franchise mode: a league that grows one region at a time. Rosters are unevolved Pokemon, which develop and evolve;
// every offseason brings a new region's draft class, expansion teams, free agency, trades and injuries.
(function (PB) {
  const { clamp } = PB;
  const F = PB.Franchise = {};

  F.DEFAULTS = {
    startGen: 1, startRegions: 2, startTeams: 6, teamCap: 16, rosterMax: 20,
    playoffTeams: 0,          // 0 = automatic
    games: 0,                 // 0 = scaled with the number of teams
    seriesLen: 7,
    injuries: true, injRate: 1,
    evoSpeed: 1, draftRounds: 3, tradeDeadline: true,
  };

  // ---------- evolution graph ----------
  let KIDS = null;
  F.kids = id => { if (!KIDS) { KIDS = {}; for (const m of PB.MONS) if (m.from_) (KIDS[m.from_] = KIDS[m.from_] || []).push(m.id); } return KIDS[id] || []; };
  F.stageOf = m => { let s = 0; while (m.from_) { m = PB.BYID[m.from_]; s++; } return s; };
  F.potential = m => {
    if (m._pot != null) return m._pot;
    let best = m.ovr; for (const k of F.kids(m.id)) best = Math.max(best, F.potential(PB.BYID[k]));
    return (m._pot = best);
  };
  F.fullyEvolved = m => F.kids(m.id).length === 0;
  F.mval = m => 0.62 * m.ovr + 0.38 * F.potential(m);
  F.evoNeed = (a, b, cfg) => Math.round((30 + 0.55 * Math.max(10, b.bst - a.bst)) / ((cfg && cfg.evoSpeed) || 1));
  F.unevolvedOf = gens => PB.MONS.filter(m => m.from_ === 0 && gens.includes(m.gen));

  // ---------- helpers ----------
  const evenDown = n => n - (n % 2);
  const evenUp = n => n + (n % 2);
  F.cfg = G => G.fr.cfg;
  F.gamesFor = (n, cfg) => (cfg.games > 0 ? cfg.games : clamp(Math.round(10 + 4.5 * n), 24, 82));
  F.playoffN = (n, cfg) => {
    if (cfg.playoffTeams > 0) return Math.min(cfg.playoffTeams, evenDown(n)) >= 2 ? Math.pow(2, Math.floor(Math.log2(Math.min(cfg.playoffTeams, n)))) : 2;
    return n >= 14 ? 8 : n >= 6 ? 4 : 2;
  };
  F.freeAgents = G => Object.keys(G.fr.pool).map(Number).filter(id => G.claimed[id] == null);
  F.isInj = (G, id) => { const i = G.fr.inj[id]; return !!(i && i.g > 0); };
  F.news = (G, txt, user) => { const fr = G.fr; fr.news.unshift({ y: fr.year, d: G.league ? G.league.day : 0, txt, user: !!user }); if (fr.news.length > 40) fr.news.length = 40; };
  F.userTeam = G => G.teams[G.userTeam];
  const isHuman = (G, tid) => !!G.teams[tid].user;
  F.isHuman = isHuman;

  F.newTeam = function (G) {
    const rng = G.rng;
    const usedC = new Set(G.teams.map(t => t.city)), usedN = new Set(G.teams.map(t => t.nick));
    const cs = PB.CITIES.filter(c => !usedC.has(c)), ns = PB.NICKS.filter(c => !usedN.has(c));
    const city = rng.pick(cs.length ? cs : PB.CITIES), nick = rng.pick(ns.length ? ns : PB.NICKS);
    const idKey = rng.pick(Object.keys(PB.IDENTITIES));
    const t = { id: G.teams.length, city, nick, conf: 'League', div: 'League', identity: idKey, user: false, roster: [], starters: [], bench: [], strat: { off: PB.IDENTITIES[idKey].off, def: PB.IDENTITIES[idKey].def } };
    t.name = city + ' ' + nick; t.abbr = PB.teamAbbr(city);
    const seen = new Set(G.teams.map(x => x.abbr));
    while (seen.has(t.abbr)) t.abbr = t.abbr.slice(0, 2) + String.fromCharCode(65 + Math.floor(rng.next() * 26));
    G.teams.push(t); G.nTeams = G.teams.length;
    return t;
  };

  // ---------- creation ----------
  function distribute(G, pool, rng) {
    const fr = G.fr, n = G.teams.length;
    const per = Math.min(fr.cfg.rosterMax, Math.floor(pool.length / n));
    const vals = {}; pool.forEach(m => { vals[m.id] = F.mval(m) + rng.gauss() * 2; });
    const avail = pool.slice().sort((a, b) => vals[b.id] - vals[a.id]);
    for (let r = 0; r < per; r++) {
      const order = r % 2 ? G.teams.slice().reverse() : G.teams;
      for (const t of order) {
        const top = avail.slice(0, Math.min(avail.length, n * 2 + 2));
        let best = null, bv = -1e9;
        for (const m of top) { if (!PB.legalAdd(G, t.id, m.id)) continue; const v = vals[m.id] + (PB.draftValue(t, t.roster, m, rng, 0) - m.ovr) * 0.8; if (v > bv) { bv = v; best = m; } }
        if (!best) best = avail.find(m => PB.legalAdd(G, t.id, m.id)) || avail[0];
        PB.Registry.claim(G, best.id, t.id); avail.splice(avail.indexOf(best), 1);
      }
    }
    for (const m of avail) fr.pool[m.id] = 1;
  }

  F.create = function (seed, cfg, humans) {
    cfg = Object.assign({}, F.DEFAULTS, cfg);
    cfg.startTeams = clamp(evenUp(cfg.startTeams | 0), 2, 30); cfg.teamCap = clamp(evenUp(cfg.teamCap | 0), cfg.startTeams, 30);
    cfg.rosterMax = clamp(cfg.rosterMax | 0, 13, 30); cfg.startRegions = clamp(cfg.startRegions | 0, 1, 9);
    const rng = new PB.RNG(seed);
    const order = []; for (let i = 0; i < 9; i++) order.push(((cfg.startGen - 1 + i) % 9) + 1);
    const gens = order.slice(0, cfg.startRegions);
    const pool = F.unevolvedOf(gens);
    if (pool.length < cfg.startTeams * 12) throw new Error('Those regions only have ' + pool.length + ' unevolved Pokemon: too few for ' + cfg.startTeams + ' teams. Use fewer teams or more starting regions.');
    const slot = humans && humans.length ? humans[0] : rng.int(0, cfg.startTeams - 1);
    const G = { version: 1, seed, mode: 'franchise', nTeams: cfg.startTeams, rng, claimed: {}, teams: PB.makeTeams(rng, cfg.startTeams, slot), userTeam: slot, draft: null, league: null, settings: PB.defaultSettings() };
    // online leagues: every person's team is flagged before the Pokemon are handed out
    if (humans) for (const h of humans) { const T = G.teams[h]; T.user = true; T.identity = 'user'; T.strat = { off: 'balanced', def: 'man' }; }
    for (const t of G.teams) { t.conf = 'League'; t.div = 'League'; }
    G.rules = { legCap: cfg.legCap || 0 };
    G.fr = { cfg, order, gens, nextIdx: gens.length, pool: {}, dev: {}, inj: {}, focus: {}, year: 1, stage: 'season', draft: null, history: [], evoLog: [], news: [], hall: [] };
    PB.G = G;                                   // applies this league's talent variance before anyone is picked
    distribute(G, pool, rng);
    for (const t of G.teams) PB.autoLineup(t);
    return G;
  };
  // the first season starts once the user has named their team
  F.startLeague = function (G) { G.league = PB.League.create(G, F.gamesFor(G.teams.length, G.fr.cfg)); G.league.season = G.fr.year; F.news(G, 'The league tips off with ' + G.teams.length + ' teams.'); return G.league; };

  // ---------- development, injuries (called after every game) ----------
  const INJ = [['Sprained Ankle', 1, 4, 26], ['Bruised Knee', 1, 3, 18], ['Pulled Hamstring', 3, 9, 16], ['Strained Back', 2, 6, 12], ['Concussion', 3, 7, 8], ['Torn Muscle', 8, 20, 9], ['Fractured Wrist', 12, 30, 6], ['Torn Ligament', 30, 60, 5]];
  F.afterGame = function (G, game, result) {
    const fr = G.fr, cfg = fr.cfg, lg = G.league;
    const rng = new PB.RNG((lg.seed * 31 + game.day * 7919 + game.h * 131 + game.a * 17 + (lg.po ? lg.po.round : 0)) >>> 0);
    for (let s = 0; s < 2; s++) {
      const T = G.teams[s === 0 ? game.h : game.a];
      const box = result.box[s];
      // injured players sit out a game
      const healed = [];
      for (const id of T.roster) { const i = fr.inj[id]; if (i && i.g > 0) { i.g--; if (i.g <= 0) healed.push(id); } }
      for (const id of healed) { delete fr.inj[id]; if (isHuman(G, T.id)) F.news(G, PB.BYID[id].dispName + ' is healthy again.', true); }
      for (const id of T.roster) {
        const b = box[id]; const sec = b ? b.sec : 0;
        // development: practice for everyone, game minutes for the rotation
        fr.dev[id] = (fr.dev[id] || 0) + (0.5 + sec / 60 * 0.07) * (PB.Var ? PB.Var.devMul(G, id) : 1);
        if (!cfg.injuries || sec <= 0 || fr.inj[id]) continue;
        const m = PB.BYID[id];
        const p = 0.00028 * (sec / 60) * (cfg.injRate || 1) * (1 + (60 - m.r.stamina) / 160);
        if (rng.next() < p) {
          const e = INJ[rng.weighted(INJ.map(x => x[3]))];
          fr.inj[id] = { g: rng.int(e[1], e[2]), k: e[0], n: 0 };
          fr.inj[id].n = fr.inj[id].g;
          if (isHuman(G, T.id)) F.news(G, m.dispName + ': ' + e[0] + ' (out ' + fr.inj[id].g + ' game' + (fr.inj[id].g > 1 ? 's' : '') + ')', true);
        }
      }
    }
  };

  // ---------- evolution ----------
  F.evoOptions = function (G, id) {
    const m = PB.BYID[id], fr = G.fr;
    return F.kids(id).map(k => PB.BYID[k]).filter(k => G.claimed[k.id] == null).map(k => ({ to: k.id, need: F.evoNeed(m, k, fr.cfg), ready: (fr.dev[id] || 0) >= F.evoNeed(m, k, fr.cfg) }));
  };
  F.evolve = function (G, id, toId) {
    const fr = G.fr, tid = G.claimed[id];
    if (tid == null) throw new Error('Not on a team');
    if (fr.stage === 'season' && G.league && G.league.phase !== 'done') throw new Error('Pokemon only evolve in the offseason');
    const opt = F.evoOptions(G, id).find(o => o.to === toId);
    if (!opt) throw new Error('That evolution is not available');
    if (!opt.ready) throw new Error('Not enough development yet (' + Math.round(fr.dev[id] || 0) + '/' + opt.need + ')');
    const T = G.teams[tid];
    const rep = a => a.map(x => x === id ? toId : x);
    T.roster = rep(T.roster); T.starters = rep(T.starters); T.bench = rep(T.bench);
    delete G.claimed[id]; G.claimed[toId] = tid;
    fr.dev[toId] = Math.max(0, (fr.dev[id] || 0) - opt.need); delete fr.dev[id];
    if (fr.inj[id]) { fr.inj[toId] = fr.inj[id]; delete fr.inj[id]; }
    if (fr.focus[id]) { fr.focus[toId] = 1; delete fr.focus[id]; }
    const lg = G.league; if (lg && lg.honors && lg.honors[id]) { lg.honors[toId] = (lg.honors[toId] || []).concat(lg.honors[id]); }
    PB.Abil.evolveCarry(G, id, toId);
    fr.evoLog.push({ y: fr.year, t: tid, from: id, to: toId });
    F.news(G, PB.BYID[id].dispName + ' evolved into ' + PB.BYID[toId].dispName + '!', isHuman(G, tid));
    return toId;
  };
  F.aiEvolve = function (G) {
    for (const T of G.teams) {
      if (isHuman(G, T.id)) continue;
      for (const id of T.roster.slice()) {
        const opts = F.evoOptions(G, id).filter(o => o.ready);
        if (!opts.length) continue;
        opts.sort((a, b) => PB.BYID[b.to].ovr - PB.BYID[a.to].ovr);
        F.evolve(G, id, opts[0].to);
      }
    }
  };
  F.canEvolveList = (G, tid) => G.teams[tid].roster.map(id => ({ id, opts: F.evoOptions(G, id) })).filter(x => x.opts.some(o => o.ready));

  // ---------- season end / offseason state machine ----------
  F.onSeasonEnd = function (G) {
    const fr = G.fr, lg = G.league;
    const ut = G.userTeam, rec = lg.rec[ut];
    const poTeams = lg.po ? (lg.po.seeds.League || []) : [];
    let result = poTeams.includes(ut) ? 'Made the playoffs' : 'Missed the playoffs';
    if (lg.champion === ut) result = 'Champions';
    else if (lg.po) { const last = lg.po.rounds.map((r, i) => ({ r, i })).filter(x => x.r.some(s => s.hi === ut || s.lo === ut)).pop(); if (last) result = 'Lost in ' + F.roundName(lg.po, last.i + 1); }
    const sorted = PB.League.sortTeams(G, G.teams.map(t => t.id));
    fr.history.push({ y: fr.year, gens: fr.gens.slice(), teams: G.teams.length, games: lg.games, champ: lg.champion, mvp: lg.awards && lg.awards.mvp, dpoy: lg.awards && lg.awards.dpoy, best: sorted[0], rec: rec.w + '-' + rec.l, result, bestRec: lg.rec[sorted[0]].w + '-' + lg.rec[sorted[0]].l });
    if (lg.awards) { if (lg.awards.mvp != null) fr.hall.push({ y: fr.year, k: 'MVP', id: lg.awards.mvp, t: G.claimed[lg.awards.mvp] }); if (lg.champion != null) fr.hall.push({ y: fr.year, k: 'Champion', t: lg.champion }); }
    fr.stage = 'review';
  };
  F.roundName = (po, r) => {
    const left = po.nRounds - r;
    return left === 0 ? 'the Finals' : left === 1 ? 'the Semifinals' : left === 2 ? 'the Quarterfinals' : 'Round ' + r;
  };
  F.nextRegion = G => G.fr.order[G.fr.nextIdx];
  F.isOver = G => G.fr.stage === 'over';

  // review -> dev (or over when there is nothing left to draft)
  F.beginOffseason = function (G) {
    const fr = G.fr;
    if (fr.stage !== 'review') throw new Error('Not at season review');
    if (F.nextRegion(G) == null) { fr.stage = 'over'; return; }
    for (const T of G.teams) {
      for (const id of T.roster) fr.dev[id] = (fr.dev[id] || 0) + 8 + (fr.focus[id] ? 18 : 0);
    }
    for (const id in fr.inj) { fr.inj[id].g = Math.max(0, fr.inj[id].g - 40); if (fr.inj[id].g <= 0) delete fr.inj[id]; }
    fr.focus = {};
    F.aiEvolve(G);
    for (const T of G.teams) if (!isHuman(G, T.id)) PB.autoLineup(T);
    fr.stage = 'dev';
  };

  // ---------- value / needs ----------
  F.tval = (G, id) => { const m = PB.BYID[id]; const x = F.mval(m) + Math.min(8, (G.fr.dev[id] || 0) / 25); return Math.exp((x - 52) / 8); };
  const prospectValue = (G, t, m, noise) => F.mval(m) + (PB.draftValue(t, t.roster, m, G.rng, 0) - m.ovr) * 0.9 + (noise ? G.rng.gauss() * noise : 0);

  // ---------- draft ----------
  F.startDraft = function (G) {
    const fr = G.fr, cfg = fr.cfg;
    if (fr.stage !== 'dev') throw new Error('Not in the development phase');
    const gen = F.nextRegion(G);
    if (gen == null) { fr.stage = 'over'; return null; }
    fr.gens.push(gen); fr.nextIdx++;
    const klass = F.unevolvedOf([gen]).filter(m => G.claimed[m.id] == null);
    // expansion teams: as many as the grown pool can support, up to the cap
    const totalPool = F.unevolvedOf(fr.gens).length;
    const want = Math.min(cfg.teamCap, evenDown(Math.floor(totalPool / cfg.rosterMax)));
    let k = Math.max(0, want - G.teams.length);
    const oldPicks = G.teams.length * cfg.draftRounds;
    const avail = klass.length + F.freeAgents(G).length - oldPicks;
    k = Math.min(k, Math.max(0, Math.floor(avail / 14)));
    if ((G.teams.length + k) % 2) k--;
    k = Math.max(0, k);
    const added = [];
    for (let i = 0; i < k; i++) added.push(F.newTeam(G).id);
    // order: expansion teams first, then the worst records of last season
    const lg = G.league;
    const old = G.teams.filter(t => !added.includes(t.id)).map(t => t.id);
    const worst = lg ? PB.League.sortTeams(G, old).reverse() : old;
    const base = G.rng.shuffle(added).concat(worst);
    const quota = {}; for (const t of G.teams) quota[t.id] = added.includes(t.id) ? cfg.rosterMax : cfg.draftRounds;
    const seq = [];
    const maxQ = Math.max(...Object.values(quota));
    for (let r = 0; r < maxQ && seq.length < klass.length; r++) {
      const act = base.filter(id => quota[id] > r);
      if (r % 2) act.reverse();
      for (const id of act) seq.push(id);
    }
    seq.length = Math.min(seq.length, klass.length);
    const prospects = klass.slice().sort((a, b) => F.mval(b) - F.mval(a)).map(m => m.id);
    fr.draft = { gen, prospects, seq, pick: 0, history: [], added, nOld: old.length };
    if (added.length) F.news(G, added.length + ' expansion team' + (added.length > 1 ? 's join' : ' joins') + ' the league: ' + added.map(id => G.teams[id].name).join(', ') + '.');
    fr.stage = 'draft';
    return fr.draft;
  };
  F.draftCurrent = G => { const d = G.fr.draft; return d && d.pick < d.seq.length ? d.seq[d.pick] : null; };
  F.draftDone = G => { const d = G.fr.draft; return !d || d.pick >= d.seq.length; };
  F.draftPick = function (G, tid, monId) {
    const d = G.fr.draft;
    if (F.draftDone(G)) throw new Error('The draft is over');
    if (d.seq[d.pick] !== tid) throw new Error('Not this team\'s pick');
    const i = d.prospects.indexOf(monId); if (i < 0) throw new Error('That Pokemon is not in the draft class');
    d.prospects.splice(i, 1);
    PB.Registry.claim(G, monId, tid);
    d.history.push({ n: d.pick, t: tid, mon: monId });
    d.pick++;
    if (F.draftDone(G)) F.finishDraft(G);
  };
  F.aiPick = function (G, tid) {
    const d = G.fr.draft, t = G.teams[tid];
    let best = null, bv = -1e9;
    for (const id of d.prospects.slice(0, 14)) { const v = prospectValue(G, t, PB.BYID[id], 1.5); if (v > bv) { bv = v; best = id; } }
    return best;
  };
  F.draftStepAI = function (G) { const t = F.draftCurrent(G); F.draftPick(G, t, F.aiPick(G, t)); };
  F.draftRunToHuman = function (G) {
    let n = 0;
    while (!F.draftDone(G) && !isHuman(G, F.draftCurrent(G)) && n++ < 5000) F.draftStepAI(G);
  };
  F.draftAutoAll = function (G) {
    let n = 0;
    while (!F.draftDone(G) && n++ < 5000) { const t = F.draftCurrent(G); F.draftPick(G, t, F.aiPick(G, t)); }
  };
  F.finishDraft = function (G) {
    const fr = G.fr, d = fr.draft;
    for (const id of d.prospects) fr.pool[id] = 1;          // undrafted -> free agents
    d.prospects = [];
    // AI teams: trim to the roster limit
    for (const T of G.teams) if (!isHuman(G, T.id)) F.aiTrim(G, T);
    for (const T of G.teams) { if (isHuman(G, T.id)) PB.fixLineup(T); else PB.autoLineup(T); }
    fr.stage = 'fa';
  };

  // ---------- roster moves ----------
  F.sign = function (G, tid, monId) {
    const fr = G.fr, T = G.teams[tid];
    if (G.claimed[monId] != null) throw new Error('Already on a team');
    if (!fr.pool[monId]) throw new Error('Not a free agent');
    if (T.roster.length >= fr.cfg.rosterMax) throw new Error('Roster is full (' + fr.cfg.rosterMax + ')');
    if (!PB.legalAdd(G, tid, monId)) throw new Error('Legendary limit reached (' + G.rules.legCap + ' per team)');
    PB.Registry.claim(G, monId, tid); delete fr.pool[monId];
    if (T.bench.length < 7 && T.starters.length >= 5) T.bench.push(monId);
    if (T.starters.length < 5 || T.bench.length < 7) PB.fixLineup(T);
  };
  F.release = function (G, tid, monId) {
    const fr = G.fr, T = G.teams[tid];
    if (G.claimed[monId] !== tid) throw new Error('Not on this team');
    if (T.roster.length <= 12 && isHuman(G, tid)) throw new Error('You need at least 12 Pokemon');
    PB.Registry.release(G, monId);
    fr.pool[monId] = 1; delete fr.focus[monId];
    PB.fixLineup(T);
  };
  F.aiTrim = function (G, T) {
    const max = G.fr.cfg.rosterMax;
    while (T.roster.length > max) {
      const keep = new Set(T.starters.concat(T.bench));
      const cands = T.roster.filter(id => !keep.has(id)); const list = cands.length ? cands : T.roster;
      list.sort((a, b) => F.mval(PB.BYID[a]) - F.mval(PB.BYID[b]));
      PB.Registry.release(G, list[0]); G.fr.pool[list[0]] = 1;
    }
  };
  // AI teams sign free agents (worst teams and expansion teams first), rounds so everyone gets a fair shot
  F.aiFreeAgency = function (G, target) {
    const fr = G.fr, max = fr.cfg.rosterMax;
    target = target || clamp(max - 2, 14, max);
    const lg = G.league;
    for (let guard = 0; guard < 40; guard++) {
      let acted = false;
      const order = G.teams.filter(t => !isHuman(G, t.id) && t.roster.length < target)
        .sort((a, b) => a.roster.length - b.roster.length || (lg && lg.rec[a.id] && lg.rec[b.id] ? lg.rec[a.id].w - lg.rec[b.id].w : 0));
      if (!order.length) break;
      const fas = F.freeAgents(G).map(id => PB.BYID[id]).sort((a, b) => F.mval(b) - F.mval(a)).slice(0, 40);
      if (!fas.length) break;
      for (const t of order) {
        let best = null, bv = -1e9;
        for (const m of fas) { if (G.claimed[m.id] != null || !PB.legalAdd(G, t.id, m.id)) continue; const v = prospectValue(G, t, m, 1); if (v > bv) { bv = v; best = m; } }
        if (!best) continue;
        F.sign(G, t.id, best.id); acted = true;
      }
      if (!acted) break;
    }
  };
  // in-season: AI teams top off thin rosters
  F.aiWeekly = function (G) {
    const fr = G.fr, lg = G.league;
    if (!lg || lg.phase !== 'regular') return;
    const min = clamp(fr.cfg.rosterMax - 4, 13, fr.cfg.rosterMax);
    for (const T of G.teams) {
      if (isHuman(G, T.id) || T.roster.length >= min) continue;
      const fa = F.freeAgents(G).map(id => PB.BYID[id]).sort((a, b) => F.mval(b) - F.mval(a))[0];
      if (fa) { F.sign(G, T.id, fa.id); PB.fixLineup(T); }
    }
  };

  // ---------- trades ----------
  F.tradeBlocked = function (G) {
    const lg = G.league, fr = G.fr;
    if (!lg) return 'No season';
    if (lg.phase === 'playoffs') return 'Trades are closed during the playoffs.';
    if (lg.phase === 'regular' && fr.cfg.tradeDeadline && lg.day > Math.floor(lg.lastDay * 0.7)) return 'The trade deadline has passed.';
    if (fr.stage === 'dev' || fr.stage === 'draft') return 'Trades reopen after the draft.';
    if (fr.stage === 'review') return 'Trades reopen in the offseason.';
    if (fr.stage === 'over') return 'The franchise is over.';
    return null;
  };
  F.evalTrade = function (G, a, b, giveA, giveB) {
    const fr = G.fr, max = fr.cfg.rosterMax;
    const A = G.teams[a], B = G.teams[b];
    if (!giveA.length && !giveB.length) return { ok: false, reason: 'Select players to trade.' };
    for (const id of giveA) if (G.claimed[id] !== a) return { ok: false, reason: 'Invalid player.' };
    for (const id of giveB) if (G.claimed[id] !== b) return { ok: false, reason: 'Invalid player.' };
    const na = A.roster.length - giveA.length + giveB.length, nb = B.roster.length - giveB.length + giveA.length;
    if (na > max) return { ok: false, reason: A.name + ' would have more than ' + max + ' Pokémon.' };
    if (nb > max) return { ok: false, reason: B.name + ' would have more than ' + max + ' Pokémon.' };
    if (na < 12 || nb < 12) return { ok: false, reason: 'Both teams need at least 12 Pokémon.' };
    const vin = giveA.reduce((s, id) => s + F.tval(G, id), 0), vout = giveB.reduce((s, id) => s + F.tval(G, id), 0);
    // consolidation penalty: a team does not like to take on bodies for one star
    const ratio = vout > 0 ? vin / vout : 9;
    const need = 1.07 + 0.04 * Math.max(0, giveA.length - giveB.length);
    return { ok: ratio >= need, ratio, need, vin, vout, reason: ratio >= need ? '' : (ratio >= need * 0.85 ? 'Close — ask for a little less or add something.' : 'They want a lot more value.') };
  };
  F.trade = function (G, a, b, giveA, giveB, force) {
    const blocked = F.tradeBlocked(G); if (blocked) throw new Error(blocked);
    const ev = F.evalTrade(G, a, b, giveA, giveB);
    if (!ev.ok && !(force && ev.reason.indexOf('value') < 0 && ev.reason.indexOf('Close') < 0)) throw new Error(ev.reason || 'Rejected');
    for (const id of giveA) { PB.Registry.release(G, id); }
    for (const id of giveB) { PB.Registry.release(G, id); }
    for (const id of giveA) PB.Registry.claim(G, id, b);
    for (const id of giveB) PB.Registry.claim(G, id, a);
    for (const t of [a, b]) { if (isHuman(G, t)) PB.fixLineup(G.teams[t]); else PB.autoLineup(G.teams[t]); }
    F.news(G, G.teams[a].abbr + ' and ' + G.teams[b].abbr + ' trade: ' + giveA.map(i => PB.BYID[i].dispName).join(', ') + ' for ' + giveB.map(i => PB.BYID[i].dispName).join(', ') + '.', isHuman(G, a) || isHuman(G, b));
  };
  // AI teams shop around for one of the user's players
  F.offersFor = function (G, tid) {
    const fr = G.fr, rng = new PB.RNG((G.seed + fr.year * 977 + (G.league ? G.league.day : 0) * 31 + tid) >>> 0);
    const U = G.teams[tid], max = fr.cfg.rosterMax, out = [];
    const mine = U.roster.slice().sort((x, y) => F.tval(G, y) - F.tval(G, x));
    const teams = rng.shuffle(G.teams.filter(t => t.id !== tid && !isHuman(G, t.id)));
    for (const T of teams) {
      if (out.length >= 5) break;
      const core = new Set(T.starters.slice(0, 2));
      const pool = T.roster.filter(id => !core.has(id)).sort((x, y) => F.tval(G, y) - F.tval(G, x));
      const wants = mine.filter(id => !T.roster.includes(id)).slice(0, 10);
      for (const ask of wants) {
        const V = F.tval(G, ask);
        let best = null, bs = -1;
        for (let i = 0; i < pool.length; i++) {
          const v1 = F.tval(G, pool[i]);
          if (v1 <= V / 1.12 && v1 > bs) { bs = v1; best = [pool[i]]; }
          for (let j = i + 1; j < pool.length; j++) { const v2 = v1 + F.tval(G, pool[j]); if (v2 <= V / 1.25 && v2 > bs) { bs = v2; best = [pool[i], pool[j]]; } }
        }
        if (!best || bs < V * 0.6) continue;
        if (U.roster.length - 1 + best.length > max || T.roster.length - best.length + 1 > max) continue;
        if (!F.evalTrade(G, tid, T.id, [ask], best).ok) continue;      // the AI must like it too (it receives `ask`, gives `best`)
        out.push({ team: T.id, ask: [ask], give: best });
        break;
      }
    }
    return out;
  };

  // ---------- start of the next season ----------
  F.userRosterErrors = function (G, tid) {
    const T = G.teams[tid == null ? G.userTeam : tid], max = G.fr.cfg.rosterMax;
    const errs = PB.validateLineup(T);
    if (T.roster.length > max) errs.push('Roster is over the limit: release ' + (T.roster.length - max) + ' Pokémon (limit ' + max + ').');
    return errs;
  };
  F.startNextSeason = function (G) {
    const fr = G.fr;
    if (fr.stage !== 'fa') throw new Error('Finish the draft first');
    for (const T of G.teams) if (isHuman(G, T.id)) { const e = F.userRosterErrors(G, T.id); if (e.length) throw new Error(T.name + ': ' + e[0]); }
    F.aiFreeAgency(G);
    for (const T of G.teams) { if (isHuman(G, T.id)) PB.fixLineup(T); else { F.aiTrim(G, T); PB.autoLineup(T); } }
    for (const T of G.teams) if (T.roster.length < 12) throw new Error(T.name + ' cannot field a team (not enough free agents).');
    fr.year++; fr.stage = 'season'; fr.draft = null;
    G.league = PB.League.create(G, F.gamesFor(G.teams.length, fr.cfg));
    G.league.season = fr.year;
    F.news(G, 'Season ' + fr.year + ' begins with ' + G.teams.length + ' teams and ' + G.league.games + ' games each.');
    return G.league;
  };
  // sets focus training (max 3)
  F.toggleFocus = function (G, id) {
    const fr = G.fr;
    if (fr.focus[id]) { delete fr.focus[id]; return true; }
    if (Object.keys(fr.focus).length >= 3) return false;
    fr.focus[id] = 1; return true;
  };
})(window.PB);
