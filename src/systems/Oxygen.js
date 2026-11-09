/**
 * Fôlego do jogador na água (regra pura, testável).
 * Na água o fôlego cai 1 s por segundo submerso (× `surfaceDrain` boiando na
 * superfície); fora d'água recupera `regenPerSecond` por segundo. Zerou →
 * `update` devolve true uma única vez (afogou).
 *
 * @example
 *   const air = new Oxygen(GAMEPLAY.swimming);
 *   if (air.update(dt, { inWater, submerged })) game.killPlayer('Você se afogou');
 *   ui.setOxygen(air.fraction, inWater);
 */
export class Oxygen {
  /** @param {{ oxygenSeconds: number, surfaceDrain: number, regenPerSecond: number }} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    this.max = cfg.oxygenSeconds;
    this.value = this.max;
    this.drowned = false;
  }

  /** 0 (sem ar) … 1 (cheio). */
  get fraction() {
    return this.value / this.max;
  }

  /**
   * @param {number} dt segundos
   * @param {{ inWater: boolean, submerged?: boolean }} state
   * @returns {boolean} true no quadro em que o fôlego acaba
   */
  update(dt, { inWater, submerged = true }) {
    if (inWater) {
      const rate = submerged ? 1 : this.cfg.surfaceDrain;
      this.value = Math.max(0, this.value - dt * rate);
      if (this.value === 0 && !this.drowned) {
        this.drowned = true;
        return true;
      }
    } else {
      this.value = Math.min(this.max, this.value + dt * this.cfg.regenPerSecond);
      if (this.value > 0) this.drowned = false;
    }
    return false;
  }

  /** Fôlego cheio (respawn). */
  reset() {
    this.value = this.max;
    this.drowned = false;
  }
}
