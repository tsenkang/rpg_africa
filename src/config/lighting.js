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

/**
 * Pós-processamento cinematográfico (Etapa L3, `RenderPipeline`). Quais efeitos cada nível
 * gráfico liga fica em `GRAPHICS_PRESETS[*].post`; aqui ficam as intensidades.
 *
 * @example POST.bloom.strength = 0.6 // brilho mais forte em tudo
 */
export const POST = {
  /** Oclusão ambiental (GTAO): sombra de contato em cantos, sob objetos e entre pedras. */
  ao: { scale: 0.5, radius: 0.6, distanceExponent: 1.2, thickness: 1.5, intensity: 0.85, samples: 12 },
  /** Bloom sempre ligado: só o que passa do limiar brilha (sol, fogo, runas, reflexos fortes). */
  bloom: { strength: 0.4, radius: 0.5, threshold: 1.6, scale: 0.5 }, // limiar em luminância HDR linear (antes do ACES): céu claro ~1, sol/fogo ≫ 1
  /**
   * Raios de sol (luz volumétrica em espaço de tela): o céu atrás das copas e da névoa vira
   * feixes radiais a partir do sol. Força por bioma (florestas e a névoa de Kaelen mais).
   */
  godrays: {
    samples: 48, density: 0.9, decay: 0.96, exposure: 0.08, skyMin: 1.0,
    biomes: { savana: 0.35, taiga: 0.45, deserto: 0.15, kalahari: 0.2, tropical: 1, equatorial: 1, preta: 1.1 },
    night: 0.25, // a lua faz feixes bem mais fracos
    facing: 0.15, // abaixo deste cos(câmera·sol) não há feixes
  },
  /** Reflexo em espaço de tela (só no Cinemático): chão plano, mais forte molhado. */
  ssr: { base: 0.12, wet: 0.55, steps: 32, maxDistance: 60, thickness: 1.2, waterBand: 0.5 },
  /** Correção de cor final (no espaço da tela, depois do ACES). */
  grade: { saturation: 1.08, contrast: 1.06, shadows: [0.97, 0.99, 1.05], highlights: [1.04, 1.0, 0.95], vignette: 0.22 },
};

/**
 * Sonda de reflexo local (Etapa L4): um `CubeCamera` perto do jogador captura o mundo real em
 * volta (casas, árvores, NPCs) — uma face por quadro, a cada `faceEvery` quadros — e vira o
 * reflexo dos metais e do vidro no lugar do céu genérico do IBL. Só nos níveis com `post.probe`.
 */
export const PROBE = {
  size: 128, // texels por face
  near: 0.5, far: 140, // m (longe = mais objetos a desenhar)
  height: 2.2, // m acima do jogador
  faceEvery: 2, // desenha uma face a cada N quadros (6 faces = 12 quadros por volta)
  moveDist: 18, // m: anda isso e a sonda recomeça no novo lugar
  refresh: 20, // s: recaptura mesmo parado (dia/noite, clima)
  keys: ['iron', 'brass', 'gold', 'metalRoof', 'glass'], // materiais que usam a sonda
};
