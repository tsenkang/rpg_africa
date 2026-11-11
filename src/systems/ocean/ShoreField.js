/**
 * Campo de tempo de percurso das ondas de costa (Etapa A5) — regras puras.
 *
 * Como no `ShoreWaves.js` do Tidewater, a fase das ondas de arrebentação vem de um campo
 * T(x) = tempo que uma frente leva do mar aberto até x. Ele resolve a equação eikonal
 * |∇T| = 1/c(d), com c = √(g·d) (água rasa, d limitado a [dMin, dMax]), por Dijkstra em
 * 8 vizinhos sobre a grade de profundidade. Consequências (iguais ao original):
 *  - as frentes ficam paralelas às curvas de nível perto da costa (refração);
 *  - contornam pontas e entram em baías;
 *  - só chegam onde há caminho de água desde o mar aberto: lago e rios fechados ficam
 *    sem arrebentação (T = −1).
 * Fontes: células de água na borda do mapa (o oceano continua além dela).
 *
 * @example
 *   const T = travelTimeField(depth, w, h, 8, { dMin: 0.3, dMax: 25, sourceDepth: 2 });
 *   T[j * w + i]; // s (−1 = água sem ligação com o mar / terra)
 */

const G = 9.81;

/**
 * @param {Float32Array|number[]} depth profundidade por célula (m, negativo = terra), linha a linha
 * @param {number} w colunas
 * @param {number} h linhas
 * @param {number} cell tamanho da célula (m)
 * @param {{ dMin?: number, dMax?: number, sourceDepth?: number, maxTime?: number }} [o]
 * @returns {Float32Array} tempo (s) por célula; −1 = inalcançável (terra ou água isolada)
 */
export function travelTimeField(depth, w, h, cell, { dMin = 0.3, dMax = 25, sourceDepth = 2, maxTime = 900 } = {}) {
  const n = w * h;
  const T = new Float32Array(n).fill(Infinity);
  const speed = new Float32Array(n);
  for (let i = 0; i < n; i++) speed[i] = depth[i] > 0.05 ? Math.sqrt(G * Math.min(dMax, Math.max(dMin, depth[i]))) : 0;
  const heap = new MinHeap(n);
  const seed = (i) => { if (speed[i] > 0 && depth[i] >= sourceDepth && T[i] > 0) { T[i] = 0; heap.push(i, 0); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size) {
    const [i, t] = heap.pop();
    if (t > T[i]) continue;
    if (t > maxTime) break;
    const x = i % w, y = (i / w) | 0;
    for (const [dx, dy, len] of D) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (!speed[j]) continue;
      const nt = t + (len * cell * 2) / (speed[i] + speed[j]); // velocidade média no trecho
      if (nt < T[j]) { T[j] = nt; heap.push(j, nt); }
    }
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(T[i])) T[i] = -1;
  return T;
}

/** Heap binária mínima de (índice, prioridade) sem alocar por item. */
class MinHeap {
  constructor(cap) {
    this.idx = new Int32Array(cap * 4);
    this.pri = new Float64Array(cap * 4);
    this.size = 0;
  }
  push(i, p) {
    if (this.size >= this.idx.length) { this.idx = growI(this.idx); this.pri = growF(this.pri); }
    let k = this.size++;
    while (k > 0) {
      const parent = (k - 1) >> 1;
      if (this.pri[parent] <= p) break;
      this.idx[k] = this.idx[parent]; this.pri[k] = this.pri[parent]; k = parent;
    }
    this.idx[k] = i; this.pri[k] = p;
  }
  pop() {
    const i0 = this.idx[0], p0 = this.pri[0];
    const li = this.idx[--this.size], lp = this.pri[this.size];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.pri[c + 1] < this.pri[c]) c++;
      if (this.pri[c] >= lp) break;
      this.idx[k] = this.idx[c]; this.pri[k] = this.pri[c]; k = c;
    }
    this.idx[k] = li; this.pri[k] = lp;
    return [i0, p0];
  }
}
const growI = (a) => { const b = new Int32Array(a.length * 2); b.set(a); return b; };
const growF = (a) => { const b = new Float64Array(a.length * 2); b.set(a); return b; };

/**
 * Altura da onda no raso pela lei de Green (H ∝ d^−1/4) até quebrar em H = γ·d.
 * @returns {{ H: number, breaking: number }} altura (m) e 0..1 (1 = arrebentando/rebentada)
 */
export function shoalHeight(H0, d, { gamma = 0.78, dRef = 25 } = {}) {
  const dd = Math.max(0.05, d);
  const Hs = H0 * Math.pow(dRef / Math.max(dd, 0.3), 0.25);
  const Hb = gamma * dd;
  return { H: Math.min(Hs, Hb), breaking: Math.min(1, Math.max(0, (Hs / Hb - 0.8) / 0.2)) };
}
