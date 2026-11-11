/**
 * Espectro de ondas (Etapa A1) — regras puras, sem Three.js.
 *
 * Porte linha a linha das funções WGSL de `src/ocean/OceanFFT.js` do Tidewater
 * (dgreenheck/tidewater, licença MIT):
 *  - dispersão em profundidade finita ω(k) = √(g k tanh(k d)) e sua derivada;
 *  - JONSWAP com correção TMA (águas rasas);
 *  - espalhamento direcional Horvath (cos-2s), misturado com cos² por `spreadBlend`;
 *  - atenuação das ondas curtas;
 *  - h0(k) gaussiano com amplitude √(S |dω/dk| / k · dk²) / 2 (Box-Muller sobre hash PCG).
 * As constantes α e ω_p seguem o original: α = 0,076 (g F / U²)^-0,22, ω_p = 22 (U F / g²)^-0,33.
 *
 * @example
 *   const sys = systemParams(OCEAN.local);
 *   const { h0, wave } = buildCascade({ size: 733, cut: [1e-4, 0.24], sys: [sys, systemParams(OCEAN.swell)], depth: 500, seed: 1337, cascade: 0 });
 */

export const GRAVITY = 9.81;
const TWO_PI = Math.PI * 2;

/** ω(k) em profundidade d. */
export function dispersion(k, depth) {
  return Math.sqrt(k * GRAVITY * Math.tanh(Math.min(k * depth, 20)));
}

/** dω/dk (velocidade de grupo). */
export function dispersionDerivative(k, depth) {
  const kd = Math.min(k * depth, 20), th = Math.tanh(kd), ch = Math.cosh(kd);
  return (GRAVITY * ((depth * k) / (ch * ch) + th)) / dispersion(k, depth) * 0.5;
}

/** Correção TMA: o fundo raso corta as ondas longas. */
export function tmaCorrection(omega, depth) {
  const omegaH = omega * Math.sqrt(depth / GRAVITY);
  if (omegaH <= 1) return omegaH * omegaH * 0.5;
  if (omegaH < 2) return 1 - Math.pow(2 - omegaH, 2) * 0.5;
  return 1;
}

/**
 * Parâmetros derivados de um sistema de ondas (vento local ou swell).
 * @param {{ scale: number, windSpeed: number, windDirection: number, fetch: number, spreadBlend: number, swell: number, peakEnhancement: number, shortWavesFade: number }} s
 */
export function systemParams(s) {
  const fetchM = Math.max(1, s.fetch) * 1000;
  const U = Math.max(0.1, s.windSpeed);
  return {
    scale: s.scale,
    angle: (s.windDirection * Math.PI) / 180,
    spreadBlend: s.spreadBlend,
    swell: s.swell,
    alpha: 0.076 * Math.pow((GRAVITY * fetchM) / (U * U), -0.22),
    peakOmega: 22 * Math.pow((U * fetchM) / (GRAVITY * GRAVITY), -0.33),
    gamma: s.peakEnhancement,
    shortWavesFade: s.shortWavesFade,
  };
}

/** JONSWAP S(ω) × TMA × escala do sistema. */
export function jonswap(omega, p, depth) {
  const sigma = omega <= p.peakOmega ? 0.07 : 0.09;
  const d = omega - p.peakOmega;
  const r = Math.exp((-d * d) / (sigma * sigma * p.peakOmega * p.peakOmega * 2));
  const inv = 1 / omega, po = p.peakOmega * inv;
  return p.scale * tmaCorrection(omega, depth) * p.alpha * GRAVITY * GRAVITY
    * Math.pow(inv, 5) * Math.exp(Math.pow(po, 4) * -1.25) * Math.pow(Math.abs(p.gamma), r);
}

/** Normalização do cos-2s (ajuste polinomial do original). */
export function normalisationFactor(s) {
  const s2 = s * s, s3 = s2 * s, s4 = s3 * s;
  if (s < 5) return s4 * -0.000564 + s3 * 0.00776 - s2 * 0.044 + s * 0.192 + 0.163;
  return s4 * -4.8e-8 + s3 * 1.07e-5 - s2 * 9.53e-4 + s * 5.9e-2 + 3.93e-1;
}

