import * as THREE from 'three';
import { OCEAN } from '../../config/ocean.js';
import { buildCascade, cascadeCuts, systemParams } from '../../systems/ocean/WaveSpectrum.js';

/**
 * Oceano FFT na GPU (Etapa A1) — WebGL2.
 *
 * Porte do `OceanFFT.js` do Tidewater (WebGPU, 2 dispatches de compute) para passes de
 * fragment shader com MRT, já que WebGL2 não tem compute:
 *
 *   espectro inicial h0 (CPU, `WaveSpectrum.buildCascade`, refeito quando o vento muda)
 *     → [evolve]   h(k,t) e os 4 campos complexos empacotados (c0..c3) em 2 alvos RGBA32F
 *     → [linhas]   8 estágios radix-2 (o 1º lê em bit-reverso)
 *     → [colunas]  8 estágios radix-2
 *     → [final]    sinal (−1)^{x+y}, Jacobiano, espuma com memória → por cascata:
 *                  deslocamento (λDx, Dy, λDz, espuma) e derivadas (∂Dy/∂x, ∂Dy/∂z, λ∂Dx/∂x, λ∂Dz/∂z)
 *
 * As 4 cascatas ficam lado a lado numa textura N·4 × N durante a FFT (1 desenho por estágio
 * para todas). As saídas são 4 alvos separados com RepeatWrapping + mipmaps (ladrilho sem
 * costura e filtragem por distância). Total: 1 + 16 + 4 = 21 desenhos por quadro.
 *
 * @example
 *   const ocean = new OceanSimulation(renderer);
 *   if (ocean.supported) ocean.update(tempo);
 *   material.uniforms.uDisp0.value = ocean.displacement[0];
 */
