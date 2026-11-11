import * as THREE from 'three';
import { BLEED } from '../config/hunting.js';
import { AnimalBrain } from './AnimalBrain.js';
import { AnimalBody } from './AnimalBody.js';
import { WORLD } from '../config/worldConfig.js';
import { slopeTilt } from './anim/AnimMath.js';
import { SLOPE } from '../config/physics.js';
import { FAUNA_COMBAT, REAR_KICK } from '../config/faunaCombat.js';
import { PACKS } from '../config/ecosystem.js';
import { StatusEffects } from '../systems/fauna/StatusEffects.js';
import { flankPoint, isBehind, burstSpeed } from '../systems/fauna/AttackRules.js';
import { surfaceNormal, isUnwalkable, SlideState, steerAroundSlope } from '../systems/physics/SlopePhysics.js';

const _to = new THREE.Vector3();
const _steer = { x: 0, z: 0, blocked: false };
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
/** Material da hitbox: invisível, mas o Raycaster do soco acerta (não olha `visible`). */
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const HITBOX_GEO = new THREE.BoxGeometry(1, 1, 1);

/**
 * Um animal no mundo: corpo (`AnimalBody`) + IA (`AnimalBrain`) + movimento.
 * Anda sobre o terreno, evita água (menos quem nada, ex.: capivara), foge,
 * persegue e ataca conforme o estado da IA.
 *
 * @example
 *   const a = new Animal({ spec: SPECIES.leao, x, z, groundAt, fauna: FAUNA });
 *   scene.add(a.root);
 *   const { strike } = a.update(dt, player.position, playerAlive);
 */
export class Animal {
  /**
   * @param {{ spec: object, x: number, z: number, groundAt: (x:number,z:number)=>number,
   *   fauna: object, rng?: () => number, group?: number, speciesId?: string, model?: object|null, young?: boolean }} opts
   *   `young`: filhote (menor, mais lento, menos vida — presa preferida).
   *   `model`: cópia de `AnimalModels.instance()`; null = corpo procedural.
   */
  constructor({ spec, x, z, groundAt, fauna, rng = Math.random, group = 0, speciesId = '', model = null, young = false }) {
    /** Combate biomimético da espécie (F2): estilo, efeitos, agarrão, flanco, coice. */
    this.combat = FAUNA_COMBAT[speciesId] ?? {};
    // Quem antes só fugia (girafa, alce, zebra, camelo) ganha dano/alcance para revidar.
    this.spec = this.combat.stats ? { ...spec, ...this.combat.stats } : spec;
    if (young) {
      const y = PACKS.young;
      this.spec = { ...this.spec, size: this.spec.size * y.scale, walk: this.spec.walk * y.speed, run: this.spec.run * y.speed, health: Math.round(this.spec.health * y.health) };
    }
    /** Filhote (F3): fica no centro do círculo defensivo da manada. */
    this.young = young;
    spec = this.spec;
    this.speciesId = speciesId;
    this.fauna = fauna;
    this.rng = rng;
    this.group = group;
    this.groundAt = groundAt;
    this.brain = new AnimalBrain(spec, fauna, rng);
    this.body = new AnimalBody(spec, model, speciesId);
    this.root = this.body.root;
    this.root.position.set(x, groundAt(x, z), z);
    this.root.rotation.y = rng() * Math.PI * 2;
    this.addHitbox();
    this.home = new THREE.Vector3(x, 0, z);
    this.leapT = 0; // leopardo: tempo restante do salto
    /** Limite de inclinação: normal sob as patas e escorregão (SLIDING). */
    this.normal = { x: 0, y: 1, z: 0 };
    this.slide = new SlideState();
    this.sliding = false;
    this.circleA = rng() * Math.PI * 2; // arara: ângulo no círculo
    this.altitude = 0; // arara: altura atual do voo
    this.wanderTarget = new THREE.Vector3(x, 0, z);
    this.health = spec.health;
    /** Caça: sangrando (tiro no corpo), mancando (pernas), metros andados desde a última gota. */
    this.bleeding = false;
    this.limpT = 0;
    this.trailAcc = 0;
    this.skinned = false;
    this.speed = 0;
    this.stateTime = 0;
    this.deadTime = 0;
    this._lastState = this.brain.state;
    /** s até o impacto do bote em andamento (-1 = nenhum): o dano sai no impacto. */
    this.pendingStrike = -1;
    /** Atordoado, preso, lento, envenenado. */
    this.status = new StatusEffects();
    /** Segurando uma presa (agarrão) — o CombatAnimationSystem cola o corpo nela. */
    this.holding = false;
    this.kickCd = 0;
    this.pendingKick = -1;
    this.kickTarget = null;
    this.swimming = false;
    this._yaw = this.root.rotation.y;
    this._tilt = { pitch: 0, roll: 0 };
  }

