// Sprite atlas: the Pokémon pictures are packed into a few sheets (see tools/build_atlas.py and data/atlas.js), so a screen needs a handful of
// requests instead of one per Pokémon. HTML uses a background-image crop; canvases crop the sheet into a picture. Falls back to the single files.
(function (PB) {
  const A = PB.Atlas = {}, imgs = {}, bad = {}, urls = {};
  const D = () => PB.ATLAS;
  A.loc = m => { const d = D(), e = d && d.map[m.id]; return e && !bad[e[0]] ? e : null; };
  A.sheet = i => imgs[i] || (imgs[i] = new Promise(res => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => { bad[i] = true; res(null); if (PB.UI && PB.UI.refresh && PB.UI.cur) PB.UI.refresh(); };      // the sheet could not load: pages redraw with the single files
    im.src = D().sheets[i];
  }));
  // the style that shows one Pokémon from its sheet (percentages, so any size works)
  // tight = fit the visible part of the sprite to the box (small sprites in tables and lists fill their space instead of floating in padding)
  A.css = (m, size, tight) => {
    const e = A.loc(m); if (!e) return null;
    A.sheet(e[0]); const d = D();
    if (tight && e.length >= 7) {
      const w = e[5] - e[3], h = e[6] - e[4], k = size / Math.max(w, h);
      return `width:${size}px;height:${size}px;background-image:url(${d.sheets[e[0]]});background-size:${(d.cols * d.cell * k).toFixed(2)}px ${(d.rows * d.cell * k).toFixed(2)}px;background-position:${(-(e[1] * d.cell + e[3]) * k + (size - w * k) / 2).toFixed(2)}px ${(-(e[2] * d.cell + e[4]) * k + (size - h * k) / 2).toFixed(2)}px`;
    }
    return `width:${size}px;height:${size}px;background-image:url(${d.sheets[e[0]]});background-size:${d.cols * 100}% ${d.rows * 100}%;background-position:${(e[1] / (d.cols - 1) * 100).toFixed(4)}% ${(e[2] / (d.rows - 1) * 100).toFixed(4)}%`;
  };
  // one sprite cropped from its sheet into its own canvas (null if the atlas is not available); this only draws, so it works even where reading pixels back is blocked
  const crops = {};
  A.crop = m => {
    const e = A.loc(m); if (!e) return Promise.resolve(null);
    return crops[m.id] || (crops[m.id] = A.sheet(e[0]).then(im => {
      if (!im) return null; const d = D(), c = document.createElement('canvas'); c.width = c.height = d.cell;
      c.getContext('2d').drawImage(im, e[1] * d.cell, e[2] * d.cell, d.cell, d.cell, 0, 0, d.cell, d.cell);
      return c;
    }).catch(err => { PB.warn('atlas', err); return null; }));
  };
})(window.PB);
