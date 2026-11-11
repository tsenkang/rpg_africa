/**
 * Efeitos de combate num corpo (animal ou jogador) — regra pura.
 *  - stun: atordoado (não anda, não ataca)
 *  - pin: preso por um agarrão (mordida no pescoço, rolamento da morte)
 *  - slow: lentidão (mordida no calcanhar) — vale a mais forte ainda ativa
 *  - poison: veneno, dano por segundo (ferrão, presa)
 *
 * @example
 *   const s = new StatusEffects();
 *   s.apply({ stun: 1.2, poison: { dps: 3, seconds: 8 } });
 *   const dano = s.update(dt);      // aplicar na vida
 *   if (s.immobile) velocidade = 0; velocidade *= s.speedFactor;
 */
export class StatusEffects {
  constructor() {
    this.stunT = 0;
    this.pinT = 0;
    /** @type {{ factor: number, t: number }[]} */
    this.slows = [];
    /** @type {{ dps: number, t: number }[]} */
    this.poisons = [];
  }

  /** @param {{ stun?: number, pin?: number, slow?: { factor: number, seconds: number }, poison?: { dps: number, seconds: number } }} fx */
  apply(fx) {
    if (!fx) return this;
    if (fx.stun) this.stunT = Math.max(this.stunT, fx.stun);
    if (fx.pin) this.pinT = Math.max(this.pinT, fx.pin);
    if (fx.slow) this.slows.push({ factor: fx.slow.factor, t: fx.slow.seconds });
    if (fx.poison) this.poisons.push({ dps: fx.poison.dps, t: fx.poison.seconds });
    return this;
  }

  get stunned() { return this.stunT > 0; }
  get pinned() { return this.pinT > 0; }
  get poisoned() { return this.poisons.length > 0; }
  /** Não se mexe (atordoado ou preso). */
  get immobile() { return this.stunT > 0 || this.pinT > 0; }
  /** Multiplicador de velocidade (a lentidão mais forte ativa). */
  get speedFactor() {
    let f = 1;
    for (const s of this.slows) f = Math.min(f, s.factor);
    return f;
  }

  /** Solta o agarrão (o agressor largou). */
  release() { this.pinT = 0; }

  /** @returns {number} dano de veneno neste passo */
  update(dt) {
    this.stunT = Math.max(0, this.stunT - dt);
    this.pinT = Math.max(0, this.pinT - dt);
    let dmg = 0;
    for (const p of this.poisons) { dmg += p.dps * Math.min(dt, p.t); p.t -= dt; }
    for (let i = this.poisons.length - 1; i >= 0; i--) if (this.poisons[i].t <= 0) this.poisons.splice(i, 1);
    for (const s of this.slows) s.t -= dt;
    for (let i = this.slows.length - 1; i >= 0; i--) if (this.slows[i].t <= 0) this.slows.splice(i, 1);
    return dmg;
  }

  clear() {
    this.stunT = 0; this.pinT = 0; this.slows.length = 0; this.poisons.length = 0;
  }
}
