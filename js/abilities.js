// Pokemon abilities as basketball badges: each Pokemon rolls one of its real abilities (seeded, so every client agrees),
// and the ability grants a boost in a specific scenario. Used by both the simulation and the playable engine.
(function (PB) {
  const A = PB.Abil = {};

  // ---- the badges: n = name, d = description, hooks return additive make-probability (shot/def) or multipliers (mult)
  const E = {
    sniper: { n: 'Sniper', d: 'Open threes and long twos fall more often (+4%).', shot: c => (c.type === 'three' || c.type === 'mid') && c.c < 0.4 ? 0.04 : 0 },
    finisher: { n: 'Finisher', d: 'Finishes at the rim (+3.5%), more in transition.', shot: c => c.type === 'rim' ? 0.035 + (c.fast ? 0.02 : 0) : 0 },
    clutch: { n: 'Clutch', d: 'In a close fourth quarter or overtime every shot is better (+5%).', shot: c => (c.q >= 4 && Math.abs(c.diff) <= 6 && c.clock < 300) ? 0.05 : 0 },
    heat: { n: 'Heat Check', d: 'Streaks are amplified: hot streaks are far hotter, cold ones fade fast.' },
    bully: { n: 'Bruiser', d: 'Overpowers smaller defenders in the post (+5%) and at the rim (+2%).', shot: c => c.type === 'post' ? 0.05 : c.type === 'rim' && c.bigger ? 0.02 : 0 },
    rimguard: { n: 'Rim Guard', d: 'Blocks come 50% more often and rim shots against it suffer (-3%).', def: c => c.type === 'rim' || c.type === 'post' ? -0.03 : 0, mult: { block: 1.5 } },
    lockdown: { n: 'Lockdown', d: 'Contested mid-range and three-point shots are harder (-3.5%).', def: c => (c.type === 'three' || c.type === 'mid') && c.c > 0.3 ? -0.035 : 0 },
    intimidate: { n: 'Intimidator', d: 'Any tightly contested shot suffers (-2%).', def: c => c.c > 0.5 ? -0.02 : 0 },
    thief: { n: 'Pickpocket', d: 'Steals 40% more often.', mult: { steal: 1.4 } },
    glass: { n: 'Glass Cleaner', d: 'Wins 25% more rebounds.', mult: { reb: 1.25 } },
    playmaker: { n: 'Floor General', d: 'Teammates on the floor shoot a little better (+1.2%).', aura: 0.012 },
    engine: { n: 'Engine', d: 'Tires 20% slower and recovers faster.', mult: { drain: 0.8 } },
    speedster: { n: 'Speedster', d: 'Runs 6% faster.', mult: { speed: 1.06 } },
    ironman: { n: 'Iron Will', d: 'Never wears down late in the game.', mult: { late: 1 } },
    homebody: { n: 'Home Court', d: 'Plays better at home (+2.5%).', shot: c => c.home ? 0.025 : 0 },
    underdog: { n: 'Underdog', d: 'Fights harder when trailing by 8 or more (+3.5%).', shot: c => c.diff <= -8 ? 0.035 : 0 },
    freebie: { n: 'Foul Magnet', d: 'Draws fouls 25% more and makes free throws (+6%).', mult: { foul: 1.25, ft: 1.06 } },
  };
  A.EFFECTS = E;
  const KEYS = Object.keys(E);

  const LISTS = {
    sniper: 'compound-eyes no-guard keen-eye sniper tinted-lens super-luck victory-star stakeout quick-draw long-reach mega-launcher illuminate serene-grace wonder-skin dazzling supersweet-syrup',
    finisher: 'sheer-force reckless tough-claws iron-fist strong-jaw adaptability technician skill-link normalize pixilate refrigerate galvanize steelworker transistor dragons-maw punk-rock sharpness rocky-payload gale-wings propeller-tail stance-change hadron-engine orichalcum-pulse gorilla-tactics moxie beast-boost protean libero merciless mycelium-might opportunist hustle',
    clutch: 'defiant competitive berserk blaze torrent overgrow swarm guts rattled analytic anger-point anger-shell justified soul-heart download supreme-overlord flare-boost toxic-boost turboblaze teravolt intrepid-sword steadfast moody contrary',
    heat: 'flame-body static poison-point flash-fire motor-drive volt-absorb lightning-rod storm-drain water-absorb dry-skin solar-power chlorophyll rain-dish sand-rush slush-rush swift-swim steam-engine surge-surfer wind-power wind-rider electromorphosis protosynthesis quark-drive forecast flower-gift leaf-guard sand-force ice-body sap-sipper drought drizzle sand-stream snow-warning electric-surge grassy-surge misty-surge psychic-surge thermal-exchange power-spot battery plus minus grass-pelt seed-sower water-bubble well-baked-body earth-eater',
    bully: 'huge-power pure-power rock-head solid-rock filter thick-fat fur-coat fluffy heavy-metal light-metal marvel-scale multiscale cotton-down guard-dog stalwart',
    rimguard: 'sturdy magma-armor battle-armor big-pecks clear-body white-smoke full-metal-body prism-armor shield-dust wonder-guard iron-barbs rough-skin bulletproof dauntless-shield mirror-armor shell-armor shadow-shield ice-face ice-scales disguise shields-down overcoat heatproof hyper-cutter magic-bounce aftermath innards-out gulp-missile liquid-ooze water-compaction armor-tail queenly-majesty',
    lockdown: 'inner-focus own-tempo oblivious suction-cups sticky-hold tangled-feet magic-guard unaware mold-breaker sand-veil snow-cloak shadow-tag arena-trap magnet-pull insomnia vital-spirit immunity limber water-veil soundproof damp aroma-veil sweet-veil flower-veil pastel-veil telepathy anticipation forewarn scrappy infiltrator unnerve',
    intimidate: 'intimidate pressure cursed-body mimicry perish-body bad-dreams grim-neigh chilling-neigh aura-break dark-aura fairy-aura unseen-fist mummy stench poison-touch toxic-chain toxic-debris corrosion neutralizing-gas beads-of-ruin sword-of-ruin tablets-of-ruin vessel-of-ruin commander',
    thief: 'pickup magician pickpocket frisk trace illusion imposter synchronize cute-charm color-change wandering-spirit prankster dancer ball-fetch poison-puppeteer lingering-aroma rivalry simple',
    glass: 'gluttony cheek-pouch harvest ripen honey-gather levitate purifying-salt natural-cure schooling multitype zen-mode comatose air-lock cloud-nine sand-spit gooey liquid-voice',
    playmaker: 'friend-guard good-as-gold triage receiver symbiosis power-of-alchemy costar hospitality curious-medicine healer effect-spore',
    engine: 'regenerator poison-heal shed-skin hydration early-bird cud-chew run-away stamina',
    speedster: 'speed-boost quick-feet unburden',
    ironman: 'weak-armor emergency-exit',
    underdog: 'wimp-out klutz slow-start truant defeatist stall',
  };
  const BY = {};
  for (const k in LISTS) for (const n of LISTS[k].split(' ')) BY[n] = k;
  const TIER = { 'huge-power': 1.3, 'pure-power': 1.3, 'wonder-guard': 1.3, protean: 1.25, libero: 1.25, 'speed-boost': 1.3, intimidate: 1.3, adaptability: 1.25, 'sheer-force': 1.25, moxie: 1.2, 'magic-bounce': 1.2, 'compound-eyes': 1.25, sniper: 1.25, 'thick-fat': 1.1, levitate: 1.1, truant: 0.5, 'slow-start': 0.5, defeatist: 0.6, klutz: 0.6, stall: 0.6, 'wimp-out': 0.6 };

  const hash = PB.hash2;
  const strHash = s => { let h = 7; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0; return h; };

  A.keyOf = name => BY[name] || KEYS[strHash(name) % KEYS.length];
  A.fmt = name => name.split('-').map(PB.cap).join(' ');
  // a Pokemon's possible abilities (hidden one rolls less often)
  A.options = mon => (mon.ab || []).concat(mon.abh ? [mon.abh] : []);
  A.roll = function (seed, mon) {
    const opts = mon.ab && mon.ab.length ? mon.ab : [mon.abh || 'run-away'];
    const w = opts.map(() => 1); if (mon.abh && mon.ab && mon.ab.length) w.push(0.45);
    const all = opts.concat(mon.abh && mon.ab && mon.ab.length ? [mon.abh] : []);
    let tot = 0; for (const x of w) tot += x;
    let r = hash(seed >>> 0, mon.id) * tot;
    for (let i = 0; i < all.length; i++) { r -= w[i]; if (r <= 0) return all[i]; }
    return all[all.length - 1];
  };
  // the ability a Pokemon has in the active game (evolutions keep theirs when the new form can have it)
  A.name = function (id) {
    const G = PB.G, mon = PB.BYID[id];
    if (!mon) return '';
    if (G && G.abil && G.abil[id]) return G.abil[id];
    return A.roll(G ? G.seed : 0, mon);
  };
  const cache = new Map();
  A.fx = function (id) {
    const nm = A.name(id), key = nm + '|' + id;
    let f = cache.get(key);
    if (!f) { const k = A.keyOf(nm); f = { name: nm, key: k, tier: TIER[nm] || 1, e: E[k] }; if (cache.size > 4000) cache.clear(); cache.set(key, f); }
    return f;
  };
  A.clearCache = () => cache.clear();
  A.describe = id => { const f = A.fx(id); return { ability: A.fmt(f.name), badge: f.e.n, desc: f.e.d, key: f.key }; };
  A.evolveCarry = function (G, fromId, toId) {
    G.abil = G.abil || {};
    const old = A.name(fromId), to = PB.BYID[toId];
    G.abil[toId] = A.options(to).includes(old) ? old : A.roll(G.seed, to);
    cache.clear();
  };

  // ---- hooks ----
  // streaks: hot > 0 after makes, < 0 after misses
  A.record = function (pl, made) {
    const h = pl.hot || 0;
    pl.hot = made ? (h < 0 ? 0.1 : Math.min(1, h + 0.3)) : (h > 0 ? Math.max(0, h - 0.4) : Math.max(-1, h - 0.2));
  };
  A.streakAdj = function (pl) {
    const h = pl.hot || 0; if (!h) return 0;
    const f = A.fx(pl.id);
    const amp = f.key === 'heat' ? (h > 0 ? 1.8 * f.tier : 0.4) : 1;
    return h * 0.024 * amp;
  };
  // additive make-probability for a shot. game = PB.Game, si = shooter side index, ctx: {type, c, fast, bigger}
  A.shotAdj = function (game, si, shooter, defender, ctx) {
    const S = game.sides[si];
    const c = { type: ctx.type, c: ctx.c == null ? 0.45 : ctx.c, fast: !!ctx.fast, bigger: !!ctx.bigger, q: game.q, clock: game.clock, diff: game.score[si] - game.score[1 - si], home: !!S.home };
    let adj = A.streakAdj(shooter);
    const f = A.fx(shooter.id);
    if (f.e.shot) adj += f.e.shot(c) * f.tier;
    if (defender) { const d = A.fx(defender.id); if (d.e.def) adj += d.e.def(c) * d.tier; }
    let aura = 0;
    for (const p of S.court) if (p.id !== shooter.id) { const a = A.fx(p.id); if (a.e.aura) aura += a.e.aura * a.tier; }
    return adj + Math.min(aura, 0.024);
  };
  // the badges that changed a shot, for on-screen pop-ups: [{ pl, key, name, v }] (v is the make-probability change; its sign is for the shooter)
  A.tags = function (game, si, shooter, defender, ctx) {
    const S = game.sides[si], out = [];
    const c = { type: ctx.type, c: ctx.c == null ? 0.45 : ctx.c, fast: !!ctx.fast, bigger: !!ctx.bigger, q: game.q, clock: game.clock, diff: game.score[si] - game.score[1 - si], home: !!S.home };
    const f = A.fx(shooter.id);
    if (f.e.shot) { const v = f.e.shot(c) * f.tier; if (Math.abs(v) >= 0.004) out.push({ pl: shooter, key: f.key, name: f.e.n, v }); }
    if (f.key === 'heat' && (shooter.hot || 0) > 0.55) out.push({ pl: shooter, key: 'heat', name: 'Heat Check', v: A.streakAdj(shooter) });
    if (defender) { const d = A.fx(defender.id); if (d.e.def) { const v = d.e.def(c) * d.tier; if (Math.abs(v) >= 0.004) out.push({ pl: defender, key: d.key, name: d.e.n, v }); } }
    for (const p of S.court) if (p.id !== shooter.id) { const a = A.fx(p.id); if (a.e.aura) { out.push({ pl: p, key: a.key, name: a.e.n, v: a.e.aura * a.tier }); break; } }
    return out;
  };
  // multipliers: kind in block, steal, reb, foul, ft, drain, speed
  A.mult = function (id, kind) {
    const f = A.fx(id), m = f.e.mult && f.e.mult[kind];
    if (m == null) return 1;
    return m > 1 ? 1 + (m - 1) * f.tier : 1 - (1 - m) * f.tier;
  };
  // energy as seen by the fatigue curve: iron-willed Pokemon do not wilt in the second half
  A.fatigueEn = function (id, en, game) {
    const f = A.fx(id);
    if (f.e.mult && f.e.mult.late && game && game.q >= 3) return Math.max(en, 72);
    return en;
  };
})(window.PB);
