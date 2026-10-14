// Menus: main menu, new game, settings, controller/keyboard configuration.
(function (PB) {
  const UI = PB.UI, esc = UI.esc;
  const S = UI.screens, A = UI.actions;

  // ---------- main menu ----------
  S.menu = {
    noFocus: true,       // no pre-focused card, so nothing looks hovered until you point at it or navigate by keyboard / pad
    top: () => `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div>`,
    render() {
      const showcase = [25, 150, 6, 94, 149, 448, 130, 143, 249, 384, 445, 59].map(id => PB.BYID[id]);
      const recent = PB.Save.recent ? PB.Save.recent(2) : [1, 2].map(n => ({ n, m: PB.Save.meta(n) })).filter(x => x.m);
      const slot = (n, m) => `<div class="menu-card mc-save" tabindex="0" data-act="loadSlot" data-slot="${n}"><b>Continue · ${m.name ? esc(m.name) : 'Slot ' + n}</b><span class="dim">${esc(m.team || '')} · ${m.mode === 'fantasy' ? 'Fantasy' : m.mode === 'franchise' ? 'Franchise' : 'Main'} · ${esc(m.phase)} ${esc(m.rec || '')} · ${new Date(m.played || m.t).toLocaleDateString()}</span></div>`;
      let dailyStatus = 'Not played yet';
      try {
        const h = JSON.parse(localStorage.getItem('poke82_daily') || '{}'), d = new Date(), k = PB.localDay(d);
        let st = 0; for (;;) { const kk = PB.localDay(d); if (h[kk]) { st++; d.setDate(d.getDate() - 1); } else break; }
        const MD = PB.dailyMod && PB.dailyMod(k); dailyStatus = (h[k] ? 'Today: ' + h[k].w + '-' + h[k].l + ' · ' + h[k].res : 'Not played yet' + (MD ? ' · Modifier: ' + PB.MODS[MD].name : '')) + (st ? ' · ' + st + '-day streak' : '');
      } catch (e) { PB.warn('ui-menu', e); }
      return `<div class="hero">
        <h1>POKÉ<span>HOOPS</span> 82</h1>
        <div class="sprite-row">${showcase.map(m => UI.spr(m, 68)).join('')}</div>
        <div class="mgrid g-daily"><div class="menu-card mc-hero c-fire" tabindex="0" data-act="goDaily"><div class="mh-top"><span class="mh-tag">TODAY</span><span class="dim">${dailyStatus}</span></div><h3>Daily Challenge</h3><div class="dim">One shared draft for everyone, every day. Pick your team, then watch the 82-game season and the playoffs play out, and share your result.</div></div></div>
        <div class="msec">Game modes</div>
        <div class="mgrid g-modes">
          <div class="menu-card mc-md c-blue" tabindex="0" data-act="goEndless"><h3>Endless Draft</h3><div class="dim">The Daily Challenge with no limit: pick a challenge or none.</div><span class="mh-tag mc-tag" style="background:#5b9bff">UNLIMITED</span></div>
          <div class="menu-card mc-md c-gold" tabindex="0" data-act="newFranchise"><h3>Franchise</h3><div class="dim">Draft, develop, evolve and trade across regions. The full multi-season mode.</div><button class="small mc-online" data-act="goOnline" data-modes="franchise">${PB.I('globe')} Play online</button></div>
          <div class="menu-card mc-md c-purple" tabindex="0" data-act="newFantasy"><h3>Fantasy Draft</h3><div class="dim">Snake draft against the league, best Pokémon available.</div><button class="small mc-online" data-act="goOnline" data-modes="fantasy">${PB.I('globe')} Play online</button></div>
          <div class="menu-card mc-md" tabindex="0" data-act="goQuick"><h3>Quick Play</h3><div class="dim">Exhibition · 3v3 street · Practice · Co-op</div><button class="small mc-online" data-act="goOnline" data-modes="exhibition,coop">${PB.I('globe')} Play online (1v1, co-op)</button></div>
        </div>
        ${recent.length ? `<div class="msec">Saved games</div><div class="mgrid msaves">${recent.map(r => slot(r.n, r.m)).join('')}</div>` : ''}
        <div class="msec">Extras</div>
        <div class="mgrid mtools">
          <div class="menu-card mc-xs" tabindex="0" data-act="goDex"><h3>Pokédex & Compare</h3></div>
          <div class="menu-card mc-xs" tabindex="0" data-act="goLeagueCode"><h3>Open a League Code</h3></div>
          <div class="menu-card mc-xs" tabindex="0" data-act="goSaves"><h3>Manage saves</h3></div>
          <div class="menu-card mc-xs" tabindex="0" data-act="goSettings"><h3>Settings</h3></div>
        </div></div>`;
    },
    back() { },
  };
  A.goSettings = () => UI.go('settings');
  A.loadSlot = (el, d) => {
    try {
      const G = PB.Save.load(+d.slot); if (!G) return PB.toast('No save in that slot');
      PB.G = G; G.settings = Object.assign(PB.defaultSettings(), G.settings, PB.settings || {}); PB.settings = G.settings;
      UI.stack = [];
      if (G.league) UI.go('hub', { tab: 'home' }, true);
      else if (G.fdraft && G.fdraft.pick < G.fdraft.total) UI.go('fantasy', {}, true);
      else if (G.draft && G.draft.phase !== 'done') UI.go('draft', {}, true);
      else UI.go('lineup', { ctx: 'postDraft' }, true);
    } catch (e) { console.error(e); PB.toast('Load failed: ' + e.message, 4000); }
  };
  A.newFranchise = () => UI.go('frnew');
  A.goOnline = (el, d) => { if (d && d.modes) UI.setOnlineModes(d.modes.split(',')); UI.go('online'); };
  A.goQuick = () => UI.go('quick');
  A.goDaily = () => UI.go('daily');
  A.newFantasy = () => UI.go('new', { mode: 'fantasy' });

  // ---------- new game ----------
  S.new = {
    back() { UI.go('menu', {}, true); },
    render(p) {
      const fan = p.mode === 'fantasy';
      return `<div class="panel" style="max-width:640px;margin:20px auto">
        <h2>${fan ? 'New Fantasy Draft' : 'New Endless Draft'}</h2>
        <div class="col">
          <label>City <input type="text" id="ng-city" value="Pallet Town" maxlength="22"></label>
          <label>Team name <input type="text" id="ng-nick" value="Trainers" maxlength="22"></label>
          <label>Seed <input type="text" id="ng-seed" placeholder="random"></label>
          <label>Difficulty <select id="ng-diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="legend">Legend</option></select></label>
          <label>Legendaries per team <select id="ng-leg"><option value="0">No limit</option><option value="1">Max 1</option><option value="2">Max 2</option><option value="3">Max 3</option></select></label>
          <label>League teams <select id="ng-teams">${[30, 24, 18, 12].filter(n => n * 12 <= PB.MONS.length).map(n => `<option value="${n}" ${n === 30 ? 'selected' : ''}>${n} teams</option>`).join('')}</select></label>
          ${fan ? `<label>Your draft position <select id="ng-pos"><option value="r">Random</option>${Array.from({ length: 30 }, (_, i) => `<option value="${i}">#${i + 1}</option>`).join('')}</select></label>
          <h3 style="margin-top:6px">League settings: what the draft shows</h3>
          
          ${[['R', 'Basketball ratings'], ['P', 'Positions'], ['A', 'Archetypes'], ['O', 'Overall']].map(([k, l]) => `<label><input type="checkbox" id="ng-i${k}" checked> ${l}</label>`).join('')}`
          : `<label><input type="checkbox" id="ng-chal" ${(PB.settings || {}).challengeMode ? 'checked' : ''}> Hide the suggested positions while drafting</label>`}
          <div class="row"><button class="primary" data-act="startNew" data-mode="${p.mode}" autofocus>Start</button><button data-act="goMenu">Cancel</button></div>
        </div></div>`;
    },
  };
  A.startNew = (el, d) => {
    const val = id => document.getElementById(id).value;
    let seed = val('ng-seed').trim();
    seed = seed ? (/^\d+$/.test(seed) ? (+seed >>> 0) : [...seed].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7)) : ((Math.random() * 4294967296) >>> 0);
    const n = +val('ng-teams') || 30;
    const rng0 = new PB.RNG(seed);
    const slot = rng0.int(0, n - 1);
    const G = PB.newGame(seed, d.mode, n, slot);
    G.settings = Object.assign(PB.defaultSettings(), PB.settings || {}, { difficulty: val('ng-diff') });
    PB.settings = G.settings; PB.Save.settingsSave(PB.settings);
    G.rules = { legCap: +val('ng-leg') || 0 };
    if (d.mode === 'fantasy') G.draftInfo = { R: document.getElementById('ng-iR').checked, P: document.getElementById('ng-iP').checked, A: document.getElementById('ng-iA').checked, O: document.getElementById('ng-iO').checked };
    else { G.challenge = document.getElementById('ng-chal').checked; PB.settings.challengeMode = G.challenge; PB.Save.settingsSave(PB.settings); }
    const T = G.teams[G.userTeam];
    T.city = val('ng-city').trim() || T.city; T.nick = val('ng-nick').trim() || T.nick; T.name = T.city + ' ' + T.nick;
    T.abbr = (T.city.replace(/[^A-Za-z ]/g, '').split(' ').map(w => w[0]).join('') + T.city.replace(/[^A-Za-z]/g, '').slice(1, 3)).slice(0, 3).toUpperCase();
    G.userTeamName = T.name;
    PB.G = G; UI.stack = [];
    if (d.mode === 'fantasy') {
      const pv = document.getElementById('ng-pos').value;
      PB.Fantasy.start(G, pv === 'r' ? null : +pv);
      PB.Fantasy.runToUser(G);
      UI.go('fantasy', {}, true);
    } else {
      G.draft = { phase: 'starters', pick: 0, roll: null, cands: null, picked: [], rerolls: { region: 1, type: 1 } };
      UI.go('draft', {}, true);
    }
  };

  // ---------- settings ----------
  const PADN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L-Stick', 'R-Stick', 'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Guide'];
  S.settings = {
    render() {
      const s = PB.settings || (PB.settings = PB.Save.settingsLoad());
      const I = PB.Input;
      const act = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'START'];
      const names = { A: 'Pass / Switch', B: 'Bounce pass / Take charge', X: 'Shoot / Steal', Y: 'Lob / Block, rebound', LB: 'Screen / Defense scheme', RB: 'Icon pass / Next defender', LT: 'Post up / Stance', RT: 'Sprint', START: 'Pause' };
      return `<div class="layout2" style="--side:1fr">
        <div class="panel col"><h2>Game Settings</h2>
          <label>Difficulty <select data-change="setOpt" data-k="difficulty">${['easy', 'normal', 'hard', 'legend'].map(v => `<option ${s.difficulty === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Quarter length (playable games): <b id="qv">${s.quarterMin}</b> min <input type="range" min="1" max="12" value="${s.quarterMin}" data-change="setOptNum" data-k="quarterMin" oninput="document.getElementById('qv').textContent=this.value"></label>
          <label>Simulation speed <select data-change="setOpt" data-k="simSpeed">${[['0', 'Instant'], ['1', 'Fast'], ['2', 'Normal'], ['3', 'Slow']].map(([v, l]) => `<option value="${v}" ${String(s.simSpeed) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Game speed (playable): <b id="gv">${s.gameSpeed}</b>x <input type="range" min="0.6" max="1.4" step="0.1" value="${s.gameSpeed}" data-change="setOptNum" data-k="gameSpeed" oninput="document.getElementById('gv').textContent=this.value"></label>
          <label><input type="checkbox" ${s.mute ? 'checked' : ''} data-change="setOptBool" data-k="mute"> Mute everything</label>
          <label>Master volume <input type="range" min="0" max="1" step="0.05" value="${s.volume != null ? s.volume : 0.6}" data-change="setOptNum" data-k="volume" oninput="PB.settings.volume=+this.value;PB.Audio.apply()"></label>
          <label>Sound effects <input type="range" min="0" max="1" step="0.05" value="${s.sfxVol != null ? s.sfxVol : 0.8}" data-change="setOptNum" data-k="sfxVol" oninput="PB.settings.sfxVol=+this.value;PB.Audio.apply()"> <input type="checkbox" ${s.sfx !== false ? 'checked' : ''} data-change="setOptBool" data-k="sfx" title="Sound effects on"></label>
          <label>Music <input type="range" min="0" max="1" step="0.05" value="${s.musicVol != null ? s.musicVol : 0.3}" data-change="setOptNum" data-k="musicVol" oninput="PB.settings.musicVol=+this.value;PB.Audio.apply()"> <input type="checkbox" ${s.music !== false ? 'checked' : ''} data-change="setOptBool" data-k="music" title="Menu music on"></label>
          <label><input type="checkbox" ${s.crowd !== false ? 'checked' : ''} data-change="setOptBool" data-k="crowd"> Crowd noise during games</label>
          <label><input type="checkbox" ${s.shotMeter ? 'checked' : ''} data-change="setOptBool" data-k="shotMeter"> Shot timing meter</label>
          <label>Meter skin <select data-change="setOpt" data-k="meterSkin">${Object.entries(UI.meterSkins || {}).map(([k, v]) => `<option value="${k}" ${(s.meterSkin || 'bar') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <select data-change="setOpt" data-k="meterColor">${Object.entries(UI.meterColors || {}).map(([k, v]) => `<option value="${k}" ${(s.meterColor || 'classic') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>Camera <select data-change="setOpt" data-k="camera"><option value="behind" ${s.camera !== 'broadcast' ? 'selected' : ''}>2K (behind the play)</option><option value="broadcast" ${s.camera === 'broadcast' ? 'selected' : ''}>Broadcast (sideline)</option></select></label>
          <label>Touch controls <select data-change="setOpt" data-k="touchControls">${[['auto', 'Automatic (touch devices)'], ['on', 'Always on'], ['off', 'Off']].map(([v, l]) => `<option value="${v}" ${(s.touchControls || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label><input type="checkbox" ${s.autoReplay !== false ? 'checked' : ''} data-change="setOptBool" data-k="autoReplay"> Offer instant replays after big plays</label>
          <label><input type="checkbox" ${s.showBadges !== false ? 'checked' : ''} data-change="setOptBool" data-k="showBadges"> Ability pop-ups during games</label>
          <h3 style="margin-top:8px">Accessibility</h3>
          <label><input type="checkbox" ${s.colorblind ? 'checked' : ''} data-change="setA11y" data-k="colorblind"> Colorblind-friendly colors (blue and orange instead of green and red)</label>
          <label>Text size <select data-change="setA11y" data-k="textScale">${[['100', 'Normal'], ['115', 'Large'], ['130', 'Larger']].map(([v, l]) => `<option value="${v}" ${String(s.textScale || 100) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <h3 style="margin-top:8px">Problems</h3>
          <div class="row wrap"><button data-act="diagCopy">Copy problem report</button><button data-act="diagClear">Clear log</button></div>
          <h3 style="margin-top:8px">Performance (playable games)</h3>
          
          <label>Preset <select data-change="perfPreset"><option value="">Choose…</option><option value="high">High quality</option><option value="balanced">Balanced</option><option value="low">Low-end device</option></select></label>
          <label>Graphics detail <select data-change="setOpt" data-k="gfx">${[['high', 'High (full arena, crowd, floor)'], ['medium', 'Medium (no roof, banners or floor planks)'], ['low', 'Low (plain arena, no fans or jumbotron)']].map(([v, l]) => `<option value="${v}" ${(s.gfx || 'high') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Pixel size <select data-change="setOpt" data-k="pxl">${[['2', 'Fine'], ['3', 'Normal'], ['4', 'Chunky'], ['6', 'Blocky (fastest)']].map(([v, l]) => `<option value="${v}" ${String(s.pxl || 2) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label>Frame-rate limit <select data-change="setOpt" data-k="fpsCap">${[['0', 'Match the display'], ['60', '60 FPS'], ['30', '30 FPS (saves battery)']].map(([v, l]) => `<option value="${v}" ${String(s.fpsCap || 0) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label><input type="checkbox" ${document.fullscreenElement ? 'checked' : ''} data-change="toggleFs"> Fullscreen</label>
          <label><input type="checkbox" ${s.challengeMode ? 'checked' : ''} data-change="setOptBool" data-k="challengeMode"> Hide the suggested positions while drafting in the Daily Challenge and Endless Draft</label>
          <h3 style="margin-top:8px">Show (drafted Pokémon and league menus; draft prospects follow the mode's own rules)</h3>
          <label><input type="checkbox" ${s.showRatings ? 'checked' : ''} data-change="setOptBool" data-k="showRatings"> Basketball ratings</label>
          <label><input type="checkbox" ${s.showPositions ? 'checked' : ''} data-change="setOptBool" data-k="showPositions"> Positions</label>
          <label><input type="checkbox" ${s.showArchetypes ? 'checked' : ''} data-change="setOptBool" data-k="showArchetypes"> Archetypes</label>
          <label><input type="checkbox" ${s.showOverall ? 'checked' : ''} data-change="setOptBool" data-k="showOverall"> Overall rating</label>
          <button data-act="goMenu">Back</button>
        </div>
        <div class="panel"><h2>Controls</h2>
          <div class="dim" style="font-size:12px;margin-bottom:6px">${I.padConnected ? esc(I.padName.slice(0, 50)) : ''}</div>
          <div class="keyrow"><b></b><b>Keyboard</b><b>Gamepad</b>
            ${act.map(a => `<span title="${names[a]}"><b>${a}</b><br><span class="dim" style="font-size:11px">${names[a]}</span></span>
              <button class="small" data-act="rebindKey" data-a="${a}">${(I.keyMap[a] || []).map(I.keyLabel).join(' / ') || '—'}</button>
              <button class="small" data-act="rebindPad" data-a="${a}">${PADN[I.padMap[a]] || 'Button ' + I.padMap[a]}</button>`).join('')}
          </div>
          <label>Stick deadzone <input type="range" min="0.05" max="0.4" step="0.01" value="${I.deadzone}" data-change="setDz"></label>
          <label>Movement sensitivity <input type="range" min="0.7" max="1.3" step="0.05" value="${I.sens}" data-change="setSens"></label>
          <button data-act="resetControls">Reset to defaults</button>
        </div></div>`;
    },
    back() { UI.go(PB.G && PB.G.league ? 'hub' : 'menu', PB.G && PB.G.league ? { tab: 'home' } : {}, true); },
  };
  const persist = () => { PB.Save.settingsSave(PB.settings); if (PB.G) PB.G.settings = PB.settings; };
  A.perfPreset = el => { const P = { high: ['high', 2, 0], balanced: ['medium', 3, 60], low: ['low', 4, 30] }[el.value]; if (!P) return; Object.assign(PB.settings, { gfx: P[0], pxl: P[1], fpsCap: P[2] }); persist(); UI.refresh(); };
  A.setOpt = (el, d) => { PB.settings[d.k] = el.value; persist(); };
  A.setOptNum = (el, d) => { PB.settings[d.k] = +el.value; persist(); if (PB.Audio) PB.Audio.apply(); };
  A.setOptBool = (el, d) => { PB.settings[d.k] = el.checked; persist(); if (PB.Audio) PB.Audio.apply(); };
  A.toggleFs = (el) => { if (el.checked) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen && document.exitFullscreen(); };
  A.setDz = el => { PB.Input.deadzone = +el.value; PB.Input.saveConfig(); };
  A.setSens = el => { PB.Input.sens = +el.value; PB.Input.saveConfig(); };
  A.resetControls = () => { PB.Input.resetConfig(); UI.refresh(); };
  A.rebindKey = (el, d) => { el.textContent = 'press a key…'; PB.Input.rebind = { kind: 'key', action: d.a, cb: () => UI.refresh() }; };
  A.rebindPad = (el, d) => { PB.Input._rbWait = true; el.textContent = 'press a button…'; PB.Input.rebind = { kind: 'pad', action: d.a, cb: () => UI.refresh() }; };
})(window.PB);
