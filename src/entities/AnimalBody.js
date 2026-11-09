import * as THREE from 'three';

const geoCache = new Map();
const matCache = new Map();
const geo = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};
const mat = (hex, { rough = 0.9, emissive = 0 } = {}) => {
  const k = `${hex}-${rough}-${emissive}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough, emissive, emissiveIntensity: emissive ? 2.2 : 0 }));
  return matCache.get(k);
};

/**
 * Proporções dos placeholders, em múltiplos da altura do ombro (`spec.size`).
 * body: comprimento/raio do tronco; leg: comprimento da perna; neck: inclinação
 * (rad) e comprimento; head: [largura, altura, comprimento].
 */
const SHAPES = {
  horse: { body: [1.05, 0.26], leg: 0.62, neck: [0.75, 0.55], head: [0.17, 0.2, 0.5], tail: 0.55, ears: 0.12 },
  deer: { body: [0.95, 0.24], leg: 0.66, neck: [0.6, 0.5], head: [0.16, 0.18, 0.42], tail: 0.12, ears: 0.12 },
  cat: { body: [1.15, 0.24], leg: 0.55, neck: [0.25, 0.28], head: [0.3, 0.26, 0.32], tail: 0.85, ears: 0.08 },
  dog: { body: [1.05, 0.23], leg: 0.58, neck: [0.45, 0.3], head: [0.24, 0.22, 0.4], tail: 0.45, ears: 0.13 },
  boar: { body: [1.1, 0.34], leg: 0.38, neck: [0.1, 0.18], head: [0.3, 0.3, 0.45], tail: 0.18, ears: 0.1 },
  rodent: { body: [1.3, 0.42], leg: 0.32, neck: [0.15, 0.2], head: [0.42, 0.4, 0.55], tail: 0, ears: 0.08 },
  ape: { body: [0.75, 0.38], leg: 0.6, neck: [0.1, 0.12], head: [0.32, 0.34, 0.3], tail: 0, ears: 0.06, frontLeg: 0.95 },
};

/**
 * Corpo de um animal. `root` fica no chão, de frente para +Z.
 *
 * - Com `model` (cópia de `AnimalModels.instance()`): usa o modelo 3D. Se ele
 *   tem animações (`model.names`), um `AnimationMixer` troca o clipe conforme
 *   o estado da IA (parado, andando, correndo, atacando, morto). Modelo
 *   estático: o corpo inteiro quica ao andar, avança no bote e tomba ao morrer.
 * - Sem `model`: corpo procedural com pernas animadas (placeholder).
 *
 * @example
 *   const body = new AnimalBody(SPECIES.zebra, models.instance('zebra'));
 *   scene.add(body.root);
 *   body.update(dt, speed, 'flee');
 */
export class AnimalBody {
  /**
   * @param {object} spec espécie (`SPECIES.x`)
   * @param {{ object: THREE.Object3D, clips: THREE.AnimationClip[], names: object|null }|null} [model]
   */
  constructor(spec, model = null) {
    this.spec = spec;
    this.root = new THREE.Group();
    this.pose = new THREE.Group(); // agacha, tomba, afunda
    this.root.add(this.pose);
    this.phase = Math.random() * 10;
    this.legs = [];
    this.wings = [];
    this.extraT = 0;
    this.model = null;
    if (model) {
      this.useModel(model);
      return;
    }
    const s = spec.size;
    this.pose.scale.setScalar(s);
    if (spec.model === 'scorpion') this.buildScorpion();
    else if (spec.model === 'bird') this.buildBird();
    else if (spec.model === 'meerkat') this.buildMeerkat();
    else this.buildQuadruped(SHAPES[spec.model] ?? SHAPES.dog);
    this.pose.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  // ---------------------------------------------------------- modelo 3D
  /** Põe o modelo 3D no lugar do corpo procedural (e prepara as animações). */
  useModel(model) {
    this.model = model.object;
    this.pose.add(model.object);
    this.mixer = null;
    this.actions = {};
    this.current = null;
    if (!model.names || !model.clips.length) return;
    this.mixer = new THREE.AnimationMixer(model.object);
    for (const [key, name] of Object.entries(model.names)) {
      const clip = THREE.AnimationClip.findByName(model.clips, name);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    const death = this.actions.death;
    if (death) {
      death.setLoop(THREE.LoopOnce, 1);
      death.clampWhenFinished = true;
    }
    this.play('idle');
  }

  /** Troca o clipe com uma transição curta (`fade` s). Clipe ausente = ignora. */
  play(key, fade = 0.25) {
    const next = this.actions[key];
    if (!next || this.current === key) return;
    const prev = this.actions[this.current];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    this.current = key;
  }

  /** Animação com modelo 3D: clipes (se houver) + movimento do corpo inteiro. */
  updateModel(dt, speed, state, stateTime) {
    const spec = this.spec;
    const size = spec.size;
    const moving = speed > 0.1;
    const gallop = speed > spec.walk * 2;
    this.extraT += dt;
    this.phase += moving ? dt * (Math.PI * 2 * speed) / Math.max(0.25, size * (gallop ? 1.6 : 0.9)) : 0;
    const lunge = state === 'attack' ? Math.max(0, Math.sin(this.extraT * 7)) : 0;

    if (this.mixer) {
      let key = 'idle';
      if (state === 'dead') key = 'death';
      else if (state === 'attack') key = 'attack';
      else if (gallop) key = 'run';
      else if (moving) key = 'walk';
      else if (spec.behavior === 'flee' && Math.sin(this.extraT * 0.5) > 0.3) key = 'eat';
      this.play(this.actions[key] ? key : 'idle');
      const a = this.actions[this.current];
      // Ritmo dos passos acompanha a velocidade real.
      if (a && key === 'walk') a.timeScale = THREE.MathUtils.clamp(speed / spec.walk, 0.5, 1.6);
      else if (a && key === 'run') a.timeScale = THREE.MathUtils.clamp(speed / (spec.run * 0.85), 0.6, 1.4);
      else if (a) a.timeScale = 1;
      this.mixer.update(dt);
      this.pose.position.y = state === 'stalk' ? -0.08 * size : 0;
      if (state === 'burrow') this.pose.position.y = -stateTime * size * 1.2;
      return;
    }

    // Estático: o corpo todo se move.
    if (state === 'dead') {
      this.pose.rotation.z = Math.min(Math.PI / 2, this.pose.rotation.z + dt * 4);
      this.pose.position.set(0, 0, 0);
      return;
    }
    if (state === 'burrow') {
      this.pose.position.y = -stateTime * size * 1.2;
      return;
    }
    if (state === 'fly') {
      this.pose.position.y = Math.min(25, stateTime * stateTime * 3 + stateTime * 2);
      this.pose.rotation.z = Math.sin(this.extraT * 22) * 0.12; // bate as asas: o corpo balança
      return;
    }
    const bob = moving ? Math.abs(Math.sin(this.phase)) * size * (gallop ? 0.09 : 0.035) : Math.sin(this.extraT * 2) * size * 0.004;
    this.pose.position.y = bob - (state === 'stalk' ? 0.1 * size : 0);
    this.pose.position.z = lunge * 0.3 * size;
    this.pose.rotation.x = moving ? Math.sin(this.phase) * (gallop ? 0.07 : 0.03) : -lunge * 0.12;
    this.pose.rotation.z = moving ? Math.sin(this.phase * 0.5) * 0.02 : 0;
  }

  // ---------------------------------------------------------------- formas
  buildQuadruped(sh) {
    const spec = this.spec;
    const coat = mat(spec.color);
    const dark = mat(spec.stripe ?? spec.spots ?? spec.mane ?? 0x1a1410);
    const [len, rad] = sh.body;
    const legLen = sh.leg;
    const torso = new THREE.Group();
    torso.position.y = legLen + rad * 0.6;
    this.pose.add(torso);
    this.torso = torso;
    torso.add(new THREE.Mesh(geo(`qbody-${len}-${rad}`, () => new THREE.CapsuleGeometry(rad, len - rad * 2, 6, 12).rotateX(Math.PI / 2)), coat));
    // Listras (zebra) ou manchas (onça, hiena, leopardo).
    if (spec.stripe) {
      for (let i = -3; i <= 3; i++) {
        const st = new THREE.Mesh(geo(`stripe-${rad}`, () => new THREE.TorusGeometry(rad * 1.01, rad * 0.07, 4, 16, Math.PI * 1.25).rotateZ(-Math.PI * 0.125)), dark);
        st.rotation.y = Math.PI / 2;
        st.position.z = i * len * 0.11;
        torso.add(st);
      }
    }
    if (spec.spots) {
      for (let i = 0; i < 14; i++) {
        const sp = new THREE.Mesh(geo('spot', () => new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.4, 1)), dark);
        const a = (i * 2.39) % (Math.PI * 2);
        sp.position.set(Math.cos(a) * rad * 0.98, Math.sin(a) * rad * 0.98 * (a < Math.PI ? 1 : 0.3), ((i * 0.37) % 1 - 0.5) * len * 0.8);
        sp.lookAt(sp.position.clone().multiplyScalar(2).setZ(sp.position.z));
        torso.add(sp);
      }
    }
    // Pernas: [x, z] de cada uma (frente = +z).
    const fl = sh.frontLeg ?? legLen;
    const corners = [[-1, 1, fl], [1, 1, fl], [-1, -1, legLen], [1, -1, legLen]];
    for (const [sx, sz, L] of corners) {
      const hip = new THREE.Group();
      hip.position.set(sx * rad * 0.62, legLen + rad * 0.45 + (L - legLen), sz * (len / 2 - rad * 0.7));
      const thickness = sh === SHAPES.ape ? 0.09 : 0.055;
      hip.add(new THREE.Mesh(geo(`leg-${L}-${thickness}`, () => new THREE.CylinderGeometry(thickness, thickness * 0.7, L, 6).translate(0, -L / 2, 0)), coat));
      const hoof = new THREE.Mesh(geo(`hoof-${L}`, () => new THREE.CylinderGeometry(thickness * 0.75, thickness * 0.9, 0.06, 6).translate(0, -L + 0.03, 0)), mat(0x1a1410));
      hip.add(hoof);
      this.pose.add(hip);
      this.legs.push({ hip, front: sz > 0, side: sx });
    }
    // Pescoço e cabeça.
    const [neckTilt, neckLen] = sh.neck;
    const neck = new THREE.Group();
    neck.position.set(0, rad * 0.4, len / 2 - rad * 0.3);
    neck.rotation.x = -neckTilt;
    torso.add(neck);
    this.neck = neck;
    neck.add(new THREE.Mesh(geo(`neck-${neckLen}-${rad}`, () => new THREE.CylinderGeometry(rad * 0.45, rad * 0.6, neckLen, 8).rotateX(Math.PI / 2).translate(0, 0, neckLen / 2)), coat));
    const [hw, hh, hl] = sh.head;
    const head = new THREE.Group();
    head.position.z = neckLen;
    head.rotation.x = neckTilt * 0.9;
    neck.add(head);
    this.head = head;
    head.add(new THREE.Mesh(geo(`head-${hw}-${hh}-${hl}`, () => new THREE.BoxGeometry(hw, hh, hl, 2, 2, 2).translate(0, 0, hl / 2)), coat));
    head.add(new THREE.Mesh(geo(`snout-${hw}-${hh}`, () => new THREE.BoxGeometry(hw * 0.7, hh * 0.6, 0.06).translate(0, -hh * 0.18, hl)), dark));
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(geo(`ear-${sh.ears}`, () => new THREE.ConeGeometry(sh.ears * 0.4, sh.ears, 4)), coat);
      ear.position.set(sx * hw * 0.35, hh * 0.55, hl * 0.15);
      head.add(ear);
      const eye = new THREE.Mesh(geo('aeye', () => new THREE.SphereGeometry(0.022, 6, 4)), spec.glow ? mat(spec.glow, { emissive: spec.glow }) : mat(0x080604, { rough: 0.3 }));
      eye.position.set(sx * hw * 0.48, hh * 0.18, hl * 0.62);
      head.add(eye);
    }
    // Extras por espécie.
    if (spec.mane) {
      const mane = new THREE.Mesh(geo('mane', () => new THREE.SphereGeometry(0.3, 10, 8).scale(1.1, 1.15, 0.7)), mat(spec.mane, { rough: 1 }));
      mane.position.set(0, 0, 0.02);
      head.add(mane);
    }
    if (spec.antlers) {
      for (const sx of [-1, 1]) {
        const a = new THREE.Group();
        a.position.set(sx * hw * 0.3, hh * 0.5, hl * 0.2);
        a.rotation.z = -sx * 0.6;
        a.add(new THREE.Mesh(geo('antler', () => new THREE.CylinderGeometry(0.018, 0.025, 0.4, 5).translate(0, 0.2, 0)), mat(spec.antlers)));
        const palm = new THREE.Mesh(geo('antlerPalm', () => new THREE.BoxGeometry(0.32, 0.03, 0.18).translate(sx * 0.12, 0.42, 0)), mat(spec.antlers));
        a.add(palm);
        head.add(a);
      }
    }
    if (spec.model === 'boar') {
      for (const sx of [-1, 1]) {
        const tusk = new THREE.Mesh(geo('tusk', () => new THREE.ConeGeometry(0.025, 0.14, 5).rotateX(-0.6)), mat(0xe8dcc0, { rough: 0.5 }));
        tusk.position.set(sx * hw * 0.32, -hh * 0.15, hl * 0.95);
        head.add(tusk);
      }
      if (spec.glow) {
        const crack = new THREE.Mesh(geo('corrupt', () => new THREE.BoxGeometry(0.04, 0.02, len * 0.7)), mat(spec.glow, { emissive: spec.glow }));
        crack.position.y = rad * 0.98;
        torso.add(crack);
      }
    }
    if (sh.tail > 0) {
      const tail = new THREE.Group();
      tail.position.set(0, rad * 0.3, -len / 2 + rad * 0.2);
      tail.rotation.x = 2.4;
      tail.add(new THREE.Mesh(geo(`tail-${sh.tail}`, () => new THREE.CylinderGeometry(0.02, 0.035, sh.tail, 5).translate(0, sh.tail / 2, 0)), spec.model === 'horse' ? dark : coat));
      torso.add(tail);
      this.tail = tail;
    }
    this.baseTorsoY = torso.position.y;
  }

  buildScorpion() {
    const c = mat(this.spec.color, { rough: 0.35 });
    const body = new THREE.Group();
    body.position.y = 0.22;
    this.pose.add(body);
    this.torso = body;
    body.add(new THREE.Mesh(geo('scBody', () => new THREE.SphereGeometry(0.3, 12, 8).scale(0.9, 0.38, 1.3)), c));
    for (let i = 0; i < 4; i++) {
      for (const sx of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(sx * 0.22, 0.2, 0.22 - i * 0.16);
        hip.rotation.z = sx * 1.1;
        hip.add(new THREE.Mesh(geo('scLeg', () => new THREE.CylinderGeometry(0.018, 0.012, 0.42, 4).translate(0, -0.21, 0)), c));
        this.pose.add(hip);
        this.legs.push({ hip, front: i % 2 === 0, side: sx, insect: true });
      }
    }
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.16, 0, 0.38);
      arm.rotation.y = -sx * 0.5;
      arm.add(new THREE.Mesh(geo('scArm', () => new THREE.CylinderGeometry(0.03, 0.03, 0.32, 5).rotateX(Math.PI / 2).translate(0, 0, 0.16)), c));
      arm.add(new THREE.Mesh(geo('scClaw', () => new THREE.SphereGeometry(0.09, 8, 6).scale(0.7, 0.5, 1.2).translate(0, 0, 0.4)), c));
      body.add(arm);
      (this.claws ??= []).push(arm);
    }
    // Cauda em arco com ferrão.
    const tail = new THREE.Group();
    tail.position.set(0, 0.05, -0.36);
    body.add(tail);
    let parent = tail;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? 0 : 0.13, 0);
      seg.rotation.x = -0.42;
      seg.add(new THREE.Mesh(geo('scSeg', () => new THREE.SphereGeometry(0.075, 8, 6).scale(1, 1.1, 1).translate(0, 0.065, 0)), c));
      parent.add(seg);
      parent = seg;
    }
    parent.add(new THREE.Mesh(geo('scSting', () => new THREE.ConeGeometry(0.04, 0.16, 6).rotateX(Math.PI * 0.75).translate(0, 0.14, 0.06)), mat(0x8a1a10, { rough: 0.3 })));
    this.tail = tail;
    this.baseTorsoY = body.position.y;
  }

  buildMeerkat() {
    const c = mat(this.spec.color);
    const dark = mat(0x3a2a1a);
    const body = new THREE.Group();
    this.pose.add(body);
    this.torso = body;
    body.add(new THREE.Mesh(geo('mkBody', () => new THREE.CapsuleGeometry(0.16, 0.42, 4, 10).translate(0, 0.45, 0)), c));
    const head = new THREE.Group();
    head.position.y = 0.88;
    body.add(head);
    this.head = head;
    head.add(new THREE.Mesh(geo('mkHead', () => new THREE.SphereGeometry(0.12, 10, 8).scale(0.9, 0.9, 1.3)), c));
    for (const sx of [-1, 1]) {
      const patch = new THREE.Mesh(geo('mkEye', () => new THREE.SphereGeometry(0.035, 6, 4)), dark);
      patch.position.set(sx * 0.05, 0.03, 0.09);
      head.add(patch);
    }
    const nose = new THREE.Mesh(geo('mkNose', () => new THREE.SphereGeometry(0.025, 6, 4)), dark);
    nose.position.set(0, 0, 0.16);
    head.add(nose);
    const tail = new THREE.Mesh(geo('mkTail', () => new THREE.CylinderGeometry(0.02, 0.04, 0.55, 5).translate(0, 0.27, 0)), c);
    tail.position.set(0, 0.12, -0.12);
    tail.rotation.x = -2.0;
    body.add(tail);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.1, sz > 0 ? 0.62 : 0.16, sz > 0 ? 0.12 : 0);
      hip.add(new THREE.Mesh(geo('mkLeg', () => new THREE.CylinderGeometry(0.03, 0.025, 0.18, 5).translate(0, -0.09, 0)), c));
      body.add(hip);
      this.legs.push({ hip, front: sz > 0, side: sx });
    }
    this.baseTorsoY = 0;
  }

  buildBird() {
    const c = mat(this.spec.color, { rough: 0.5 });
    const body = new THREE.Group();
    body.position.y = 0.22;
    this.pose.add(body);
    this.torso = body;
    body.add(new THREE.Mesh(geo('bdBody', () => new THREE.SphereGeometry(0.16, 10, 8).scale(0.8, 0.8, 1.5)), c));
    const head = new THREE.Group();
    head.position.set(0, 0.12, 0.2);
    body.add(head);
    this.head = head;
    head.add(new THREE.Mesh(geo('bdHead', () => new THREE.SphereGeometry(0.09, 8, 6)), c));
    head.add(new THREE.Mesh(geo('bdBeak', () => new THREE.ConeGeometry(0.035, 0.14, 5).rotateX(Math.PI / 2).translate(0, -0.01, 0.13)), mat(0x1a1a1a, { rough: 0.3 })));
    body.add(new THREE.Mesh(geo('bdTail', () => new THREE.BoxGeometry(0.14, 0.02, 0.22).translate(0, 0.02, -0.3)), c));
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.1, 0.06, 0);
      const wing = new THREE.Mesh(geo('bdWing', () => new THREE.BoxGeometry(0.42, 0.02, 0.24).translate(0.21, 0, 0)), c);
      wing.scale.x = sx;
      w.add(wing);
      body.add(w);
      this.wings.push({ w, side: sx });
      const hip = new THREE.Group();
      hip.position.set(sx * 0.05, 0.1, 0);
      hip.add(new THREE.Mesh(geo('bdLeg', () => new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4).translate(0, -0.07, 0)), mat(0x2a2a2a)));
      this.pose.add(hip);
      this.legs.push({ hip, front: sx > 0, side: sx });
    }
    this.baseTorsoY = body.position.y;
  }

  // ---------------------------------------------------------------- animação
  /**
   * @param {number} dt
   * @param {number} speed m/s
   * @param {string} state estado da IA (`AnimalBrain.state`)
   * @param {number} [stateTime] segundos no estado atual (para burrow/fly/dead)
   */
  update(dt, speed, state, stateTime = 0) {
    if (this.model) return this.updateModel(dt, speed, state, stateTime);
    const spec = this.spec;
    const size = spec.size;
    const moving = speed > 0.1;
    // Passos por segundo ~ velocidade / passada (passada ∝ tamanho).
    const stride = Math.max(0.25, size * (speed > spec.walk * 2 ? 1.6 : 0.9));
    this.phase += moving ? dt * (Math.PI * 2 * speed) / stride : 0;
    const ph = this.phase;
    const gallop = speed > spec.walk * 2;
    const amp = moving ? (gallop ? 0.75 : 0.42) : 0;
    this.extraT += dt;

    if (state === 'dead') {
      this.pose.rotation.z = Math.min(Math.PI / 2, this.pose.rotation.z + dt * 4);
      this.pose.position.y = Math.min(0, this.pose.position.y);
      for (const l of this.legs) l.hip.rotation.x *= 0.9;
      return;
    }
    if (state === 'burrow') {
      this.pose.position.y = -stateTime * size * 1.2;
      return;
    }
    if (spec.model === 'bird') return this.updateBird(dt, state, stateTime, speed);

    for (const l of this.legs) {
      if (l.insect) {
        const off = (l.front ? 0 : Math.PI) + (l.side > 0 ? Math.PI / 2 : 0);
        l.hip.rotation.x = Math.sin(ph * 1.6 + off) * (moving ? 0.5 : 0);
        continue;
      }
      // Andar: diagonais juntas (trote). Galope: pares da frente e de trás.
      const off = gallop ? (l.front ? 0 : Math.PI * 0.6) + (l.side > 0 ? 0.35 : 0) : (l.front === (l.side > 0) ? 0 : Math.PI);
      l.hip.rotation.x = Math.sin(ph + off) * amp;
    }
    const crouch = state === 'stalk' ? 0.22 : 0;
    const lunge = state === 'attack' ? Math.max(0, Math.sin(this.extraT * 7)) : 0;
    if (this.torso) {
      this.torso.position.y = (this.baseTorsoY ?? 0) - crouch + (moving ? Math.abs(Math.sin(ph)) * (gallop ? 0.06 : 0.025) : Math.sin(this.extraT * 2) * 0.006);
      this.torso.rotation.x = gallop ? Math.sin(ph) * 0.08 : 0;
    }
    this.pose.position.y = -crouch * 0.5;
    if (this.neck) {
      // Pastando quando parado (herbívoros), cabeça baixa no bote.
      const graze = state === 'idle' && spec.behavior === 'flee' ? (Math.sin(this.extraT * 0.5) > 0 ? 0.9 : 0) : 0;
      const target = graze + lunge * 0.4 + (state === 'stalk' ? 0.35 : 0);
      this.neck.rotation.x += ((-(SHAPES[spec.model]?.neck[0] ?? 0) + target) - this.neck.rotation.x) * Math.min(1, dt * 4);
    }
    if (this.head && spec.model === 'meerkat') {
      // Suricato: em pé de sentinela parado; de quatro correndo.
      const up = moving ? 0 : 1;
      this.torso.rotation.x += ((1 - up) * 1.2 - this.torso.rotation.x) * Math.min(1, dt * 6);
      this.head.rotation.y = up ? Math.sin(this.extraT * 1.3) * 0.8 : 0;
    }
    if (this.tail) this.tail.rotation.z = Math.sin(this.extraT * (moving ? 6 : 1.5)) * 0.25;
    if (this.claws) for (const c of this.claws) c.rotation.x = -lunge * 0.5;
    if (spec.model === 'scorpion' && this.tail) this.tail.rotation.x = -lunge * 0.6;
  }

  updateBird(dt, state, t, speed) {
    const flying = state === 'fly';
    for (const { w, side } of this.wings) w.rotation.z = flying ? side * Math.sin(this.extraT * 22) * 0.9 : side * 0.15;
    for (const l of this.legs) l.hip.visible = !flying;
    this.pose.position.y = flying ? Math.min(25, t * t * 3 + t * 2) : 0;
    if (this.head && !flying) this.head.rotation.x = speed > 0.1 ? 0 : Math.max(0, Math.sin(this.extraT * 3)) * 0.6; // bica o chão
  }
}
