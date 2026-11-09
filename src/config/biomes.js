/**
 * Definição dos 7 biomas.
 *
 * - seeds: centros (u, v) na imagem de referência. Cada ponto do mapa recebe
 *   o bioma da semente mais próxima, com bordas distorcidas por ruído e
 *   misturadas suavemente (transições naturais, sem linhas retas).
 * - maskColor: cor usada quando REFERENCE_MAP.useAsBiomeMask = true.
 * - ground: cores do solo (sRGB).
 * - ambience: iluminação, céu e neblina aplicados ao entrar no bioma.
 * - vegetation: árvores/arbustos/rochas por hectare (10.000 m²).
 * - grass: densidade (0..1), altura média (m) e cores da grama.
 */
export const BIOMES = [
  {
    id: 'savana',
    name: 'Savana',
    seeds: [[0.15, 0.15], [0.27, 0.26], [0.07, 0.3], [0.3, 0.12]],
    maskColor: 0xc9a64f,
    ground: { base: 0xa88d55, alt: 0x8f7446, dry: 0xb59a62 },
    ambience: {
      fogColor: 0xdcc8a3, fogDensity: 0.00045,
      skyTop: 0x3f78c2, skyHorizon: 0xe6d3ad,
      sunColor: 0xfff0d2, sunIntensity: 3.3,
      hemiSky: 0xd2e2f7, hemiGround: 0x8a6c42, hemiIntensity: 1.0,
      exposure: 1.0,
    },
    vegetation: [
      { type: 'acacia', density: 4 },
      { type: 'baobab', density: 0.35 },
      { type: 'shrub', density: 9 },
      { type: 'rock', density: 1.2 },
    ],
    grass: { density: 0.95, height: 0.85, base: 0x8a7a3e, tip: 0xd8c27a },
  },
  {
    id: 'taiga',
    name: 'Taiga',
    seeds: [[0.37, 0.07], [0.47, 0.06], [0.58, 0.06], [0.5, 0.16], [0.42, 0.17]],
    maskColor: 0xdfe6ec,
    ground: { base: 0x3b4630, alt: 0x4d5238, dry: 0x5b5a44 },
    ambience: {
      fogColor: 0xb8c5cf, fogDensity: 0.0009,
      skyTop: 0x56799f, skyHorizon: 0xc8d2da,
      sunColor: 0xe9f0ff, sunIntensity: 2.4,
      hemiSky: 0xc9d8ea, hemiGround: 0x485040, hemiIntensity: 1.0,
      exposure: 0.95,
    },
    vegetation: [
      { type: 'spruce', density: 70 },
      { type: 'pine', density: 18 },
      { type: 'rock', density: 5 },
    ],
    grass: { density: 0.45, height: 0.3, base: 0x2f3f24, tip: 0x6f7f4a },
  },
  {
    id: 'deserto',
    name: 'Deserto',
    seeds: [[0.76, 0.14], [0.88, 0.2], [0.68, 0.27], [0.92, 0.08]],
    maskColor: 0xe0943c,
    ground: { base: 0xd9ad6c, alt: 0xc99858, dry: 0xe6be82 },
    ambience: {
      fogColor: 0xecd0a2, fogDensity: 0.0004,
      skyTop: 0x3c74c0, skyHorizon: 0xf2dbb0,
      sunColor: 0xfff2d6, sunIntensity: 3.9,
      hemiSky: 0xd7e6ff, hemiGround: 0xb68b52, hemiIntensity: 1.05,
      exposure: 0.98,
    },
    vegetation: [
      { type: 'dryShrub', density: 1.8 },
      { type: 'palm', density: 0.3, nearWater: true },
      { type: 'rock', density: 2.5 },
    ],
    grass: { density: 0.04, height: 0.4, base: 0x8f7a48, tip: 0xc9b07a },
  },
  {
    id: 'kalahari',
    name: 'Deserto de Kalahari',
    seeds: [[0.5, 0.93], [0.4, 0.91], [0.59, 0.86], [0.33, 0.95]],
    maskColor: 0xc8552b,
    ground: { base: 0xb4683a, alt: 0xa65a30, dry: 0xc07a48 },
    ambience: {
      fogColor: 0xe3bb8e, fogDensity: 0.0005,
      skyTop: 0x4778bb, skyHorizon: 0xecc59c,
      sunColor: 0xffe6c2, sunIntensity: 3.5,
      hemiSky: 0xd6e2f5, hemiGround: 0x9c5a32, hemiIntensity: 1.0,
      exposure: 1.0,
    },
    vegetation: [
      { type: 'camelthorn', density: 2.5 },
      { type: 'shrub', density: 7 },
      { type: 'dryShrub', density: 5 },
      { type: 'rock', density: 1 },
    ],
    grass: { density: 0.45, height: 0.6, base: 0x8c7440, tip: 0xd9c286 },
  },
  {
    id: 'tropical',
    name: 'Floresta Tropical',
    seeds: [[0.1, 0.5], [0.22, 0.6], [0.11, 0.78], [0.26, 0.82], [0.2, 0.44]],
    maskColor: 0x3f7a2c,
    ground: { base: 0x34502a, alt: 0x3f5a2c, dry: 0x51603a },
    ambience: {
      fogColor: 0xb4c8b0, fogDensity: 0.0011,
      skyTop: 0x5689c2, skyHorizon: 0xcfe0cf,
      sunColor: 0xfff4dc, sunIntensity: 2.9,
      hemiSky: 0xcfe5da, hemiGround: 0x3e5a2a, hemiIntensity: 1.0,
      exposure: 1.0,
    },
    vegetation: [
      { type: 'broadleaf', density: 38 },
      { type: 'palm', density: 6 },
      { type: 'banana', density: 16 },
      { type: 'bush', density: 22 },
      { type: 'rock', density: 1.5 },
    ],
    grass: { density: 0.85, height: 0.55, base: 0x2e5222, tip: 0x7fa55a },
  },
  {
    id: 'equatorial',
    name: 'Floresta Equatorial',
    seeds: [[0.83, 0.48], [0.93, 0.44], [0.72, 0.53], [0.9, 0.6]],
    maskColor: 0x1f5a24,
    ground: { base: 0x26401c, alt: 0x31481f, dry: 0x3f4a2a },
    ambience: {
      fogColor: 0x9fb39a, fogDensity: 0.0017,
      skyTop: 0x6a8ca6, skyHorizon: 0xb7c6b0,
      sunColor: 0xfff1d6, sunIntensity: 2.5,
      hemiSky: 0xc4d6c8, hemiGround: 0x34442a, hemiIntensity: 1.0,
      exposure: 0.97,
    },
    vegetation: [
      { type: 'kapok', density: 5 },
      { type: 'broadleaf', density: 48 },
      { type: 'banana', density: 10 },
      { type: 'bush', density: 30 },
    ],
    grass: { density: 0.75, height: 0.7, base: 0x22401a, tip: 0x5f8f3e },
  },
  {
    id: 'preta',
    name: 'Floresta Preta',
    seeds: [[0.78, 0.78], [0.88, 0.86], [0.68, 0.88], [0.93, 0.72]],
    maskColor: 0x2c3a52,
    ground: { base: 0x1a201c, alt: 0x232a26, dry: 0x2b2f2a },
    ambience: {
      fogColor: 0x3f4954, fogDensity: 0.0032,
      skyTop: 0x2b3746, skyHorizon: 0x515c68,
      sunColor: 0xa6b6cc, sunIntensity: 1.25,
      hemiSky: 0x6c7c92, hemiGround: 0x151a18, hemiIntensity: 0.85,
      exposure: 0.9,
    },
    vegetation: [
      { type: 'blackTree', density: 62 },
      { type: 'deadTree', density: 6 },
      { type: 'bush', density: 14 },
      { type: 'rock', density: 3 },
    ],
    grass: { density: 0.5, height: 0.4, base: 0x16211f, tip: 0x3b4f52 },
  },
];

export const BIOME_INDEX = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

/** Ambiente usado nas masmorras subterrâneas. */
export const UNDERGROUND_AMBIENCE = {
  fogColor: 0x0b0a0d, fogDensity: 0.028,
  skyTop: 0x000000, skyHorizon: 0x0b0a0d,
  sunColor: 0x000000, sunIntensity: 0,
  hemiSky: 0x8a7a9a, hemiGround: 0x2a2018, hemiIntensity: 1.1,
  exposure: 1.35,
};

/** Rios (u, v) — nascem nas montanhas/lago e correm para o mar. */
export const RIVERS = [
  { width: 22, points: [[0.49, 0.0], [0.505, 0.09], [0.49, 0.215]] },
  { width: 18, points: [[0.33, 0.0], [0.36, 0.12], [0.415, 0.245]] },
  { width: 26, points: [[0.63, 0.5], [0.75, 0.56], [0.88, 0.6], [1.0, 0.62]] },
  { width: 24, points: [[0.5, 0.74], [0.484, 0.84], [0.47, 0.93], [0.46, 1.0]] },
  { width: 20, points: [[0.37, 0.47], [0.24, 0.42], [0.12, 0.44], [0.0, 0.42]] },
];
