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
};
