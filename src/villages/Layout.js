/**
 * Matemática de disposição orgânica das vilas (pura, testável em Node).
 *
 * 1. `poissonAnnulus` — Poisson Disk Sampling (algoritmo de Bridson) num
 *    anel em volta da praça: os pontos ficam espalhados sem grade e nunca
 *    mais perto que `spacing` uns dos outros. Resultado: casas com quintais
 *    de tamanhos variados, como uma vila que cresceu sozinha.
 * 2. `faceStreet` — cada casa vira a frente (+Z local) para o ponto mais
 *    próximo da rua mais próxima, com um desvio aleatório. Longe de ruas,
 *    vira para o centro da vila.
 * 3. `nearestOnSegments` — ponto mais próximo numa lista de segmentos
 *    (usado para virar as casas e para traçar a trilha porta → rua).
 */

/**
 * Pontos de Poisson Disk dentro de um anel.
 * @param {object} o
 * @param {number} o.cx centro x
 * @param {number} o.cz centro z
 * @param {number} o.inner raio interno (m)
 * @param {number} o.outer raio externo (m)
 * @param {number} o.spacing distância mínima entre pontos (m)
 * @param {() => number} o.rng sorteio 0..1 (determinístico por vila)
 * @param {number} [o.tries] tentativas por ponto ativo (Bridson usa 30)
 * @param {(x:number, z:number) => boolean} [o.accept] filtro extra (ruas, praças…)
 * @returns {{x:number, z:number}[]}
 * @example poissonAnnulus({ cx: 0, cz: 0, inner: 50, outer: 200, spacing: 13, rng })
 */
export function poissonAnnulus({ cx, cz, inner, outer, spacing, rng, tries = 30, accept = () => true }) {
  const cell = spacing / Math.SQRT2;
  const size = Math.ceil((outer * 2) / cell) + 1;
  const grid = new Int32Array(size * size).fill(-1);
  const pts = [];
  const active = [];
  const gi = (x, z) => [Math.floor((x - cx + outer) / cell), Math.floor((z - cz + outer) / cell)];
  const inside = (x, z) => {
    const r = Math.hypot(x - cx, z - cz);
    return r >= inner && r <= outer;
  };
  const farEnough = (x, z) => {
    const [i, j] = gi(x, z);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= size || jj >= size) continue;
        const k = grid[jj * size + ii];
        if (k >= 0 && Math.hypot(pts[k].x - x, pts[k].z - z) < spacing) return false;
      }
    }
    return true;
  };
  const add = (x, z) => {
    const [i, j] = gi(x, z);
    grid[j * size + i] = pts.length;
    active.push(pts.length);
    pts.push({ x, z });
  };

  // Sementes espalhadas pelo anel (um anel grande não fica só num lado).
  const seeds = Math.max(1, Math.round((Math.PI * 2 * (inner + outer) / 2) / (spacing * 6)));
  for (let s = 0; s < seeds * 4 && active.length < seeds; s++) {
    const a = rng() * Math.PI * 2, r = inner + rng() * (outer - inner);
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (farEnough(x, z) && accept(x, z)) add(x, z);
  }

  while (active.length) {
    const ai = Math.floor(rng() * active.length);
    const p = pts[active[ai]];
    let found = false;
    for (let t = 0; t < tries; t++) {
      const a = rng() * Math.PI * 2;
      const r = spacing * (1 + rng());
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!inside(x, z) || !farEnough(x, z)) continue;
      if (!accept(x, z)) continue; // rua, praça, prédio especial…
      add(x, z);
      found = true;
      break;
    }
    if (!found) active.splice(ai, 1);
  }
  return pts;
}

/**
 * Ponto mais próximo de (x, z) numa lista de segmentos.
 * @param {number} x
 * @param {number} z
 * @param {{ax:number, az:number, bx:number, bz:number}[]} segs
 * @returns {{x:number, z:number, dist:number} | null}
 */
export function nearestOnSegments(x, z, segs) {
  let best = null;
  for (const s of segs) {
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const len2 = abx * abx + abz * abz || 1;
    const t = Math.min(1, Math.max(0, ((x - s.ax) * abx + (z - s.az) * abz) / len2));
    const px = s.ax + abx * t, pz = s.az + abz * t;
    const d = Math.hypot(px - x, pz - z);
    if (!best || d < best.dist) best = { x: px, z: pz, dist: d };
  }
  return best;
}

