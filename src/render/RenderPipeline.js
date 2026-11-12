import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { POST } from '../config/lighting.js';
import { BIOMES } from '../config/biomes.js';
import { WORLD } from '../config/worldConfig.js';

/**
 * Pipeline de pós-processamento cinematográfico (Etapa L3).
 *
 * Ordem do quadro:
 *   cena → `sceneRT` (cor HDR em meia-precisão + profundidade em textura, sem MSAA: a água
 *   continua copiando a tela para a refração)
 *   → GTAO (oclusão de contato, meia resolução, normais reconstruídas da profundidade — sem
 *     redesenhar a cena)
 *   → SSR (só Cinemático: reflexo em tela no chão plano, mais forte molhado)
 *   → raios de sol (desfoque radial do céu visível a partir do sol)
 *   → bloom (sempre ligado, limiar alto) → ACES + sRGB (`OutputPass`)
 *   → correção de cor + vinheta → SMAA (bordas, já que o alvo não tem MSAA) → tela.
 *
 * Com `post` nulo (níveis Muito baixo…Médio) desenha direto na tela: custo zero, como antes.
 *
 * @example
 *   const pipeline = new RenderPipeline(renderer, scene, camera);
 *   pipeline.configure(preset.post, preset.antialias);
 *   // a cada quadro:
 *   pipeline.update(environment, weights, materialFactory.uniforms.uWet.value, weather.bloomStrength);
 *   pipeline.render();
 */
export class RenderPipeline {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} [cfg] `POST`
   */
  constructor(renderer, scene, camera, cfg = POST) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.cfg = cfg;
    this.flags = null;
    this.built = false;
    this.bloomBoost = 0;
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
  }

  /**
   * Liga/desliga efeitos (troca de nível gráfico).
   * @param {{ ao?: boolean, ssr?: boolean, godrays?: boolean, bloom?: boolean, grade?: boolean } | null} flags
   * @param {boolean} [smaa] suavizar bordas (o alvo da cena não tem MSAA)
   */
  configure(flags, smaa = true) {
    this.flags = flags ? { ...flags, smaa } : null;
    if (this.flags) this.ensure();
  }

  /** Cria alvos e passes na primeira vez. */
  ensure() {
    if (this.built) return;
    this.built = true;
    const c = this.cfg, r = this.renderer;
    const depth = new THREE.DepthTexture(1, 1);
    depth.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: depth, samples: 0 });
    const opts = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opts);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opts);

    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1, { depthTexture: depth });
    this.gtao.updateGtaoMaterial({ radius: c.ao.radius, distanceExponent: c.ao.distanceExponent, thickness: c.ao.thickness, samples: c.ao.samples, scale: 1 });
    this.gtao.blendIntensity = c.ao.intensity;
    this.ssr = new ShaderPass(makeSSRShader(c.ssr));
    this.ssr.uniforms.tDepth.value = depth;
    this.godrays = new ShaderPass(makeGodRayShader(c.godrays));
    this.godrays.uniforms.tDepth.value = depth;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), c.bloom.strength, c.bloom.radius, c.bloom.threshold);
    this.output = new OutputPass();
    this.grade = new ShaderPass(makeGradeShader(c.grade));
    this.smaa = new SMAAPass();
    for (const p of [this.ssr, this.godrays, this.grade]) p.material.depthTest = p.material.depthWrite = false;
    this.setSize();
    void r;
  }

  /** Acompanha o tamanho do canvas e a resolução interna. */
  setSize() {
    if (!this.built) return;
    const s = this.renderer.getDrawingBufferSize(this._v2 ??= new THREE.Vector2());
    const w = Math.max(1, s.x | 0), h = Math.max(1, s.y | 0);
    this.sceneRT.setSize(w, h);
    this.rtA.setSize(w, h);
    this.rtB.setSize(w, h);
    const ao = this.cfg.ao.scale, bl = this.cfg.bloom.scale;
    this.gtao.setSize(Math.max(1, w * ao | 0), Math.max(1, h * ao | 0));
    this.bloom.setSize(Math.max(1, w * bl | 0), Math.max(1, h * bl | 0));
    this.smaa.setSize(w, h);
    this.ssr.uniforms.uRes.value.set(w, h);
  }

  /** Passes ativos, na ordem do quadro. */
  activePasses() {
    return activePassNames(this.flags).map((n) => this[n]);
  }

  /**
   * Atualiza parâmetros dependentes do mundo (uma vez por quadro, antes de `render`).
   * @param {object} env Environment (`sunDir`, `night`, `skyUniforms`)
   * @param {ArrayLike<number>|null} weights pesos dos biomas no jogador (null = masmorra)
   * @param {number} wet umidade global 0..1
   * @param {number} weatherBloom bloom extra pedido pelo clima (ondas de calor)
   */
  update(env, weights, wet = 0, weatherBloom = 0) {
    if (!this.flags) return;
    const cam = this.camera, c = this.cfg;
    cam.updateMatrixWorld();
    this.bloom.strength = c.bloom.strength + weatherBloom;
    // raios de sol: sol projetado na tela + força pelo bioma, altura e se a câmera olha para ele
    const g = this.godrays.uniforms;
    let k = 0;
    if (weights && env?.sunDir) {
      cam.getWorldDirection(this._d);
      const facing = this._d.dot(env.sunDir);
      k = godRayStrength(weights, env.sunDir.y, facing, env.night ?? 0, c.godrays);
      this._v.copy(env.sunDir).multiplyScalar(1000).add(cam.position).project(cam);
      g.uSun.value.set(this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5);
      g.uColor.value.copy(env.skyUniforms?.uSunColor.value ?? g.uColor.value);
    }
    g.uStrength.value = k;
    this.godrayStrength = k;
    // SSR
    const s = this.ssr.uniforms;
    s.uStrength.value = weights ? c.ssr.base + c.ssr.wet * wet : 0;
    s.uProj.value.copy(cam.projectionMatrix);
    s.uInvProj.value.copy(cam.projectionMatrixInverse);
    s.uCamWorld.value.copy(cam.matrixWorld);
  }

  /** Desenha o quadro (direto na tela se não há pós-processamento). */
  render() {
    const r = this.renderer;
    if (!this.flags) {
      r.render(this.scene, this.camera);
      return;
    }
    r.setRenderTarget(this.sceneRT);
    r.render(this.scene, this.camera);
    const passes = this.activePasses().filter((p) => !(p === this.godrays && this.godrayStrength <= 0.001) && !(p === this.ssr && this.ssr.uniforms.uStrength.value <= 0.001));
    let read = this.sceneRT, write = this.rtA;
    passes.forEach((p, i) => {
      p.renderToScreen = i === passes.length - 1;
      p.render(r, write, read, 0, false);
      if (p.needsSwap) {
        read = write;
        write = read === this.rtA ? this.rtB : this.rtA;
      }
    });
    if (!passes.length) { // nada ligado: só copia (não acontece com OutputPass na lista)
      r.setRenderTarget(null);
    }
  }

  dispose() {
    if (!this.built) return;
    for (const t of [this.sceneRT, this.rtA, this.rtB]) t.dispose();
    for (const p of [this.gtao, this.ssr, this.godrays, this.bloom, this.output, this.grade, this.smaa]) p.dispose?.();
  }
}

