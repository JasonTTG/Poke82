// Fantasy snake draft over one shared pool (no region/type limits, no declining odds).
(function (PB) {
  const F = PB.Fantasy = {};
  const ROUNDS = 12;

  F.maxTeams = () => Math.floor(PB.MONS.length / ROUNDS);

  F.start = function (G, userPos) {
    // userPos: 0-based draft slot for the user, or null to randomize
    const rng = G.rng;
    const order = rng.shuffle(G.teams.map(t => t.id));
    if (userPos == null) userPos = rng.int(0, G.teams.length - 1);
    // put the user's team at the requested slot in the (otherwise random) order
    const u = G.userTeam;
    order.splice(order.indexOf(u), 1);
    order.splice(userPos, 0, u);
    G.fdraft = {
      order, pick: 0, total: G.teams.length * ROUNDS, history: [],
      byOvr: PB.MONS.slice().sort((a, b) => b.ovr - a.ovr || a.id - b.id).map(m => m.id),
    };
    return G.fdraft;
  };

  F.round = G => Math.floor(G.fdraft.pick / G.teams.length);
  F.teamAt = function (G, pick) {
    const n = G.teams.length, r = Math.floor(pick / n), i = pick % n;
    return G.fdraft.order[r % 2 === 0 ? i : n - 1 - i];
  };
  F.current = G => G.fdraft.pick >= G.fdraft.total ? null : F.teamAt(G, G.fdraft.pick);
  F.done = G => G.fdraft.pick >= G.fdraft.total;
  F.available = G => G.fdraft.byOvr.filter(id => G.claimed[id] == null);

  F.make = function (G, teamId, monId) {
    const D = G.fdraft;
    if (F.done(G)) throw new Error('Draft is complete');
    if (F.teamAt(G, D.pick) !== teamId) throw new Error('Not this team\'s pick');
    if (!PB.legalAdd(G, teamId, monId)) throw new Error('Legendary limit reached (' + G.rules.legCap + ' per team)');
    PB.Registry.claim(G, monId, teamId);            // throws on duplicates
    D.history.push({ pick: D.pick, round: F.round(G), team: teamId, mon: monId });
    D.pick++;
    if (F.done(G)) F.finish(G);
  };

  F.finish = function (G) {
    for (const t of G.teams) PB.autoLineup(t);
    const err = PB.Registry.verify(G);
    if (err) throw new Error(err);
  };

  // AI: talent-first early, need/identity-aware later
  F.aiChoice = function (G, teamId) {
    const team = G.teams[teamId], rng = G.rng;
    const D = G.fdraft;
    const cands = [];
    for (const id of D.byOvr) { if (G.claimed[id] == null && PB.legalAdd(G, teamId, id)) { cands.push(PB.BYID[id]); if (cands.length >= 26) break; } }
    const round = F.round(G);
    const tw = round < 3 ? 1.0 : round < 6 ? 0.85 : 0.7;     // weight on raw talent vs fit
    let best = null, bv = -1e9;
    for (const m of cands) {
      const fit = PB.draftValue(team, team.roster, m, rng, 0) - m.ovr;
      let v = m.ovr * tw + fit * (2 - tw) * 1.4 + rng.gauss() * (round < 2 ? 1.2 : 2.2);
      if (round >= 6 && team.roster.length >= 5) v += (m.r.stamina - 55) * 0.05;
      if (v > bv) { bv = v; best = m; }
    }
    return best.id;
  };

  F.aiStep = function (G) {
    const t = F.current(G);
    F.make(G, t, F.aiChoice(G, t));
  };
  // run AI picks until it is the user's turn (or draft ends)
  F.runToUser = function (G, max) {
    let n = 0;
    while (!F.done(G) && F.current(G) !== G.userTeam && n++ < (max || 1e6)) F.aiStep(G);
  };
  F.runToHuman = function (G, max) {
    let n = 0;
    while (!F.done(G) && !G.teams[F.current(G)].user && n++ < (max || 1e6)) F.aiStep(G);
  };
  F.autoUser = function (G) {   // best-fit auto pick for the user's team
    const t = G.userTeam;
    F.make(G, t, F.aiChoice(G, t));
  };
  // how many picks until the user is next on the clock
  F.picksUntilUser = function (G) {
    let n = 0;
    for (let p = G.fdraft.pick; p < G.fdraft.total; p++) { if (F.teamAt(G, p) === G.userTeam) return n; n++; }
    return null;
  };
})(window.PB);
