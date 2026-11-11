/**
 * Ecossistema da fauna (Etapa F1): cadeia alimentar, fome, energia, grade e LOD.
 *
 * Níveis tróficos:
 *  1 superpredadores (leão, onça, urso, jacaré, cérbero) → comem 2, 3 e 4
 *  2 mesopredadores/matilhas (lobo, hiena, leopardo, javali) → comem 4
 *  3 grandes herbívoros defensores (girafa, alce, camelo, gorila) → não caçam
 *  4 presas (zebra, capivara, suricato, avestruz, arara) → não caçam
 *  5 pequenos venenosos/necrófagos (escorpião, víbora, corvo): fora da cadeia
 *    de caça grande; atacam só quem os provoca (o corvo é necrófago — F4).
 *
 * @example
 *   import { ECOSYSTEM } from './ecosystem.js';
 *   ECOSYSTEM.hunger.huntAbove; // 0.6
 */
export const ECOSYSTEM = {
  levels: {
    leao: 1, onca: 1, urso: 1, jacare: 1, cerbero: 1,
    lobo: 2, hiena: 2, leopardo: 2, javali: 2,
    girafa: 3, alce: 3, camelo: 3, gorila: 3,
    zebra: 4, capivara: 4, suricato: 4, avestruz: 4, arara: 4,
    escorpiao: 5, vibora: 5, corvo: 5,
  },
  /** Nível → níveis que ele caça. */
  eats: { 1: [2, 3, 4], 2: [4], 3: [], 4: [], 5: [] },
  /** Presas extras fora da regra por nível. */
  extraDiet: { vibora: ['suricato'], escorpiao: ['suricato'] },
  /** Nunca viram presa de caçada (voam alto / são o guardião). */
  neverPrey: ['arara', 'corvo', 'cerbero'],
  /** O jogador é presa destes níveis (só com fome, como os animais). */
  playerPreyOf: [1, 2],
  hunger: {
    rate: { 1: 1 / 480, 2: 1 / 360 }, // por segundo: de 0 a 1 em 8 min (superpredador) / 6 min (matilha)
    huntAbove: 0.6, // só caça acima disto (pedido do dono)
    minEnergy: 0.25, // exausto não caça
    initial: [0.15, 0.95], // fome sorteada ao nascer
    mealPerHealth: 1 / 120, // quanto a fome cai por ponto de vida da presa (girafa 220 → sacia)
  },
  energy: { runDrain: 1 / 70, restGain: 1 / 45 },
  /** Presa só foge de predador caçando (alerta) ou colado nela (pânico). */
  prey: { alarmRadius: 28, panicRadius: 6 },
  /** Vida baixa/filhote/manco = presa preferida. */
  tick: 0.25, // s entre decisões de IA do ecossistema
  gridCell: 16, // m
  huntSenseScale: 1.6, // raio de busca de presa = sense da espécie × isto
  /** LOD: caçadas com predador E presa além deste raio do jogador são resolvidas por estatística. */
  detailRadius: 55,
  stat: { baseRate: 0.06 },
};
