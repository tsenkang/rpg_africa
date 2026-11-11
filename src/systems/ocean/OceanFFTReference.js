/**
 * FFT do oceano na CPU (Etapa A1) — referência exata do que a GPU calcula.
 *
 * Mesma conta do Tidewater (`OceanFFT.js`, passes de linha e coluna):
 *  1. evolui o espectro: h(k,t) = h0(k) e^{iωt} + conj(h0(−k)) e^{−iωt};
 *  2. monta 4 campos complexos empacotados (dois reais por IFFT complexa):
 *       c0 = Dx + i·Dz        c1 = Dy + i·∂Dx/∂z
 *       c2 = ∂Dy/∂x + i·∂Dy/∂z   c3 = ∂Dx/∂x + i·∂Dz/∂z
 *  3. IFFT radix-2 nas linhas e depois nas colunas (entrada em bit-reverso, w = e^{+iπ·pos/half});
 *  4. corrige o sinal (−1)^{x+y} (espectro centrado em N/2).
 * Serve para os testes (contra uma DFT ingênua) e para conferir a GPU no navegador.
 *
 * @example
 *   const out = oceanFieldsCPU(h0, wave, 256, t);
 *   out.disp[(y * 256 + x) * 4 + 1]; // altura Dy no texel (x, y)
 */

/** Inverte os `bits` bits menos significativos. */
export function bitReverse(v, bits) {
  let r = 0;
  for (let i = 0; i < bits; i++) { r = (r << 1) | (v & 1); v >>= 1; }
  return r;
}

/**
 * IFFT 1D in-place (sem 1/N, como o original) de `count` sinais complexos intercalados.
 * @param {Float64Array} re
 * @param {Float64Array} im
 */
export function ifft1D(re, im) {
  const N = re.length, bits = Math.log2(N);
  const ar = new Float64Array(N), ai = new Float64Array(N);
  for (let i = 0; i < N; i++) { const j = bitReverse(i, bits); ar[j] = re[i]; ai[j] = im[i]; }
  for (let s = 0; s < bits; s++) {
    const half = 1 << s;
    for (let t = 0; t < N / 2; t++) {
      const pos = t & (half - 1);
      const i = ((t >> s) << (s + 1)) | pos, j = i + half;
      const ang = (pos * Math.PI) / half, wr = Math.cos(ang), wi = Math.sin(ang);
      const br = ar[j] * wr - ai[j] * wi, bi = ar[j] * wi + ai[j] * wr;
      const xr = ar[i], xi = ai[i];
      ar[i] = xr + br; ai[i] = xi + bi;
      ar[j] = xr - br; ai[j] = xi - bi;
    }
  }
  re.set(ar); im.set(ai);
}

/**
 * Os 8 campos reais de uma cascata no tempo t.
 * @param {Float32Array} h0   saída de `buildCascade`
 * @param {Float32Array} wave saída de `buildCascade`
 * @param {number} N
 * @param {number} t s
 * @param {number} [lambda] choppiness
 * @returns {{ disp: Float32Array, deriv: Float32Array }}
 *   disp: (λDx, Dy, λDz, J) · deriv: (∂Dy/∂x, ∂Dy/∂z, λ∂Dx/∂x, λ∂Dz/∂z)
 */
export function oceanFieldsCPU(h0, wave, N, t, lambda = 0.9) {
  const F = 4, re = Array.from({ length: F }, () => new Float64Array(N * N)), im = Array.from({ length: F }, () => new Float64Array(N * N));
  for (let i = 0; i < N * N; i++) {
    const kx = wave[i * 4], kz = wave[i * 4 + 1], ik = wave[i * 4 + 2], w = wave[i * 4 + 3];
    const ph = w * t, cs = Math.cos(ph), sn = Math.sin(ph);
    const a = h0[i * 4], b = h0[i * 4 + 1], c = h0[i * 4 + 2], d = h0[i * 4 + 3];
    const hr = a * cs - b * sn + c * cs + d * sn;
    const hi = a * sn + b * cs - c * sn + d * cs;
    const fx = kx * ik, fz = kz * ik;
    re[0][i] = -(fx * hi + fz * hr); im[0][i] = fx * hr - fz * hi;
    const q = -(kx * kz * ik);
    re[1][i] = hr - q * hi; im[1][i] = hi + q * hr;
    re[2][i] = -(kx * hi + kz * hr); im[2][i] = kx * hr - kz * hi;
    const A = -(kx * kx * ik), B = -(kz * kz * ik);
    re[3][i] = A * hr - B * hi; im[3][i] = A * hi + B * hr;
  }
  const rr = new Float64Array(N), ri = new Float64Array(N);
  for (let f = 0; f < F; f++) {
    for (let y = 0; y < N; y++) { // linhas
      for (let x = 0; x < N; x++) { rr[x] = re[f][y * N + x]; ri[x] = im[f][y * N + x]; }
      ifft1D(rr, ri);
      for (let x = 0; x < N; x++) { re[f][y * N + x] = rr[x]; im[f][y * N + x] = ri[x]; }
    }
    for (let x = 0; x < N; x++) { // colunas
      for (let y = 0; y < N; y++) { rr[y] = re[f][y * N + x]; ri[y] = im[f][y * N + x]; }
      ifft1D(rr, ri);
      for (let y = 0; y < N; y++) { re[f][y * N + x] = rr[y]; im[f][y * N + x] = ri[y]; }
    }
  }
  const disp = new Float32Array(N * N * 4), deriv = new Float32Array(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, sg = (x + y) & 1 ? -1 : 1;
      const Dx = re[0][i] * sg, Dz = im[0][i] * sg, Dy = re[1][i] * sg, Dxz = im[1][i] * sg;
      const Dyx = re[2][i] * sg, Dyz = im[2][i] * sg, Dxx = re[3][i] * sg, Dzz = im[3][i] * sg;
      const jxx = lambda * Dxx + 1, jzz = lambda * Dzz + 1, jxz = lambda * Dxz;
      disp.set([lambda * Dx, Dy, lambda * Dz, jxx * jzz - jxz * jxz], i * 4);
      deriv.set([Dyx, Dyz, lambda * Dxx, lambda * Dzz], i * 4);
    }
  }
  return { disp, deriv };
}
