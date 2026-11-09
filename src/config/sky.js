/**
 * Dia e noite (seguem o relógio do jogo — WEATHER_CYCLE em config/weather.js).
 * O sol nasce no leste (+X) às `sunrise`, passa alto pelo sul ao meio-dia e
 * se põe no oeste às `sunset`. À noite a lua assume a luz direcional: azul,
 * fraca, mas dá para enxergar. Ângulos em radianos.
 * - maxElevation: altura do sol ao meio-dia (e da lua à meia-noite: moonElevation)
 * - twilight: faixa de elevação (rad) em que a luz some/acende no horizonte
 * - sunsetTint: cor do sol baixo (nascer/pôr) e até que elevação ela vale
 * - night: quanto a noite muda a cena (× luz ambiente, cores, exposição)
 */
export const DAY_NIGHT = {
  sunrise: 5.5,
  sunset: 19.5,
  maxElevation: 1.15,
  moonElevation: 0.9,
  twilight: 0.14,
  sunsetTint: { color: 0xff8a4a, until: 0.35 },
  night: {
    moonColor: 0x9fb4e8, moonMul: 0.16,
    hemiMul: 0.32,
    skyTop: 0x0c1428, skyHorizon: 0x1e2a44, skyMix: 0.92,
    fogColor: 0x1a2232, fogMix: 0.85,
    exposureMul: 1.2,
  },
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