  /**
   * Caixa invisível do tamanho do corpo (THREE.Box3 do modelo ou do
   * placeholder) — o soco (Raycaster) acerta nela sem depender da malha
   * animada (malha com esqueleto tem caixa errada).
   */
  addHitbox() {
    // Mede de frente (rotação zerada): a caixa vira filha do animal e gira com ele.
    const yaw = this.root.rotation.y;
    this.root.rotation.y = 0;
    this.root.updateMatrixWorld(true);
    _box.setFromObject(this.body.pose, true);
    this.root.rotation.y = yaw;
    if (_box.isEmpty()) return;
    _box.getSize(_size);
    _box.getCenter(_center);
    _center.sub(this.root.position); // centro relativo ao animal (ainda sem giro)
    const hit = new THREE.Mesh(HITBOX_GEO, HITBOX_MAT);
    // Rotacionado com o animal: tamanho local ≈ caixa em pé (+15% de folga).
    hit.scale.set(Math.max(_size.x, 0.3) * 1.15, Math.max(_size.y, 0.3) * 1.15, Math.max(_size.z, 0.3) * 1.15);
    hit.position.copy(_center);
    hit.name = 'hitbox';
    this.root.add(hit);
    this.hitbox = hit;
    hit.userData.animal = this;
    /** Raio/altura do corpo (física: corpo cinemático que empurra objetos). */
    this.bodyRadius = Math.max(0.2, Math.min(_size.x, _size.z) * 0.5);
    this.bodyHeight = Math.max(0.3, _size.y);
    /** Onde as patas tocam o chão (para inclinar o corpo na rampa). */
    this.halfLen = Math.max(0.15, _size.z * 0.38);
    this.halfWid = Math.max(0.1, _size.x * 0.4);
  }

  get position() {
    return this.root.position;
  }

  get alive() {
    return this.brain.state !== 'dead';
  }

  /** CombatAnimationSystem: começou/terminou de segurar a presa. */
  onGrapple(on) {
    this.holding = on;
    this.body.anim?.setHold(on);
  }

  /** Frente do corpo no chão (unitária). */
  forward(out = { x: 0, z: 0 }) {
    out.x = Math.sin(this.root.rotation.y); out.z = Math.cos(this.root.rotation.y);
    return out;
  }

  /** Quem está no cone de trás, perto o bastante para levar coice: o predador que ameaça, o agressor, ou o jogador. */
  kickCandidate(playerPos, playerAlive) {
    const p = this.root.position, fwd = this.forward(this._fwd ?? (this._fwd = { x: 0, z: 0 }));
    const near = (q) => Math.hypot(q.x - p.x, q.z - p.z) <= REAR_KICK.range && isBehind(p, fwd, q, REAR_KICK.rearCos);
    for (const o of [this.eco?.threat, this.eco?.retaliate]) if (o?.alive && near(o.position)) return o;
    if (playerAlive && near(playerPos)) return 'player';
    return null;
  }

  /**
   * Levou um golpe: perde vida, recua um pouco e reage.
   * `zone` (caça): 'head' = abate na hora; 'body' = sangra e foge deixando
   * rastro; 'legs' = manca. Sem zona (soco): foge ou ataca.
   */
  takeHit({ damage, direction, zone = null }) {
    if (!this.alive) return;
    if (zone === 'head') this.health = 0;
    else {
      this.health -= damage;
      if (zone === 'body') this.bleeding = true;
      if (zone === 'legs') this.limpT = BLEED.slowSeconds;
    }
    this.root.position.x += direction.x * 0.3;
    this.root.position.z += direction.z * 0.3;
    if (this.health <= 0) this.brain.die();
    else if (zone === 'body' || zone === 'legs') this.brain.startFleeing(); // ferido de longe: foge
    else this.brain.hurt();
    // Grande herbívoro (girafa, alce, camelo, gorila) provocado: revida com força em vez de fugir.
    if (this.alive && this.eco?.level === 3 && zone !== 'head') { this.brain.angry = true; this.brain.set('chase'); }
  }

