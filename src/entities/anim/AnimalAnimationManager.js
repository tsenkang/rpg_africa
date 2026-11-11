import * as THREE from 'three';
import { ANIMATION, ATTACK_STYLE } from '../../config/animation.js';
import {
  damp, dampFactor, clamp, smoothstep, attackEnvelope, legCycle, breathWave, twoBoneIK, fract,
} from './AnimMath.js';

const TAU = Math.PI * 2;
/** Estados em que o animal encara o jogador (cabeça vira para ele). */
const AWARE = new Set(['stalk', 'chase', 'attack', 'threat']);
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * Uma articulação animada por quatérnio. A cada quadro os sistemas SOMAM
 * desvios (x, y, z em rad) e `apply` faz o slerp da rotação atual até
 * `repouso × desvio` — rotações sempre suaves, sem gimbal nem quinas.
 */
class Joint {
  /** @param {THREE.Object3D} obj osso (`THREE.Bone`) ou grupo do corpo procedural */
  constructor(obj) {
    this.obj = obj;
    this.rest = obj.quaternion.clone();
    this.restScale = obj.scale.clone();
    this.target = new THREE.Quaternion();
    this.x = 0; this.y = 0; this.z = 0;
    this.sx = 1; this.sy = 1; this.sz = 1;
  }

  clear() {
    this.x = 0; this.y = 0; this.z = 0;
    this.sx = 1; this.sy = 1; this.sz = 1;
  }

  /** Soma um desvio de rotação (rad). */
  add(x = 0, y = 0, z = 0) {
    this.x += x; this.y += y; this.z += z;
  }

  /** @param {number} k fração do slerp neste quadro (0..1) */
  apply(k) {
    const s = this.obj.scale, r = this.restScale;
    s.set(s.x + (r.x * this.sx - s.x) * k, s.y + (r.y * this.sy - s.y) * k, s.z + (r.z * this.sz - s.z) * k);
    _e.set(this.x, this.y, this.z, 'YXZ');
    _q.setFromEuler(_e);
    this.target.copy(this.rest).multiply(_q);
    this.obj.quaternion.slerp(this.target, k);
  }
}

/**
 * AnimalAnimationManager — toda a animação de um animal.
 *
 * Três fontes de esqueleto, um só controlador:
 *  - **Clipes** (GLB com animações: lobo, alce, cérbero, víbora):
 *    `AnimationMixer` + `crossFadeTo` (0,2–0,4 s), troca andar↔galope com a fase
 *    sincronizada (as patas não "pulam"), ritmo do clipe amortecido pela
 *    velocidade real e camadas procedurais por cima (inclinação no terreno,
 *    olhar, avanço do bote).
 *  - **AutoRig** (GLB estático com esqueleto gerado: leão, zebra, onça…) e
 *  - **corpo procedural** (grupos como articulações): ciclos 100% procedurais —
 *    passo lateral / trote / galope misturados pela velocidade, duty factor
 *    (pata parada no chão durante o apoio), coluna que balança e flexiona,
 *    cabeça que acompanha o passo, cauda com atraso (follow-through),
 *    nado ondulatório, respiração e ataque em 3 fases.
 *
 * Toda rotação de osso passa por `Joint.apply` (quatérnio + slerp); todo peso
 * de estado é amortecido (`damp`) — nenhuma troca é seca.
 *
 * O relógio é o do jogo: `update(dt)` recebe o `dt` do `THREE.Clock`
 * principal (Game.update) e o repassa ao `mixer.update(dt)` — nada aqui
 * mede tempo por conta própria.
 *
 * @example
 *   const anim = new AnimalAnimationManager({ spec, speciesId: 'leao', pose, model, dims });
 *   const delay = anim.startAttack();        // dano no impacto, `delay` s depois
 *   anim.update(dt, { speed, state, stateTime, swimming, tilt, yawRate, look });
 */
