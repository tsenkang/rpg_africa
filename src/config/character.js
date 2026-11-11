/**
 * Ficha do personagem ativo (CharacterProfile) e regras de sanidade.
 *
 * Edite `CHARACTER_PROFILE` para mudar a personalidade: as atividades de
 * conforto que ele GOSTA recuperam sanidade cheia; as outras recuperam só
 * `COMFORT.unlikedFactor`. Cada "dislike" multiplica a perda de sanidade
 * dos eventos marcados com aquela tag.
 */
export const CHARACTER_PROFILE = {
  name: 'Kwame',
  comfortActivities: ['FOGUEIRA', 'TOCAR_INSTRUMENTO', 'COMER_DOCES', 'PET_ANIMAIS', 'LER_LIVROS'],
  dislikes: ['SANGUE', 'ESCURIDAO'],
};

/**
 * Atividades de conforto (recuperação de sanidade).
 * - perSecond: atividade contínua (ficar perto do fogo)
 * - amount: atividade pontual (tocar, comer, acariciar, ler); `cooldown` s
 *   entre usos que contam (repetir na hora não recupera de novo)
 * - label: texto do aviso
 */
export const COMFORT = {
  unlikedFactor: 0.25,
  activities: {
    FOGUEIRA: { perSecond: 0.9, label: 'O calor do fogo acalma' },
    TOCAR_INSTRUMENTO: { amount: 14, cooldown: 25, label: 'A música organiza os pensamentos' },
    COMER_DOCES: { amount: 7, cooldown: 12, label: 'Um gosto doce de casa' },
    PET_ANIMAIS: { amount: 10, cooldown: 20, label: 'O animal se encosta em você' },
    LER_LIVROS: { amount: 16, cooldown: 40, label: 'Algumas páginas e o mundo volta ao lugar' },
  },
};

/** Multiplicador da perda quando o evento tem uma tag que o personagem detesta. */
export const DISLIKE_MULTIPLIER = 1.8;

/**
 * Gatilhos de perda de sanidade.
 * Contínuos (por segundo): paranormal (× proximidade 0..1), local amaldiçoado,
 * escuridão. Pontuais: morte de animal à vista, morte de NPC, corpo/esqueleto
 * encontrado, ataque surpresa, dano crítico.
 */
export const SANITY_TRIGGERS = {
  paranormalPerSecond: 2.2,
  cursedPerSecond: 0.45,
  darkPerSecond: 0.12,
  darkNight: 0.65, // Environment.night acima disto = noite escura
  animalDeath: 3,
  npcDeath: 12,
  corpseFound: 8,
  surpriseAttack: 6,
  criticalHit: 7,
  criticalFraction: 0.18, // golpe que tira ≥ 18% da vida máxima
  witnessRadius: 45, // m: morte mais longe que isto não é "presenciada"
  witnessDot: 0.35, // precisa estar na frente da câmera (cos do ângulo)
  surpriseDot: 0.2, // atacante fora disto (atrás/lado) = ataque surpresa
  skinning: 2, // esfolar (tag SANGUE)
};

/** Áreas amaldiçoadas: centro numa vila (id) + raio extra além do raio dela. */
export const CURSED_AREAS = [
  { village: 'ruinasKaelen', extra: 40, name: 'Ruínas de Kaelen' },
];

/**
 * Níveis de alucinação (sanidade abaixo de `below`):
 * 1 = distorção visual leve; 2 = sons fantasmas e sussurros;
 * 3 = criaturas fantasmas no mapa.
 */
export const HALLUCINATION_LEVELS = [
  { level: 1, below: 50 },
  { level: 2, below: 30 },
  { level: 3, below: 15 },
];

/** Barra da HUD: abaixo desta fração ela pulsa com brilho elétrico. */
export const SANITY_BAR = { pulseBelow: 0.3 };

/**
 * Criaturas fantasmas (nível 3): sombras que surgem longe, se aproximam e
 * se desfazem quando o jogador chega perto.
 */
export const PHANTOMS = {
  max: 3,
  spawnEvery: [6, 14], // s entre aparições
  spawnDistance: [18, 30],
  speed: 1.4,
  vanishDistance: 5,
  life: 22,
  fade: 0.8,
  dread: 1.5, // sanidade perdida quando uma surge
};

/** Sons fantasmas (nível ≥ 2): intervalo sorteado em s. */
export const PHANTOM_SOUNDS = { every: [9, 22], volume: 0.35 };

/** Esqueletos/ossadas espalhados: perto deles (m) e à vista = trauma, uma vez cada. */
export const SKELETONS = {
  noticeRadius: 7,
  sites: [
    { village: 'ruinasKaelen', count: 6, ring: [8, 60] },
    { village: 'alZahir', count: 3, ring: [0, 0], outside: [25, 70] },
    { village: 'areiasVivas', count: 3, ring: [0, 0], outside: [25, 70] },
  ],
};
