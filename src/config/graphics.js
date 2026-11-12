/**
 * Níveis de qualidade gráfica (tecla G no jogo).
 *
 * Do mais leve ao mais pesado. "Ultra" é exatamente o visual original do
 * jogo (os mesmos valores de RENDER em worldConfig.js). Os níveis de baixo
 * economizam primeiro no que menos aparece: resolução interna um pouco
 * menor, sombras mais curtas, capim só perto do jogador e árvores com
 * detalhe trocado mais cedo — o mundo, os biomas e as cores continuam iguais.
 *
 * Campos:
 * - pixelRatio: teto da resolução interna (× pixels CSS). <1 desenha menor e estica.
 * - antialias: suavização de bordas (MSAA). Só muda ao recarregar a página.
 * - shadows: liga as sombras do sol.
 * - shadowMapSize: resolução do mapa de sombras (texels por lado).
 * - shadowRange: metade do lado da área com sombra em volta do jogador (m).
 * - grassRadius: raio do capim em volta do jogador (m). A quantidade cai com o quadrado.
 * - treeViewDistance: até onde as árvores aparecem (m).
 * - treeHighDetailDistance: até onde usam o modelo detalhado (m).
 * - weatherDensity: fração das partículas de clima (chuva, neve, areia…).
 * - bloom: brilho das ondas de calor do Kalahari (sem ele, o clima compensa só com exposição).
 * - post: pós-processamento cinematográfico (RenderPipeline, L3) ou null = desenho direto.
 *   ao (oclusão de contato), godrays (raios de sol), bloom (sempre ligado), ssr (reflexo em
 *   tela no chão), grade (correção de cor), probe (sonda de reflexo local, L4). Intensidades em POST (config/lighting.js).
 * - minimapInterval: o minimapa é redesenhado a cada N quadros (1 = sempre).
 */
export const GRAPHICS_PRESETS = [
  {
    id: 'muito-baixo', name: 'Muito baixo', hint: 'PCs e notebooks bem fracos',
    pixelRatio: 0.7, antialias: false, shadows: false, shadowMapSize: 1024, shadowRange: 50,
    grassRadius: 24, treeViewDistance: 480, treeHighDetailDistance: 45, weatherDensity: 0.3, bloom: false, minimapInterval: 6, waterReflection: 'sky', post: null,
  },
  {
    id: 'baixo', name: 'Baixo', hint: 'Vídeo integrado',
    pixelRatio: 0.85, antialias: false, shadows: true, shadowMapSize: 1024, shadowRange: 55,
    grassRadius: 34, treeViewDistance: 650, treeHighDetailDistance: 75, weatherDensity: 0.45, bloom: false, minimapInterval: 4, waterReflection: 'sky', post: null,
  },
  {
    id: 'medio', name: 'Médio', hint: 'Equilíbrio entre visual e desempenho',
    pixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 80,
    grassRadius: 45, treeViewDistance: 820, treeHighDetailDistance: 110, weatherDensity: 0.65, bloom: false, minimapInterval: 3, waterReflection: 'sky', post: null,
  },
  {
    id: 'alto', name: 'Alto', hint: 'Placa de vídeo dedicada',
    pixelRatio: 1.25, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 110,
    grassRadius: 54, treeViewDistance: 1000, treeHighDetailDistance: 135, weatherDensity: 0.85, bloom: true, minimapInterval: 2, waterReflection: 'planar',
    post: { ao: false, godrays: true, bloom: true, ssr: false, grade: true, probe: false },
  },
  {
    id: 'ultra', name: 'Ultra', hint: 'Máximo detalhe, visual completo',
    pixelRatio: 1.75, antialias: true, shadows: true, shadowMapSize: 4096, shadowRange: 110,
    grassRadius: 62, treeViewDistance: 1100, treeHighDetailDistance: 150, weatherDensity: 1, bloom: true, minimapInterval: 1, waterReflection: 'planar',
    post: { ao: true, godrays: true, bloom: true, ssr: false, grade: true, probe: true },
  },
  {
    id: 'cinematico', name: 'Cinemático', hint: 'Placa forte: reflexos em tela, sondas, sombras de 4K',
    pixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 4096, shadowRange: 130,
    grassRadius: 70, treeViewDistance: 1200, treeHighDetailDistance: 170, weatherDensity: 1, bloom: true, minimapInterval: 1, waterReflection: 'planar',
    post: { ao: true, godrays: true, bloom: true, ssr: true, grade: true, probe: true },
  },
];

/** Nível usado na primeira vez (sem preferência salva): o visual original. */
export const DEFAULT_GRAPHICS = 'ultra';

/** Chave do localStorage onde o nível escolhido fica salvo. */
export const GRAPHICS_STORAGE_KEY = 'jogo-africa.graficos';

/**
 * Aviso de desempenho: se a média de FPS ficar abaixo de `minFps` por
 * `seconds` segundos seguidos, o jogo sugere (uma vez) baixar o nível.
 */
export const LOW_FPS_HINT = { minFps: 28, seconds: 6 };
