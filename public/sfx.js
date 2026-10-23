/**
 * Tower Defense Tap — Web Audio SFX (procedural)
 */
(function (global) {
  let ctx = null;
  let muted = false;

  try {
    muted = localStorage.getItem('td_mute') === '1';
  } catch {
    /* ignore */
  }

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain, when) {
    const c = ac();
    if (!c || muted) return;
    const t0 = (when || 0) + c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(gain || 0.08, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, gain) {
    const c = ac();
    if (!c || muted) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = buf;
    g.gain.value = gain || 0.06;
    src.connect(g);
    g.connect(c.destination);
    src.start();
  }

  const Sfx = {
    isMuted() {
      return muted;
    },
    setMuted(v) {
      muted = !!v;
      try {
        localStorage.setItem('td_mute', muted ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    toggleMute() {
      Sfx.setMuted(!muted);
      return muted;
    },
    unlock() {
      ac();
    },
    click() {
      tone(520, 0.04, 'triangle', 0.05);
    },
    place() {
      tone(220, 0.08, 'square', 0.07);
      tone(330, 0.1, 'triangle', 0.05, 0.05);
    },
    upgrade() {
      tone(400, 0.06, 'sawtooth', 0.05);
      tone(600, 0.08, 'triangle', 0.05, 0.06);
    },
    sell() {
      tone(180, 0.1, 'triangle', 0.06);
    },
    shoot() {
      tone(880, 0.03, 'square', 0.035);
    },
    hit() {
      noise(0.04, 0.04);
    },
    kill() {
      tone(300, 0.05, 'square', 0.05);
      tone(150, 0.08, 'triangle', 0.04, 0.04);
    },
    leak() {
      tone(90, 0.2, 'sawtooth', 0.08);
      noise(0.12, 0.05);
    },
    wave() {
      tone(260, 0.1, 'triangle', 0.06);
      tone(390, 0.12, 'triangle', 0.05, 0.08);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, 'triangle', 0.07, i * 0.1));
    },
    lose() {
      tone(200, 0.25, 'sawtooth', 0.08);
      tone(120, 0.35, 'triangle', 0.07, 0.15);
    },
  };

  global.TowerSfx = Sfx;
})(window);
