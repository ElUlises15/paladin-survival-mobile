// Audio procedural opcional (WebAudio, sin archivos). Nunca bloquea el gameplay:
// si WebAudio no existe o falla, todas las llamadas son no-op.

const SOUNDS = {
  swing:        { type: 'triangle', from: 520, to: 260, dur: 0.07, gain: 0.05 },
  hit:          { type: 'square',   from: 180, to: 90,  dur: 0.06, gain: 0.05 },
  kill:         { type: 'sawtooth', from: 140, to: 40,  dur: 0.14, gain: 0.05 },
  playerHit:    { type: 'sawtooth', from: 220, to: 70,  dur: 0.2,  gain: 0.08 },
  levelUp:      { type: 'triangle', from: 440, to: 880, dur: 0.35, gain: 0.08 },
  swordUpgrade: { type: 'triangle', from: 330, to: 990, dur: 0.5,  gain: 0.08 },
  waveStart:    { type: 'sine',     from: 110, to: 165, dur: 0.4,  gain: 0.06 },
  gameOver:     { type: 'sawtooth', from: 300, to: 50,  dur: 1.0,  gain: 0.09 },
};

export function createAudio(win = globalThis) {
  let ctx = null;
  let muted = false;
  let silentPlayed = false;
  const lastPlayed = Object.create(null);

  function ensure() {
    if (ctx) return ctx;
    const Ctor = win.AudioContext || win.webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { ctx = null; }
    return ctx;
  }

  return {
    unlock() {
      const c = ensure();
      if (!c) return;
      // iOS Safari: el contexto arranca 'suspended' (o queda 'interrupted' tras una llamada/bloqueo);
      // solo se reanuda dentro de un gesto del usuario. Un buffer mudo termina de "desbloquear" la salida.
      if (c.state !== 'running') {
        try { const r = c.resume(); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch { /* no-op */ }
      }
      if (!silentPlayed) {
        silentPlayed = true;
        try {
          const buf = c.createBuffer(1, 1, 22050);
          const src = c.createBufferSource();
          src.buffer = buf;
          src.connect(c.destination);
          src.start(0);
        } catch { /* no-op */ }
      }
    },
    play(name) {
      if (muted) return;
      const s = SOUNDS[name];
      const c = ctx;
      if (!s || !c || c.state !== 'running') return;
      // Limitar repeticiones (muchos hits en el mismo instante).
      const t = c.currentTime;
      if (lastPlayed[name] !== undefined && t - lastPlayed[name] < 0.03) return;
      lastPlayed[name] = t;
      try {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = s.type;
        osc.frequency.setValueAtTime(s.from, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, s.to), t + s.dur);
        gain.gain.setValueAtTime(s.gain, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
        osc.connect(gain).connect(c.destination);
        osc.start(t);
        osc.stop(t + s.dur + 0.02);
      } catch { /* audio nunca rompe el juego */ }
    },
    toggleMute() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
}
