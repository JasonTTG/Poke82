// Unified input: Xbox gamepad (Gamepad API) + keyboard -> virtual pad. Menu focus navigation lives here too.
(function (PB) {
  const BTN = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  const DEFAULT_PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const DEFAULT_KEYS = {
    A: ['KeyJ', 'KeyF'], B: ['KeyU', 'KeyG'], X: ['KeyK', 'Space'], Y: ['KeyI', 'KeyR'],
    LB: ['KeyQ'], RB: ['KeyE'], LT: ['ControlLeft', 'KeyC'], RT: ['ShiftLeft', 'ShiftRight'],
    START: ['Escape', 'KeyP'], BACK: ['Tab'],
  };
  const MOVE_KEYS = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };
  const AIM_KEYS = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };

  const I = PB.Input = {
    mode: 'menu',                       // 'menu' | 'game'
    padMap: Object.assign({}, DEFAULT_PAD),
    keyMap: JSON.parse(JSON.stringify(DEFAULT_KEYS)),
    deadzone: 0.18, sens: 1,
    lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0,
    _held: {}, _prev: {}, _pressed: {}, _keys: {}, padConnected: false, padName: '', lastSource: 'keyboard',
    rebind: null,                       // {kind:'pad'|'key', action, cb}
    BTN,
    held(b) { return !!I._held[b]; },
    pressed(b) { return !!I._pressed[b]; },
    released(b) { return !I._held[b] && !!I._prev[b]; },
    loadConfig() {
      try { const c = JSON.parse(localStorage.getItem('poke82_input_v2') || 'null'); if (c) { I.padMap = Object.assign({}, DEFAULT_PAD, c.padMap); I.keyMap = Object.assign(JSON.parse(JSON.stringify(DEFAULT_KEYS)), c.keyMap); I.deadzone = c.deadzone || 0.18; I.sens = c.sens || 1; } } catch (e) { }
    },
    saveConfig() { try { localStorage.setItem('poke82_input_v2', JSON.stringify({ padMap: I.padMap, keyMap: I.keyMap, deadzone: I.deadzone, sens: I.sens })); } catch (e) { } },
    resetConfig() { I.padMap = Object.assign({}, DEFAULT_PAD); I.keyMap = JSON.parse(JSON.stringify(DEFAULT_KEYS)); I.deadzone = 0.18; I.sens = 1; I.saveConfig(); },
    keyLabel(code) { return code.replace('Key', '').replace('Arrow', '').replace('Space', 'Space').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'R-Shift').replace('ControlLeft', 'Ctrl').replace('Escape', 'Esc'); },
  };

  window.addEventListener('keydown', e => {
    if (I.rebind && I.rebind.kind === 'key') {
      e.preventDefault();
      if (e.code !== 'Escape') { I.keyMap[I.rebind.action] = [e.code]; I.saveConfig(); }
      const cb = I.rebind.cb; I.rebind = null; cb && cb(); return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    I._keys[e.code] = true;
    I.lastSource = 'keyboard';
    if (I.mode === 'game') { if (e.code.startsWith('Arrow') || e.code === 'Space' || e.code === 'Tab') e.preventDefault(); }
    else I._menuKey(e);
  });
  window.addEventListener('keyup', e => { I._keys[e.code] = false; });
  window.addEventListener('blur', () => { I._keys = {}; });
  window.addEventListener('gamepadconnected', e => { I.padConnected = true; I.padName = e.gamepad.id; PB.toast && PB.toast('Controller connected'); });
  window.addEventListener('gamepaddisconnected', () => { I.padConnected = false; PB.toast && PB.toast('Controller disconnected'); });

  const dz = (x, y, d) => { const m = Math.hypot(x, y); if (m < d) return [0, 0]; const s = (m - d) / (1 - d) / m; return [x * s, y * s]; };

  // call once per frame BEFORE reading state (menu loop and game loop both call it)
  I.poll = function () {
    I._prev = I._held; I._held = {}; I._pressed = {};
    const k = I._keys;
    const kd = list => list.some(c => k[c]);
    let lx = (kd(MOVE_KEYS.right) ? 1 : 0) - (kd(MOVE_KEYS.left) ? 1 : 0), ly = (kd(MOVE_KEYS.down) ? 1 : 0) - (kd(MOVE_KEYS.up) ? 1 : 0);
    let rx = (kd(AIM_KEYS.right) ? 1 : 0) - (kd(AIM_KEYS.left) ? 1 : 0), ry = (kd(AIM_KEYS.down) ? 1 : 0) - (kd(AIM_KEYS.up) ? 1 : 0);
    const nl = Math.hypot(lx, ly) || 1; if (lx || ly) { lx /= nl; ly /= nl; }
    const nr = Math.hypot(rx, ry) || 1; if (rx || ry) { rx /= nr; ry /= nr; }
    let lt = 0, rt = 0; I.plx = 0; I.ply = 0;
    for (const b of BTN) { const codes = I.keyMap[b]; if (codes && kd(codes)) I._held[b] = true; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null; for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp) {
      I.padConnected = true; I.padName = gp.id;
      const [glx, gly] = dz(gp.axes[0] || 0, gp.axes[1] || 0, I.deadzone);
      const [grx, gry] = dz(gp.axes[2] || 0, gp.axes[3] || 0, I.deadzone);
      let any = false;
      I.plx = glx; I.ply = gly;
      if (glx || gly) { lx = glx; ly = gly; any = true; }
      if (grx || gry) { rx = grx; ry = gry; any = true; }
      for (const name of BTN) {
        const idx = I.padMap[name]; const b = gp.buttons[idx];
        if (b && (b.pressed || b.value > 0.5)) { I._held[name] = true; any = true; }
      }
      // d-pad also available as virtual UP/DOWN/LEFT/RIGHT using fixed standard indices
      if (gp.buttons[12] && gp.buttons[12].pressed) { I._held.UP = true; any = true; }
      if (gp.buttons[13] && gp.buttons[13].pressed) { I._held.DOWN = true; any = true; }
      if (gp.buttons[14] && gp.buttons[14].pressed) { I._held.LEFT = true; any = true; }
      if (gp.buttons[15] && gp.buttons[15].pressed) { I._held.RIGHT = true; any = true; }
      const ltb = gp.buttons[I.padMap.LT], rtb = gp.buttons[I.padMap.RT];
      lt = ltb ? ltb.value : 0; rt = rtb ? rtb.value : 0;
      if (any) I.lastSource = 'pad';
      // rebinding capture for pad
      if (I.rebind && I.rebind.kind === 'pad') {
        for (let i = 0; i < gp.buttons.length; i++) if (gp.buttons[i].pressed && !I._rbWait) { I.padMap[I.rebind.action] = i; I.saveConfig(); const cb = I.rebind.cb; I.rebind = null; I._rbWait = true; cb && cb(); break; }
      }
      if (I._rbWait && !gp.buttons.some(b => b.pressed)) I._rbWait = false;
    }
    if (I._held.LT) lt = Math.max(lt, 1); if (I._held.RT) rt = Math.max(rt, 1);
    I.lx = lx * I.sens; I.ly = ly * I.sens; I.rx = rx; I.ry = ry; I.lt = lt; I.rt = rt;
    if (lt > 0.4) I._held.LT = true; if (rt > 0.4) I._held.RT = true;
    for (const b in I._held) if (!I._prev[b]) I._pressed[b] = true;
    if (I.mode === 'menu') I._menuPad();
  };

  // ---- menu focus navigation ----
  const SEL = 'button:not([disabled]), [data-act]:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex="0"]';
  function focusables() {
    const root = document.querySelector('.modal-layer.open') || document.getElementById('app');
    if (!root) return [];
    return Array.from(root.querySelectorAll(SEL)).filter(el => {
      if (el.closest('[hidden]')) return false;
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return false;
      const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none';
    });
  }
  I.moveFocus = function (dir) {
    const els = focusables(); if (!els.length) return;
    const cur = document.activeElement && els.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) { els[0].focus(); return; }
    const cr = cur.getBoundingClientRect(); const cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === cur) continue;
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      let along, perp;
      if (dir === 'UP') { along = -dy; perp = Math.abs(dx); } else if (dir === 'DOWN') { along = dy; perp = Math.abs(dx); }
      else if (dir === 'LEFT') { along = -dx; perp = Math.abs(dy); } else { along = dx; perp = Math.abs(dy); }
      if (along < 4) continue;
      const sc = along + perp * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) { best.focus({ preventScroll: false }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  };
  I._menuKey = function (e) {
    const t = e.target; const tag = (t.tagName || '').toLowerCase();
    if (tag === 'select' || tag === 'input') { if (e.code === 'Escape') { t.blur(); } return; }
    const m = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', KeyW: 'UP', KeyS: 'DOWN', KeyA: 'LEFT', KeyD: 'RIGHT' }[e.code];
    if (m) { e.preventDefault(); I.moveFocus(m); return; }
    if (e.code === 'Enter' || e.code === 'Space') { if (tag === 'button' || t.getAttribute('data-act') != null || t.getAttribute('tabindex') === '0') { e.preventDefault(); t.click(); } return; }
    if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); PB.UI && PB.UI.back(); }
  };
  let repeatAt = 0, lastDir = null;
  I._menuPad = function () {
    if (I.lastSource !== 'pad' && !I._held.UP && !I._held.DOWN) { /* still allow pad */ }
    const now = performance.now();
    let dir = null;
    if (I._held.UP || I.ply < -0.6) dir = 'UP'; else if (I._held.DOWN || I.ply > 0.6) dir = 'DOWN';
    else if (I._held.LEFT || I.plx < -0.6) dir = 'LEFT'; else if (I._held.RIGHT || I.plx > 0.6) dir = 'RIGHT';
    if (dir) {
      if (dir !== lastDir || now >= repeatAt) { if (!I.rebind) I.moveFocus(dir); repeatAt = now + (dir !== lastDir ? 320 : 130); lastDir = dir; }
    } else lastDir = null;
    if (I.rebind) return;
    const a = I._pressed.A, b = I._pressed.B;
    if (a && I.padConnected) { const el = document.activeElement; if (el && el !== document.body) el.click(); }
    if (b && I.padConnected) PB.UI && PB.UI.back();
    // keyboard Esc already means 'back' in menus (handled on keydown), so only a controller Start triggers onStart here
    const kbStart = (I.keyMap.START || []).some(c => I._keys[c]);
    if (I._pressed.START && !kbStart && PB.UI && PB.UI.onStart) PB.UI.onStart();
    if (I._pressed.X && PB.UI && PB.UI.onX) PB.UI.onX();
    if (I._pressed.Y && PB.UI && PB.UI.onY) PB.UI.onY();
  };

  I.endFrame = function () { };
  I.loadConfig();
  // menu mode loop (game engine runs its own loop and calls poll itself)
  (function loop() {
    if (I.mode === 'menu') I.poll();
    requestAnimationFrame(loop);
  })();
})(window.PB);
