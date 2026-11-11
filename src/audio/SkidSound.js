/**
 * Derrapagem no cascalho (WebAudio, sem arquivos): ruído filtrado em faixa,
 * com "grãos" (pequenos estalos) por cima — som de pedra solta escorregando.
 *
 * @example
 *   const skid = new SkidSound({ volume: 0.35 });
 *   skid.play(0.8); // intensidade 0..1 (ex.: pela inclinação)
 */
export class SkidSound {
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

  noise() {
    if (this._noise) return this._noise;
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * 0.8), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    // Ruído com estalos esparsos (cascalho rolando).
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5 + (Math.random() < 0.004 ? (Math.random() * 2 - 1) * 2 : 0);
    this._noise = buf;
    return buf;
  }

  /** @param {number} [intensity] 0..1 */
  play(intensity = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime, v = this.volume * Math.max(0.3, Math.min(1, intensity));
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.7); // o arrasto "desce" de tom
    bp.Q.value = 0.9;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    src.connect(bp).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.8);
  }
}
