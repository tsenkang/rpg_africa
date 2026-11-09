/**
 * Interiores das casas (gerados perto do jogador e desfeitos longe).
 *
 * Cada móvel:
 *   size: [largura, profundidade] (m) — a pegada no chão (frente = +Z local)
 *   height: altura (m) — faixa da colisão
 *   wall: encosta numa parede (de costas para ela); false = solto no cômodo
 *   mount: preso na parede a esta altura (tochas) — não ocupa o chão
 *   floor: só no chão (tapete): pode ficar sob o caminho, não sob outro tapete
 *   collide: tem colisão (o jogador não atravessa)
 *   parts: peças desenhadas (cada [geo, mat] vira um InstancedMesh)
 *     mat: chave de createMaterials() ou chave de estilo ($wood, $rug, $blanket, $cloth, $pot)
 *   light: luz real (FireLights) { y, color, intensity, range, warm }
 */
export const FURNITURE = {
  bed: {
    size: [1.1, 2.05], height: 0.9, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.2, 0], scale: [1.1, 0.35, 2.05] },
      { geo: 'box', mat: 'whitePaint', pos: [0, 0.44, 0.05], scale: [1.0, 0.15, 1.9] },
      { geo: 'box', mat: '$blanket', pos: [0, 0.53, 0.35], scale: [1.04, 0.06, 1.25] },
      { geo: 'box', mat: '$wood', pos: [0, 0.5, -0.99], scale: [1.1, 0.95, 0.08] },
      { geo: 'sphere', mat: 'whitePaint', pos: [0, 0.57, -0.7], scale: [0.36, 0.09, 0.2] },
    ],
  },
  table: {
    size: [1.3, 0.85], height: 0.8, wall: false, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.76, 0], scale: [1.3, 0.06, 0.85] },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ geo: 'cyl6', mat: '$wood', pos: [a * 0.58, 0.37, b * 0.36], scale: [0.04, 0.74, 0.04] })),
      { geo: 'cyl', mat: 'pottery', pos: [0.25, 0.86, 0.1], scale: [0.1, 0.14, 0.1] },
    ],
  },
  lowTable: {
    size: [1.1, 0.75], height: 0.4, wall: false, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.34, 0], scale: [1.1, 0.06, 0.75] },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ geo: 'box', mat: '$wood', pos: [a * 0.48, 0.16, b * 0.3], scale: [0.07, 0.32, 0.07] })),
      { geo: 'sphere', mat: 'brass', pos: [0, 0.42, 0], scale: [0.14, 0.06, 0.14] },
    ],
  },
  chair: {
    size: [0.48, 0.48], height: 0.95, wall: false, collide: false,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.45, 0], scale: [0.46, 0.05, 0.46] },
      { geo: 'box', mat: '$wood', pos: [0, 0.75, -0.21], scale: [0.46, 0.55, 0.05] },
      ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ geo: 'box', mat: '$wood', pos: [a * 0.19, 0.22, b * 0.19], scale: [0.05, 0.44, 0.05] })),
    ],
  },
  cushion: {
    size: [0.65, 0.65], height: 0.25, wall: false, collide: false,
    parts: [{ geo: 'sphere', mat: '$cloth', pos: [0, 0.1, 0], scale: [0.32, 0.11, 0.32] }],
  },
  wardrobe: {
    size: [1.15, 0.58], height: 2.0, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 1.0, 0], scale: [1.15, 2.0, 0.58] },
      { geo: 'box', mat: 'darkOpening', pos: [0, 1.0, 0.295], scale: [0.02, 1.8, 0.01] },
      { geo: 'sphere', mat: 'brass', pos: [0.08, 1.05, 0.3], scale: [0.03, 0.03, 0.03] },
      { geo: 'sphere', mat: 'brass', pos: [-0.08, 1.05, 0.3], scale: [0.03, 0.03, 0.03] },
    ],
  },
  bookshelf: {
    size: [1.05, 0.36], height: 1.9, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [-0.5, 0.95, 0], scale: [0.05, 1.9, 0.36] },
      { geo: 'box', mat: '$wood', pos: [0.5, 0.95, 0], scale: [0.05, 1.9, 0.36] },
      { geo: 'box', mat: '$wood', pos: [0, 0.95, -0.16], scale: [1.0, 1.9, 0.03] },
      ...[0.05, 0.5, 0.95, 1.4, 1.86].map((y) => ({ geo: 'box', mat: '$wood', pos: [0, y, 0], scale: [1.0, 0.04, 0.34] })),
      ...[0.22, 0.67, 1.12, 1.57].flatMap((y, k) => [
        { geo: 'box', mat: ['clothRed', 'clothBlue', 'clothGreen', 'clothYellow'][k], pos: [-0.25, y, 0.02], scale: [0.4, 0.3, 0.24] },
        { geo: 'box', mat: ['clothGreen', 'clothYellow', 'clothRed', 'clothBlue'][k], pos: [0.22, y - 0.02, 0.02], scale: [0.36, 0.26, 0.24] },
      ]),
    ],
  },
  chest: {
    size: [0.85, 0.52], height: 0.6, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.27, 0], scale: [0.85, 0.54, 0.52] },
      { geo: 'box', mat: 'iron', pos: [0, 0.4, 0], scale: [0.87, 0.05, 0.54] },
      { geo: 'box', mat: 'brass', pos: [0, 0.4, 0.27], scale: [0.1, 0.12, 0.02] },
    ],
  },
  counter: {
    size: [1.5, 0.62], height: 0.95, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: '$wood', pos: [0, 0.43, 0], scale: [1.5, 0.86, 0.62] },
      { geo: 'box', mat: 'stone', pos: [0, 0.89, 0], scale: [1.54, 0.06, 0.66] },
      { geo: 'cyl', mat: 'iron', pos: [-0.35, 1.0, 0], scale: [0.16, 0.16, 0.16] },
      { geo: 'sphere', mat: 'produceRed', pos: [0.3, 0.97, 0.05], scale: [0.06, 0.06, 0.06] },
      { geo: 'sphere', mat: 'produceYellow', pos: [0.42, 0.97, -0.05], scale: [0.06, 0.06, 0.06] },
    ],
  },
  barrel: {
    size: [0.6, 0.6], height: 0.9, wall: true, collide: true,
    parts: [
      { geo: 'cyl', mat: 'wood', pos: [0, 0.45, 0], scale: [0.3, 0.9, 0.3] },
      { geo: 'torus', mat: 'iron', pos: [0, 0.25, 0], rot: [Math.PI / 2, 0, 0], scale: [0.31, 0.31, 0.3] },
      { geo: 'torus', mat: 'iron', pos: [0, 0.65, 0], rot: [Math.PI / 2, 0, 0], scale: [0.31, 0.31, 0.3] },
    ],
  },
  clayPot: {
    size: [0.45, 0.45], height: 0.7, wall: true, collide: true,
    parts: [
      { geo: 'sphere', mat: '$pot', pos: [0, 0.3, 0], scale: [0.22, 0.3, 0.22] },
      { geo: 'cyl', mat: '$pot', pos: [0, 0.62, 0], scale: [0.09, 0.14, 0.09] },
    ],
  },
  rug: {
    size: [2.0, 1.4], height: 0.02, floor: true, collide: false,
    parts: [{ geo: 'box', mat: '$rug', pos: [0, 0.012, 0], scale: [2.0, 0.02, 1.4] }],
  },
  fireplace: {
    size: [1.6, 0.75], height: 1.5, wall: true, collide: true,
    parts: [
      { geo: 'box', mat: 'stone', pos: [0, 0.75, -0.05], scale: [1.6, 1.5, 0.65] },
      { geo: 'box', mat: 'darkOpening', pos: [0, 0.45, 0.28], scale: [0.9, 0.7, 0.02] },
      { geo: 'box', mat: 'stoneDark', pos: [0, 1.52, 0], scale: [1.75, 0.1, 0.78] },
      { geo: 'cyl6', mat: 'log', pos: [0, 0.18, 0.2], rot: [0, 0, Math.PI / 2], scale: [0.06, 0.7, 0.06] },
      { geo: 'cone8', mat: 'flame', pos: [0, 0.38, 0.22], scale: [0.18, 0.4, 0.15] },
    ],
    light: { y: 0.6, z: 0.6, color: 0xff8a3a, intensity: 22, range: 10, warm: true },
  },
  torch: {
    size: [0.2, 0.2], height: 0.4, mount: 1.85, collide: false,
    parts: [
      { geo: 'box', mat: 'iron', pos: [0, 0, 0.06], scale: [0.05, 0.3, 0.12] },
      { geo: 'cyl6', mat: 'woodDark', pos: [0, 0.12, 0.13], scale: [0.03, 0.3, 0.03] },
      { geo: 'cone8', mat: 'flame', pos: [0, 0.33, 0.13], scale: [0.06, 0.16, 0.06] },
    ],
    light: { y: 0.35, z: 0.25, color: 0xffb060, intensity: 9, range: 8, warm: false },
  },
  cobweb: {
    size: [0.1, 0.1], height: 0.1, mount: 0, collide: false, // posição especial: canto do teto
    parts: [{ geo: 'box', mat: 'cobweb', pos: [0, 0, 0], rot: [0.6, 0.78, 0], scale: [0.9, 0.9, 0.01] }],
  },
};

