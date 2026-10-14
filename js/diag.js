// Diagnostics: a rolling log of network events and errors, kept for a "copy report" button in Settings and the lobby.
(function (PB) {
  const D = PB.Diag = { net: [], errs: [], lastToast: 0 }, KEY = 'poke82_errors';
  try { D.errs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { D.errs = []; }
  D.build = () => { const s = [...document.scripts].find(x => /util\.js/.test(x.src)), m = s && /v=(\d+)/.exec(s.src); return m ? m[1] : '?'; };
  D.log = (kind, msg) => { D.net.push({ t: Date.now(), k: kind, m: String(msg).slice(0, 300) }); if (D.net.length > 150) D.net.shift(); };
  D.err = (msg, src) => {
    D.errs.push({ t: Date.now(), m: String(msg).slice(0, 400), s: src || '' }); if (D.errs.length > 30) D.errs.shift();
    try { localStorage.setItem(KEY, JSON.stringify(D.errs.slice(-15))); } catch (e) { }
    if (Date.now() - D.lastToast > 60000 && PB.toast) { D.lastToast = Date.now(); PB.toast('Something went wrong. Settings has a "Copy problem report" button.', 5000); }
  };
  PB.warn = (ctx, e) => { try { console.warn(ctx, e); D.log('warn', ctx + ': ' + (e && e.message || e)); } catch (x) { } };
  // Safari reports some errors only as "Script error." with no file or line. Callbacks run through these wrappers instead, so the log gets the real message and stack.
  const guard = fn => { if (typeof fn !== 'function' || fn.__g) return fn; const w = function () { try { return fn.apply(this, arguments); } catch (e) { D.err((e && e.message) || e, e && e.stack ? String(e.stack).split('\n').slice(0, 3).join(' < ').replace(/https?:\/\/[^/]*\//g, '') : ''); } }; w.__g = true; fn.__w = w; return w; };
  try {
    const rAF = window.requestAnimationFrame.bind(window), sT = window.setTimeout.bind(window), sI = window.setInterval.bind(window);
    window.requestAnimationFrame = f => rAF(guard(f));
    window.setTimeout = (f, ...a) => sT(guard(f), ...a);
    window.setInterval = (f, ...a) => sI(guard(f), ...a);
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (t, f, o) { return add.call(this, t, guard(f), o); };
    EventTarget.prototype.removeEventListener = function (t, f, o) { return rem.call(this, t, f && f.__w ? f.__w : f, o); };
  } catch (e) { }
  window.addEventListener('error', e => e.message === 'Script error.' && !e.filename ? D.err('Script error (no details from the browser)', '') : D.err(e.message, (e.filename || '').split('/').pop() + ':' + e.lineno));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; D.err('Unhandled: ' + ((r && r.message) || r), r && r.stack ? String(r.stack).split('\n').slice(0, 2).join(' < ').replace(/https?:\/\/[^/]*\//g, '') : ''); });
  D.report = () => {
    const N = PB.Net || {}, G = PB.G, t = x => new Date(x).toISOString().slice(11, 19);
    const lines = ['PokéHoops 82 problem report', 'build ' + D.build() + ' · ' + new Date().toISOString(), navigator.userAgent, 'screen ' + innerWidth + 'x' + innerHeight + ' @' + (window.devicePixelRatio || 1), 'page ' + (PB.UI && PB.UI.cur) + (G ? ' · ' + G.mode + (G.fr ? ' S' + G.fr.year : '') : '')];
    lines.push('online: ' + (N.connected ? 'connected' : 'no') + ' · room ' + (N.room ? N.room.code : '-') + ' · host ' + (N.isHost && N.isHost()) + ' · ping ' + (N.rtt != null ? N.rtt + 'ms' : '-') + (N.lost ? ' · LOST' : ''));
    lines.push('', 'recent network events:'); for (const e of D.net.slice(-40)) lines.push(t(e.t) + ' ' + e.k + ' ' + e.m);
    lines.push('', 'errors:'); for (const e of D.errs.slice(-15)) lines.push(t(e.t) + ' ' + e.m + (e.s ? ' (' + e.s + ')' : ''));
    return lines.join('\n');
  };
  window.addEventListener('load', () => {
    if (!PB.UI) return;
    PB.UI.actions.diagCopy = () => { const r = D.report(); (navigator.clipboard ? navigator.clipboard.writeText(r) : Promise.reject()).then(() => PB.toast('Report copied. Paste it when reporting the problem.'), () => PB.toast('Could not copy; see the console', 4000, console.log(r))); };
    PB.UI.actions.diagClear = () => { D.errs = []; D.net = []; try { localStorage.removeItem(KEY); } catch (e) { } };
  });
})(window.PB);