/**
 * Rotação Y para a casa olhar para a rua mais próxima (frente = +Z local:
 * rot = atan2(dx, dz)), com desvio aleatório. Sem rua ao alcance, olha
 * para o centro da vila.
 * @param {number} x
 * @param {number} z
 * @param {object} o
 * @param {{ax,az,bx,bz}[]} o.streets
 * @param {number} o.cx centro da vila
 * @param {number} o.cz
 * @param {number} o.reach alcance (m) para procurar rua
 * @param {number} o.jitter desvio máximo (rad), ±
 * @param {() => number} o.rng
 * @returns {{ rot: number, street: {x:number, z:number, dist:number} | null }}
 */
export function faceStreet(x, z, { streets, cx, cz, reach, jitter, rng }) {
  const near = nearestOnSegments(x, z, streets);
  const street = near && near.dist <= reach ? near : null;
  const tx = street ? street.x : cx, tz = street ? street.z : cz;
  const rot = Math.atan2(tx - x, tz - z) + (rng() * 2 - 1) * jitter;
  return { rot, street };
}

/**
 * Inteiro em [min, max] (inclusive).
 * @param {[number, number]} range
 * @param {() => number} rng
 */
export function randInt([min, max], rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Degraus de uma escada em caracol em volta de um tronco.
 * @param {object} o
 * @param {number} o.x centro do tronco
 * @param {number} o.z
 * @param {number} o.y0 altura do primeiro degrau (m)
 * @param {number} o.y1 altura do último (plataforma)
 * @param {number} o.radius distância do centro do tronco ao meio do degrau (m)
 * @param {number} [o.rise] subida por degrau (m) — escada confortável ≈ 0,2
 * @param {number} [o.turn] ângulo entre degraus (rad)
 * @param {number} [o.start] ângulo do primeiro degrau
 * @returns {{x:number, y:number, z:number, angle:number}[]} angle = direção radial do degrau
 * @example helixSteps({ x: 0, z: 0, y0: 0.2, y1: 12, radius: 2.4 })
 */
export function helixSteps({ x, z, y0, y1, radius, rise = 0.21, turn = 0.3, start = 0 }) {
  const n = Math.max(1, Math.ceil((y1 - y0) / rise));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = start + i * turn;
    out.push({ x: x + Math.cos(a) * radius, y: y0 + ((y1 - y0) * i) / n, z: z + Math.sin(a) * radius, angle: a });
  }
  return out;
}

/**
 * Pontos de uma ponte de corda entre dois apoios: reta em x/z e parábola
 * para baixo em y (afunda `sag` metros no meio, como corda de verdade).
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {number} sag quanto afunda no meio (m)
 * @param {number} n segmentos
 * @returns {{x:number,y:number,z:number}[]} n + 1 pontos de a até b
 */
export function bridgeCurve(a, b, sag, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - sag * 4 * t * (1 - t),
      z: a.z + (b.z - a.z) * t,
    });
  }
  return out;
}

/**
 * Escolhe as `k` fontes mais próximas de `pos` dentro de `maxDist` (para
 * dar as poucas luzes reais às fogueiras perto do jogador). Sem alocação:
 * escreve os índices em `out` e devolve quantas achou.
 * @param {{x:number,z:number}[]} sources
 * @param {{x:number,z:number}} pos
 * @param {number} k
 * @param {number} maxDist
 * @param {Int32Array} out tamanho ≥ k
 * @returns {number}
 */
export function pickNearest(sources, pos, k, maxDist, out) {
  let n = 0;
  const d2 = (i) => (sources[i].x - pos.x) ** 2 + (sources[i].z - pos.z) ** 2;
  const max2 = maxDist * maxDist;
  for (let i = 0; i < sources.length; i++) {
    const di = d2(i);
    if (di > max2) continue;
    if (n < k) { out[n++] = i; } else if (di < d2(out[n - 1])) { out[n - 1] = i; } else continue;
    // mantém `out` ordenado do mais perto ao mais longe (k é pequeno)
    for (let j = n - 1; j > 0 && d2(out[j]) < d2(out[j - 1]); j--) { const t = out[j]; out[j] = out[j - 1]; out[j - 1] = t; }
  }
  return n;
}
