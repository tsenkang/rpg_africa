/**
 * Sobrevivência avançada (data-driven): nutrição por macronutrientes,
 * stamina, sanidade, sujeira, ferimentos por membro e doenças.
 * Tempos em segundos REAIS (1 dia do jogo = 20 min, ver WEATHER_CYCLE).
 */

/** Os 4 membros inspecionáveis (ids estáveis, usados em save/UI/malhas). */
export const LIMBS = {
  bracoE: { name: 'Braço Esquerdo', arm: true, side: 1 },
  bracoD: { name: 'Braço Direito', arm: true, side: -1 },
  pernaE: { name: 'Perna Esquerda', arm: false, side: 1 },
  pernaD: { name: 'Perna Direita', arm: false, side: -1 },
};

/**
 * Relógio bio-nutricional: 4 barras 0..100.
 * - drainPerMinute: quanto cada barra cai por minuto real, parado/andando
 * - sprintMultiplier: correndo, a barra cai × isto
 * - parasiteMultiplier: com parasitas intestinais, TODAS caem × isto
 * - deficient: abaixo disto a barra está em deficiência (efeitos abaixo)
 * - emptyDamagePerSecond: barra ZERADA tira vida (pode matar)
 */
export const NUTRITION = {
  max: 100,
  start: { proteins: 75, carbs: 80, fats: 70, water: 85 },
  drainPerMinute: { proteins: 2.4, carbs: 3.0, fats: 2.0, water: 5.0 },
  sprintMultiplier: { proteins: 1.2, carbs: 1.8, fats: 1.4, water: 1.7 },
  parasiteMultiplier: 2.5,
  deficient: 15,
  emptyDamagePerSecond: { proteins: 0.12, carbs: 0.12, fats: 0.1, water: 0.45 },
  /** Ao renascer, cada barra volta a pelo menos isto. */
  respawnFloor: 45,
};

/**
 * Consequências da deficiência (qualquer barra < NUTRITION.deficient).
 * - staminaMaxPerDeficit: cada barra deficiente tira isto do máximo de stamina
 * - staminaRegenDeficit: regeneração × isto se houver alguma deficiência
 * - faintChancePerMinute: chance de desmaio por minuto (água ou carboidrato em falta)
 * - faintSeconds: duração do desmaio (tela preta, sem controle)
 * - sanityDrainPerMinute: proteína ou gordura em falta drenam sanidade
 */
export const DEFICIENCY = {
  staminaMaxPerDeficit: 18,
  staminaRegenDeficit: 0.55,
  faintChancePerMinute: 0.35,
  faintSeconds: 4,
  sanityDrainPerMinute: 4,
};

/** Stamina 0..100: correr gasta; parado recupera depois de `regenDelay`. */
export const STAMINA = {
  max: 100,
  sprintDrainPerSecond: 11,
  regenPerSecond: 16,
  regenDelay: 0.9,
  /** Zerou: só volta a correr acima disto. */
  recoverThreshold: 25,
};

/**
 * Sanidade 0..100. Cai com febre, parasitas sob a pele, sanguessugas e fome
 * de proteína/gordura; sobe devagar bem alimentado, perto do fogo e na vila.
 * - hallucinate: abaixo disto, vozes e visão distorcida
 * - breakdown: abaixo disto também tira vida
 */
export const SANITY = {
  max: 100,
  start: 90,
  regenPerMinute: 3,
  regenNearFirePerMinute: 6,
  hallucinate: 35,
  breakdown: 10,
  breakdownDamagePerSecond: 0.08,
  whisperEvery: [18, 40], // s entre alucinações (sorteado)
  whispers: [
    'Alguém chamou seu nome atrás das árvores…',
    'Passos. Bem perto. Não há ninguém.',
    'A sombra no canto do olho se mexeu.',
    'Você ouve tambores que ninguém está tocando.',
    'O chão parece respirar.',
    'Uma voz sussurra: "volte para casa".',
  ],
};

/**
 * Sujeira 0..100. Cuidado: curativo aplicado com a pele suja infecciona.
 * Fontes por segundo (andando, correndo, tempestade de areia × intensidade,
 * lama/chuva no chão), por evento (soco, esfolar), e limpeza (rio, chuva).
 */
export const DIRT = {
  max: 100,
  walkPerSecond: 0.06,
  sprintPerSecond: 0.16,
  sandstormPerSecond: 2.2,
  ashPerSecond: 1.2,
  perPunch: 1.5,
  perAnimalHit: 4,
  perSkinning: 18,
  /** Limpeza: nadando zera rápido; chuva lava × intensidade. */
  swimWashPerSecond: 45,
  rainWashPerSecond: 7,
  /** Acima disto a HUD avisa "pele suja". */
  dirtyWarning: 50,
};

