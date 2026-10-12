// Switches the sound scene with the screen: music on menus, crowd noise in games.
(function (PB) {
  const UI = PB.UI, render = UI.render;
  UI.render = function () { render.apply(this, arguments); if (PB.Audio) PB.Audio.setScene(UI.cur === 'game' ? 'game' : 'menu'); };
})(window.PB);