export class AnimalAnimationManager {
  /**
   * @param {{ spec: object, speciesId?: string, pose: THREE.Object3D,
   *   model?: { object: THREE.Object3D, clips: THREE.AnimationClip[], names: object|null, rig?: object|null } | null,
   *   rig?: object|null, dims: { L: number, H: number, legTop: number, torsoH?: number },
   *   config?: typeof ANIMATION, rng?: () => number }} o
   *   `rig`: mapa de articulações (ossos do AutoRig ou grupos do corpo procedural):
   *   { spine: Object3D[], ribs, neck, head, jaw, tail: Object3D[], legs: [{ upper, lower, front, side }],
   *     extra: [{ role: 'wing'|'claw'|'insectLeg', obj, side, index }], chains: Object3D[][] }
   */
  constructor({ spec, speciesId = '', pose, model = null, rig = null, dims, config = ANIMATION, rng = Math.random }) {
    this.spec = spec;
    this.cfg = config;
    this.pose = pose;
    this.dims = { torsoH: dims.H * 0.3, ...dims };
    this.style = ATTACK_STYLE[speciesId] ?? 'bite';
    this.seed = rng() * 100;
    this.t = this.seed;
    this.phase = rng();
    this.swimPhase = rng();
    /** Fases integradas (frequência muda sem a fase pular). */
    this.tailPhase = rng();
    this.flapPhase = rng();
    this.speedS = 0;
    /** Pesos dos estados (todos amortecidos). */
    this.w = { move: 0, swim: 0, stalk: 0, combat: 0, threat: 0, dead: 0, fly: 0, glide: 0, graze: 0, leap: 0, aware: 0, trot: 0, gallop: 0 };
    this.attackT = -1;
    /** Agarrão (F2): pose de golpe sustentada enquanto segura a presa; `holdT` anima o rolamento. */
    this.hold = false;
    this.holdT = 0;
    this.deadSide = rng() < 0.5 ? -1 : 1;
    this.posBase = pose.position.clone();
    this.rootPos = new THREE.Vector3();
    this.rootRot = new THREE.Euler(0, 0, 0, 'YXZ');
    this.rootTarget = new THREE.Quaternion();
    this.tilt = { pitch: 0, roll: 0 };
    this.unit = 1 / (pose.scale.y || 1); // corpo procedural: pose escalada por `size`

    this.mixer = null;
    this.actions = {};
    this.current = null;
    this.headBone = null;
    if (model?.names && model.clips?.length) this.setupClips(model);
    this.joints = [];
    this.rig = rig ? this.bindRig(rig) : null;
  }

  // ------------------------------------------------------------ clipes
  setupClips(model) {
    this.mixer = new THREE.AnimationMixer(model.object);
    for (const [key, name] of Object.entries(model.names)) {
      const clip = THREE.AnimationClip.findByName(model.clips, name);
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (key === 'death' || key === 'attack') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions[key] = a;
    }
    model.object.traverse((o) => {
      if (o.isBone && !this.headBone && /^(Head|Neck)$/i.test(o.name)) this.headBone = o;
    });
    this.lookQ = new THREE.Quaternion();
    this.lookYaw = 0;
    this.play('idle', 0);
  }

  /**
   * Troca de clipe com `crossFadeTo`. `sync`: começa o próximo na mesma fase
   * relativa do atual (andar ↔ galope sem trocar a pata de apoio).
   */
  play(key, fade = this.cfg.blend.crossFade, { sync = false } = {}) {
    const next = this.actions[key];
    if (!next || this.current === key) return;
    const prev = this.actions[this.current];
    next.stopFading();
    next.stopWarping();
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (sync && prev && prev.isRunning()) next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
    else next.time = 0;
    next.paused = false;
    next.play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else {
      if (prev) prev.stop();
      if (fade > 0) next.fadeIn(fade);
    }
    this.current = key;
  }

  updateClips(dt, { speed, state }) {
    const spec = this.spec, b = this.cfg.blend;
    const gallop = speed > spec.walk * 2;
    const moving = speed > 0.1;
    const attacking = this.attackT >= 0;
    let key = 'idle';
    if (state === 'dead') key = 'death';
    else if (attacking && this.actions.attack) key = 'attack';
    else if (state === 'circle' || gallop) key = 'run';
    else if (moving) key = 'walk';
    else if ((spec.behavior === 'flee' || spec.behavior === 'passive') && this.w.graze > 0.5 && this.actions.eat) key = 'eat';
    if (!this.actions[key]) key = key === 'run' && this.actions.walk ? 'walk' : 'idle';
    const loco = (k) => k === 'walk' || k === 'run';
    const fade = key === 'death' ? b.deathFade : key === 'attack' ? b.attackFade : b.crossFade;
    if (key === 'attack' && this.current === 'attack' && this._restartAttack) {
      // Novo bote enquanto o anterior ainda toca: recomeça com mistura curta.
      this.current = null;
    }
    this._restartAttack = false;
    this.play(key, fade, { sync: loco(key) && loco(this.current) });
    // Ritmo dos passos acompanha a velocidade real (amortecido: sem trancos).
    const a = this.actions[this.current];
    if (a) {
      let ts = 1;
      if (this.current === 'walk') ts = clamp(speed / spec.walk, 0.55, 1.6);
      else if (this.current === 'run') ts = clamp(speed / (spec.run * 0.85), 0.6, 1.45);
      a.timeScale = damp(a.timeScale, ts, b.timeScaleRate, dt);
    }
    this.mixer.update(dt);
    // Olhar (aditivo, depois do mixer): cabeça vira para o jogador.
    if (this.headBone) {
      this.lookYaw = damp(this.lookYaw, this.lookTarget * this.w.aware, 5, dt);
      this.lookQ.setFromAxisAngle(_v.set(0, 1, 0), this.lookYaw);
      this.headBone.quaternion.multiply(this.lookQ);
    }
  }

