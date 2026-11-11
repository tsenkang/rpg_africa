/**
 * Ajustes do sistema de animação (data-driven). Usado por:
 *  - `src/entities/anim/AnimalAnimationManager.js` (animais: clipes + ciclos procedurais)
 *  - `src/render/AutoRig.js` (esqueleto gerado para modelos 3D estáticos)
 *  - `src/entities/Humanoid.js` (jogador e NPCs)
 *
 * Unidades: segundos, radianos, metros. "rate" = taxa de amortecimento
 * exponencial (1/s): o valor percorre ~63% do caminho em 1/rate s, ~95% em 3/rate s.
 */
export const ANIMATION = {
  /** Troca de clipe (AnimationMixer.crossFadeTo) e transição entre estados procedurais. */
  blend: {
    crossFade: 0.3, // s — idle ↔ walk ↔ run (dentro da faixa pedida de 0,2–0,4 s)
    attackFade: 0.18, // s — entrar no bote é mais rápido (antecipação curta)
    deathFade: 0.35,
    stateRate: 7, // 1/s — pesos dos estados procedurais (≈0,4 s para 95%)
    boneRate: 26, // 1/s — slerp de cada osso até a pose-alvo (suaviza qualquer quina)
    rootRate: 12, // 1/s — corpo inteiro (inclinação, agachar, bote)
    timeScaleRate: 5, // 1/s — ritmo do clipe acompanha a velocidade sem trancos
  },

  /** Biomecânica dos quadrúpedes (passo lateral, trote, galope). */
  gait: {
    /** Frequência da passada f = k·√(v / perna), limitada (Hz). */
    cadenceK: 0.92,
    minHz: 0.55,
    maxHz: 2.6,
    /** Fração do ciclo com a pata no chão (duty factor), por andadura. */
    duty: { walk: 0.64, trot: 0.5, gallop: 0.38 },
    /** Fase de cada pata [traseira E, dianteira E, traseira D, dianteira D] em ciclos. */
    phases: {
      walk: [0, 0.25, 0.5, 0.75], // sequência lateral (4 tempos)
      trot: [0, 0.5, 0.5, 0], // diagonais juntas
      gallop: [0, 0.58, 0.1, 0.68], // galope rotativo: traseiras, suspensão, dianteiras
    },
    maxSwing: 0.62, // rad — amplitude máxima do quadril
    kneeLift: 0.9, // rad — dobra do joelho no balanço (pata sobe)
    spineSway: 0.05, // rad — balanço lateral da coluna no passo
    spineFlex: 0.16, // rad — flexão/extensão da coluna no galope
    headNod: 0.09, // rad — cabeça vai e volta a cada passo (cavalos/girafas mais)
    bob: 0.035, // × altura — sobe-desce do corpo
    turnBank: 0.18, // rad — inclina para dentro da curva correndo
    turnSpine: 0.22, // rad — coluna curva na direção da curva
  },

  /** Bípedes (avestruz) e o vaivém de pescoço das aves. */
  biped: { maxSwing: 0.75, kneeLift: 1.3, headBob: 0.22, bob: 0.05 },

  /** Respiração em repouso (seno lento): caixa torácica e cabeça. */
  breath: {
    hz: 0.32, // ciclos/s (≈19 respirações por minuto)
    ribs: 0.028, // escala extra da caixa torácica no pico
    spine: 0.012, // rad — coluna acompanha a inspiração
    head: 0.02, // rad — cabeça sobe levemente
    lookHz: 0.11, // olhar em volta (devagar)
    lookYaw: 0.35,
  },

  /** Nado dos animais (capivara, jacaré e quem mais nadar). */
  swim: {
    hz: 0.95, // remadas por segundo
    paddle: 0.7, // rad — amplitude da remada
    undulate: 0.16, // rad — ondulação horizontal do corpo
    tail: 0.55, // rad — ondulação da cauda (ponta)
    wave: 0.9, // rad de atraso entre ossos (a onda corre da cabeça à cauda)
    headUp: 0.28, // rad — focinho para fora d'água
  },

  /**
   * Ataque em 3 fases (Antecipação → Impacto → Recuperação), s.
   * O dano sai no meio do impacto (`Animal` atrasa o golpe até lá).
   */
  attack: {
    pounce: { anticipation: 0.32, impact: 0.16, recovery: 0.5, leap: 0.12, reach: 0.38 }, // felinos
    bite: { anticipation: 0.24, impact: 0.13, recovery: 0.42, leap: 0.03, reach: 0.26 }, // lobo, hiena, jacaré
    slam: { anticipation: 0.42, impact: 0.15, recovery: 0.55, leap: 0.05, reach: 0.22 }, // gorila, urso
    headbutt: { anticipation: 0.3, impact: 0.14, recovery: 0.45, leap: 0.0, reach: 0.25 }, // alce, javali
    sting: { anticipation: 0.14, impact: 0.08, recovery: 0.55, leap: 0.0, reach: 0.12 }, // escorpião (bote rápido, retração lenta)
    peck: { anticipation: 0.18, impact: 0.08, recovery: 0.3, leap: 0.0, reach: 0.15 }, // aves, víbora procedural
    flankBite: { anticipation: 0.18, impact: 0.12, recovery: 0.35, leap: 0.0, reach: 0.3 }, // lobo/hiena: mordida baixa no calcanhar
    neckHoof: { anticipation: 0.45, impact: 0.18, recovery: 0.6, leap: 0.0, reach: 0.18 }, // girafa: pescoço-martelo + casco
    deathRoll: { anticipation: 0.12, impact: 0.12, recovery: 0.5, leap: 0.0, reach: 0.55 }, // jacaré: bote da água
    maul: { anticipation: 0.5, impact: 0.16, recovery: 0.6, leap: 0.0, reach: 0.25 }, // urso: ergue-se e golpeia de cima
    groundPound: { anticipation: 0.55, impact: 0.14, recovery: 0.6, leap: 0.0, reach: 0.15 }, // gorila: punhos no chão
    rearKick: { anticipation: 0.22, impact: 0.12, recovery: 0.45, leap: 0.0, reach: -0.25 }, // zebra/alce: coice para trás
  },

  /** Seguimento do terreno (suspensão): inclinação do corpo na rampa. */
  terrain: {
    rate: 8, // 1/s
    maxPitch: 0.45, // rad
    maxRoll: 0.3, // rad
    humanLean: 0.35, // fração da rampa que o tronco humano inclina
    footIK: true, // pés humanos apoiados no chão (IK de 2 ossos)
    footIKMax: 0.35, // m — compensação máxima por pé
  },

  /** Humanos (jogador e NPCs). */
  human: {
    jointRate: 24, // 1/s — slerp das juntas em locomoção
    actionRate: 48, // 1/s — durante soco/recuo (golpe nítido)
    transition: 0.4, // s — crossfade terra ↔ água ↔ voo (ease-in-out)
    transitionRate: 6, // 1/s — juntas mais macias dentro da janela
    swimStrokeHz: 0.55, // braçadas completas por segundo (crawl)
    kickHz: 1.6, // pernadas por segundo
    treadHz: 0.7, // nado parado (pedalar)
    bobHz: 0.45, // flutuação
    bobAmp: 0.045, // m
  },

  /** Ajuste do AutoRig (frações da caixa do modelo). */
  autoRig: {
    footBand: 0.12, // × altura — "pés": amostras abaixo disto agrupam as pernas
    legBlend: 0.08, // × altura — mistura perna ↔ tronco perto da barriga
    kneeAt: 0.5, // × altura da barriga — joelho/jarrete
    weightPower: 4, // peso ∝ 1/distância^p (mais alto = juntas mais rígidas)
    ribsShare: 0.5, // fração do peso do tronco que vai para a caixa torácica
  },
};

/** Estilo de ataque por espécie (`ANIMATION.attack[estilo]`). Sem entrada: 'bite'. */
export const ATTACK_STYLE = {
  leao: 'pounce', onca: 'pounce', leopardo: 'pounce',
  lobo: 'flankBite', hiena: 'flankBite', cerbero: 'bite', jacare: 'deathRoll', vibora: 'peck',
  gorila: 'groundPound', urso: 'maul',
  alce: 'rearKick', javali: 'headbutt', camelo: 'headbutt', girafa: 'neckHoof', zebra: 'rearKick', avestruz: 'peck',
  escorpiao: 'sting', corvo: 'peck', arara: 'peck',
};
