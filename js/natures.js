// Natures (franchise only): every Pokémon line has a stable nature that tilts a few ratings up and others down.
// Applied on top of talent variance inside PB.Var.apply, so it follows evolutions and only exists in franchise leagues.
(function (PB) {
  const F = PB.Franchise, V = PB.Var, { clamp } = PB;
  const N = PB.Nature = {};
  // the five Pokémon stats a nature can raise or lower, and the basketball ratings each one stands for
  const STAT = {
    atk: { name: 'Power', keys: ['dunk', 'strength', 'post', 'oreb'] },
    def: { name: 'Defense', keys: ['intD', 'block', 'dreb', 'perD'] },
    spa: { name: 'Shooting', keys: ['three', 'mid', 'layup', 'ft'] },
    spd: { name: 'Vision', keys: ['iq', 'pass', 'steal', 'handle'] },
    spe: { name: 'Speed', keys: ['speed', 'accel', 'stamina', 'handle'] },
  };
  // the 25 natures: [name, raised stat, lowered stat]; the five neutral ones have none
  N.LIST = [
    ['Hardy'], ['Lonely', 'atk', 'def'], ['Brave', 'atk', 'spe'], ['Adamant', 'atk', 'spa'], ['Naughty', 'atk', 'spd'],
    ['Bold', 'def', 'atk'], ['Docile'], ['Relaxed', 'def', 'spe'], ['Impish', 'def', 'spa'], ['Lax', 'def', 'spd'],
    ['Timid', 'spe', 'atk'], ['Hasty', 'spe', 'def'], ['Serious'], ['Jolly', 'spe', 'spa'], ['Naive', 'spe', 'spd'],
    ['Modest', 'spa', 'atk'], ['Mild', 'spa', 'def'], ['Quiet', 'spa', 'spe'], ['Bashful'], ['Rash', 'spa', 'spd'],
    ['Calm', 'spd', 'atk'], ['Gentle', 'spd', 'def'], ['Sassy', 'spd', 'spe'], ['Careful', 'spd', 'spa'], ['Quirky'],
  ].map(([name, up, down]) => ({ name, up, down }));
  const hash = (a, b) => { let h = (a ^ 0x7f4a7c15) >>> 0; h = Math.imul(h ^ b, 0x85ebca6b) >>> 0; h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 0xc2b2ae35) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const root = id => { let m = PB.BYID[id], g = 0; while (m && m.from_ && PB.BYID[m.from_] && g++ < 6) m = PB.BYID[m.from_]; return m ? m.id : id; };
  N.on = G => !!(G && G.fr && G.fr.cfg && G.fr.cfg.natures);
  N.of = (G, id) => N.LIST[Math.floor(hash(G.seed >>> 0, root(id) * 17 + 3) * N.LIST.length) % N.LIST.length];
  N.describe = n => n.up ? '+' + STAT[n.up].name + ', −' + STAT[n.down].name : 'Balanced';
  N.tilt = (n, k) => !n.up ? 0 : (STAT[n.up].keys.includes(k) ? 4 : 0) - (STAT[n.down].keys.includes(k) ? 3 : 0);

  const origApply = V.apply;
  V.apply = function (G) {
    origApply(G);
    if (!N.on(G)) return;
    for (const m of PB.MONS) {
      const n = N.of(G, m.id); if (!n.up) continue;
      for (const k of Object.keys(PB.RLABELS)) { const t = N.tilt(n, k); if (t) m.r[k] = clamp(m.r[k] + t, 20, 99); }
      m._pot = null;
    }
    if (PB.Abil) PB.Abil.clearCache();
  };

  F.DEFAULTS.natures = 1;
  F.RULES.push({ k: 'natures', label: 'Natures', opts: [[1, 'On'], [0, 'Off']] });
  const origSet = F.setRules;
  F.setRules = function (G, changes) { origSet(G, changes); if (changes.natures != null) V.apply(G); };

  // shown on the Pokémon card (franchise only, never for undrafted prospects)
  if (PB.UI && PB.UI.fullCard) {
    const UI = PB.UI, orig = UI.fullCard;
    UI.fullCard = function (m, extra) {
      const G = PB.G;
      if (!N.on(G) || !UI.vis(m).R) return orig(m, extra);
      const n = N.of(G, m.id);
      return orig(m, `<h3 style="margin-top:12px">Nature</h3><div class="arch" style="margin-bottom:4px"><b>${n.name}</b> <span class="dim">· ${N.describe(n)}</span></div>` + (extra || ''));
    };
  }
})(window.PB);
