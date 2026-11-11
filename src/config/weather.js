/**
 * Clima por bioma + névoa paranormal. Todos os números de ajuste ficam aqui.
 *
 * Cada bioma tem um evento climático que NÃO é fixo: a cada hora do jogo o
 * WeatherScheduler sorteia o estado do bioma (limpo / nublado / tempestade,
 * ver `roll`). O WeatherManager mistura os biomas pelos pesos na posição do
 * jogador, então ao cruzar uma fronteira um clima some e o outro chega.
 *
 * ── states ── nome mostrado no HUD para cada estado do bioma
 * ── roll ── chances a cada hora: `storm` = tempestade (dura `stormHours`
 *   horas), `clear` = céu limpo; o resto vira "nublado".
 *
 * ── particles ── (THREE.Points recicladas numa caixa em volta da câmera)
 *   count      partículas no nível Ultra (os outros níveis multiplicam por
 *              `weatherDensity` de config/graphics.js)
 *   box        [largura, altura, profundidade] da caixa (m), centrada na câmera
 *   shape      'dot' poeira/cinza · 'flake' floco · 'leaf' folha seca ·
 *              'streak' risco alinhado ao movimento na tela (chuva, areia) ·
 *              'puff' nuvem macia grande (paredes de poeira/neve/névoa)
 *   size       tamanho no mundo (m)
 *   sizes      [[× tamanho, fração das partículas, × queda], …] — ex.: neve
 *              em 3 tamanhos (os grandes caem mais devagar)
 *   color      cor; `opacity` 0..1; `alphaVar` 0..1 variação por partícula
 *   fall       velocidade de queda (m/s, positivo = desce)
 *   jitter     variação aleatória da velocidade por partícula (m/s)
 *   flutter    amplitude do balanço lateral (folhas, neve) (m/s)
 *   spin       rotação da partícula (rad/s, cada uma num sentido/ritmo)
 *   minLevel   a camada só aparece acima desta intensidade (0..1) —
 *              ex.: a "parede de poeira" só existe na tempestade
 *   additive   true = brilha (soma), false = cobre (normal)
 *
 * ── wind ── vetor do vento (m/s) em x (leste) e z (sul) + rajadas
 *   gust       fração extra nas rajadas; gustPeriod em segundos
 *   storm      × vento na tempestade (o vento sobe junto com a intensidade)
 *
 * ── look ── o quanto o evento muda a luz NO AUGE (aplicado sobre o Environment)
 *   fogColor + fogColorMix  cor alvo da neblina e quanto puxar (0..1)
 *   fogDensity              densidade alvo da neblina
 *   sunTint + sunTintMix    cor do sol
 *   sunMul, hemiMul         multiplicam a luz direta e a ambiente
 *   exposureMul             multiplica a exposição
 *   bloom                   força do brilho (só nos níveis com bloom)
 *   lantern                 0..1 acende a lanterna do jogador
 *   skyToFog                quanto o céu se apaga na cor da neblina
 *
 * ── splashes ── (opcional) respingos no chão onde a chuva cai
 * ── lightning ── (opcional) relâmpagos: intervalo [min, max] em s, força
 *   do clarão (luz ambiente + sol), atraso do trovão [min, max] em s e
 *   distância do raio visível (m).
 * ── overlay ── vinheta CSS na tela: 'sand' · 'frost' · 'rain' · 'ash'
 * ── debuff ── efeito no personagem durante a tempestade (ver DEBUFFS)
 */