  // ------------------------------------------------------------ rig procedural
  bindRig(rig) {
    const J = (o) => {
      if (!o) return null;
      const j = new Joint(o);
      this.joints.push(j);
      return j;
    };
    const legs = (rig.legs ?? []).map((l) => {
      const front = !!l.front, side = l.side ?? 1;
      const upper = J(l.upper), lower = J(l.lower);
      // Comprimentos dos ossos (para o IK do agachar).
      const len = l.len ?? this.dims.legTop;
      const kneeH = l.knee ?? len * 0.5;
      return { upper, lower, front, side, l1: Math.max(len - kneeH, len * 0.3), l2: Math.max(kneeH, len * 0.3), idx: (side < 0 ? 0 : 2) + (front ? 1 : 0) };
    });
    return {
      spine: (rig.spine ?? []).map(J).filter(Boolean),
      ribs: J(rig.ribs),
      neck: J(rig.neck),
      head: J(rig.head),
      jaw: J(rig.jaw),
      tail: (rig.tail ?? []).map(J).filter(Boolean),
      legs,
      biped: legs.length === 2,
      wings: (rig.extra ?? []).filter((e) => e.role === 'wing').map((e) => ({ j: J(e.obj), side: e.side })),
      claws: (rig.extra ?? []).filter((e) => e.role === 'claw').map((e) => ({ j: J(e.obj), side: e.side })),
      insectLegs: (rig.extra ?? []).filter((e) => e.role === 'insectLeg').map((e) => ({ j: J(e.obj), side: e.side, index: e.index ?? 0 })),
      chains: (rig.chains ?? []).map((c) => c.map(J).filter(Boolean)),
    };
  }

  /**
   * Começa um ataque (Antecipação → Impacto → Recuperação).
   * @returns {number} segundos até o impacto (quando o dano deve sair)
   */
  /**
   * Segura a presa (mordida no pescoço / rolamento da morte): mantém o golpe no
   * ápice até `setHold(false)`.
   * @example anim.setHold(true);
   */
  setHold(on) {
    this.hold = on;
    this.holdT = 0;
    if (!on) this.attackT = -1;
  }

  startAttack() {
    const env = this.cfg.attack[this.style] ?? this.cfg.attack.bite;
    this.attackT = 0;
    this._restartAttack = true;
    if (this.mixer && this.actions.attack) {
      const clip = this.actions.attack.getClip();
      this.attackLen = clip.duration;
      return clip.duration * 0.42;
    }
    this.attackLen = env.anticipation + env.impact + env.recovery;
    return env.anticipation + env.impact * 0.5;
  }

  /**
   * Um quadro de animação.
   * @param {number} dt segundos (do relógio principal)
   * @param {{ speed: number, state: string, stateTime?: number, swimming?: boolean,
   *   tilt?: { pitch: number, roll: number }, yawRate?: number, leaping?: boolean, look?: number, feeding?: boolean }} ctx
   *   `feeding`: comendo uma carcaça (cabeça baixa, puxões)
   */
  update(dt, ctx) {
    const cfg = this.cfg, spec = this.spec, w = this.w;
    const { speed, state, stateTime = 0, swimming = false, tilt = null, yawRate = 0, leaping = false, look = 0, feeding = false } = ctx;
    this.t += dt;
    this.dt = dt;
    this.feeding = feeding;
    const rate = cfg.blend.stateRate;
    this.speedS = damp(this.speedS, speed, 6, dt);
    const v = this.speedS;
    const dead = state === 'dead';
    w.move = damp(w.move, speed > 0.1 && !dead ? 1 : 0, rate, dt);
    w.swim = damp(w.swim, swimming && !dead ? 1 : 0, cfg.blend.stateRate * 0.6, dt);
    w.stalk = damp(w.stalk, state === 'stalk' ? 1 : 0, rate, dt);
    w.combat = damp(w.combat, state === 'attack' || state === 'chase' ? 1 : 0, rate, dt);
    w.threat = damp(w.threat, state === 'threat' ? 1 : 0, rate, dt);
    w.dead = damp(w.dead, dead ? 1 : 0, 3.2, dt);
    w.fly = damp(w.fly, state === 'fly' || state === 'circle' ? 1 : 0, 5, dt);
    w.glide = damp(w.glide, state === 'circle' && Math.sin(this.t * 0.7) > 0.2 ? 1 : 0, 2.5, dt);
    w.leap = damp(w.leap, leaping ? 1 : 0, 14, dt);
    w.aware = damp(w.aware, AWARE.has(state) ? 1 : 0, 4, dt);
    const herb = spec.behavior === 'flee' || spec.behavior === 'passive';
    // Comendo carcaça (F4): mesma pose de cabeça baixa e mastigar, com puxões mais fortes.
    const wantGraze = feeding || (herb && state === 'idle' && Math.sin(this.t * 0.23 + this.seed) > 0.1);
    w.graze = damp(w.graze, wantGraze ? 1 : 0, 1.6, dt);
    w.trot = damp(w.trot, smoothstep(spec.walk * 1.25, spec.walk * 2.6, v), 4, dt);
    w.gallop = damp(w.gallop, smoothstep(spec.run * 0.45, spec.run * 0.78, v), 4, dt);
    this.lookTarget = clamp(look, -0.9, 0.9);

    if (this.attackT >= 0) {
      this.attackT += dt;
      if (this.attackT > (this.attackLen ?? 1) || dead) this.attackT = -1;
    }
    if (tilt) {
      this.tilt.pitch = damp(this.tilt.pitch, tilt.pitch, cfg.terrain.rate, dt);
      this.tilt.roll = damp(this.tilt.roll, tilt.roll, cfg.terrain.rate, dt);
    }

    // Corpo inteiro (raiz da pose): parte comum aos três modos.
    this.rootPos.set(0, 0, 0);
    this.rootRot.set(-clamp(this.tilt.pitch, -cfg.terrain.maxPitch, cfg.terrain.maxPitch) * (1 - w.dead),
      0, clamp(this.tilt.roll, -cfg.terrain.maxRoll, cfg.terrain.maxRoll) * (1 - w.dead) * (1 - w.swim));
    // Inclina para dentro da curva correndo.
    this.rootRot.z += clamp(-yawRate * v * 0.02, -1, 1) * cfg.gait.turnBank;

    if (this.mixer) {
      this.updateClips(dt, ctx);
      this.layerAttackRoot(0.5);
    } else if (this.rig) {
      this.updateRig(dt, { v, state, stateTime, yawRate });
    }
    this.layerSpecialRoot(state, stateTime);
    this.applyRoot(dt);
  }

