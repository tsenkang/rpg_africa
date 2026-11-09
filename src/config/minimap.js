/**
 * Minimapa em tempo real (câmera ortográfica de cima).
 * - layer: camada do Three.js que a câmera do minimapa enxerga
 * - height: altura da câmera (m) — acima da montanha mais alta
 * - resolution: lado da textura (px) onde o minimapa é desenhado
 * - viewMeters: quantos metros o quadrado mostra (andando/rápido/voando)
 * - icons: etiqueta da colisão → cor do ícone da construção
 * O intervalo de atualização (a cada N quadros) vem do nível gráfico.
 */
export const MINIMAP = {
  layer: 2,
  height: 1500,
  resolution: 320,
  viewMeters: { walk: 420, fast: 1600, fly: 2400 },
  /** Luz mínima na vista de cima (o clima da Floresta Preta apaga o sol). */
  minLight: { sun: 2.2, hemi: 1.1 },
  icons: {
    house: 0xd8b07a,
    hut: 0xa8763e,
    ruin: 0x6a5a4a,
    stall: 0xe0c050,
    church: 0xf2ece0,
    cathedral: 0xf2ece0,
    mansion: 0xe8d8b8,
    clock: 0xe8d8b8,
    well: 0x5aa8d8,
    tower: 0x8a6a4a,
    tent: 0xc0603a,
    pond: 0x3a8ad0,
    fire: 0xff8a3a,
    mine: 0x3a3632,
    tree: 0x2f5a2a,
  },
};
