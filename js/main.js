// Boot
(function (PB) {
  PB.buildDB();
  PB.settings = PB.Save.settingsLoad();
  document.getElementById('screen').style.overflow = 'hidden';
  PB.UI.go('menu', {}, true);
  window.addEventListener('error', e => { console.error(e.error || e.message); });
})(window.PB);