  /** Avanço/recuo do corpo no bote (também por cima dos clipes). */
  layerAttackRoot(scale = 1) {
    const P = this.cfg.attack[this.style] ?? this.cfg.attack.bite;
    if (this.hold) { // agarrado: golpe congelado no ápice; jacaré gira no eixo do corpo
      this.holdT += this.dt ?? 0;
      const { L } = this.dims;
      this.rootPos.z += P.reach * L * scale;
      if (this.style === 'deathRoll') this.rootRot.z += this.holdT * 9;
      else this.rootRot.z += Math.sin(this.holdT * 14) * 0.08; // sacode a presa
      return { wind: 0, lunge: 1, P };
    }
    if (this.attackT < 0) return;
    const { wind, lunge } = attackEnvelope(this.attackT, P);
    const { L, H } = this.dims;
    this.rootPos.z += (-wind * 0.35 + lunge) * P.reach * L * scale;
    this.rootPos.y += Math.sin(Math.min(1, lunge) * Math.PI * 0.5) * P.leap * H * scale;
    return { wind, lunge, P };
  }

  /** Estados que movem o corpo todo: voo, enterrar, morrer (corpo procedural). */
  layerSpecialRoot(state, stateTime) {
    const { H } = this.dims;
    if (state === 'fly') this.rootPos.y += Math.min(25, stateTime * stateTime * 3 + stateTime * 2);
    if (state === 'burrow') this.rootPos.y -= stateTime * H * 1.2;
    if (!this.mixer && this.w.dead > 0.001) {
      // Tomba de lado (o corpo procedural/AutoRig não tem clipe de morte).
      const k = this.w.dead;
      this.rootRot.z += this.deadSide * k * Math.PI * 0.47;
      this.rootPos.y += k * (this.dims.torsoH * 0.35 - this.dims.legTop * 0.15);
      this.rootPos.x -= this.deadSide * k * this.dims.legTop * 0.6;
    }
  }

  applyRoot(dt) {
    const p = this.pose;
    const u = this.unit;
    const k = dampFactor(this.cfg.blend.rootRate, dt);
    p.position.x = damp(p.position.x, this.posBase.x + this.rootPos.x * u, 22, dt);
    p.position.y = damp(p.position.y, this.posBase.y + this.rootPos.y * u, 22, dt);
    p.position.z = damp(p.position.z, this.posBase.z + this.rootPos.z * u, 22, dt);
    this.rootTarget.setFromEuler(this.rootRot);
    p.quaternion.slerp(this.rootTarget, k);
  }

