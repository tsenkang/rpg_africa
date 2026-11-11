/**
 * Caça anatômica, arremesso/arco, sangramento com rastro, esfolamento,
 * fogueira (cozinhar/ferver) e água de rio. Tudo em metros e segundos.
 */

/** Armas da hotbar que arremessam/atiram. `ammo` sai da mochila; sem ammo, o próprio item voa. */
export const WEAPONS = {
  lanca_simples: { kind: 'spear', damage: 14, speed: 20, breakChance: 0.1, length: 1.9 },
  lanca_pedra: { kind: 'spear', damage: 26, speed: 21, breakChance: 0.08, length: 1.9 },
  arco: { kind: 'bow', ammo: 'flecha', damage: 20, speed: 40, breakChance: 0.5, length: 0.8 },
};

export const PROJECTILE = {
  gravity: -9.8,
  maxLife: 8, // s voando antes de sumir (caiu no vazio)
  pickupRadius: 2.2, // m para pegar a lança/flecha do chão
  sink: 0.25, // m que afunda no chão ao cravar
  lift: 0.03, // ligeira elevação no lançamento (arco de arremesso)
};

/**
 * Zonas da hitbox (frações no espaço local da caixa, −0,5..0,5):
 * cabeça = frente da caixa (z > headFront) e acima de headTop;
 * pernas = abaixo de legsBelow; corpo = o resto.
 */
export const HIT_ZONES = { headFront: 0.2, headTop: -0.05, legsBelow: -0.14 };

export const ZONE_EFFECTS = {
  head: { multiplier: Infinity, label: 'cabeça — abate instantâneo' },
  body: { multiplier: 1, bleed: true, label: 'corpo — sangrando, foge' },
  legs: { multiplier: 0.7, slow: true, label: 'pernas — mancando' },
};

/** Sangramento do animal ferido no corpo: perde vida até cair, deixando sangue e pegadas. */
export const BLEED = {
  healthPerSecond: 2.4,
  trailEvery: 1.3, // m andados entre gotas de sangue
  printEvery: 0.9, // m entre pegadas (só sangrando: é o rastro para seguir)
  slowSeconds: 25, // tiro nas pernas: manca por N s
  slowFactor: 0.5,
  bloodAtHit: 3, // gotas no ponto do acerto
};

export const TRAILS = { max: 900, life: 240, bloodSize: 0.16, printSize: 0.12 };

/**
 * Esfolamento: segurar E perto da carcaça com uma faca equipada. O corpo
 * vira peças FÍSICAS no chão (props): carne, pele, ossos, tripas/penas.
 */
export const SKINNING = {
  holdSeconds: 2.6,
  radius: 2.6,
  knives: ['faca_osso', 'faca_pedra'],
  dirt: 18,
  sizeThresholds: { medium: 0.7, large: 1.3 }, // spec.size do animal
  loot: {
    small: { carne: 1, osso: 1, tripas: 1 },
    medium: { carne: 2, pele: 1, osso: 2, tripas: 1 },
    large: { carne: 4, pele: 2, osso: 3, tripas: 2 },
    bird: { carne: 1, pena: 3, osso: 1 },
  },
  birdModels: ['bird'],
  tossSpeed: 1.6, // m/s com que as peças pulam da carcaça
  poolPerType: 24,
};

/** Fogueira: assar/ferver e recolher cinza. */
export const COOKING = {
  radius: 3.2,
  recipes: { carne_crua: 'carne_assada', agua_rio: 'agua_fervida', agua_poco: 'agua_fervida', larvas_carne: 'larva_assada', cogumelo: 'cogumelo' },
  ashCooldown: 90, // s entre cinzas da mesma fogueira
};

/** Rio/lago à frente (água doce): beber, encher o cantil, lavar-se. */
export const WATER = { reach: 1.8, probe: 1.4 };
