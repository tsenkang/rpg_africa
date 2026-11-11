/**
 * Oceano FFT (Etapa A1) — porte do Tidewater (dgreenheck/tidewater, MIT) para WebGL2.
 *
 * Tudo que vem do original está marcado [Tidewater]; o que foi ajustado ao jogo, [jogo].
 *
 * - 4 cascatas FFT 256×256 com tamanhos de razão não inteira (sem repetição visível) [Tidewater].
 * - Espectro JONSWAP (com correção TMA de profundidade), espalhamento direcional
 *   Horvath (cos-2s com potência dependente da frequência) e dois sistemas de ondas:
 *   vento local + ondulação (swell) de longe [Tidewater].
 * - Espuma pelo Jacobiano da superfície, com memória (decai devagar) [Tidewater].
 *
 * @example
 *   import { OCEAN } from './ocean.js';
 *   OCEAN.local.windSpeed = 12; // vento mais forte → ondas maiores, mais espuma
 */
export const OCEAN = {
  fftSize: 256,
  /** m por ladrilho de cada cascata [Tidewater: 733, 157, 33.3, 7.1]. */
  cascadeSizes: [733, 157, 33.3, 7.1],
  /** Profundidade de referência do espectro (m) [Tidewater 500]. */
  depth: 500,
  seed: 1337,
  /** Ondas de vento locais [Tidewater: windSpeed 7, dir 25°, fetch 120 km, spreadBlend 0.85, swell 0.05]. */
  local: { scale: 1, windSpeed: 7, windDirection: 25, fetch: 120, spreadBlend: 0.85, swell: 0.05, peakEnhancement: 3.3, shortWavesFade: 0.01 },
  /** Ondulação de longe [Tidewater: scale 0.48, 6 m/s, 5°, fetch 1200 km, spreadBlend 1, swell 0.9, fade 0.1]. */
  swell: { scale: 0.48, windSpeed: 6, windDirection: 5, fetch: 1200, spreadBlend: 1.0, swell: 0.9, peakEnhancement: 3.3, shortWavesFade: 0.1 },
  /** Deslocamento horizontal (cristas pontudas) [Tidewater 0.9]. */
  choppiness: 0.9,
  /** Espuma: nasce onde J < bias; decai por segundo [Tidewater 0.58, 3, 0.35, 2.5]. */
  foam: { bias: 0.58, gain: 3.0, decay: 0.35, add: 2.5, weights: [0.35, 0.45, 0.5, 0.25] },
  /** Multiplicador geral da altura [Tidewater 1; jogo 0.6: o mundo é costeiro e de rios]. */
  amplitude: 0.6,
  /**
   * Águas rasas: cada cascata some abaixo de `d0` m de fundo; `floor` é o resto que fica
   * no raso [Tidewater: d0 = min(40, tamanho × 0.08), floor 0 / 0.05 / 0.25 / 0.5].
   */
  shallow: { floor: [0.0, 0.05, 0.25, 0.5] },
  /** Malha da água em anéis em volta da câmera [jogo]. */
  mesh: { segments: 192, innerSpacing: 0.5, farRadius: 6000 },
  /** Textura de profundidade do fundo (m por texel) [jogo]. */
  depthTexel: 8,
  /**
   * Ótica (Etapa A2).
   * - `absorption`: coeficiente de Beer-Lambert por canal (1/m) [jogo: água costeira tropical, o vermelho
   *   some em ~2 m, o azul atravessa ~25 m];
   * - `scatter`: cor que a coluna d'água espalha de volta (o "corpo" da água funda);
   * - `refraction`: deslocamento da imagem do fundo pela normal (fração da tela por m de profundidade);
   * - `reflection`: 'planar' (reflexo do cenário, custa um 2º desenho da cena a meia resolução) ou 'sky';
   * - `causticStrength`: 0..1; `shoreFoam`: largura da faixa de espuma na beira (m de profundidade).
   */
  optics: {
    ior: 1.333,
    absorption: [0.45, 0.075, 0.04],
    scatter: [0.02, 0.09, 0.11],
    refraction: 0.035,
    reflection: 'planar',
    reflectionScale: 0.5,
    causticStrength: 0.85,
    shoreFoam: 0.9,
    underwaterFog: 0.06,
  },
  /** Velocidade do tempo do oceano. */
  timeScale: 1,
};
