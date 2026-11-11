import * as THREE from 'three';

/**
 * Cáusticas por splatting de fótons (Etapa A2) — mesma técnica do `Caustics.js` do Tidewater
 * (que segue o "WebGL Water" de Evan Wallace).
 *
 * Uma malha fina cobre um ladrilho da cascata `cascade` (mais uma margem: o ladrilho se repete,
 * então a margem é a superfície dos vizinhos). Cada vértice é um ponto da onda real; o raio de
 * sol é refratado pela normal ali e seguido até um plano `D` m abaixo, onde o vértice é colocado.
 * O fragmento escreve (área na superfície / área no fundo) com mistura aditiva — exatamente a
 * concentração de luz: dobras que focam viram as redes claras. Dois planos focais (R = raso,
 * G = fundo), misturados pela profundidade real na hora de usar. Média ≈ 1.
 *
 * @example
 *   const caustics = new Caustics(renderer, water);
 *   caustics.update(sunDir);            // depois do oceano
 *   terrainShader.uniforms.uCaustics.value = caustics.texture;
 */
export class Caustics {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ uniforms: object }} water
   * @param {{ cascade?: number, res?: number, grid?: number, depths?: [number, number], margin?: number }} [o]
   */
  constructor(renderer, water, { cascade = 2, res = 256, grid = 192, depths = [1.5, 6], margin = 0.25 } = {}) {
    this.renderer = renderer;
    this.cascade = cascade;
    this.depths = depths;
    this.target = new THREE.WebGLRenderTarget(res, res, {
      type: THREE.HalfFloatType, depthBuffer: false,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
    });
    this.target.texture.wrapS = this.target.texture.wrapT = THREE.RepeatWrapping;
    this.tile = water.uniforms.uSizes.value.getComponent(cascade);
    // grade em [-margin, 1 + margin]² do ladrilho
    const n = Math.ceil(grid * (1 + 2 * margin));
    const geo = new THREE.PlaneGeometry(1 + 2 * margin, 1 + 2 * margin, n, n);
    geo.translate(0.5, 0.5, 0);
    const u = water.uniforms;
    this.uniforms = {
      uDisp: { value: null }, uDeriv: { value: null },
      uTile: { value: this.tile }, uAmp: u.uAmp,
      uSun: { value: new THREE.Vector3(0, -1, 0) },
      uDepth: { value: depths[0] },
      uChannel: { value: new THREE.Vector4(1, 0, 0, 0) },
      uCell: { value: this.tile / grid },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform sampler2D uDisp, uDeriv; uniform float uTile, uAmp, uDepth; uniform vec3 uSun;
        varying vec2 vOld; varying vec2 vNew;
        void main() {
          vec2 uv = position.xy;                 // fração do ladrilho (com margem)
          vec4 d = textureLod(uDisp, uv, 0.0);
          vec4 g = textureLod(uDeriv, uv, 0.0);
          vec2 s = g.xy * uAmp / max(vec2(1.0) + g.zw * uAmp, vec2(0.2));
          vec3 n = normalize(vec3(-s.x, 1.0, -s.y));
          vec3 P = vec3(uv * uTile + d.xz * uAmp, d.y * uAmp);
          vec3 r = refract(normalize(uSun), n, 1.0 / 1.333);
          float t = (P.z + uDepth) / max(-r.y, 0.05);
          vec2 land = P.xy + r.xz * t;
          vOld = uv * uTile;
          vNew = land;
          vec2 ndc = (land / uTile) * 2.0 - 1.0;
          gl_Position = vec4(ndc, 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec4 uChannel; uniform float uCell;
        varying vec2 vOld; varying vec2 vNew;
        void main() {
          float oldArea = length(dFdx(vOld)) * length(dFdy(vOld));
          float newArea = length(dFdx(vNew)) * length(dFdy(vNew));
          float ratio = oldArea / max(newArea, oldArea * 0.02);
          gl_FragColor = uChannel * ratio;
        }`,
      blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Textura das cáusticas (R: raso, G: fundo), repete a cada `tile` m. */
  get texture() {
    return this.target.texture;
  }

  /**
   * @param {THREE.Vector3} sunDir direção PARA o sol (normalizada)
   * @param {{ displacement: THREE.Texture[], derivatives: THREE.Texture[] }} ocean
   */
  update(sunDir, ocean) {
    const r = this.renderer, prev = r.getRenderTarget(), auto = r.autoClear, cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
    this.uniforms.uDisp.value = ocean.displacement[this.cascade];
    this.uniforms.uDeriv.value = ocean.derivatives[this.cascade];
    this.uniforms.uSun.value.copy(sunDir).negate();
    if (this.uniforms.uSun.value.y > -0.05) this.uniforms.uSun.value.y = -0.05; // sol baixo: raio quase rasante
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.autoClear = false;
    r.clear(true, false, false);
    this.depths.forEach((D, i) => {
      this.uniforms.uDepth.value = D;
      this.uniforms.uChannel.value.set(i === 0 ? 1 : 0, i === 1 ? 1 : 0, 0, 0);
      r.render(this.scene, this.camera);
    });
    r.setRenderTarget(prev);
    r.setClearColor(cc, ca);
    r.autoClear = auto;
  }
}
