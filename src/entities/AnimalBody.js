import * as THREE from 'three';
import { AnimalAnimationManager } from './anim/AnimalAnimationManager.js';
import { damp } from './anim/AnimMath.js';

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
 * A animação inteira fica no `AnimalAnimationManager` (`this.anim`):
 *  - modelo 3D com clipes (lobo, alce, cérbero, víbora): AnimationMixer +
 *    crossFadeTo, com camadas procedurais por cima;
 *  - modelo 3D estático com esqueleto do AutoRig (leão, zebra, onça…) e
 *  - corpo procedural (placeholder): ciclos procedurais por articulação
 *    (quatérnio + slerp), nado, ataque em 3 fases, respiração.
 * Suricato e víbora procedurais mantêm a animação própria (`updateLegacy`).
 *
 * @example
 *   const body = new AnimalBody(SPECIES.zebra, models.instance('zebra'), 'zebra');
 *   scene.add(body.root);
 *   body.update(dt, speed, 'flee', stateTime, { swimming, tilt, yawRate });
 */
export class AnimalBody {
  /**
   * @param {object} spec espécie (`SPECIES.x`)
   * @param {{ object: THREE.Object3D, clips: THREE.AnimationClip[], names: object|null, rig?: object|null }|null} [model]
   * @param {string} [speciesId] id da espécie (estilo do ataque em `ATTACK_STYLE`)
   */
  constructor(spec, model = null, speciesId = '') {
    this.spec = spec;
    this.speciesId = speciesId;
    this.root = new THREE.Group();
    this.pose = new THREE.Group(); // inclina no terreno, agacha, tomba, afunda
    this.root.add(this.pose);
    this.phase = Math.random() * 10;
    this.legs = [];
    this.wings = [];
    this.extraT = 0;
    this.model = null;
    this.anim = null;
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
    if (spec.model !== 'snake' && spec.model !== 'meerkat') {
      this.anim = new AnimalAnimationManager({ spec, speciesId, pose: this.pose, rig: this.placeholderRig(), dims: this.measure() });
    }
  }

  // ---------------------------------------------------------- modelo 3D
  /** Põe o modelo 3D no lugar do corpo procedural e cria o controlador de animação. */
  useModel(model) {
    this.model = model.object;
    this.pose.add(model.object);
    let rig = null;
    if (model.rig) {
      // Ossos do AutoRig: os nomes vêm do modelo-base, os ossos são desta cópia.
      const r = model.rig;
      const get = (n) => (n ? model.object.getObjectByName(n) : null);
      rig = {
        spine: r.spine.map(get), ribs: get(r.ribs), neck: get(r.neck), head: get(r.head), jaw: get(r.jaw),
        tail: r.tail.map(get),
        legs: r.legs.map((l) => ({ upper: get(l.upper), lower: get(l.lower), front: l.front, side: l.side, len: l.len, knee: l.knee })),
        extra: r.extra.map((e) => ({ role: e.role, obj: get(e.bone), side: e.side, index: e.index })),
        chains: r.chains.map((c) => c.bones.map(get)),
      };
    }
    const dims = model.rig?.dims ?? this.measure();
    this.anim = new AnimalAnimationManager({ spec: this.spec, speciesId: this.speciesId, pose: this.pose, model, rig, dims });
  }

