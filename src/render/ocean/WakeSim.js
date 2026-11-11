import * as THREE from 'three';
import { WAKE } from '../../config/ocean.js';

/**
 * Esteira interativa do barco (Etapa A4) — porte para WebGL2 do `WakeSim.js` do Tidewater.
 *
 * Ondas lineares de superfície livre com **dispersão exata** numa grade N² que segue o barco:
 *   dw/dt = −g · L[h + P],   dh/dt = w,   L = |k| tanh(|k| d)  (operador Dirichlet-Neumann)
 * L é aplicado no espectro (FFT 2D ida e volta, mesmos estágios radix-2 do oceano). P é a pressão
 * do casco (Havelock): a imersão sob o casco, uma parte dinâmica ~U²/2g onde a proa entra na água
 * e o buraco atrás do espelho de popa em velocidade. Em água funda isso dá a esteira de Kelvin
 * (ondas transversais e divergentes dentro de 19,5°) para qualquer rumo e velocidade [Tidewater].
 *
 * Janela toroidal: a célula do mundo I mora no texel I mod N; a janela anda de célula em célula
 * sem copiar dados, e as células que entram são zeradas [Tidewater]. Borda esponja absorve.
 * Espuma: quebra das cristas (inclinação), bordas do casco em velocidade e esteira da hélice
 * (mais forte acelerando); decai devagar e fica no mundo → rastro branco atrás do barco.
 * Simplificações [jogo]: 256² × 0,5 m; um operador de profundidade (a do barco), terra = parede.
 *
 * Saída para a água: `display` (h, ∂h/∂x, ∂h/∂z, espuma), RepeatWrapping, uv = mundo / (N·cell).
 *
 * @example
 *   const wake = new WakeSim(renderer, water);
 *   wake.update(dt, boatPhysics);   // a cada quadro
 *   water.uniforms.uWake.value = wake.display;
 */
export class WakeSim {
  constructor(renderer, water, cfg = WAKE) {
    this.renderer = renderer;
    this.cfg = cfg;
    const N = cfg.N;
    this.N = N;
    const rt = (count, type, filter) => {
      const t = new THREE.WebGLRenderTarget(N, N, { count, type, depthBuffer: false, minFilter: filter, magFilter: filter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: false });
      for (const tx of t.textures) { tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.minFilter = tx.magFilter = filter; }
      return t;
    };
    const F = THREE.FloatType, NE = THREE.NearestFilter;
    this.stateA = rt(1, F, NE); this.stateB = rt(1, F, NE); // (h, w, espuma, —)
    this.prep = rt(2, F, NE);                                  // [estado zerado, campo u = h + P]
    this.fftA = rt(1, F, NE); this.fftB = rt(1, F, NE);
    this.displayRT = rt(1, THREE.HalfFloatType, THREE.LinearFilter);
    this.origin = new THREE.Vector2(); // canto da janela (células)
    this.prev = new THREE.Vector2();
    this.started = false;
    const wu = water.uniforms;
    this.u = {
      uState: { value: null }, uPrep: { value: null }, uAcc: { value: null },
      uOrigin: { value: this.origin }, uPrev: { value: this.prev },
      uBoat: { value: new THREE.Vector2() }, uFwd: { value: new THREE.Vector2(0, 1) },
      uSpeed: { value: 0 }, uSway: { value: 0 }, uRpm: { value: 0 }, uHalfL: { value: 4 }, uHalfB: { value: 1.4 },
      uDt: { value: 0 }, uDepth: { value: 40 }, uActive: { value: 1 },
      uDepthTex: wu.uDepthTex, uDepthRect: wu.uDepthRect,
    };
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.build();
  }

