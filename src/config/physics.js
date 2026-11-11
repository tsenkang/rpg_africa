/**
 * Física (cannon-es). O mundo de física é "transmitido": só existe perto do
 * jogador — um pedaço de terreno (heightfield), os colisores estáticos
 * (paredes, rochas, poços, cercas, plataformas) e os objetos dinâmicos num
 * raio `radius`. Ao andar `rebuildDistance` metros, tudo é refeito em volta.
 * Objetos fora do raio ficam congelados onde pararam.
 *
 * - gravity: m/s²
 * - step: passo fixo da simulação (s); maxSubSteps: limite por quadro
 * - heightfieldStep: resolução do terreno físico (m)
 * - staticHeight: altura (m) dos colisores sem faixa definida (paredes "infinitas" do controle 2D)
 * - player: raio do corpo cinemático que empurra os objetos e força do soco
 */
export const PHYSICS = {
  gravity: -9.82,
  step: 1 / 60,
  maxSubSteps: 3,
  radius: 55,
  /** Colisores gerados automaticamente (WorldColliders) só viram corpo no cannon neste raio (m): são muitos e pequenos. */
  staticRadius: 30,
  rebuildDistance: 18,
  heightfieldStep: 2,
  staticHeight: 7,
  sleep: { speed: 0.12, time: 0.6 },
  friction: 0.45,
  restitution: 0.08,
  player: { radius: 0.42, height: 1.2, punchForce: 26, punchLift: 0.35, punchRange: 2.2 },
};

/**
 * Tipos de objeto dinâmico. `shape` é o colisor; `parts` são as malhas
 * (cada parte vira um InstancedMesh: 1 draw call por parte, para todos os
 * objetos do tipo). Medidas em metros, no tamanho 1 (`scale` multiplica).
 *   shape: { type: 'box', half: [x, y, z] } | { type: 'cylinder', r, h }
 *   parts: [{ geo, mat, pos?: [x,y,z], rot?: [x,y,z], scale: [x,y,z] }]
 *     geo: box | cyl | cyl6 | torus | sphere   ·   mat: chave de createMaterials()
 */
export const PROP_TYPES = {
  barrel: {
    mass: 18, shape: { type: 'cylinder', r: 0.33, h: 0.9 },
    parts: [
      { geo: 'cyl', mat: 'wood', scale: [0.33, 0.9, 0.33] },
      { geo: 'torus', mat: 'iron', pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0], scale: [0.34, 0.34, 0.3] },
      { geo: 'torus', mat: 'iron', pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0], scale: [0.34, 0.34, 0.3] },
    ],
  },
  crate: {
    mass: 12, shape: { type: 'box', half: [0.4, 0.4, 0.4] },
    parts: [
      { geo: 'box', mat: 'woodLight', scale: [0.8, 0.8, 0.8] },
      { geo: 'box', mat: 'woodDark', scale: [0.84, 0.1, 0.84], pos: [0, 0.3, 0] },
      { geo: 'box', mat: 'woodDark', scale: [0.84, 0.1, 0.84], pos: [0, -0.3, 0] },
    ],
  },
  plank: {
    mass: 4, shape: { type: 'box', half: [0.13, 0.025, 0.9] },
    parts: [{ geo: 'box', mat: 'wood', scale: [0.26, 0.05, 1.8] }],
  },
  log: {
    mass: 9, shape: { type: 'box', half: [0.14, 0.14, 0.7] },
    parts: [{ geo: 'cyl6', mat: 'log', rot: [Math.PI / 2, 0, 0], scale: [0.14, 1.4, 0.14] }],
  },
  sack: {
    mass: 10, shape: { type: 'box', half: [0.24, 0.3, 0.18] },
    parts: [{ geo: 'sphere', mat: 'basket', scale: [0.26, 0.32, 0.2] }],
  },
  lantern: {
    mass: 1.5, shape: { type: 'box', half: [0.1, 0.17, 0.1] },
    parts: [
      { geo: 'box', mat: 'iron', scale: [0.2, 0.04, 0.2], pos: [0, 0.16, 0] },
      { geo: 'box', mat: 'iron', scale: [0.2, 0.04, 0.2], pos: [0, -0.16, 0] },
      { geo: 'box', mat: 'runeGlow', scale: [0.15, 0.28, 0.15] },
    ],
  },
  branch: {
    mass: 3, shape: { type: 'box', half: [0.06, 0.06, 0.8] },
    parts: [{ geo: 'cyl6', mat: 'charred', rot: [Math.PI / 2, 0, 0.2], scale: [0.06, 1.6, 0.06] }],
  },
  pot: {
    mass: 6, shape: { type: 'cylinder', r: 0.27, h: 0.78 },
    parts: [
      { geo: 'sphere', mat: 'pottery', pos: [0, -0.06, 0], scale: [0.28, 0.33, 0.28] },
      { geo: 'cyl', mat: 'pottery', pos: [0, 0.3, 0], scale: [0.1, 0.16, 0.1] },
    ],
  },
  stone: {
    mass: 14, shape: { type: 'box', half: [0.22, 0.14, 0.18] },
    parts: [{ geo: 'sphere', mat: 'stone', scale: [0.24, 0.16, 0.2] }],
  },
  tool: { // enxada largada no chão: cabo + lâmina
    mass: 2, shape: { type: 'box', half: [0.12, 0.03, 0.62] },
    parts: [
      { geo: 'cyl6', mat: 'wood', rot: [Math.PI / 2, 0, 0], scale: [0.025, 1.2, 0.025] },
      { geo: 'box', mat: 'iron', pos: [0, 0, 0.58], scale: [0.24, 0.03, 0.1] },
    ],
  },
  // ---- Peças de carcaça (esfolamento): `item` = o que vai para a mochila ao pegar.
  carne: { mass: 3, item: 'carne_crua', shape: { type: 'box', half: [0.16, 0.09, 0.12] }, parts: [{ geo: 'sphere', mat: 'meat', scale: [0.17, 0.1, 0.13] }] },
  pele: { mass: 2, item: 'pele_animal', shape: { type: 'box', half: [0.28, 0.03, 0.22] }, parts: [{ geo: 'box', mat: 'hide', scale: [0.56, 0.05, 0.44] }] },
  osso: {
    mass: 1.5, item: 'osso', shape: { type: 'box', half: [0.05, 0.05, 0.22] },
    parts: [
      { geo: 'cyl6', mat: 'bone', rot: [Math.PI / 2, 0, 0], scale: [0.045, 0.44, 0.045] },
      { geo: 'sphere', mat: 'bone', pos: [0, 0, 0.22], scale: [0.07, 0.07, 0.07] },
      { geo: 'sphere', mat: 'bone', pos: [0, 0, -0.22], scale: [0.07, 0.07, 0.07] },
    ],
  },
  tripas: { mass: 1, item: 'tripas', shape: { type: 'box', half: [0.12, 0.06, 0.12] }, parts: [{ geo: 'torus', mat: 'gut', rot: [Math.PI / 2, 0, 0], scale: [0.1, 0.1, 0.5] }] },
  pena: { mass: 0.2, item: 'pena', shape: { type: 'box', half: [0.03, 0.01, 0.12] }, parts: [{ geo: 'box', mat: 'feather', scale: [0.06, 0.01, 0.24] }] },
};

