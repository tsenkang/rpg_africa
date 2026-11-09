/**
 * Clima por bioma + névoa paranormal. Todos os números de ajuste ficam aqui.
 *
 * Cada bioma tem UM evento climático. O WeatherManager mistura os eventos
 * pelos pesos de bioma na posição do jogador (os mesmos que o Environment
 * usa), então ao cruzar uma fronteira um clima some enquanto o outro chega.
 *
 * ── particles ── (THREE.Points recicladas numa caixa em volta da câmera)
 *   count      partículas no nível Ultra (os outros níveis multiplicam por
 *              `weatherDensity` de config/graphics.js)
 *   box        [largura, altura, profundidade] da caixa (m), centrada na câmera
 *   shape      'dot' (poeira/cinza) · 'flake' (neve) · 'leaf' (folha seca)
 *              'streakV' (chuva) · 'streakH' (areia cruzando a tela)
 *   size       tamanho no mundo (m)
 *   color      cor; `opacity` 0..1
 *   fall       velocidade de queda (m/s, positivo = desce)
 *   jitter     variação aleatória da velocidade por partícula (m/s)
 *   flutter    amplitude do balanço lateral (folhas, neve) (m/s)
 *   additive   true = brilha (soma), false = cobre (normal)
 *
 * ── wind ── vetor do vento (m/s) em x (leste) e z (sul) + rajadas
 *   gust       fração extra nas rajadas; gustPeriod em segundos
 *
 * ── cycle ── o evento vai e volta: intensidade oscila entre `min` e 1
 *   com período `period` (s). min = 1 → constante.
 *
 * ── look ── o quanto o evento muda a luz (aplicado sobre o Environment)
 *   fogColor + fogColorMix  cor alvo da neblina e quanto puxar (0..1)
 *   fogDensity              densidade alvo da neblina no auge do evento
 *   sunTint + sunTintMix    cor do sol
 *   sunMul, hemiMul         multiplicam a luz direta e a ambiente
 *   exposureMul             multiplica a exposição
 *   bloom                   força do brilho (só nos níveis com bloom)
 *   lantern                 0..1 acende a lanterna do jogador
 *   skyToFog                quanto o céu se apaga na cor da neblina
 *
 * ── lightning ── (opcional) relâmpagos: intervalo [min, max] em s, força
 *   do clarão e atraso do trovão [min, max] em s.
 */
