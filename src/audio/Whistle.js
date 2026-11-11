/**
 * Apito de guarda (WebAudio, sem arquivos): dois trinados agudos com um
 * leve tremolo. O volume cai com a distância até o jogador.
 *
 * @example
 *   const w = new Whistle({ volume: 0.3 });
 *   w.blow(12); // guarda a 12 m
 */
export class Whistle {
  constructor({ volume = 0.3, falloff = 60 } = {}) {
    this.volume = volume;
    this.falloff = falloff;
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

  /** @param {number} distance metros até o jogador */
  blow(distance = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const v = this.volume * Math.max(0, 1 - distance / this.falloff);
    if (v <= 0.005) return;
    const t0 = ctx.currentTime;
    for (const [start, dur] of [[0, 0.32], [0.42, 0.55]]) {
      const osc = ctx.createOscillator(), trem = ctx.createOscillator(), tg = ctx.createGain(), g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(2900, t0 + start);
      osc.frequency.linearRampToValueAtTime(3150, t0 + start + dur);
      trem.frequency.value = 38; tg.gain.value = 120; // trinado da bolinha do apito
      trem.connect(tg).connect(osc.frequency);
      g.gain.setValueAtTime(0, t0 + start);
      g.gain.linearRampToValueAtTime(v, t0 + start + 0.02);
      g.gain.setValueAtTime(v, t0 + start + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t0 + start + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0 + start); trem.start(t0 + start);
      osc.stop(t0 + start + dur + 0.02); trem.stop(t0 + start + dur + 0.02);
    }
  }
}
