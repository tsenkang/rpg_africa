import * as THREE from 'three';
import { WORLD } from '../../config/worldConfig.js';
import { travelTimeField } from '../../systems/ocean/ShoreField.js';

/**
 * Ondas de costa (Etapa A5) — adaptação para WebGL2 do `ShoreWaves.js` do Tidewater.
 *
 * - **Fase** pelo campo de tempo de percurso T (eikonal, `ShoreField`): frentes que giram e se
 *   alinham com as curvas de nível, contornam pontas e entram em baías [Tidewater].
 * - **Altura** cresce no raso pela lei de Green (H ∝ d^−1/4) até H > γ·d; aí a onda **quebra**:
 *   a frente fica íngreme e a crista avança, depois vira **corredeira** (bore) espumante [Tidewater].
 * - **Séries** de ondas (sets) e variação ao longo da praia [Tidewater].
 * - **Espraiado**: o run-up R(t) sobe ~40% do período e desce ~55%; onde a areia está abaixo de
 *   R(t) a água vira uma lâmina fina com espuma na borda que avança e recua [Tidewater].
 * Simplificações [jogo]: sem a lâmina do lábio lançado (Breakers) e sem o estado euleriano da
 * espuma na areia (ShoreSim): areia molhada pela faixa máxima do espraiado.
 *
 * @example
 *   const shore = new ShoreWaves(terrain, OCEAN.shore);
 *   Object.assign(material.uniforms, shore.uniforms);  // e inclua SHORE_GLSL no shader
 */
export class ShoreWaves {
  /**
   * @param {{ heightAt: (x:number, z:number) => number }} terrain
   * @param {object} cfg `OCEAN.shore`
   */
  constructor(terrain, cfg) {
    this.cfg = cfg;
    const cell = cfg.cell, w = Math.ceil(WORLD.width / cell), h = Math.ceil(WORLD.depth / cell);
    const depth = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      depth[j * w + i] = WORLD.waterLevel - terrain.heightAt(-WORLD.width / 2 + (i + 0.5) * cell, -WORLD.depth / 2 + (j + 0.5) * cell);
    }
    const T = travelTimeField(depth, w, h, cell, { dMin: 0.3, dMax: 25, sourceDepth: cfg.sourceDepth });
    // estende a fase para a areia logo acima da água (o espraiado precisa dela)
    for (let pass = 0; pass < cfg.landReach; pass++) {
      const src = T.slice();
      for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        if (src[k] >= 0) continue;
        let best = -1;
        for (const o of [1, -1, w, -w]) if (src[k + o] >= 0 && src[k + o] > best) best = src[k + o];
        if (best >= 0) T[k] = best + cell / Math.sqrt(9.81 * 0.3);
      }
    }
    this.reachable = T.reduce((a, t) => a + (t >= 0 ? 1 : 0), 0) / T.length;
    const data = new Float32Array(T);
    const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; // T tem saltos (−1): interpolado no shader
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.field = T;
    this.size = [w, h];
    this.uniforms = {
      uShoreT: { value: tex },
      uShoreGrid: { value: new THREE.Vector4(-WORLD.width / 2, -WORLD.depth / 2, cell, 0) },
      uShoreSize: { value: new THREE.Vector2(w, h) },
      uShoreP: { value: new THREE.Vector4(cfg.height, cfg.period, cfg.gamma, cfg.runup) },
      uShoreOn: { value: 1 },
      uShoreTime: { value: 0 },
    };
  }

  /** Avança o relógio das ondas e aplica a configuração atual. */
  update(time) {
    const c = this.cfg, u = this.uniforms;
    u.uShoreTime.value = time;
    u.uShoreP.value.set(c.height, c.period, c.gamma, c.runup);
  }
}

