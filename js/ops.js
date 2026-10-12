// Operations: every change to shared league state goes through PB.Ops so the same code serves single player and
// online play (the host orders the operations, every client applies them in the same order and ends with the same league).
(function (PB) {
  const F = () => PB.Franchise, L = () => PB.League;
  const Ops = PB.Ops = { handlers: {}, listeners: [], seq: 0 };

  // run an operation as the local player. cb(err, result) fires once it has been applied (immediately offline).
  Ops.run = function (name, args, cb) {
    args = args || {};
    if (PB.Net && PB.Net.onlineLeague && PB.Net.onlineLeague()) { PB.Net.sendOp(name, args, cb); return; }
    const r = Ops.apply(name, args, { from: PB.G ? PB.G.userTeam : 0 });
    if (cb) cb(r.err, r.res);
    else if (r.err && PB.toast) PB.toast(r.err, 3500);
  };
  // apply an operation to PB.G. Returns {err} or {res}; never throws.
  Ops.apply = function (name, args, meta) {
    const h = Ops.handlers[name];
    if (!h) return { err: 'Unknown operation ' + name };
    try {
      const res = h(PB.G, args || {}, meta || {});
      Ops.seq++;
      for (const f of Ops.listeners) f(name, args, meta);
      return { res };
    } catch (e) { console.warn('op ' + name + ' failed:', e); return { err: e.message || String(e) }; }
  };
  Ops.on = fn => Ops.listeners.push(fn);

  const H = Ops.handlers;
  const mine = (G, a, meta) => {
    // an actor may only change their own team (online: the host checks the sender)
    if (a.tid != null && meta && meta.from != null && meta.from !== a.tid && !meta.host) throw new Error('That is not your team');
    return G.teams[a.tid != null ? a.tid : meta.from];
  };

  // ---- roster ----
  H.sign = (G, a, m) => { mine(G, a, m); F().sign(G, a.tid, a.id); };
  H.release = (G, a, m) => { mine(G, a, m); F().release(G, a.tid, a.id); };
  H.evolve = (G, a, m) => { mine(G, a, m); if (G.claimed[a.id] !== a.tid) throw new Error('Not your Pokémon'); F().evolve(G, a.id, a.to); PB.fixLineup(G.teams[a.tid]); };
  H.focus = (G, a, m) => { mine(G, a, m); if (G.claimed[a.id] !== a.tid) throw new Error('Not your Pokémon'); if (!F().toggleFocus(G, a.id)) throw new Error('Training focus is limited to 3 Pokémon'); };
  H.lineup = (G, a, m) => {
    const T = mine(G, a, m);
    const all = a.starters.concat(a.bench);
    if (new Set(all).size !== all.length || !all.every(id => T.roster.includes(id))) throw new Error('Invalid lineup');
    T.starters = a.starters.slice(); T.bench = a.bench.slice();
  };
  H.strat = (G, a, m) => { const T = mine(G, a, m); if (!PB.OFF_STRATS[a.off] || !PB.DEF_STRATS[a.def]) throw new Error('Bad strategy'); T.strat = { off: a.off, def: a.def }; };
  H.autoLineup = (G, a, m) => { const T = mine(G, a, m); if (T.roster.length >= 12) PB.autoLineup(T); else PB.fixLineup(T); };
  H.teamName = (G, a, m) => {
    const T = mine(G, a, m);
    T.city = String(a.city || T.city).slice(0, 22); T.nick = String(a.nick || T.nick).slice(0, 22); T.name = T.city + ' ' + T.nick; T.abbr = PB.teamAbbr(T.city);
  };

  // ---- trades (the AI answers immediately; human partners answer through 'tradeOffer' / 'tradeReply') ----
  H.trade = (G, a, m) => { mine(G, { tid: a.a }, m); F().trade(G, a.a, a.b, a.giveA, a.giveB, false, a.prot); };
  H.tradeOffer = (G, a, m) => {
    mine(G, { tid: a.a }, m);
    const fr = G.fr; fr.offers = fr.offers || [];
    const blocked = F().tradeBlocked(G); if (blocked) throw new Error(blocked);
    const ev = F().evalTrade(G, a.a, a.b, a.giveA, a.giveB, a.prot); if (ev.reason && ev.vin == null) throw new Error(ev.reason);
    fr.offers = fr.offers.filter(o => !(o.a === a.a && o.b === a.b));
    fr.offers.push({ id: (fr.offerSeq = (fr.offerSeq || 0) + 1), a: a.a, b: a.b, giveA: a.giveA.slice(), giveB: a.giveB.slice(), prot: Object.assign({}, a.prot || {}) });
    F().news(G, G.teams[a.a].abbr + ' sent a trade offer to ' + G.teams[a.b].abbr + '.', true);
  };
  H.tradeReply = (G, a, m) => {
    const fr = G.fr; const o = (fr.offers || []).find(x => x.id === a.id); if (!o) throw new Error('Offer no longer exists');
    mine(G, { tid: o.b }, m);
    fr.offers = fr.offers.filter(x => x.id !== o.id);
    if (a.accept) F().trade(G, o.a, o.b, o.giveA, o.giveB, true, o.prot);
    else F().news(G, G.teams[o.b].abbr + ' declined a trade offer from ' + G.teams[o.a].abbr + '.', true);
  };

  H.scout = (G, a, m) => { mine(G, a, m); F().scout(G, a.tid, a.id); };
  H.rules = (G, a) => { F().setRules(G, a.rules || {}); };

  // ---- offseason ----
  H.beginOffseason = (G) => { F().beginOffseason(G); };
  H.startDraft = (G) => { F().startDraft(G); F().draftRunToHuman(G); };
  H.draftPick = (G, a, m) => { mine(G, a, m); F().draftPick(G, a.tid, a.id); F().draftRunToHuman(G); };
  H.draftAuto = (G, a, m) => { mine(G, a, m); if (F().draftCurrent(G) !== a.tid) throw new Error('Not your pick'); F().draftPick(G, a.tid, F().aiPick(G, a.tid)); F().draftRunToHuman(G); };
  H.draftRest = (G) => { F().draftAutoAll(G); };
  H.draftToMe = (G) => { F().draftRunToHuman(G); };
  H.startNextSeason = (G) => { F().startNextSeason(G); };

  H.ready = (G, a, m) => {
    const T = mine(G, a, m); const errs = PB.validateLineup(T); if (errs.length) throw new Error(errs[0]);
    G.ready = G.ready || {}; G.ready[a.tid] = true;
  };

  // ---- fantasy draft ----
  H.fPick = (G, a, m) => { mine(G, a, m); PB.Fantasy.make(G, a.tid, a.id); PB.Fantasy.runToHuman(G); };
  H.fAuto = (G, a, m) => { mine(G, a, m); if (PB.Fantasy.current(G) !== a.tid) throw new Error('Not your pick'); PB.Fantasy.make(G, a.tid, PB.Fantasy.aiChoice(G, a.tid)); PB.Fantasy.runToHuman(G); };
  H.fRest = (G) => { const Fa = PB.Fantasy; while (!Fa.done(G)) Fa.make(G, Fa.current(G), Fa.aiChoice(G, Fa.current(G))); };
  H.fToMe = (G) => { PB.Fantasy.runToHuman(G); };
  H.fantasyStart = (G) => {
    for (const t of G.teams) { if (t.user) { const e = PB.validateLineup(t); if (e.length) throw new Error(t.name + ': ' + e[0]); } }
    G.league = L().create(G, 82);
  };

  // ---- the season ----
  L().gamesFor = function (G, tid) {
    const lg = G.league;
    if (lg.phase === 'regular') return L().gamesOnDay(lg, lg.day).find(g => !g.done && (g.h === tid || g.a === tid)) || null;
    if (lg.phase === 'playoffs') return L().poGamesToday(lg).find(g => g.h === tid || g.a === tid) || null;
    return null;
  };
  L().humanGamesToday = G => G.teams.filter(t => t.user).map(t => L().gamesFor(G, t.id)).filter(Boolean);
  H.simDays = (G, a) => { const lg = G.league; const target = lg.day + (a.n || 1); let guard = 0; while (lg.phase !== 'done' && guard++ < 4000) { L().simDay(G, true); if (L().humanGamesToday(G).length) break; if (lg.phase === 'regular' ? lg.day >= target : guard >= (a.n || 1)) break; } };
  // play on until the next human game (nobody is skipped past a game they have not played)
  H.advance = (G, a) => { const lg = G.league; let guard = 0; while (lg.phase !== 'done' && guard++ < 4000 && !L().humanGamesToday(G).length) L().simDay(G, true); };
  H.simRest = (G) => { const lg = G.league; let guard = 0; while (lg.phase === 'regular' && guard++ < 4000) L().simDay(G, false); };
  H.simSeason = (G) => { const lg = G.league; let guard = 0; while (lg.phase !== 'done' && guard++ < 4000) L().simDay(G, false); };
  H.simToDay = (G, a) => { const lg = G.league; let guard = 0; while (lg.phase === 'regular' && lg.day < a.day && guard++ < 4000) L().simDay(G, false); };
  // a human's game today is simulated
  H.simMyGame = (G, a, m) => {
    mine(G, a, m);
    const lg = G.league, g = L().gamesFor(G, a.tid); if (!g) throw new Error('No game today');
    if (lg.phase === 'playoffs') L().poPlay(G, g); else L().simOne(G, g, false);
    L().simDay(G, true);
  };
  // a game played live: the result is recorded for everybody
  H.result = (G, a, m) => {
    const lg = G.league;
    const g = lg.phase === 'playoffs' ? L().poGamesToday(lg).find(x => x.h === a.h && x.a === a.a) : lg.sched.find(x => x.day === a.day && x.h === a.h && x.a === a.a && !x.done);
    if (!g) throw new Error('That game was already played');
    if (lg.phase === 'playoffs') L().poPlay(G, g, a.result); else L().record(G, g, a.result, false);
    L().simDay(G, true);
  };
  H.forceDay = (G) => { L().simDay(G, false); };
})(window.PB);
