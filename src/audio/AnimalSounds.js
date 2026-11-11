/**
 * Sons de animais sintetizados com Web Audio (o jogo ainda não tem arquivos
 * de som): risada da hiena e o tambor do gorila batendo no peito. Mesmo
 * esquema do Thunder: o contexto nasce no primeiro clique/tecla.
 *
 * @example
 * const sounds = new AnimalSounds();
 * sounds.laugh(0.8);      // força 0..1 (longe = baixo)
 * sounds.chestBeat(1);
 */
export class AnimalSounds {
  constructor({ volume = 0.5 } = {}) {
    this.volume = volume;
    this.ctx = null;
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

  /** Risada da hiena: "hi-hi-hi" agudo, cada sílaba descendo de tom. */
  laugh(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || strength <= 0.03) return;
    const t0 = ctx.currentTime + 0.05;
    const n = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const f = 900 - i * 25 + Math.random() * 80;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.1);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1400;
      band.Q.value = 3;
      const g = ctx.createGain();
      const peak = this.volume * 0.35 * strength;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(band).connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** Uivo do lobo líder: tom longo que sobe, sustenta e cai, com leve vibrato. */
  howl(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || strength <= 0.03) return;
    const t = ctx.currentTime + 0.05, f = 380 + Math.random() * 60;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * 0.7, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.5);
    osc.frequency.setValueAtTime(f, t + 1.6);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, t + 2.4);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5; lg.gain.value = 6;
    lfo.connect(lg).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(this.volume * 0.3 * strength, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); lfo.start(t); osc.stop(t + 2.6); lfo.stop(t + 2.6);
  }

  /** Alarme do vigia da manada: latidos curtos e agudos ("kwa-ha"). */
  alarm(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || strength <= 0.03) return;
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.28;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(700, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.15);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(this.volume * 0.3 * strength, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(band).connect(g).connect(ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    }
  }

  /** Gorila batendo no peito: batidas graves e rápidas. */
  chestBeat(strength = 1) {
    const ctx = this.ctx;
    if (!ctx || strength <= 0.03) return;
    const t0 = ctx.currentTime + 0.05;
    for (let i = 0; i < 8; i++) {
      const t = t0 + i * 0.11;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
      const g = ctx.createGain();
      const peak = this.volume * strength;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.11);
    }
  }
}