/** GLSL compartilhado (água, consultas, areia molhada). Precisa de `seaDepth(xz)`. */
export const SHORE_GLSL = /* glsl */ `
uniform sampler2D uShoreT;
uniform vec4 uShoreGrid;   // canto (x, z), célula (m)
uniform vec2 uShoreSize;
uniform vec4 uShoreP;      // H0, período, γ, run-up
uniform float uShoreOn, uShoreTime;
const float SHORE_G = 9.81;

// tempo de percurso bilinear só entre células válidas (T ≥ 0); −1 se nenhuma
float shoreT(vec2 xz) {
  vec2 g = (xz - uShoreGrid.xy) / uShoreGrid.z - 0.5;
  vec2 f = fract(g);
  ivec2 i0 = ivec2(floor(g));
  float s = 0.0, wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    ivec2 c = clamp(i0 + o, ivec2(0), ivec2(uShoreSize) - 1);
    float t = texelFetch(uShoreT, c, 0).r;
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    if (t >= 0.0) { s += t * w; wsum += w; }
  }
  return wsum > 0.05 ? s / wsum : -1.0;
}

struct ShoreS { vec3 disp; vec2 slope; float foam; float swashY; float breaking; float k; };

float shoreHash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }

// Onda de costa no ponto (profundidade d; d < 0 = areia acima da água)
ShoreS shoreEval(vec2 xz, float d) {
  ShoreS r; r.disp = vec3(0.0); r.slope = vec2(0.0); r.foam = 0.0; r.swashY = -1e3; r.breaking = 0.0; r.k = 0.0;
  if (uShoreOn < 0.5 || d > 25.0) return r;
  float T = shoreT(xz);
  if (T < 0.0) return r;
  float e = uShoreGrid.z;
  vec2 grad = vec2(shoreT(xz + vec2(e, 0.0)) - shoreT(xz - vec2(e, 0.0)), shoreT(xz + vec2(0.0, e)) - shoreT(xz - vec2(0.0, e)));
  vec2 dir = length(grad) > 1e-4 ? normalize(grad) : vec2(0.0, 1.0); // sentido da propagação (para a praia)
  float Tp = uShoreP.y;
  float s = (uShoreTime - T) / Tp;
  float m = floor(s + 0.5), u = s - m;
  // séries de ondas e variação ao longo da praia [Tidewater shoreWaveAmp]
  float along = dot(xz, vec2(-dir.y, dir.x));
  float A = uShoreP.x * (0.72 + 0.28 * sin(m * 0.9 + 1.7)) * (0.85 + 0.15 * sin(along / 37.0 + shoreHash(m) * 6.28));
  float k = 1.0 - smoothstep(10.0, 25.0, d); // só perto da costa (o FFT cuida do mar aberto)
  r.k = k;
  if (d > 0.04) {
    float dd = max(d, 0.05);
    float Hs = A * pow(25.0 / max(dd, 0.3), 0.25);         // lei de Green
    float Hb = uShoreP.z * dd;                              // quebra em H = γ d
    float H = min(Hs, Hb);
    float b = clamp((Hs / Hb - 0.8) / 0.2, 0.0, 1.0);
    float lam = sqrt(SHORE_G * clamp(dd, 0.3, 25.0)) * Tp;
    float xd = -u * lam;                                    // m à frente (rumo à praia) da crista
    float w = lam * 0.16;
    float wf = w * (1.0 - 0.7 * b), wb = w * (1.0 + 0.6 * b);
    float ww = xd > 0.0 ? wf : wb;
    float prof = exp(-(xd * xd) / (ww * ww));
    float dprof = -2.0 * xd / (ww * ww) * prof;
    r.disp = vec3(dir.x, 0.0, dir.y) * H * 0.55 * b * prof;  // a crista avança ao quebrar
    r.disp.y = H * (prof - 0.22);
    r.disp *= k;
    r.slope = dir * H * dprof * k;
    // espuma: crista rebentando + corredeira atrás dela
    r.foam = k * b * (smoothstep(0.25, 0.85, prof) * (xd > -0.4 * w ? 1.0 : 0.35) + 0.7 * step(Hb, Hs) * exp(-pow((xd + 0.7 * w) / (0.9 * w), 2.0)));
    r.breaking = b * k;
  }
  // espraiado: sobe ~40% do período, desce ~55% [Tidewater SWASH_UP / SWASH_DOWN]
  float g = -d; // altura da areia acima da água
  if (g > -0.08) { // só na areia (e na linha d'água): no raso quem cuida é a corredeira
    float p = fract(s + 0.15);
    float Rmax = uShoreP.w * A;
    float R = p < 0.4 ? Rmax * sin(p / 0.4 * 1.5708) : (p < 0.95 ? Rmax * cos((p - 0.4) / 0.55 * 1.5708) : 0.0);
    if (g < R) {
      float th = clamp((R - g) * 0.6, 0.0, 0.14);
      r.swashY = max(g, 0.0) + th + 0.05;
      r.foam = max(r.foam, (1.0 - smoothstep(0.0, 0.1, R - g)) * 0.9 + 0.08); // borda que avança
    }
  }
  return r;
}
`;
