// Generated team logos: a shape (by team), team colors and the abbreviation. One definition drives the HTML (SVG) and canvas drawing.
(function (PB) {
  const star = (() => { let d = ''; for (let i = 0; i < 10; i++) { const r = i % 2 ? 22 : 48, a = -Math.PI / 2 + i * Math.PI / 5; d += (i ? 'L' : 'M') + (50 + Math.cos(a) * r).toFixed(1) + ' ' + (52 + Math.sin(a) * r).toFixed(1); } return d + 'Z'; })();
  const PATHS = {
    shield: 'M50 4 L92 18 L92 52 Q92 80 50 96 Q8 80 8 52 L8 18 Z',
    circle: 'M50 4 A46 46 0 1 1 49.9 4 Z',
    hex: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27 Z',
    diamond: 'M50 2 L96 50 L50 98 L4 50 Z',
    badge: 'M10 12 H90 V62 Q90 84 50 96 Q10 84 10 62 Z',
    star,
    bolt: 'M58 2 L18 56 H44 L36 98 L82 40 H55 Z',
  };
  const NAMES = Object.keys(PATHS);
  const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const dist = (a, b) => { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); return Math.hypot((x >> 16) - (y >> 16), ((x >> 8) & 255) - ((y >> 8) & 255), (x & 255) - (y & 255)); };
  const L = PB.Logo = {
    spec(t) {
      const col = PB.teamColors(t);
      let c1 = col[0], c2 = col[1];
      if (dist(c1, c2) < 90) c2 = lum(c1) > 0.5 ? '#101828' : '#ffffff';
      const shape = NAMES[(t.id * 5 + (t.nick || '').length * 3 + (t.city || '').length) % NAMES.length];
      return { shape, path: PATHS[shape], c1, c2, txt: lum(c1) > 0.58 ? '#101828' : '#ffffff', abbr: (t.abbr || '???').slice(0, 3) };
    },
    svg(t, size) {
      const s = L.spec(t), fs = s.abbr.length > 2 ? 30 : 36;
      return `<svg class="logo" viewBox="0 0 100 100" width="${size || 20}" height="${size || 20}" style="vertical-align:middle"><path d="${s.path}" fill="${s.c1}" stroke="${s.c2}" stroke-width="7" stroke-linejoin="round"/><text x="50" y="${s.shape === 'bolt' ? 60 : 62}" text-anchor="middle" font-family="Segoe UI, Arial Black, sans-serif" font-weight="900" font-size="${fs}" fill="${s.txt}" ${s.shape === 'bolt' ? 'stroke="' + s.c1 + '" stroke-width="2"' : ''}>${s.abbr}</text></svg>`;
    },
    // draw centered at (cx, cy) with the given size in the canvas's current units
    canvas(g, t, cx, cy, size, withText) {
      const s = L.spec(t), p = new Path2D(s.path);
      g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 100, size / 100);
      g.fillStyle = s.c1; g.fill(p); g.lineWidth = 7; g.lineJoin = 'round'; g.strokeStyle = s.c2; g.stroke(p);
      if (withText !== false) { g.fillStyle = s.txt; g.font = '900 ' + (s.abbr.length > 2 ? 30 : 36) + 'px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s.abbr, 50, 56); }
      g.restore();
    },
  };
  PB.UI = PB.UI || {};
  PB.UI.logo = (t, size) => L.svg(t, size);
})(window.PB);
