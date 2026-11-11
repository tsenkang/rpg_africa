import * as THREE from 'three';
import { WORLD } from '../config/worldConfig.js';
import { OCEAN } from '../config/ocean.js';
import { OceanSimulation } from '../render/ocean/OceanSimulation.js';
import { buildOceanGrid } from '../render/ocean/OceanGrid.js';
import { WaterQuery } from '../render/ocean/WaterQuery.js';
import { Caustics } from '../render/ocean/Caustics.js';
import { UnderwaterLighting } from '../render/ocean/UnderwaterLighting.js';
import { ShoreWaves, SHORE_GLSL } from '../render/ocean/ShoreWaves.js';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/**
 * Água única (mar, lago e rios) no nível 0.
 *
 * Com WebGL2 + float render targets: **oceano FFT** (Etapa A1, porte do Tidewater) —
 * malha em anéis em volta da câmera, deslocada pelas 4 cascatas; normais e espuma pelas
 * derivadas e pelo Jacobiano; ondas longas somem no raso (textura de profundidade do fundo).
 * Sem suporte: a água antiga (plano com normais de senóides).
 *
 * Ótica (Etapa A2): refração com a cópia da tela, absorção Beer-Lambert pelo caminho da luz,
 * Fresnel dielétrico exato, reflexo planar do cenário (ou só do céu), cáusticas e luz
 * subaquática no terreno, janela de Snell e neblina quando a câmera mergulha, espuma na beira.
 * A altura da água sob a câmera vem da GPU (`WaterQuery`, slot 0).
 *
 * @example
 *   const water = new Water({ renderer, terrain });
 *   scene.add(water.mesh);
 *   water.update(time, environment, camera); // a cada quadro
 */
