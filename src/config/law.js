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
  /** IA dos guardas (C4): reconhecer, perseguir, flanquear, atacar, chamar reforço, investigar. */
  guards: {
    sight: { radius: 28, fovDot: 0.35, hearRadius: 4 },
    recognizeSeconds: 3, // tempo de checagem visual até ter certeza (metade disso de perto)
    closeRadius: 8,
    meterDecay: 0.5, // fora da vista o medidor esvazia a esta taxa por segundo
    chaseSpeed: 5.2, // m/s — mais rápido que andar (4,2), mais lento que correr (8,4)
    loseSeconds: 8, // sem ver o jogador por este tempo → investiga a zona de busca
    attackRange: 1.8,
    attackCooldown: 1.4,
    damage: 12,
    flankDist: 6, // o parceiro de dupla mira um ponto deslocado de lado
    flankStopDist: 7, // perto assim os dois vão direto
    reinforceRadius: 60, // apito: guardas da vila neste raio entram na perseguição
    investigatePause: 3, // olha em volta em cada ponto da busca (s)
    lines: {
      suspect: ['Ei, você aí… eu conheço essa cara.', 'Parado. Deixa eu ver seu rosto.', 'Você não me é estranho…'],
      spotted: ['É o procurado! Pega!', 'Alto! Em nome da vila!', 'Peguei você!'],
      lost: ['Sumiu… espalhem-se!', 'Ele estava aqui agora mesmo.'],
    },
  },
  /** Caçadores de recompensa (C5): surgem fora das vilas com a recompensa total alta. */
  hunters: {
    threshold: 1000, // recompensa somada de todas as vilas
    firstDelay: 25, // s viajando até a primeira chance
    interval: [70, 140], // s entre tentativas
    chance: 0.6,
    maxGroups: 1,
    count: [2, 3], // caçadores por grupo
    dogs: [1, 2], // cães (lobos treinados)
    dogSpecies: 'lobo',
    spawnDist: 38,
    behindArc: [110, 250], // graus em relação à frente do jogador (180 = bem atrás)
    speed: 5.6,
    attackRange: 1.8,
    attackCooldown: 1.2,
    damage: 10,
    health: 30, // soco tira `GAMEPLAY.combat.punch.damage`; lança/flecha no corpo mata
    despawnDist: 260,
    look: { shirt: 0x3b3328, pants: 0x2a241e, armor: 0x5c4a36, straps: 0x2b1d14, boots: 0x1d1712, hatColor: 0x3a2a1a },
    lines: ['Tem um preço pela sua cabeça.', 'Vivo ou morto — tanto faz.', 'Achamos você.'],
  },
  /** Redenção (C5): Comandante da Guarda fica na praça de cada vila. */
  redemption: { title: 'Comandante da Guarda' },
  /** Memória social (C5): vítima/parente que vê o jogador. */
  grudge: {
    radius: 16,
    checkEvery: 0.5,
    cooldown: 25, // s até o mesmo morador reagir de novo
    callGuardChance: 0.5,
    fleeLines: ['É ele! Fiquem longe!', 'Assassino! Socorro!', 'Não chega perto da minha família!'],
    callLines: ['Guarda! Ele voltou!', 'É o procurado! GUARDAS!'],
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
