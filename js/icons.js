// Pixel-art icons that replace emoji everywhere. Each icon is a small grid: '#' takes the surrounding text color, '.' is empty and the letters
// are fixed colors. PB.I(name) gives inline SVG for HTML; PB.Icon.draw paints the same icon onto a canvas.
(function (PB) {
  const PAL = { k: '#05080f', y: '#ffcb05', Y: '#fff3a0', d: '#b07a00', r: '#ff5a5f', R: '#a8232b', b: '#4aa3ff', B: '#1f5fbf', g: '#2fd47a', G: '#178a4a', w: '#ffffff', o: '#ff8a2a', O: '#b8510a', c: '#9fe8ff', n: '#c98f4f', x: '#ff8a2a' };
  const D = {
    up: ['...#...', '..###..', '.#####.', '#######'],
    down: ['#######', '.#####.', '..###..', '...#...'],
    left: ['...#', '..##', '.###', '####', '.###', '..##', '...#'],
    right: ['#...', '##..', '###.', '####', '###.', '##..', '#...'],
    arrowUp: ['...#...', '..###..', '.#####.', '..###..', '..###..', '..###..'],
    forward: ['...#...', '....#..', '#######', '....#..', '...#...'],
    back: ['...#...', '..#....', '#######', '..#....', '...#...'],
    check: ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'],
    cross: ['##...##', '###.###', '.#####.', '..###..', '.#####.', '###.###', '##...##'],
    star: ['....y....', '....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '..yyyyy..', '.yyy.yyy.', '.yy...yy.'],
    sparkle: ['...y...', '...y...', '..yYy..', 'yyYYYyy', '..yYy..', '...y...', '...y...'],
    trophy: ['yyyyyyyyy', 'y.yYyyy.y', 'y.yYyyy.y', '.yyyyyyy.', '..yyyyy..', '...yyy...', '....y....', '...ddd...', '..ddddd..'],
    bolt: ['....yy.', '...yy..', '..yy...', '.yyyyy.', '...yy..', '..yy...', '.y.....'],
    fire: ['....o..', '...oo..', '..ooo.o', '.ooooo.', '.ooyyoo', 'oooyyoo', '.ooyyo.', '..ooo..'],
    snow: ['...c...', '.c.c.c.', '..ccc..', 'ccccccc', '..ccc..', '.c.c.c.', '...c...'],
    eye: ['...#####...', '.##wwwww##.', '#wwwbbbwww#', '#wwbbkbbww#', '#wwwbbbwww#', '.##wwwww##.', '...#####...'],
    globe: ['....kkkkk....', '..kkbbbbbkk..', '.kbbggbbbbbk.', '.kbgggbbbgbk.', 'kbbggbbbggbbk', 'kbbgbbbbgggbk', 'kbbbbbbbbggbk', 'kbbbgggbbbbbk', 'kbbgggggbbbbk', '.kbbggggbbbk.', '.kbbbgggbbbk.', '..kkbbbbbkk..', '....kkkkk....'],
    gear: ['....###....', '.##.###.##.', '.#########.', '###########', '####...####', '####...####', '####...####', '###########', '.#########.', '.##.###.##.', '....###....'],
    image: ['#########', '#.....y.#', '#.......#', '#...#...#', '#..###.##', '#.#####.#', '#########'],
    rewind: ['...#...#', '..##..##', '.###.###', '########', '.###.###', '..##..##', '...#...#'],
    ff: ['#...#...', '##..##..', '###.###.', '########', '###.###.', '##..##..', '#...#...'],
    skip: ['#....#', '##...#', '###..#', '####.#', '###..#', '##...#', '#....#'],
    pause: ['###.###', '###.###', '###.###', '###.###', '###.###', '###.###'],
    medic: ['..rrr..', '..rrr..', 'rrrrrrr', 'rrrrrrr', 'rrrrrrr', '..rrr..', '..rrr..'],
    ball: ['...xxxxx...', '.xxxxkxxxx.', 'xxkxxkxxkxx', 'xkxxxkxxxkx', 'xkxxxkxxxkx', 'kkkkkkkkkkk', 'xkxxxkxxxkx', 'xkxxxkxxxkx', 'xxkxxkxxkxx', '.xxxxkxxxx.', '...xxxxx...'],
    slot: ['.rrrrrrrrr.', 'rrYrYrYrYrr', 'rrrrrrrrrrr', 'rkkkkkkkkkr', 'rkwwkwwkwwr', 'rkggkyykbbr', 'rkggkyykbbr', 'rkwwkwwkwwr', 'rkkkkkkkkkr', 'rrrrrrrrrrr', '.RRRRRRRRR.'],
    confetti: ['r...b...y', '.r.....y.', '..r.g.y..', '....g....', '.b.....o.', 'b...y...o'],
    drop: ['...#...', '...#...', '..###..', '..###..', '.#####.', '#######', '#######', '.#####.'],
    leaf: ['.....###', '...#####', '..######', '.#######', '.######.', '.#####..', '#.##....', '#.......'],
    fang: ['#.........#', '##.......##', '.###...###.', '..#######..', '.#########.', '.##..#..##.', '.#########.', '..#######..', '..#.#.#.#..', '...#...#...'],
    ghost: ['...wwww...', '..wwwwww..', '.wwwwwwww.', '.ww.ww.ww.', '.ww.ww.ww.', 'wwwwwwwwww', 'www....www', 'wwwwwwwwww', 'wwwwwwwwww', 'wwwwwwwwww', 'ww.ww.ww.w'],
    wing: ['#........', '##.......', '###..#...', '####.##..', '#########', '.#######.', '..#####..'],
    moon: ['..####.', '.##....', '##.....', '##.....', '##.....', '.##....', '..####.'],
    gem: ['..#####..', '.#######.', '#########', '.#######.', '..#####..', '...###...', '....#....'],
    palette: ['..#####..', '.#r#y###.', '#########', '##b###g##', '.########', '..#####..'],
    phone: ['#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#.#.#', '#####'],
    rotate: ['..#####..', '.#.....#.', '#.....###', '#......#.', '#........', '#........', '#.......#', '.#.....#.', '..#####..'],
    die: ['#######', '#.....#', '#.#.#.#', '#.....#', '#.#.#.#', '#.....#', '#######'],
    ticket: ['yyyyyyyyy', 'yyyYYYyyy', '.yyYYYyy.', 'yyyYYYyyy', 'yyyyyyyyy'],
    box: ['#######', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'],
    checked: ['#######', '#....g#', '#...g.#', '#g.g..#', '#.g...#', '#.....#', '#######'],
    dot: ['.###.', '#####', '#####', '#####', '.###.'],
    crown: ['y...y...y', 'yy.yyy.yy', 'yyyyyyyyy', 'yyyyyyyyy', 'ddddddddd'],
    pad: ['.#########.', '##.#####.##', '#...###.#.#', '##.#####.##', '###########', '##.......##', '#.........#'],
    search: ['.###....', '#...#...', '#...#...', '#...#...', '.###....', '.....#..', '......#.'],
  };
  const NAMES = Object.keys(D);
  // old emoji -> icon name (team symbols saved before the icons existed, and the symbol choices offered now)
  const OF = { '⚡': 'bolt', '🔥': 'fire', '🌊': 'drop', '🌿': 'leaf', '🍃': 'leaf', '❄️': 'snow', '❄': 'snow', '🐉': 'fang', '👻': 'ghost', '⭐': 'star', '🏀': 'ball', '🦅': 'wing', '🌙': 'moon', '💎': 'gem' };
  const CODE = { '~z': 'bolt', '~f': 'fire', '~w': 'drop', '~l': 'leaf', '~i': 'snow', '~d': 'fang', '~g': 'ghost', '~s': 'star', '~b': 'ball', '~e': 'wing', '~m': 'moon', '~j': 'gem' };
  const grid = name => D[name] || D.dot;
  const dims = name => { const g = grid(name); return { w: g[0].length, h: g.length }; };
  // inline SVG, one rect per run of pixels
  const svgCache = {};
  function svg(name, mono) {
    const key = name + (mono || '');
    if (svgCache[key]) return svgCache[key];
    const g = grid(name), d = dims(name), u = 1 / Math.max(7, d.h * 0.8, d.w * 0.7);
    let r = '';
    g.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x]; if (ch === '.') { x++; continue; }
        let e = x; while (e < row.length && row[e] === ch) e++;
        const fill = mono ? mono : ch === '#' ? 'currentColor' : PAL[ch] || 'currentColor';
        r += `<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${fill}"/>`;
        x = e;
      }
    });
    return (svgCache[key] = `<svg class="pi pi-${name}" viewBox="0 0 ${d.w} ${d.h}" style="width:${(d.w * u).toFixed(2)}em;height:${(d.h * u).toFixed(2)}em" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`);
  }
  // canvas: draws the icon with its top-left at (x, y); h is the pixel height. mono = one color for every pixel, outline = dark halo
  // the same pixels as bare SVG markup / canvas fills, centered on (cx, cy) in whatever units the caller uses (team logos)
  function rects(name, mono) { return svg(name, mono).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); }
  function paint(g, name, cx, cy, size, mono) {
    const gr = grid(name), d = dims(name), u = size / Math.max(d.w, d.h), x0 = cx - d.w * u / 2, y0 = cy - d.h * u / 2;
    gr.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) { const ch = row[xx]; if (ch === '.') continue; g.fillStyle = mono || (ch === '#' ? '#fff' : PAL[ch]); g.fillRect(x0 + xx * u, y0 + yy * u, u + 0.01, u + 0.01); } });
  }
  const cv = {};
  function sheet(name, px, mono) {
    const key = name + px + (mono || ''); if (cv[key]) return cv[key];
    const g = grid(name), d = dims(name), c = document.createElement('canvas'); c.width = d.w * px + 2 * px; c.height = d.h * px + 2 * px;
    const x = c.getContext('2d');
    const paint = (ox, oy, only) => g.forEach((row, yy) => { for (let xx = 0; xx < row.length; xx++) { const ch = row[xx]; if (ch === '.') continue; x.fillStyle = only || mono || (ch === '#' ? '#ffffff' : PAL[ch]); x.fillRect(px + xx * px + ox, px + yy * px + oy, px, px); } });
    for (const [ox, oy] of [[-px, 0], [px, 0], [0, -px], [0, px]]) paint(ox, oy, PAL.k);
    paint(0, 0);
    return (cv[key] = c);
  }
  function draw(g, name, x, y, h, mono) {
    const d = dims(name), px = Math.max(1, Math.round(h / d.h)), c = sheet(name, px, mono), sm = g.imageSmoothingEnabled;
    const t = g.getTransform(), X = (Math.round(t.a * (x - px) + t.e) - t.e) / t.a, Y = (Math.round(t.d * (y - px) + t.f) - t.f) / t.d;      // snap to whole screen pixels so moving icons never shimmer
    g.imageSmoothingEnabled = false; g.drawImage(c, X, Y); g.imageSmoothingEnabled = sm;
    return d.w * px;
  }
  const width = (name, h) => { const d = dims(name); return d.w * Math.max(1, Math.round(h / d.h)); };
  PB.Icon = { names: NAMES, rects, paint, svg, draw, width, dims, of: s => OF[s] || CODE[s] || null, CODE, OF };
  PB.I = name => svg(name);
})(window.PB);
