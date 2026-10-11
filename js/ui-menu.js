// Menus: main menu, new game, settings, controller/keyboard configuration.
(function (PB) {
  const UI = PB.UI, esc = UI.esc;
  const S = UI.screens, A = UI.actions;

  // ---------- main menu ----------
  S.menu = {
    top: () => `<div class="logo">POKÉ<b>HOOPS</b> 82</div><div class="spacer"></div>`,
    render() {
      const showcase = [25, 150, 6, 94, 149, 448, 130, 143, 249, 384, 445, 59].map(id => PB.BYID[id]);
      const m1 = PB.Save.meta(1), m2 = PB.Save.meta(2);
      const slot = (n, m) => m ? `<div class="menu-card" tabindex="0" data-act="loadSlot" data-slot="${n}"><h3>Continue — Slot ${n}</h3><div class="dim">${esc(m.team || '')} · ${m.mode === 'fantasy' ? 'Fantasy' : 'Main'} · ${esc(m.phase)} ${esc(m.rec || '')}<br>${new Date(m.t).toLocaleString()}</div></div>` : '';
      return `<div class="hero">
        <h1>POKÉ<span>HOOPS</span> 82</h1>
        <div class="sprite-row">${showcase.map(m => UI.spr(m, 64)).join('')}</div>
        <div class="menu-grid">
          <div class="menu-card" tabindex="0" data-act="newMain" autofocus><h3>Random Draft</h3></div>
          <div class="menu-card" tabindex="0" data-act="newFantasy"><h3>Fantasy Draft</h3></div>
          ${slot(1, m1)}${slot(2, m2)}
          <div class="menu-card" tabindex="0" data-act="exhibition"><h3>Exhibition</h3></div>
          <div class="menu-card" tabindex="0" data-act="goSettings"><h3>Settings</h3></div>
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
      PB.toast('Save loaded');
    } catch (e) { console.error(e); PB.toast('Load failed: ' + e.message, 4000); }
  };
  A.newMain = () => UI.go('new', { mode: 'main' });
  A.newFantasy = () => UI.go('new', { mode: 'fantasy' });

  // ---------- new game ----------
  S.new = {
    back() { UI.go('menu', {}, true); },
    render(p) {
      const fan = p.mode === 'fantasy';
      return `<div class="panel" style="max-width:640px;margin:20px auto">
        <h2>${fan ? 'New Fantasy Draft' : 'New Main Mode Game'}</h2>
        <div class="col">
          <label>City <input type="text" id="ng-city" value="Pallet Town" maxlength="22"></label>
          <label>Team name <input type="text" id="ng-nick" value="Trainers" maxlength="22"></label>
          <label>Seed <input type="text" id="ng-seed" placeholder="random"></label>
          <label>Difficulty <select id="ng-diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option><option value="legend">Legend</option></select></label>
          <label>League teams <select id="ng-teams">${[30, 24, 18, 12].filter(n => n * 12 <= PB.MONS.length).map(n => `<option value="${n}" ${n === 30 ? 'selected' : ''}>${n} teams</option>`).join('')}</select></label>
          ${fan ? `<label>Your draft position <select id="ng-pos"><option value="r">Random</option>${Array.from({ length: 30 }, (_, i) => `<option value="${i}">#${i + 1}</option>`).join('')}</select></label>` : ''}
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
          <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-change="setOptNum" data-k="volume"></label>
          <label><input type="checkbox" ${s.sfx ? 'checked' : ''} data-change="setOptBool" data-k="sfx"> Sound effects</label>
          <label><input type="checkbox" ${s.shotMeter ? 'checked' : ''} data-change="setOptBool" data-k="shotMeter"> Shot timing meter</label>
          <label>Camera <select data-change="setOpt" data-k="camera"><option value="behind" ${s.camera !== 'broadcast' ? 'selected' : ''}>2K (behind the play)</option><option value="broadcast" ${s.camera === 'broadcast' ? 'selected' : ''}>Broadcast (sideline)</option></select></label>
          <label><input type="checkbox" ${document.fullscreenElement ? 'checked' : ''} data-change="toggleFs"> Fullscreen</label>
          <h3 style="margin-top:8px">Show</h3>
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
  A.setOpt = (el, d) => { PB.settings[d.k] = el.value; persist(); };
  A.setOptNum = (el, d) => { PB.settings[d.k] = +el.value; persist(); };
  A.setOptBool = (el, d) => { PB.settings[d.k] = el.checked; persist(); };
  A.toggleFs = (el) => { if (el.checked) document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); else document.exitFullscreen && document.exitFullscreen(); };
  A.setDz = el => { PB.Input.deadzone = +el.value; PB.Input.saveConfig(); };
  A.setSens = el => { PB.Input.sens = +el.value; PB.Input.saveConfig(); };
  A.resetControls = () => { PB.Input.resetConfig(); UI.refresh(); };
  A.rebindKey = (el, d) => { el.textContent = 'press a key…'; PB.Input.rebind = { kind: 'key', action: d.a, cb: () => UI.refresh() }; };
  A.rebindPad = (el, d) => { PB.Input._rbWait = true; el.textContent = 'press a button…'; PB.Input.rebind = { kind: 'pad', action: d.a, cb: () => UI.refresh() }; };
})(window.PB);
