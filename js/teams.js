// Teams, rosters, lineups, team profiles (chemistry emerges from these), identities, uniqueness registry.
(function (PB) {
  const { clamp, avg } = PB;

  PB.OFF_STRATS = { balanced: 'Balanced Offense', fast: 'Fast-Paced Offense', three: 'Three-Point Offense', inside: 'Interior Offense' };
  PB.DEF_STRATS = { man: 'Man-to-Man', zone: 'Zone Defense', press: 'Full-Court Pressure', lockdown: 'Defensive-Focused' };

  // AI identities: rating-weights used when drafting + default strategies
  PB.IDENTITIES = {
    offense:  { label: 'Offensive-focused', off: 'balanced', def: 'man',  w: { three: 1, mid: .6, layup: .8, dunk: .6, pass: .7, handle: .7 } },
    defense:  { label: 'Defensive-focused', off: 'balanced', def: 'lockdown', w: { intD: 1, perD: 1, steal: .7, block: .8, dreb: .6, iq: .5 } },
    fast:     { label: 'Fast-paced',        off: 'fast',     def: 'press', w: { speed: 1, accel: 1, handle: .8, layup: .6, steal: .5, stamina: .6 } },
    three:    { label: 'Three-point-heavy', off: 'three',    def: 'man',  w: { three: 1.3, pass: .8, handle: .6, ft: .4, perD: .4 } },
    interior: { label: 'Interior-focused',  off: 'inside',   def: 'zone', w: { dunk: 1, post: 1, strength: .8, oreb: .8, intD: .8, block: .6 } },
    balanced: { label: 'Balanced',          off: 'balanced', def: 'man',  w: { iq: .6 } },
  };

  const CITIES = ['Pallet Town', 'Viridian', 'Pewter', 'Cerulean', 'Vermilion', 'Lavender', 'Celadon', 'Fuchsia', 'Saffron', 'Cinnabar', 'Goldenrod', 'Ecruteak', 'Olivine', 'Mahogany', 'Blackthorn', 'Rustboro', 'Slateport', 'Mauville', 'Lilycove', 'Sootopolis', 'Jubilife', 'Hearthome', 'Canalave', 'Snowpoint', 'Castelia', 'Nimbasa', 'Driftveil', 'Lumiose', 'Anistar', 'Hau’oli'];
  const NICKS = ['Surge', 'Tide', 'Blaze', 'Gales', 'Quakes', 'Frost', 'Shadows', 'Spirits', 'Titans', 'Comets', 'Rangers', 'Sparks', 'Thorns', 'Drifters', 'Phantoms', 'Voyagers', 'Stingers', 'Chargers', 'Hurricanes', 'Wardens', 'Monarchs', 'Outlaws', 'Pioneers', 'Raptors', 'Sentinels', 'Vipers', 'Wolves', 'Crushers', 'Navigators', 'Legends'];

  // [primary, accent] per team id
  const PAL = [['#c8102e', '#ffffff'], ['#1d428a', '#ffc72c'], ['#007a33', '#ffffff'], ['#552583', '#fdb927'], ['#ce1141', '#000000'], ['#0e2240', '#fec524'], ['#00788c', '#f9a01b'], ['#e03a3e', '#c1d32f'], ['#006bb6', '#f58426'], ['#5a2d81', '#63727a'],
    ['#0077c0', '#c4ced4'], ['#860038', '#fdbb30'], ['#002b5c', '#e31837'], ['#00471b', '#eee1c6'], ['#c4ced4', '#000000'], ['#ef3b24', '#002d62'], ['#98002e', '#f9a01b'], ['#0c2340', '#236192'], ['#e56020', '#1d1160'], ['#00538c', '#b8c4ca'],
    ['#ba0c2f', '#041e42'], ['#002d62', '#fdbb30'], ['#5d76a9', '#12173f'], ['#ffc72c', '#1d428a'], ['#6f263d', '#236192'], ['#cd1141', '#2c5234'], ['#f74902', '#000000'], ['#2a7de1', '#ffffff'], ['#ad1d7c', '#00b2a9'], ['#3c8c3c', '#f2c94c']];
  PB.CITIES = CITIES; PB.NICKS = NICKS;
  PB.teamAbbr = city => (city.replace(/[^A-Za-z ]/g, '').split(' ').map(w => w[0]).join('') + city.replace(/[^A-Za-z]/g, '').slice(1, 3)).slice(0, 3).toUpperCase();
  PB.teamColors = t => PAL[(t && t.id != null ? t.id : 0) % PAL.length];

  PB.DIVISIONS = [
    { conf: 'East', name: 'Kanto' }, { conf: 'East', name: 'Hoenn' }, { conf: 'East', name: 'Unova' },
    { conf: 'West', name: 'Johto' }, { conf: 'West', name: 'Sinnoh' }, { conf: 'West', name: 'Kalos' },
  ];

  PB.makeTeams = function (rng, nTeams, userSlot) {
    const n = nTeams;
    const cities = rng.shuffle(CITIES), nicks = rng.shuffle(NICKS);
    const idents = Object.keys(PB.IDENTITIES);
    const teams = [];
    for (let i = 0; i < n; i++) {
      const div = PB.DIVISIONS[i % 6];
      const idKey = idents[i % idents.length];
      teams.push({
        id: i, city: cities[i % cities.length], nick: nicks[i % nicks.length],
        conf: div.conf, div: div.name, identity: idKey, user: false,
        roster: [], starters: [], bench: [],
        strat: { off: PB.IDENTITIES[idKey].off, def: PB.IDENTITIES[idKey].def },
      });
      teams[i].name = teams[i].city + ' ' + teams[i].nick;
      teams[i].abbr = (teams[i].city.replace(/[^A-Za-z ]/g, '').split(' ').map(w => w[0]).join('') + teams[i].city.replace(/[^A-Za-z]/g, '').slice(1, 3)).slice(0, 3).toUpperCase();
    }
    // abbr uniqueness
    const seen = {};
    for (const t of teams) { while (seen[t.abbr]) t.abbr = t.abbr.slice(0, 2) + String.fromCharCode(65 + Math.floor(rng.next() * 26)); seen[t.abbr] = 1; }
    if (userSlot != null) { teams[userSlot].user = true; teams[userSlot].identity = 'user'; teams[userSlot].strat = { off: 'balanced', def: 'man' }; }
    return teams;
  };

  // ---- uniqueness registry --------------------------------------------------
  PB.Registry = {
    claim(G, monId, teamId) {
      if (G.claimed[monId] != null) throw new Error('Pokemon ' + PB.BYID[monId].name + ' already on team ' + G.claimed[monId]);
      G.claimed[monId] = teamId;
      G.teams[teamId].roster.push(monId);
    },
    release(G, monId) {
      const t = G.claimed[monId]; if (t == null) return;
      delete G.claimed[monId];
      const T = G.teams[t];
      T.roster = T.roster.filter(x => x !== monId);
      T.starters = T.starters.filter(x => x !== monId);
      T.bench = T.bench.filter(x => x !== monId);
    },
    isFree(G, monId) { return G.claimed[monId] == null; },
    // integrity check used by tests and before every season start
    verify(G) {
      const seen = new Map();
      for (const t of G.teams) for (const id of t.roster) {
        if (seen.has(id)) return 'duplicate species ' + PB.BYID[id].name + ' on teams ' + seen.get(id) + ' and ' + t.id;
        seen.set(id, t.id);
        if (G.claimed[id] !== t.id) return 'claim mismatch for ' + PB.BYID[id].name;
      }
      return null;
    },
  };

  // ---- team profile: chemistry from complementary attributes ---------------
  // lineup: array of 5 {mon, slot} (slot index 0..4). eff() applies out-of-position penalty.
  PB.eff = function (mon, slot, key) { return mon.r[key] * (1 - (slot == null ? 0 : PB.slotPenalty(mon, slot))); };

  PB.profile = function (lineup) {
    const P = {};
    const L = lineup.filter(Boolean);
    const e = (p, k) => PB.eff(p.mon, p.slot, k);
    P.spacing = L.reduce((s, p) => s + clamp((e(p, 'three') - 45) / 30, 0, 1), 0);          // 0..5
    const playm = L.map(p => 0.55 * e(p, 'pass') + 0.45 * e(p, 'handle')).sort((a, b) => b - a);
    P.playmaking = (playm[0] || 0) * 0.7 + (playm[1] || 0) * 0.3;
    P.handlers = L.filter(p => e(p, 'handle') >= 58).length;
    const rim = L.map(p => 0.5 * e(p, 'block') + 0.5 * e(p, 'intD')).sort((a, b) => b - a);
    P.rimProt = (rim[0] || 0) * 0.65 + (rim[1] || 0) * 0.35;
    P.perimD = avg(L.map(p => e(p, 'perD')));
    P.intD = avg(L.map(p => e(p, 'intD')));
    P.oreb = avg(L.map(p => e(p, 'oreb')));
    P.dreb = avg(L.map(p => e(p, 'dreb')));
    P.speed = avg(L.map(p => e(p, 'speed')));
    P.accel = avg(L.map(p => e(p, 'accel')));
    P.steal = avg(L.map(p => e(p, 'steal')));
    P.passing = avg(L.map(p => e(p, 'pass')));
    P.finish = avg(L.map(p => Math.max(e(p, 'layup'), e(p, 'dunk'))));
    P.size = avg(L.map(p => p.mon.r.sH));
    P.stamina = avg(L.map(p => e(p, 'stamina')));
    P.iq = avg(L.map(p => e(p, 'iq')));
    return P;
  };

  // team-needs report from a (possibly partial) set of picks
  PB.needs = function (monIds) {
    const mons = monIds.map(id => PB.BYID[id]);
    const out = [];
    const cnt = [0, 0, 0, 0, 0];
    mons.forEach(m => cnt[m.r.pos1]++);
    const guards = cnt[0] + cnt[1], wings = cnt[2], bigs = cnt[3] + cnt[4];
    if (mons.length >= 2) {
      if (guards === 0) out.push('Need a guard (PG/SG)');
      if (bigs === 0) out.push('Need a big (PF/C)');
      if (wings === 0 && mons.length >= 4) out.push('Need a wing (SF)');
    }
    const best = k => Math.max(0, ...mons.map(m => m.r[k]));
    if (mons.length >= 2) {
      if (best('handle') < 62 && best('pass') < 62) out.push('No ball handler / playmaker');
      if (mons.filter(m => m.r.three >= 62).length < 2 && mons.length >= 3) out.push('Short on shooting / spacing');
      if (Math.max(...mons.map(m => m.r.block)) < 65) out.push('No rim protector');
      if (mons.filter(m => m.r.perD >= 60).length < 1 && mons.length >= 3) out.push('Weak perimeter defense');
      if (avg(mons.map(m => Math.max(m.r.oreb, m.r.dreb))) < 55 && mons.length >= 3) out.push('Rebounding concern');
    }
    return out;
  };

  // lineup score = talent after position penalties + chemistry from profile
  PB.lineupScore = function (monsBySlot) {
    const L = monsBySlot.map((mon, slot) => mon ? { mon, slot } : null);
    let talent = 0;
    for (const p of L) if (p) talent += p.mon.ovr * (1 - PB.slotPenalty(p.mon, p.slot));
    const P = PB.profile(L);
    const chem = 3.0 * Math.min(P.spacing, 3.5) + 0.10 * Math.min(P.playmaking, 70) * 2 + 0.12 * Math.min(P.rimProt, 75) + 0.06 * P.perimD + 0.05 * (P.dreb + P.oreb);
    return talent + chem;
  };

  // best 5 of roster and best slot assignment (permutations pruned by greedy ordering)
  const PERMS = (function () { const out = []; (function p(a, b) { if (!b.length) out.push(a); for (let i = 0; i < b.length; i++) p(a.concat(b[i]), b.slice(0, i).concat(b.slice(i + 1))); })([], [0, 1, 2, 3, 4]); return out; })();
  PB.bestAssignment = function (five) {
    let best = null, bs = -1e9;
    for (const perm of PERMS) {
      const slots = [null, null, null, null, null];
      for (let i = 0; i < 5; i++) slots[perm[i]] = five[i];
      let s = 0;
      for (let k = 0; k < 5; k++) s += five[k].ovr * (1 - PB.slotPenalty(five[k], perm[k])) - Math.abs(five[k].r.posC - perm[k]) * 1.2;
      if (s > bs) { bs = s; best = slots; }
    }
    return best;
  };

  PB.autoLineup = function (team) {
    const mons = team.roster.map(id => PB.BYID[id]);
    if (mons.length < 5) { team.starters = []; team.bench = team.roster.slice(); return; }
    // candidate pool: top 9 by ovr to keep combos small
    const pool = mons.slice().sort((a, b) => b.ovr - a.ovr).slice(0, 9);
    let best = null, bs = -1e9;
    const idx = [0, 1, 2, 3, 4];
    (function comb(start, pick) {
      if (pick.length === 5) {
        const five = pick.map(i => pool[i]);
        const slots = PB.bestAssignment(five);
        const s = PB.lineupScore(slots);
        if (s > bs) { bs = s; best = slots; }
        return;
      }
      for (let i = start; i < pool.length; i++) comb(i + 1, pick.concat(i));
    })(0, []);
    team.starters = best.map(m => m.id);
    const rest = mons.filter(m => !team.starters.includes(m.id));
    team.bench = PB.orderBench(team.starters.map(id => PB.BYID[id]), rest).map(m => m.id).slice(0, 7);
  };

  // keep starters/bench consistent with the roster after signings, trades, releases (reserves are whoever is left over)
  PB.fixLineup = function (team) {
    const inR = new Set(team.roster);
    const used = new Set();
    const st = [0, 1, 2, 3, 4].map(i => { const id = team.starters[i]; if (id != null && inR.has(id) && !used.has(id)) { used.add(id); return id; } return null; });
    const bn = (team.bench || []).filter(id => inR.has(id) && !used.has(id) && (used.add(id), true));
    const rest = team.roster.filter(id => !used.has(id)).map(id => PB.BYID[id]).sort((a, b) => b.ovr - a.ovr);
    for (let i = 0; i < 5; i++) if (st[i] == null && rest.length) {
      let bi = 0, bv = -1e9; rest.forEach((m, j) => { const v = m.ovr * (1 - PB.slotPenalty(m, i)); if (v > bv) { bv = v; bi = j; } });
      st[i] = rest.splice(bi, 1)[0].id;
    }
    team.starters = st.filter(x => x != null);
    while (bn.length < 7 && rest.length) bn.push(rest.shift().id);
    team.bench = bn.slice(0, 7);
  };
  PB.reserves = team => { const a = new Set(team.starters.concat(team.bench)); return team.roster.filter(id => !a.has(id)); };

  // the lineup that actually takes the floor: injured Pokemon are replaced by the best healthy option
  PB.activeTeam = function (G, team) {
    const inj = G && G.fr && G.fr.inj;
    if (!inj) return team;
    const out = id => inj[id] && inj[id].g > 0;
    if (!team.roster.some(out)) return team;
    const healthy = team.roster.filter(id => !out(id));
    if (healthy.length < 5) return team;                       // nobody else to play: they play through it
    const used = new Set(team.starters.filter(id => !out(id)));
    const pool = team.bench.filter(id => !out(id) && !used.has(id));
    const extra = healthy.filter(id => !used.has(id) && !pool.includes(id)).sort((a, b) => PB.BYID[b].ovr - PB.BYID[a].ovr);
    const cand = pool.concat(extra);
    const starters = team.starters.map((id, slot) => {
      if (!out(id)) return id;
      let bi = -1, bv = -1e9;
      cand.forEach((c, j) => { const m = PB.BYID[c]; const v = m.ovr * (1 - PB.slotPenalty(m, slot)); if (v > bv) { bv = v; bi = j; } });
      if (bi < 0) return id;
      const c = cand.splice(bi, 1)[0]; used.add(c); return c;
    });
    const bench = cand.filter(id => !starters.includes(id)).slice(0, 7);
    return Object.assign({}, team, { starters, bench });
  };

  // bench order: ovr with bonus for covering starter weaknesses
  PB.orderBench = function (starters, rest) {
    return rest.slice().sort((a, b) => b.ovr - a.ovr);
  };

  PB.teamOvr = function (team) {
    if (team.starters.length < 5) return 0;
    const st = team.starters.map(id => PB.BYID[id]);
    const bn = team.bench.map(id => PB.BYID[id]);
    return PB.avg(st.map(m => m.ovr)) * 0.75 + PB.avg(bn.slice(0, 5).map(m => m.ovr)) * 0.25;
  };

  PB.validateLineup = function (team) {
    const errs = [];
    if (team.roster.length < 12) errs.push('Roster needs at least 12 Pokemon (has ' + team.roster.length + ')');
    if (team.starters.length !== 5) errs.push('Need exactly 5 starters');
    const all = team.starters.concat(team.bench);
    if (new Set(all).size !== all.length) errs.push('Duplicate Pokemon in lineup');
    for (const id of all) if (!team.roster.includes(id)) errs.push('Lineup contains a Pokemon not on the roster');
    if (all.length !== Math.min(12, team.roster.length)) errs.push('Lineup needs 5 starters and 7 on the bench');
    return errs;
  };
})(window.PB);
