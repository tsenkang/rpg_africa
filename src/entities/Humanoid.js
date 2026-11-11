import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { approach } from './Locomotion.js';
import { ANIMATION } from '../config/animation.js';
import { dampFactor, slopeTilt, twoBoneIK, clamp } from './anim/AnimMath.js';

const TAU = Math.PI * 2;
const _qA = new THREE.Quaternion();

const geoCache = new Map();
const matCache = new Map();

function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}

function mat(hex, rough = 0.85) {
  const k = `${hex}-${rough}`;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough }));
  return matCache.get(k);
}

/**
 * Junta, em cada articulação, as peças filhas que usam o mesmo material.
 * A pose não muda (a transformação local de cada peça é "assada" na
 * geometria), mas a figura passa de ~40 para ~20 draw calls — e o mesmo
 * vale para a passada de sombra. Peças em `keep` (animadas por escala)
 * ficam de fora.
 * @param {THREE.Object3D} joint
 * @param {Set<THREE.Object3D>} keep
 */
function mergeJointParts(joint, keep) {
  const buckets = new Map();
  for (const child of [...joint.children]) {
    if (child.isMesh && !keep.has(child) && child.children.length === 0 && child.geometry.index) {
      if (!buckets.has(child.material)) buckets.set(child.material, []);
      buckets.get(child.material).push(child);
    } else if (child.isGroup) {
      mergeJointParts(child, keep);
    }
  }
  for (const [material, meshes] of buckets) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const merged = new THREE.Mesh(mergeGeometries(geos, false), material);
    merged.castShadow = true;
    geos.forEach((g) => g.dispose());
    meshes.forEach((m) => joint.remove(m));
    joint.add(merged);
  }
}

export const SKIN_TONES = [0x3b2417, 0x4a2c1c, 0x5c3a24, 0x6e4529, 0x7d5233, 0x8f6440];

/** Proporções do corpo (1,80 m), em metros. Escaladas por `height`. */
const BODY = {
  hipY: 0.93, hipHalfWidth: 0.1,
  thigh: 0.44, shin: 0.42, footLen: 0.26,
  torsoY: 0.95, shoulderY: 0.58, shoulderHalfWidth: 0.2,
  upperArm: 0.30, forearm: 0.27,
  headY: 0.66,
  strideWalk: 1.4, strideRun: 2.4, // metros por passo → cadência das pernas
};

const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Corpo humano procedural em escala real (padrão 1,80 m): pernas com joelho,
 * braços com cotovelo, mãos com dedos, rosto com olhos, sobrancelhas, orelhas
 * e boca. Articulações em grupos, para animar por rotação:
 *
 *   legs[i] (quadril) → knees[i] → feet[i]
 *   arms[i] (ombro)   → elbows[i] → hands[i]
 *   torso → head
 *
 * Animações: parado (respira, muda o peso, olha em volta), andar, correr
 * (`sprinting`: passada maior, tronco inclinado, cotovelos a 90°), pulo,
 * nado (crawl com braçadas, rolagem do tronco e respiração lateral; parado na
 * água: pedala e rema de lado, boiando), voo, soco (preparo → golpe com giro
 * do tronco → recolhe, braço esquerdo em guarda) e recuo ao levar golpe.
 *
 * Suavidade: a pose de cada quadro é só o ALVO. Cada articulação vai até ele
 * por slerp de quatérnio (`ANIMATION.human.jointRate`); nas trocas terra ↔
 * água ↔ voo a taxa cai por `ANIMATION.human.transition` s (crossfade), então
 * nenhuma troca de estado dá tranco.
 *
 * Terreno (com `ground`): o tronco inclina na rampa e cada pé desce/sobe até o
 * chão por IK de 2 ossos (coxa + canela), com a pelve compensando.
 *
 * @example
 *   const h = new Humanoid({ height: 1.8, skin: 0x6b4430, shirt: 0xc8a050 });
 *   scene.add(h.root);
 *   h.update(dt, speed, { sprinting, grounded, ground: (x, z) => terreno(x, z) });
 *   h.punch(0.32);
 */