/** Materiais de cada estilo (as chaves `$...` dos móveis). Lista = sorteia uma. */
export const INTERIOR_STYLES = {
  rustic: { $wood: 'woodDark', $rug: ['hide', 'hideLight'], $blanket: ['hide', 'clothRed'], $cloth: 'hide', $pot: 'pottery', fire: 'fireplace' },
  desert: { $wood: 'woodLight', $rug: ['clothRed', 'clothBlue', 'clothYellow', 'clothGreen'], $blanket: ['clothBlue', 'clothYellow'], $cloth: ['clothRed', 'clothYellow', 'clothBlue', 'clothGreen'], $pot: ['adobeRed', 'pottery'], fire: 'torch' },
  tropical: { $wood: 'wood', $rug: ['basket', 'clothGreen'], $blanket: ['clothGreen', 'clothYellow'], $cloth: 'clothGreen', $pot: 'pottery', fire: 'torch' },
  common: { $wood: 'wood', $rug: ['clothRed', 'clothGreen', 'clothBlue'], $blanket: ['clothBlue', 'clothRed'], $cloth: 'clothRed', $pot: 'pottery', fire: 'torch' },
  ruin: { $wood: 'charred', $rug: 'rubble', $blanket: 'hide', $cloth: 'hide', $pot: 'pottery', fire: null, dark: true, broken: true },
};