export class Water {
  /**
   * @param {{ renderer?: THREE.WebGLRenderer, terrain?: { heightAt: (x:number,z:number)=>number } }} [o]
   */
  constructor({ renderer = null, terrain = null } = {}) {
    this.cfg = OCEAN;
    this.ocean = renderer ? new OceanSimulation(renderer, OCEAN) : null;
    this.fft = !!this.ocean?.supported;
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uSkyTop: { value: new THREE.Color(0x3f78c2) },
        uSkyHorizon: { value: new THREE.Color(0xe6d3ad) },
        uDeep: { value: new THREE.Color(0x0f2a30) },
        uShallow: { value: new THREE.Color(0x2b5a52) },
        uFoamColor: { value: new THREE.Color(0xf2f4f2) },
        uFoamAmount: { value: 1 },
        uClarity: { value: 1 },
      },
    ]);
    if (this.fft) {
      Object.assign(this.uniforms, {
        uDisp: { value: this.ocean.displacement },
        uDeriv: { value: this.ocean.derivatives },
        uSizes: { value: new THREE.Vector4(...OCEAN.cascadeSizes) },
        uD0: { value: new THREE.Vector4(...OCEAN.cascadeSizes.map((L) => Math.min(40, L * 0.08))) },
        uFloor: { value: new THREE.Vector4(...OCEAN.shallow.floor) },
        uFoamW: { value: new THREE.Vector4(...OCEAN.foam.weights) },
        uAmp: { value: OCEAN.amplitude },
        uTexel: { value: new THREE.Vector4(...OCEAN.cascadeSizes.map((L) => L / OCEAN.fftSize)) },
        uDepthTex: { value: this.buildDepthTexture(terrain) },
        uDepthRect: { value: new THREE.Vector4(-WORLD.width / 2, -WORLD.depth / 2, WORLD.width, WORLD.depth) },
        uFrame: { value: null }, uHasFrame: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
        uRefl: { value: null }, uHasRefl: { value: 0 }, uReflMat: { value: new THREE.Matrix4() },
        uRefr: { value: OCEAN.optics.refraction }, uIor: { value: OCEAN.optics.ior },
        uAbsorb: { value: new THREE.Vector3(...OCEAN.optics.absorption) },
        uScatter: { value: new THREE.Vector3(...OCEAN.optics.scatter) },
        uShoreFoam: { value: OCEAN.optics.shoreFoam }, uLevel: { value: WORLD.waterLevel }, uLevelV: { value: WORLD.waterLevel },
        uWake: { value: null }, uWakeOn: { value: 0 }, uWakeRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      });
      // ondas de costa (A5): campo de percurso a partir do terreno
      this.shore = terrain ? new ShoreWaves(terrain, OCEAN.shore) : null;
      Object.assign(this.uniforms, this.shore ? this.shore.uniforms : {
        uShoreT: { value: null }, uShoreGrid: { value: new THREE.Vector4(0, 0, 1, 0) }, uShoreSize: { value: new THREE.Vector2(1, 1) },
        uShoreP: { value: new THREE.Vector4() }, uShoreOn: { value: 0 }, uShoreTime: { value: 0 },
      });
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      transparent: true,
      side: this.fft ? THREE.DoubleSide : THREE.FrontSide,
      vertexShader: this.fft ? FFT_VERT : FLAT_VERT,
      fragmentShader: this.fft ? FFT_FRAG : FLAT_FRAG,
    });
    if (this.fft) {
      const m = OCEAN.mesh;
      this.mesh = new THREE.Mesh(buildOceanGrid({ segments: m.segments, inner: m.innerSpacing, far: m.farRadius }), material);
      this.mesh.frustumCulled = false;
    } else {
      const size = Math.max(WORLD.width, WORLD.depth) * 4;
      const geo = new THREE.PlaneGeometry(size, size, 1, 1);
      geo.rotateX(-Math.PI / 2);
      this.mesh = new THREE.Mesh(geo, material);
    }
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
    this.renderer = renderer;
    this.underwater = false;
    this.cameraWaterHeight = WORLD.waterLevel;
    if (!this.fft) return;
    // ---- A2: altura na câmera, cáusticas, luz subaquática, refração, reflexo
    this.query = new WaterQuery(renderer, this, WORLD.waterLevel);
    this.caustics = new Caustics(renderer, this);
    this.underwaterLighting = new UnderwaterLighting(this, this.caustics, WORLD.waterLevel);
    this.mainCamera = null;
    this.frameTex = null;
    this._size = new THREE.Vector2();
    this.mesh.onBeforeRender = (r, scene, camera) => this.copyFrame(r, camera);
    this.setReflection(OCEAN.optics.reflection);
  }

  /** Liga/desliga o reflexo planar do cenário ('planar' | 'sky'). */
  setReflection(mode) {
    if (!this.fft) return;
    this.reflectionMode = mode;
    if (mode === 'planar' && !this.reflector) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2()).multiplyScalar(this.cfg.optics.reflectionScale);
      this.reflector = new Reflector(new THREE.PlaneGeometry(1, 1), { textureWidth: Math.max(64, size.x | 0), textureHeight: Math.max(64, size.y | 0), clipBias: 0.02 });
      this.reflector.rotation.x = -Math.PI / 2;
      this.reflector.position.y = WORLD.waterLevel;
      this.reflector.updateMatrixWorld(true);
      this.uniforms.uRefl.value = this.reflector.getRenderTarget().texture;
    }
    this.uniforms.uHasRefl.value = 0;
  }

  /** Antes de desenhar a água: copia a tela já desenhada (fonte da refração). */
  copyFrame(r, camera) {
    const u = this.uniforms;
    if (camera !== this.mainCamera) { u.uHasFrame.value = 0; return; }
    const rt = r.getRenderTarget();
    if (rt && rt.samples > 0) { u.uHasFrame.value = 0; return; } // cópia de alvo MSAA não é permitida
    const size = rt ? this._size.set(rt.width, rt.height) : r.getDrawingBufferSize(this._size);
    if (!this.frameTex || this.frameTex.image.width !== size.x || this.frameTex.image.height !== size.y) {
      this.frameTex?.dispose();
      this.frameTex = new THREE.FramebufferTexture(size.x, size.y);
      this.frameTex.minFilter = this.frameTex.magFilter = THREE.LinearFilter;
    }
    r.copyFramebufferToTexture(this.frameTex);
    u.uFrame.value = this.frameTex;
    u.uRes.value.copy(size);
    u.uHasFrame.value = 1;
  }

  /** Instala a luz subaquática e as cáusticas no material (terreno, pedras…). */
  installUnderwater(material) {
    this.underwaterLighting?.install(material);
  }

  /**
   * Fundo do oceano além da borda do mapa: o terreno termina ali, e sem um fundo a água
   * transparente mostrava o vazio (uma costura reta e clara ao longo da borda do mundo).
   * Plano grande um pouco abaixo da profundidade da borda, com luz subaquática.
   * @param {{ heightAt: (x:number, z:number) => number }} terrain
   */
  buildOceanFloor(terrain) {
    let edge = 0;
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const u = -0.5 + i / n;
      for (const [x, z] of [[u * WORLD.width, -WORLD.depth / 2], [u * WORLD.width, WORLD.depth / 2], [-WORLD.width / 2, u * WORLD.depth], [WORLD.width / 2, u * WORLD.depth]]) edge += terrain.heightAt(x, z);
    }
    edge /= (n + 1) * 4;
    const geo = new THREE.PlaneGeometry(40000, 40000, 1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 1, metalness: 0 });
    this.installUnderwater(mat);
    const floor = new THREE.Mesh(geo, mat);
    floor.position.y = Math.min(edge, WORLD.waterLevel - 2) - 1.5; // abaixo do terreno da borda (sem brigar com ele)
    floor.receiveShadow = false;
    floor.name = 'fundo-do-oceano';
    floor.userData.noCollide = true;
    return floor;
  }

  /**
   * Profundidade do fundo (nível da água − terreno) em meia-precisão, `OCEAN.depthTexel` m por texel.
   * Fora do mapa o shader assume mar fundo.
   */
  buildDepthTexture(terrain) {
    const t = this.cfg.depthTexel, w = Math.ceil(WORLD.width / t), h = Math.ceil(WORLD.depth / t);
    const data = new Uint16Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = -WORLD.width / 2 + (i + 0.5) * t, z = -WORLD.depth / 2 + (j + 0.5) * t;
        const d = terrain ? WORLD.waterLevel - terrain.heightAt(x, z) : this.cfg.depth;
        data[j * w + i] = THREE.DataUtils.toHalfFloat(Math.max(-50, Math.min(500, d)));
      }
    }
    const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.HalfFloatType);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * @param {number} time s
   * @param {object} env Environment (sol, céu)
   * @param {THREE.Camera} [camera] a malha do oceano segue a câmera
   */
  update(time, env, camera) {
    this.uniforms.uTime.value = time;
    this.uniforms.uSunDir.value.copy(env.sunDir);
    this.uniforms.uSunColor.value.copy(env.state.sunColor).multiplyScalar(Math.min(1, env.state.sunIntensity / 3));
    this.uniforms.uSkyTop.value.copy(env.state.skyTop);
    this.uniforms.uSkyHorizon.value.copy(env.state.skyHorizon);
    if (!this.fft) return;
    this.ocean.update(time);
    const u = this.uniforms;
    u.uDisp.value = this.ocean.displacement;
    u.uDeriv.value = this.ocean.derivatives;
    u.uAmp.value = this.cfg.amplitude;
    const o = this.cfg.optics;
    u.uAbsorb.value.set(...o.absorption);
    u.uScatter.value.set(...o.scatter);
    u.uRefr.value = o.refraction;
    u.uShoreFoam.value = o.shoreFoam;
    this.shore?.update(this.ocean.time);
    this.caustics.update(env.sunDir, this.ocean);
    this.underwaterLighting.update(env);
    this.underwaterLighting.uniforms.uUwCausticK.value = o.causticStrength;
    if (!camera) return;
    this.mainCamera = camera;
    this.mesh.position.x = camera.position.x; this.mesh.position.z = camera.position.z;
    // Altura da água na lente (slot 0): acima ou abaixo d'água?
    this.query.set(0, camera.position.x, camera.position.z);
    this.query.update(this.ocean.time);
    this.cameraWaterHeight = this.query.height(0, this.ocean.time);
    this.underwater = this.query.valid && this.query.depth(0) > 0.2 && camera.position.y < this.cameraWaterHeight - 0.02;
    const fog = env.scene?.fog;
    // Mergulhado: sem céu (o fundo do mar some na neblina) e sem a cor do céu como fundo.
    if (env.sky) env.sky.visible = !this.underwater;
    if (env.scene) {
      if (this.underwater) { this._bg ??= new THREE.Color(); env.scene.background = this._bg; }
      else if (env.scene.background === this._bg) env.scene.background = null;
    }
    if (this.underwater && fog) {
      // a Environment refaz a neblina a cada quadro: aqui só sobrescreve enquanto mergulhado
      const light = Math.min(1, env.state.sunIntensity / 2.5) * 0.8 + 0.2;
      fog.color.setRGB(o.scatter[0] * 3 * light, o.scatter[1] * 3 * light, o.scatter[2] * 3 * light);
      fog.density = o.underwaterFog;
      this._bg.copy(fog.color);
    }
    // Reflexo planar: a cena espelhada no plano da água (a água fica de fora).
    u.uHasRefl.value = 0;
    if (this.reflector && this.reflectionMode === 'planar' && !this.underwater && env.scene) {
      // Limpa com alfa 0: onde a câmera espelhada não vê nada (abaixo do horizonte espelhado)
      // o alfa fica 0 e a água usa o céu — sem isso aparecia uma faixa preta (manchas escuras).
      const r = this.renderer, cc = r.getClearColor(this._cc ??= new THREE.Color()), ca = r.getClearAlpha();
      r.setClearColor(0x000000, 0);
      this.mesh.visible = false;
      this.reflector.onBeforeRender(r, env.scene, camera);
      this.mesh.visible = true;
      r.setClearColor(cc, ca);
      u.uReflMat.value.copy(this.reflector.material.uniforms.textureMatrix.value);
      u.uHasRefl.value = 1;
    }
  }

  /** Vento/direção/swell mudaram: refaz o espectro (~40 ms). */
  setWind(patch = {}) {
    Object.assign(this.cfg.local, patch);
    this.ocean?.rebuildSpectrum();
  }
}