export const WEATHER = {
  savana: {
    name: 'Ventania e folhas secas',
    states: { limpo: 'Céu limpo', nublado: 'Brisa seca', tempestade: 'Ventania' },
    roll: { storm: 0.25, clear: 0.45, stormHours: [1, 2] },
    particles: [
      { shape: 'dot', count: 1600, box: [70, 22, 70], size: 0.07, color: 0xd9bf8c, opacity: 0.55, alphaVar: 0.5, fall: 0.15, jitter: 0.6, flutter: 0.4 },
      { shape: 'leaf', count: 320, box: [60, 18, 60], size: 0.22, sizes: [[0.7, 0.5, 1], [1, 0.35, 1], [1.4, 0.15, 0.8]], color: 0xa8782f, opacity: 0.95, fall: 0.6, jitter: 0.5, flutter: 1.6, spin: 4 },
      { shape: 'puff', count: 60, box: [90, 10, 90], size: 7, color: 0xd8b98a, opacity: 0.12, alphaVar: 0.5, fall: 0, jitter: 0.2, flutter: 0.5, spin: 0.15, minLevel: 0.6 },
    ],
    wind: { x: 7.5, z: 2.5, gust: 0.6, gustPeriod: 7, storm: 1.6 },
    look: {
      fogColor: 0xe0b98a, fogColorMix: 0.35, fogDensity: 0.0012,
      sunTint: 0xffb05a, sunTintMix: 0.55, sunMul: 1.0, hemiMul: 0.95, exposureMul: 1.0,
      bloom: 0.15, lantern: 0, skyToFog: 0.15,
    },
    overlay: 'sand',
    debuff: 'ventania',
  },
  taiga: {
    name: 'Nevasca extrema',
    states: { limpo: 'Céu limpo e frio', nublado: 'Neve fraca', tempestade: 'Nevasca extrema' },
    roll: { storm: 0.3, clear: 0.3, stormHours: [1, 3] },
    particles: [
      // Flocos em 3 tamanhos: pequenos rápidos, médios, grandes lentos.
      { shape: 'flake', count: 7500, box: [44, 26, 44], size: 0.1, sizes: [[0.6, 0.55, 1.3], [1, 0.3, 1], [1.9, 0.15, 0.7]], color: 0xffffff, opacity: 0.92, alphaVar: 0.35, fall: 2.4, jitter: 0.8, flutter: 1.1, spin: 2 },
      // Paredes de neve soprada (só na nevasca).
      { shape: 'puff', count: 140, box: [70, 16, 70], size: 8, color: 0xeef4fa, opacity: 0.2, alphaVar: 0.5, fall: 0.4, jitter: 0.3, flutter: 0.6, spin: 0.2, minLevel: 0.55 },
    ],
    wind: { x: -6, z: 3.5, gust: 1.0, gustPeriod: 4, storm: 2.2 },
    look: {
      fogColor: 0xe8eef3, fogColorMix: 0.9, fogDensity: 0.016,
      sunTint: 0xdfe8f5, sunTintMix: 0.5, sunMul: 0.4, hemiMul: 1.1, exposureMul: 1.05,
      bloom: 0, lantern: 0, skyToFog: 0.9,
    },
    overlay: 'frost',
    debuff: 'frio',
  },
  deserto: {
    name: 'Tempestade de areia',
    states: { limpo: 'Sol forte', nublado: 'Vento com areia', tempestade: 'Tempestade de areia' },
    roll: { storm: 0.3, clear: 0.5, stormHours: [1, 2] },
    particles: [
      // Camadas horizontais rápidas (riscos alinhados ao vento na tela).
      { shape: 'streak', count: 6500, box: [40, 12, 40], size: 0.75, color: 0xb88444, opacity: 0.8, alphaVar: 0.6, fall: 0.3, jitter: 3, flutter: 0.8 },
      { shape: 'streak', count: 2500, box: [60, 6, 60], size: 1.2, color: 0xd8a860, opacity: 0.55, alphaVar: 0.6, fall: 0.1, jitter: 4, flutter: 0.5, minLevel: 0.45 },
      { shape: 'dot', count: 2600, box: [30, 12, 30], size: 0.08, color: 0xb98642, opacity: 0.85, alphaVar: 0.5, fall: 0.2, jitter: 1.5, flutter: 0.6 },
      // Parede de poeira: nuvens macias enormes cruzando.
      { shape: 'puff', count: 200, box: [80, 18, 80], size: 10, color: 0xc4925a, opacity: 0.26, alphaVar: 0.6, fall: 0, jitter: 0.5, flutter: 0.8, spin: 0.25, minLevel: 0.4 },
    ],
    wind: { x: 14, z: -2.5, gust: 0.5, gustPeriod: 4, storm: 2 },
    look: {
      fogColor: 0xc4935a, fogColorMix: 0.92, fogDensity: 0.022,
      sunTint: 0xe0a060, sunTintMix: 0.65, sunMul: 0.35, hemiMul: 0.7, exposureMul: 0.95,
      bloom: 0, lantern: 0, skyToFog: 0.92,
    },
    overlay: 'sand',
    debuff: 'areia',
  },
  tropical: {
    name: 'Chuva torrencial',
    states: { limpo: 'Abafado', nublado: 'Nublado com garoa', tempestade: 'Tempestade torrencial' },
    roll: { storm: 0.35, clear: 0.15, stormHours: [1, 3] },
    particles: [
      // Gotas translúcidas inclinadas pelo vento (risco alinhado ao movimento).
      { shape: 'streak', count: 9000, box: [36, 24, 36], size: 0.95, color: 0xcfdde8, opacity: 0.5, alphaVar: 0.6, fall: 22, jitter: 3, flutter: 0 },
      { shape: 'puff', count: 70, box: [70, 12, 70], size: 9, color: 0x9aa6a8, opacity: 0.14, alphaVar: 0.5, fall: 0.5, jitter: 0.2, flutter: 0.3, spin: 0.1, minLevel: 0.6 },
    ],
    wind: { x: 3, z: 1.5, gust: 0.5, gustPeriod: 6, storm: 2.5 },
    look: {
      fogColor: 0x6d7c7a, fogColorMix: 0.75, fogDensity: 0.0085,
      sunTint: 0xc8d4dc, sunTintMix: 0.6, sunMul: 0.3, hemiMul: 0.65, exposureMul: 0.88,
      bloom: 0, lantern: 0.3, skyToFog: 0.9,
    },
    splashes: { count: 420, radius: 15, life: 0.32, size: 0.45, color: 0xdfeaf2, opacity: 0.55 },
    lightning: { every: [5, 14], flash: 3.4, sunFlash: 9, thunderDelay: [0.4, 2.6], distance: [180, 520], minLevel: 0.65 },
    overlay: 'rain',
    debuff: 'lama',
  },
  kalahari: {
    name: 'Onda de calor (miragem)',
    states: { limpo: 'Calor seco', nublado: 'Calor seco', tempestade: 'Onda de calor' },
    roll: { storm: 0.3, clear: 0.4, stormHours: [1, 3] },
    particles: [
      { shape: 'dot', count: 700, box: [50, 14, 50], size: 0.05, color: 0xffe2b0, opacity: 0.45, alphaVar: 0.7, fall: -0.05, jitter: 0.08, flutter: 0.12, additive: true },
      { shape: 'puff', count: 40, box: [80, 6, 80], size: 9, color: 0xf3d2a0, opacity: 0.07, alphaVar: 0.5, fall: -0.05, jitter: 0.05, flutter: 0.2, spin: 0.05, minLevel: 0.6 },
    ],
    wind: { x: 0.2, z: 0, gust: 0, gustPeriod: 10, storm: 1 },
    look: {
      fogColor: 0xf3d7a8, fogColorMix: 0.4, fogDensity: 0.0007,
      sunTint: 0xfff3dc, sunTintMix: 0.3, sunMul: 1.3, hemiMul: 1.1, exposureMul: 1.2,
      bloom: 0.8, lantern: 0, skyToFog: 0,
    },
    overlay: 'heat',
    debuff: 'insolacao',
  },
  equatorial: {
    name: 'Névoa úmida',
    states: { limpo: 'Úmido', nublado: 'Garoa', tempestade: 'Névoa densa' },
    roll: { storm: 0.3, clear: 0.25, stormHours: [1, 3] },
    particles: [
      { shape: 'streak', count: 3400, box: [32, 20, 32], size: 0.5, color: 0xd2e0d0, opacity: 0.38, alphaVar: 0.6, fall: 9, jitter: 1.5, flutter: 0 },
      { shape: 'dot', count: 900, box: [36, 10, 36], size: 0.05, color: 0xdfe8d8, opacity: 0.3, alphaVar: 0.6, fall: 0.05, jitter: 0.1, flutter: 0.15, additive: true },
      { shape: 'puff', count: 160, box: [70, 8, 70], size: 9, color: 0xb6c4a8, opacity: 0.16, alphaVar: 0.5, fall: 0, jitter: 0.1, flutter: 0.3, spin: 0.05, minLevel: 0.45 },
    ],
    wind: { x: 0.5, z: 0.3, gust: 0.2, gustPeriod: 8, storm: 1.3 },
    look: {
      fogColor: 0x9aab88, fogColorMix: 0.8, fogDensity: 0.012,
      sunTint: 0xdfe8c8, sunTintMix: 0.4, sunMul: 0.5, hemiMul: 0.72, exposureMul: 0.92,
      bloom: 0, lantern: 0.25, skyToFog: 0.8,
    },
    overlay: 'rain',
    debuff: 'umidade',
  },
  preta: {
    name: 'Chuva de cinzas',
    states: { limpo: 'Cinzento', nublado: 'Cinzas no ar', tempestade: 'Chuva de cinzas corrompida' },
    roll: { storm: 0.35, clear: 0.2, stormHours: [1, 3] },
    particles: [
      { shape: 'flake', count: 3400, box: [38, 22, 38], size: 0.1, sizes: [[0.7, 0.5, 1.2], [1, 0.3, 1], [1.7, 0.2, 0.7]], color: 0x2a2626, opacity: 0.85, alphaVar: 0.4, fall: 0.7, jitter: 0.3, flutter: 0.5, spin: 1.5 },
      { shape: 'dot', count: 320, box: [40, 18, 40], size: 0.06, color: 0xff6a2a, opacity: 0.9, alphaVar: 0.6, fall: -0.25, jitter: 0.25, flutter: 0.4, additive: true },
      { shape: 'puff', count: 90, box: [70, 12, 70], size: 9, color: 0x3a2836, opacity: 0.2, alphaVar: 0.5, fall: 0.2, jitter: 0.1, flutter: 0.3, spin: 0.08, minLevel: 0.5 },
    ],
    wind: { x: 0.8, z: -0.6, gust: 0.4, gustPeriod: 9, storm: 1.5 },
    look: {
      fogColor: 0x3a2433, fogColorMix: 0.78, fogDensity: 0.0095,
      sunTint: 0x8a6070, sunTintMix: 0.6, sunMul: 0.08, hemiMul: 0.55, exposureMul: 0.95,
      bloom: 0.25, lantern: 1, skyToFog: 0.8,
    },
    overlay: 'ash',
    debuff: 'corrupcao',
  },
};

