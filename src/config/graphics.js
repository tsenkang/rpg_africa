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
 */
export const GRAPHICS_PRESETS = [
  {
    id: 'muito-baixo', name: 'Muito baixo', hint: 'PCs e notebooks bem fracos',
    pixelRatio: 0.7, antialias: false, shadows: false, shadowMapSize: 1024, shadowRange: 50,
    grassRadius: 24, treeViewDistance: 480, treeHighDetailDistance: 45,
  },
  {
    id: 'baixo', name: 'Baixo', hint: 'Vídeo integrado',
    pixelRatio: 0.85, antialias: false, shadows: true, shadowMapSize: 1024, shadowRange: 55,
    grassRadius: 34, treeViewDistance: 650, treeHighDetailDistance: 75,
  },
  {
    id: 'medio', name: 'Médio', hint: 'Equilíbrio entre visual e desempenho',
    pixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 80,
    grassRadius: 45, treeViewDistance: 820, treeHighDetailDistance: 110,
  },
  {
    id: 'alto', name: 'Alto', hint: 'Placa de vídeo dedicada',
    pixelRatio: 1.25, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 110,
    grassRadius: 54, treeViewDistance: 1000, treeHighDetailDistance: 135,
  },
  {
    id: 'ultra', name: 'Ultra', hint: 'Visual original, máximo detalhe',
    pixelRatio: 1.75, antialias: true, shadows: true, shadowMapSize: 4096, shadowRange: 110,
    grassRadius: 62, treeViewDistance: 1100, treeHighDetailDistance: 150,
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