  /**
   * Para onde a IA olha neste quadro (`EcosystemManager` preenche `this.eco`):
   *  - caçando um animal → ele; fugindo de um predador → ele;
   *  - senão o jogador. Predador alimentado (`eco.calm`) ignora o jogador até
   *    ser provocado (`brain.angry`); guardião/território seguem as regras deles.
   * @returns {{ pos: {x:number,z:number}, dist: number }} `victim` fica em `this.victim`
   */
  focusPoint(playerPos, playerAlive) {
    const p = this.root.position, e = this.eco, f = this._focus ?? (this._focus = { pos: { x: 0, z: 0 }, dist: Infinity });
    this.victim = null;
    // Revide (girafa/alce/gorila atacados por um predador): o agressor vira o alvo enquanto estiver perto.
    const rv = e?.retaliate?.alive && Math.hypot(e.retaliate.position.x - p.x, e.retaliate.position.z - p.z) < (e.retaliateRadius ?? 40) ? e.retaliate : null;
    if (e && !rv) e.retaliate = null;
    const t = rv ?? (e?.target && e.target !== 'player' && e.target.alive ? e.target : null);
    const th = !t && e?.threat?.alive ? e.threat : null;
    const o = t ?? th;
    if (o) {
      f.pos.x = o.position.x; f.pos.z = o.position.z;
      f.dist = Math.hypot(o.position.x - p.x, o.position.z - p.z);
      this.victim = t;
      return f;
    }
    f.pos.x = playerPos.x; f.pos.z = playerPos.z;
    f.dist = playerAlive ? Math.hypot(playerPos.x - p.x, playerPos.z - p.z) : Infinity;
    const b = this.spec.behavior;
    const hunter = b === 'aggressive' || b === 'pack' || b === 'stalker';
    if (e?.calm && hunter && !this.brain.angry && this.brain.state !== 'chase' && this.brain.state !== 'attack') f.dist = Infinity;
    return f;
  }

  /** Água funda demais para um animal que não nada? */
  isWater(x, z) {
    return this.groundAt(x, z) < WORLD.waterLevel - 0.15;
  }

