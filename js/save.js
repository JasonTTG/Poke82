// Persistence: localStorage saves of the whole game state (seeded RNG state included).
(function (PB) {
  const KEY = n => 'poke82_save_' + n;
  PB.Save = {
    serialize(G) {
      const o = Object.assign({}, G); o.rngState = G.rng.s; delete o.rng;
      return JSON.stringify(o);
    },
    deserialize(str) {
      const o = JSON.parse(str);
      o.rng = new PB.RNG(1); o.rng.s = o.rngState; delete o.rngState;
      return o;
    },
    save(G, slot) {
      slot = slot || 1;
      const str = PB.Save.serialize(G);
      const meta = { t: Date.now(), mode: G.mode, year: G.fr && G.fr.year, team: G.teams[G.userTeam] && G.teams[G.userTeam].name, phase: G.league ? G.league.phase : (G.draft ? 'draft:' + G.draft.phase : 'new'), rec: G.league ? G.league.rec[G.userTeam].w + '-' + G.league.rec[G.userTeam].l : '' };
      try {
        localStorage.setItem(KEY(slot), str);
        localStorage.setItem(KEY(slot) + '_meta', JSON.stringify(meta));
        return { ok: true, bytes: str.length };
      } catch (e) { return { ok: false, error: String(e) }; }
    },
    load(slot) {
      slot = slot || 1;
      const str = localStorage.getItem(KEY(slot));
      if (!str) return null;
      const G = PB.Save.deserialize(str);
      PB.Save.relink(G);
      return G;
    },
    meta(slot) { try { return JSON.parse(localStorage.getItem(KEY(slot || 1) + '_meta')); } catch (e) { return null; } },
    remove(slot) { localStorage.removeItem(KEY(slot)); localStorage.removeItem(KEY(slot) + '_meta'); },
    relink(G) {
      // sched series references in playoffs are plain objects; nothing to relink beyond rng
      const err = PB.Registry.verify(G);
      if (err) throw new Error('Corrupt save: ' + err);
      return G;
    },
    settingsSave(S) { try { localStorage.setItem('poke82_settings', JSON.stringify(S)); } catch (e) { } },
    settingsLoad() { try { const o = JSON.parse(localStorage.getItem('poke82_settings') || '{}'); if (!o.showV2) { o.showRatings = o.showPositions = o.showArchetypes = o.showOverall = true; o.showV2 = true; } return Object.assign(PB.defaultSettings(), o); } catch (e) { return PB.defaultSettings(); } },
  };
})(window.PB);