  /** Pose procedural completa (AutoRig e corpo procedural). */
  updateRig(dt, { v, state, stateTime, yawRate }) {
    const cfg = this.cfg, g = cfg.gait, w = this.w, R = this.rig, spec = this.spec;
    const { L, H, legTop } = this.dims;
    for (const j of this.joints) j.clear();
    const legLen = Math.max(legTop, H * 0.15);

    // ---- relógio da passada (contínuo: trocar de andadura não pula a fase)
    const hz = clamp(g.cadenceK * Math.sqrt(Math.max(v, 0.05) / legLen), g.minHz, g.maxHz);
    this.phase = fract(this.phase + hz * dt * (w.move > 0.01 ? 1 : 0.25));
    this.swimPhase = fract(this.swimPhase + cfg.swim.hz * dt * (0.45 + 0.55 * w.move));
    const ph = this.phase;
    const land = (1 - w.swim) * (1 - w.dead) * (1 - w.fly);
    const loco = w.move * land;
    const wg = w.gallop, wt = w.trot * (1 - wg), ww = (1 - w.trot) * (1 - wg);
    const idle = (1 - w.move) * (1 - w.dead);

    // ---- pernas: ciclo com apoio (duty) misturado por andadura
    if (R.biped) this.bipedLegs(ph, v, hz, legLen, loco);
    else {
      for (const leg of R.legs) {
        let swing = 0, lift = 0, amp = 0;
        for (const [gait, wgt] of [['walk', ww], ['trot', wt], ['gallop', wg]]) {
          if (wgt < 1e-3) continue;
          const duty = g.duty[gait];
          const c = legCycle(fract(ph + g.phases[gait][leg.idx]), duty);
          const A = Math.min(g.maxSwing, (v * duty) / (2 * hz * legLen));
          swing += c.swing * A * wgt;
          lift += c.lift * wgt;
          amp += A * wgt;
        }
        leg.upper?.add(-swing * loco - lift * 0.22 * loco * amp);
        leg.lower?.add(lift * g.kneeLift * loco * (leg.front ? 1 : 0.85) * clamp(amp * 2.2, 0.35, 1));
        // Galope: pernas esticam no ar (dianteiras à frente, traseiras atrás).
        if (w.leap > 0.01) {
          leg.upper?.add(leg.front ? -0.95 * w.leap : 0.75 * w.leap);
          leg.lower?.add(leg.front ? 0.2 * w.leap : 0.1 * w.leap);
        }
      }
    }

    // ---- coluna: balanço lateral (passo) e flexão (galope)
    const nS = R.spine.length;
    const sway = Math.sin(ph * TAU) * g.spineSway * (spec.model === 'croc' ? 4 : 1);
    const flex = Math.sin(ph * TAU) * g.spineFlex * wg;
    const turn = clamp(yawRate, -2.5, 2.5) * g.turnSpine * 0.4;
    R.spine.forEach((j, i) => {
      const t = nS > 1 ? i / (nS - 1) : 0.5; // 0 = pelve, 1 = peito
      j.add((t < 0.5 ? flex : -flex) * loco, (sway * (t < 0.5 ? 1 : -0.6) * (ww + wt) + turn * t) * loco, 0);
    });
    // Sobe-desce do corpo: 2 vezes por ciclo no passo/trote, 1 no galope.
    this.rootPos.y += (-(0.5 - 0.5 * Math.cos(ph * TAU * 2)) * g.bob * H * (ww + wt) + Math.sin(ph * TAU) * g.bob * 1.8 * H * wg) * loco;
    // Galope: o corpo balança no eixo (cabeça sobe, garupa desce).
    this.rootRot.x += Math.sin(ph * TAU + 0.6) * 0.05 * wg * loco;

    // ---- cabeça e pescoço: acompanham o passo (contrabalanço) e estabilizam
    const nod = (Math.sin(ph * TAU * 2 + 0.7) * g.headNod * (ww + wt * 0.6) + Math.sin(ph * TAU + 1.2) * g.headNod * 1.6 * wg) * loco;
    R.neck?.add(nod, turn * 0.6 * loco, 0);
    R.head?.add(-nod * 0.55, turn * 0.4 * loco, 0);

    // ---- repouso: respiração, olhar em volta, pastar
    const br = breathWave(this.t, cfg.breath.hz) * idle;
    if (R.ribs) { R.ribs.sx = 1 + cfg.breath.ribs * br; R.ribs.sy = 1 + cfg.breath.ribs * br * 0.8; }
    if (nS) R.spine[Math.floor((nS - 1) / 2)].add(-br * cfg.breath.spine, 0, 0);
    const lookAround = Math.sin(this.t * cfg.breath.lookHz * TAU) * Math.sin(this.t * cfg.breath.lookHz * 0.37 * TAU + 1.3) * cfg.breath.lookYaw;
    const lookY = lookAround * idle * (1 - w.graze) * (1 - w.aware) + this.lookTarget * w.aware * (1 - w.dead);
    R.neck?.add(-br * cfg.breath.head, lookY * 0.45, 0);
    R.head?.add(-br * cfg.breath.head * 0.5, lookY * 0.55, lookY * -0.08);
    const grazeAmp = H > L * 1.3 ? 0.35 : spec.model === 'camel' ? 0.75 : 0.95;
    R.neck?.add(w.graze * grazeAmp * land, 0, 0);
    R.head?.add(w.graze * 0.25 * land, 0, 0);
    R.jaw?.add(w.graze * Math.max(0, Math.sin(this.t * 8.5)) * 0.1, 0, 0); // mastiga
    if (this.feeding) R.neck?.add(Math.max(0, Math.sin(this.t * 3.1)) * 0.22 * land, Math.sin(this.t * 1.7) * 0.15, 0); // arranca pedaços

    // ---- cauda: onda com atraso + puxada pela curva (follow-through)
    const nT = R.tail.length;
    // Fase integrada: acelerar o abano não faz a cauda "pular".
    this.tailPhase = fract(this.tailPhase + (0.6 + 1.6 * loco + 0.8 * w.combat) * dt);
    R.tail.forEach((j, i) => {
      const k = (i + 1) / Math.max(1, nT);
      const wave = Math.sin(this.tailPhase * TAU - i * 0.75) * (0.08 + 0.22 * k) * (1 - w.dead * 0.85);
      j.add(-0.18 * wg * loco * (i === 0 ? 1 : 0.3) + w.dead * 0.15, wave - yawRate * 0.12 * k * loco, 0);
    });

    // ---- agachar (tocaia) — IK das pernas mantém as patas no chão
    const crouch = 0.28 * w.stalk + 0.08 * w.combat * (1 - w.stalk);
    if (crouch > 1e-3) this.crouchLegs(crouch, crouch);
    R.neck?.add(0.32 * w.stalk, 0, 0);
    R.head?.add(-0.22 * w.stalk, 0, 0);
    R.tail.forEach((j, i) => j.add(0.25 * w.stalk * (i === 0 ? 1 : 0), Math.sin(this.t * 6 + i) * 0.12 * w.stalk * (i === nT - 1 ? 1 : 0), 0));

    // ---- ameaça (gorila bate no peito; urso/outros encaram e balançam a cabeça)
    if (w.threat > 1e-3) this.threatPose(w.threat);

    // ---- ataque em 3 fases
    const atk = this.layerAttackRoot(1);
    if (atk) this.attackPose(atk);

    // ---- nado
    if (w.swim > 1e-3) this.swimPose(w.swim);

    // ---- voo (aves)
    if (R.wings.length || spec.model === 'bird') this.wingPose(state, stateTime);

    // ---- escorpião: 8 patas em tripé alternado
    for (const { j, side, index } of R.insectLegs) {
      const p = fract(ph * 1.6 + (index % 2 ? 0.5 : 0) + (side > 0 ? 0.5 : 0));
      const c = legCycle(p, 0.5);
      j.add(0, c.swing * 0.3 * loco * -side, -c.lift * 0.35 * loco * side + w.dead * side * 0.6);
    }

    // ---- morto: patas relaxam, cabeça cai
    if (w.dead > 1e-3) {
      for (const leg of R.legs) { leg.upper?.add(0.25 * w.dead * (leg.front ? -1 : 1)); leg.lower?.add(0.35 * w.dead); }
      R.neck?.add(0.35 * w.dead, 0, 0);
      R.jaw?.add(0.12 * w.dead, 0, 0);
    }

    // ---- aplica (slerp de todos os ossos)
    const k = dampFactor(cfg.blend.boneRate, dt);
    for (const j of this.joints) j.apply(k);
  }