/**
 * Ciclo de dias e horários + sorteio do clima.
 * - hourSeconds: segundos reais por hora do jogo (50 → um dia = 20 min)
 * - start: dia e hora em que o jogo começa
 * - levels: intensidade de cada estado (0..1) — partículas, luz e debuffs
 *   escalam com ela; a tempestade é 1
 * - transition: [min, max] segundos para ir de um estado ao outro (fade de
 *   névoa, partículas e luz) — sorteado a cada mudança
 * - seed: sorteio do clima é determinístico (mesma semente = mesmo tempo)
 */
export const WEATHER_CYCLE = {
  hourSeconds: 50,
  start: { day: 1, hour: 15 },
  levels: { limpo: 0.1, nublado: 0.42, tempestade: 1 },
  transition: [5, 10],
  seed: 1337,
};

/**
 * Debuffs climáticos (só durante tempestade — intensidade efetiva ≥
 * `threshold`, já contando o peso do bioma e o abrigo das vilas). A força
 * cresce de 0 no limiar até 1 na tempestade cheia.
 * - speed / jump: multiplicam velocidade e pulo no auge
 * - dps: dano por segundo no auge; nunca abaixo de `DEBUFF_RULES.minHealth`
 * - exposure: % de exposição paranormal por segundo no auge
 * - fireCancels: perto de uma fogueira (DEBUFF_RULES.fireRadius) o efeito some
 */
