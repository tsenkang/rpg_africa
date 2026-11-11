/**
 * Lei, crimes e recompensa (Etapa C). Todos os números de gameplay da lei ficam aqui.
 *
 * @example
 *   import { LAW } from './law.js';
 *   LAW.crimes.assassinato.bounty; // 500
 */
export const LAW = {
  /** Tipos de crime e quanto cada um soma na recompensa da vila (quando há testemunha). */
  crimes: {
    agressao: { label: 'Agressão', bounty: 50 },
    invasao: { label: 'Invasão de domicílio', bounty: 50 },
    roubo: { label: 'Roubo', bounty: 50 },
    assassinato: { label: 'Assassinato', bounty: 500 },
  },
  /** Soco num morador: ele fica desacordado (deitado) por este tempo, em segundos. */
  knockoutSeconds: 20,
  /** Hitbox invisível do morador (m), usada por soco e projéteis. */
  hitbox: { w: 0.6, h: 1.85, d: 0.45 },
  /** Zonas de acerto por altura (m acima dos pés). Cabeça/corpo = morte; pernas = derruba. */
  hitZones: { headAbove: 1.5, legsBelow: 0.8 },
  /** Invasão: tempo dentro de uma casa alheia até contar como crime (s). */
  trespass: { graceSeconds: 1.5 },
  /** Roubo: vasculhar uma casa alheia. Cada casa pode ser roubada uma vez por intervalo. */
  theft: {
    cooldownHours: 24,
    rolls: 2,
    loot: [
      { id: 'mel', weight: 3, count: [1, 2] },
      { id: 'corda', weight: 3, count: [1, 1] },
      { id: 'cinza', weight: 2, count: [1, 3] },
      { id: 'curativo_folha', weight: 2, count: [1, 1] },
      { id: 'faca_pedra', weight: 1, count: [1, 1] },
      { id: 'livro', weight: 1, count: [1, 1] },
      { coins: true, weight: 3, count: [5, 25] },
    ],
  },
};
