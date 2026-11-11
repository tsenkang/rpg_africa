import * as THREE from 'three';
import { WAKE } from '../../config/ocean.js';

/**
 * Spray do barco (Etapa A4), inspirado no `BoatSpray.js` do Tidewater: cada fonte tem um
 * limiar de velocidade; acima dele lança gotas proporcionalmente ao excesso.
 *  - **proa**: pontos de contato dos dois lados, gotas para fora e para cima (mais rápido = mais alto);
 *  - **popa**: a hélice levanta borrifo baixo quando acelera (rotação alta, barco ainda lento) ou em ré.
 * Gotas balísticas na CPU (pool fixo, sem alocar), desenhadas como pontos macios.
 *
 * @example
 *   const spray = new BoatSpray(scene);
 *   spray.update(dt, boatPhysics, waterHeight);
 */
export class BoatSpray {
  constructor(scene, cfg = WAKE.spray) {
    this.cfg = cfg;
    const n = cfg.max;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.next = 0;
    this.acc = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: cfg.size * 260 } },
      vertexShader: `attribute float aAlpha; varying float vA; uniform float uSize;
        void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize / max(-mv.z, 0.5); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0), vA * (1.0 - r * 4.0)); }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.userData.noCollide = true;
    scene.add(this.points);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    // pontos de contato na proa (referencial do barco)
    this.bow = [2.0, 2.6, 3.2].flatMap((z) => [1, -1].map((s) => ({ z, s, hb: halfBeamAt(z) })));
  }

  emit(x, y, z, vx, vy, vz) {
    const i = this.next, k = i * 3;
    this.next = (this.next + 1) % this.cfg.max;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.life[i] = this.cfg.life * (0.6 + Math.random() * 0.6);
  }

  /**
   * @param {number} dt
   * @param {object} boat BoatPhysics
   * @param {(x:number, z:number) => number} water altura da água
   */
  update(dt, boat, water) {
    const c = this.cfg, q = boat.renderQuaternion, P = boat.renderPosition;
    const yaw = boat.angles().yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
    const spd = Math.abs(boat.speed);
    // proa: excesso de velocidade acima do limiar (+ deriva na curva joga água do lado de fora)
    const bowDemand = Math.max(0, spd - c.speedThreshold);
    // popa: hélice revolvendo (acelerando / ré)
    const sternDemand = Math.abs(boat.rpm) * Math.max(0, 1 - spd / 6) * 1.5;
    this.acc += (bowDemand * 6 + sternDemand) * c.rate * dt / 6;
    let n = Math.min(60, Math.floor(this.acc));
    this.acc -= n;
    const total = bowDemand * 6 + sternDemand || 1;
    while (n-- > 0) {
      if (Math.random() < (bowDemand * 6) / total) {
        const b = this.bow[(Math.random() * this.bow.length) | 0];
        const sway = boat.sway * b.s;
        this._a.set(b.s * (b.hb + 0.05), 0.15, b.z).applyQuaternion(q).add(P);
        const out = (0.8 + spd * 0.35 + Math.max(0, -sway)) * (0.7 + Math.random() * 0.6);
        const up = (0.6 + spd * 0.45) * (0.6 + Math.random() * 0.7);
        this.emit(this._a.x, this._a.y, this._a.z,
          rx * b.s * out + fx * spd * 0.55, up, rz * b.s * out + fz * spd * 0.55);
      } else {
        this._a.set((Math.random() - 0.5) * 1.2, 0.05, -3.9).applyQuaternion(q).add(P);
        const back = -Math.sign(boat.rpm || 1) * (1 + Math.random() * 2);
        this.emit(this._a.x, this._a.y, this._a.z, fx * back + (Math.random() - 0.5), 0.8 + Math.random() * 1.6, fz * back + (Math.random() - 0.5));
      }
    }
    // gotas: gravidade, arrasto do ar, somem ao cair na água
    for (let i = 0; i < c.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      const k = i * 3;
      this.life[i] -= dt;
      this.vel[k + 1] -= 9.81 * dt;
      const drag = Math.exp(-0.8 * dt);
      this.vel[k] *= drag; this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.vel[k + 1] < 0 && this.pos[k + 1] < water(this.pos[k], this.pos[k + 2])) this.life[i] = 0;
      this.alpha[i] = this.life[i] > 0 ? Math.min(0.85, this.life[i] / (c.life * 0.4)) : 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aAlpha.needsUpdate = true;
  }
}

/** Meia boca do casco na altura da água em z (mesma forma do BoatPhysics). */
function halfBeamAt(z, L = 7.6, B = 2.7) {
  const t = z / (L / 2);
  return (B / 2) * (t < 0 ? 1 - 0.18 * t * t : Math.sqrt(Math.max(0, 1 - Math.pow(Math.min(1, t), 1.8))));
}
