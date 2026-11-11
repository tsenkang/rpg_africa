import * as THREE from 'three';

/**
 * Luz debaixo d'água nos materiais do cenário (Etapa A2) — adaptação do
 * `UnderwaterLighting.js` do Tidewater para materiais padrão do Three.js.
 *
 * Para cada fragmento abaixo do nível da água:
 *  - a luz do sol chega atenuada pelo caminho refratado na coluna d'água
 *    (Beer-Lambert por canal: o vermelho some primeiro) e modulada pelas **cáusticas**;
 *  - a luz ambiente chega atenuada e tingida pela profundidade.
 * Aproximação (diferente do original): o Three.js já somou sol e ambiente em `outgoingLight`,
 * então a modulação é uma mistura das duas pela fração de luz direta do momento (`uSunShare`).
 * O nível usado é o médio (o original assa a altura das ondas longas num mapa).
 *
 * @example
 *   const uw = new UnderwaterLighting(water, caustics);
 *   uw.install(terrain.mesh.material);  // encadeia o onBeforeCompile que já existir
 *   uw.update(env);                     // a cada quadro
 */
export class UnderwaterLighting {
  /**
   * @param {{ cfg: object }} water
   * @param {{ texture: THREE.Texture, tile: number, depths: number[] }} caustics
   */
  constructor(water, caustics, level = 0) {
    const o = water.cfg.optics;
    this.uniforms = {
      uUwLevel: { value: level },
      uUwAbsorb: { value: new THREE.Vector3(...o.absorption) },
      uUwCaustics: { value: caustics?.texture ?? null },
      uUwTile: { value: caustics?.tile ?? 33.3 },
      uUwDepths: { value: new THREE.Vector2(...(caustics?.depths ?? [1.5, 6])) },
      uUwCausticK: { value: caustics ? o.causticStrength : 0 },
      uUwSunShare: { value: 0.6 },
      uUwSunCos: { value: 1 },
    };
  }

  /** Encadeia o gancho no `onBeforeCompile` do material. */
  install(material) {
    const prev = material.onBeforeCompile?.bind(material);
    const U = this.uniforms;
    material.onBeforeCompile = (shader, renderer) => {
      prev?.(shader, renderer);
      Object.assign(shader.uniforms, U);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vUwWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvUwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vUwWorld;
uniform float uUwLevel, uUwTile, uUwCausticK, uUwSunShare, uUwSunCos;
uniform vec3 uUwAbsorb; uniform vec2 uUwDepths; uniform sampler2D uUwCaustics;`)
        .replace('#include <opaque_fragment>', `{
  float below = uUwLevel - vUwWorld.y;
  if (below > 0.0) {
    vec3 Tsun = exp(-uUwAbsorb * below / max(uUwSunCos, 0.25));
    vec3 Tamb = exp(-uUwAbsorb * below * 1.6);
    vec4 cs = texture2D(uUwCaustics, vUwWorld.xz / uUwTile);
    float c = mix(cs.r, cs.g, smoothstep(uUwDepths.x, uUwDepths.y, below));
    c = mix(1.0, c, uUwCausticK * smoothstep(0.0, 0.5, below));
    outgoingLight *= mix(Tamb, Tsun * c, uUwSunShare);
  }
}
#include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => 'uw-' + material.uuid;
    material.needsUpdate = true;
  }

  /**
   * @param {{ sunDir: THREE.Vector3, state: { sunIntensity: number } }} env
   */
  update(env) {
    // fração de luz direta (sol alto e forte → mais)
    const sun = Math.max(0, env.sunDir.y);
    this.uniforms.uUwSunShare.value = Math.min(0.8, (env.state.sunIntensity / 3) * Math.min(1, sun * 3)) ;
    // cos do raio de sol refratado (Snell): sen θt = sen θi / 1,333
    const sinI = Math.sqrt(Math.max(0, 1 - sun * sun)), sinT = sinI / 1.333;
    this.uniforms.uUwSunCos.value = Math.sqrt(1 - sinT * sinT);
  }
}
