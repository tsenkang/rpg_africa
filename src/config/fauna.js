/**
 * Fauna regional (data-driven). Cada espécie tem um comportamento:
 *
 *  - 'flee'     foge quando o jogador chega perto ou bate (zebra, alce…)
 *  - 'aggressive' persegue e ataca quando o jogador chega perto (leão, lobo…)
 *  - 'stalker'  ataca furtivamente: se aproxima agachado e devagar, depois dá o bote (onça)
 *  - 'pack'     agressivo em grupo: quando um vê ou apanha, o bando todo ataca (hiena)
 *  - 'neutral'  ignora o jogador; só ataca depois de apanhar (gorila)
 *  - 'burrow'   foge e se enterra (some no chão) (suricato)
 *  - 'fly'      levanta voo ao se aproximar (corvo)
 *
 * `swims`: pode entrar na água (capivara). Os outros evitam rios e lagos.
 * `model`: forma do placeholder procedural (sem modelo 3D em `src/config/animalModels.js`).
 * Distâncias em metros, velocidades em m/s, tempos em segundos.
 */
export const SPECIES = {
  zebra: { nome: 'Zebra', behavior: 'flee', model: 'horse', size: 1.35, color: 0xeeeeee, stripe: 0x1a1a1a,
    walk: 1.4, run: 11, health: 30, sense: 18, group: [3, 6] },
  leao: { nome: 'Leão', behavior: 'aggressive', model: 'cat', size: 1.2, color: 0xc89a52, mane: 0x6a4020,
    walk: 1.3, run: 9.5, health: 60, damage: 18, attackRange: 1.9, attackCooldown: 1.4, sense: 16, giveUp: 45, group: [1, 3] },
  lobo: { nome: 'Lobo', behavior: 'aggressive', model: 'dog', size: 0.85, color: 0x77736c,
    walk: 1.5, run: 9, health: 35, damage: 10, attackRange: 1.5, attackCooldown: 1.1, sense: 20, giveUp: 50, group: [2, 4] },
  alce: { nome: 'Alce', behavior: 'flee', model: 'deer', size: 1.7, color: 0x5a3e28, antlers: 0xc8b48a,
    walk: 1.3, run: 9, health: 50, sense: 16, group: [1, 3] },
  escorpiao: { nome: 'Escorpião Gigante', behavior: 'aggressive', model: 'scorpion', size: 0.75, color: 0x2a2018,
    walk: 1.2, run: 4.5, health: 40, damage: 14, attackRange: 1.6, attackCooldown: 1.6, sense: 10, giveUp: 25, group: [1, 2] },
  onca: { nome: 'Onça', behavior: 'stalker', model: 'cat', size: 1.0, color: 0xc89040, spots: 0x2a1a10,
    walk: 1.2, run: 10, stalk: 1.6, pounceRange: 7, health: 50, damage: 20, attackRange: 1.8, attackCooldown: 1.3, sense: 22, giveUp: 40, group: [1, 1] },
  capivara: { nome: 'Capivara', behavior: 'flee', model: 'rodent', size: 0.55, color: 0x7a5a3a, swims: true,
    walk: 0.9, run: 5.5, health: 20, sense: 9, group: [2, 5] },
  hiena: { nome: 'Hiena', behavior: 'pack', model: 'dog', size: 0.8, color: 0x9a8058, spots: 0x3a2a1a,
    walk: 1.4, run: 8.5, health: 30, damage: 8, attackRange: 1.5, attackCooldown: 1.0, sense: 18, giveUp: 45, group: [3, 5] },
  suricato: { nome: 'Suricato', behavior: 'burrow', model: 'meerkat', size: 0.3, color: 0xb89a6a,
    walk: 0.8, run: 4.5, health: 6, sense: 10, burrowAfter: 1.5, group: [3, 6] },
  gorila: { nome: 'Gorila', behavior: 'neutral', model: 'ape', size: 1.6, color: 0x24221f,
    walk: 0.9, run: 7, health: 90, damage: 22, attackRange: 2.0, attackCooldown: 1.6, sense: 8, giveUp: 30, group: [1, 3] },
  leopardo: { nome: 'Leopardo', behavior: 'stalker', model: 'cat', size: 0.9, color: 0xd8b060, spots: 0x1a120a,
    walk: 1.2, run: 10.5, stalk: 1.7, pounceRange: 6.5, health: 45, damage: 16, attackRange: 1.7, attackCooldown: 1.2, sense: 20, giveUp: 40, group: [1, 1] },
  javali: { nome: 'Javali Corrompido', behavior: 'aggressive', model: 'boar', size: 0.9, color: 0x2a1f1c, glow: 0x9a1aff,
    walk: 1.1, run: 8, health: 45, damage: 12, attackRange: 1.5, attackCooldown: 1.2, sense: 14, giveUp: 35, group: [1, 3] },
  corvo: { nome: 'Corvo', behavior: 'fly', model: 'bird', size: 0.35, color: 0x0e0e12,
    walk: 0.6, run: 9, health: 4, sense: 9, group: [3, 7] },
};

/** Espécies por bioma (id de `BIOMES`) com peso relativo de sorteio. */
export const BIOME_FAUNA = {
  savana: { zebra: 3, leao: 1 },
  taiga: { lobo: 2, alce: 2 },
  deserto: { escorpiao: 1 },
  tropical: { onca: 1, capivara: 3 },
  kalahari: { hiena: 2, suricato: 3 },
  equatorial: { gorila: 2, leopardo: 1 },
  preta: { javali: 2, corvo: 3 },
};

/** Spawner: mantém alguns grupos vivos perto do jogador. */
export const FAUNA = {
  maxAnimals: 16,
  spawnMin: 28, // m do jogador
  spawnMax: 65,
  despawn: 120, // some quando fica mais longe que isto
  spawnInterval: 1.5, // s entre tentativas de spawn
  villageMargin: 25, // não nasce dentro (nem perto) das vilas
  idleTime: [2, 6], // s parado antes de passear
  wanderTime: [3, 7], // s passeando
  wanderRadius: 14, // m em volta do ponto onde nasceu
  fleeTime: 6, // s fugindo antes de se acalmar
  corpseSeconds: 8,
  burrowSeconds: 1.2, // s afundando no chão
};

// Modelos 3D dos animais: `src/config/animalModels.js` (fica separado porque usa
// `import.meta.env`, e este arquivo é importado pelos testes no Node).
