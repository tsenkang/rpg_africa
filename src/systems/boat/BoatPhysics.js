import * as THREE from 'three';
import { BOAT } from '../../config/boat.js';

/**
 * Física do barco (Etapa A3) — corpo rígido, sem Three.js na cena (só a matemática).
 *
 * Mesmo modelo do `BoatController.js` do Tidewater, simplificado onde indicado:
 *  - **Hidrostática** por pontos do casco: cada ponto é um pedaço do plano de flutuação
 *    (área A) com a profundidade média do casco ali (d). Empuxo = ρ g A · clamp(h − y, 0, d + borda),
 *    ao longo do "para cima" do mundo; com a massa de projeto, Σ ρ g A d = m g → flutua na
 *    linha d'água [Tidewater hullSamples].
 *  - **Amortecimento vertical** por ponto contra a velocidade vertical da própria água [Tidewater].
 *  - **Massa e inércia adicionais** que crescem com quanto do casco está molhado [Tidewater].
 *  - **Resistência** de avanço quadrática com a corcova da onda acima da velocidade de casco;
 *    **quilha** em estações: arrasto cruzado ~ v|v| e sustentação ~ u·v (estabilidade direcional,
 *    raio de giro, perda de velocidade e banda na curva) [Tidewater].
 *  - **Hélice**: rotação acompanha a alavanca com atraso; empuxo cai perto da velocidade de passo.
 *  - **Leme**: placa sustentadora na esteira da hélice; o ângulo de ataque desconta o fluxo
 *    local (deriva + guinada) [Tidewater].
 *  - **Trim dinâmico**: a proa sobe com a velocidade [Tidewater, simplificado num momento ~ u²].
 *  - **Encalhe**: mola + atrito por ponto contra o fundo.
 * Integração semi-implícita de Euler a passo fixo (120 Hz) com interpolação para o desenho.
 *
 * A água entra por injeção: `water(x, z) → { h, vy }` (altura e velocidade vertical).
 *
 * @example
 *   const boat = new BoatPhysics(BOAT, { x: 10, z: 20, yaw: 0 });
 *   boat.update(dt, { throttle: 1, steer: 0 }, { water: (x, z) => ({ h: 0, vy: 0 }), ground: () => -20 });
 *   mesh.position.copy(boat.renderPosition); mesh.quaternion.copy(boat.renderQuaternion);
 */
