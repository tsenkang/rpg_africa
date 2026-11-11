import * as THREE from 'three';

export const MAX_QUERIES = 64;

/**
 * Altura da água em pontos do mundo, calculada na GPU e lida de volta sem travar (Etapa A2).
 *
 * Porte do `WaterQuery.js` do Tidewater para WebGL2:
 *  - um passe desenha 64×1 pixels; cada pixel resolve a altura **euleriana** num ponto:
 *    o deslocamento da FFT é lagrangiano (x0 → x0 + D(x0)), então acha x0 com 2 iterações
 *    de ponto fixo x0 = p − D(x0).xz e devolve nível + D(x0).y [Tidewater];
 *  - a leitura é assíncrona (PBO + fence do WebGL2, conferido a cada quadro sem esperar):
 *    o resultado chega 1–3 quadros depois. `rate` (dh/dt) permite extrapolar até lá.
 * Slot 0 é sempre a câmera (água acima/abaixo da lente). Os outros são da física (casco do barco…).
 *
 * Saída por slot: (altura, profundidade do fundo, espuma, —).
 *
 * @example
 *   const q = new WaterQuery(renderer, water);
 *   const slot = q.alloc();            // reserva um ponto
 *   q.set(slot, x, z);                 // a cada quadro
 *   q.update(time);                    // depois do oceano
 *   const h = q.height(slot);          // última altura conhecida (m)
 */
export class WaterQuery {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ uniforms: object }} water `Water` (texturas e uniforms do oceano)
   * @param {number} [level] nível médio da água
   */
  constructor(renderer, water, level = 0) {
    this.renderer = renderer;
    this.level = level;
    this.inputs = new THREE.DataTexture(new Float32Array(MAX_QUERIES * 4), MAX_QUERIES, 1, THREE.RGBAFormat, THREE.FloatType);
    this.inputs.minFilter = this.inputs.magFilter = THREE.NearestFilter;
    this.target = new THREE.WebGLRenderTarget(MAX_QUERIES, 1, { type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.results = new Float32Array(MAX_QUERIES * 4);
    this.prev = new Float32Array(MAX_QUERIES * 4);
    this.rates = new Float32Array(MAX_QUERIES);
    this.resultTime = 0;
    this.prevTime = 0;
    this.version = 0;
    this.valid = false;
    this.used = 1;
    this.pending = false;
    this._buf = new Float32Array(MAX_QUERIES * 4);
    for (let i = 0; i < MAX_QUERIES; i++) this.results[i * 4] = level;
    const u = water.uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uPoints: { value: this.inputs }, uLevel: { value: level },
        uDisp: u.uDisp, uSizes: u.uSizes, uD0: u.uD0, uFloor: u.uFloor, uFoamW: u.uFoamW,
        uAmp: u.uAmp, uDepthTex: u.uDepthTex, uDepthRect: u.uDepthRect, uTexel: u.uTexel, uDeriv: u.uDeriv,
      },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uPoints; uniform float uLevel;
        uniform sampler2D uDisp[4]; uniform sampler2D uDeriv[4];
        uniform vec4 uSizes, uD0, uFloor, uFoamW, uTexel, uDepthRect; uniform float uAmp; uniform sampler2D uDepthTex;
        float seaDepth(vec2 xz) {
          vec2 uv = (xz - uDepthRect.xy) / uDepthRect.zw;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 500.0;
          return texture(uDepthTex, uv).r;
        }
        float atten(int c, float depth) {
          float a = smoothstep(0.0, uD0[c], depth);
          return mix(uFloor[c] * smoothstep(0.0, 0.6, depth), 1.0, a);
        }
        vec4 dispAt(vec2 x0, float depth) {
          vec4 d = vec4(0.0);
          ${[0, 1, 2, 3].map((c) => `{ vec4 s = textureLod(uDisp[${c}], x0 / uSizes[${c}], ${c === 3 ? '2.0' : '0.0'}); d.xyz += s.xyz * atten(${c}, depth); d.w += s.w * uFoamW[${c}] * atten(${c}, depth); }`).join('\n          ')}
          d.xyz *= uAmp;
          return d;
        }
        void main() {
          vec2 p = texelFetch(uPoints, ivec2(gl_FragCoord.x, 0), 0).xy;
          float depth = seaDepth(p);
          vec2 x0 = p;
          for (int i = 0; i < 2; i++) x0 = p - dispAt(x0, depth).xz;
          vec4 d = dispAt(x0, depth);
          gl_FragColor = vec4(uLevel + d.y, depth, d.w, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.scene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Reserva um slot (1..63). */
  alloc() {
    if (this.used >= MAX_QUERIES) throw new Error('WaterQuery: sem slots livres');
    return this.used++;
  }

  /** Ponto do slot neste quadro. */
  set(slot, x, z) {
    const d = this.inputs.image.data;
    d[slot * 4] = x; d[slot * 4 + 1] = z;
  }

  /** Última altura conhecida no slot, extrapolada com dh/dt até `time` (no máx. 0,12 s). */
  height(slot, time = this.resultTime) {
    const dt = Math.min(0.12, Math.max(0, time - this.resultTime));
    return this.results[slot * 4] + this.rates[slot] * dt;
  }

  /** Profundidade do fundo no slot (m). */
  depth(slot) {
    return this.results[slot * 4 + 1];
  }

  /** Espuma no slot (0..~1). */
  foam(slot) {
    return this.results[slot * 4 + 2];
  }

  /**
   * Roda o passe e pede a leitura (uma por vez). Chamar depois de atualizar o oceano.
   * @param {number} time s (tempo do oceano)
   */
  update(time) {
    this.inputs.needsUpdate = true;
    const r = this.renderer, gl = r.getContext();
    if (this.pending) {
      // resultado anterior pronto? (sem esperar: timeout 0)
      const st = gl.clientWaitSync(this._sync, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) { this._waits++; if (this._waits < 30) return; }
      if (st === gl.WAIT_FAILED) { this.pending = false; return; }
      gl.deleteSync(this._sync);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this._buf);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.receive(this._buf, this._issued);
      this.pending = false;
    }
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    // PBO + fence (WebGL2): a GPU copia para o buffer e avisa quando terminar.
    if (!this._pbo) {
      this._pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, MAX_QUERIES * 16, gl.STREAM_READ);
    }
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this._pbo);
    gl.readPixels(0, 0, MAX_QUERIES, 1, gl.RGBA, gl.FLOAT, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    r.setRenderTarget(prev);
    this._sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    this._issued = time;
    this._waits = 0;
    this.pending = true;
  }

  /** Guarda um resultado e estima dh/dt por slot. */
  receive(buf, issued) {
    this.prev.set(this.results);
    this.results.set(buf);
    const span = issued - this.resultTime;
    if (this.valid && span > 1e-3) for (let i = 0; i < this.used; i++) this.rates[i] = (this.results[i * 4] - this.prev[i * 4]) / span;
    this.prevTime = this.resultTime;
    this.resultTime = issued;
    this.valid = true;
    this.version++;
  }
}
