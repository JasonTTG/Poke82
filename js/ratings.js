// Pokemon -> basketball ratings. All weights live in PB.RCFG so balancing is one place.
(function (PB) {
  const { clamp, norm } = PB;
  PB.RCFG = {
    base: 24, span: 74,            // rating = base + span * mix  (0..99 after clamp)
    posNorm: { mean: 1, spread: 0.85 },       // how strongly overall is normalised within position (0 = off, 1 = full)
    posMix: [0.20, 0.20, 0.20, 0.20, 0.20],   // target share of primary positions PG, SG, SF, PF, C
    sizeH: { lo: Math.log(3), hi: Math.log(30) },
    sizeW: { lo: Math.log(10), hi: Math.log(5000) },
    // PokeAPI body shapes -> ball-handling ability (hands) and court mobility
    HANDS: { humanoid: 1.0, upright: 0.85, arms: 0.8, tentacles: 0.55, heads: 0.5, armor: 0.45, 'bug-wings': 0.45, wings: 0.4, legs: 0.35, blob: 0.3, quadruped: 0.3, ball: 0.15, squiggle: 0.15, fish: 0.1 },
    MOB: { humanoid: 1.0, upright: 1.0, legs: 1.0, quadruped: 1.0, armor: 0.9, wings: 0.85, 'bug-wings': 0.85, arms: 0.65, heads: 0.65, ball: 0.55, squiggle: 0.55, tentacles: 0.55, blob: 0.5, fish: 0.4 },
  };

  function rate(m) {
    const R = PB.RCFG;
    const HP = norm(m.hp, 30, 160), A = norm(m.atk, 30, 150), D = norm(m.def_, 30, 150),
      SA = norm(m.spa, 30, 150), SD = norm(m.spd, 30, 150), SP = norm(m.spe, 25, 140);
    const sH = norm(Math.log(m.h), R.sizeH.lo, R.sizeH.hi);
    const sW = norm(Math.log(m.w), R.sizeW.lo, R.sizeW.hi);
    const r = x => Math.round(clamp(R.base + R.span * x, 20, 99));
    // body plan: hands = ability to hold/handle/shoot a ball, mob = legged court mobility
    const hands = R.HANDS[m.shape] != null ? R.HANDS[m.shape] : 0.6, mob = R.MOB[m.shape] != null ? R.MOB[m.shape] : 0.8;
    const H = (x, k) => x * (1 - k * (1 - hands));      // hand-dependent skill
    const Mv = (x, k) => x * (1 - k * (1 - mob));       // movement-dependent skill
    const o = {};
    o.speed = r(Mv(0.62 * SP + 0.14 * (1 - sW) + 0.10 * (1 - sH) + 0.08 * A, 0.30));
    o.accel = r(Mv(0.55 * SP + 0.20 * (1 - sW) + 0.12 * (1 - sH) + 0.13 * A, 0.35));
    o.strength = r(0.42 * sW + 0.33 * A + 0.15 * D + 0.10 * HP);
    o.stamina = r(0.66 * HP + 0.14 * SP + 0.10 * D + 0.10 * SD);
    o.dunk = r(H(Mv(0.38 * A + 0.26 * sH + 0.18 * SP + 0.18 * sW, 0.2), 0.30));
    o.layup = r(H(0.28 * A + 0.24 * SP + 0.22 * SA + 0.14 * (1 - Math.abs(sH - 0.45)) + 0.12 * SD, 0.45));
    o.three = r(H(0.58 * SA + 0.14 * SD + 0.12 * SP + 0.10 * (1 - sW) + 0.06 * (1 - Math.abs(sH - 0.4)), 0.50));
    o.mid = r(H(0.52 * SA + 0.20 * A + 0.14 * SD + 0.14 * (1 - Math.abs(sH - 0.5)), 0.50));
    o.ft = r(H(0.46 * SA + 0.26 * SD + 0.14 * (1 - sW) + 0.14 * (1 - A * 0.5), 0.50));
    o.iq = r(0.34 * SD + 0.26 * SA + 0.16 * D + 0.14 * HP + 0.10 * SP);
    o.pass = r(H(0.36 * SD + 0.30 * SA + 0.20 * SP + 0.14 * (1 - sW), 0.50));
    o.handle = r(H(Mv(0.38 * SP + 0.26 * SA + 0.18 * (1 - sW) + 0.18 * (1 - sH), 0.25), 0.55));
    o.steal = r(H(0.34 * SP + 0.32 * SD + 0.14 * A + 0.10 * (1 - sW) + 0.10 * (1 - sH), 0.35));
    o.block = r(H(0.34 * D + 0.34 * sH + 0.16 * A + 0.16 * SP, 0.15));
    o.oreb = r(H(0.32 * D + 0.26 * sH + 0.22 * sW + 0.20 * A, 0.25));
    o.dreb = r(H(0.36 * D + 0.28 * sH + 0.18 * sW + 0.18 * HP, 0.25));
    o.post = r(H(0.34 * sW + 0.28 * A + 0.20 * D + 0.18 * sH, 0.25));
    o.intD = r(0.38 * D + 0.24 * sH + 0.20 * sW + 0.18 * HP);
    o.perD = r(Mv(0.38 * SD + 0.30 * SP + 0.16 * D + 0.16 * (1 - sW), 0.25));
    o.hands = hands; o.mob = mob;
    o.sH = sH; o.sW = sW;

    // overall
    const finish = Math.max(o.layup, o.dunk);
    const scoring = Math.max(o.three, o.mid) * 0.4 + finish * 0.3 + Math.max(o.post, o.three * 0.9) * 0.15 + o.mid * 0.15;
    const play = 0.5 * o.pass + 0.3 * o.handle + 0.2 * o.iq;
    const def = 0.4 * Math.max(o.intD, o.perD) + 0.15 * Math.min(o.intD, o.perD) + 0.2 * Math.max(o.steal, o.block) + 0.25 * o.iq;
    const reb = Math.max(o.oreb, o.dreb);
    const ath = (o.speed + o.accel + o.strength + o.stamina * 0.8) / 3.8;
    o.rawOvr = 0.27 * scoring + 0.14 * play + 0.26 * def + 0.11 * reb + 0.14 * ath + 0.08 * o.iq;

    // position continuum 0 (PG) .. 4 (C)
    const guardish = 0.5 * o.handle + 0.3 * o.pass + 0.2 * o.three;
    const bigish = 0.4 * Math.max(o.oreb, o.dreb) + 0.3 * o.block + 0.3 * o.strength;
    const t = 0.50 * sH + 0.14 * sW + 0.36 * clamp((bigish - guardish + 45) / 90, 0, 1);
    o.posC = clamp((t - 0.20) / 0.60, 0, 1) * 4;
    const p1 = Math.round(o.posC);
    o.pos1 = p1;
    o.pos2 = o.posC >= p1 ? Math.min(4, p1 + 1) : Math.max(0, p1 - 1);
    if (o.pos2 === p1) o.pos2 = p1 === 0 ? 1 : p1 - 1;
    return o;
  }

  function archetypes(o) {
    const off = [];
    if (o.three >= 72 && o.three >= o.dunk) off.push(['Sharpshooter', o.three]);
    if (o.dunk >= 72 && o.dunk >= o.three) off.push(['Slam Finisher', o.dunk]);
    if (o.pass >= 70 && o.handle >= 66) off.push(['Playmaker', (o.pass + o.handle) / 2]);
    if (o.post >= 70 && o.pos1 >= 3) off.push(['Post Scorer', o.post]);
    if (o.speed >= 72 && o.layup >= 66) off.push(['Slasher', (o.speed + o.layup) / 2]);
    if (o.mid >= 72) off.push(['Midrange Maestro', o.mid]);
    off.sort((a, b) => b[1] - a[1]);
    const dfn = [];
    if (o.block >= 74 && o.intD >= 70) dfn.push(['Rim Protector', o.block]);
    if (o.perD >= 72 && o.steal >= 66) dfn.push(['Lockdown Defender', o.perD]);
    if (o.steal >= 76) dfn.push(['Pickpocket', o.steal]);
    if (Math.max(o.oreb, o.dreb) >= 76) dfn.push(['Glass Cleaner', Math.max(o.oreb, o.dreb)]);
    dfn.sort((a, b) => b[1] - a[1]);
    return {
      off: off.length ? off[0][0] : (o.pos1 >= 3 ? 'Interior Scorer' : o.pos1 <= 1 ? 'Perimeter Scorer' : 'Wing Scorer'),
      def: dfn.length ? dfn[0][0] : (o.intD > o.perD ? 'Interior Defender' : 'Perimeter Defender'),
    };
  }

  const LABELS = { speed: 'Speed', accel: 'Acceleration', strength: 'Strength', stamina: 'Stamina', dunk: 'Dunking', layup: 'Layups', three: '3PT Shooting', mid: 'Midrange', ft: 'Free Throws', iq: 'Basketball IQ', pass: 'Passing', handle: 'Ball Handling', steal: 'Steals', block: 'Blocks', oreb: 'Off. Rebounding', dreb: 'Def. Rebounding', post: 'Post Play', intD: 'Interior D', perD: 'Perimeter D' };
  PB.RLABELS = LABELS;

  PB.buildDB = function () {
    const mons = PB.MONS = window.POKE_RAW.map(r => {
      const m = Object.assign({}, r);
      m.def = r.def_;
      m.dispName = r.reg ? ({ alola: 'Alolan', galar: 'Galarian', hisui: 'Hisuian', paldea: 'Paldean' })[r.reg] + ' ' + PB.fmtName(r.name.split('-' + r.reg)[0]) : PB.fmtName(r.name);
      m.region = PB.REGIONS[r.gen];
      m.bst = r.hp + r.atk + r.def_ + r.spa + r.spd + r.spe;
      m.sprite = 'sprites/' + r.id + '.png';
      m.remote = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + r.id + '.png';
      m.r = rate(m);
      return m;
    });
    // positions: the fully evolved / non-evolving Pokémon and the ones that can still evolve are each ranked on their own raw size/skill continuum and
    // spread over a target mix, so every position is about equally common in both groups and each Pokémon's position follows what it is actually like
    {
      const hasEvo = new Set(mons.filter(m => m.from_).map(m => m.from_)), cum = PB.RCFG.posMix.reduce((c, x) => (c.push((c.length ? c[c.length - 1] : 0) + x), c), []);
      for (const group of [mons.filter(m => !hasEvo.has(m.id)), mons.filter(m => hasEvo.has(m.id))]) {
        const order = group.slice().sort((a, b) => a.r.posC - b.r.posC || a.id - b.id);
        order.forEach((m, i) => {
          const q = (i + 0.5) / order.length; let k = 0; while (k < 4 && q > cum[k]) k++;
          const lo = k ? cum[k - 1] : 0, f = (q - lo) / (cum[k] - lo), o = m.r;
          o.posRaw = o.posC; o.posC = clamp(k - 0.5 + f, 0, 4); o.pos1 = k;
          o.pos2 = f < 0.5 ? Math.max(0, k - 1) : Math.min(4, k + 1); if (o.pos2 === k) o.pos2 = k === 0 ? 1 : k - 1;
        });
      }
    }
    // bigs rate higher on raw ratings (strength, boards, rim defense), so overall is compared within position: shift and stretch each
    // position's raw overall toward the league-wide mean / spread (interpolated along the position continuum)
    {
      const all = mons.map(m => m.r.rawOvr), mean = a => a.reduce((s, v) => s + v, 0) / a.length, sd = (a, m0) => Math.sqrt(mean(a.map(v => (v - m0) * (v - m0))));
      const mu = mean(all), sg = sd(all, mu), st = [0, 1, 2, 3, 4].map(k => { const a = mons.filter(m => m.r.pos1 === k).map(m => m.r.rawOvr), m0 = mean(a); return { m: m0, s: sd(a, m0) }; });
      const K = PB.RCFG.posNorm;
      for (const m of mons) {
        const c = m.r.posC, k0 = Math.min(3, Math.floor(c)), f = c - k0, A = st[k0], B = st[k0 + 1];
        const pm = A.m + (B.m - A.m) * f, ps = A.s + (B.s - A.s) * f;
        m.r.rawBase = m.r.rawOvr;
        m.r.rawOvr = mu + (m.r.rawOvr - (mu + (pm - mu) * K.mean)) * Math.pow(sg / ps, K.spread);
      }
    }
    // calibrate overall so population spans ~[38..97], median 58
    const raws = mons.map(m => m.r.rawOvr).sort((a, b) => a - b);
    const p = q => raws[Math.floor(q * (raws.length - 1))];
    const lo = p(0.02), mid = p(0.5), hi = p(0.995);
    for (const m of mons) {
      const x = m.r.rawOvr;
      m.ovr = Math.round(x >= mid ? 58 + 38 * ((x - mid) / (hi - mid)) : 58 - 20 * ((mid - x) / (mid - lo)));
      m.ovr = clamp(m.ovr, 30, 99);
      const a = archetypes(m.r); m.archOff = a.off; m.archDef = a.def;
      m.pos = [PB.POS[m.r.pos1], PB.POS[m.r.pos2]];
      const ent = Object.keys(LABELS).map(k => [k, m.r[k]]).sort((a, b) => b[1] - a[1]);
      m.strengths = ent.slice(0, 3).map(e => LABELS[e[0]]);
      m.weaknesses = ent.slice(-2).map(e => LABELS[e[0]]).reverse();
      const r = m.r;
      m.tend = {
        usage: Math.max(r.three, r.mid, r.layup, r.dunk) * 0.6 + r.handle * 0.15 + m.ovr * 0.25,
        threeRate: clamp((r.three - 45) / 55, 0.02, 1) * (r.pos1 >= 4 ? 0.35 : 1),
        rimRate: clamp((Math.max(r.dunk, r.layup) - 40) / 60, 0.05, 1) * (0.6 + 0.4 * (r.pos1 / 4)),
        midRate: clamp((r.mid - 45) / 55, 0.02, 1),
        postRate: r.pos1 >= 3 ? clamp((r.post - 50) / 50, 0, 1) : 0.02,
        passRate: clamp((r.pass - 40) / 60, 0.05, 1),
      };
      m.body = { scale: 0.85 + 0.55 * r.sH, reach: r.sH, mass: r.sW };
    }
    PB.BYID = {}; for (const m of mons) PB.BYID[m.id] = m;
    return mons;
  };

  // rating penalty fraction when a Pokemon plays a slot far from either listed position
  PB.slotPenalty = function (m, slot) {
    const d = Math.min(Math.abs(m.r.pos1 - slot), Math.abs(m.r.pos2 - slot) + 0.3);
    return d <= 1 ? 0 : (d - 1) * 0.03;
  };
})(window.PB);