/**
 * Nomes dos passes ligados, na ordem do quadro (puro, testável).
 * @param {object|null} f flags do nível gráfico
 * @returns {string[]}
 */
export function activePassNames(f) {
  if (!f) return [];
  const out = [];
  if (f.ao) out.push('gtao');
  if (f.ssr) out.push('ssr');
  if (f.godrays) out.push('godrays');
  if (f.bloom) out.push('bloom');
  out.push('output'); // ACES + sRGB sempre (o alvo da cena é linear HDR)
  if (f.grade) out.push('grade');
  if (f.smaa) out.push('smaa');
  return out;
}

/**
 * Força dos raios de sol (puro, testável).
 * @param {ArrayLike<number>} weights pesos dos biomas (ordem de BIOMES)
 * @param {number} sunY altura do sol/lua (componente y da direção, -1..1)
 * @param {number} facing cos do ângulo entre a câmera e o sol
 * @param {number} night 0 dia … 1 noite (lua)
 * @param {object} [g] `POST.godrays`
 */
export function godRayStrength(weights, sunY, facing, night, g = POST.godrays) {
  if (sunY <= 0) return 0;
  let bio = 0;
  for (let i = 0; i < BIOMES.length; i++) bio += (weights[i] ?? 0) * (g.biomes[BIOMES[i].id] ?? 0.3);
  const face = Math.max(0, (facing - g.facing) / (1 - g.facing));
  const low = 1 - Math.min(1, sunY / 0.9) * 0.6; // sol baixo = feixes mais longos e visíveis
  return bio * face * face * low * (1 + (g.night - 1) * night);
}

