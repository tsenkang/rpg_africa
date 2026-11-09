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
  camel: { body: [1.05, 0.27], leg: 0.74, neck: [0.25, 0.6], head: [0.15, 0.17, 0.42], tail: 0.4, ears: 0.06 },
  giraffe: { body: [0.72, 0.19], leg: 0.66, neck: [1.05, 0.95], head: [0.09, 0.1, 0.26], tail: 0.38, ears: 0.05, frontLeg: 0.76 },
  bear: { body: [1.0, 0.36], leg: 0.5, neck: [0.15, 0.22], head: [0.32, 0.3, 0.36], tail: 0.07, ears: 0.08 },
  cerberus: { body: [1.1, 0.27], leg: 0.62, neck: [0.5, 0.36], head: [0.26, 0.24, 0.42], tail: 0.6, ears: 0.15 },
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
    else if (spec.model === 'snake') this.buildSnake();
    else if (spec.model === 'croc') this.buildCroc();
    else if (spec.model === 'ostrich') this.buildOstrich();
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
      else if (state === 'attack' || state === 'threat') key = this.actions.attack ? 'attack' : 'idle';
      else if (state === 'circle') key = 'run';
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
      if (state === 'threat') this.pose.position.y = Math.abs(Math.sin(this.extraT * 12)) * 0.06 * size; // bate no peito
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
    if (state === 'threat') {
      // Gorila batendo no peito (modelo estático): sobe/desce rápido e balança.
      this.pose.position.y = Math.abs(Math.sin(this.extraT * 12)) * 0.08 * size;
      this.pose.rotation.z = Math.sin(this.extraT * 12) * 0.06;
      this.pose.rotation.x = -0.1;
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
    if (spec.hump) { // camelo
      const hump = new THREE.Mesh(geo('hump', () => new THREE.SphereGeometry(0.26, 12, 8).scale(1, 0.9, 1.3)), coat);
      hump.position.set(0, rad * 0.95, -0.05);
      torso.add(hump);
    }
    if (spec.model === 'giraffe') { // ossicones
      for (const sx of [-1, 1]) {
        const o = new THREE.Mesh(geo('ossicone', () => new THREE.CylinderGeometry(0.018, 0.024, 0.14, 5).translate(0, 0.07, 0)), dark);
        o.position.set(sx * hw * 0.25, hh * 0.5, hl * 0.12);
        head.add(o);
      }
    }
    if (spec.model === 'cerberus') { // mais duas cabeças, abertas para os lados
      for (const yaw of [-0.55, 0.55]) {
        const extra = neck.clone();
        extra.rotation.y = yaw;
        extra.position.x += Math.sign(yaw) * rad * 0.35;
        torso.add(extra);
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
    const tailMat = this.spec.tailColor ? mat(this.spec.tailColor, { rough: 0.5 }) : c;
    const wingMat = this.spec.wing ? mat(this.spec.wing, { rough: 0.5 }) : c;
    body.add(new THREE.Mesh(geo(this.spec.tailColor ? 'bdTailLong' : 'bdTail', () => (this.spec.tailColor
      ? new THREE.BoxGeometry(0.1, 0.02, 0.5).translate(0, 0.02, -0.42) // arara: cauda longa
      : new THREE.BoxGeometry(0.14, 0.02, 0.22).translate(0, 0.02, -0.3))), tailMat));
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      w.position.set(sx * 0.1, 0.06, 0);
      const wing = new THREE.Mesh(geo('bdWing', () => new THREE.BoxGeometry(0.42, 0.02, 0.24).translate(0.21, 0, 0)), wingMat);
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

  /** Víbora: corpo em gomos (padrão alternado) que ondula ao rastejar. */
  buildSnake() {
    const spec = this.spec;
    const c = mat(spec.color, { rough: 0.55 }), d = mat(spec.pattern ?? 0x3a2a1a, { rough: 0.55 });
    const L = (spec.length ?? 1.4) / spec.size, n = 14, seg = L / n;
    this.segments = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = 0.42 * (1 - Math.abs(t - 0.3) * 0.9) + 0.08;
      const m = new THREE.Mesh(geo(`snSeg-${i}`, () => new THREE.SphereGeometry(r, 8, 6).scale(1, 0.75, seg / r * 0.75)), i % 3 === 1 ? d : c);
      m.position.set(0, r * 0.75, L * 0.35 - i * seg);
      this.pose.add(m);
      this.segments.push(m);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.45, L * 0.35 + seg * 0.7);
    head.add(new THREE.Mesh(geo('snHead', () => new THREE.SphereGeometry(0.4, 10, 8).scale(1.1, 0.6, 1.5)), c));
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(geo('snEye', () => new THREE.SphereGeometry(0.07, 6, 4)), mat(0xd8b020, { rough: 0.2 }));
      eye.position.set(sx * 0.3, 0.12, 0.25);
      head.add(eye);
    }
    this.pose.add(head);
    this.head = head;
    this.baseTorsoY = 0;
  }

  /** Jacaré: corpo baixo e largo, focinho comprido, patas abertas, cauda que balança. */
  buildCroc() {
    const c = mat(this.spec.color, { rough: 0.7 }), belly = mat(0x8a8a5a, { rough: 0.8 });
    const body = new THREE.Group();
    body.position.y = 0.55;
    this.pose.add(body);
    this.torso = body;
    body.add(new THREE.Mesh(geo('crBody', () => new THREE.CapsuleGeometry(0.55, 2.4, 6, 12).rotateX(Math.PI / 2).scale(1.25, 0.6, 1)), c));
    for (let i = 0; i < 7; i++) { // escamas do dorso
      const sc = new THREE.Mesh(geo('crScute', () => new THREE.ConeGeometry(0.1, 0.22, 4)), c);
      sc.position.set(0, 0.36, 1.1 - i * 0.38);
      body.add(sc);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.05, 1.75);
    body.add(head);
    this.head = head;
    head.add(new THREE.Mesh(geo('crSnout', () => new THREE.BoxGeometry(0.75, 0.32, 1.5).translate(0, 0.05, 0.7)), c));
    const jaw = new THREE.Group();
    jaw.add(new THREE.Mesh(geo('crJaw', () => new THREE.BoxGeometry(0.7, 0.16, 1.4).translate(0, -0.08, 0.68)), belly));
    head.add(jaw);
    this.jaw = jaw;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(geo('crEye', () => new THREE.SphereGeometry(0.1, 6, 4)), mat(0xc8b030, { rough: 0.2 }));
      eye.position.set(sx * 0.28, 0.27, 0.1);
      head.add(eye);
    }
    const tail = new THREE.Group();
    tail.position.set(0, 0, -1.6);
    body.add(tail);
    tail.add(new THREE.Mesh(geo('crTail', () => new THREE.ConeGeometry(0.5, 2.8, 8).rotateX(-Math.PI / 2).scale(1, 0.55, 1).translate(0, 0, -1.4)), c));
    this.tail = tail;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.6, 0.45, sz * 0.9);
      hip.rotation.z = sx * 0.9;
      hip.add(new THREE.Mesh(geo('crLeg', () => new THREE.CylinderGeometry(0.12, 0.1, 0.6, 6).translate(0, -0.3, 0)), c));
      this.pose.add(hip);
      this.legs.push({ hip, front: sz > 0, side: sx, insect: true });
    }
    this.baseTorsoY = body.position.y;
  }

  /** Avestruz: corpo redondo de penas, pescoço e pernas compridas (bípede). */
  buildOstrich() {
    const c = mat(this.spec.color, { rough: 0.95 }), skin = mat(0xc89a8a, { rough: 0.7 }), white = mat(0xe8e2d8);
    const body = new THREE.Group();
    body.position.y = 0.95;
    this.pose.add(body);
    this.torso = body;
    body.add(new THREE.Mesh(geo('osBody', () => new THREE.SphereGeometry(0.42, 12, 10).scale(0.85, 0.75, 1.15)), c));
    body.add(new THREE.Mesh(geo('osTail', () => new THREE.SphereGeometry(0.22, 8, 6).scale(1, 0.7, 0.8).translate(0, 0.12, -0.45)), white));
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(geo('osWing', () => new THREE.SphereGeometry(0.25, 8, 6).scale(0.35, 0.7, 1.1)), white);
      wing.position.set(sx * 0.36, 0.05, -0.05);
      body.add(wing);
    }
    const neck = new THREE.Group();
    neck.position.set(0, 0.2, 0.32);
    neck.rotation.x = -0.25;
    body.add(neck);
    this.neck = neck;
    neck.add(new THREE.Mesh(geo('osNeck', () => new THREE.CylinderGeometry(0.05, 0.08, 0.85, 8).translate(0, 0.42, 0)), skin));
    const head = new THREE.Group();
    head.position.y = 0.88;
    neck.add(head);
    this.head = head;
    head.add(new THREE.Mesh(geo('osHead', () => new THREE.SphereGeometry(0.09, 8, 6).scale(1, 0.9, 1.3)), skin));
    head.add(new THREE.Mesh(geo('osBeak', () => new THREE.ConeGeometry(0.04, 0.14, 5).rotateX(Math.PI / 2).translate(0, -0.02, 0.15)), mat(0xd8c0a0, { rough: 0.4 })));
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(sx * 0.14, 0.9, 0);
      hip.add(new THREE.Mesh(geo('osThigh', () => new THREE.CylinderGeometry(0.06, 0.04, 0.9, 6).translate(0, -0.45, 0)), skin));
      hip.add(new THREE.Mesh(geo('osFoot', () => new THREE.BoxGeometry(0.1, 0.04, 0.2).translate(0, -0.9, 0.06)), skin));
      this.pose.add(hip);
      this.legs.push({ hip, front: true, side: sx });
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
    if (spec.model === 'snake') return this.updateSnake(dt, speed, state);

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
    if (this.jaw) this.jaw.rotation.x = lunge * 0.6 + (state === 'chase' ? 0.15 : 0); // jacaré abre a boca
    if (spec.model === 'croc' && this.tail) this.tail.rotation.y = Math.sin(this.extraT * (moving ? 5 : 1)) * (moving ? 0.35 : 0.1);
    if (state === 'threat' && this.torso) {
      // Bate no peito / se ergue: tronco sobe e desce rápido, patas da frente no ar.
      this.torso.position.y += Math.abs(Math.sin(this.extraT * 12)) * 0.08;
      for (const l of this.legs) if (l.front) l.hip.rotation.x = -0.6 + Math.sin(this.extraT * 12 + l.side) * 0.5;
    }
  }

  /** Víbora: ondulação lateral que corre do pescoço até a cauda; bote ergue a cabeça. */
  updateSnake(dt, speed, state) {
    const moving = speed > 0.05;
    this.phase += dt * (moving ? 6 + speed * 3 : 1.2);
    const amp = moving ? 0.35 : 0.08;
    this.segments.forEach((m, i) => { m.position.x = Math.sin(this.phase - i * 0.55) * amp * (0.3 + i / this.segments.length); });
    const strike = state === 'attack' ? Math.max(0, Math.sin(this.extraT * 8)) : 0;
    this.head.position.y = 0.45 + strike * 0.9 + (state === 'chase' ? 0.5 : 0);
    this.head.position.x = this.segments[0].position.x;
  }

  updateBird(dt, state, t, speed) {
    const flying = state === 'fly' || state === 'circle';
    // Em círculo (arara) bate as asas mais devagar e plana de vez em quando.
    const flap = state === 'circle' ? Math.sin(this.extraT * 9) * (Math.sin(this.extraT * 0.7) > 0.2 ? 0.8 : 0.15) : Math.sin(this.extraT * 22) * 0.9;
    for (const { w, side } of this.wings) w.rotation.z = flying ? side * flap : side * 0.15;
    for (const l of this.legs) l.hip.visible = !flying;
    this.pose.position.y = state === 'fly' ? Math.min(25, t * t * 3 + t * 2) : 0;
    this.pose.rotation.z = state === 'circle' ? -0.35 : 0; // inclina na curva
    if (this.head && !flying) this.head.rotation.x = speed > 0.1 ? 0 : Math.max(0, Math.sin(this.extraT * 3)) * 0.6; // bica o chão
  }
}
