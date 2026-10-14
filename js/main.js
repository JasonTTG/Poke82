// Boot
(function (PB) {
  PB.buildDB();
  PB.settings = PB.Save.settingsLoad();
  document.getElementById('screen').style.overflow = 'hidden';
  PB.UI.go('menu', {}, true);
  window.addEventListener('error', e => { console.error(e.error || e.message); });
  // keep the game's files on the device (works offline, no repeat downloads); skipped on localhost so development always sees fresh files
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !/^(localhost|127\.)/.test(location.hostname)) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(e => PB.warn('sw', e)));
})(window.PB);