  /** Caixa do corpo (m): comprimento, altura e altura da barriga. */
  measure() {
    this.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.pose, true);
    const L = Math.max(box.max.z - box.min.z, 0.1), H = Math.max(box.max.y - box.min.y, 0.1);
    const shape = SHAPES[this.spec.model];
    const legTop = shape && !this.model ? shape.leg * this.spec.size : H * 0.45;
    return { L, H, W: box.max.x - box.min.x, legTop, torsoH: H * 0.3 };
  }

  /** Mapa de articulações do corpo procedural (os grupos viram "ossos"). */
  placeholderRig() {
    const insect = this.spec.model === 'scorpion';
    const shape = SHAPES[this.spec.model];
    const legLen = (shape ? shape.leg : 0.5) * this.spec.size;
    return {
      spine: this.torso ? [this.torso] : [],
      ribs: this.torso?.children.find((c) => c.isMesh) ?? null,
      neck: this.neck ?? null,
      head: this.head ?? null,
      jaw: this.jaw ?? null,
      tail: this.tail && !insect ? [this.tail] : [],
      legs: insect ? [] : this.legs.map((l) => ({ upper: l.hip, lower: null, front: l.front, side: l.side, len: legLen, knee: legLen * 0.5 })),
      extra: [
        ...this.wings.map(({ w, side }) => ({ role: 'wing', obj: w, side })),
        ...(this.claws ?? []).map((c, i) => ({ role: 'claw', obj: c, side: i ? 1 : -1 })),
        ...(insect ? this.legs.map((l, i) => ({ role: 'insectLeg', obj: l.hip, side: l.side, index: Math.floor(i / 2) })) : []),
      ],
      chains: insect && this.tail ? [[this.tail]] : [],
    };
  }

  /** Começa o ataque (3 fases). @returns {number} s até o impacto */
  startAttack() {
    return this.anim ? this.anim.startAttack() : 0.15;
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
   * @param {number} dt segundos (relógio principal do jogo)
   * @param {number} speed m/s
   * @param {string} state estado da IA (`AnimalBrain.state`)
   * @param {number} [stateTime] segundos no estado atual (para burrow/fly/dead)
   * @param {{ swimming?: boolean, tilt?: { pitch: number, roll: number }, yawRate?: number, leaping?: boolean, look?: number }} [ctx]
   */
  update(dt, speed, state, stateTime = 0, ctx = {}) {
    if (this.anim) {
      this.anim.update(dt, { speed, state, stateTime, ...ctx });
      return;
    }
    this.updateLegacy(dt, speed, state, stateTime);
  }

  /** Suricato e víbora procedurais (formas sem articulações de pata/coluna). */
  updateLegacy(dt, speed, state, stateTime) {
    const size = this.spec.size;
    this.extraT += dt;
    if (state === 'dead') {
      this.pose.rotation.z = damp(this.pose.rotation.z, Math.PI / 2, 5, dt);
      return;
    }
    if (state === 'burrow') {
      this.pose.position.y = -stateTime * size * 1.2;
      return;
    }
    if (this.spec.model === 'snake') {
      this.updateSnake(dt, speed, state);
      return;
    }
    const moving = speed > 0.1;
    const stride = Math.max(0.25, size * (speed > this.spec.walk * 2 ? 1.6 : 0.9));
    this.phase += moving ? dt * (Math.PI * 2 * speed) / stride : 0;
    this.walkW = damp(this.walkW ?? 0, moving ? 1 : 0, 8, dt);
    for (const l of this.legs) {
      const off = l.front === (l.side > 0) ? 0 : Math.PI;
      l.hip.rotation.x = Math.sin(this.phase + off) * 0.5 * this.walkW;
    }
    // Suricato: em pé de sentinela parado; de quatro correndo.
    this.torso.rotation.x = damp(this.torso.rotation.x, this.walkW * 1.2, 6, dt);
    this.head.rotation.y = Math.sin(this.extraT * 1.3) * 0.8 * (1 - this.walkW);
    this.torso.position.y = Math.sin(this.extraT * 2.2) * 0.006 * (1 - this.walkW);
  }

  /** Víbora: ondulação lateral que corre do pescoço até a cauda; bote ergue a cabeça. */
  updateSnake(dt, speed, state) {
    const moving = speed > 0.05;
    this.phase += dt * (moving ? 6 + speed * 3 : 1.2);
    this.ampS = damp(this.ampS ?? 0.08, moving ? 0.35 : 0.08, 4, dt);
    this.segments.forEach((m, i) => { m.position.x = Math.sin(this.phase - i * 0.55) * this.ampS * (0.3 + i / this.segments.length); });
    const strike = state === 'attack' ? Math.max(0, Math.sin(this.extraT * 8)) : 0;
    this.head.position.y = damp(this.head.position.y, 0.45 + strike * 0.9 + (state === 'chase' ? 0.5 : 0), 14, dt);
    this.head.position.x = this.segments[0].position.x;
  }
}
