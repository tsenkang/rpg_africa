/**
 * Temperatura de cor (Etapa L1) — regras puras.
 *
 * `kelvinToRGB`: aproximação de Tanner Helland do corpo negro (1000–40000 K), em sRGB 0..1,
 * normalizada para o maior canal = 1 (a intensidade fica com a luz). 6500 K ≈ branco.
 * `sunKelvin`: temperatura do sol pela elevação (seno da altura), interpolada entre os
 * pontos de `LIGHTING.kelvin`; à noite, a da lua.
 *
 * @example
 *   const c = kelvinToRGB(3300);         // { r: 1, g: 0.77, b: 0.55 } dourado
 *   const k = sunKelvin(0.05, false);    // ~2600 K perto do horizonte
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/**
 * @param {number} K kelvin
 * @returns {{ r: number, g: number, b: number }} sRGB 0..1 (maior canal = 1)
 */
export function kelvinToRGB(K) {
  const t = Math.min(40000, Math.max(1000, K)) / 100;
  let r, g, b;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  r = clamp01(r / 255); g = clamp01(g / 255); b = clamp01(b / 255);
  const m = Math.max(r, g, b) || 1;
  return { r: r / m, g: g / m, b: b / m };
}

/**
 * Temperatura do sol (ou da lua) pela elevação.
 * @param {number} elevation seno da altura do sol (−1..1)
 * @param {boolean} isMoon é a lua quem ilumina
 * @param {{ horizon: number, golden: number, morning: number, noon: number, moon: number }} k
 */
export function sunKelvin(elevation, isMoon, k) {
  if (isMoon) return k.moon;
  const e = Math.max(0, elevation);
  // pontos (elevação → K): horizonte 0, dourada ~10° (0,17), manhã ~25° (0,42), alto (0,8)
  const pts = [[0, k.horizon], [0.17, k.golden], [0.42, k.morning], [0.8, k.noon]];
  if (e >= pts[pts.length - 1][0]) return k.noon;
  for (let i = 1; i < pts.length; i++) {
    if (e <= pts[i][0]) {
      const [e0, k0] = pts[i - 1], [e1, k1] = pts[i];
      const u = (e - e0) / (e1 - e0);
      const s = u * u * (3 - 2 * u); // suave, sem quinas na transição
      return k0 + (k1 - k0) * s;
    }
  }
  return k.noon;
}