const FS_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/** Raios de sol: soma radial do céu visível (profundidade = fundo) em direção ao sol. */
function makeGodRayShader(g) {
  return {
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      uSun: { value: new THREE.Vector2(0.5, 0.5) }, uColor: { value: new THREE.Color(1, 0.9, 0.7) },
      uStrength: { value: 0 }, uDensity: { value: g.density }, uDecay: { value: g.decay }, uExposure: { value: g.exposure }, uSkyMin: { value: g.skyMin },
    },
    defines: { SAMPLES: g.samples },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform sampler2D tDepth;
      uniform vec2 uSun; uniform vec3 uColor; uniform float uStrength, uDensity, uDecay, uExposure, uSkyMin;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        vec2 delta = (vUv - uSun) * (uDensity / float(SAMPLES));
        vec2 uv = vUv - delta * hash(vUv * 917.0); // jitter: troca faixas por grão fino
        float illum = 1.0, sum = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          uv -= delta;
          vec2 cuv = clamp(uv, 0.001, 0.999);
          float sky = step(0.99999, texture2D(tDepth, cuv).x);
          vec3 s = texture2D(tDiffuse, cuv).rgb;
          float lum = clamp(dot(s, vec3(0.299, 0.587, 0.114)) - uSkyMin, 0.0, 4.0); // só o céu bem claro (perto do sol)
          // só o céu perto do sol emite (disco largo e suave)
          float disc = exp(-length((cuv - uSun) * vec2(1.6, 1.0)) * 3.5);
          sum += sky * lum * disc * illum;
          illum *= uDecay;
        }
        gl_FragColor = vec4(base.rgb + uColor * sum * uExposure * uStrength / float(SAMPLES) * 8.0, base.a);
      }`,
  };
}

/** SSR barato: normais da profundidade, marcha no espaço de vista, só superfícies planas viradas para cima. */
function makeSSRShader(s) {
  return {
    uniforms: {
      tDiffuse: { value: null }, tDepth: { value: null },
      uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uRes: { value: new THREE.Vector2(1, 1) }, uStrength: { value: 0 },
      uMaxDist: { value: s.maxDistance }, uThickness: { value: s.thickness },
      uWaterY: { value: WORLD.waterLevel }, uWaterBand: { value: s.waterBand },
    },
    defines: { STEPS: s.steps },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform sampler2D tDepth;
      uniform mat4 uProj, uInvProj, uCamWorld; uniform vec2 uRes;
      uniform float uStrength, uMaxDist, uThickness, uWaterY, uWaterBand;
      varying vec2 vUv;
      vec3 viewPos(vec2 uv, float d) { vec4 p = uInvProj * vec4(vec3(uv, d) * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
      vec2 toUv(vec3 p) { vec4 c = uProj * vec4(p, 1.0); return c.xy / c.w * 0.5 + 0.5; }
      void main() {
        vec4 base = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        if (d >= 0.99999) { gl_FragColor = base; return; }
        vec3 P = viewPos(vUv, d);
        vec2 px = 1.0 / uRes;
        vec3 Px = viewPos(vUv + vec2(px.x, 0.0), texture2D(tDepth, vUv + vec2(px.x, 0.0)).x);
        vec3 Py = viewPos(vUv + vec2(0.0, px.y), texture2D(tDepth, vUv + vec2(0.0, px.y)).x);
        vec3 N = normalize(cross(Px - P, Py - P));
        if (dot(N, P) > 0.0) N = -N;
        vec3 Nw = mat3(uCamWorld) * N;
        float wy = (uCamWorld * vec4(P, 1.0)).y;
        float k = uStrength * smoothstep(0.8, 0.97, Nw.y) * step(uWaterBand, abs(wy - uWaterY));
        if (k < 0.005) { gl_FragColor = base; return; }
        vec3 V = normalize(P), R = reflect(V, N);
        float F = 0.04 + 0.96 * pow(1.0 - max(dot(-V, N), 0.0), 5.0);
        vec3 hit = vec3(0.0); float found = 0.0;
        float t0 = 0.0;
        for (int i = 1; i <= STEPS; i++) {
          float t = pow(float(i) / float(STEPS), 1.8) * uMaxDist;
          vec3 Q = P + R * t;
          vec2 uv = toUv(Q);
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || Q.z > -0.1) break;
          float sd = texture2D(tDepth, uv).x;
          if (sd >= 0.99999) { t0 = t; continue; }
          float sz = viewPos(uv, sd).z;
          if (Q.z < sz && sz - Q.z < uThickness * (1.0 + t * 0.05)) {
            // refino binário entre o passo anterior e este
            float a = t0, b = t;
            for (int j = 0; j < 5; j++) {
              float m = 0.5 * (a + b); vec3 M = P + R * m; vec2 muv = toUv(M);
              if (M.z < viewPos(muv, texture2D(tDepth, muv).x).z) b = m; else a = m;
            }
            vec2 huv = toUv(P + R * b);
            vec2 e = smoothstep(0.0, 0.08, huv) * smoothstep(0.0, 0.08, 1.0 - huv);
            found = e.x * e.y * (1.0 - b / uMaxDist);
            hit = texture2D(tDiffuse, huv).rgb;
            break;
          }
          t0 = t;
        }
        float w = clamp(k * found * mix(0.35, 1.0, F), 0.0, 0.85);
        gl_FragColor = vec4(mix(base.rgb, hit, w), base.a);
      }`,
  };
}

/** Correção de cor final (pós-ACES): saturação, contraste, tom de sombras/realces, vinheta. */
function makeGradeShader(g) {
  return {
    uniforms: {
      tDiffuse: { value: null },
      uSat: { value: g.saturation }, uContrast: { value: g.contrast },
      uShadows: { value: new THREE.Vector3(...g.shadows) }, uHighlights: { value: new THREE.Vector3(...g.highlights) },
      uVignette: { value: g.vignette },
    },
    vertexShader: FS_VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uSat, uContrast, uVignette; uniform vec3 uShadows, uHighlights;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 col = mix(vec3(l), c.rgb, uSat);
        col = (col - 0.5) * uContrast + 0.5;
        col *= mix(uShadows, uHighlights, smoothstep(0.1, 0.8, l));
        vec2 v = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.25, 0.85, dot(v, v) * 2.0);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
      }`,
  };
}