export class Humanoid {
  constructor({
    height = 1.8, skin = SKIN_TONES[2], shirt = 0x8a5a3a, pants = 0x3a3028,
    hair = 0x111111, hat = null, robe = false, accessory = null, build = 1, hunch = 0,
    mergeParts = true,
    // Vestuário por bioma (NPCVisualBuilder): cores; null = sem a peça.
    cape = null, apron = null, armor = null, straps = null, gloves = null, boots = null, hatColor = null,
  } = {}) {
    const s = height / 1.8;
    const B = BODY;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.scale.setScalar(s);
    this.root.add(this.body);
    this.phase = Math.random() * 10;
    this.idleT = Math.random() * 100;
    this.hunch = hunch;

    const add = (mesh, parent = this.body) => {
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const skinMat = mat(skin, 0.62);
    const handMat = gloves ? mat(gloves, 0.9) : skinMat;
    const legMat = mat(robe ? shirt : pants);

    // Pernas: quadril → joelho → pé.
    this.hips = new THREE.Group();
    this.hips.position.y = B.hipY;
    this.body.add(this.hips);
    this.knees = [];
    this.feet = [];
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * B.hipHalfWidth * build, 0, 0);
      add(new THREE.Mesh(geo('thigh', () => new THREE.CapsuleGeometry(0.082, B.thigh - 0.1, 4, 10).translate(0, -B.thigh / 2, 0)), legMat), hip).scale.x = build;
      const knee = new THREE.Group();
      knee.position.y = -B.thigh;
      hip.add(knee);
      add(new THREE.Mesh(geo('shin', () => new THREE.CapsuleGeometry(0.062, B.shin - 0.1, 4, 10).translate(0, -B.shin / 2, 0)), legMat), knee);
      const foot = new THREE.Group();
      foot.position.y = -B.shin;
      knee.add(foot);
      add(new THREE.Mesh(geo('foot', () => new THREE.BoxGeometry(0.1, 0.07, B.footLen).translate(0, -0.035, 0.05)), mat(boots ?? 0x2a1d14)), foot);
      add(new THREE.Mesh(geo('toe', () => new THREE.BoxGeometry(0.095, 0.045, 0.06).translate(0, -0.047, 0.2)), mat(boots ?? 0x2a1d14)), foot);
      if (boots) add(new THREE.Mesh(geo('bootShaft', () => new THREE.CylinderGeometry(0.068, 0.062, 0.2, 10).translate(0, 0.08, 0)), mat(boots, 0.9)), foot);
      this.knees.push(knee);
      this.feet.push(foot);
      this.hips.add(hip);
      return hip;
    });

    // Tronco: pélvis, peito, ombros.
    this.torso = new THREE.Group();
    this.torso.position.y = B.torsoY;
    this.body.add(this.torso);
    this.chest = add(new THREE.Mesh(geo('chest', () => new THREE.CapsuleGeometry(0.145, 0.3, 4, 12).translate(0, 0.37, 0)), mat(shirt)), this.torso);
    this.chest.scale.set(1.04 * build, 1, 0.64 * build);
    add(new THREE.Mesh(geo('belly', () => new THREE.CapsuleGeometry(0.135, 0.12, 4, 12).translate(0, 0.14, 0)), mat(shirt)), this.torso)
      .scale.set(1.0 * build, 1, 0.68 * build);
    add(new THREE.Mesh(geo('pelvis', () => new THREE.CapsuleGeometry(0.15, 0.08, 4, 12).translate(0, -0.02, 0)), legMat), this.torso)
      .scale.set(1.06 * build, 1, 0.72 * build);
    for (const side of [-1, 1]) {
      add(new THREE.Mesh(geo('shoulder', () => new THREE.SphereGeometry(0.058, 10, 8)), mat(shirt)), this.torso)
        .position.set(side * (B.shoulderHalfWidth - 0.01) * build, B.shoulderY + 0.005, 0);
    }
    if (robe) {
      add(new THREE.Mesh(geo('robe', () => new THREE.CylinderGeometry(0.2, 0.34, 0.9, 12, 1, true).translate(0, -0.42, 0)), mat(shirt)), this.torso)
        .material.side = THREE.DoubleSide;
    }
    if (cape) { // manto de pele / sobretudo: meia-casca nas costas, dos ombros até os joelhos
      const m = add(new THREE.Mesh(geo('cape', () => new THREE.CylinderGeometry(0.21, 0.33, 1.05, 12, 1, true, Math.PI / 2, Math.PI).translate(0, 0.08, -0.01)), mat(cape, 1)), this.torso);
      m.material.side = THREE.DoubleSide;
      m.scale.set(build, 1, 0.82 * build);
      add(new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.12, 0.045, 6, 14).rotateX(Math.PI / 2).translate(0, 0.6, 0)), mat(cape, 1)), this.torso);
    }
    if (apron) add(new THREE.Mesh(geo('apron', () => new THREE.BoxGeometry(0.26, 0.6, 0.02).translate(0, 0.08, 0.13)), mat(apron, 0.95)), this.torso).scale.x = build;
    if (armor) {
      add(new THREE.Mesh(geo('cuirass', () => new THREE.CapsuleGeometry(0.155, 0.26, 4, 12).translate(0, 0.36, 0)), mat(armor, 0.35)), this.torso)
        .scale.set(1.08 * build, 1, 0.7 * build);
      for (const side of [-1, 1]) {
        add(new THREE.Mesh(geo('pauldron', () => new THREE.SphereGeometry(0.078, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), mat(armor, 0.35)), this.torso)
          .position.set(side * (B.shoulderHalfWidth - 0.005) * build, B.shoulderY + 0.02, 0);
      }
    }
    if (straps) for (const side of [-1, 1]) {
      add(new THREE.Mesh(geo('strap', () => new THREE.BoxGeometry(0.035, 0.52, 0.012)), mat(straps, 0.8)), this.torso)
        .position.set(0, 0.36, side * 0.095 * build);
      this.torso.children[this.torso.children.length - 1].rotation.z = side * 0.55;
    }

    // Cabeça e rosto.
    this.head = new THREE.Group();
    this.head.position.y = B.headY;
    this.torso.add(this.head);
    add(new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.048, 0.06, 0.13, 10)), skinMat), this.head).position.y = -0.01;
    add(new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.105, 18, 14).scale(0.9, 1.08, 0.98)), skinMat), this.head).position.y = 0.14;
    add(new THREE.Mesh(geo('jaw', () => new THREE.SphereGeometry(0.088, 14, 10).scale(0.86, 0.78, 0.9)), skinMat), this.head).position.set(0, 0.075, 0.012);
    add(new THREE.Mesh(geo('nose', () => new THREE.ConeGeometry(0.018, 0.05, 6).rotateX(Math.PI / 2 + 0.25)), skinMat), this.head).position.set(0, 0.125, 0.1);
    for (const side of [-1, 1]) {
      add(new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1, 0.8)), skinMat), this.head).position.set(side * 0.095, 0.135, -0.01);
      add(new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.016, 10, 8)), mat(0xf2ede2, 0.35)), this.head).position.set(side * 0.036, 0.15, 0.082);
      add(new THREE.Mesh(geo('pupil', () => new THREE.SphereGeometry(0.0075, 8, 6)), mat(0x1a1008, 0.3)), this.head).position.set(side * 0.036, 0.15, 0.095);
      add(new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.038, 0.008, 0.012)), mat(hair ?? 0x1a1008, 1)), this.head)
        .position.set(side * 0.037, 0.176, 0.088);
    }
    add(new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.04, 0.006, 0.01)), mat(0x3a1c18, 0.7)), this.head).position.set(0, 0.075, 0.09);
    if (hair !== null) {
      add(new THREE.Mesh(geo('hair', () => new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58)), mat(hair, 1)), this.head)
        .position.set(0, 0.145, -0.01);
    }
    if (hat === 'straw') {
      add(new THREE.Mesh(geo('hatBrim', () => new THREE.CylinderGeometry(0.22, 0.22, 0.015, 20)), mat(0xc8a868, 1)), this.head).position.y = 0.23;
      add(new THREE.Mesh(geo('hatTop', () => new THREE.CylinderGeometry(0.09, 0.11, 0.1, 16)), mat(0xc8a868, 1)), this.head).position.y = 0.28;
    } else if (hat === 'helmet') {
      add(new THREE.Mesh(geo('helmet', () => new THREE.SphereGeometry(0.125, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), mat(0x5a5a5e, 0.4)), this.head).position.y = 0.16;
    } else if (hat === 'fur') {
      add(new THREE.Mesh(geo('furHat', () => new THREE.CylinderGeometry(0.12, 0.125, 0.13, 14)), mat(hatColor ?? 0x6a4a30, 1)), this.head).position.y = 0.24;
    } else if (hat === 'hood') {
      add(new THREE.Mesh(geo('hood', () => new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)), mat(hatColor ?? shirt, 1)), this.head).position.set(0, 0.15, -0.015);
    } else if (hat === 'wrap') {
      add(new THREE.Mesh(geo('wrap', () => new THREE.TorusGeometry(0.1, 0.035, 8, 16).rotateX(Math.PI / 2)), mat(shirt)), this.head).position.y = 0.2;
    }

    // Braços: ombro → cotovelo → mão (palma, dedos, polegar).
    this.elbows = [];
    this.hands = [];
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * B.shoulderHalfWidth * build, B.shoulderY, 0);
      this.torso.add(shoulder);
      add(new THREE.Mesh(geo('upperArm', () => new THREE.CapsuleGeometry(0.052, B.upperArm - 0.1, 4, 10).translate(0, -B.upperArm / 2, 0)), mat(shirt)), shoulder);
      const elbow = new THREE.Group();
      elbow.position.y = -B.upperArm;
      shoulder.add(elbow);
      add(new THREE.Mesh(geo('forearm', () => new THREE.CapsuleGeometry(0.044, B.forearm - 0.1, 4, 10).translate(0, -B.forearm / 2, 0)), skinMat), elbow);
      const hand = new THREE.Group();
      hand.position.y = -B.forearm;
      elbow.add(hand);
      add(new THREE.Mesh(geo('palm', () => new THREE.BoxGeometry(0.07, 0.085, 0.03).translate(0, -0.04, 0)), handMat), hand);
      add(new THREE.Mesh(geo('fingers', () => new THREE.BoxGeometry(0.066, 0.06, 0.027).translate(0, -0.11, 0.004)), handMat), hand);
      add(new THREE.Mesh(geo('thumb', () => new THREE.CapsuleGeometry(0.011, 0.035, 3, 6).translate(0, -0.04, 0)), handMat), hand)
        .position.set(0, -0.01, 0.028);
      this.elbows.push(elbow);
      this.hands.push(hand);
      return shoulder;
    });

    if (accessory === 'spear') {
      const spear = new THREE.Group();
      add(new THREE.Mesh(geo('shaft', () => new THREE.CylinderGeometry(0.018, 0.018, 2.1, 6)), mat(0x5a3e26)), spear);
      add(new THREE.Mesh(geo('tip', () => new THREE.ConeGeometry(0.035, 0.22, 6).translate(0, 1.15, 0)), mat(0x9a9a9a, 0.3)), spear);
      spear.position.set(0, 0.1, 0.03);
      this.hands[1].add(spear);
    } else if (accessory === 'staff') {
      const staff = add(new THREE.Mesh(geo('staff', () => new THREE.CylinderGeometry(0.022, 0.026, 1.6, 6)), mat(0x4a3420)), this.hands[1]);
      staff.position.set(0, -0.2, 0.03);
    } else if (accessory === 'rifle') {
      const r = add(new THREE.Mesh(geo('rifle', () => new THREE.BoxGeometry(0.05, 1.1, 0.07)), mat(0x2b2118)), this.hands[1]);
      r.position.set(0, -0.15, 0.08);
      r.rotation.x = 0.25;
    } else if (accessory === 'basket') {
      const b = add(new THREE.Mesh(geo('basket', () => new THREE.CylinderGeometry(0.2, 0.15, 0.16, 12)), mat(0xa88a5a, 1)), this.head);
      b.position.y = 0.3;
    }

    if (mergeParts) mergeJointParts(this.root, new Set([this.chest]));
    this.torso.rotation.x = hunch;
    this.walk = 0; // 0 parado → 1 andando (suavizado)
    this.run = 0; // 0 andando → 1 correndo
    this.air = 0; // 0 no chão → 1 no ar
    this.punchT = 0; // 1→0 enquanto o soco anima
    this.punchDuration = 0.3;
    this.flinchT = 0; // 1→0 enquanto recua de um golpe
    this.scale = s;

    // Suavização por quatérnio: cada junta guarda a rotação mostrada no quadro
    // anterior; a pose calculada vira alvo e a junta faz slerp até ele.
    this.joints = [this.body, this.hips, this.torso, this.head, ...this.legs, ...this.knees, ...this.feet, ...this.arms, ...this.elbows, ...this.hands];
    this.shown = this.joints.map((j) => j.quaternion.clone());
    this.shownPos = this.body.position.clone();
    this.mode = 'land';
    this.transitionT = 0;
    this.swimMove = 0;
    this.strokePhase = Math.random() * TAU;
    this.armAng = [-0.45, -0.45]; // ângulo integrado do ombro na água (rad)
    this.fadeFrom = this.joints.map((j) => j.quaternion.clone());
    this.fadeFromPos = new THREE.Vector3();
    this.ik = [0, 0]; // compensação suavizada de cada pé (m)
    this.ikDrop = 0;
    this.slope = 0;
  }

  /** Começa a animação de soco (preparo, golpe com giro do tronco, recolhe). */
  punch(duration = 0.3) {
    this.punchDuration = duration;
    this.punchT = 1;
  }

  /** Começa o recuo de quem levou um golpe. */
  flinch() {
    this.flinchT = 1;
  }

  /**
   * Pose de corpo inteiro para este quadro.
   * @param {number} dt segundos (do relógio principal do jogo)
   * @param {number} speed velocidade horizontal (m/s)
   * @param {{ swimming?: boolean, sprinting?: boolean, grounded?: boolean, flying?: boolean,
   *   ground?: ((x: number, z: number) => number) | null }} [state]
   *   `ground`: altura do chão no ponto (liga a inclinação na rampa e o IK dos pés)
   */
  update(dt, speed = 0, { swimming = false, sprinting = false, grounded = true, flying = false, ground = null } = {}) {
    const H = ANIMATION.human;
    this.idleT += dt;
    const mode = flying ? 'fly' : swimming ? 'swim' : 'land';
    if (mode !== this.mode) {
      // Crossfade: congela a pose mostrada; o alvo novo entra com ease-in-out.
      this.mode = mode;
      this.transitionT = H.transition;
      this.shown.forEach((q, i) => this.fadeFrom[i].copy(q));
      this.fadeFromPos.copy(this.shownPos);
      if (mode !== 'land') this.armAng = this.arms.map((a) => new THREE.Euler().setFromQuaternion(a.quaternion).x);
    }
    this.transitionT = Math.max(0, this.transitionT - dt);
    // Pose do zero a cada quadro (os ângulos abaixo são o alvo absoluto).
    for (const j of this.joints) j.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    if (mode === 'land') this.updateLand(dt, speed, sprinting, grounded, ground);
    else this.updateSwim(dt, speed, mode === 'fly');
    this.applyActions(dt);
    this.settle(dt);
  }

  /**
   * Leva cada junta da pose mostrada até a pose-alvo deste quadro por slerp.
   * Taxa alta em locomoção, mais alta no golpe (nítido), baixa logo depois de
   * trocar terra ↔ água ↔ voo (crossfade de ~0,35 s).
   */
  settle(dt) {
    const H = ANIMATION.human;
    if (this.transitionT > 0) {
      // Dentro da janela: peso da pose nova cresce em ease-in-out (sem "chute" inicial).
      const u = 1 - this.transitionT / H.transition;
      const wgt = u * u * (3 - 2 * u);
      for (let i = 0; i < this.joints.length; i++) {
        const j = this.joints[i];
        _qA.copy(j.quaternion);
        j.quaternion.copy(this.fadeFrom[i]).slerp(_qA, wgt);
        this.shown[i].copy(j.quaternion);
      }
      this.shownPos.lerpVectors(this.fadeFromPos, this.body.position, wgt);
      this.body.position.copy(this.shownPos);
      return;
    }
    const rate = this.punchT > 0 || this.flinchT > 0 ? H.actionRate : H.jointRate;
    const k = dampFactor(rate, dt);
    for (let i = 0; i < this.joints.length; i++) {
      const j = this.joints[i];
      _qA.copy(j.quaternion);
      j.quaternion.copy(this.shown[i]).slerp(_qA, k);
      this.shown[i].copy(j.quaternion);
    }
    this.shownPos.lerp(this.body.position, dampFactor(rate * 0.8, dt));
    this.body.position.copy(this.shownPos);
  }

  /** Andar, correr, pular e ficar parado (no chão). */
  updateLand(dt, speed, sprinting, grounded, ground) {
    const B = BODY;
    const moving = speed > 0.2;
    this.walk = approach(this.walk, moving ? 1 : 0, moving ? 9 : 7, dt);
    this.run = approach(this.run, sprinting && moving ? 1 : 0, 6, dt);
    this.air = approach(this.air, grounded ? 0 : 1, 10, dt);
    const w = this.walk, r = this.run, a = this.air;
    const stride = B.strideWalk + (B.strideRun - B.strideWalk) * r;
    // Um ciclo de seno = dois passos (um por perna).
    if (moving) this.phase += dt * (Math.PI * speed) / stride;
    else this.phase = approach(this.phase, Math.round(this.phase / Math.PI) * Math.PI, 7, dt); // junta as pernas
    const ph = this.phase;
    const sw = Math.sin(ph), cs = Math.cos(ph);

    // Pernas: quadril balança; o joelho dobra enquanto a perna vem de trás
    // para a frente (e um pouco ao empurrar o chão). Correndo, dobra mais.
    const legAmp = (0.5 + 0.22 * r) * w;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      const hipSwing = sw * sg * legAmp;
      const swingFwd = Math.max(0, -cs * sg); // 1 no meio do balanço para a frente
      const pushOff = Math.max(0, sw * sg); // perna atrás, empurrando
      const bend = (swingFwd ** 1.3 * (1.0 + 1.0 * r) + pushOff * 0.25 * r) * legAmp + 0.12 * r * w;
      this.legs[i].rotation.x = hipSwing + 0.1 * r * w;
      this.knees[i].rotation.x = bend * (1 - a) + 1.0 * a;
      this.feet[i].rotation.x = -bend * 0.45 + pushOff * 0.35 * legAmp - 0.3 * a;
    }

    // Braços: contrário às pernas; cotovelo mais dobrado ao correr.
    const armAmp = (0.42 + 0.4 * r) * w;
    const elbowBend = 0.14 + (0.35 + 1.25 * r) * w;
    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      this.arms[i].rotation.x = -sw * sg * armAmp + 0.06 - 0.25 * r * w - 0.5 * a;
      this.arms[i].rotation.z = -sg * (0.1 + 0.08 * r + 0.35 * a);
      this.elbows[i].rotation.x = -(elbowBend + Math.max(0, -sw * sg) * 0.3 * armAmp + 0.6 * a);
      this.hands[i].rotation.x = -0.1;
    }

    // Tronco inclina para a frente ao correr e gira contra o quadril; a
    // cabeça compensa para seguir olhando em frente. Parado: respira e
    // muda o peso de perna; olha em volta de vez em quando.
    const idle = 1 - w;
    const lean = (0.04 + 0.26 * r) * w;
    this.torso.rotation.x = this.hunch + lean + Math.sin(this.idleT * 0.9) * 0.012 * idle;
    this.torso.rotation.y = sw * (0.07 + 0.08 * r) * w;
    this.hips.rotation.y = -sw * 0.08 * w;
    this.hips.rotation.z = sw * 0.035 * w;
    this.head.rotation.x = -lean * 0.75;
    this.head.rotation.y = -this.torso.rotation.y * 0.5 + Math.sin(this.idleT * 0.37) * Math.sin(this.idleT * 0.11) * 0.25 * idle;
    this.head.rotation.z = Math.sin(this.idleT * 0.23) * 0.04 * idle;
    this.chest.scale.y = 1 + Math.sin(this.idleT * 1.1) * 0.012 * idle;
    this.body.position.y = -Math.abs(sw) * (0.025 + 0.015 * r) * w;
    this.body.position.x = sw * 0.012 * w + Math.sin(this.idleT * 0.31) * 0.01 * idle;
    this.body.rotation.z = sw * 0.03 * w + Math.sin(this.idleT * 0.31) * 0.012 * idle;
    if (ground && ANIMATION.terrain.footIK) this.followTerrain(dt, ground, w, a);
  }

  /**
   * Seguimento do terreno: tronco inclina na rampa (sobe = inclina para a
   * frente) e cada pé encontra o chão — a pelve desce até o pé mais baixo e a
   * perna do lado mais alto dobra por IK de 2 ossos, com o pé paralelo à rampa.
   */
  followTerrain(dt, ground, w, air) {
    const T = ANIMATION.terrain, B = BODY, s = this.scale;
    const p = this.root.position, yaw = this.root.rotation.y;
    const on = 1 - air;
    const { pitch } = slopeTilt(ground, p.x, p.z, yaw, 0.35 * s, 0.12 * s);
    this.slope = approach(this.slope, clamp(pitch, -T.maxPitch, T.maxPitch) * on, T.rate, dt);
    this.torso.rotation.x += this.slope * T.humanLean * (0.4 + 0.6 * w);
    this.head.rotation.x -= this.slope * T.humanLean * 0.5;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const legLen = (B.thigh + B.shin) * s;
    const dh = [0, 0];
    for (let i = 0; i < 2; i++) {
      const lx = (i === 0 ? -1 : 1) * B.hipHalfWidth * s;
      const lz = -Math.sin(this.legs[i].rotation.x) * legLen + 0.05 * s;
      const h = ground(p.x + lx * c + lz * sn, p.z - lx * sn + lz * c) - p.y;
      // Degrau alto/buraco (chão de casa, ponte): não é rampa, não compensa.
      dh[i] = Math.abs(h) > T.footIKMax ? 0 : h;
    }
    const drop = Math.min(0, dh[0], dh[1]) * on;
    this.ikDrop = approach(this.ikDrop, drop, 14, dt);
    this.body.position.y += this.ikDrop;
    for (let i = 0; i < 2; i++) {
      this.ik[i] = approach(this.ik[i], Math.max(0, dh[i] - drop) * on, 14, dt);
      const lift = this.ik[i] * (1 - 0.4 * w); // perna no ar (balanço) compensa menos
      const ik = twoBoneIK(B.thigh * s, B.shin * s, legLen - lift);
      this.legs[i].rotation.x -= ik.hip;
      this.knees[i].rotation.x += ik.knee;
      this.feet[i].rotation.x += ik.hip - ik.knee - this.slope * on;
    }
  }

  /**
   * Na água (crawl ↔ boiando parado) e no voo (braços à frente, corpo esticado).
   * O corpo inteiro gira na altura do quadril; a pelve fica na linha d'água.
   */
  updateSwim(dt, speed, flying) {
    const H = ANIMATION.human, B = BODY, s = this.scale;
    this.swimMove = approach(this.swimMove, flying || speed > 0.2 ? 1 : 0, 3, dt);
    const c = this.swimMove, tr = 1 - c;
    if (!flying) this.strokePhase += dt * TAU * (H.swimStrokeHz * c + H.treadHz * tr);
    const sp = this.strokePhase;
    const t = this.idleT;

    // Corpo: deitado de bruços nadando, quase em pé boiando; flutua (seno).
    const pitch = 0.12 * tr + 1.42 * c;
    const hipH = B.hipY * s;
    const hipTarget = (0.92 * tr + 1.12 * c) * s;
    const bob = Math.sin(t * TAU * H.bobHz) * H.bobAmp * (flying ? 0.4 : 1);
    this.body.rotation.set(pitch, 0, 0);
    this.body.position.set(0, hipTarget - hipH * Math.cos(pitch) + bob, -hipH * Math.sin(pitch));

    // Rolagem do crawl (o tronco gira para o lado do braço que sai da água).
    const roll = flying ? 0 : Math.sin(sp) * 0.38 * c;
    this.torso.rotation.set(this.hunch * tr, roll, 0);
    this.hips.rotation.set(0, roll * 0.55, 0);
    // Cabeça olha à frente; no crawl vira para respirar a cada braçada.
    const breathe = flying ? 0 : Math.max(0, Math.sin(sp)) ** 3 * 0.85 * c;
    this.head.rotation.set(-0.72 * c - 0.08 * tr, breathe, 0);

    for (let i = 0; i < 2; i++) {
      const sg = i === 0 ? 1 : -1;
      // Pernas: pernada de crawl (3 por braçada) ou pedalar boiando.
      const kp = sp * 3 + i * Math.PI;
      const tp = sp + i * Math.PI;
      const flutter = flying ? 0.04 * Math.sin(t * 2 + i) : Math.sin(kp) * 0.3;
      this.legs[i].rotation.set(flutter * c + (-0.55 + Math.sin(tp) * 0.3) * tr, 0, -sg * 0.15 * tr);
      // Pernada de crawl: perna quase esticada, só o joelho "chicoteia" um pouco.
      this.knees[i].rotation.x = (flying ? 0.05 : 0.06 + Math.max(0, Math.sin(kp + 0.8)) * 0.22) * c + (1.0 + Math.sin(tp + 1) * 0.45) * tr;
      this.feet[i].rotation.x = 0.7 * c + 0.35 * tr;

      // Braços: moinho do crawl (gira 360°) ↔ remar de lado boiando. O ângulo
      // do ombro é INTEGRADO (nunca dá a volta "pelo outro lado"): persegue o
      // equivalente mais próximo do alvo, com velocidade limitada.
      const crawlT = flying ? Math.PI * 0.97 : sp + i * Math.PI;
      const restT = -0.45 + Math.sin(sp * 2) * 0.15;
      const ref = c > 0.5 ? crawlT : restT;
      const goal = ref + TAU * Math.round((this.armAng[i] - ref) / TAU);
      const maxStep = 7 * dt;
      this.armAng[i] += clamp((goal - this.armAng[i]) * dampFactor(10, dt), -maxStep, maxStep);
      const theta = this.armAng[i];
      this.arms[i].rotation.set(theta, 0, -sg * (0.12 * c + (1.05 + Math.sin(sp * 2) * 0.25) * tr));
      const rec = Math.sin(theta); // > 0: braço voltando por cima da água
      this.elbows[i].rotation.x = flying ? -0.05 : -(1.25 * Math.max(0, rec) + 0.35 * Math.max(0, -rec)) * c - 0.6 * tr;
      this.hands[i].rotation.set(-0.1, 0, Math.sin(sp * 2) * 0.4 * tr * sg);
    }
    this.chest.scale.y = 1 + Math.sin(t * 1.4) * 0.015;
  }

  /** Aplica soco/recuo por cima da pose atual. */
  applyActions(dt) {
    if (this.punchT > 0) {
      this.punchT = Math.max(0, this.punchT - dt / this.punchDuration);
      const p = 1 - this.punchT;
      // Preparo (0–0.18): braço direito recua, tronco gira para a direita.
      // Golpe (0.18–0.42): braço estica, tronco e quadril giram para a esquerda.
      // Recolhe (0.42–1).
      const wind = p < 0.18 ? easeOut(p / 0.18) : p < 0.42 ? 1 - (p - 0.18) / 0.24 : 0;
      const reach = p < 0.18 ? 0 : p < 0.42 ? easeOut((p - 0.18) / 0.24) : 1 - easeInOut((p - 0.42) / 0.58);
      const k = Math.min(1, wind + reach);
      const R = this.arms[1], L = this.arms[0];
      R.rotation.x = R.rotation.x * (1 - k) + 0.7 * wind - 1.7 * reach;
      R.rotation.z = R.rotation.z * (1 - k) + 0.25 * wind - 0.15 * reach;
      this.elbows[1].rotation.x = this.elbows[1].rotation.x * (1 - k) - 2.1 * wind - 0.12 * reach;
      this.hands[1].rotation.z = -0.9 * k; // punho fechado de lado
      // Guarda: braço esquerdo sobe na frente do rosto.
      L.rotation.x = L.rotation.x * (1 - k) - 1.15 * k;
      L.rotation.z = L.rotation.z * (1 - k) + 0.35 * k;
      this.elbows[0].rotation.x = this.elbows[0].rotation.x * (1 - k) - 2.3 * k;
      this.torso.rotation.y += 0.3 * wind - 0.5 * reach;
      this.torso.rotation.x += 0.14 * reach;
      this.hips.rotation.y += 0.1 * wind - 0.2 * reach;
      this.head.rotation.y += -0.2 * wind + 0.3 * reach;
    }
    if (this.flinchT > 0) {
      this.flinchT = Math.max(0, this.flinchT - dt * 3);
      const f = Math.sin(this.flinchT * Math.PI);
      this.torso.rotation.x -= f * 0.35;
      this.head.rotation.x -= f * 0.3;
      this.arms[0].rotation.x -= f * 0.6;
      this.arms[1].rotation.x -= f * 0.6;
    }
  }
}