/**
 * Gerador automático de colisores estáticos (WorldColliders / applyWorldPhysics).
 * Toda peça estática da cena que não tem colisor feito à mão ganha um.
 *
 * - stepHeight: peça com topo até esta altura acima do chão é degrau/tapete (passa por cima)
 * - minSize: peça mais fina que isto (m) nos dois eixos do chão é ignorada (enfeite, fio)
 * - maxSize: peça maior que isto (m) é céu/terreno/água, nunca parede
 * - surfaceSnap: topo a até esta distância (m) de uma superfície andável = piso/rampa (não bloqueia)
 * - ladderClear: raio livre (m) em volta do pé de cada escada de mão
 * - circleRatio: cilindro/cone/esfera em pé com X/Z até esta razão vira círculo
 * - uprightTilt: inclinação máx. (rad) para um sólido de revolução contar como "em pé"
 * - maxInstances: InstancedMesh com mais instâncias que isto é ignorado (capim, partículas)
 */
export const WORLD_COLLIDERS = {
  stepHeight: 0.35,
  minSize: 0.05,
  maxSize: 90,
  surfaceSnap: 0.4,
  ladderClear: 0.9,
  circleRatio: 1.35,
  uprightTilt: 0.3,
  maxInstances: 4000,
};

/**
 * Movimento do jogador em sub-passos: o deslocamento de um quadro é dividido
 * em pedaços de no máximo `fraction × raio`, para não atravessar poste fino
 * correndo ou em viagem rápida (até `maxSteps` por quadro).
 */
export const MOVE_SUBSTEP = { fraction: 0.5, maxSteps: 48 };

/**
 * Colisão sólida da vegetação: raio do tronco (m) de cada espécie no tamanho
 * 1 (multiplicado pela escala de cada árvore). Física universal: arbustos
 * também seguram o jogador. Rochas: raio = escala × `rock`, a partir de
 * `rockMin` de escala (0 = todas).
 */
export const TREE_COLLIDERS = {
  acacia: 0.35, baobab: 1.5, banana: 0.16, broadleaf: 0.45, camelthorn: 0.28,
  kapok: 1.1, palm: 0.24, pine: 0.3, spruce: 0.3, bush: 0.45, shrub: 0.32,
  rock: 0.8, rockMin: 0,
};

/** Escadas de mão: velocidade de subida (m/s) e alcance para agarrar (m). */
export const CLIMB = { speed: 2.4, reach: 0.95, facing: 0.35, detachPush: 0.6 };

/**
 * Limite de inclinação (Max Slope Limit) para jogador, animais e NPCs.
 * Acima de `maxAngleDeg` o chão é inacessível: não se sobe, e quem pisa nele escorrega.
 */
export const SLOPE = {
  maxAngleDeg: 45,
  cosMax: Math.cos((45 * Math.PI) / 180), // 0,7071 — N·UP abaixo disto = íngreme
  tanMax: Math.tan((45 * Math.PI) / 180), // 1 — subida máxima por metro andado
  stepHeight: 0.35, // m: degrau/pedra que se sobe mesmo acima do limite (borda de calçada, raiz)
  normalSample: 1.0, // m: meia-distância da amostra da normal (suaviza as arestas dos triângulos)
  onTerrainEps: 0.08, // m: pés a esta distância do relevo = pisando no terreno (não em piso/ponte/degrau)
  gravity: 20, // m/s² (a mesma do jogador, em módulo)
  friction: 0.35, // fração da aceleração perdida no cascalho
  maxSlideSpeed: 9, // m/s
  stopSpeed: 0.4, // abaixo disto (em chão andável) o corpo para de escorregar
  settle: 6, // 1/s: quão rápido o escorregão morre ao chegar no plano
  probeDist: 2.0, // m à frente que a IA testa antes de seguir
  steerAngles: [0.5, 1.0, 1.5, 2.1], // rad: desvios testados (dos dois lados) para contornar
  skidCooldown: 0.7, // s entre sons de derrapagem
};