// ------------------------------------------------------------------ oceano FFT

const COMMON = /* glsl */ `
uniform sampler2D uDisp[4];
uniform sampler2D uDeriv[4];
uniform vec4 uSizes, uD0, uFloor, uFoamW, uTexel, uDepthRect;
uniform float uAmp;
uniform sampler2D uDepthTex;

uniform sampler2D uWake;
uniform float uWakeOn;
uniform vec4 uWakeRect; // canto (m), tamanho (m) da janela da esteira
// (h, ∂h/∂x, ∂h/∂z, espuma) da esteira do barco, com borda suave na janela [Tidewater wakeSample]
vec4 wakeSample(vec2 xz) {
  if (uWakeOn < 0.5) return vec4(0.0);
  vec2 f = (xz - uWakeRect.xy) / uWakeRect.zw;
  float m = smoothstep(0.0, 0.08, f.x) * smoothstep(1.0, 0.92, f.x) * smoothstep(0.0, 0.08, f.y) * smoothstep(1.0, 0.92, f.y);
  if (m <= 0.0) return vec4(0.0);
  return texture(uWake, xz / uWakeRect.zw) * m;
}
float seaDepth(vec2 xz) {
  // fora do mapa: a profundidade da borda (como o terreno, que também prende na borda);
  // assumir "mar fundo" ali criava uma costura reta na água junto da borda do mundo
  vec2 uv = clamp((xz - uDepthRect.xy) / uDepthRect.zw, vec2(0.0), vec2(1.0));
  return texture(uDepthTex, uv).r;
}
// Atenuação por cascata no raso [Tidewater waterSurfaceCascadeAttenuation].
float atten(int c, float depth) {
  float a = smoothstep(0.0, uD0[c], depth);
  return mix(uFloor[c] * smoothstep(0.0, 0.6, depth), 1.0, a);
}
${SHORE_GLSL}
`;