/** D(θ, ω): quanto da energia vai na direção θ. */
export function directionSpectrum(theta, omega, p) {
  const ratio = omega / p.peakOmega;
  const spreadPower = omega > p.peakOmega ? Math.pow(Math.abs(ratio), -2.5) * 9.77 : Math.pow(Math.abs(ratio), 5) * 6.97;
  const s = spreadPower + Math.tanh(Math.min(ratio, 20)) * 16 * p.swell * p.swell;
  const dTheta = theta - p.angle;
  const cos2s = normalisationFactor(s) * Math.pow(Math.abs(Math.cos(dTheta * 0.5)), s * 2);
  const cosT = Math.cos(dTheta);
  const base = cosT > 0 ? cosT * cosT * (2 / Math.PI) : 0;
  return base + (cos2s - base) * p.spreadBlend;
}

export function shortWavesFade(k, p) {
  return Math.exp(-p.shortWavesFade * p.shortWavesFade * k * k);
}

/** Hash PCG de 32 bits (igual ao WGSL `fftPcg`). */
export function pcg(v) {
  const state = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}
const toUnit = (h) => (h >>> 8) * (1 / 16777216) + 0.5 / 16777216;

/**
 * Faixa de números de onda de cada cascata: cada uma cobre de 6·2π/L_i até 6·2π/L_{i+1}
 * (sem sobreposição; a primeira começa em ~0 e a última vai até o fim) [Tidewater].
 * @returns {[number, number][]}
 */
export function cascadeCuts(sizes) {
  return sizes.map((L, i) => [i === 0 ? 0.0001 : (TWO_PI / L) * 6, i === sizes.length - 1 ? 9999 : (TWO_PI / sizes[i + 1]) * 6]);
}

/**
 * Espectro inicial de uma cascata N×N.
 *
 * Saída (N² × 4 floats cada, índice y·N + x):
 *  - `h0`:   (Re h0(k), Im h0(k), Re conj h0(-k), Im conj h0(-k))   — já com o par conjugado
 *  - `wave`: (kx, kz, 1/|k|, ω)
 *
 * @param {{ N?: number, size: number, cut: [number, number], sys: object[], depth: number, seed: number, cascade: number }} o
 */
export function buildCascade({ N = 256, size, cut, sys, depth, seed, cascade }) {
  const HALF = N / 2, dk = TWO_PI / size;
  const raw = new Float32Array(N * N * 2);
  const wave = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      const kx = (x - HALF) * dk, kz = (y - HALF) * dk, kLen = Math.hypot(kx, kz);
      wave[i * 4] = kx; wave[i * 4 + 1] = kz;
      if (kLen < cut[0] || kLen > cut[1]) continue;
      const omega = dispersion(kLen, depth), dOmega = dispersionDerivative(kLen, depth);
      const theta = Math.atan2(kz, kx);
      let S = 0;
      for (const p of sys) S += jonswap(omega, p, depth) * directionSpectrum(theta, omega, p) * shortWavesFade(kLen, p);
      S = Math.max(S, 0);
      const amp = Math.sqrt(((S * Math.abs(dOmega)) / kLen) * dk * dk) * 0.5;
      // mesmo índice global que o original (cascata · N² + y · N + x)
      const s = ((cascade * N * N + i) * 4 + seed * 7919) >>> 0;
      const u1 = toUnit(pcg(s)), u2 = toUnit(pcg(s + 1));
      const r = Math.sqrt(Math.log(u1) * -2);
      raw[i * 2] = r * Math.cos(u2 * TWO_PI) * amp;
      raw[i * 2 + 1] = r * Math.sin(u2 * TWO_PI) * amp;
      wave[i * 4 + 2] = 1 / kLen;
      wave[i * 4 + 3] = omega;
    }
  }
  const h0 = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, m = ((N - y) % N) * N + ((N - x) % N);
      h0[i * 4] = raw[i * 2]; h0[i * 4 + 1] = raw[i * 2 + 1];
      h0[i * 4 + 2] = raw[m * 2]; h0[i * 4 + 3] = -raw[m * 2 + 1];
    }
  }
  return { h0, wave };
}

/**
 * Altura significativa aproximada (Hs ≈ 4 σ) a partir de h0 — sanidade do espectro.
 * σ² = Σ |h(k)|² (cada termo aparece em +k e −k).
 */
export function significantHeight(h0) {
  let v = 0;
  for (let i = 0; i < h0.length; i += 4) v += h0[i] * h0[i] + h0[i + 1] * h0[i + 1];
  return 4 * Math.sqrt(2 * v);
}
