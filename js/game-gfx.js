// Court graphics: the sprite cache, the 3D camera and projection, the arena (bowl, crowd, floor, boards) and the shot meter. ui-game.js owns the match loop
// and calls these; it hands over the live match and frame time through GFX.getMatch / GFX.getDt.
(function (PB) {
  const UI = PB.UI, GFX = PB.GFX = {};
  const W = 94, H = 50;
  const spriteCache = {};
  function sprite(m) {
    let e = spriteCache[m.id];
    if (!e) {
      e = spriteCache[m.id] = { complete: false, naturalWidth: 0 };          // a placeholder until the picture is ready
      const single = () => { const im = new Image(); im.onload = () => { im.bounds = opaqueBounds(im); im.big = upscale(im, im.bounds); spriteCache[m.id] = im; }; im.onerror = () => { im.onerror = null; im.src = m.remote; }; im.src = m.sprite; };
      if (PB.Atlas) PB.Atlas.crop(m).then(c => {
        if (!c) { single(); return; }
        c.complete = true; c.naturalWidth = c.width; c.naturalHeight = c.height; c.bounds = opaqueBounds(c); c.big = upscale(c, c.bounds); spriteCache[m.id] = c;
      }); else single();
    }
    return e;
  }
  function upscale(img, bd) {
    try {
      const k = 4, c = document.createElement('canvas'); c.width = bd.w * k; c.height = bd.h * k;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      g.drawImage(img, bd.x, bd.y, bd.w, bd.h, 0, 0, c.width, c.height);
      return c;
    } catch (err) { return null; }
  }
  // draw a sprite with its feet at (x, y) and visible height dh (pixels)
  function drawSprite(g, mon, x, y, dh, flip) {
    const img = sprite(mon);
    if (!(img.complete && img.naturalWidth)) return false;
    if (!img.bounds) img.bounds = opaqueBounds(img);
    if (img.big === undefined) img.big = upscale(img, img.bounds);
    const bd = img.bounds, dw = dh * bd.w / bd.h;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    if (flip) { g.save(); g.translate(x, y); g.scale(-1, 1); x = 0; y = 0; }
    if (img.big) g.drawImage(img.big, x - dw / 2, y - dh, dw, dh);
    else g.drawImage(img, bd.x, bd.y, bd.w, bd.h, x - dw / 2, y - dh, dw, dh);
    if (flip) g.restore();
    return true;
  }
  // visible (non-transparent) box of a sprite so feet sit on the floor and sizes are consistent
  function opaqueBounds(img) {
    const w = img.naturalWidth, h = img.naturalHeight;
    try {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) return { x: 0, y: 0, w, h };
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (err) { return { x: 0, y: 0, w, h }; }
  }

  // ---------- camera ----------
  const cam = { fx: 47, fy: 25, init: false, yaw: 0 };
  const V = {
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  function updateCamera(w, h, dt) {
    const m = GFX.getMatch();
    const ball = m.ball;
    let tx = ball.x, ty = ball.y;
    // which way the offense attacks: camera always sits behind the team with the ball
    let off = m.poss;
    if (m.phase === 'ft' && m.ft) { off = m.ft.side; tx = PB.Court.ATTACK_X(off) - PB.Court.DIR(off) * 15; ty = 25; }
    // possession change: wait until it's real, then swivel around the ball (short-radius turn, no fade)
    const targetDir = PB.Court.DIR(off);
    if (!cam.init) { cam.dir = targetDir; cam.turn = null; }
    if (targetDir !== cam.dir && !cam.turn) { cam.pend = (cam.pend || 0) + dt; if (cam.pend > 0.3 || m.phase === 'inbound' || m.phase === 'ft') { cam.turn = { u: 0, from: cam.dir }; cam.turnSide = (cam.fy < 25 ? 1 : -1) * cam.dir; cam.dir = targetDir; cam.pend = 0; } }
    else if (targetDir === cam.dir) cam.pend = 0;
    const k = cam.init ? Math.min(1, dt * 2.6) : 1;
    cam.init = true;
    cam.fx += (tx - cam.fx) * k; cam.fy += (ty - cam.fy) * k;
    // settled 2K view for an offense attacking in direction `dirx`
    const settled = dirx => {
      const base = dirx > 0 ? 0 : W;
      const ballA = PB.clamp((cam.fx - base) * dirx, -2, 92);
      // trail closer in the backcourt, farther (framing the half court) in the frontcourt
      const deep = 1 - PB.clamp((ballA - 4) / 14, 0, 1);              // 1 = ball at/behind own baseline (inbound)
      const trail = (18 + 12 * PB.clamp((ballA - 15) / 35, 0, 1)) * (1 - deep) + 27 * deep;
      const camA = Math.max(-29, Math.min(ballA - trail, 50));
      const tgtA = (ballA + (88.75 - ballA) * 0.55) * (1 - deep) + (ballA + 30) * deep;
      const cy = 25 + (cam.fy - 25) * 0.3, ty2 = 25 + (cam.fy - 25) * 0.5;
      return { C: [base + camA * dirx, cy, 24], T: [base + tgtA * dirx, ty2, 0] };
    };
    let C, T, F;
    if (PB.settings.camera === 'broadcast') {
      const fx = PB.clamp(cam.fx, 20, 74);
      C = [fx, -40, 33]; T = [fx, 25 + (cam.fy - 25) * 0.25, 0]; F = h * 1.22;
      cam.turn = null;
    } else {
      F = h * 0.98;
      const to = settled(cam.dir);
      if (cam.turn) {
        // swivel: orbit the ball from the old offense's side to the new one, interpolating angle and radius
        // (radius tightens mid-turn) so the camera turns around the play instead of flying across the court
        cam.turn.u = Math.min(1, cam.turn.u + dt / 1.1);
        const u = cam.turn.u, e = u * u * (3 - 2 * u);
        const from = settled(cam.turn.from);
        const P = [cam.fx, cam.fy];
        const polar = q => ({ a: Math.atan2(q[1] - P[1], q[0] - P[0]), r: Math.hypot(q[0] - P[0], q[1] - P[1]) });
        const c0 = polar(from.C), c1 = polar(to.C), t0 = polar(from.T), t1 = polar(to.T);
        const lerpA = (a0, a1) => { let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; if (Math.abs(Math.abs(d) - Math.PI) < 0.3) d = Math.PI * (cam.turnSide || 1); return a0 + d * e; };
        const squeeze = 1 - 0.5 * Math.sin(Math.PI * e);
        const ca = lerpA(c0.a, c1.a), cr = (c0.r + (c1.r - c0.r) * e) * squeeze;
        const ta = lerpA(t0.a, t1.a), tr = t0.r + (t1.r - t0.r) * e;
        C = [P[0] + Math.cos(ca) * cr, P[1] + Math.sin(ca) * cr, 24 - 3 * Math.sin(Math.PI * e)];
        T = [P[0] + Math.cos(ta) * tr, P[1] + Math.sin(ta) * tr, 0];
        if (u >= 1) cam.turn = null;
      } else { C = to.C; T = to.T; }
    }
    const f = V.norm(V.sub(T, C));
    const r = V.norm(V.cross(f, [0, 0, 1]));
    const u = V.cross(r, f);
    cam.C = C; cam.f = f; cam.r = r; cam.u = u; cam.F = F; cam.cx = w / 2; cam.cy = h * 0.42;
    const fl = Math.hypot(f[0], f[1]) || 1;
    cam.fwd = [f[0] / fl, f[1] / fl]; cam.right = [r[0], r[1]];
  }
  const NEAR = 1.0;
  function toCam(x, y, z) { const d = [x - cam.C[0], y - cam.C[1], z - cam.C[2]]; return [V.dot(d, cam.r), V.dot(d, cam.u), V.dot(d, cam.f)]; }
  function projC(c) { return [cam.cx + c[0] / c[2] * cam.F, cam.cy - c[1] / c[2] * cam.F]; }
  function proj(x, y, z) { const c = toCam(x, y, z); if (c[2] < NEAR) return null; const p = projC(c); p.push(c[2]); return p; }
  function clipPoly(cs) {
    const out = [];
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length];
      const ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
    }
    return out;
  }
  function polyPath(g, pts3) {
    const cs = clipPoly(pts3.map(p => toCam(p[0], p[1], p[2] || 0)));
    if (cs.length < 3) return false;
    g.beginPath();
    cs.forEach((c, i) => { const p = projC(c); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
    g.closePath(); return true;
  }
  function fillPoly(g, pts3, fill) { if (polyPath(g, pts3)) { g.fillStyle = fill; g.fill(); } }
  function strokeLine(g, pts3, color, wFt, closed) {
    g.strokeStyle = color; g.lineCap = 'round';
    const n = pts3.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = toCam(...pts3[i]), b = toCam(...pts3[(i + 1) % n]);
      if (a[2] < NEAR && b[2] < NEAR) continue;
      let A2 = a, B2 = b;
      if (a[2] < NEAR) { const t = (NEAR - a[2]) / (b[2] - a[2]); A2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]; }
      if (b[2] < NEAR) { const t = (NEAR - b[2]) / (a[2] - b[2]); B2 = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t, NEAR]; }
      const pa = projC(A2), pb = projC(B2);
      g.lineWidth = Math.max(1, wFt * cam.F / ((A2[2] + B2[2]) / 2));
      g.beginPath(); g.moveTo(pa[0], pa[1]); g.lineTo(pb[0], pb[1]); g.stroke();
    }
  }
  const arc = (cx, cy, r, a0, a1, n, z) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z || 0.02]); } return out; };

  // court geometry (world feet), built once
  const LINES = (function () {
    const L = [];
    L.push({ p: [[0, 0, .02], [W, 0, .02], [W, H, .02], [0, H, .02]], closed: true });
    L.push({ p: [[47, 0, .02], [47, H, .02]] });
    L.push({ p: arc(47, 25, 6, 0, Math.PI * 2, 40), closed: true });
    L.push({ p: arc(47, 25, 2, 0, Math.PI * 2, 20), closed: true });
    for (const left of [true, false]) {
      const X = x => left ? x : W - x, bx = left ? 5.25 : W - 5.25, s = left ? 1 : -1;
      L.push({ p: [[X(0), 17, .02], [X(19), 17, .02], [X(19), 33, .02], [X(0), 33, .02]] });
      L.push({ p: arc(X(19), 25, 6, 0, Math.PI * 2, 36), closed: true });
      L.push({ p: arc(bx, 25, 4, left ? -Math.PI / 2 : Math.PI / 2, left ? Math.PI / 2 : Math.PI * 1.5, 16) });
      const ang = Math.acos((14 - 5.25) / 23.75);
      L.push({ p: [[X(0), 3, .02], [X(14), 3, .02]] }); L.push({ p: [[X(0), 47, .02], [X(14), 47, .02]] });
      L.push({ p: left ? arc(bx, 25, 23.75, -ang, ang, 40) : arc(bx, 25, 23.75, Math.PI - ang, Math.PI + ang, 40) });
      // lane hash marks
      for (const hx of [7, 8, 11, 14]) { L.push({ p: [[X(hx), 17, .02], [X(hx), 16.2, .02]] }); L.push({ p: [[X(hx), 33, .02], [X(hx), 33.8, .02]] }); }
    }
    return L;
  })();

  // crowd: random fans on four sloped stands
  let CROWD = [];
  // crowd: Pokemon fans fill the lower bowl (they react to big plays); colored fans fill the upper deck
  const crowd = { hype: 0 };
  // the seating bowl is a closed rounded-rectangle ring (superellipse) around the court, so there are no gaps
  // at the corners: lower bowl, a fascia wall, the upper deck, then a back wall up to the roof
  const RING_N = 72;
  function ringPt(i, A, B, z) {
    const t = i / RING_N * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t), e = 2 / 6;
    return [47 + A * Math.sign(c) * Math.pow(Math.abs(c), e), 25 + B * Math.sign(sn) * Math.pow(Math.abs(sn), e), z];
  }
  const BOWL = { lowIn: [57, 32, 0], lowOut: [84, 58, 19], fasciaTop: [84, 58, 24], upIn: [86, 60, 24], upOut: [104, 78, 42], roof: [104, 78, 62] };
  function buildCrowd() {
    const r = new PB.RNG(1234); CROWD = [];
    const hues = ['#e0e0e0', '#c94a4a', '#3b6fd8', '#f0c040', '#3a3a3a', '#7a4fbf', '#2a9d6a', '#d97a2b', '#ffffff', '#555f75'];
    const skins = ['#c99a78', '#8d5a3b', '#e6c3a0', '#5c3a26', '#b07a52'];
    const rows = (inn, out, nRows, upper) => {
      for (let row = 0; row < nRows; row++) {
        const u = (row + 0.5) / nRows;
        const A = inn[0] + (out[0] - inn[0]) * u, B = inn[1] + (out[1] - inn[1]) * u, z = inn[2] + (out[2] - inn[2]) * u;
        // seats are spaced evenly by arc length (the ring's angle parameter bunches points near the corners)
        const SAMP = 1440, pts = [], cum = [0];
        for (let i = 0; i <= SAMP; i++) pts.push(ringPt(i / SAMP * RING_N, A, B, z + 0.9));
        for (let i = 1; i <= SAMP; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        const per = cum[SAMP], seat = 2.4, n = Math.floor(per / seat), off = r.next() * seat;
        let j = 1;
        for (let k = 0; k < n; k++) {
          const want = off + k * seat;
          while (j < SAMP && cum[j] < want) j++;
          if (r.chance(0.08)) continue;                     // empty seats
          const f = (want - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
          const p = [pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * f, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * f, z + 0.9];
          CROWD.push({ x: p[0], y: p[1], z: p[2], col: r.pick(hues), skin: r.pick(skins), a: 0.7 + r.next() * 0.3, ph: r.next() * 6.28, upper });
        }
      }
    };
    rows(BOWL.lowIn, BOWL.lowOut, 12, false);
    rows(BOWL.upIn, BOWL.upOut, 8, true);
    crowd.hype = 0;
  }
  // big plays get the building going (home buckets get the loudest reaction)
  function hypeCrowd(kind, side) {
    const homeSide = GFX.getMatch().userHome ? 0 : 1;
    const amt = kind === 'dunk' ? 1 : kind === 'three' ? 0.9 : kind === 'block' ? 0.8 : kind === 'steal' ? 0.6 : 0.3;
    crowd.hype = Math.min(1, Math.max(crowd.hype, amt * (side === homeSide ? 1 : 0.55)));
  }

  // box with back-face culling (convex, so no sorting needed); returns visible faces
  function drawBox(g, x0, x1, y0, y1, z0, z1, top, side, front) {
    const faces = [
      { n: [0, 0, 1], p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c: top },
      { n: [-1, 0, 0], p: [[x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], c: side },
      { n: [1, 0, 0], p: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], c: side },
      { n: [0, -1, 0], p: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c: front || side },
      { n: [0, 1, 0], p: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c: front || side },
      { n: [0, 0, -1], p: [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], c: side },
    ];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    const vis = [];
    for (const f of faces) {
      const fc = [cx + f.n[0] * (x1 - x0) / 2, cy + f.n[1] * (y1 - y0) / 2, cz + f.n[2] * (z1 - z0) / 2];
      const v = [cam.C[0] - fc[0], cam.C[1] - fc[1], cam.C[2] - fc[2]];
      if (v[0] * f.n[0] + v[1] * f.n[1] + v[2] * f.n[2] > 0) { fillPoly(g, f.p, f.c); vis.push(f); }
    }
    return vis;
  }
  // text painted onto a world-space quad (origin, end of the u edge, end of the v edge); affine approximation
  function quadText(g, o3, u3, v3, lines) {
    const o = proj(...o3), u = proj(...u3), v = proj(...v3);
    if (!o || !u || !v) return;
    const lu = Math.hypot(u3[0] - o3[0], u3[1] - o3[1], u3[2] - o3[2]), lv = Math.hypot(v3[0] - o3[0], v3[1] - o3[1], v3[2] - o3[2]);
    g.save();
    g.setTransform((u[0] - o[0]) / lu, (u[1] - o[1]) / lu, (v[0] - o[0]) / lv, (v[1] - o[1]) / lv, o[0], o[1]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((ln, i) => { g.font = `900 ${ln.size}px Segoe UI, sans-serif`; g.fillStyle = ln.color || '#ffffff'; g.fillText(ln.t, lu / 2, lv * (i + 1) / (lines.length + 1)); });
    g.restore();
  }

  function drawArena(g, m, w, h, home, homeCol) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#04060b'); bg.addColorStop(0.5, '#080b14'); bg.addColorStop(1, '#0a0e18');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (const lx of [0.15, 0.38, 0.62, 0.85]) { const rg = g.createRadialGradient(w * lx, 0, 0, w * lx, 0, h * 0.45); rg.addColorStop(0, 'rgba(255,244,214,.20)'); rg.addColorStop(1, 'rgba(255,244,214,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h * 0.5); }
    const bcast = PB.settings.camera === 'broadcast';
    const gq = PB.settings.gfx || 'high', hi = gq === 'high', lo = gq === 'low';      // graphics detail: high = everything, medium = no roof / banners / floor planks, low = also no upper deck, fans or jumbotron
    // a band between two rings (inner -> outer); near-side sections are skipped on the broadcast camera
    const band = (inn, out, colA, colB, aisle) => {
      for (let i = 0; i < RING_N; i++) {
        const p0 = ringPt(i, inn[0], inn[1], inn[2]), p1 = ringPt(i + 1, inn[0], inn[1], inn[2]);
        const q1 = ringPt(i + 1, out[0], out[1], out[2]), q0 = ringPt(i, out[0], out[1], out[2]);
        if (bcast && (p0[1] + p1[1]) / 2 < 0) continue;
        fillPoly(g, [p0, p1, q1, q0], i % 2 ? colA : colB);
        if (aisle && i % 9 === 0) strokeLine(g, [p0, q0], 'rgba(255,255,255,.10)', 0.5);
      }
    };
    // back wall + roof edge (draw farthest surfaces first)
    if (!lo) band([BOWL.upOut[0], BOWL.upOut[1], BOWL.upOut[2]], [BOWL.roof[0], BOWL.roof[1], BOWL.roof[2]], '#0b0f19', '#0d121d');
    if (!lo) band(BOWL.upIn, BOWL.upOut, '#121a2a', '#141c2d', true);                    // upper deck seating
    band([BOWL.lowOut[0], BOWL.lowOut[1], 19], [BOWL.fasciaTop[0], BOWL.fasciaTop[1], 24], homeCol[0], shade(homeCol[0], -0.15));   // LED fascia
    // lip connecting fascia top to the upper deck front
    band([BOWL.fasciaTop[0], BOWL.fasciaTop[1], 24], [BOWL.upIn[0], BOWL.upIn[1], 24], '#0a0e18', '#0a0e18');
    band(BOWL.lowIn, BOWL.lowOut, '#182035', '#1a2339', true);                  // lower bowl seating
    // lower-bowl front wall down to the apron (hides the gap between seats and floor)
    band([BOWL.lowIn[0], BOWL.lowIn[1], 0], [BOWL.lowIn[0], BOWL.lowIn[1], 1.2], '#0d1424', '#0d1424');
    // roof: lighting truss over the court
    if (hi) {
    const truss = [[18, 4, 58], [76, 4, 58], [76, 46, 58], [18, 46, 58]];
    strokeLine(g, truss, '#2a3346', 0.6, true);
    strokeLine(g, [[18, 25, 58], [76, 25, 58]], '#2a3346', 0.5);
    for (let x = 22; x <= 72; x += 6) for (const y of [4, 46]) { const q = proj(x, y, 57.4); if (q) { const r = Math.max(1.5, 0.9 * cam.F / q[2]); const gl = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r * 3); gl.addColorStop(0, 'rgba(255,248,225,.95)'); gl.addColorStop(1, 'rgba(255,248,225,0)'); g.fillStyle = gl; g.fillRect(q[0] - r * 3, q[1] - r * 3, r * 6, r * 6); } }
    }
    // banners hanging from the roof behind each baseline
    if (hi) for (const bx of [-30, 124]) for (let i = 0; i < 5; i++) {
      const y = 5 + i * 10, col = i % 2 ? homeCol[0] : (homeCol[1] === '#ffffff' ? '#e8e8e8' : homeCol[1]);
      fillPoly(g, [[bx, y, 44], [bx, y + 6, 44], [bx, y + 6, 52], [bx, y, 52]], col);
      fillPoly(g, [[bx, y + 0.6, 45.2], [bx, y + 5.4, 45.2], [bx, y + 5.4, 45.8], [bx, y + 0.6, 45.8]], 'rgba(0,0,0,.25)');
    }
    // generic fans (cheap: two rects each), they jump on big plays
    crowd.hype = Math.max(0, crowd.hype - GFX.getDt() * 0.45);
    const t = m.t;
    if (!lo) for (const p of CROWD) {
      if (bcast && p.y < 0) continue;
      const jump = crowd.hype * (p.upper ? 0.8 : 1.3) * Math.abs(Math.sin(p.ph + t * 10)) + 0.05 * Math.sin(p.ph + t * 1.7);
      const q = proj(p.x, p.y, p.z + jump); if (!q || q[2] < 10) continue;
      const sz = Math.max(1, 0.6 * cam.F / q[2]);
      g.globalAlpha = p.a;
      g.fillStyle = p.col; g.fillRect(q[0] - sz * 0.6, q[1] - sz * 0.9, sz * 1.2, sz * 1.3);
      g.fillStyle = p.skin; g.fillRect(q[0] - sz * 0.35, q[1] - sz * 1.6, sz * 0.7, sz * 0.7);
    }
    g.globalAlpha = 1;
    // jumbotron over center court
    if (!lo) {
      const vis = drawBox(g, 40, 54, 19, 31, 40, 48, '#11151f', '#1b2233', '#1b2233');
      const cl = Math.max(0, m.clock), mm = Math.floor(cl / 60), ss = Math.floor(cl - mm * 60);
      const hyped = crowd.hype > 0.5;
      const lines = hyped ? [{ t: 'WHAT A PLAY!', size: 1.8 }] : [{ t: m.teams[0].abbr + '  ' + m.sc(0) + '  –  ' + m.sc(1) + '  ' + m.teams[1].abbr, size: 1.4 }, { t: (m.q <= 4 ? 'Q' + m.q : 'OT') + '   ' + mm + ':' + String(ss).padStart(2, '0'), size: 1.2, color: '#ffd23f' }];
      for (const f of vis) {
        if (f.n[2] !== 0) continue;
        const P = f.p, ins = (pa, pb, k) => [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k];
        const s0 = ins(P[0], P[1], 0.06), s1 = ins(P[0], P[1], 0.94);
        fillPoly(g, [[s0[0], s0[1], 41], [s1[0], s1[1], 41], [s1[0], s1[1], 47], [s0[0], s0[1], 47]], hyped ? homeCol[0] : '#0b2a4a');
        const sx = (s1[0] - s0[0]) * cam.r[0] + (s1[1] - s0[1]) * cam.r[1];
        const Lp = sx >= 0 ? s0 : s1, Rp = sx >= 0 ? s1 : s0;
        quadText(g, [Lp[0], Lp[1], 47], [Rp[0], Rp[1], 47], [Lp[0], Lp[1], 41], lines);
      }
      strokeLine(g, [[44, 25, 48], [44, 25, 62]], '#222a3a', 0.25); strokeLine(g, [[50, 25, 48], [50, 25, 62]], '#222a3a', 0.25);
    }
    // apron in a darker home color, LED boards along both sidelines
    fillPoly(g, [[-7, -5, 0], [101, -5, 0], [101, 55, 0], [-7, 55, 0]], shade(homeCol[0], -0.45));
    for (const y of [-4.6, 54.6]) {
      fillPoly(g, [[-6, y, 0], [100, y, 0], [100, y, 2.2], [-6, y, 2.2]], '#0d1a35');
      fillPoly(g, [[-6, y, 0.4], [100, y, 0.4], [100, y, 1.8], [-6, y, 1.8]], homeCol[0]);
    }
  }

  // courtside props that can overlap players (depth-sorted with them): scorer's table and both benches,
  // with each team's actual bench Pokemon sitting there
  function courtsideItems(m, items) {
    const homeCol = PB.teamColors(m.teams[m.userHome ? 0 : 1]);
    const tp = proj(47, -3.6, 1);
    if (tp) items.push({ d: tp[2], kind: 'prop', draw: g => {
      const vis = drawBox(g, 40, 54, -4.4, -2.6, 0, 2.6, '#1a2030', '#121826', '#0b1220');
      for (const f of vis) if (f.n[1] === 1) {
        fillPoly(g, [[40.4, -2.6, 0.5], [53.6, -2.6, 0.5], [53.6, -2.6, 2.1], [40.4, -2.6, 2.1]], homeCol[0]);
        const sx = cam.r[0] > 0 ? 1 : -1;
        quadText(g, [sx > 0 ? 40.4 : 53.6, -2.6, 2.1], [sx > 0 ? 53.6 : 40.4, -2.6, 2.1], [sx > 0 ? 40.4 : 53.6, -2.6, 0.5], [{ t: 'POKÉHOOPS', size: 1.1 }]);
      }
    } });
    [0, 1].forEach(s => {
      const x0 = s === 0 ? 22 : 58, sd = m.gs(s);
      const bp = proj(x0 + 7, -4.2, 0); if (!bp) return;
      items.push({ d: bp[2] + 0.1, kind: 'prop', draw: g => {
        drawBox(g, x0, x0 + 14, -5.2, -3.6, 0, 1.6, '#2a3348', '#1c2333', '#1c2333');
        sd.bench.slice(0, 7).forEach((pl, i) => {
          const q = proj(x0 + 1 + i * 2, -4.4, 1.2); if (!q) return;
          const dh = (2.4 + 2.2 * pl.mon.r.sH) * cam.F / q[2];
          const hop = crowd.hype * 0.5 * Math.abs(Math.sin(m.t * 9 + i)) * cam.F / q[2];
          drawSprite(g, pl.mon, q[0], q[1] - hop, dh, false);
        });
      } });
    });
  }


  // shot meter skins (Settings or the pause menu): bar, ring, line, orb
  const METER_COLORS = { classic: { fill: '#ffffff', good: '#2fd47a', ok: '#7d6b14', bg: '#26324a' }, neon: { fill: '#7df9ff', good: '#b6ff3b', ok: '#3a5a7a', bg: '#101c33' }, fire: { fill: '#ffb347', good: '#ff4d4d', ok: '#7a4a14', bg: '#2a1a14' }, royal: { fill: '#d9b8ff', good: '#ffd23f', ok: '#4a3a7a', bg: '#1b1640' } };
  function drawMeter(g, mb, mv, win) {
    const sc = mb._scr, SW = PB.Match.consts.SWEET, skin = PB.settings.meterSkin || 'bar', C = METER_COLORS[PB.settings.meterColor] || METER_COLORS.classic;
    const inGreen = Math.abs(mv - SW) <= win.gw, fillCol = inGreen ? C.good : C.fill;
    g.save();
    if (skin === 'ring' || skin === 'orb') {
      const r = Math.max(15, sc.sz * 0.2), cx = sc.x, cy = sc.y - sc.sz * 0.08;
      const ang = v => -Math.PI / 2 + Math.min(1.1, v) / 1.1 * Math.PI * 2;
      g.lineCap = 'butt';
      if (skin === 'ring') {
        g.lineWidth = Math.max(6, r * 0.34); g.strokeStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = C.bg; g.lineWidth -= 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = C.ok; g.beginPath(); g.arc(cx, cy, r, ang(SW - win.yw), ang(SW + win.yw)); g.stroke();
        g.strokeStyle = C.good; g.beginPath(); g.arc(cx, cy, r, ang(SW - win.gw), ang(SW + win.gw)); g.stroke();
        g.strokeStyle = fillCol; g.globalAlpha = 0.9; g.lineWidth = Math.max(3, r * 0.14); g.beginPath(); g.arc(cx, cy, r, ang(0), ang(mv)); g.stroke();
      } else {
        g.fillStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.arc(cx, cy, r + 3, 0, Math.PI * 2); g.fill();
        g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
        g.fillStyle = C.bg; g.fillRect(cx - r, cy - r, r * 2, r * 2);
        const Y = v => cy + r - Math.min(1.1, v) / 1.1 * r * 2;
        g.fillStyle = C.ok; g.fillRect(cx - r, Y(SW + win.yw), r * 2, Y(SW - win.yw) - Y(SW + win.yw));
        g.fillStyle = C.good; g.fillRect(cx - r, Y(SW + win.gw), r * 2, Y(SW - win.gw) - Y(SW + win.gw));
        g.fillStyle = fillCol; g.globalAlpha = 0.8; g.fillRect(cx - r, Y(mv), r * 2, cy + r - Y(mv)); g.globalAlpha = 1;
        g.restore();
        g.strokeStyle = '#f5f5f5'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.moveTo(cx - r, cy); g.lineTo(cx + r, cy); g.stroke();
      }
    } else if (skin === 'line') {
      const bw = Math.max(70, sc.sz * 0.8), bh = Math.max(8, bw * 0.1), x = sc.x - bw / 2, y = sc.y + 8;
      const X = v => x + Math.min(1.1, v) / 1.1 * bw;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      g.fillStyle = C.bg; g.fillRect(x, y, bw, bh);
      g.fillStyle = C.ok; g.fillRect(X(SW - win.yw), y, X(SW + win.yw) - X(SW - win.yw), bh);
      g.fillStyle = C.good; g.fillRect(X(SW - win.gw), y, X(SW + win.gw) - X(SW - win.gw), bh);
      g.fillStyle = fillCol; g.globalAlpha = 0.9; g.fillRect(x, y + bh * 0.25, X(mv) - x, bh * 0.5); g.globalAlpha = 1;
    } else {
      const bh = Math.max(70, sc.sz * 0.75), bw = Math.max(9, bh * 0.12);
      const x = sc.x + sc.sz * 0.42, y = sc.y + sc.sz * 0.1;
      const Y = v => y + bh - Math.min(1.1, v) / 1.1 * bh;
      g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      g.fillStyle = C.bg; g.fillRect(x, y, bw, bh);
      g.fillStyle = C.ok; g.fillRect(x, Y(SW + win.yw), bw, Y(SW - win.yw) - Y(SW + win.yw));
      g.fillStyle = C.good; g.fillRect(x, Y(SW + win.gw), bw, Y(SW - win.gw) - Y(SW + win.gw));
      g.fillStyle = fillCol; g.globalAlpha = 0.85; g.fillRect(x + 2, Y(mv), bw - 4, y + bh - Y(mv)); g.globalAlpha = 1;
    }
    g.restore();
  }
  UI.meterSkins = { bar: 'Vertical bar', ring: 'Ring', line: 'Horizontal line', orb: 'Orb' };
  UI.meterColors = { classic: 'Classic', neon: 'Neon', fire: 'Fire', royal: 'Royal' };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); gg = Math.round((t - gg) * p + gg); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (gg << 8) + b).toString(16).slice(1);
  }

  // distinct colors for the two teams on the floor (rings + score bug)
  function hexDist(a, b) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.hypot((x >> 16) - (y >> 16), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255)); }
  Object.assign(GFX, { spriteCache, sprite, upscale, drawSprite, opaqueBounds, cam, V, updateCamera, NEAR, toCam, projC, proj, clipPoly, polyPath, fillPoly, strokeLine, arc, LINES, CROWD, crowd, RING_N, ringPt, BOWL, buildCrowd, hypeCrowd, drawBox, quadText, drawArena, courtsideItems, METER_COLORS, drawMeter, shade, hexDist });
})(window.PB);