  /** Bípede (avestruz): pernas alternadas, pescoço vai e volta (pombo). */
  bipedLegs(ph, v, hz, legLen, loco) {
    const B = this.cfg.biped, R = this.rig;
    const A = Math.min(B.maxSwing, (v * 0.55) / (2 * hz * legLen));
    for (const leg of R.legs) {
      const c = legCycle(fract(ph + (leg.side > 0 ? 0.5 : 0)), 0.55);
      leg.upper?.add(-c.swing * A * loco - c.lift * 0.3 * loco);
      leg.lower?.add(c.lift * B.kneeLift * loco * clamp(A * 2, 0.4, 1));
    }
    const bob = Math.sin(ph * TAU * 2 + 0.5);
    R.neck?.add(bob * B.headBob * 0.6 * loco, 0, 0);
    R.head?.add(-bob * B.headBob * 0.4 * loco, 0, 0);
    this.rootPos.y += -(0.5 - 0.5 * Math.cos(ph * TAU * 2)) * B.bob * this.dims.H * loco;
  }

  /** Flexiona as pernas por IK (2 ossos) e abaixa o corpo na mesma medida. */
  crouchLegs(front, back) {
    let drop = 0;
    for (const leg of this.rig.legs) {
      const amt = leg.front ? front : back;
      const full = leg.l1 + leg.l2;
      const ik = twoBoneIK(leg.l1, leg.l2, full * (1 - amt));
      leg.upper?.add(-ik.hip * (leg.front ? 0.6 : 1));
      leg.lower?.add(ik.knee * (leg.front ? 0.6 : 1));
      drop = Math.max(drop, full * amt);
    }
    this.rootPos.y -= drop * 0.85;
    // Frente e trás diferentes: o corpo inclina.
    if (Math.abs(front - back) > 1e-3) this.rootRot.x += (front - back) * 0.6;
  }

  threatPose(k) {
    const R = this.rig, t = this.t;
    if (this.spec.threat) {
      // Gorila: ergue o tronco e bate no peito com os braços alternados.
      this.rootRot.x -= 0.55 * k;
      this.rootPos.y += 0.08 * this.dims.H * k;
      for (const leg of R.legs) {
        if (!leg.front) { leg.upper?.add(-0.45 * k); leg.lower?.add(0.4 * k); continue; }
        const beat = Math.sin(t * 13 + (leg.side > 0 ? Math.PI : 0));
        leg.upper?.add((-1.25 + beat * 0.35) * k, 0, leg.side * -0.35 * k);
        leg.lower?.add((0.9 + beat * 0.3) * k);
      }
      R.head?.add(-0.25 * k, 0, 0);
      R.jaw?.add(0.25 * k * Math.max(0, Math.sin(t * 2.2)), 0, 0);
    } else {
      // Encara: cabeça baixa, rosna (boca entreaberta), balança o peso.
      R.neck?.add(0.3 * k, Math.sin(t * 1.4) * 0.12 * k, 0);
      R.head?.add(-0.2 * k, 0, 0);
      R.jaw?.add((0.15 + Math.sin(t * 9) * 0.05) * k, 0, 0);
      this.rootRot.z += Math.sin(t * 1.4) * 0.04 * k;
      this.crouchLegs(0.06 * k, 0.12 * k);
    }
  }

