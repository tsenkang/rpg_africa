/**
 * Agarrões entre corpos (Etapa F2): mordida no pescoço dos felinos e rolamento
 * da morte do jacaré. Enquanto dura:
 *  - a vítima fica **presa** (`status.pin`) e leva dano por segundo;
 *  - o agressor fica colado nela (segura pelo dorso/pescoço);
 *  - `drag` > 0 (jacaré): os dois são arrastados para a água.
 * Termina pelo tempo, pela morte de um dos dois, ou se o agressor for
 * atordoado (coice, pancada) — a vítima se solta.
 *
 * Não desenha: a pose "segurando" vem de `AnimalAnimationManager.setHold`.
 * Os corpos precisam de `position {x,z}`, `alive`, `status` (StatusEffects).
 *
 * @example
 *   cas.startGrapple(leao, zebra, { seconds: 2.5, dps: 9 });
 *   cas.update(dt, { damage: (vitima, n, agressor) => …, waterDir: (vitima) => ({x,z}) | null });
 */
export class CombatAnimationSystem {
  constructor() {
    /** @type {{ a: object, v: object, t: number, clamp: object }[]} */
    this.grapples = [];
  }

  /** Agressor já está segurando alguém (ou alguém já segura a vítima)? */
  busy(o) {
    return this.grapples.some((g) => g.a === o || g.v === o);
  }

  startGrapple(a, v, clamp) {
    if (this.busy(a) || this.busy(v)) return null;
    const g = { a, v, t: 0, clamp };
    v.status?.apply({ pin: clamp.seconds });
    a.onGrapple?.(true, clamp);
    this.grapples.push(g);
    return g;
  }

  end(g) {
    g.v.status?.release();
    g.a.onGrapple?.(false, g.clamp);
    this.grapples.splice(this.grapples.indexOf(g), 1);
  }

  /**
   * @param {number} dt
   * @param {{ damage?: (v: object, n: number, a: object) => void, waterDir?: (v: object) => ({x:number,z:number}|null) }} deps
   */
  update(dt, deps = {}) {
    for (let i = this.grapples.length - 1; i >= 0; i--) {
      const g = this.grapples[i], { a, v, clamp } = g;
      if (!a.alive || !v.alive || a.status?.stunned) { this.end(g); continue; }
      g.t += dt;
      deps.damage?.(v, clamp.dps * dt, a);
      if (clamp.drag) {
        const w = deps.waterDir?.(v);
        if (w) { v.position.x += w.x * clamp.drag * dt; v.position.z += w.z * clamp.drag * dt; }
      }
      // Agressor colado na vítima (0,9 m), do lado de onde veio.
      const dx = a.position.x - v.position.x, dz = a.position.z - v.position.z, d = Math.hypot(dx, dz) || 1;
      a.position.x = v.position.x + (dx / d) * 0.9;
      a.position.z = v.position.z + (dz / d) * 0.9;
      if (g.t >= clamp.seconds || !v.alive) this.end(g);
    }
  }
}
