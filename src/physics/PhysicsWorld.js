import * as CANNON from 'cannon-es';
import { PHYSICS, PROP_TYPES } from '../config/physics.js';

/**
 * Mundo de física (cannon-es), transmitido em volta do jogador.
 *
 * - Terreno: um Heightfield de `2 × radius` metros refeito quando o jogador
 *   anda `rebuildDistance` m (o continente inteiro em física seria pesado).
 * - Estáticos: cada colisor do CollisionWorld (paredes de casas, muros,
 *   cercas, rochas, poços, troncos…) e cada superfície andável (plataformas,
 *   pontes, palafitas) vira um corpo estático enquanto estiver no raio.
 * - Dinâmicos: barris, caixotes, tábuas, toras, sacos, lanternas, galhos
 *   (`props`) com massa, gravidade e atrito; dormem quando param.
 * - Jogador: corpo CINEMÁTICO que segue o controle do personagem e empurra
 *   os objetos; o soco aplica um impulso.
 *
 * O controle do personagem continua no CollisionWorld (paredes 2D + chão
 * por altura): é ele que impede o jogador de atravessar paredes. A física
 * cuida de como os OBJETOS reagem.
 *
 * @example
 * const physics = new PhysicsWorld({ groundAt: (x, z) => terrain.heightAt(x, z), collisions, surfaces });
 * physics.addProp('barrel', { x, y, z });
 * // no loop:
 * physics.update(dt, player.position);   // transmite, simula
 * propMeshes.sync(physics.props);         // copia posição/rotação para os InstancedMesh
 */
export class PhysicsWorld {
  /**
   * @param {object} o
   * @param {(x:number, z:number) => number} o.groundAt altura do terreno
   * @param {import('../world/CollisionWorld.js').CollisionWorld} o.collisions
   * @param {import('../world/Surfaces.js').Surfaces} [o.surfaces]
   */
  constructor({ groundAt, collisions, surfaces = null }) {
    this.groundAt = groundAt;
    this.collisions = collisions;
    this.surfaces = surfaces;
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, PHYSICS.gravity, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.defaultContactMaterial.friction = PHYSICS.friction;
    world.defaultContactMaterial.restitution = PHYSICS.restitution;
    world.solver.iterations = 8;
    this.world = world;

    /** Objetos dinâmicos: { type, index, pos, quat, scale, body, active, moved } */
    this.props = [];
    this.byType = new Map();
    this.statics = new Map(); // colisor/superfície → corpo
    this.focus = null;
    this.heightfield = null;

    this.player = new CANNON.Body({ type: CANNON.Body.KINEMATIC, mass: 0 });
    this.player.addShape(new CANNON.Cylinder(PHYSICS.player.radius, PHYSICS.player.radius, PHYSICS.player.height, 8));
    world.addBody(this.player);
    this._last = null;
    this._tmp = new CANNON.Vec3();
  }

