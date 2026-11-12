/**
 * Iluminação cinematográfica (Etapa L1).
 *
 * @example
 *   import { LIGHTING } from './lighting.js';
 *   LIGHTING.ibl.intensity = 1.2; // reflexos e luz ambiente do céu mais fortes
 */
export const LIGHTING = {
  /**
   * Temperatura de cor do sol/lua (K) pela elevação do sol (seno da altura).
   * Amanhecer/pôr dourado-alaranjado → meio-dia neutro; lua azulada.
   */
  kelvin: {
    horizon: 1900, // sol encostado no horizonte
    golden: 3300, // hora dourada (~10°)
    morning: 4800, // manhã/tarde (~25°)
    noon: 5900, // sol alto
    moon: 8200, // luar (azulado)
    /** Quanto a cor do sol vem do Kelvin (o resto é o tom do bioma). */
    mix: 0.75,
  },
  /** Luz por imagem (céu procedural → PMREM → scene.environment). */
  ibl: {
    enabled: true,
    intensity: 0.9, // scene.environmentIntensity de dia
    nightIntensity: 0.25,
    size: 128, // resolução do cubo do céu antes do PMREM
    /** Refaz o mapa quando o sol andou mais que isto (rad) ou as cores mudaram mais que `colorDelta`. */
    sunDelta: 0.035,
    colorDelta: 0.04,
    minInterval: 0.6, // s entre refazer (custo ~1 quadro pesado)
    /** A luz hemisférica antiga vira só um complemento (o céu já ilumina pelo IBL). */
    hemiKeep: 0.45,
    ground: 0x3a3226, // metade de baixo do céu do IBL: chão (não céu claro por baixo)
  },
  /** Fogo vivo: tremulação, rajadas lentas e a luz que oscila de lugar. */
  fire: { decay: 2, gust: 0.18, jitter: 0.06 },
};

/**
 * Materiais PBR por superfície (Etapa L2). Chave = nome do material em `createMaterials()`.
 * `surface`: efeitos no shader (veios polidos, gelo, micro-brilho, molhado).
 *
 * @example MATERIAL_PROFILES.metal.roughness = 0.2 // metais mais espelhados
 */
export const MATERIAL_PROFILES = {
  /** Metais: espelham o ambiente (IBL). */
  metal: { keys: ['iron', 'brass', 'gold', 'metalRoof'], metalness: 0.95, roughness: 0.24, envMapIntensity: 1.2, overrides: { metalRoof: { metalness: 0.8, roughness: 0.38 }, gold: { roughness: 0.18 } } },
  /** Vidro e água parada: quase espelho. */
  glass: { keys: ['glass'], metalness: 0.05, roughness: 0.05, envMapIntensity: 1.4 },
  /** Ruínas de Kaelen: pedra negra áspera com veios polidos que refletem. */
  obsidian: { keys: ['basalt', 'basaltDark', 'blackMoss'], roughness: 0.88, surface: { veins: true } },
  /** Taiga: gelo (IOR 1,31 → reflexo especular ~2% de frente) e neve com cintilação. */
  ice: { keys: ['snowCap', 'frozenLog'], surface: { ice: true, glint: true } },
};

/** Clima: superfícies molhadas na chuva e poças. */
export const WETNESS = {
  /** Biomas cuja precipitação molha (riscos caindo rápido): o resto é neve, areia, cinza. */
  rainFall: 5, // m/s mínimos da partícula 'streak' para contar como chuva
  wetUp: 1 / 20, // por segundo (molha em ~20 s de chuva forte)
  dryDown: 1 / 120, // seca em ~2 min
  darken: 0.55, // albedo molhado (poros cheios d'água escurecem)
  roughness: 0.08, // rugosidade molhada (verniz de água)
  vertical: 0.35, // paredes molham menos que o chão
  puddles: { threshold: 0.74, scale: 0.35, minWet: 0.4 }, // ~12% do chão plano vira poça
  /** Materiais que não molham (emissivos, tecidos à sombra das feiras, água, teias). */
  skip: ['flame', 'runeGlow', 'eerie', 'water', 'waterOasis', 'cobweb', 'darkOpening', 'glass', 'clockFace'],
};

/** Micro-brilho da areia/neve no terreno (micro-facetas lisas aleatórias). */
export const GLINT = { density: 0.012, scale: 22, sandMin: 0.35 }; // facetas de ~4,5 cm
