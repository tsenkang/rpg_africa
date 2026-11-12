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
