import * as THREE from 'three';
import { MATERIAL_PROFILES, WETNESS, GLINT } from '../../config/lighting.js';
import { WEATHER } from '../../config/weather.js';
import { BIOMES } from '../../config/biomes.js';

/**
 * Materiais PBR do jogo (Etapa L2): perfis por superfície e efeitos de superfície no shader.
 *
 * Não troca materiais (as texturas procedurais ficam): ajusta metalness/rugosidade pelos
 * perfis e injeta um trecho no fragment shader padrão do Three.js (logo depois das normais,
 * antes da luz), encadeado com os `onBeforeCompile` que já existirem:
 *  - **veios polidos** (pedra negra de Kaelen): faixas finas lisas e metálicas no mundo;
 *  - **gelo** (taiga): rugosidade variando por manchas, reflexo nítido nas placas;
 *  - **micro-brilho** (areia, neve): micro-facetas lisas com normal aleatória que pegam o sol
 *    e cintilam conforme a câmera anda (brilho de verdade, pela luz direta);
 *  - **molhado** (chuva): escurece o albedo, baixa a rugosidade (verniz d'água, que reflete o
 *    céu pelo IBL), paredes menos que o chão, **poças** espelhadas no plano.
 * Uniforms compartilhados por todos: um quadro de chuva atualiza o mundo inteiro.
 *
 * @example
 *   const mf = new MaterialFactory();
 *   mf.applyLibrary(materials);              // perfis + molhado nos materiais das construções
 *   mf.install(terrain.material, { wet: true, glint: true });
 *   mf.update(dt, weather);                  // a cada quadro
 */
export class MaterialFactory {
  constructor() {
    this.uniforms = { uWet: { value: 0 } };
    this.wet = 0;
    /** Bioma i molha? (precipitação em riscos rápidos = chuva) */
    this.rainy = BIOMES.map((bio) => WEATHER[bio.id]).map((b) => (b?.particles ?? []).some((p) => p.shape === 'streak' && p.fall >= WETNESS.rainFall));
  }

  /** Perfis + molhado nos materiais compartilhados das construções. */
  applyLibrary(M) {
    const profiled = new Set();
    for (const [, prof] of Object.entries(MATERIAL_PROFILES)) {
      for (const key of prof.keys) {
        const m = M[key];
        if (!m) continue;
        const o = { ...prof, ...(prof.overrides?.[key] ?? {}) };
        if (o.metalness !== undefined) m.metalness = o.metalness;
        if (o.roughness !== undefined) m.roughness = o.roughness;
        if (o.envMapIntensity !== undefined) m.envMapIntensity = o.envMapIntensity;
        this.install(m, { ...(o.surface ?? {}), wet: !WETNESS.skip.includes(key) });
        profiled.add(key);
      }
    }
    for (const [key, m] of Object.entries(M)) {
      // emissivo de verdade = cor emissiva acesa (o emissiveIntensity padrão do Three.js já é 1)
      const glowing = m?.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0.2;
      if (profiled.has(key) || !m?.isMeshStandardMaterial || WETNESS.skip.includes(key) || m.transparent || glowing) continue;
      this.install(m, { wet: true });
    }
  }

