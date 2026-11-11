/**
 * Barco de pesca pilotável (Etapa A3) — inspirado no lagosteiro "Downeast" de 8,2 m do
 * Tidewater (dgreenheck/tidewater, MIT: `BoatModel.js`, `BoatController.js`).
 *
 * Referencial do barco (igual ao original): +Z para a frente, +Y para cima, +X bombordo;
 * y = 0 é a linha d'água de projeto, z = 0 o meio da linha d'água.
 *
 * Valores marcados [Tidewater] vêm do original; [jogo] foram ajustados aqui.
 *
 * @example
 *   import { BOAT } from './boat.js';
 *   BOAT.engine.thrust = 14000; // mais potência
 */
export const BOAT = {
  /** Dimensões (m) [Tidewater: LOA 8,2 m, boca ~3 m]. */
  length: 8.2,
  beam: 3.0,
  waterlineLength: 7.6,
  waterlineBeam: 2.7,
  /** Massa (kg) [Tidewater: ~3,2 t]. */
  mass: 3200,
  /** Massa de projeto: o casco desloca exatamente isto na linha d'água (a massa acima pode ser ajustada no menu). */
  designMass: 3200,
  /** Multiplicadores ajustáveis no menu (A6). */
  buoyancyScale: 1,
  dampingScale: 1,
  /** Densidade da água (kg/m³) — doce no lago e nos rios, salgada no mar; usamos a do mar [Tidewater]. */
  rho: 1025,
  gravity: 9.81,
  /** Centro de massa: sobre o centro de carena, ~0,3 m acima da linha d'água [Tidewater]. */
  centerOfMass: [0, 0.3, -0.2],
  /** Raios de giração [Tidewater: roll 0,36 B, pitch 0,26 L, yaw 0,27 L]. */
  gyration: { roll: 0.36, pitch: 0.26, yaw: 0.27 },
  /** Massa adicional com o casco todo molhado (fração) [Tidewater: avanço, deriva, arfagem; arfagem angular…]. */
  addedMass: { surge: 0.05, sway: 0.6, heave: 0.6, pitch: 0.6, yaw: 0.3, roll: 0.15 },
  /** Pontos de flutuação: grade sobre o plano de flutuação [jogo: 3 × 7 = 21]. */
  samples: { across: 3, along: 7 },
  /** Altura do convés acima da linha d'água: acima disto o casco não dá mais empuxo. */
  freeboard: 0.85,
  /** Amortecimento vertical por m² de plano de flutuação (N·s/m por m²) [jogo: ζ ≈ 0,3 em arfagem]. */
  heaveDamping: 1100,
  /** Arrasto quadrático de avanço (N por (m/s)²) e corcova de ondas acima da velocidade de casco. */
  resistance: { k: 95, hullSpeed: 3.4, hump: 1.4, air: 3.5 },
  /** Estações da quilha (z, área lateral m²): sustentação do casco e arrasto cruzado [Tidewater]. */
  keel: { stations: [[-3.2, 1.1], [-1.6, 1.2], [0, 1.2], [1.6, 1.0], [3.0, 0.6]], cd: 1.0, lift: 0.9, depth: -0.45, forceY: 0.15 },
  /** Motor [jogo: empuxo máximo, rotação acompanha a alavanca em ~0,9 s, perde força perto da velocidade de passo]. */
  engine: { thrust: 11000, reverse: 0.45, spoolUp: 0.9, spoolDown: 0.6, pitchSpeed: 12, position: [0, -0.55, -3.5] },
  /** Leme: placa sustentadora na esteira da hélice [Tidewater]. */
  rudder: { area: 0.32, maxAngle: 0.6, rate: 1.4, position: [0, -0.4, -3.75], stall: 0.45, liftSlope: 3.0, race: 0.5, drag: 0.25 },
  /** Proa sobe com a velocidade (trim dinâmico) [Tidewater: proa sobe na corcova, depois corre com poucos graus]. */
  trim: { k: 260, max: 0.09 },
  /** Amortecimento angular extra (apêndices, porão) por eixo [jogo]. */
  angularDamping: { pitch: 9000, yaw: 6000, roll: 5000 },
  /** Encalhe: mola e atrito do fundo (por ponto do casco). */
  ground: { stiffness: 60000, damping: 9000, friction: 0.6 },
  /** Passo fixo da física (s) [Tidewater: 120 Hz]. */
  step: 1 / 120,
  maxSubsteps: 12,
  /** Onde o barco espera o jogador: perto do píer da Vila Renascimento [jogo]. */
  mooring: { village: 'renascimento', searchRadius: 220, minDepth: 1.6 },
  /** Controles: quanto a alavanca anda por segundo segurando W/S. */
  controls: { throttleRate: 0.7, boardRadius: 4.5 },
  /** Posições no barco (referencial do barco). */
  helm: [0.45, 0.62, 0.1],
  exit: [1.9, 0.2, -1.6],
};