export const WEATHER = {
  savana: {
    name: 'Ventania e folhas secas',
    particles: [
      { shape: 'dot', count: 1400, box: [70, 22, 70], size: 0.07, color: 0xd9bf8c, opacity: 0.55, fall: 0.15, jitter: 0.6, flutter: 0.4, additive: false },
      { shape: 'leaf', count: 260, box: [60, 18, 60], size: 0.22, color: 0xa8782f, opacity: 0.95, fall: 0.6, jitter: 0.5, flutter: 1.6, additive: false },
    ],
    wind: { x: 7.5, z: 2.5, gust: 0.6, gustPeriod: 7 },
    cycle: { period: 70, min: 0.55 },
    look: {
      fogColor: 0xe0b98a, fogColorMix: 0.35, fogDensity: 0.0009,
      sunTint: 0xffb05a, sunTintMix: 0.55, sunMul: 1.05, hemiMul: 0.95, exposureMul: 1.0,
      bloom: 0.15, lantern: 0, skyToFog: 0.1,
    },
  },
  taiga: {
    name: 'Tempestade de neve',
    particles: [
      { shape: 'flake', count: 6000, box: [44, 26, 44], size: 0.14, color: 0xffffff, opacity: 0.9, fall: 2.2, jitter: 0.8, flutter: 0.9, additive: false },
    ],
    wind: { x: -6, z: 3.5, gust: 0.8, gustPeriod: 5 },
    cycle: { period: 90, min: 0.45 },
    look: {
      fogColor: 0xe8eef3, fogColorMix: 0.85, fogDensity: 0.011,
      sunTint: 0xdfe8f5, sunTintMix: 0.5, sunMul: 0.45, hemiMul: 1.1, exposureMul: 1.05,
      bloom: 0, lantern: 0, skyToFog: 0.8,
    },
  },
  deserto: {
    name: 'Tempestade de areia',
    particles: [
      { shape: 'streakH', count: 5000, box: [40, 14, 40], size: 0.7, color: 0x9a6a32, opacity: 0.85, fall: 0.3, jitter: 3, flutter: 0.8, additive: false },
      { shape: 'dot', count: 2200, box: [30, 12, 30], size: 0.08, color: 0xb98642, opacity: 0.8, fall: 0.2, jitter: 1.5, flutter: 0.6, additive: false },
    ],
    wind: { x: 22, z: -4, gust: 0.5, gustPeriod: 4 },
    cycle: { period: 80, min: 0.3 },
    look: {
      fogColor: 0xc4935a, fogColorMix: 0.9, fogDensity: 0.016,
      sunTint: 0xe0a060, sunTintMix: 0.6, sunMul: 0.4, hemiMul: 0.75, exposureMul: 0.95,
      bloom: 0, lantern: 0, skyToFog: 0.9,
    },
  },
  tropical: {
    name: 'Chuva torrencial',
    particles: [
      { shape: 'streakV', count: 8000, box: [36, 24, 36], size: 0.9, color: 0xc8d8e6, opacity: 0.6, fall: 19, jitter: 3, flutter: 0, additive: false },
    ],
    wind: { x: 1.5, z: 1, gust: 0.3, gustPeriod: 6 },
    cycle: { period: 100, min: 0.4 },
    look: {
      fogColor: 0x7d8c8a, fogColorMix: 0.7, fogDensity: 0.0065,
      sunTint: 0xc8d4dc, sunTintMix: 0.6, sunMul: 0.35, hemiMul: 0.7, exposureMul: 0.9,
      bloom: 0, lantern: 0.25, skyToFog: 0.85,
    },
    lightning: { every: [6, 16], flash: 3.2, thunderDelay: [0.4, 2.6] },
  },
  kalahari: {
    name: 'Ondas de calor (miragem)',
    particles: [
      { shape: 'dot', count: 500, box: [50, 14, 50], size: 0.05, color: 0xffe2b0, opacity: 0.45, fall: -0.05, jitter: 0.08, flutter: 0.12, additive: true },
    ],
    wind: { x: 0.2, z: 0, gust: 0, gustPeriod: 10 },
    cycle: { period: 60, min: 0.7 },
    look: {
      fogColor: 0xf3d7a8, fogColorMix: 0.4, fogDensity: 0.0006,
      sunTint: 0xfff3dc, sunTintMix: 0.3, sunMul: 1.3, hemiMul: 1.1, exposureMul: 1.18,
      bloom: 0.75, lantern: 0, skyToFog: 0,
    },
  },
  equatorial: {
    name: 'Névoa úmida',
    particles: [
      { shape: 'streakV', count: 3200, box: [32, 20, 32], size: 0.5, color: 0xd2e0d0, opacity: 0.4, fall: 9, jitter: 1.5, flutter: 0, additive: false },
      { shape: 'dot', count: 700, box: [36, 10, 36], size: 0.05, color: 0xdfe8d8, opacity: 0.3, fall: 0.05, jitter: 0.1, flutter: 0.15, additive: true },
    ],
    wind: { x: 0.5, z: 0.3, gust: 0.2, gustPeriod: 8 },
    cycle: { period: 120, min: 0.75 },
    look: {
      fogColor: 0x9aab88, fogColorMix: 0.8, fogDensity: 0.0075,
      sunTint: 0xdfe8c8, sunTintMix: 0.4, sunMul: 0.55, hemiMul: 0.75, exposureMul: 0.92,
      bloom: 0, lantern: 0.2, skyToFog: 0.7,
    },
  },
  preta: {
    name: 'Chuva de cinzas',
    particles: [
      { shape: 'flake', count: 3200, box: [38, 22, 38], size: 0.12, color: 0x2a2626, opacity: 0.85, fall: 0.7, jitter: 0.3, flutter: 0.5, additive: false },
      { shape: 'dot', count: 260, box: [40, 18, 40], size: 0.06, color: 0xff6a2a, opacity: 0.9, fall: -0.25, jitter: 0.25, flutter: 0.4, additive: true },
    ],
    wind: { x: 0.8, z: -0.6, gust: 0.4, gustPeriod: 9 },
    cycle: { period: 110, min: 0.7 },
    look: {
      fogColor: 0x3a2433, fogColorMix: 0.75, fogDensity: 0.0075,
      sunTint: 0x8a6070, sunTintMix: 0.6, sunMul: 0.08, hemiMul: 0.55, exposureMul: 0.95,
      bloom: 0.25, lantern: 1, skyToFog: 0.75,
    },
  },
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