  build() {
    const N = this.N, c = this.cfg, bits = Math.log2(N), CELL = c.cell.toFixed(4);
    const head = `precision highp float; precision highp int;
layout(location = 0) out vec4 o0;
const int N = ${N}; const float CELL = ${CELL}; const float G = 9.81;
uniform vec2 uOrigin, uPrev, uBoat, uFwd; uniform float uSpeed, uSway, uRpm, uHalfL, uHalfB, uDt, uDepth, uActive;
uniform sampler2D uDepthTex; uniform vec4 uDepthRect;
// célula do mundo guardada no texel t (janela toroidal)
ivec2 cellOf(ivec2 t, vec2 O) { ivec2 o = ivec2(O); return o + ((t - o) & (N - 1)); } // N é potência de 2
float seaDepth(vec2 xz) {
  // fora do mapa: a profundidade da borda (como o terreno, que também prende na borda);
  // assumir "mar fundo" ali criava uma costura reta na água junto da borda do mundo
  vec2 uv = clamp((xz - uDepthRect.xy) / uDepthRect.zw, vec2(0.0), vec2(1.0));
  return texture(uDepthTex, uv).r;
}
`;
    const vert = 'in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mat = (frag, extra = '') => new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: vert, fragmentShader: head + extra + frag, uniforms: this.u, depthTest: false, depthWrite: false });
    const hc = c.hull;
    // 1) zera células que entraram na janela + campo u = h + P (pressão do casco)
    this.prepMat = mat(`
uniform sampler2D uState;
layout(location = 1) out vec4 o1;
float hullHalfBeam(float t) { return t < 0.0 ? 1.0 - 0.18 * t * t : sqrt(max(0.0, 1.0 - pow(t, 1.8))); }
// Pressão do casco em metros de coluna d'água [Tidewater, Havelock]
float pressure(vec2 xz) {
  if (uActive < 0.5) return 0.0;
  vec2 d = xz - uBoat;
  vec2 right = vec2(uFwd.y, -uFwd.x);
  float lz = dot(d, uFwd), lx = dot(d, right);
  float t = lz / uHalfL;
  float hb = uHalfB * hullHalfBeam(clamp(t, -1.0, 1.0));
  // imersão: elipse suave (bordas com ${hc.edge} m de queda)
  float inside = (1.0 - smoothstep(-0.2, ${hc.edge.toFixed(2)}, abs(lx) - hb)) * (1.0 - smoothstep(0.85, 1.12, abs(t)));
  float across = 1.0 - clamp(lx * lx / max(hb * hb, 0.04), 0.0, 1.0) * 0.6;
  float P = ${hc.draft.toFixed(2)} * inside * across * (t > 0.0 ? 1.0 - 0.5 * t * t : 1.0);
  float q = uSpeed * uSpeed / (2.0 * G);
  // proa entrando na água (pressão dinâmica) e buraco atrás do espelho de popa
  P += ${hc.bow.toFixed(2)} * q * inside * smoothstep(0.45, 0.95, t);
  P -= ${hc.stern.toFixed(2)} * q * (1.0 - smoothstep(0.3, 1.2, abs(lx) - hb * 0.8)) * smoothstep(-1.45, -1.0, t) * (1.0 - smoothstep(-1.0, -0.85, t));
  return P;
}
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  ivec2 cell = cellOf(t, uOrigin);
  vec4 s = texelFetch(uState, t, 0);
  ivec2 p0 = ivec2(uPrev);
  bool fresh = any(lessThan(cell, p0)) || any(greaterThanEqual(cell, p0 + N));
  if (fresh) s = vec4(0.0);
  vec2 xz = (vec2(cell) + 0.5) * CELL;
  o0 = s;
  o1 = vec4(s.x + pressure(xz), 0.0, 0.0, 0.0);
}`);
    // 2) estágio radix-2 (uSign −1 = ida, +1 = volta), um campo complexo em .xy
    this.stageMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vert, depthTest: false, depthWrite: false,
      uniforms: { uA: { value: null }, uStage: { value: 0 }, uAxis: { value: 0 }, uSign: { value: -1 } },
      fragmentShader: `precision highp float; precision highp int;
layout(location = 0) out vec4 o0;
uniform sampler2D uA; uniform int uStage, uAxis; uniform float uSign;
int bitrev(int v) { int r = 0; for (int i = 0; i < ${bits}; i++) { r = (r << 1) | (v & 1); v >>= 1; } return r; }
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int x = uAxis == 0 ? p.x : p.y;
  int half_ = 1 << uStage;
  int pos = x & (2 * half_ - 1);
  int k = pos & (half_ - 1);
  int i = ((x >> (uStage + 1)) << (uStage + 1)) + k, j = i + half_;
  if (uStage == 0) { i = bitrev(i); j = bitrev(j); }
  ivec2 pi = uAxis == 0 ? ivec2(i, p.y) : ivec2(p.x, i);
  ivec2 pj = uAxis == 0 ? ivec2(j, p.y) : ivec2(p.x, j);
  float ang = uSign * float(k) * 3.14159265358979 / float(half_);
  vec2 w = vec2(cos(ang), sin(ang));
  vec2 a = texelFetch(uA, pi, 0).xy, b = texelFetch(uA, pj, 0).xy;
  vec2 bw = vec2(b.x * w.x - b.y * w.y, b.x * w.y + b.y * w.x);
  o0 = vec4(pos < half_ ? a + bw : a - bw, 0.0, 0.0);
}`,
    });
    // 3) operador espectral: × (−g |k| tanh(|k| d)) / N²
    this.opMat = mat(`
uniform sampler2D uAcc;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 f = texelFetch(uAcc, p, 0).xy;
  vec2 idx = vec2(p.x < N / 2 ? p.x : p.x - N, p.y < N / 2 ? p.y : p.y - N);
  float k = length(idx) * 6.28318530718 / (float(N) * CELL);
  float L = k * tanh(min(k * uDepth, 20.0));
  o0 = vec4(f * (-G * L / float(N * N)), 0.0, 0.0);
}`);
    const f = c.foam;
    // 4) integra (Euler simplético), esponja, terra, espuma
    this.intMat = mat(`
uniform sampler2D uPrep, uAcc;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  ivec2 cell = cellOf(t, uOrigin);
  vec4 s = texelFetch(uPrep, t, 0);
  float acc = texelFetch(uAcc, t, 0).x;
  vec2 xz = (vec2(cell) + 0.5) * CELL;
  float foam = s.z;
  float damp = ${c.damping.toFixed(3)} + ${c.foamDamping.toFixed(3)} * min(foam, 1.0);
  float w = (s.y + uDt * acc) * exp(-damp * uDt);
  float h = s.x + uDt * w;
  // esponja nas bordas da janela
  ivec2 e2 = min(cell - ivec2(uOrigin), ivec2(uOrigin) + N - 1 - cell);
  float e = float(min(e2.x, e2.y));
  if (e < ${c.sponge.toFixed(1)}) { float k = 1.0 - e / ${c.sponge.toFixed(1)}; float a = exp(-${c.spongeRate.toFixed(2)} * k * k * uDt * 10.0); h *= a; w *= a; }
  // terra firme: parede (sem onda)
  if (seaDepth(xz) < 0.05) { h = 0.0; w = 0.0; }
  // espuma: cristas íngremes quebrando
  float hx = texelFetch(uPrep, ivec2((t.x + 1) % N, t.y), 0).x - texelFetch(uPrep, ivec2((t.x + N - 1) % N, t.y), 0).x;
  float hz = texelFetch(uPrep, ivec2(t.x, (t.y + 1) % N), 0).x - texelFetch(uPrep, ivec2(t.x, (t.y + N - 1) % N), 0).x;
  float steep = length(vec2(hx, hz)) / (2.0 * CELL);
  float gen = clamp((steep - ${f.steep.toFixed(2)}) * ${f.steepGain.toFixed(2)}, 0.0, 1.0);
  if (uActive > 0.5) {
    vec2 d = xz - uBoat, right = vec2(uFwd.y, -uFwd.x);
    float lz = dot(d, uFwd), lx = dot(d, right), tt = lz / uHalfL;
    float spd = abs(uSpeed);
    // bordas do casco em velocidade (onda da proa rebentando no costado)
    float edge = smoothstep(uHalfB * 0.75, uHalfB * 1.05, abs(lx)) * (1.0 - smoothstep(uHalfB * 1.05, uHalfB * 1.6, abs(lx)));
    gen += ${f.hull.toFixed(2)} * edge * step(-1.0, tt) * step(tt, 0.9) * smoothstep(1.8, 6.0, spd + abs(uSway) * 2.0);
    // esteira da hélice: atrás da popa, mais forte acelerando (rotação alta com o barco ainda lento)
    float len = ${f.propLength.toFixed(1)} + spd * 1.5;
    float behind = -(lz + uHalfL);
    float wash = smoothstep(-0.5, 0.5, behind) * (1.0 - smoothstep(len * 0.6, len, behind)) * (1.0 - smoothstep(0.5 + behind * 0.12, 1.1 + behind * 0.18, abs(lx)));
    float churn = abs(uRpm) * (0.5 + 0.8 * clamp(1.0 - spd / 5.0, 0.0, 1.0)) + spd * 0.06;
    gen += ${f.prop.toFixed(2)} * wash * churn;
  }
  // renda: a espuma nasce em manchas e fios (ruído fixo no mundo), não numa faixa lisa
  vec2 cc = vec2(cell);
  float lace = fract(sin(dot(floor(cc * 0.5), vec2(12.9898, 78.233))) * 43758.5453);
  float lace2 = fract(sin(dot(cc, vec2(39.346, 11.135))) * 24634.6345);
  gen *= smoothstep(0.15, 0.85, 0.65 * lace + 0.35 * lace2);
  foam = clamp(foam * exp(-${f.decay.toFixed(2)} * uDt) + gen * uDt * 2.5, 0.0, 1.5);
  if (seaDepth(xz) < 0.05) foam = 0.0;
  o0 = vec4(h, w, foam, 0.0);
}`);
    // 5) textura para a água: (h, ∂h/∂x, ∂h/∂z, espuma)
    this.dispMat = mat(`
uniform sampler2D uState;
void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  vec4 s = texelFetch(uState, t, 0);
  float hx = texelFetch(uState, ivec2((t.x + 1) % N, t.y), 0).x - texelFetch(uState, ivec2((t.x + N - 1) % N, t.y), 0).x;
  float hz = texelFetch(uState, ivec2(t.x, (t.y + 1) % N), 0).x - texelFetch(uState, ivec2(t.x, (t.y + N - 1) % N), 0).x;
  // a depressão sob o próprio casco não aparece (fica dentro do barco)
  o0 = vec4(s.x, hx / (2.0 * CELL), hz / (2.0 * CELL), s.z);
}`);
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  fft(src, sign) {
    const su = this.stageMat.uniforms, bits = Math.log2(this.N);
    let a = src, b = a === this.fftA ? this.fftB : this.fftA;
    su.uSign.value = sign;
    for (let axis = 0; axis < 2; axis++) {
      for (let s = 0; s < bits; s++) {
        su.uA.value = a.textures[0]; su.uStage.value = s; su.uAxis.value = axis;
        this.pass(this.stageMat, b);
        [a, b] = [b, a];
      }
    }
    return a;
  }

  /** Textura da esteira para a água. */
  get display() {
    return this.displayRT.texture;
  }

  /** Tamanho da janela (m). */
  get size() {
    return this.N * this.cfg.cell;
  }

  /**
   * @param {number} dt s
   * @param {import('../../systems/boat/BoatPhysics.js').BoatPhysics} boat
   * @param {boolean} [active] barco na água (perto do jogador)
   */
  update(dt, boat, active = true) {
    const r = this.renderer, prevRT = r.getRenderTarget(), auto = r.autoClear;
    r.autoClear = false;
    const u = this.u, cell = this.cfg.cell, N = this.N;
    const p = boat.renderPosition;
    // janela centrada no barco, em células inteiras
    this.prev.copy(this.started ? this.origin : new THREE.Vector2(1e9, 1e9));
    this.origin.set(Math.floor(p.x / cell) - N / 2, Math.floor(p.z / cell) - N / 2);
    if (!this.started) this.prev.copy(this.origin).addScalar(-N * 4); // tudo novo: zera
    this.started = true;
    const yaw = boat.angles().yaw;
    u.uBoat.value.set(p.x, p.z);
    u.uFwd.value.set(Math.sin(yaw), Math.cos(yaw));
    u.uSpeed.value = boat.speed;
    u.uSway.value = boat.sway;
    u.uRpm.value = boat.rpm;
    u.uHalfL.value = boat.cfg.waterlineLength / 2;
    u.uHalfB.value = boat.cfg.waterlineBeam / 2;
    u.uDt.value = Math.min(dt, 1 / 30);
    u.uActive.value = active ? 1 : 0;
    // 1) prepara
    u.uState.value = this.stateA.texture;
    this.pass(this.prepMat, this.prep);
    // 2) ida (cópia de u para o buffer da FFT)
    u.uAcc.value = this.prep.textures[1];
    const fwd = this.fft(this.copyTo(this.prep.textures[1]), -1);
    // 3) operador
    u.uAcc.value = fwd.textures[0];
    const other = fwd === this.fftA ? this.fftB : this.fftA;
    this.pass(this.opMat, other);
    // 4) volta
    const back = this.fft(other, 1);
    // 5) integra
    u.uPrep.value = this.prep.textures[0];
    u.uAcc.value = back.textures[0];
    this.pass(this.intMat, this.stateB);
    [this.stateA, this.stateB] = [this.stateB, this.stateA];
    // 6) textura de exibição
    u.uState.value = this.stateA.texture;
    this.pass(this.dispMat, this.displayRT);
    r.setRenderTarget(prevRT);
    r.autoClear = auto;
  }

  /** Copia uma textura para o buffer A da FFT (o operador de pressão vive no prep). */
  copyTo(tex) {
    this.copyMat ??= new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false, uniforms: { uSrc: { value: null } },
      vertexShader: 'in vec3 position; void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'precision highp float; layout(location = 0) out vec4 o0; uniform sampler2D uSrc; void main() { o0 = vec4(texelFetch(uSrc, ivec2(gl_FragCoord.xy), 0).x, 0.0, 0.0, 0.0); }',
    });
    this.copyMat.uniforms.uSrc.value = tex;
    this.pass(this.copyMat, this.fftA);
    return this.fftA;
  }
}