export const DEBUFFS = {
  ventania: { name: 'Ventania', icon: 'wind', speed: 0.88, description: 'Vento contra: −12% de velocidade.' },
  frio: { name: 'Frio extremo', icon: 'snow', speed: 0.65, jump: 0.8, dps: 0.4, fireCancels: true, description: 'Lento e perdendo vida. Fique perto de uma fogueira.' },
  areia: { name: 'Areia cortante', icon: 'wind', speed: 0.7, dps: 0.25, description: 'A areia corta a pele e atrasa os passos.' },
  lama: { name: 'Chão encharcado', icon: 'rain', speed: 0.82, jump: 0.75, description: 'Lama e poças: mais lento, pulo fraco.' },
  insolacao: { name: 'Insolação', icon: 'sun', speed: 0.9, dps: 0.15, description: 'O calor drena suas forças.' },
  umidade: { name: 'Névoa úmida', icon: 'fog', speed: 0.92, description: 'Roupa encharcada pesa.' },
  corrupcao: { name: 'Cinzas corrompidas', icon: 'candle', speed: 0.9, exposure: 0.12, description: 'As cinzas sussurram: a exposição paranormal sobe.' },
};

/** Regras gerais dos debuffs. */
export const DEBUFF_RULES = {
  threshold: 0.55, // intensidade efetiva mínima para o debuff valer
  minHealth: 10, // o clima nunca mata: deixa no máximo com 10 de vida
  fireRadius: 9, // m: perto de uma fogueira, debuffs com fireCancels somem
};

/**
 * Névoa de tensão paranormal: perto de uma criatura a neblina engrossa e
 * escurece. A intensidade sobe de 0 (na borda do raio) a 1 (em `innerRadius`).
 */
export const PARANORMAL_FOG = {
  radius: 50, // m: começa a engrossar
  innerRadius: 8, // m: névoa no máximo
  fogDensity: 0.045, // densidade no máximo (≈ 50 m de visão)
  fogColor: 0x2f3236, // cinza sombrio
  sunMul: 0.35, // a luz some junto
  rate: 0.9, // velocidade do lerp (1/s): baixo = suspense lento
};

/** Lanterna do jogador (acende nos climas escuros). */
export const LANTERN = { color: 0xffc98a, intensity: 18, distance: 26, decay: 1.6, height: 2.2 };

/** Pós-processamento do bloom (UnrealBloomPass). */
export const BLOOM = { radius: 0.55, threshold: 0.82, minStrength: 0.02 };

/**
 * Abrigo das vilas: dentro de uma vila o clima fica mais fraco (casas
 * cortam o vento, a vila não some na nevasca). `strength` 0 = sem abrigo,
 * 1 = clima some na vila; `fade` = metros fora da borda até o clima voltar
 * inteiro. A névoa paranormal NÃO é afetada.
 */
export const VILLAGE_SHELTER = { strength: 0.75, fade: 80 };
