import * as THREE from 'three';
import { WORLD } from '../config/worldConfig.js';
import { OCEAN } from '../config/ocean.js';
import { OceanSimulation } from '../render/ocean/OceanSimulation.js';
import { buildOceanGrid } from '../render/ocean/OceanGrid.js';

/**
 * Água única (mar, lago e rios) no nível 0.
 *
 * Com WebGL2 + float render targets: **oceano FFT** (Etapa A1, porte do Tidewater) —
 * malha em anéis em volta da câmera, deslocada pelas 4 cascatas; normais e espuma pelas
 * derivadas e pelo Jacobiano; ondas longas somem no raso (textura de profundidade do fundo).
 * Sem suporte: a água antiga (plano com normais de senóides).
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
    this.uniforms.uDisp.value = this.ocean.displacement;
    this.uniforms.uDeriv.value = this.ocean.derivatives;
    this.uniforms.uAmp.value = this.cfg.amplitude;
    if (camera) { this.mesh.position.x = camera.position.x; this.mesh.position.z = camera.position.z; }
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

float seaDepth(vec2 xz) {
  vec2 uv = (xz - uDepthRect.xy) / uDepthRect.zw;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 500.0;
  return texture(uDepthTex, uv).r;
}
// Atenuação por cascata no raso [Tidewater waterSurfaceCascadeAttenuation].
float atten(int c, float depth) {
  float a = smoothstep(0.0, uD0[c], depth);
  return mix(uFloor[c] * smoothstep(0.0, 0.6, depth), 1.0, a);
}
`;

const FFT_VERT = /* glsl */ `
attribute float aSpacing;
varying vec3 vWorld;
varying vec2 vLag;
varying float vDepth;
varying float vFoam;
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
varying vec3 vWorld;
varying vec2 vLag;
varying float vDepth;
varying float vFoam;
${COMMON}
#include <fog_pars_fragment>
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
  vec2 s = slope / max(vec2(1.0) + jac, vec2(0.2));
  vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
  if (!gl_FrontFacing) n = -n;

  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = max(dot(n, V), 0.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, n);
  R.y = abs(R.y);
  vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.6, R.y));

  float dist = length(cameraPosition - vWorld);
  // raso mais claro/esverdeado; fundo azul-escuro (A2 troca por refração de verdade)
  float shallowK = 1.0 - smoothstep(0.5, 12.0 * uClarity, vDepth);
  vec3 body = mix(uDeep, uShallow, max(shallowK, 0.25 * (1.0 - smoothstep(5.0, 160.0, dist))));
  // crista iluminada por trás (luz atravessando a onda)
  float sss = pow(max(dot(V, -normalize(uSunDir)), 0.0), 4.0) * max(vWorld.y - ${WORLD_LEVEL()}, 0.0) * 0.35;
  body += uShallow * sss;
  vec3 col = mix(body, sky, fresnel);

  float sp = max(dot(R, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sp, 600.0) * 8.0 + pow(sp, 60.0) * 0.25);

  // espuma: cobertura do vértice + detalhe das cascatas curtas, borda suave
  float foam = clamp((vFoam + foamDetail * 0.6) * uFoamAmount, 0.0, 1.2);
  float foamMask = smoothstep(0.25, 0.75, foam);
  col = mix(col, uFoamColor * (0.55 + 0.45 * max(dot(n, normalize(uSunDir)), 0.0)) + sky * 0.1, foamMask * 0.9);

  float alpha = mix(mix(0.72, 0.95, smoothstep(0.0, 6.0 * uClarity, vDepth)), 1.0, max(fresnel, foamMask));
  gl_FragColor = vec4(col, alpha);
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
