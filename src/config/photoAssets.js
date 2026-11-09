/**
 * Texturas fotográficas (base de realismo tirada do modelo de referência
 * "a forest with a road", Sketchfab / carve.photos).
 *
 * Arquivos em public/assets/textures/. Para trocar uma foto, substitua o
 * arquivo e, se mudar a média de cor, ajuste `mean` (linear, 0..1): o
 * shader divide pela média para que a foto vire só "detalhe" sobre a cor
 * de cada bioma/espécie.
 */
const base = `${import.meta.env.BASE_URL}assets/textures/`;

export const PHOTO_TEXTURES = {
  ground: { url: `${base}ground_albedo.jpg`, mean: [0.211, 0.165, 0.119] },
  groundNormal: { url: `${base}ground_normal.jpg` },
  bark: { url: `${base}bark_albedo.jpg`, mean: [0.103, 0.082, 0.058] },
  barkNormal: { url: `${base}bark_normal.jpg` },
  foliage: { url: `${base}foliage_atlas.webp`, size: 2048 },
};

/** Metros cobertos por uma repetição da foto do chão. */
export const GROUND_PHOTO = {
  tileMeters: 4.2,
  normalScale: 1.1,
  /** Quanto a foto aparece em cada bioma (0 = só cor do bioma, 1 = foto inteira). */
  strength: { savana: 0.85, taiga: 1, deserto: 0.25, kalahari: 0.4, tropical: 1, equatorial: 1, preta: 1 },
};

/** Metros cobertos por uma repetição da casca (vertical / ao redor do tronco). */
export const BARK_PHOTO = { tileMeters: 1.4 };

/**
 * Recortes do atlas de folhagem (pixels, origem no canto superior esquerdo,
 * imagem já em pé). `mean` = cor média linear dos pixels opacos.
 *  - side: vista lateral (cartões verticais cruzados)
 *  - top:  copa vista de cima (cartões horizontais/inclinados)
 */
export const FOLIAGE_SPRITES = {
  canopyA: { rect: [48, 64, 592, 576], mean: [0.084, 0.124, 0.054] },
  canopyB: { rect: [680, 56, 1232, 568], mean: [0.084, 0.124, 0.054] },
  spruce: { rect: [1568, 272, 1968, 1496], mean: [0.037, 0.032, 0.014] },
  pine: { rect: [40, 736, 528, 1456], mean: [0.112, 0.117, 0.060] },
  fir: { rect: [592, 1296, 1032, 1960], mean: [0.06, 0.07, 0.035] },
  firSmall: { rect: [1176, 656, 1408, 1256], mean: [0.05, 0.06, 0.03] },
  leafBranch: { rect: [672, 768, 952, 1200], mean: [0.09, 0.14, 0.05] },
  root: { rect: [1352, 32, 1680, 360], mean: [0.06, 0.05, 0.04] },
  grassGreen: { rect: [1072, 1616, 1584, 1936], mean: [0.102, 0.163, 0.047] },
  grassDry: { rect: [32, 1592, 504, 1984], mean: [0.151, 0.133, 0.074] },
};

/** Quanto a cor da espécie/bioma tinge a foto (0 = foto pura, 1 = cor pura). */
export const FOLIAGE_TINT = 0.55;

/** Fração de tufos de capim seco (foto amarelada) por bioma. */
export const GRASS_DRYNESS = { savana: 0.85, taiga: 0.15, deserto: 1, kalahari: 0.9, tropical: 0.05, equatorial: 0, preta: 0.5 };
