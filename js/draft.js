// Main-mode randomized draft: region/type roll, weighted candidates, AI drafting.
(function (PB) {
  const { clamp, avg } = PB;
  PB.DRAFT = {
    candidates: 5,
    minEligible: 7,
    // index 0-4 starters, 5-11 bench. bias: exponent on z-score of ovr (positive favors strong).
    bias: [1.55, 1.40, 1.25, 1.10, 0.95, 0.15, -0.05, -0.25, -0.45, -0.65, -0.85, -1.0],
    leg:  [2.6, 2.3, 2.1, 1.9, 1.7, 0.7, 0.55, 0.4, 0.3, 0.22, 0.16, 0.12],
    full: [3.0, 2.8, 2.6, 2.4, 2.2, 1.4, 1.2, 1.1, 1.0, 0.9, 0.85, 0.8],
  };

  PB.pickWeight = function (m, i) {
    const D = PB.DRAFT;
    const z = (m.ovr - 58) / 14;
    let w = Math.exp(D.bias[i] * z);
    if (m.leg || m.myth) w *= D.leg[i];
    if (m.full) w *= D.full[i];
    return w;
  };

  PB.eligible = function (G, gen, type) {
    const out = [];
    for (const m of PB.MONS) if (m.gen === gen && m.types.includes(type) && G.claimed[m.id] == null) out.push(m);
    return out;
  };

  // roll a region+type combo that has enough free Pokemon (rerolls impossible combos)
  PB.rollCombo = function (G, rng) {
    for (let tries = 0; tries < 500; tries++) {
      const gen = rng.int(1, 9), type = rng.pick(PB.TYPES);
      const n = PB.eligible(G, gen, type).length;
      if (n >= PB.DRAFT.minEligible) return { gen, type, region: PB.REGIONS[gen], count: n, rerolls: tries };
    }
    throw new Error('No viable region/type combination left in the Pokemon pool');
  };

  // re-roll just the region or just the type of a combo (one of each per draft)
  PB.rerollCombo = function (G, rng, combo, which) {
    const opts = [];
    if (which === 'region') { for (let g = 1; g <= 9; g++) if (g !== combo.gen && PB.eligible(G, g, combo.type).length >= PB.DRAFT.minEligible) opts.push({ gen: g, type: combo.type }); }
    else { for (const t of PB.TYPES) if (t !== combo.type && PB.eligible(G, combo.gen, t).length >= PB.DRAFT.minEligible) opts.push({ gen: combo.gen, type: t }); }
    if (!opts.length) return null;
    const c = rng.pick(opts);
    return { gen: c.gen, type: c.type, region: PB.REGIONS[c.gen], count: PB.eligible(G, c.gen, c.type).length, rerolls: 0 };
  };

  PB.genCandidates = function (G, rng, pickIdx, gen, type, n, tid) {
    n = n || PB.DRAFT.candidates;
    let pool = PB.eligible(G, gen, type);
    if (tid != null) { const ok = pool.filter(m => PB.legalAdd(G, tid, m.id)); if (ok.length) pool = ok; }
    const out = [];
    while (out.length < n && pool.length) {
      const idx = rng.weighted(pool.map(m => PB.pickWeight(m, pickIdx)));
      out.push(pool[idx]); pool.splice(idx, 1);
    }
    return out;
  };

  // ---- AI evaluation -------------------------------------------------------
  PB.identityFit = function (identKey, m) {
    const id = PB.IDENTITIES[identKey]; if (!id) return 0;
    let s = 0, tw = 0;
    for (const k in id.w) { s += id.w[k] * (m.r[k] - 58); tw += id.w[k]; }
    return tw ? s / tw : 0;
  };

  // value of adding mon m to a team currently holding monIds (pick index = roster count)
  PB.draftValue = function (team, monIds, m, rng, noise) {
    const mons = monIds.map(id => PB.BYID[id]);
    const n = mons.length;
    let v = m.ovr;
    v += PB.identityFit(team.identity, m) * 0.35;
    const cnt = [0, 0, 0, 0, 0];
    mons.forEach(x => cnt[x.r.pos1]++);
    const group = p => p <= 1 ? 0 : p === 2 ? 1 : 2;      // guards / wings / bigs
    const gc = [0, 0, 0]; mons.forEach(x => gc[group(x.r.pos1)]++);
    const mg = group(m.r.pos1);
    if (n < 5) { v += gc[mg] === 0 ? 5 : -4 * gc[mg] + (gc[mg] >= 3 ? -8 : 0); }
    else { v += gc[mg] <= 1 ? 3 : (gc[mg] >= 5 ? -5 : 0); }
    // weaknesses
    const best = k => Math.max(0, ...mons.map(x => x.r[k]));
    if (n >= 1) {
      if (best('handle') < 62 && m.r.handle >= 62) v += 3;
      if (best('block') < 65 && m.r.block >= 65) v += 3;
      if (mons.filter(x => x.r.three >= 62).length < 2 && m.r.three >= 62) v += 3;
      if (mons.filter(x => x.r.perD >= 60).length < 1 && m.r.perD >= 60) v += 2;
    }
    if (n >= 5) v += (m.r.stamina - 55) * 0.08;
    return v + (noise ? rng.gauss() * noise : 0);
  };

  PB.aiChoose = function (team, candidates, rng) {
    let best = null, bv = -1e9;
    for (const m of candidates) {
      const v = PB.draftValue(team, team.roster, m, rng, 2.5);
      if (v > bv) { bv = v; best = m; }
    }
    return best;
  };

  // all AI teams draft using exactly the same roll mechanic as the player, in randomized rounds
  PB.aiDraftRounds = function (G, rng, teamIds, fromPick) {
    for (let pick = fromPick; pick < 12; pick++) {
      const order = rng.shuffle(teamIds);
      for (const tid of order) {
        const team = G.teams[tid];
        if (team.roster.length > pick) continue;
        let combo, cands, tries = 0;
        do { combo = PB.rollCombo(G, rng); cands = PB.genCandidates(G, rng, pick, combo.gen, combo.type, undefined, tid); } while (cands.every(m => !PB.legalAdd(G, tid, m.id)) && ++tries < 25);
        const m = PB.aiChoose(team, cands, rng);
        PB.Registry.claim(G, m.id, tid);
      }
    }
    for (const tid of teamIds) PB.autoLineup(G.teams[tid]);
  };

  PB.newGame = function (seed, mode, nTeams, userSlot) {
    const rng = new PB.RNG(seed);
    const G = {
      version: 1, seed, mode, nTeams, rng,
      claimed: {}, teams: PB.makeTeams(rng, nTeams, userSlot), userTeam: userSlot,
      draft: null, league: null, rules: { legCap: 0 },
      settings: PB.defaultSettings(),
    };
    // pool-size sanity: refuse impossible league configs rather than generate duplicates
    const need = nTeams * 12;
    if (need > PB.MONS.length) throw new Error('Pool of ' + PB.MONS.length + ' cannot support ' + nTeams + ' teams of 12');
    return G;
  };

  PB.defaultSettings = () => ({ difficulty: 'normal', quarterMin: 5, simSpeed: 1, gameSpeed: 1, volume: 0.5, sfx: true, showHints: true, shotMeter: true, camera: 'behind', meterSkin: 'bar', meterColor: 'classic', autoReplay: true, touchControls: 'auto', showRatings: true, showPositions: true, showArchetypes: true, showOverall: true });
})(window.PB);
