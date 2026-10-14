// Accessibility: colorblind-safe palette (blue / orange instead of green / red), a text size setting, button roles and labels for keyboard and screen-reader users.
(function (PB) {
  const UI = PB.UI;
  const GOOD = /#(2fd47a|9be15d|4be894|8fd14f|86efac)/gi, BAD = /#(ff5a5f|ff7a5a|ff4d4d|fca5a5|ffb4b4)/gi;
  const recolor = root => {
    for (const el of root.querySelectorAll('[style],[fill],[stroke]')) {
      if (el.dataset.cbd) continue; el.dataset.cbd = '1';
      for (const a of ['style', 'fill', 'stroke']) { const v = el.getAttribute(a); if (v && (GOOD.test(v) || BAD.test(v))) el.setAttribute(a, v.replace(GOOD, '#56b4e9').replace(BAD, '#e8590c')); GOOD.lastIndex = BAD.lastIndex = 0; }
    }
  };
  const roles = root => {
    for (const el of root.querySelectorAll('[data-act]:not(button):not(a):not(input):not(select):not([role])')) el.setAttribute('role', 'button');
    for (const el of root.querySelectorAll('button:not([aria-label])')) { if (!el.textContent.trim() || /^[⚙←→✕×⏪]+$/.test(el.textContent.trim())) el.setAttribute('aria-label', el.title || el.dataset.act || 'button'); }
    for (const el of root.querySelectorAll('.modal:not([aria-modal])')) { el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', (el.querySelector('h2') || {}).textContent || 'Dialog'); }
  };
  let raf = 0;
  const pass = () => { raf = 0; const s = PB.settings || {}; for (const id of ['screen', 'modal', 'top']) { const r = document.getElementById(id); if (r) { roles(r); if (s.colorblind) recolor(r); } } };
  const obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(pass); });
  PB.applyA11y = function () {
    const s = PB.settings || {};
    document.body.classList.toggle('cb', !!s.colorblind);
    const app = document.getElementById('app'); if (app) app.style.zoom = String((+s.textScale || 100) / 100);
    pass();
  };
  window.addEventListener('load', () => {
    for (const id of ['screen', 'modal', 'top']) { const r = document.getElementById(id); if (r) obs.observe(r, { childList: true, subtree: true }); }
    const t = document.createElement('div'); t.setAttribute('aria-live', 'polite'); t.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(t);
    const toast = PB.toast; PB.toast = function (msg, ms) { toast(msg, ms); t.textContent = msg; };
    PB.applyA11y();
  });
  if (UI) {
    UI.actions.setA11y = (el, d) => { PB.settings[d.k] = d.k === 'colorblind' ? el.checked : el.value; PB.Save.settingsSave(PB.settings); PB.applyA11y(); UI.refresh(); };
  }
})(window.PB);
