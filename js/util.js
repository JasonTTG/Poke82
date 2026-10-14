// Core utilities: namespace, seeded RNG, helpers
window.PB = window.PB || {};
(function (PB) {
  PB.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  PB.lerp = (a, b, t) => a + (b - a) * t;
  PB.norm = (v, lo, hi) => PB.clamp((v - lo) / (hi - lo), 0, 1);
  PB.avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  PB.sum = a => a.reduce((s, x) => s + x, 0);
  // Hollinger game score from box totals (one game, or a season total: divide by gp). The single definition used by awards, grades, reports and stat pages.
  PB.gameScore = s => s.pts + 0.4 * s.fgm - 0.7 * s.fga - 0.4 * (s.fta - s.ftm) + 0.7 * s.oreb + 0.3 * s.dreb + s.stl + 0.7 * s.ast + 0.7 * s.blk - 0.4 * s.pf - s.tov;
  // a stable 0..1 value from two integers (the same everywhere, so every client agrees); `salt` keeps different uses independent
  PB.hash2 = (a, b, salt) => { let h = (a ^ (salt == null ? 0x9e3779b9 : salt)) >>> 0; h = Math.imul(h ^ b, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xc2b2ae35) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  PB.gameScorePG = s => PB.gameScore(s) / Math.max(1, s.gp);

  // mulberry32 seeded RNG; state is serialisable so saves resume deterministically
  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 1; }
    next() {
      let t = (this.s += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    range(a, b) { return a + this.next() * (b - a); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    gauss() { let u = 0, v = 0; while (!u) u = this.next(); while (!v) v = this.next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    // weights: array of numbers; returns index
    weighted(weights) {
      let tot = 0; for (const w of weights) tot += w;
      let r = this.next() * tot;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
      return weights.length - 1;
    }
  }
  PB.RNG = RNG;
  PB.rng = new RNG(Date.now() & 0xffffffff); // global, non-gameplay-critical rng

  PB.POS = ['PG', 'SG', 'SF', 'PF', 'C'];
  PB.REGIONS = { 1: 'Kanto', 2: 'Johto', 3: 'Hoenn', 4: 'Sinnoh', 5: 'Unova', 6: 'Kalos', 7: 'Alola', 8: 'Galar', 9: 'Paldea' };
  PB.TYPES = ['normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'];
  PB.TYPE_COLORS = { normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6', fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a', rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad' };
  // PokeAPI height is decimeters, weight is hectograms
  PB.fmtHeight = dm => { const inch = Math.round(dm * 3.937); return Math.floor(inch / 12) + '′' + (inch % 12) + '″'; };
  PB.fmtWeight = hg => Math.round(hg * 0.220462) + ' lbs';
  PB.cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const KEEP_HYPHEN = { 'ho-oh': 'Ho-Oh', 'porygon-z': 'Porygon-Z', 'jangmo-o': 'Jangmo-o', 'hakamo-o': 'Hakamo-o', 'kommo-o': 'Kommo-o', 'nidoran-f': 'Nidoran♀', 'nidoran-m': 'Nidoran♂', 'wo-chien': 'Wo-Chien', 'chien-pao': 'Chien-Pao', 'ting-lu': 'Ting-Lu', 'chi-yu': 'Chi-Yu' };
  PB.fmtName = n => KEEP_HYPHEN[n] || n.split('-').map(PB.cap).join(' ');
})(window.PB);