  /** Há água a até `r` m deste ponto? (jacaré em terra: só na beira) */
  nearWater(x, z, r) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
      if (this.isWater(x + cx * r, z + cz * r) || this.isWater(x + cx * r * 0.5, z + cz * r * 0.5)) return true;
    }
    return false;
  }

  /** Lugar onde o animal não pode ir: água (terrestres) ou terra (aquáticos). */
  blocked(x, z) {
    if (this.spec.aquatic) return !this.isWater(x, z) && !(this.spec.landSpeed && this.nearWater(x, z, this.spec.shoreRange));
    return !this.spec.swims && this.isWater(x, z);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos
   * @param {boolean} playerAlive
   * @returns {{ strike: boolean, state: string }} `strike` = o golpe ACERTA agora
   *   (no meio do impacto da animação, não quando a IA decide atacar)
   */
  update(dt, playerPos, playerAlive = true) {
    const spec = this.spec;
    const p = this.root.position;
    // Foco (ecossistema): a presa que caça, o predador de quem foge, ou o jogador.
    const realPlayer = playerPos;
    const focus = this.focusPoint(playerPos, playerAlive);
    const dist = focus.dist;
    playerPos = focus.pos;
    const fromHome = Math.hypot(realPlayer.x - this.home.x, realPlayer.z - this.home.z);
    // Ecossistema manda caçar/fugir mesmo fora do raio de percepção da espécie.
    const st0 = this.brain.state;
    if (this.alive && (st0 === 'idle' || st0 === 'wander')) {
      if (this.victim) this.brain.set(spec.behavior === 'stalker' ? 'stalk' : 'chase');
      else if (this.eco?.threat && this.brain.fearful) this.brain.startFleeing();
    }
    const atHome = Math.hypot(p.x - this.home.x, p.z - this.home.z) < 3;
    const prev = this.brain.state;
    // Efeitos (F2): veneno tira vida; atordoado/preso/segurando não anda nem ataca.
    const poison = this.status.update(dt);
    if (poison > 0 && this.alive) { this.health -= poison; if (this.health <= 0) this.brain.die(); }
    const immobile = this.status.immobile || this.holding;
    const { state, strike: decided } = this.brain.tick(dt, dist, { fromHome, atHome });
    // Antecipação → impacto: a IA decide, a animação começa, o dano sai no impacto.
    let strike = false;
    if (decided && !immobile) this.pendingStrike = this.body.startAttack();
    if (this.pendingStrike >= 0) {
      this.pendingStrike -= dt;
      if (this.pendingStrike < 0) strike = this.alive && !this.status.stunned && dist <= (spec.attackRange ?? 1.5) * 1.5;
    }
    // Coice traseiro (zebra, alce): predador ou jogador colado atrás leva o casco.
    let kick = null;
    this.kickCd = Math.max(0, this.kickCd - dt);
    if (this.combat.rearKick && this.alive && !immobile) {
      if (this.pendingKick >= 0) {
        this.pendingKick -= dt;
        if (this.pendingKick < 0) {
          const t = this.kickTarget, q = t === 'player' ? realPlayer : t?.position;
          if (q && Math.hypot(q.x - p.x, q.z - p.z) <= REAR_KICK.range * 1.3 && (t === 'player' || t.alive)) kick = t;
        }
      } else if (this.kickCd <= 0) {
        const c = this.kickCandidate(realPlayer, playerAlive);
        if (c) { this.kickTarget = c; this.pendingKick = this.body.startAttack(); this.kickCd = REAR_KICK.cooldown; }
      }
    }
    // Leopardo: o fim da tocaia vira um salto em arco sobre o jogador.
    if (spec.leap && prev === 'stalk' && state === 'chase') this.leapT = 0.6;
    if (state !== this._lastState) {
      this._lastState = state;
      this.stateTime = 0;
      if (state === 'wander') this.pickWanderTarget();
    }
    this.stateTime += dt;

    let speed = 0;
    let heading = null; // direção desejada (ângulo y)
    switch (state) {
      case 'wander': {
        _to.set(this.wanderTarget.x - p.x, 0, this.wanderTarget.z - p.z);
        if (_to.lengthSq() > 0.5) { speed = spec.walk; heading = Math.atan2(_to.x, _to.z); }
        break;
      }
      case 'flee':
      case 'fly':
        speed = state === 'fly' ? spec.run * 0.6 : spec.run;
        heading = Math.atan2(p.x - playerPos.x, p.z - playerPos.z) + Math.sin(this.stateTime * 1.7) * 0.35;
        // Manada (F3): debandada num rumo comum, ou círculo defensivo em volta dos filhotes.
        if (state === 'flee' && this.eco) {
          const e = this.eco, slot = e.circle ?? e.huddle;
          if (slot) {
            const sx = slot.x - p.x, sz = slot.z - p.z, sd = Math.hypot(sx, sz);
            if (sd > 0.6) { speed = Math.min(spec.run * 0.7, sd * 3); heading = Math.atan2(sx, sz); }
            else { speed = 0; heading = e.circle ? Math.atan2(playerPos.x - p.x, playerPos.z - p.z) : null; } // adulto encara o predador
          } else if (e.fleeDir != null) heading = e.fleeDir + Math.sin(this.stateTime * 1.7) * 0.12;
        }
        break;
      case 'stalk':
        speed = spec.stalk ?? spec.walk;
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      case 'chase': {
        // Arrancada de emboscada perto da presa (felinos, lobos), se houver energia.
        speed = burstSpeed(spec.run, dist, this.combat.burst, this.eco?.needs.energy ?? 1);
        let tx = playerPos.x, tz = playerPos.z;
        // Matilha: circula e entra pelo flanco/calcanhar em vez de atacar de frente.
        // Matilha (F3): o interceptador corre para a rota de fuga da presa; de perto, morde.
        const ic = this.eco?.intercept;
        if (ic && dist > PACKS.pack.strikeDist) { tx = ic.x; tz = ic.z; }
        const fl = this.combat.flank;
        if (!(ic && dist > PACKS.pack.strikeDist) && fl && dist > spec.attackRange * 1.3 && dist < fl.maxDist) {
          const fwd = this.victim ? this.victim.forward(this._vf ?? (this._vf = { x: 0, z: 0 })) : this.playerFwd ?? { x: 0, z: 1 };
          const fp = flankPoint(playerPos, fwd, p, fl.offset);
          tx = fp.x; tz = fp.z;
        }
        heading = Math.atan2(tx - p.x, tz - p.z);
        break;
      }
      case 'attack':
      case 'threat':
        heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        break;
      case 'home': {
        _to.set(this.home.x - p.x, 0, this.home.z - p.z);
        if (_to.lengthSq() > 4) { speed = spec.run * 0.6; heading = Math.atan2(_to.x, _to.z); }
        break;
      }
      case 'circle': {
        // Arara: círculos sobre o ninho (mais largos se assustada).
        this.circleA += dt * (spec.run * 0.6) / spec.soarRadius;
        const r = spec.soarRadius * (dist < spec.sense * 2 ? 1.6 : 1);
        const tx = this.home.x + Math.cos(this.circleA) * r, tz = this.home.z + Math.sin(this.circleA) * r;
        speed = Math.min(spec.run, Math.hypot(tx - p.x, tz - p.z) / Math.max(dt, 1e-3));
        heading = Math.atan2(tx - p.x, tz - p.z);
        break;
      }
      default:
        break;
    }
    // Carcaça (F4): vai até o lugar em volta dela e come (necrófago espera de longe).
    const fd = this.eco?.feedAt;
    this.feeding = false;
    if (fd && this.alive) {
      if (state === 'chase' && !this.victim) this.brain.calmDown();
      if (state === 'idle' || state === 'wander') {
        const sx = fd.x - p.x, sz = fd.z - p.z, sd = Math.hypot(sx, sz);
        if (sd > 0.6) { speed = spec.walk * 1.8; heading = Math.atan2(sx, sz); }
        else { speed = 0; heading = Math.atan2(fd.cx - p.x, fd.cz - p.z); this.feeding = !fd.wait; }
      }
    }
    if (this.leapT > 0) { this.leapT -= dt; speed = spec.run * 1.5; }
    if (this.limpT > 0) { this.limpT -= dt; speed *= BLEED.slowFactor; } // tiro nas pernas: manca
    if (spec.landSpeed && !this.isWater(p.x, p.z)) speed *= spec.landSpeed; // jacaré fora d'água: arrasta-se devagar
    if (immobile || this.pendingKick >= 0) speed = 0; // coice: planta as patas da frente durante o golpe
    else speed *= this.status.speedFactor; // mordida no calcanhar: lento

    if (heading !== null) {
      const cur = this.root.rotation.y;
      const diff = Math.atan2(Math.sin(heading - cur), Math.cos(heading - cur));
      this.root.rotation.y = cur + diff * Math.min(1, dt * (speed > spec.walk * 2 ? 6 : 3));
    }
    const onFoot = state !== 'fly' && state !== 'circle' && state !== 'burrow' && (!spec.aquatic || !this.isWater(p.x, p.z)) && this.altitude < 0.05;
    if (this.sliding) speed = 0; // escorregando: perdeu o controle das patas
    if (speed > 0) {
      let yaw = this.root.rotation.y;
      // Encosta > 45° à frente: contorna (fuga/caça/passeio) em vez de escalar.
      if (onFoot && this.leapT <= 0) {
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        steerAroundSlope(this.groundAt, p.x, p.z, fx, fz, SLOPE, _steer);
        if (_steer.blocked) { speed = 0; if (state === 'wander') this.pickWanderTarget(); }
        else if (_steer.x !== fx || _steer.z !== fz) { yaw = Math.atan2(_steer.x, _steer.z); this.root.rotation.y = yaw; }
      }
      let nx = p.x + Math.sin(yaw) * speed * dt;
      let nz = p.z + Math.cos(yaw) * speed * dt;
      // Terrestres contornam a água; aquáticos (jacaré) não saem dela.
      if (state !== 'fly' && state !== 'circle' && this.blocked(nx, nz)) {
        const side = this.rng() < 0.5 ? 1 : -1;
        this.root.rotation.y += side * 1.2;
        nx = p.x; nz = p.z; speed = 0;
        if (state === 'wander') this.pickWanderTarget();
      }
      p.x = nx;
      p.z = nz;
    }
    // Pisou (ou foi empurrado) numa encosta > 45°: escorrega até o chão firme.
    if (onFoot && this.alive) {
      surfaceNormal(this.groundAt, p.x, p.z, SLOPE.normalSample, this.normal);
      const d = this.slide.update(dt, this.normal, isUnwalkable(this.normal));
      if (this.slide.sliding && !this.blocked(p.x + d.dx, p.z + d.dz)) { p.x += d.dx; p.z += d.dz; }
      else if (this.slide.sliding) this.slide.reset(); // não escorrega para dentro d'água
      this.sliding = this.slide.sliding;
    } else { this.sliding = false; this.slide.reset(); }
    this.speed = speed;
    this.swimming = false;
    if (state !== 'burrow') {
      const g = this.groundAt(p.x, p.z);
      this.swimming = !!spec.swims && g < WORLD.waterLevel - spec.size * 0.6;
      p.y = this.swimming ? WORLD.waterLevel - spec.size * 0.6 : g;
      // Arara: sobe/desce suave até a altura do voo; leopardo: arco do salto.
      const [h0, h1] = spec.soarHeight ?? [0, 0];
      const targetAlt = state === 'circle' ? (dist < spec.sense * 2 ? h1 : h0) : 0;
      this.altitude += (targetAlt - this.altitude) * Math.min(1, dt * 1.2);
      p.y += this.altitude;
      if (this.leapT > 0) p.y += Math.sin((1 - this.leapT / 0.6) * Math.PI) * 1.6 * spec.size;
    }
    if (!this.alive) this.deadTime += dt;
    // Sangrando: perde vida até cair; continua fugindo; acumula distância para o rastro.
    if (this.bleeding && this.alive) {
      this.health -= BLEED.healthPerSecond * dt;
      this.trailAcc += speed * dt;
      if (this.brain.state === 'flee') this.brain.timer = Math.max(this.brain.timer, 1.5);
      if (this.health <= 0) this.brain.die();
    }
    // Contexto da animação: rampa sob as patas, velocidade da curva, olhar.
    const yaw = this.root.rotation.y;
    const yawRate = Math.atan2(Math.sin(yaw - this._yaw), Math.cos(yaw - this._yaw)) / Math.max(dt, 1e-4);
    this._yaw = yaw;
    const grounded = !this.swimming && this.altitude < 0.05 && state !== 'fly' && state !== 'burrow' && this.leapT <= 0;
    const tilt = grounded ? slopeTilt(this.groundAt, p.x, p.z, yaw, this.halfLen ?? 0.5, this.halfWid ?? 0.25) : this._tilt;
    if (this.sliding && grounded) { // desequilíbrio: o corpo balança de lado e empina enquanto desce
      tilt.roll += Math.sin(this.stateTime * 11) * 0.22;
      tilt.pitch += 0.12;
    }
    const toPlayer = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    const look = Math.atan2(Math.sin(toPlayer - yaw), Math.cos(toPlayer - yaw));
    this.body.update(dt, speed, state, this.stateTime, { swimming: this.swimming, tilt, yawRate, leaping: this.leapT > 0, look, feeding: this.feeding });
    return { strike, state, victim: this.victim, kick };
  }

  pickWanderTarget() {
    const r = this.fauna.wanderRadius;
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2, d = r * Math.sqrt(this.rng());
      const x = this.home.x + Math.cos(a) * d, z = this.home.z + Math.sin(a) * d;
      if (!this.blocked(x, z)) {
        this.wanderTarget.set(x, 0, z);
        return;
      }
    }
    this.wanderTarget.copy(this.root.position);
  }
}
