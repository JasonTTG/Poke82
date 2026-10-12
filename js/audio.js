// WebAudio sound, no asset files: sound effects, a generative menu music loop and a crowd bed for games.
// Everything is synthesized. Volumes and switches live in PB.settings (volume = master, sfxVol / sfx, musicVol / music, crowd, mute).
(function (PB) {
  let ctx = null, noiseBuf = null, master = null, sfxBus = null, musBus = null, crowdBus = null;
  const S = () => PB.settings || {};
  const num = (v, d) => (v == null || isNaN(+v) ? d : +v);
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      master = ctx.createGain(); master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musBus = ctx.createGain(); musBus.connect(master);
      crowdBus = ctx.createGain(); crowdBus.gain.value = 0; crowdBus.connect(master);
      apply();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const mute = () => !!S().mute;
  function apply() {
    if (!ctx) return;
    const s = S(), t = ctx.currentTime, mv = mute() ? 0 : num(s.volume, 0.6);
    master.gain.setTargetAtTime(mv, t, 0.03);
    sfxBus.gain.setTargetAtTime(s.sfx === false ? 0 : num(s.sfxVol, 0.8), t, 0.03);
    musBus.gain.setTargetAtTime(s.music === false ? 0 : num(s.musicVol, 0.3) * (Mu.fade), t, 0.15);
    if (Cr.on) crowdBus.gain.setTargetAtTime(s.crowd === false ? 0 : 0.5 * num(s.sfxVol, 0.8), t, 0.3);
  }

  function tone(type, f0, f1, dur, gain, t0, bus) {
    const o = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime + (t0 || 0);
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(bus || sfxBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, gain, hp, t0, bus) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g = ctx.createGain(); const t = ctx.currentTime + (t0 || 0);
    f.type = 'highpass'; f.frequency.value = hp || 2000; g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus || sfxBus); s.start(t); s.stop(t + dur + 0.02);
  }

  // ---------- crowd bed: filtered noise that breathes, swells on big plays ----------
  const Cr = { on: false, src: null, g: null, lfo: null };
  function crowdStart() {
    if (!ensure() || Cr.on) return; Cr.on = true;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.45;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.16;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.05; lfo.connect(lg).connect(g.gain);
    src.connect(bp).connect(lp).connect(g).connect(crowdBus); src.start(); lfo.start();
    Cr.src = src; Cr.g = g; Cr.lfo = lfo; apply();
  }
  function crowdStop() {
    if (!Cr.on) return; Cr.on = false;
    const t = ctx.currentTime; crowdBus.gain.setTargetAtTime(0, t, 0.25);
    const s = Cr.src, l = Cr.lfo; setTimeout(() => { try { s.stop(); l.stop(); } catch (e) { } }, 1200);
  }
  function swell(level) {
    if (!ctx || !Cr.on || S().crowd === false) return;
    const t = ctx.currentTime, g = Cr.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.16 + 0.34 * (level || 1), t + 0.12); g.exponentialRampToValueAtTime(0.16, t + 2.4);
  }

  // ---------- generative music: a slow chiptune loop (bass, arpeggio, pad, light drums) ----------
  const Mu = { on: false, timer: 0, next: 0, step: 0, bar: 0, fade: 1, lead: 7 };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = [[57, [0, 3, 7]], [53, [0, 4, 7]], [48, [0, 4, 7]], [55, [0, 4, 7]], [57, [0, 3, 7]], [53, [0, 4, 7]], [52, [0, 3, 7]], [55, [0, 4, 7, 10]]];
  const PENT = [0, 3, 5, 7, 10];
  const BPM = 92, STEP = 60 / BPM / 4;
  function musicStep(st, t) {
    const [root, ch] = PROG[Mu.bar % PROG.length], now = ctx.currentTime, d = Math.max(0, t - now);
    const at = (type, f, dur, gain) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(musBus); o.start(t); o.stop(t + dur + 0.05); };
    if (st === 0) { ch.forEach((n, i) => at('sine', mtof(root + 12 + n), STEP * 15, 0.045 - i * 0.006)); }     // pad
    if ([0, 6, 8, 14].includes(st)) at('triangle', mtof(root - 12), STEP * (st === 6 || st === 14 ? 1.6 : 3), 0.2);   // bass
    if (st % 2 === 0) at('square', mtof(root + 12 + ch[(st / 2) % ch.length] + (st % 8 === 4 ? 12 : 0)), STEP * 1.2, 0.035);   // arpeggio
    if (st % 4 === 0 && Math.random() < 0.7) { Mu.lead = Math.max(2, Math.min(11, Mu.lead + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.3 ? 2 : 1))); const o = PENT[Mu.lead % 5] + 12 * Math.floor(Mu.lead / 5); at('square', mtof(69 + o), STEP * (2 + (Math.random() < 0.4 ? 2 : 0)), 0.04); }   // wandering lead
    if (st === 0 || st === 8) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); o.connect(g).connect(musBus); o.start(t); o.stop(t + 0.22); }
    if (st % 2 === 1) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'highpass'; f.frequency.value = 7500; g.gain.setValueAtTime(st === 4 || st === 12 ? 0.11 : 0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); s.connect(f).connect(g).connect(musBus); s.start(t, Math.random()); s.stop(t + 0.06); }
  }
  function musicTick() {
    if (!Mu.on || !ctx) return;
    while (Mu.next < ctx.currentTime + 0.3) { musicStep(Mu.step, Mu.next); Mu.next += STEP; Mu.step++; if (Mu.step >= 16) { Mu.step = 0; Mu.bar++; } }
  }
  function musicStart() {
    if (!ensure()) return;
    if (!Mu.on) { Mu.on = true; Mu.next = ctx.currentTime + 0.1; Mu.step = 0; Mu.bar = 0; Mu.timer = setInterval(musicTick, 40); }
    Mu.fade = 1; apply();
  }
  function musicStop() {
    if (!Mu.on) return; Mu.fade = 0; apply();
    const tm = Mu.timer; setTimeout(() => { if (Mu.fade === 0) { clearInterval(tm); Mu.on = false; } }, 900);
  }

  PB.Audio = {
    unlock() { try { ensure(); if (PB.Audio.scene) PB.Audio.setScene(PB.Audio.scene); } catch (e) { } },
    apply,
    state: () => ({ ctx: ctx && ctx.state, music: Mu.on, crowd: Cr.on, steps: Mu.bar * 16 + Mu.step, t: ctx && ctx.currentTime }),
    scene: null,
    // 'menu': music on, crowd off. 'game': music off, crowd on. 'off': nothing.
    setScene(name) {
      PB.Audio.scene = name;
      if (!ctx) return;                                     // starts on the first user gesture (unlock)
      try { if (name === 'menu') { crowdStop(); musicStart(); } else if (name === 'game') { musicStop(); crowdStart(); } else { musicStop(); crowdStop(); } apply(); } catch (e) { }
    },
    play(name) {
      if (mute()) return;
      try {
        if (!ensure()) return;
        const g = 0.35;
        switch (name) {
          case 'click': tone('square', 760, 520, 0.04, 0.08); break;
          case 'swish': noise(0.28, 0.5 * g, 3500); tone('sine', 900, 1300, 0.12, 0.25 * g); break;
          case 'rim': tone('triangle', 260, 110, 0.18, 0.6 * g); noise(0.05, 0.3 * g, 1500); break;
          case 'dunk': tone('sine', 110, 55, 0.35, 0.9 * g); noise(0.3, 0.6 * g, 800); swell(0.6); break;
          case 'whistle': tone('sine', 2300, 2100, 0.5, 0.45 * g); tone('sine', 2250, 2150, 0.5, 0.3 * g, 0.02); break;
          case 'buzzer': tone('square', 150, 148, 0.9, 0.5 * g); tone('sawtooth', 300, 296, 0.9, 0.2 * g); break;
          case 'steal': tone('sine', 400, 1100, 0.15, 0.4 * g); break;
          case 'block': noise(0.12, 0.8 * g, 600); tone('triangle', 180, 90, 0.12, 0.5 * g); swell(0.4); break;
          case 'ft': tone('sine', 1000, 1000, 0.06, 0.2 * g); break;
          case 'cheer': noise(1.4, 0.55 * g, 500); noise(1.0, 0.35 * g, 1800, 0.1); swell(1); break;
          case 'sub': tone('sine', 520, 700, 0.1, 0.2 * g); break;
          case 'three': tone('sine', 880, 1320, 0.18, 0.3 * g); tone('sine', 1320, 1760, 0.2, 0.25 * g, 0.12); swell(0.7); break;
        }
      } catch (e) { }
    },
  };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => PB.Audio.unlock(), { once: true }));
})(window.PB);