export class BoatPhysics {
  /**
   * @param {object} [cfg] `BOAT`
   * @param {{ x?: number, y?: number, z?: number, yaw?: number }} [at]
   */
  constructor(cfg = BOAT, { x = 0, y = 0, z = 0, yaw = 0 } = {}) {
    this.cfg = cfg;
    this.samples = buildHullSamples(cfg);
    const V = this.samples.reduce((s, p) => s + p.area * p.depth, 0);
    // centro de carena → centro de massa em z (trim nivelado) [Tidewater]
    const lcb = this.samples.reduce((s, p) => s + p.area * p.depth * p.z, 0) / V;
    this.comLocal = new THREE.Vector3(cfg.centerOfMass[0], cfg.centerOfMass[1], lcb);
    this.displaced = V;
    const m = cfg.mass, L = cfg.length, B = cfg.beam, g = cfg.gyration;
    this.inertia = new THREE.Vector3(m * (g.pitch * L) ** 2, m * (g.yaw * L) ** 2, m * (g.roll * B) ** 2);
    this.waterplane = this.samples.reduce((s, p) => s + p.area, 0);

    // estado (mundo): centro de massa, orientação, velocidades
    this.q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.com = new THREE.Vector3(x, y, z).add(this.comLocal.clone().applyQuaternion(this.q));
    this.v = new THREE.Vector3();
    this.w = new THREE.Vector3();
    this.rpm = 0; // −1..1
    this.rudder = 0; // rad
    this.wet = 1;
    this.grounded = false;
    this.acc = 0;
    // pose anterior/atual para interpolar
    this.prevPos = this.position.clone();
    this.prevQ = this.q.clone();
    this.renderPosition = this.prevPos.clone();
    this.renderQuaternion = this.q.clone();
    // telemetria (HUD, esteira, som)
    this.speed = 0; // m/s para a frente
    this.sway = 0;
    this.thrust = 0;
    this._t = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), F: new THREE.Vector3(), T: new THREE.Vector3(), qi: new THREE.Quaternion() };
  }

  /** Origem do barco (linha d'água de projeto, meio do casco) no mundo. */
  get position() {
    return this.com.clone().sub(this.comLocal.clone().applyQuaternion(this.q));
  }

  /** Ponto local (referencial do barco) → mundo. */
  toWorld(local, out = new THREE.Vector3()) {
    return out.copy(local).sub(this.comLocal).applyQuaternion(this.q).add(this.com);
  }

  /** Velocidade (mundo) de um ponto local. */
  pointVelocity(local, out = new THREE.Vector3()) {
    const r = this._t.c.copy(local).sub(this.comLocal).applyQuaternion(this.q);
    return out.crossVectors(this.w, r).add(this.v);
  }

  /** Ângulos (rad): pitch (proa para cima +), roll (bombordo para baixo +), yaw. */
  angles() {
    const e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ');
    return { yaw: e.y, pitch: -e.x, roll: e.z };
  }

  /**
   * Avança a simulação (passo fixo + interpolação).
   * @param {number} dt s (quadro)
   * @param {{ throttle: number, steer: number }} input alavanca −1..1, leme −1..1 (+ = bombordo/esquerda)
   * @param {{ water: (x:number, z:number) => { h: number, vy: number }, ground?: (x:number, z:number) => number }} env
   */
  update(dt, input, env) {
    const h = this.cfg.step;
    this.acc = Math.min(this.acc + dt, h * this.cfg.maxSubsteps);
    while (this.acc >= h) {
      this.prevPos.copy(this.position);
      this.prevQ.copy(this.q);
      this.step(h, input, env);
      this.acc -= h;
    }
    const a = this.acc / h;
    this.renderPosition.copy(this.prevPos).lerp(this.position, a);
    this.renderQuaternion.copy(this.prevQ).slerp(this.q, a);
  }

  /** Um passo de física. */
  step(dt, input, env) {
    const cfg = this.cfg, t = this._t, rho = cfg.rho, g = cfg.gravity;
    const F = t.F.set(0, -cfg.mass * g, 0), T = t.T.set(0, 0, 0);
    const qi = t.qi.copy(this.q).invert();
    const addForce = (f, local) => {
      F.add(f);
      if (local) T.add(t.b.copy(local).sub(this.comLocal).applyQuaternion(this.q).cross(f));
    };
    // ---- hidrostática + amortecimento vertical por ponto
    let wetVol = 0;
    this.grounded = false;
    const P = new THREE.Vector3(), VP = new THREE.Vector3(), f = new THREE.Vector3();
    for (const s of this.samples) {
      this.toWorld(s.local, P);
      const wq = env.water(P.x, P.z);
      const sub = Math.min(Math.max(wq.h - P.y, 0), s.depth + cfg.freeboard);
      this.pointVelocity(s.local, VP);
      if (sub > 0) {
        wetVol += s.area * Math.min(sub, s.depth);
        const k = Math.min(1, sub / s.depth);
        f.set(0, rho * g * s.area * sub - cfg.heaveDamping * s.area * k * (VP.y - (wq.vy ?? 0)), 0);
        addForce(f, s.local);
      }
      // encalhe: o fundo empurra o casco para cima e segura de lado
      const gy = env.ground ? env.ground(P.x, P.z) : -Infinity;
      const pen = gy - P.y; // o ponto já está no fundo do casco
      if (pen > 0) {
        this.grounded = true;
        const up = Math.max(0, cfg.ground.stiffness * pen - cfg.ground.damping * VP.y);
        const hv = Math.hypot(VP.x, VP.z) || 1;
        f.set(-cfg.ground.friction * up * (VP.x / hv) * Math.min(1, hv * 4), up, -cfg.ground.friction * up * (VP.z / hv) * Math.min(1, hv * 4));
        addForce(f, s.local);
      }
    }
    this.wet = Math.min(1.2, wetVol / this.displaced);
    const wet = Math.min(1, this.wet);

    // velocidades no referencial do barco
    const vb = t.a.copy(this.v).applyQuaternion(qi);
    const wb = t.c.copy(this.w).applyQuaternion(qi).clone();
    const u = vb.z;
    this.speed = u;
    this.sway = vb.x;

    // ---- resistência de avanço (atrito + corcova da onda) + ar
    const R = cfg.resistance, au = Math.abs(u);
    const hump = 1 + R.hump * Math.exp(-(((au - 1.15 * R.hullSpeed) / (0.45 * R.hullSpeed)) ** 2));
    const drag = -Math.sign(u) * (R.k * u * u * hump * wet + R.air * u * u);
    addForce(t.b.set(0, 0, drag).applyQuaternion(this.q).clone(), this.comLocal);
    // deriva lateral e vertical (casco largo) — arrasto simples no centro
    // ---- quilha: arrasto cruzado + sustentação do casco por estação
    const K = cfg.keel;
    for (const [zs, A] of K.stations) {
      const vlat = vb.x + wb.y * (zs - this.comLocal.z) - wb.z * (K.depth - this.comLocal.y);
      const fx = -(0.5 * rho * K.cd * A * Math.abs(vlat) * vlat + 0.5 * rho * K.lift * A * au * vlat) * wet;
      // a deriva também inclina o casco para dentro da curva (pressão no fundo do lado de fora),
      // então a força age perto do centro de massa: sobra só uma banda leve para fora [Tidewater]
      addForce(t.b.set(fx, 0, 0).applyQuaternion(this.q).clone(), new THREE.Vector3(0, K.forceY, zs));
    }
    // ---- motor e hélice
    const E = cfg.engine, thr = Math.max(-1, Math.min(1, input.throttle ?? 0));
    const rate = Math.abs(thr) > Math.abs(this.rpm) ? 1 / E.spoolUp : 1 / E.spoolDown;
    this.rpm += Math.max(-rate * dt, Math.min(rate * dt, thr - this.rpm));
    const ePos = new THREE.Vector3(...E.position);
    this.toWorld(ePos, P);
    const propWet = Math.min(1, Math.max(0, (env.water(P.x, P.z).h - P.y) * 4));
    const fall = this.rpm >= 0 ? Math.max(0, 1 - u / E.pitchSpeed) : Math.max(0, 1 + u / (E.pitchSpeed * 0.5));
    this.thrust = E.thrust * this.rpm * (this.rpm >= 0 ? 1 : E.reverse) * fall * propWet;
    addForce(t.b.set(0, 0, this.thrust).applyQuaternion(this.q).clone(), ePos);
    // ---- leme na esteira da hélice
    const Rd = cfg.rudder, target = Math.max(-1, Math.min(1, input.steer ?? 0)) * Rd.maxAngle;
    this.rudder += Math.max(-Rd.rate * dt, Math.min(Rd.rate * dt, target - this.rudder));
    const rPos = new THREE.Vector3(...Rd.position);
    const vr = vb.x + wb.y * (rPos.z - this.comLocal.z);
    // esteira da hélice (disco atuador, ~0,24 m²); só parte dela bate no leme
    const race2 = u * Math.abs(u) + Rd.race * (2 * Math.abs(this.thrust)) / (rho * 0.24) * Math.sign(u + 1e-3);
    const ur2 = Math.abs(race2);
    // o fluxo de lado na popa (deriva + guinada) entra no ângulo de ataque como numa quilha:
    // a força resultante se opõe a ele (estabiliza); o leme desloca esse equilíbrio
    const alpha = this.rudder + Math.atan2(vr, Math.max(Math.sqrt(ur2), 0.3)) * Math.sign(u + 1e-3);
    const cl = Rd.liftSlope * Math.max(-Rd.stall, Math.min(Rd.stall, alpha)) * (Math.abs(alpha) > Rd.stall ? 0.7 : 1);
    // + leme → força para estibordo (−X) na popa → proa para bombordo (guinada +)
    const fr = -0.5 * rho * Rd.area * ur2 * cl * Math.sign(u + 1e-3) * propWet;
    addForce(t.b.set(fr, 0, 0).applyQuaternion(this.q).clone(), new THREE.Vector3(rPos.x, 0.1, rPos.z));
    // arrasto do leme na curva
    addForce(t.b.set(0, 0, -Rd.drag * Math.abs(fr) * Math.abs(Math.sin(this.rudder)) * Math.sign(u)).applyQuaternion(this.q).clone(), this.comLocal);

    // ---- torques no referencial do barco: trim dinâmico e amortecimento angular
    const Tb = t.b.copy(T).applyQuaternion(qi).clone();
    const trimMom = cfg.trim.k * u * Math.abs(u) * hump * wet;
    const pitchNow = this.angles().pitch;
    if (pitchNow < cfg.trim.max) Tb.x -= trimMom; // −X ergue a proa (+Z)
    const AD = cfg.angularDamping;
    Tb.x -= AD.pitch * wb.x * wet; Tb.y -= AD.yaw * wb.y * wet; Tb.z -= AD.roll * wb.z * wet;
    // a quilha resiste ao balanço proporcional à velocidade (barco andando balança menos)
    Tb.z -= 1500 * au * wb.z * wet;

    // ---- integração com massa/inércia adicionais
    const Am = cfg.addedMass, m = cfg.mass;
    const Fb = t.a.copy(F).applyQuaternion(qi);
    Fb.x /= m * (1 + Am.sway * wet); Fb.y /= m * (1 + Am.heave * wet); Fb.z /= m * (1 + Am.surge * wet);
    this.v.add(Fb.applyQuaternion(this.q).multiplyScalar(dt));
    this.com.addScaledVector(this.v, dt);
    const I = this.inertia;
    wb.x += (Tb.x / (I.x * (1 + Am.pitch * wet))) * dt;
    wb.y += (Tb.y / (I.y * (1 + Am.yaw * wet))) * dt;
    wb.z += (Tb.z / (I.z * (1 + Am.roll * wet))) * dt;
    this.w.copy(wb).applyQuaternion(this.q);
    const wq = new THREE.Quaternion(this.w.x * 0.5 * dt, this.w.y * 0.5 * dt, this.w.z * 0.5 * dt, 0).multiply(this.q);
    this.q.set(this.q.x + wq.x, this.q.y + wq.y, this.q.z + wq.z, this.q.w + wq.w).normalize();
    // rede de segurança: nunca deixa a simulação explodir
    if (!Number.isFinite(this.com.x) || this.v.length() > 60) { this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.com.copy(this.prevPos).add(this.comLocal); }
  }

  /** Pontos do casco em coordenadas do mundo (para pedir a altura da água). */
  samplePoints(out = []) {
    this.samples.forEach((s, i) => { out[i] = this.toWorld(s.local, out[i] ?? new THREE.Vector3()); });
    return out;
  }
}