/**
 * Tipos de ferimento (por membro). Campos:
 * - bleed: vida/s enquanto aberto (curativo para)
 * - sanity: sanidade/min perdida enquanto existir
 * - damage: vida/s extra (veneno, infecção)
 * - fever: soma no nível de febre (0..1+) enquanto ativo
 * - selfHeal: some sozinho depois de N s (null = nunca)
 * - infectAfter: aberto e sem curativo por N s → infecciona (× sujeira)
 * - healBandaged: com curativo, cicatriza em N s
 * - becomes: ao virar outro tipo (larva cresce → infecção)
 * - treat: { itemId: ação } — 'bandage' fecha e conta para infecção,
 *   'suture' fecha sem curativo, 'clean' (larvas comem o pus) vira 'limpa',
 *   'antivenom' neutraliza, 'extract' (agulha) tira a larva, 'pull' (mão) tira a sanguessuga
 */
export const WOUNDS = {
  arranhao: {
    name: 'Arranhão', icon: 'scratch', bleed: 0.015, selfHeal: 150, infectAfter: 240, healBandaged: 60,
    treat: { curativo_folha: 'bandage', curativo_cinza: 'bandage', curativo_mel: 'bandage' },
  },
  laceracao: {
    name: 'Laceração', icon: 'blood', bleed: 0.22, selfHeal: null, infectAfter: 150, healBandaged: 200,
    treat: { formigas: 'suture', curativo_folha: 'bandage', curativo_cinza: 'bandage', curativo_mel: 'bandage' },
  },
  limpa: { // ferida infectada depois que as larvas comeram o pus: falta cobrir
    name: 'Ferida Limpa', icon: 'bandage', bleed: 0.03, selfHeal: null, infectAfter: 90, healBandaged: 160,
    treat: { curativo_folha: 'bandage', curativo_cinza: 'bandage', curativo_mel: 'bandage' },
  },
  infeccao: {
    name: 'Ferida Infectada', icon: 'germ', bleed: 0.02, damage: 0.08, sanity: 3, fever: 0.6, selfHeal: null,
    treat: { larvas_carne: 'clean' },
  },
  veneno: {
    name: 'Picada Venenosa', icon: 'skull', bleed: 0.01, damage: 0.32, fever: 1.0, selfHeal: null,
    treat: { curativo_tabaco: 'antivenom', curativo_lirio: 'antivenom' },
    /** Neutralizado o veneno, sobra um furo pequeno. */
    neutralized: 'arranhao',
  },
  sanguessuga: {
    name: 'Sanguessuga', icon: 'bug', bleed: 0.04, sanity: 2, selfHeal: 420,
    treat: { maos: 'pull' },
  },
  larva: {
    name: 'Larva sob a Pele', icon: 'bug', damage: 0.02, sanity: 4, selfHeal: null, becomesAfter: 360, becomes: 'infeccao',
    treat: { agulha_osso: 'extract' },
  },
};

/**
 * Infecção ao aplicar curativo: chance = base + dirtWeight × (sujeira/100),
 * multiplicada pelo `infectionMultiplier` do curativo (cinza/mel protegem).
 * Pele 100% suja: 0,08 + 0,8 = 88% (com folha). Com cinza: × 0,25.
 */
export const INFECTION = {
  base: 0.08,
  dirtWeight: 0.8,
  dressings: { curativo_folha: 1, curativo_cinza: 0.25, curativo_mel: 0.35, curativo_tabaco: 1, curativo_lirio: 1, formigas: 0.6 },
  /** Aberto e sem curativo: o tempo até infeccionar encolhe com a sujeira (× 1 − 0,6 × sujeira). */
  dirtSpeedup: 0.6,
  /** Curativo sujo: o pus aparece (vira 'infeccao') N s depois de aplicado. */
  revealAfter: 45,
};

/**
 * Doenças do corpo todo (não ficam num membro).
 * - parasitas: água não fervida / carne crua; drenam os macros; cura comendo `cures`
 * - febre: derivada das feridas (infecção, veneno); acima de `high` a febre é alta
 */
export const CONDITIONS = {
  parasitas: { name: 'Parasitas Intestinais', icon: 'bug', cures: ['cogumelo_azul', 'cogumelo_roxo', 'guanabana'] },
  febre: {
    name: 'Febre', icon: 'thermo', high: 1,
    sanityPerMinute: 5, // × nível de febre
    staminaMax: 25, // tira isto do máximo de stamina (× nível, até 1)
  },
};

/** Chance de pegar parasitas ao beber/comer algo contaminado. */
export const CONTAMINATION = {
  rawWater: 0.35, // rio, lago, poço sem ferver
  wellWater: 0.12,
  rawMeat: 0.45,
};

/**
 * Comida e bebida: quanto cada uma enche (proteínas, carboidratos, gorduras,
 * água) e efeitos especiais. `contamination` = chave de CONTAMINATION.
 * `cures` = doença/veneno que o alimento trata ao ser consumido.
 */
