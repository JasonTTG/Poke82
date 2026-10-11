// Minimal WebAudio sound effects (no asset files). Volume + on/off come from PB.settings.
(function (PB) {
  let ctx = null, noiseBuf = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const vol = () => { const s = PB.settings || {}; return s.sfx === false ? 0 : (s.volume != null ? s.volume : 0.5); };
  function tone(type, f0, f1, dur, gain, t0) {
    const o = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime + (t0 || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, gain, hp, t0) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g = ctx.createGain(); const t = ctx.currentTime + (t0 || 0);
    f.type = 'highpass'; f.frequency.value = hp || 2000; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(ctx.destination); s.start(t); s.stop(t + dur + 0.02);
  }
  PB.Audio = {
    unlock() { try { ensure(); } catch (e) { } },
    play(name) {
      const v = vol(); if (v <= 0) return;
      try {
        if (!ensure()) return;
        const g = 0.35 * v;
        switch (name) {
          case 'click': tone('square', 760, 520, 0.04, 0.08 * v); break;
          case 'swish': noise(0.28, 0.5 * g, 3500); tone('sine', 900, 1300, 0.12, 0.25 * g); break;
          case 'rim': tone('triangle', 260, 110, 0.18, 0.6 * g); noise(0.05, 0.3 * g, 1500); break;
          case 'dunk': tone('sine', 110, 55, 0.35, 0.9 * g); noise(0.3, 0.6 * g, 800); break;
          case 'whistle': tone('sine', 2300, 2100, 0.5, 0.45 * g); tone('sine', 2250, 2150, 0.5, 0.3 * g, 0.02); break;
          case 'buzzer': tone('square', 150, 148, 0.9, 0.5 * g); tone('sawtooth', 300, 296, 0.9, 0.2 * g); break;
          case 'steal': tone('sine', 400, 1100, 0.15, 0.4 * g); break;
          case 'block': noise(0.12, 0.8 * g, 600); tone('triangle', 180, 90, 0.12, 0.5 * g); break;
          case 'ft': tone('sine', 1000, 1000, 0.06, 0.2 * g); break;
          case 'cheer': noise(1.4, 0.55 * g, 500); noise(1.0, 0.35 * g, 1800, 0.1); break;
          case 'sub': tone('sine', 520, 700, 0.1, 0.2 * g); break;
        }
      } catch (e) { }
    },
  };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => PB.Audio.unlock(), { once: true }));
})(window.PB);
