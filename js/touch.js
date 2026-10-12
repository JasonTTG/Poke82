// On-screen controls for phones and tablets during games: floating move stick, drag-anywhere right stick for dribble
// moves, action buttons. Feeds the same virtual pad as the keyboard and gamepad (PB.Input.touch).
(function (PB) {
  const T = PB.Touch = { el: null, shown: false };
  const I = PB.Input;
  I.touch = { active: false, lx: 0, ly: 0, rx: 0, ry: 0, held: {} };
  const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : null;
  T.wanted = () => { const m = (PB.settings && PB.settings.touchControls) || 'auto'; return m === 'on' || (m === 'auto' && (('ontouchstart' in window) || (mq && mq.matches))); };

  const css = `
  #touch { position: fixed; inset: 0; z-index: 45; display: none; touch-action: none; user-select: none; -webkit-user-select: none; }
  #touch.on { display: block; }
  #touch .tz { position: absolute; touch-action: none; }
  #touch .tb { position: absolute; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; font: 900 18px Segoe UI, sans-serif; color: #fff; background: rgba(20, 28, 46, .55); border: 2px solid rgba(255, 255, 255, .35); touch-action: none; backdrop-filter: blur(2px); }
  #touch .tb.down { background: rgba(255, 203, 5, .55); transform: scale(.94); }
  #touch .tb small { font-size: 10px; font-weight: 700; display: block; opacity: .85; }
  #touch .tb.x { background: rgba(59, 130, 246, .5); } #touch .tb.a { background: rgba(47, 212, 122, .45); } #touch .tb.b { background: rgba(255, 90, 95, .45); } #touch .tb.y { background: rgba(255, 203, 5, .4); }
  #touch .tb.mini { font-size: 13px; background: rgba(20, 28, 46, .6); }
  #touch .knob { position: absolute; border-radius: 50%; background: rgba(255, 255, 255, .28); border: 2px solid rgba(255, 255, 255, .6); pointer-events: none; display: none; }
  #touch .base { position: absolute; border-radius: 50%; border: 2px dashed rgba(255, 255, 255, .3); pointer-events: none; display: none; }
  #rotate { position: fixed; inset: 0; z-index: 46; display: none; background: rgba(5, 8, 15, .92); color: #fff; align-items: center; justify-content: center; text-align: center; font: 700 20px Segoe UI, sans-serif; }
  `;
  const BUTTONS = [
    // id, label, sub, side/position (right/bottom offsets in units of s), size (units of s), class
    ['X', '●', 'shoot', { r: 0.25, b: 0.35 }, 1.25, 'x'], ['A', 'A', 'pass', { r: 1.65, b: 0.2 }, 1, 'a'], ['B', 'B', 'bounce', { r: 1.85, b: 1.35 }, 0.9, 'b'], ['Y', 'Y', 'lob', { r: 0.55, b: 1.75 }, 1, 'y'],
    ['RT', '»', 'sprint', { r: 3.4, b: 0.2 }, 1, 'mini'], ['LT', 'LT', 'post', { r: 3.5, b: 1.5 }, 0.8, 'mini'], ['RB', 'RB', 'icon', { r: 2.6, b: 2.7 }, 0.75, 'mini'], ['LB', 'LB', 'screen', { r: 1.2, b: 3.05 }, 0.75, 'mini'],
  ];
  const TOP = [['START', 'II', { r: 0.2, t: 0.2 }, 0.62], ['BACK', '⏪', { r: 1.0, t: 0.2 }, 0.62]];

  function build() {
    if (T.el) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const el = T.el = document.createElement('div'); el.id = 'touch';
    el.innerHTML = '<div class="tz" id="tz-l"></div><div class="tz" id="tz-r"></div><div class="base" id="tbase-l"></div><div class="knob" id="tknob-l"></div><div class="base" id="tbase-r"></div><div class="knob" id="tknob-r"></div>';
    document.body.appendChild(el);
    const rot = document.createElement('div'); rot.id = 'rotate'; rot.innerHTML = '<div>📱↻<br>Rotate your device to landscape<br><small style="font-weight:400">The court plays best sideways</small></div>'; document.body.appendChild(rot);
    const stick = (zoneId, baseId, knobId, key) => {
      const z = document.getElementById(zoneId), base = document.getElementById(baseId), knob = document.getElementById(knobId);
      let pid = null, cx = 0, cy = 0;
      const R = () => Math.max(46, Math.min(window.innerHeight, window.innerWidth) * 0.11);
      const setv = (x, y) => { I.touch[key + 'x'] = x; I.touch[key + 'y'] = y; };
      z.addEventListener('pointerdown', e => {
        if (pid != null) return; pid = e.pointerId; z.setPointerCapture(pid); e.preventDefault();
        cx = e.clientX; cy = e.clientY; const r = R();
        base.style.cssText = `display:block;width:${r * 2}px;height:${r * 2}px;left:${cx - r}px;top:${cy - r}px`; knob.style.cssText = `display:block;width:${r}px;height:${r}px;left:${cx - r / 2}px;top:${cy - r / 2}px`;
        I.touch.active = true; I.lastSource = 'touch';
      });
      z.addEventListener('pointermove', e => {
        if (e.pointerId !== pid) return; e.preventDefault();
        const r = R(); let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
        if (d > r) { dx = dx / d * r; dy = dy / d * r; }
        knob.style.left = cx + dx - r / 2 + 'px'; knob.style.top = cy + dy - r / 2 + 'px';
        let vx = dx / r, vy = dy / r; const m = Math.hypot(vx, vy);
        if (m < 0.14) { vx = vy = 0; } else { const s = (m - 0.14) / (1 - 0.14) / m; vx *= s; vy *= s; }
        setv(vx, vy);
      });
      const end = e => { if (e.pointerId !== pid) return; pid = null; setv(0, 0); base.style.display = knob.style.display = 'none'; };
      z.addEventListener('pointerup', end); z.addEventListener('pointercancel', end);
    };
    stick('tz-l', 'tbase-l', 'tknob-l', 'l'); stick('tz-r', 'tbase-r', 'tknob-r', 'r');
    const mkBtn = (id, label, sub, pos, size, cls, top) => {
      const b = document.createElement('div'); b.className = 'tb ' + (cls || 'mini'); b.dataset.k = id; b.innerHTML = label + (sub ? '<small>' + sub + '</small>' : '');
      b._pos = pos; b._size = size; b._top = top; el.appendChild(b);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); I.touch.held[id] = true; I.touch.active = true; I.lastSource = 'touch'; b.classList.add('down'); });
      const up = e => { e.stopPropagation(); I.touch.held[id] = false; b.classList.remove('down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      return b;
    };
    BUTTONS.forEach(([id, l, s, p, sz, c]) => mkBtn(id, l, s, p, sz, c, false));
    TOP.forEach(([id, l, p, sz]) => mkBtn(id, l, '', p, sz, 'mini', true));
    window.addEventListener('resize', T.layout); window.addEventListener('orientationchange', () => setTimeout(T.layout, 200));
  }
  T.layout = function () {
    if (!T.el) return;
    const W = window.innerWidth, H = window.innerHeight, s = Math.max(52, Math.min(86, Math.min(W, H) * 0.17));
    const zl = document.getElementById('tz-l'), zr = document.getElementById('tz-r');
    zl.style.cssText = `left:0;top:${H * 0.18}px;width:${W * 0.42}px;height:${H * 0.82}px`;
    zr.style.cssText = `left:${W * 0.42}px;top:${H * 0.12}px;width:${W * 0.58}px;height:${H * 0.88}px;z-index:0`;
    for (const b of T.el.querySelectorAll('.tb')) {
      const sz = s * b._size; b.style.width = b.style.height = sz + 'px'; b.style.zIndex = 2;
      b.style.right = s * b._pos.r + 'px'; b.style[b._top ? 'top' : 'bottom'] = s * (b._top ? b._pos.t : b._pos.b) + 'px';
    }
    const portrait = H > W * 1.05, rot = document.getElementById('rotate');
    if (rot) rot.style.display = T.shown && portrait ? 'flex' : 'none';
  };
  T.show = function () { if (!T.wanted()) return; build(); T.el.classList.add('on'); T.shown = true; I.touch.active = true; T.layout(); };
  T.hide = function () {
    if (!T.el) return; T.el.classList.remove('on'); T.shown = false; I.touch.active = false;
    I.touch.lx = I.touch.ly = I.touch.rx = I.touch.ry = 0; I.touch.held = {};
    const rot = document.getElementById('rotate'); if (rot) rot.style.display = 'none';
  };
})(window.PB);