export const FOODS = {
  carne_assada: { name: 'Carne Assada', icon: 'meat', proteins: 32, fats: 10 },
  carne_seca: { name: 'Carne Seca', icon: 'meat', proteins: 26, fats: 6, water: -4 },
  carne_crua: { name: 'Carne Crua', icon: 'meat', proteins: 14, fats: 6, contamination: 'rawMeat' },
  carne_gorda: { name: 'Carne de Javali Assada', icon: 'meat', proteins: 24, fats: 28 },
  peixe_assado: { name: 'Peixe Assado', icon: 'fish', proteins: 26, fats: 8 },
  larva_assada: { name: 'Larva Assada', icon: 'bug', proteins: 12, fats: 8 },
  banana: { sweet: true, name: 'Banana', icon: 'fruit', carbs: 24, water: 4 },
  fruta: { sweet: true, name: 'Fruta do Bioma', icon: 'fruit', carbs: 18, water: 8 },
  guanabana: { sweet: true, name: 'Guanábana', icon: 'fruit', carbs: 20, water: 10, cures: ['parasitas'] },
  cogumelo: { name: 'Cogumelo Comestível', icon: 'mushroom', carbs: 10, proteins: 4 },
  cogumelo_azul: { name: 'Cogumelo Azul', icon: 'mushroom', carbs: 6, cures: ['parasitas'] },
  cogumelo_roxo: { name: 'Cogumelo Roxo', icon: 'mushroom', carbs: 6, cures: ['parasitas'] },
  castanha: { name: 'Castanha-do-Pará', icon: 'nut', fats: 22, proteins: 6 },
  noz: { name: 'Noz', icon: 'nut', fats: 16, proteins: 4 },
  coco: { name: 'Coco (polpa)', icon: 'nut', fats: 20, carbs: 6 },
  agua_coco: { sweet: true, name: 'Água de Coco', icon: 'nut', water: 30, carbs: 4 },
  agua_fervida: { name: 'Água Fervida', icon: 'drop', water: 35 },
  agua_rio: { name: 'Água do Rio', icon: 'wave', water: 25, contamination: 'rawWater' },
  agua_poco: { name: 'Água do Poço', icon: 'bucket', water: 30, contamination: 'wellWater' },
  mel: { sweet: true, name: 'Mel', icon: 'jar', carbs: 22 },
  folha_tabaco: { name: 'Folha de Tabaco', icon: 'leaf', cures: ['veneno'], sanity: -6 },
  refeicao_vila: { name: 'Refeição da Vila', icon: 'bowl', proteins: 30, carbs: 30, fats: 22, water: 10 },
};

/**
 * Ferimentos causados pelos animais (espécie → tipo, membro aleatório).
 * Picadas de cobra/escorpião envenenam; garras e presas laceram ou arranham.
 * `chance` = probabilidade de cada golpe deixar o ferimento.
 */
export const ANIMAL_WOUNDS = {
  default: { type: 'arranhao', chance: 0.5, limbs: 'any' },
  vibora: { type: 'veneno', chance: 0.9, limbs: 'legs' },
  escorpiao: { type: 'veneno', chance: 0.75, limbs: 'any' },
  leao: { type: 'laceracao', chance: 0.8, limbs: 'any' },
  leopardo: { type: 'laceracao', chance: 0.75, limbs: 'any' },
  onca: { type: 'laceracao', chance: 0.75, limbs: 'any' },
  hiena: { type: 'laceracao', chance: 0.6, limbs: 'legs' },
  lobo: { type: 'laceracao', chance: 0.6, limbs: 'legs' },
  urso: { type: 'laceracao', chance: 0.9, limbs: 'arms' },
  jacare: { type: 'laceracao', chance: 0.9, limbs: 'legs' },
  javali: { type: 'laceracao', chance: 0.6, limbs: 'legs' },
  cerbero: { type: 'laceracao', chance: 1, limbs: 'any' },
};

/**
 * Ambiente: sanguessugas na água doce, larvas em mata fechada.
 * Chance POR MINUTO enquanto a condição vale.
 */
export const HAZARDS = {
  leechPerMinuteSwimming: 0.5,
  wormPerMinuteJungle: 0.05,
  /** Biomas de mata fechada (índices de BIOMES) onde a larva pode pegar. */
  jungleBiomes: ['tropical', 'equatorial'],
};

/**
 * Inspeção corporal 3D (tecla C): pose de cada membro, distância da câmera,
 * sensibilidade do arrasto e quanto puxar para arrancar uma sanguessuga.
 */
export const INSPECTION = {
  armPose: { tilt: -0.35, raise: 1.25 }, // braço erguido para o lado (rad)
  legPose: { lift: -0.5 }, // perna um pouco à frente (rad)
  camera: { arm: 0.62, leg: 0.78, body: 2.3, lerp: 7 }, // distâncias (m) e suavidade
  spinPerPixel: 0.012,
  tiltPerPixel: 0.007,
  maxTilt: 0.9,
  leechPullPixels: 70,
  fauna: { discoverRadius: 45 }, // caderneta: animal avistado a até N m
};

/** Senhor da Vila Renascimento: trata todos os ferimentos e doenças por moedas. */
export const MEDIC = { treatAllCost: 25 };

/** Lojas: comida e água fervida para não morrer antes de aprender a caçar. */
export const SHOP_FOOD = [
  { id: 'refeicao_vila', price: 8 },
  { id: 'agua_fervida', price: 2 },
  { id: 'banana', price: 2 },
  { id: 'carne_seca', price: 5 },
  { id: 'castanha', price: 4 },
];
