/**
 * Valores de jogabilidade (data-driven). Ajuste aqui sem mexer na lógica.
 */
export const GAMEPLAY = {
  player: {
    maxHealth: 100,
    startCoins: 120,
  },

  /** Mendigo da Vila Perseguição: dá a Injeção Suspeita (50% cura / 50% doença ao usar). */
  beggar: {
    cooldownSeconds: 45, // espera até ele achar outra injeção
  },

  /** Senhor (Especialista em NEX) da Vila Renascimento. */
  healer: {
    healCost: 10, // cura de vida
    cureDiseaseCost: 0, // só ele cura a doença do mendigo
  },

  /** Masmorra "Holocausto" sob a Praça da Saudade. */
  holocausto: {
    relicBonus: 0.2, // +20% de poder das relíquias
    buffDuration: 120, // segundos
    paranormalExposure: 5, // +5% por entrada
  },

  /** Confiança do prefeito da Bússola do Sul (0..100). */
  bussolaTrust: {
    required: 100,
    tributeCost: 60,
    tributeTrust: 35,
    letterTrust: 65,
    talkTrust: 5, // conversar (uma vez)
  },

  shop: {
    potionPrice: 80,
  },

  /** Hotbar (teclas 1–8). */
  inventory: {
    slots: 8,
  },

  /** Combate. O soco é o ataque de "Mãos Livres" (nenhum item no slot ativo). */
  combat: {
    punch: {
      range: 1.7, // m, do peito do personagem para a frente
      rayHeights: [0, -0.5], // m em relação ao ombro: um raio no peito e outro na cintura (acerta crianças)
      cooldown: 0.45, // s entre socos
      duration: 0.32, // s da animação do braço
      damage: 5, // dano em alvos com vida (ex.: boneco de treino)
      knockback: 0.35, // m que um NPC recua ao levar o soco
      cameraKick: 0.06, // rad do tranco da câmera ao bater
    },
  },

  /** Clique com Mãos Livres num NPC que conversa: abre o diálogo em vez de socar. */
  talk: {
    range: 2.6, // m, do peito para a frente
  },

  /** Itens da hotbar com uso (clique com o item equipado). */
  items: {
    injecao_suspeita: {
      id: 'injecao_suspeita', nome: 'Injeção Suspeita', icone: 'syringe', tipo: 'consumivel',
      healChance: 0.5, // 50% cura total (vida + doenças); 50% Febre do Mendigo
    },
  },

  /** Nado e afogamento. */
  swimming: {
    speedMultiplier: 0.5, // velocidade na água = andar × isto
    verticalSpeed: 1.8, // m/s subindo (Espaço) ou descendo (Ctrl)
    buoyancy: 0.7, // m/s que o corpo sobe sozinho até a superfície
    surfaceDepth: 1.25, // m: pés abaixo da linha d'água quando boiando na superfície
    submergedDepth: 1.75, // m: abaixo disto a cabeça está debaixo d'água
    oxygenSeconds: 90, // fôlego total
    surfaceDrain: 1, // ritmo do fôlego boiando na superfície (1 = igual a submerso)
    regenPerSecond: 30, // segundos de fôlego recuperados por segundo fora d'água
    warnFraction: 0.25, // barra fica vermelha abaixo disto
  },

  /** Morte e respawn (afogamento, ataque de animal). */
  death: {
    fadeSeconds: 1.2,
    respawnSeconds: 3.5, // tela escura antes de voltar
    respawnOffset: 6, // m do centro da vila
  },

  /** Boneco de treino na Vila Renascimento (alvo para testar o soco). */
  trainingDummy: {
    health: 50,
    respawnSeconds: 4,
  },
};

/** Efeitos de status (buffs e doenças). */
export const STATUS_EFFECTS = {
  febre_mendigo: {
    name: 'Febre do Mendigo',
    kind: 'disease',
    description: 'Perde vida aos poucos e anda mais devagar. Só o Senhor da Vila Renascimento cura.',
    duration: null, // permanente até ser curada
    tickSeconds: 4,
    damagePerTick: 1,
    minHealth: 15, // a doença não mata sozinha
    modifiers: { speed: 0.8 },
    curableBy: ['senhor_nex'],
  },
  reliquias_potencializadas: {
    name: 'Relíquias Potencializadas',
    kind: 'buff',
    description: '+20% de poder das relíquias.',
    duration: 120,
    modifiers: { relicPower: 1.2 },
  },
};