const FFT_VERT = /* glsl */ `
attribute float aSpacing;
varying vec3 vWorld;
varying vec2 vLag;
varying float vDepth;
varying float vFoam;
varying vec2 vShoreSlope;
varying float vSwash;
uniform float uLevelV;
${COMMON}
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec2 xz = wp.xz;
  float depth = seaDepth(xz);
  vec3 disp = vec3(0.0);
  float foam = 0.0;
  ${[0, 1, 2, 3].map((c) => `{
    // limita a banda ao espaçamento da malha (sem serrilhado) [Tidewater]
    float level = max(log2(aSpacing / uTexel[${c}]) + 0.7, 0.0);
    float att = atten(${c}, depth);
    vec4 s = textureLod(uDisp[${c}], xz / uSizes[${c}], level);
    disp += s.xyz * att;
    foam += textureLod(uDisp[${c}], xz / uSizes[${c}], max(level, 1.5)).w * uFoamW[${c}] * att;
  }`).join('\n  ')}
  wp.xyz += disp * uAmp;
  // ondas de costa: empinam, quebram, viram corredeira e espraiam na areia (A5)
  ShoreS sh = shoreEval(xz, depth);
  wp.xyz += sh.disp;
  foam += sh.foam;
  vShoreSlope = sh.slope;
  vSwash = 0.0;
  if (sh.swashY > -100.0) { wp.y = sh.swashY + uLevelV; vSwash = 1.0; }
  vec4 wk = wakeSample(xz);
  wp.y += wk.x;
  foam += wk.w * 0.8;
  vWorld = wp.xyz;
  vLag = xz;
  vDepth = depth;
  vFoam = foam;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FFT_FRAG = /* glsl */ `
