/**
 * Sons fantasmas sintetizados com Web Audio (alucinação nível ≥ 2):
 * sussurro (ruído filtrado com sílabas), passos atrás do jogador, tambor
 * distante e a flauta do jogador (atividade de conforto). O contexto nasce
 * no primeiro clique/tecla, como em AnimalSounds.
 *
 * @example
 * const ps = new PhantomSounds({ volume: 0.35 });
 * ps.random();      // um som fantasma sorteado
 * ps.flute();       // melodia curta (TOCAR_INSTRUMENTO)
 */
export class PhantomSounds {
  constructor({ volume = 0.35 } = {}) {
    this.volume = volume;
    this.ctx = null;
    this._noise = null;
    if (typeof window === 'undefined') return;
    const unlock = () => {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (AC && !this.ctx) this.ctx = new AC();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  noiseBuffer() {
    if (this._noise) return this._noise;
    const ctx = this.ctx, len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  }

  /** Saída com pan (−1 esquerda … 1 direita). */
  out(pan = 0) {
    const ctx = this.ctx, g = ctx.createGain(), p = ctx.createStereoPanner?.();
    g.gain.value = this.volume;
    if (p) { p.pan.value = pan; g.connect(p).connect(ctx.destination); } else g.connect(ctx.destination);
    return g;
  }

  /** Sussurro: rajadas de ruído em banda de voz, como sílabas. */
  whisper(pan = (Math.random() - 0.5) * 1.6) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05, dest = this.out(pan);
    const n = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.value = 900 + Math.random() * 1600;
      const g = ctx.createGain(), t = t0 + i * (0.14 + Math.random() * 0.1);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(bp).connect(g).connect(dest);
      src.start(t, Math.random()); src.stop(t + 0.2);
    }
  }

  /** Passos lentos atrás do jogador (batidas graves em ruído). */
  footsteps(pan = (Math.random() < 0.5 ? -1 : 1) * 0.7) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05, dest = this.out(pan);
    for (let i = 0; i < 5; i++) {
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer();
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
      const g = ctx.createGain(), t = t0 + i * 0.55;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.9 * (0.5 + i * 0.12), t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(lp).connect(g).connect(dest);
      src.start(t, Math.random()); src.stop(t + 0.15);
    }
  }

  /** Tambor distante (ninguém está tocando). */
  drums(pan = (Math.random() - 0.5)) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.05, dest = this.out(pan);
    const beats = [0, 0.45, 0.7, 1.35, 1.8, 2.05];
    for (const b of beats) {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + b;
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g).connect(dest); o.start(t); o.stop(t + 0.45);
    }
  }

  /** Um som fantasma sorteado. */
  random() {
    const r = Math.random();
    if (r < 0.45) this.whisper(); else if (r < 0.8) this.footsteps(); else this.drums();
  }

  /** Flauta: frase pentatônica curta (atividade de conforto). */
  flute() {
    const ctx = this.ctx;
    if (!ctx) return;
    const notes = [523, 587, 659, 784, 880, 784, 659, 587, 523];
    const t0 = ctx.currentTime + 0.05, dest = this.out(0);
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), vib = ctx.createOscillator(), vg = ctx.createGain(), g = ctx.createGain(), t = t0 + i * 0.32;
      o.type = 'triangle'; o.frequency.value = f;
      vib.frequency.value = 5.5; vg.gain.value = f * 0.008; vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g).connect(dest); o.start(t); vib.start(t); o.stop(t + 0.36); vib.stop(t + 0.36);
    });
  }
}