export class OceanSimulation {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} [cfg] `OCEAN`
   */
  constructor(renderer, cfg = OCEAN) {
    this.renderer = renderer;
    this.cfg = cfg;
    this.N = cfg.fftSize;
    this.C = cfg.cascadeSizes.length;
    const gl = renderer.getContext();
    this.supported = renderer.capabilities.isWebGL2 && !!renderer.extensions.has('EXT_color_buffer_float');
    if (!this.supported) return;
    void gl;
    const N = this.N, W = N * this.C;

    const dataTex = () => {
      const t = new THREE.DataTexture(new Float32Array(W * N * 4), W, N, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = t.magFilter = THREE.NearestFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      return t;
    };
    this.h0Tex = dataTex();
    this.waveTex = dataTex();

    const fftRT = () => new THREE.WebGLRenderTarget(W, N, {
      count: 2, type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false,
    });
    this.ping = fftRT();
    this.pong = fftRT();

    const outRT = () => {
      const rt = new THREE.WebGLRenderTarget(N, N, {
        count: 2, type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
        minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
        depthBuffer: false, generateMipmaps: true,
      });
      for (const t of rt.textures) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; }
      return rt;
    };
    // Dois conjuntos (a espuma lê o quadro anterior).
    this.out = [Array.from({ length: this.C }, outRT), Array.from({ length: this.C }, outRT)];
    this.frame = 0;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.uniforms = {
      uTime: { value: 0 },
      uLambda: { value: cfg.choppiness },
      uFoam: { value: new THREE.Vector4(cfg.foam.bias, cfg.foam.gain, cfg.foam.decay, cfg.foam.add) },
      uDt: { value: 0 },
    };
    this.buildMaterials();
    this.time = 0;
    this.rebuildSpectrum();
  }

  /** Refaz h0 (vento, direção, swell, tamanho das cascatas). ~40 ms na CPU. */
  rebuildSpectrum() {
    if (!this.supported) return;
    const N = this.N, C = this.C, cfg = this.cfg, W = N * C;
    const cuts = cascadeCuts(cfg.cascadeSizes);
    const sys = [systemParams(cfg.local), systemParams(cfg.swell)];
    const H = this.h0Tex.image.data, Wv = this.waveTex.image.data;
    for (let c = 0; c < C; c++) {
      const { h0, wave } = buildCascade({ N, size: cfg.cascadeSizes[c], cut: cuts[c], sys, depth: cfg.depth, seed: cfg.seed, cascade: c });
      for (let y = 0; y < N; y++) {
        H.set(h0.subarray(y * N * 4, (y + 1) * N * 4), (y * W + c * N) * 4);
        Wv.set(wave.subarray(y * N * 4, (y + 1) * N * 4), (y * W + c * N) * 4);
      }
    }
    this.h0Tex.needsUpdate = true;
    this.waveTex.needsUpdate = true;
  }

  buildMaterials() {
    const N = this.N, bits = Math.log2(N);
    const head = `precision highp float; precision highp int;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
const int N = ${N};
`;
    const vert = 'in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mat = (frag, uniforms) => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vert, fragmentShader: head + frag, uniforms, depthTest: false, depthWrite: false });

    // 1) evolve: h(k,t) → c0..c3 (mesmas fórmulas do passe de linhas do original)
    this.evolveMat = mat(`
uniform sampler2D uH0, uWave; uniform float uTime;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 hv = texelFetch(uH0, p, 0), w = texelFetch(uWave, p, 0);
  float ph = w.w * uTime, cs = cos(ph), sn = sin(ph);
  float hr = hv.x * cs - hv.y * sn + hv.z * cs + hv.w * sn;
  float hi = hv.x * sn + hv.y * cs - hv.z * sn + hv.w * cs;
  float kx = w.x, kz = w.y, ik = w.z, fx = kx * ik, fz = kz * ik;
  vec2 c0 = vec2(-(fx * hi + fz * hr), fx * hr - fz * hi);
  float q = -(kx * kz * ik);
  vec2 c1 = vec2(hr - q * hi, hi + q * hr);
  vec2 c2 = vec2(-(kx * hi + kz * hr), kx * hr - kz * hi);
  float a = -(kx * kx * ik), b = -(kz * kz * ik);
  vec2 c3 = vec2(a * hr - b * hi, a * hi + b * hr);
  o0 = vec4(c0, c1); o1 = vec4(c2, c3);
}`, { uH0: { value: this.h0Tex }, uWave: { value: this.waveTex }, uTime: this.uniforms.uTime });

    // 2) estágio radix-2 (linhas: uAxis 0; colunas: uAxis 1). Entrada do 1º estágio em bit-reverso.
    const stage = () => mat(`
uniform sampler2D uA, uB; uniform int uStage, uAxis;
int bitrev(int v) { int r = 0; for (int i = 0; i < ${bits}; i++) { r = (r << 1) | (v & 1); v >>= 1; } return r; }
vec4 cmul2(vec4 v, vec2 w) { return vec4(v.x * w.x - v.y * w.y, v.x * w.y + v.y * w.x, v.z * w.x - v.w * w.y, v.z * w.y + v.w * w.x); }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int c = p.x / N;                       // cascata (atlas lado a lado)
  int x = uAxis == 0 ? p.x - c * N : p.y; // índice ao longo do eixo da FFT
  int half_ = 1 << uStage;
  int pos = x & (2 * half_ - 1);
  int k = pos & (half_ - 1);
  int i = ((x >> (uStage + 1)) << (uStage + 1)) + k, j = i + half_;
  if (uStage == 0) { i = bitrev(i); j = bitrev(j); }
  ivec2 pi = uAxis == 0 ? ivec2(c * N + i, p.y) : ivec2(p.x, i);
  ivec2 pj = uAxis == 0 ? ivec2(c * N + j, p.y) : ivec2(p.x, j);
  float ang = float(k) * 3.14159265358979 / float(half_);
  vec2 w = vec2(cos(ang), sin(ang));
  vec4 a0 = texelFetch(uA, pi, 0), a1 = texelFetch(uB, pi, 0);
  vec4 b0 = cmul2(texelFetch(uA, pj, 0), w), b1 = cmul2(texelFetch(uB, pj, 0), w);
  float s = pos < half_ ? 1.0 : -1.0;
  o0 = a0 + s * b0; o1 = a1 + s * b1;
}`, { uA: { value: null }, uB: { value: null }, uStage: { value: 0 }, uAxis: { value: 0 } });
    this.stageMat = stage();

    // 3) final por cascata: sinal, Jacobiano, espuma com memória
    this.finalMat = mat(`
uniform sampler2D uA, uB, uPrev; uniform int uCascade; uniform float uLambda, uDt; uniform vec4 uFoam;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 q = ivec2(uCascade * N + p.x, p.y);
  float sg = ((p.x + p.y) & 1) == 0 ? 1.0 : -1.0;
  vec4 A = texelFetch(uA, q, 0) * sg, B = texelFetch(uB, q, 0) * sg;
  float Dx = A.x, Dz = A.y, Dy = A.z, Dxz = A.w, Dyx = B.x, Dyz = B.y, Dxx = B.z, Dzz = B.w;
  float jxx = uLambda * Dxx + 1.0, jzz = uLambda * Dzz + 1.0, jxz = uLambda * Dxz;
  float J = jxx * jzz - jxz * jxz;
  float prev = texelFetch(uPrev, p, 0).w;
  float gen = clamp((uFoam.x - J) * uFoam.y, 0.0, 1.0);
  float f = prev * exp(-uFoam.z * uDt) + gen * uFoam.w * uDt;
  float fNew = clamp(max(f, gen * 0.5), 0.0, 1.5);
  o0 = vec4(uLambda * Dx, Dy, uLambda * Dz, fNew);
  o1 = vec4(Dyx, Dyz, uLambda * Dxx, uLambda * Dzz);
}`, { uA: { value: null }, uB: { value: null }, uPrev: { value: null }, uCascade: { value: 0 }, uLambda: this.uniforms.uLambda, uDt: this.uniforms.uDt, uFoam: this.uniforms.uFoam });
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Avança o oceano até o tempo `time` (s).
   * @param {number} time
   */
  update(time) {
    if (!this.supported) return;
    const r = this.renderer, prevRT = r.getRenderTarget(), prevAuto = r.autoClear, xr = r.xr.enabled;
    r.autoClear = false; r.xr.enabled = false;
    const t = time * this.cfg.timeScale;
    this.uniforms.uDt.value = Math.min(0.1, Math.max(0, t - this.time));
    this.time = t;
    this.uniforms.uTime.value = t;
    this.uniforms.uLambda.value = this.cfg.choppiness;
    const fc = this.cfg.foam;
    this.uniforms.uFoam.value.set(fc.bias, fc.gain, fc.decay, fc.add);

    this.pass(this.evolveMat, this.ping);
    let src = this.ping, dst = this.pong;
    const bits = Math.log2(this.N), su = this.stageMat.uniforms;
    for (let axis = 0; axis < 2; axis++) {
      for (let s = 0; s < bits; s++) {
        su.uA.value = src.textures[0]; su.uB.value = src.textures[1];
        su.uStage.value = s; su.uAxis.value = axis;
        this.pass(this.stageMat, dst);
        [src, dst] = [dst, src];
      }
    }
    const cur = this.out[this.frame & 1], prev = this.out[(this.frame + 1) & 1], fu = this.finalMat.uniforms;
    fu.uA.value = src.textures[0]; fu.uB.value = src.textures[1];
    for (let c = 0; c < this.C; c++) {
      fu.uCascade.value = c;
      fu.uPrev.value = prev[c].textures[0];
      this.pass(this.finalMat, cur[c]);
    }
    this.frame++;
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto; r.xr.enabled = xr;
  }

  /** Texturas de deslocamento (λDx, Dy, λDz, espuma) do quadro atual, uma por cascata. */
  get displacement() {
    return this.out[(this.frame + 1) & 1].map((rt) => rt.textures[0]);
  }

  /** Texturas de derivadas (∂Dy/∂x, ∂Dy/∂z, λ∂Dx/∂x, λ∂Dz/∂z), uma por cascata. */
  get derivatives() {
    return this.out[(this.frame + 1) & 1].map((rt) => rt.textures[1]);
  }

  dispose() {
    if (!this.supported) return;
    for (const rt of [this.ping, this.pong, ...this.out[0], ...this.out[1]]) rt.dispose();
    this.h0Tex.dispose(); this.waveTex.dispose();
  }
}
