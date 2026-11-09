/**
 * Árvores 3D de verdade (pacote "Oak trees pack — 17 var, LODs, seasons").
 *
 * O GLB original (60 MB) foi reduzido para `oak/oaks.glb` (~1,7 MB): só a
 * geometria do LOD1 (perto) e do billboard (longe) de 14 carvalhos, sem
 * texturas. As texturas ficam ao lado, em formatos leves.
 *
 * Unidades do modelo: metros, eixo Z para cima, base do tronco na origem.
 * Alturas: Small ~5 m, Medium ~10-12 m, Big ~19-21 m, Large ~22-28 m.
 */
const base = `${import.meta.env.BASE_URL}assets/models/oak/`;

export const OAK_FILES = {
  glb: `${base}oaks.glb`,
  /** Mesma geometria em base64, para servidores que não entregam .glb. */
  glbJson: `${base}oaks.glb.json`,
  bark: `${base}bark.jpg`,
  barkNormal: `${base}bark_normal.jpg`,
  leaves: `${base}leaves.webp`,
  leavesNormal: `${base}leaves_normal.jpg`,
  leavesWinter: `${base}leaves_winter.webp`,
  /** Billboard (várias vistas da árvore numa imagem) de cada variante. */
  billboard: (name) => `${base}bb_${name}.webp`,
};

const acaciaBase = `${import.meta.env.BASE_URL}assets/models/acacia/`;

/**
 * Acácias 3D (modelo "free acacia african"): 4 árvores já em metros, Y para
 * cima, base do tronco na origem (Acacia_004 é uma acácia sem folhas).
 */
export const ACACIA_FILES = {
  glb: `${acaciaBase}acacia.glb`,
  glbJson: `${acaciaBase}acacia.glb.json`,
  bark: `${acaciaBase}bark.jpg`,
  leaves: `${acaciaBase}leaves.webp`,
  /** Corte do alfa das folhas (alphaTest do material e das mipmaps). */
  leafAlphaCutoff: 0.4,
};
const ACACIA = ['Acacia_001', 'Acacia_002', 'Acacia_003', 'Acacia_004'];

const BIG = ['Big_oak_tree__001', 'Big_oak_tree__002', 'Big_oak_tree__003', 'Big_oak_tree__004'];
const LARGE = ['Large_oak_tree_001', 'Large_oak_tree_002', 'Large_oak_tree_003', 'Large_oak_tree_004'];
const MEDIUM = ['Medium_oak_tree__001', 'Medium_oak_tree__002', 'Medium_oak_tree__003'];
const SMALL = ['Small_oak_tree__001', 'Small_oak_tree__002', 'Small_oak_tree__003'];

/** Todas as variantes que o jogo carrega. */
export const OAK_VARIANTS = [...BIG, ...LARGE, ...MEDIUM, ...SMALL];

/**
 * Espécies do jogo que passam a usar os modelos 3D (as demais continuam
 * procedurais/cartões de foto). Os tipos são os de `vegetation` em biomes.js.
 *  - variants: modelos sorteados para cada árvore
 *  - scale:    multiplica o tamanho real do modelo
 *  - leaves:   'summer' | 'winter' (galhos quase nus) | 'none' (árvore morta)
 *  - tint:     cor que multiplica a árvore (1 = cor original)
 *  - family:   'oak' (padrão) ou 'acacia' — de qual pacote vêm os modelos
 *  - canopy:   (acácia) cartões de foto que completam a copa rala do modelo:
 *              tint, cell (m, grade XZ), radius (m), minVerts (folhas por célula),
 *              tilt (rad, inclinação do 2º cartão — dá volume visto de lado)
 */
export const MODEL_SPECIES = {
  broadleaf: { variants: [...BIG, ...MEDIUM, ...SMALL.slice(0, 1)], scale: 0.9, leaves: 'summer', tint: 0xffffff },
  kapok: { variants: LARGE, scale: 1.3, leaves: 'summer', tint: 0xf0fff0 },
  blackTree: { variants: [BIG[1], BIG[3], LARGE[0], LARGE[2]], scale: 0.85, leaves: 'winter', tint: 0x6a7470 },
  deadTree: { variants: [BIG[0], BIG[2], MEDIUM[2]], scale: 0.8, leaves: 'none', tint: 0xb8b0a6 },
  acacia: {
    family: 'acacia', variants: ACACIA.slice(0, 3), scale: 0.95, leaves: 'summer', tint: 0xf4f0dc,
    canopy: { tint: 0x6c7a34, cell: 1.7, radius: 1.35, minVerts: 6, tilt: 0.55 },
  },
  camelthorn: {
    family: 'acacia', variants: [ACACIA[0], ACACIA[2], ACACIA[3]], scale: 0.62, leaves: 'summer', tint: 0xe0d0a8,
    canopy: { tint: 0x7a7a3c, cell: 1.5, radius: 1.0, minVerts: 6, tilt: 0.7 },
  },
};