uniform float uTime, uFoamAmount, uClarity;
uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyHorizon, uDeep, uShallow, uFoamColor;
uniform sampler2D uFrame, uRefl;
uniform float uHasFrame, uHasRefl, uRefr, uIor, uShoreFoam, uLevel;
uniform vec2 uRes;
uniform mat4 uReflMat;
uniform vec3 uAbsorb, uScatter;
varying vec3 vWorld;
varying vec2 vLag;
varying float vDepth;
varying float vFoam;
varying vec2 vShoreSlope;
varying float vSwash;
${COMMON}
#include <fog_pars_fragment>

// Fresnel dielétrico exato, luz não polarizada; eta = n2/n1 [Tidewater fresnelDielectric].
float fresnelD(float cosI, float eta) {
  float c = clamp(cosI, 0.0, 1.0);
  float g2 = eta * eta - 1.0 + c * c;
  if (g2 < 0.0) return 1.0; // reflexão total
  float g = sqrt(g2);
  float a = (g - c) / (g + c);
  float b = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);
  return 0.5 * a * a * (b * b + 1.0);
}

void main() {
  // Inclinações e compressão somadas das cascatas, nas coordenadas de Lagrange.
  vec2 slope = vec2(0.0);
  vec2 jac = vec2(0.0);
  float foamDetail = 0.0;
  ${[0, 1, 2, 3].map((c) => `{
    float att = atten(${c}, vDepth);
    vec2 uv = vLag / uSizes[${c}];
    vec4 d = texture(uDeriv[${c}], uv);
    slope += d.xy * att;
    jac += d.zw * att;
    ${c >= 2 ? `foamDetail += texture(uDisp[${c}], uv).w * uFoamW[${c}] * att;` : ''}
  }`).join('\n  ')}
  slope *= uAmp; jac *= uAmp;
  vec4 wk = wakeSample(vLag);
  vec2 s = slope / max(vec2(1.0) + jac, vec2(0.2)) + wk.yz + vShoreSlope;
  foamDetail += wk.w * 0.9;
  vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
  bool below = !gl_FrontFacing;               // câmera debaixo d'água vê a face de trás
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 L = normalize(uSunDir);
  vec3 ambient = uSkyTop * 0.6 + uSunColor * max(L.y, 0.0) * 0.6;
  vec3 scatter = uScatter * ambient * 4.0;     // luz que a coluna d'água espalha de volta

  // espuma: cobertura do vértice + detalhe das cascatas curtas + faixa na beira
  float foam = (vFoam + foamDetail * 0.6) * uFoamAmount;
  // faixa na beira: só onde há água de verdade (> 15 cm), manchada e sobe com as cristas
  float band = (1.0 - smoothstep(0.15, uShoreFoam, vDepth)) * smoothstep(0.05, 0.15, vDepth);
  float swash = sin(vLag.x * 0.9 + uTime * 1.3 + sin(vLag.y * 0.7)) * sin(vLag.y * 1.1 - uTime * 0.9)
              + 0.5 * sin(vLag.x * 2.3 - vLag.y * 1.7 + uTime * 2.1);
  foam += band * 0.55 * smoothstep(0.9, 1.5, swash + (vWorld.y - uLevel) * 2.0);
  float foamMask = smoothstep(0.25, 0.75, clamp(foam, 0.0, 1.2));
  vec3 foamCol = uFoamColor * (0.45 * ambient + 0.6 * uSunColor * max(dot(n, L), 0.0));

  if (below) {
    // Visto de baixo: janela de Snell (céu refratado) e reflexão total fora dela.
    vec3 nb = -n;
    float cosI = max(dot(nb, V), 0.0);
    float F = fresnelD(cosI, 1.0 / uIor);
    vec3 T = refract(-V, nb, uIor);
    vec3 skyT = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, max(-T.y, 0.0)));
    vec3 col = mix(skyT + uSunColor * pow(max(dot(-T, L), 0.0), 200.0) * 2.0, scatter, F);
    col = mix(col, foamCol, foamMask * 0.6);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
    return;
  }

  float cosI = max(dot(n, V), 0.0);
  float F = fresnelD(cosI, uIor);
  if (vSwash > 0.5) F *= 0.35; // lâmina fina do espraiado: quase só transparência (a areia molhada aparece)
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  vec3 refl = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));
  if (uHasRefl > 0.5) {
    vec4 pr = uReflMat * vec4(vWorld.x, uLevel, vWorld.z, 1.0);
    vec2 ruv = pr.xy / pr.w + n.xz * 0.06 * clamp(20.0 / max(dist, 1.0), 0.15, 1.0);
    vec4 rc = texture(uRefl, ruv);
    refl = mix(refl, rc.rgb, 0.92 * smoothstep(0.5, 0.95, rc.a));
  }
  float sp = max(dot(R, L), 0.0);
  vec3 spec = uSunColor * (pow(sp, 600.0) * 8.0 + pow(sp, 60.0) * 0.25);

  // Caminho da vista dentro d'água até o fundo (Beer-Lambert por canal).
  float path = clamp(vDepth / max(V.y, 0.12), 0.0, 80.0) / max(uClarity, 0.05);
  vec3 Tview = exp(-uAbsorb * path);
  // crista iluminada por trás (luz atravessando a onda)
  float sss = pow(max(dot(V, -L), 0.0), 4.0) * max(vWorld.y - uLevel, 0.0) * 0.35;
  vec3 body = scatter * (1.0 - Tview) + uShallow * sss;

  if (uHasFrame > 0.5) {
    // Refração: a imagem do fundo (já desenhada) deslocada pela normal; o resto é o
    // corpo d'água + reflexo. Somas feitas na tela (a cópia já está com tone mapping).
    vec3 waterLin = (refl * F + spec) + body * (1.0 - F);
    waterLin = mix(waterLin, foamCol, foamMask * 0.9);
    gl_FragColor = vec4(waterLin, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    vec2 suv = gl_FragCoord.xy / uRes;
    vec2 off = n.xz * uRefr * min(vDepth, 4.0) * clamp(30.0 / max(dist, 1.0), 0.1, 1.0);
    vec3 seen = texture(uFrame, clamp(suv + off, vec2(0.001), vec2(0.999))).rgb;
    gl_FragColor.rgb += seen * Tview * (1.0 - F) * (1.0 - foamMask * 0.9);
    #include <fog_fragment>
    return;
  }

  // Sem cópia da tela (MSAA no pós-processamento): mistura por transparência, como antes.
  vec3 col = mix(body + uDeep * Tview, refl, F) + spec;
  col = mix(col, foamCol, foamMask * 0.9);
  float alpha = mix(1.0 - dot(Tview, vec3(0.333)), 1.0, max(F, foamMask));
  gl_FragColor = vec4(col, clamp(alpha, 0.55, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function WORLD_LEVEL() {
  return WORLD.waterLevel.toFixed(3);
}

// ------------------------------------------------------------------ água antiga (sem FFT)

const FLAT_VERT = /* glsl */ `
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FLAT_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uSkyTop, uSkyHorizon, uDeep, uShallow;
varying vec3 vWorld;
#include <fog_pars_fragment>

// Gradiente de uma onda direcional.
vec2 wave(vec2 p, vec2 dir, float freq, float amp, float speed) {
  float ph = dot(p, dir) * freq + uTime * speed;
  return dir * cos(ph) * amp * freq;
}

void main() {
  vec2 p = vWorld.xz;
  vec2 g = vec2(0.0);
  g += wave(p, normalize(vec2(1.0, 0.3)), 0.11, 0.25, 1.1);
  g += wave(p, normalize(vec2(-0.4, 1.0)), 0.17, 0.14, 1.5);
  g += wave(p, normalize(vec2(0.7, -0.8)), 0.43, 0.05, 2.3);
  g += wave(p, normalize(vec2(-0.9, -0.2)), 0.91, 0.022, 3.1);
  g += wave(p, normalize(vec2(0.2, 0.95)), 1.73, 0.010, 4.0);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));

  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fresnel = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));

  float dist = length(cameraPosition - vWorld);
  vec3 body = mix(uShallow, uDeep, smoothstep(5.0, 120.0, dist) * 0.6 + 0.4 * (1.0 - ndv));
  vec3 col = mix(body, sky, fresnel);

  float s = max(dot(R, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 600.0) * 8.0 + pow(s, 60.0) * 0.25);

  gl_FragColor = vec4(col, mix(0.78, 0.97, fresnel));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