/**
 * Pontos de flutuação sobre o plano de flutuação: `along` estações × `across` faixas.
 * Meia boca: popa cheia (espelho), proa afinando. Profundidade maior no meio (quilha) e
 * menor na proa; normalizada para Σ A·d = massa / ρ (flutua na linha d'água de projeto).
 * @returns {{ local: THREE.Vector3, area: number, depth: number, z: number }[]}
 */
export function buildHullSamples(cfg = BOAT) {
  const { along, across } = cfg.samples, L = cfg.waterlineLength, B = cfg.waterlineBeam;
  const halfBeam = (tt) => (B / 2) * (tt < 0 ? 1 - 0.18 * tt * tt : Math.sqrt(Math.max(0, 1 - Math.pow(tt, 1.8))));
  const out = [];
  const dz = L / along;
  for (let i = 0; i < along; i++) {
    const z = -L / 2 + (i + 0.5) * dz, tt = z / (L / 2), hb = halfBeam(tt);
    const w = (2 * hb) / across;
    for (let j = 0; j < across; j++) {
      const x = -hb + (j + 0.5) * w;
      const center = 1 - Math.abs(x) / Math.max(hb, 1e-3);
      const depth = (0.55 + 0.6 * center) * (tt > 0 ? 1 - 0.5 * tt * tt : 1);
      out.push({ local: new THREE.Vector3(x, 0, z), area: w * dz, depth, z });
    }
  }
  const V = out.reduce((s, p) => s + p.area * p.depth, 0), target = cfg.mass / cfg.rho;
  for (const p of out) { p.depth *= target / V; p.local.y = -p.depth; }
  return out;
}
