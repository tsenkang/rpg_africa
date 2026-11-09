import * as THREE from 'three';
import { WORLD } from '../config/worldConfig.js';

/**
 * Água única (mar, lago e rios) no nível 0.
 * Shader próprio: ondas por soma de senóides, reflexo do céu (Fresnel)
 * e brilho especular do sol. Compatível com a neblina do Three.js.
 */
export class Water {
  constructor() {
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
      },
    ]);

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      transparent: true,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
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
      `,
    });

    const size = Math.max(WORLD.width, WORLD.depth) * 4;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
  }

  update(time, env) {
    this.uniforms.uTime.value = time;
    this.uniforms.uSunDir.value.copy(env.sunDir);
    this.uniforms.uSunColor.value.copy(env.state.sunColor).multiplyScalar(Math.min(1, env.state.sunIntensity / 3));
    this.uniforms.uSkyTop.value.copy(env.state.skyTop);
    this.uniforms.uSkyHorizon.value.copy(env.state.skyHorizon);
  }
}