  /** Antecipação (recua, carrega as patas de trás) → impacto (salta, boca abre) → recuperação. */
  attackPose({ wind, lunge, P }) {
    const R = this.rig, s = this.style;
    const lun = Math.min(1, lunge);
    if (s === 'pounce' || s === 'bite') {
      const big = s === 'pounce' ? 1 : 0.6;
      this.crouchLegs(0.1 * wind, 0.3 * wind * big);
      R.spine.forEach((j, i) => j.add((i === R.spine.length - 1 ? 0.1 : -0.05) * wind, 0, 0));
      R.neck?.add(0.3 * wind - 0.4 * lun, 0, 0);
      R.head?.add(-0.12 * wind - 0.18 * lun, 0, 0);
      this.rootRot.x += 0.08 * wind - 0.22 * lun * big;
      for (const leg of R.legs) {
        if (leg.front) { leg.upper?.add(-0.95 * lun * big); leg.lower?.add(0.35 * lun); } else { leg.upper?.add(0.5 * lun * big); leg.lower?.add(-0.1 * lun); }
      }
      R.jaw?.add(0.6 * lun + 0.1 * wind, 0, 0);
      R.tail.forEach((j, i) => j.add(-0.25 * lun * (i ? 0.4 : 1), 0, 0));
    } else if (s === 'slam') {
      this.rootRot.x -= 0.5 * wind - 0.15 * lun;
      this.rootPos.y += 0.12 * this.dims.H * wind;
      for (const leg of R.legs) {
        if (leg.front) { leg.upper?.add(-1.2 * wind - 0.55 * lun, 0, -leg.side * 0.25 * wind); leg.lower?.add(0.7 * wind); } else { leg.upper?.add(-0.35 * wind); leg.lower?.add(0.4 * wind); }
      }
      R.head?.add(-0.3 * wind + 0.2 * lun, 0, 0);
      R.jaw?.add(0.45 * Math.max(wind, lun), 0, 0);
    } else if (s === 'headbutt') {
      this.crouchLegs(0.05 * wind, 0.18 * wind);
      R.neck?.add(0.55 * wind + 0.3 * lun, 0, 0);
      R.head?.add(0.2 * wind - 0.45 * lun, 0, 0);
      for (const leg of R.legs) if (!leg.front) leg.upper?.add(0.35 * lun);
    } else if (s === 'flankBite') {
      // Lobo/hiena: cabeça baixa e de lado, mordida no calcanhar e puxão.
      this.crouchLegs(0.12 * wind, 0.2 * wind);
      R.neck?.add(0.45 * wind + 0.25 * lun, 0.35 * lun, 0);
      R.head?.add(0.25 * lun, 0.3 * lun, 0);
      R.jaw?.add(0.65 * lun + 0.1 * wind, 0, 0);
      this.rootRot.y += 0.25 * lun;
      for (const leg of R.legs) if (!leg.front) leg.upper?.add(0.4 * lun);
    } else if (s === 'neckHoof') {
      // Girafa: pescoço recua e desce como martelo (de lado); patas da frente dão o casco rígido.
      R.neck?.add(-0.5 * wind + 1.1 * lun, 0.6 * wind - 0.9 * lun, 0);
      R.head?.add(-0.2 * wind + 0.4 * lun, 0, 0);
      this.rootRot.z += 0.12 * wind - 0.18 * lun;
      for (const leg of R.legs) if (leg.front) { leg.upper?.add(-0.9 * wind - 0.4 * lun); leg.lower?.add(0.5 * wind); }
      this.rootRot.x -= 0.15 * wind;
    } else if (s === 'deathRoll') {
      // Jacaré: bote reto e baixo saindo da água, mandíbula escancarada.
      R.neck?.add(-0.25 * wind - 0.15 * lun, 0, 0);
      R.jaw?.add(0.9 * Math.max(wind, lun), 0, 0);
      R.tail.forEach((j, i) => j.add(0, (i % 2 ? -1 : 1) * 0.35 * lun, 0));
      this.rootRot.x += 0.06 * lun;
    } else if (s === 'maul') {
      // Urso: fica em pé nas patas de trás e desce as garras de cima.
      this.rootRot.x -= 0.95 * wind - 0.55 * lun;
      this.rootPos.y += 0.35 * this.dims.H * wind;
      for (const leg of R.legs) {
        if (leg.front) { leg.upper?.add(-1.6 * wind + 1.4 * lun, 0, -leg.side * 0.4 * wind); leg.lower?.add(0.9 * wind - 0.4 * lun); } else { leg.upper?.add(-0.5 * wind); leg.lower?.add(0.5 * wind); }
      }
      R.head?.add(-0.35 * wind + 0.25 * lun, 0, 0);
      R.jaw?.add(0.5 * Math.max(wind, lun), 0, 0);
    } else if (s === 'groundPound') {
      // Gorila: ergue o tronco com os dois braços no alto e soca o chão com os punhos.
      this.rootRot.x -= 0.6 * wind - 0.35 * lun;
      this.rootPos.y += 0.18 * this.dims.H * wind - 0.08 * this.dims.H * lun;
      for (const leg of R.legs) if (leg.front) { leg.upper?.add(-1.8 * wind + 1.9 * lun, 0, -leg.side * 0.2); leg.lower?.add(0.4 * wind); }
      R.head?.add(-0.3 * wind + 0.3 * lun, 0, 0);
    } else if (s === 'rearKick') {
      // Zebra/alce: abaixa a frente, ergue a garupa e estica as patas de trás.
      this.rootRot.x += 0.35 * wind + 0.25 * lun;
      R.neck?.add(0.4 * (wind + lun), 0, 0);
      for (const leg of R.legs) {
        if (leg.front) leg.upper?.add(0.15 * wind);
        else { leg.upper?.add(-0.6 * wind + 1.5 * lun); leg.lower?.add(0.8 * wind - 0.6 * lun); }
      }
      R.tail.forEach((j) => j.add(-0.4 * lun, 0, 0));
    } else if (s === 'sting') {
      for (const chain of R.chains) chain.forEach((j, i) => j.add(-0.22 * wind + 0.5 * lun * (0.6 + i * 0.25), 0, 0));
      for (const { j, side } of R.claws) j.add(-0.25 * lun, side * (0.45 * wind - 0.35 * lun), 0);
      R.tail.forEach((j) => j.add(-0.2 * wind + 0.45 * lun, 0, 0));
    } else {
      // peck: pescoço recua e dá a bicada.
      R.neck?.add(-0.35 * wind + 0.7 * lun, 0, 0);
      R.head?.add(0.2 * lun, 0, 0);
    }
    void P;
  }

