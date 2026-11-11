/**
 * Regras puras de tática de ataque (sem Three.js).
 *
 * @example
 *   const alvo = flankPoint(vitima.position, frenteDaVitima, lobo.position, 2.2); // calcanhar
 *   if (isBehind(zebra.position, frenteDaZebra, leao.position, -0.35)) coice();
 */

/**
 * Ponto de flanco: atrás da vítima e para o lado de onde o atacante vem
 * (lobos e hienas mordem os calcanhares, não a frente).
 * @param {{x:number,z:number}} victim
 * @param {{x:number,z:number}} fwd frente da vítima (unitária)
 * @param {{x:number,z:number}} attacker
 * @param {number} offset m atrás da vítima
 */
export function flankPoint(victim, fwd, attacker, offset) {
  const rx = fwd.z, rz = -fwd.x; // direita da vítima
  const side = (attacker.x - victim.x) * rx + (attacker.z - victim.z) * rz >= 0 ? 1 : -1;
  return {
    x: victim.x - fwd.x * offset + rx * side * offset * 0.6,
    z: victim.z - fwd.z * offset + rz * side * offset * 0.6,
  };
}

/**
 * `other` está no cone traseiro de quem olha para `fwd`? (coice de zebra/alce)
 * @param {number} rearCos cos do cone traseiro (−0,35 ≈ 110° atrás)
 */
export function isBehind(self, fwd, other, rearCos) {
  const dx = other.x - self.x, dz = other.z - self.z, d = Math.hypot(dx, dz) || 1;
  return (dx * fwd.x + dz * fwd.z) / d <= rearCos;
}

/**
 * Arrancada de emboscada: perto da presa e com energia, o predador corre mais.
 * @param {number} run velocidade normal (m/s)
 * @param {number} dist m até a presa
 * @param {{ range: number, mult: number } | undefined} burst
 * @param {number} energy 0..1
 */
export function burstSpeed(run, dist, burst, energy, minEnergy = 0.25) {
  if (!burst || dist > burst.range || energy < minEnergy) return run;
  return run * burst.mult;
}
