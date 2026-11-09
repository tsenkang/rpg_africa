/**
 * Céu dinâmico: trajetória lenta do sol e camada de nuvens.
 *
 * O sol não faz o dia inteiro (o jogo ainda não tem noite): ele passeia
 * devagar num arco entre fim de manhã e fim de tarde, ida e volta, com
 * período `period` (s). As sombras, o brilho na água e o disco do sol no céu
 * acompanham. Ângulos em radianos.
 */
export const SUN_CYCLE = {
  period: 1500, // s para ir e voltar (25 min)
  azimuthCenter: 2.36, // direção média (sudoeste, ~135°)
  azimuthSwing: 0.75, // ± quanto ele anda para os lados
  elevationMin: 0.42, // ~24° — sombras longas
  elevationMax: 0.98, // ~56° — sol alto
};

/**
 * Nuvens: grupos de "tufos" (billboards com textura macia gerada no
 * código), à deriva com o vento, recicladas em volta da câmera.
 */
export const CLOUDS = {
  count: 70, // nuvens (cada uma tem `puffs` tufos)
  puffs: [5, 9],
  area: 5200, // m: quadrado em volta da câmera onde elas existem
  altitude: [380, 540], // m
  puffSize: [130, 280], // m
  spread: [50, 150], // m: distância dos tufos ao centro da nuvem
  wind: { x: 4.5, z: 1.6 }, // m/s
  opacity: 0.85,
  /** Com tempo fechado (tempestade/névoa) as nuvens escurecem e engrossam. */
  overcastDarken: 0.65,
};
