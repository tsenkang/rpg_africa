/**
 * Combate biomimético por espécie (Etapa F2). Cada entrada:
 *  - style: estilo da animação de ataque (`ANIMATION.attack[style]`)
 *  - stats: dano/alcance/recarga para quem antes só fugia (girafa, alce, zebra, camelo)
 *  - effect: o que o golpe causa — slow (lentidão), stun (atordoa), poison (veneno), knockback (m)
 *  - clamp: agarrão depois do golpe (pescoço dos felinos, rolamento do jacaré): s, dano/s, drag (m/s para a água)
 *  - burst: arrancada de emboscada perto da presa (range m, mult ×)
 *  - flank: circula para morder por trás (offset m atrás da vítima)
 *  - rearKick: coice traseiro em quem chega por trás
 *  - aoe: raio da pancada no chão (atinge todos em volta)
 *
 * @example
 *   FAUNA_COMBAT.leao.clamp.seconds; // 2,5 s travado no pescoço
 */
export const FAUNA_COMBAT = {
  // Superpredadores
  leao: { style: 'pounce', burst: { range: 14, mult: 1.4 }, clamp: { seconds: 2.5, dps: 9, label: 'mordida no pescoço' } },
  onca: { style: 'pounce', burst: { range: 12, mult: 1.35 }, clamp: { seconds: 2.2, dps: 8, label: 'mordida no crânio' } },
  urso: { style: 'maul', effect: { knockback: 2.5 } },
  jacare: { style: 'deathRoll', clamp: { seconds: 3, dps: 11, drag: 2.2, label: 'rolamento da morte' } },
  cerbero: { style: 'bite', effect: { knockback: 1.5 } },
  // Matilhas e mesopredadores
  lobo: { style: 'flankBite', flank: { offset: 2.2, maxDist: 16 }, burst: { range: 10, mult: 1.25 }, effect: { slow: { factor: 0.6, seconds: 4 } } },
  hiena: { style: 'flankBite', flank: { offset: 2.0, maxDist: 14 }, effect: { slow: { factor: 0.7, seconds: 3 } } },
  leopardo: { style: 'pounce', burst: { range: 10, mult: 1.35 }, clamp: { seconds: 1.8, dps: 6, label: 'mordida no pescoço' } },
  javali: { style: 'headbutt', effect: { knockback: 1.8 } },
  // Grandes herbívoros: neutros até serem atacados; revidam com força
  girafa: { style: 'neckHoof', stats: { damage: 28, attackRange: 3.2, attackCooldown: 1.8 }, effect: { stun: 1.6, knockback: 3 } },
  alce: { style: 'rearKick', stats: { damage: 16, attackRange: 2.4, attackCooldown: 1.5 }, effect: { stun: 1.4, knockback: 1.5 }, rearKick: true },
  camelo: { style: 'headbutt', stats: { damage: 12, attackRange: 2.4, attackCooldown: 1.6 }, effect: { knockback: 1.5 } },
  gorila: { style: 'groundPound', effect: { stun: 1.0, knockback: 1.5 }, aoe: 3 },
  // Presas
  zebra: { style: 'rearKick', stats: { damage: 12, attackRange: 2.2, attackCooldown: 1.5 }, effect: { stun: 1.2, knockback: 1.2 }, rearKick: true },
  // Pequenos venenosos
  escorpiao: { style: 'sting', effect: { poison: { dps: 2.5, seconds: 8 } } },
  vibora: { style: 'peck', effect: { poison: { dps: 3, seconds: 8 } } },
};

/** Coice traseiro: alcance, cone de trás e recarga. */
export const REAR_KICK = { range: 2.6, rearCos: -0.35, cooldown: 2.5 };

/** Grandes herbívoros (nível 3) atacados revidam em vez de fugir. */
export const RETALIATE = { radius: 40 };