  /**
   * Injeta os efeitos no material (encadeia o `onBeforeCompile` existente).
   * @param {THREE.MeshStandardMaterial} material
   * @param {{ wet?: boolean, veins?: boolean, ice?: boolean, glint?: boolean, porous?: number }} f
   */
  install(material, f) {
    const defs = [f.wet && 'SURF_WET', f.veins && 'SURF_VEINS', f.ice && 'SURF_ICE', f.glint && 'SURF_GLINT'].filter(Boolean);
    if (!defs.length) return material;
    const prev = material.onBeforeCompile?.bind(material);
    const prevKey = material.customProgramCacheKey?.bind(material);
    const U = this.uniforms;
    material.onBeforeCompile = (shader, renderer) => {
      prev?.(shader, renderer);
      shader.uniforms.uWet = U.uWet;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vSfW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvSfW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${defs.map((d) => `#define ${d}`).join('\n')}\nvarying vec3 vSfW;\nuniform float uWet;\n${SURFACE_GLSL}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${SURFACE_APPLY}`);
    };
    material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|surf:${defs.join(',')}|${material.uuid}`;
    material.needsUpdate = true;
    return material;
  }

  /**
   * Umidade do mundo pela chuva nos biomas em volta do jogador.
   * @param {number} dt
   * @param {{ eff?: Float32Array|number[], indoor?: boolean }} weather WeatherManager
   */
  update(dt, weather) {
    let rain = 0;
    const eff = weather?.eff ?? [];
    for (let i = 0; i < eff.length; i++) if (this.rainy[i]) rain += eff[i];
    rain = Math.min(1, rain * 1.4);
    const rate = rain > this.wet ? WETNESS.wetUp : WETNESS.dryDown;
    this.wet += Math.max(-rate * dt, Math.min(rate * dt, rain - this.wet));
    this.uniforms.uWet.value = this.wet;
  }
}

const P = WETNESS.puddles;
const SURFACE_GLSL = /* glsl */ `
float sfHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = sfHash(vec3(i, 1.0)), b = sfHash(vec3(i + vec2(1.0, 0.0), 1.0)), c = sfHash(vec3(i + vec2(0.0, 1.0), 1.0)), d = sfHash(vec3(i + 1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

const SURFACE_APPLY = /* glsl */ `
{
  vec3 sfN = inverseTransformDirection(normal, viewMatrix); // normal no mundo
  float sfUp = clamp(sfN.y, 0.0, 1.0);
#ifdef SURF_VEINS
  // veios finos que cortam a pedra em direções oblíquas: lisos, metálicos, mais escuros e frios
  float sfV = abs(sin(dot(vSfW, vec3(0.73, 0.21, 0.55)) * 3.2 + sin(vSfW.y * 2.3 + vSfW.x * 1.3) * 1.6 + sfNoise(vSfW.xz * 1.6 + vSfW.y) * 2.5));
  float sfV2 = abs(sin(dot(vSfW, vec3(-0.31, 0.62, 0.72)) * 5.1 + sfNoise(vSfW.zy * 2.1) * 3.4));
  // duas famílias de veios em direções diferentes (a segunda mais fina e rara)
  float sfVein = max(1.0 - smoothstep(0.04, 0.16, sfV), (1.0 - smoothstep(0.02, 0.08, sfV2)) * step(0.55, sfNoise(vSfW.xz * 0.8)));
  // veio polido: liso e metálico, tom de obsidiana/hematita (reflete o céu e o sol com nitidez)
  roughnessFactor = mix(roughnessFactor, 0.08, sfVein);
  metalnessFactor = mix(metalnessFactor, 0.85, sfVein);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.52, 0.6), sfVein * 0.8);
#endif
#ifdef SURF_ICE
  // gelo: placas lisas (reflexo nítido) e manchas foscas de neve
  float sfIce = sfNoise(vSfW.xz * 2.6 + vSfW.y * 1.7);
  roughnessFactor = mix(0.05, 0.55, smoothstep(0.35, 0.75, sfIce));
  metalnessFactor = 0.0;
#endif
#ifdef SURF_GLINT
  // micro-facetas: poucas, lisas, com normal sorteada — pegam o sol e cintilam
  float sfLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float sfSand = smoothstep(${GLINT.sandMin.toFixed(2)}, 0.75, sfLum) * (1.0 - smoothstep(0.08, 0.2, diffuseColor.g - diffuseColor.r)); // claro e não verde
  vec3 sfCell = floor(vSfW * ${GLINT.scale.toFixed(1)});
  float sfG = sfHash(sfCell);
  if (sfG < ${GLINT.density.toFixed(4)} * sfSand * sfUp) {
    vec3 sfR = vec3(sfHash(sfCell + 7.1), sfHash(sfCell + 3.3), sfHash(sfCell + 5.7)) * 2.0 - 1.0;
    normal = normalize(normal + (viewMatrix * vec4(sfR * 0.6, 0.0)).xyz);
    roughnessFactor = 0.04;
  }
#endif
#ifdef SURF_WET
  if (uWet > 0.001) {
    float sfW = uWet * mix(${WETNESS.vertical.toFixed(2)}, 1.0, sfUp);
    diffuseColor.rgb *= mix(1.0, ${WETNESS.darken.toFixed(2)}, sfW);
    roughnessFactor = mix(roughnessFactor, ${WETNESS.roughness.toFixed(2)}, sfW * 0.85);
    // poças: só no plano, onde o "chão" é mais baixo (ruído), com a chuva já forte
    float sfPud = smoothstep(${P.threshold.toFixed(2)}, ${(P.threshold + 0.08).toFixed(2)}, sfNoise(vSfW.xz * ${P.scale.toFixed(2)}))
                * smoothstep(0.96, 0.99, sfUp) * smoothstep(${P.minWet.toFixed(2)}, 1.0, uWet);
    roughnessFactor = mix(roughnessFactor, 0.02, sfPud);
    diffuseColor.rgb *= mix(1.0, 0.7, sfPud);
    normal = normalize(mix(normal, (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz, sfPud));
  }
#endif
}
`;
