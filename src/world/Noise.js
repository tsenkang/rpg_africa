import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

/** Gerador pseudoaleatório determinístico (mesma seed = mesmo mundo). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash inteiro → [0,1). Usado para posições estáveis (grama, jitter). */
export function hash2(x, z, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Ruído simplex com fBm e ruído "ridged" (cristas de montanha). */
export class Noise {
  constructor(seed) {
    this.simplex = new SimplexNoise({ random: mulberry32(seed) });
  }

  n2(x, y) {
    return this.simplex.noise(x, y);
  }

  /** fBm em [-1, 1]. */
  fbm(x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.simplex.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ruído de cristas em ~[0, 1]. */
  ridged(x, y, octaves = 5) {
    let amp = 0.5, freq = 1, sum = 0, weight = 1;
    for (let i = 0; i < octaves; i++) {
      let v = 1 - Math.abs(this.simplex.noise(x * freq, y * freq));
      v *= v;
      v *= weight;
      weight = clamp(v * 2, 0, 1);
      sum += v * amp;
      freq *= 2.1;
      amp *= 0.5;
    }
    return sum;
  }
}