  /**
   * Registra um objeto dinâmico (ainda sem corpo: ele nasce quando o
   * jogador chega perto).
   * @param {keyof typeof PROP_TYPES} type
   * @param {{x:number, y?:number, z:number, rot?:number, scale?:number}} o
   *   y = base do objeto (padrão: chão); rot = giro em Y
   * @returns {object} o registro do objeto
   */
  addProp(type, { x, y, z, rot = 0, scale = 1 }) {
    const def = PROP_TYPES[type];
    if (!def) throw new Error(`Objeto desconhecido: ${type}`);
    const half = def.shape.type === 'box' ? def.shape.half[1] : def.shape.h / 2;
    const base = y ?? this.groundAt(x, z);
    const list = this.byType.get(type) ?? [];
    this.byType.set(type, list);
    const p = {
      type, index: list.length, scale,
      pos: { x, y: base + half * scale + 0.01, z },
      quat: { x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) },
      body: null, active: false, moved: true,
    };
    list.push(p);
    this.props.push(p);
    return p;
  }

  /** Cria o corpo de um objeto (na primeira vez que entra no raio). */
  makeBody(p) {
    const def = PROP_TYPES[p.type], s = p.scale;
    const shape = def.shape.type === 'box'
      ? new CANNON.Box(new CANNON.Vec3(def.shape.half[0] * s, def.shape.half[1] * s, def.shape.half[2] * s))
      : new CANNON.Cylinder(def.shape.r * s, def.shape.r * s, def.shape.h * s, 10);
    const body = new CANNON.Body({ mass: def.mass * s * s * s, shape, linearDamping: 0.08, angularDamping: 0.2 });
    body.position.set(p.pos.x, p.pos.y, p.pos.z);
    body.quaternion.set(p.quat.x, p.quat.y, p.quat.z, p.quat.w);
    body.allowSleep = true;
    body.sleepSpeedLimit = PHYSICS.sleep.speed;
    body.sleepTimeLimit = PHYSICS.sleep.time;
    body.userData = p;
    p.body = body;
    return body;
  }

  // ------------------------------------------------------------ transmissão

  /** Refaz o terreno, os estáticos e os objetos ativos em volta de `pos`. */
  stream(pos) {
    this.focus = { x: pos.x, z: pos.z };
    this.buildHeightfield(pos);
    const R = PHYSICS.radius, R2 = (R + 8) ** 2;
    const near = (x, z, r = 0) => (x - pos.x) ** 2 + (z - pos.z) ** 2 < (R + r) ** 2;

    // Estáticos: entra o que está no raio, sai o que ficou longe.
    const want = new Set();
    for (const c of this.collisions.all) if (c.enabled !== false && near(c.x, c.z, c.r ?? Math.hypot(c.hw, c.hd))) want.add(c);
    if (this.surfaces) {
      for (const s of this.surfaces.all) {
        const cx = s.type === 'segment' ? (s.ax + s.bx) / 2 : s.x, cz = s.type === 'segment' ? (s.az + s.bz) / 2 : s.z;
        if (near(cx, cz, s.r ?? Math.hypot(s.bx - s.ax, s.bz - s.az) / 2 + 2)) want.add(s);
      }
    }
    for (const [key, body] of this.statics) if (!want.has(key)) { this.world.removeBody(body); this.statics.delete(key); }
    for (const key of want) if (!this.statics.has(key)) this.statics.set(key, this.addStatic(key));

    // Objetos: ativa no raio; congela (tira do mundo) os que ficaram longe.
    for (const p of this.props) {
      const inside = (p.pos.x - pos.x) ** 2 + (p.pos.z - pos.z) ** 2 < (p.active ? R2 : R * R);
      if (inside && !p.active) {
        const b = p.body ?? this.makeBody(p);
        this.world.addBody(b);
        b.sleep(); // nasce parado: acorda quando algo encosta
        p.active = true;
      } else if (!inside && p.active) {
        this.world.removeBody(p.body);
        p.active = false;
      }
    }
  }

  /** Terreno físico: Heightfield em volta do jogador (girado para Y para cima). */
  buildHeightfield(pos) {
    if (this.heightfield) this.world.removeBody(this.heightfield);
    const es = PHYSICS.heightfieldStep, L = PHYSICS.radius * 2 + 8;
    const n = Math.ceil(L / es) + 1;
    const x0 = Math.round((pos.x - L / 2) / es) * es, z0 = Math.round((pos.z - L / 2) / es) * es;
    const data = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) row.push(this.groundAt(x0 + i * es, z0 + (n - 1 - j) * es));
      data.push(row);
    }
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(new CANNON.Heightfield(data, { elementSize: es }));
    // Heightfield do cannon fica no plano XY local com altura em Z:
    // girar −90° em X leva Z→Y; o eixo Y local vira −Z do mundo.
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    body.position.set(x0, 0, z0 + (n - 1) * es);
    this.world.addBody(body);
    this.heightfield = body;
  }

  /** Corpo estático para um colisor 2D (com altura) ou uma superfície andável. */
  addStatic(c) {
    const body = new CANNON.Body({ mass: 0 });
    if (c.type === 'circle' || c.type === 'box' && c.hw !== undefined && c.y === undefined) {
      const g = this.groundAt(c.x, c.z);
      const y0 = c.y0 ?? g - 1, y1 = c.y1 ?? g + PHYSICS.staticHeight;
      const h = Math.max(0.2, y1 - y0);
      if (c.type === 'circle') body.addShape(new CANNON.Cylinder(c.r, c.r, h, 12));
      else body.addShape(new CANNON.Box(new CANNON.Vec3(c.hw, h / 2, c.hd)));
      body.position.set(c.x, (y0 + y1) / 2, c.z);
      if (c.type === 'box') body.quaternion.setFromEuler(0, Math.atan2(c.sin, c.cos), 0);
    } else if (c.type === 'disc') {
      body.addShape(new CANNON.Cylinder(c.r, c.r, 0.2, 16));
      body.position.set(c.x, c.y - 0.1, c.z);
    } else if (c.type === 'segment') {
      const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
      body.addShape(new CANNON.Box(new CANNON.Vec3(c.width / 2, 0.1, len / 2)));
      body.position.set((c.ax + c.bx) / 2, (c.y0 + c.y1) / 2 - 0.1, (c.az + c.bz) / 2);
      body.quaternion.setFromEuler(-Math.atan2(c.y1 - c.y0, len), Math.atan2(c.bx - c.ax, c.bz - c.az), 0, 'YXZ');
    } else { // superfície 'box'
      body.addShape(new CANNON.Box(new CANNON.Vec3(c.hw, 0.1, c.hd)));
      body.position.set(c.x, c.y - 0.1, c.z);
      body.quaternion.setFromEuler(0, Math.atan2(c.sin, c.cos), 0);
    }
    this.world.addBody(body);
    return body;
  }

  // ------------------------------------------------------------ simulação

  /**
   * Um quadro: transmite se o jogador andou, move o corpo do jogador
   * (cinemático: empurra os objetos) e avança a simulação em passos fixos.
   * @param {number} dt
   * @param {{x:number, y:number, z:number}} player posição dos pés
   */
  update(dt, player) {
    if (!this.focus || Math.hypot(player.x - this.focus.x, player.z - this.focus.z) > PHYSICS.rebuildDistance) this.stream(player);
    const b = this.player, cy = player.y + PHYSICS.player.height / 2 + 0.05;
    if (this._last && dt > 0) {
      // Velocidade = deslocamento / dt → o contato transmite o empurrão.
      b.velocity.set((player.x - this._last.x) / dt, (cy - this._last.y) / dt, (player.z - this._last.z) / dt);
      if (b.velocity.length() > 60) b.velocity.set(0, 0, 0); // teleporte
    }
    b.position.set(player.x, cy, player.z);
    this._last = { x: player.x, y: cy, z: player.z };
    this.world.step(PHYSICS.step, dt, PHYSICS.maxSubSteps);
    for (const p of this.props) {
      if (!p.active || p.body.sleepState === CANNON.Body.SLEEPING) continue;
      const q = p.body.position, r = p.body.quaternion;
      p.pos.x = q.x; p.pos.y = q.y; p.pos.z = q.z;
      p.quat.x = r.x; p.quat.y = r.y; p.quat.z = r.z; p.quat.w = r.w;
      p.moved = true;
      if (q.y < -60) { p.body.velocity.set(0, 0, 0); p.body.position.y = this.groundAt(q.x, q.z) + 1; } // caiu do mundo
    }
  }

  /**
   * Soco: o objeto ativo mais perto na direção do golpe recebe um impulso.
   * @param {{x,y,z}} origin de onde sai o soco
   * @param {{x,y,z}} dir direção (unitária)
   * @returns {object|null} o objeto atingido
   */
  punch(origin, dir) {
    const { punchRange, punchForce, punchLift } = PHYSICS.player;
    let best = null, bestT = Infinity;
    for (const p of this.props) {
      if (!p.active) continue;
      const dx = p.pos.x - origin.x, dy = p.pos.y - origin.y, dz = p.pos.z - origin.z;
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0 || t > punchRange + 0.6 * p.scale) continue;
      const off = Math.hypot(dx - dir.x * t, dy - dir.y * t, dz - dir.z * t);
      if (off < 0.7 * p.scale + 0.25 && t < bestT) { best = p; bestT = t; }
    }
    if (!best) return null;
    const b = best.body;
    b.wakeUp();
    const f = punchForce * Math.min(2, b.mass / 10 + 0.4);
    this._tmp.set(dir.x * f, (dir.y + punchLift) * f, dir.z * f);
    // Acerta acima do centro → o objeto tomba/rola em vez de só deslizar.
    b.applyImpulse(this._tmp, new CANNON.Vec3(b.position.x - dir.x * 0.2, b.position.y + 0.25 * best.scale, b.position.z - dir.z * 0.2));
    return best;
  }
}
