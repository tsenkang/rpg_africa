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
  /** Testemunhas (C2): quem vê o crime corre até o guarda mais próximo. */
  witness: {
    radius: 24, // até onde enxerga (m)
    fovDot: 0.2, // cone de visão: cos do meio-ângulo (0,2 ≈ 156° no total)
    hearRadius: 7, // perto assim ouve/percebe mesmo de costas
    reportRadius: 2.2, // chegou a esta distância do guarda = denunciou
    noGuardReportAfter: 25, // vila sem guarda alcançável: denuncia depois de gritar este tempo (s)
    maxRunSeconds: 90, // corrida longa demais: denuncia mesmo assim
    interceptRadius: 2.8, // E perto da testemunha abre a interceptação
    intimidate: { chance: 0.5, armedBonus: 0.3, failShoutSeconds: 3 },
    bribe: { base: 30, perBounty: 0.5 }, // custo = base + metade da recompensa dos crimes vistos
    shouts: {
      agressao: ['Socorro! Guardas!', 'Ele bateu num vizinho!', 'Chamem a guarda!'],
      assassinato: ['Assassino! Guardas!', 'Mataram alguém! Socorro!', 'Ele matou! Chamem a guarda!'],
      invasao: ['Ladrão dentro de casa!', 'Invasor! Guardas!'],
      roubo: ['Ladrão! Pega ladrão!', 'Roubaram a nossa casa!'],
    },
    reportLines: ['Guarda! Eu vi tudo, venha comigo!', 'Guarda, um crime! Lá atrás!'],
    silencedLines: { intimidar: ['Tá bom, tá bom… eu não vi nada.', 'Não me machuque!'], suborno: ['Não vi nada. Nada mesmo.', 'Moedas falam mais alto…'] },
    intimidateFailLines: ['Não tenho medo de você! GUARDAS!', 'Sai daqui! SOCORRO!'],
  },
  /** Procurado (C3): zona de busca em volta da última posição conhecida e fuga. */
  bounty: {
    searchRadius: 45, // raio do círculo de busca (m)
    escapeSeconds: 20, // fora do círculo e sem ser visto por este tempo = busca encerrada
    regionMargin: 120, // a região da vila vai até raio + margem (procurado ali)
    guardSight: { radius: 28, fovDot: 0.35, hearRadius: 5 }, // guarda vendo o jogador
  },
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