  /** Nado: corpo ondula no plano horizontal, patas remam, focinho para fora. */
  swimPose(k) {
    const R = this.rig, S = this.cfg.swim, sp = this.swimPhase;
    const tucked = !!this.spec.aquatic; // jacaré nada com a cauda, patas coladas
    for (const leg of R.legs) {
      const p = fract(sp + (leg.idx === 0 || leg.idx === 3 ? 0 : 0.5));
      const a = Math.sin(p * TAU) * S.paddle * (tucked ? 0.15 : 1);
      leg.upper?.add((-a + (tucked ? 0.9 : 0.15)) * k);
      leg.lower?.add((Math.max(0, Math.cos(p * TAU)) * 0.9 * (tucked ? 0.2 : 1) + 0.2) * k);
    }
    const nS = R.spine.length;
    // Onda corre da cabeça para a cauda (peito → pelve → cauda).
    R.spine.forEach((j, i) => j.add(0, Math.sin(sp * TAU - (nS - 1 - i) * S.wave) * S.undulate * k * (tucked ? 1.4 : 0.7), 0));
    R.tail.forEach((j, i) => j.add(0, Math.sin(sp * TAU - (nS + i) * S.wave) * S.tail * ((i + 1) / R.tail.length) * k, 0));
    R.neck?.add(-S.headUp * k, -Math.sin(sp * TAU) * S.undulate * 0.5 * k, 0);
    R.head?.add(-S.headUp * 0.4 * k, 0, 0);
    this.rootPos.y += Math.sin(sp * TAU * 2) * 0.012 * this.dims.H * k;
  }

  /** Aves: bater de asas, planar, recolher as pernas; no chão, bica. */
  wingPose(state, stateTime) {
    const R = this.rig, w = this.w, t = this.t;
    const flying = w.fly;
    const fast = state === 'fly';
    this.flapPhase = fract(this.flapPhase + (fast ? 3.5 : 1.45) * this.dt);
    const fp = this.flapPhase * TAU;
    const flap = Math.sin(fp) * (1 - w.glide * 0.85);
    for (const { j, side } of R.wings) j.add(0, 0, side * (flying * (flap * 0.85 + 0.25) + 0.05) * -1);
    for (const leg of R.legs) { leg.upper?.add(1.1 * flying); leg.lower?.add(-0.6 * flying); }
    if (state === 'circle') this.rootRot.z -= 0.35 * flying;
    this.rootRot.x -= 0.12 * flying * (fast ? 1 : 0.5);
    this.rootPos.y += Math.sin(fp) * 0.02 * flying;
    // No chão parado: bica o chão de vez em quando.
    const peck = Math.max(0, Math.sin(t * 3 + this.seed)) * (1 - w.move) * (1 - flying);
    R.neck?.add(0.6 * peck, 0, 0);
    void stateTime;
  }
}
