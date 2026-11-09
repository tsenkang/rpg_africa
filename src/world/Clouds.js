import * as THREE from 'three';
import { CLOUDS } from '../config/sky.js';
import { mulberry32 } from './Noise.js';

/**
 * Camada de nuvens: ~500 tufos num único InstancedMesh (1 draw call).
 * Tudo acontece na GPU: o tufo vira de frente para a câmera (billboard),
 * anda com o vento e, ao sair do quadrado em volta da câmera, reaparece do
 * outro lado (módulo) — nenhum cálculo por tufo na CPU.
 * Iluminação simples: topo claro na cor do sol, base acinzentada na cor do
 * horizonte; a neblina do Three.js apaga as nuvens distantes.
 *
 * @example
 * const clouds = new Clouds({ seed: 7 });
 * scene.add(clouds.mesh);
 * clouds.update(dt, environment, weather.overcast); // a cada quadro
 */
export class Clouds {
  /** @param {{ seed?: number }} [o] */
  constructor({ seed = 4242 } = {}) {
    const rnd = mulberry32(seed);
    const C = CLOUDS;
    const puffs = [];
    for (let c = 0; c < C.count; c++) {
      const cx = (rnd() - 0.5) * C.area, cz = (rnd() - 0.5) * C.area;
      const cy = C.altitude[0] + rnd() * (C.altitude[1] - C.altitude[0]);
      const n = C.puffs[0] + Math.floor(rnd() * (C.puffs[1] - C.puffs[0] + 1));
      const stretch = 1 + rnd() * 1.2; // nuvens alongadas no sentido do vento
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, r = C.spread[0] + rnd() * (C.spread[1] - C.spread[0]);
        puffs.push({
          x: cx + Math.cos(a) * r * stretch, y: cy + (rnd() - 0.3) * 40, z: cz + Math.sin(a) * r,
          s: C.puffSize[0] + rnd() * (C.puffSize[1] - C.puffSize[0]), seed: rnd(),
        });
      }
    }
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    const base = new Float32Array(puffs.length * 4);
    puffs.forEach((p, i) => base.set([p.x, p.y, p.z, p.s + p.seed * 0.001], i * 4));
    geo.setAttribute('aBase', new THREE.InstancedBufferAttribute(base, 4));
    geo.instanceCount = puffs.length;

    this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uMap: { value: makePuffTexture(seed) },
      uWind: { value: new THREE.Vector2() },
      uArea: { value: C.area },
      uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.7, 0.72, 0.76) },
      uOpacity: { value: C.opacity },
    }]);
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -0.5; // logo depois do céu
    this.mesh.name = 'clouds';
    this.wind = new THREE.Vector2();
    this.count = puffs.length;
  }

  /**
   * @param {number} dt s
   * @param {import('./Environment.js').Environment} env cores do sol/céu
   * @param {number} [overcast] 0..1 (WeatherManager.overcast): tempo fechado
   */
  update(dt, env, overcast = 0) {
    this.wind.x += CLOUDS.wind.x * dt;
    this.wind.y += CLOUDS.wind.z * dt;
    this.uniforms.uWind.value.copy(this.wind);
    const s = env.state;
    const light = Math.min(1.2, s.sunIntensity / 3);
    this.uniforms.uLit.value.copy(s.sunColor).multiplyScalar(0.55 + 0.5 * light).lerp(s.skyHorizon, 0.15);
    this.uniforms.uShade.value.copy(s.skyHorizon).multiplyScalar(0.72);
    const dark = 1 - overcast * CLOUDS.overcastDarken;
    this.uniforms.uLit.value.multiplyScalar(dark);
    this.uniforms.uShade.value.multiplyScalar(dark);
    this.uniforms.uOpacity.value = Math.min(1, CLOUDS.opacity + overcast * 0.2);
  }
}

/** Tufo macio: manchas radiais sobrepostas num canvas (sem imagem externa). */
function makePuffTexture(seed) {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const c = canvas.getContext('2d');
  const rnd = mulberry32(seed ^ 0x9e37);
  for (let i = 0; i < 26; i++) {
    const r = S * (0.12 + rnd() * 0.2);
    const a = rnd() * Math.PI * 2, d = rnd() * S * 0.24;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.7;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // só o alfa importa
  return tex;
}

const VERT = /* glsl */ `
  attribute vec4 aBase; // xyz = posição inicial, w = tamanho
  uniform vec2 uWind;
  uniform float uArea;
  varying vec2 vUv;
  varying float vFade;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec3 c = aBase.xyz;
    vec3 cam = cameraPosition;
    // Anda com o vento e dá a volta no quadrado em volta da câmera.
    vec2 rel = mod(c.xz + uWind - cam.xz + uArea * 0.5, uArea) - uArea * 0.5;
    c.xz = cam.xz + rel;
    vFade = 1.0 - smoothstep(uArea * 0.36, uArea * 0.5, length(rel));
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float s = aBase.w;
    vec3 world = c + (right * position.x + up * position.y * 0.6) * s;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uLit, uShade;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vFade;
  #include <fog_pars_fragment>
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity * vFade;
    if (a < 0.01) discard;
    vec3 col = mix(uShade, uLit, smoothstep(0.15, 0.85, vUv.y)); // topo iluminado
    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