/** Bioma → estilo (vilas sem `biome` usam o bioma do terreno onde a casa fica). */
export const BIOME_STYLE = {
  taiga: 'rustic', deserto: 'desert', kalahari: 'desert', savana: 'common',
  tropical: 'tropical', equatorial: 'tropical', preta: 'ruin',
};

/**
 * Cômodos e o que vai em cada um (por estilo, troca cadeira por almofada etc.).
 * Quantidade: número fixo ou [mín, máx].
 */
export const ROOM_FURNITURE = {
  single: { bed: 1, chest: 1, table: 1, chair: [1, 2], rug: 1, $fire: 1, clayPot: [0, 2] },
  living: { table: 1, chair: [2, 3], rug: 1, bookshelf: [0, 1], $fire: 1, chest: [0, 1], clayPot: [0, 2] },
  bedroom: { bed: [1, 2], wardrobe: 1, chest: [0, 1], rug: [0, 1], torch: 1 },
  kitchen: { counter: 1, barrel: [1, 2], clayPot: [1, 3], torch: 1 },
};

/** Trocas por estilo: no deserto senta-se em almofadas ao redor de mesa baixa. */
export const STYLE_SWAPS = {
  desert: { chair: 'cushion', table: 'lowTable' },
};

/** Gerência: gera a até `near` m, desfaz além de `far` m, no máx. `perTick` casas por vez. */
export const INTERIOR_STREAM = { near: 32, far: 48, perTick: 2, interval: 0.25, poolSize: 4000 };
