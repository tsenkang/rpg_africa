import * as THREE from 'three';
import { G, local } from '../villages/Builders.js';
import { mulberry32 } from '../world/Noise.js';
import { planInterior } from '../world/InteriorLayout.js';
import { FURNITURE, ROOM_FURNITURE, STYLE_SWAPS, INTERIOR_STYLES, INTERIOR_STREAM } from '../config/interiors.js';

const CATALOG = { FURNITURE, ROOM_FURNITURE, STYLE_SWAPS, styles: INTERIOR_STYLES };
const GEOS = { box: G.box, cyl: G.cyl, cyl6: G.cyl6, sphere: G.sphere, torus: G.torus, cone8: G.cone8 };
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Pools de InstancedMesh para os móveis: um por [geometria, material],
 * compartilhado por TODAS as casas. Gerar um interior só escreve matrizes
 * em slots livres; desfazer zera os slots. Nenhuma malha é criada durante
 * o jogo depois do primeiro uso de cada par.
 */
class FurniturePools {
  constructor(scene, M, size) {
    this.scene = scene;
    this.M = M;
    this.size = size;
    this.pools = new Map();
  }

  pool(geo, matKey) {
    const key = `${geo}|${matKey}`;
    let p = this.pools.get(key);
    if (!p) {
      const mesh = new THREE.InstancedMesh(GEOS[geo], this.M[matKey] ?? this.M.wood, this.size);
      mesh.count = 0;
      mesh.frustumCulled = false; // instâncias espalhadas por várias casas
      mesh.receiveShadow = true;
      mesh.castShadow = false; // sombra de móvel dentro de casa não aparece
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.name = `furniture-${key}`;
      this.scene.add(mesh);
      p = { mesh, free: [], next: 0 };
      this.pools.set(key, p);
    }
    return p;
  }

  /** @returns {[object, number]} [pool, slot] para liberar depois */
  alloc(geo, matKey, matrix) {
    const p = this.pool(geo, matKey);
    const slot = p.free.length ? p.free.pop() : p.next++;
    if (slot >= this.size) return null; // pool cheio: o móvel fica sem essa peça
    p.mesh.setMatrixAt(slot, matrix);
    p.mesh.count = Math.max(p.mesh.count, slot + 1);
    p.mesh.instanceMatrix.needsUpdate = true;
    return [p, slot];
  }

  free([p, slot]) {
    p.mesh.setMatrixAt(slot, ZERO);
    p.mesh.instanceMatrix.needsUpdate = true;
    p.free.push(slot);
  }
}

/**
 * Interiores das casas: planta + mobília gerada perto do jogador e desfeita
 * longe (casa a casa, poucas por quadro). Cada casa sempre recebe a MESMA
 * mobília (semente pela posição): voltar a ela mostra o mesmo arranjo.
 *
 * Por interior: móveis (InstancedMesh), divisórias, colisão dos móveis
 * grandes com faixa de altura (o 2º andar não bloqueia o térreo) e luzes de
 * lareira/tocha (FireLights). Também diz se o jogador está dentro de uma
 * casa — para a câmera não atravessar a parede e o clima ficar lá fora.
 *
 * @example
 * const interiors = new InteriorManager({ scene, M: materials, collisions, fireLights });
 * interiors.add(descDaCasa, 'rustic');
 * interiors.update(dt, player.position);      // no loop
 * interiors.confineCamera(camera.position, player.position);
 */
export class InteriorManager {
  constructor({ scene, M, collisions, fireLights }) {
    this.M = M;
    this.collisions = collisions;
    this.fireLights = fireLights;
    this.pools = new FurniturePools(scene, M, INTERIOR_STREAM.poolSize);
    this.houses = [];
    this.timer = 0;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.generatedCount = 0;
  }

  /**
   * Registra uma casa (descrição vinda do construtor) com o estilo do bioma.
   * @param {{x,z,rot,w,d,t,floorY,ceilY,stories,floors?,stair?,round?,seed,style?}} desc
   */
  add(desc, style) {
    this.houses.push({ ...desc, style: desc.style ?? style, built: null });
  }

  update(dt, pos) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = INTERIOR_STREAM.interval;
    const { near, far, perTick } = INTERIOR_STREAM;
    const want = [];
    for (const h of this.houses) {
      const d = Math.hypot(h.x - pos.x, h.z - pos.z);
      if (h.built && d > far) this.release(h);
      else if (!h.built && d < near) want.push([d, h]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(perTick, want.length); i++) this.generate(want[i][1]);
  }

  /** Gera planta + mobília de uma casa. */
  generate(h) {
    const rng = mulberry32((h.seed ^ 0x51ed) >>> 0);
    const style = INTERIOR_STYLES[h.style] ? h.style : 'common';
    const S = INTERIOR_STYLES[style];
    const inner = { w: h.w - 2 * (h.t ?? 0), d: h.d - 2 * (h.t ?? 0), stories: h.stories, stair: h.stair, round: h.round, style };
    const plan = planInterior(inner, CATALOG, rng);
    const floors = h.floors ?? [h.floorY];
    const ceilOf = (f) => (f + 1 < floors.length ? floors[f + 1] - 0.18 : h.ceilY);
    const pick = (v) => (Array.isArray(v) ? v[Math.floor(rng() * v.length)] : v);
    const built = { slots: [], colliders: [], lights: [] };
    const rot = h.rot;

    // Divisórias (parede fina com colisão só no andar dela).
    const wallMat = h.kind === 'cabin' || h.kind === 'stilt' ? 'woodLight' : 'adobeWhite';
    for (const pt of plan.partitions) {
      const len = Math.hypot(pt.bx - pt.ax, pt.bz - pt.az);
      if (len < 0.2) continue;
      const fy = floors[pt.floor], hh = ceilOf(pt.floor) - fy;
      const mid = local(h.x, h.z, rot, (pt.ax + pt.bx) / 2, (pt.az + pt.bz) / 2);
      const prot = rot + Math.atan2(pt.bx - pt.ax, pt.bz - pt.az);
      this.compose(mid.x, fy + hh / 2, mid.z, 0, prot, 0, 0.12, hh, len);
      const s = this.pools.alloc('box', wallMat, this._m);
      if (s) built.slots.push(s);
      const c = this.collisions.addBox(mid.x, mid.z, 0.08, len / 2, prot, 'partition');
      this.collisions.setHeightRange(c, fy, fy + hh);
      built.colliders.push(c);
    }

    // Móveis.
    for (const it of plan.items) {
      const def = FURNITURE[it.type];
      const fy = floors[it.floor];
      const y = it.y === 'ceiling' ? ceilOf(it.floor) - 0.35 : fy + it.y;
      const wp = local(h.x, h.z, rot, it.x, it.z);
      let rx = 0, rz = 0, drop = 0;
      // Ruína: móveis tombados, inclinados, meio afundados no entulho.
      if (S.broken && def.mount === undefined && it.type !== 'cobweb' && !def.floor && rng() < 0.65) {
        const big = def.height > 1.2;
        rx = big ? (rng() < 0.5 ? 1.35 : -1.35) : (rng() - 0.5) * 1.4;
        rz = big ? 0 : (rng() - 0.5) * 1.2;
        drop = big ? -def.height / 2 + def.size[1] / 2 : -0.08;
      }
      const itemRot = rot + it.rot;
      this._p.compose(this._v.set(wp.x, y + drop, wp.z), this._q.setFromEuler(this._e.set(rx, itemRot, rz, 'YXZ')), this._s.set(1, 1, 1));
      for (const part of def.parts) {
        const [px, py, pz] = part.pos ?? [0, 0, 0];
        const [qx, qy, qz] = part.rot ?? [0, 0, 0];
        this._m.compose(this._v.set(px, py, pz), this._q.setFromEuler(this._e.set(qx, qy, qz)), this._s.set(...part.scale));
        this._m.premultiply(this._p);
        const matKey = part.mat.startsWith('$') ? pick(S[part.mat]) : part.mat;
        const s = this.pools.alloc(part.geo, matKey, this._m);
        if (s) built.slots.push(s);
      }
      if (def.collide && !rx) {
        const q = Math.round(it.rot / (Math.PI / 2)) & 1;
        const hw = (q ? def.size[1] : def.size[0]) / 2, hd = (q ? def.size[0] : def.size[1]) / 2;
        const c = this.collisions.addBox(wp.x, wp.z, hw, hd, rot, 'furniture');
        this.collisions.setHeightRange(c, fy, fy + def.height);
        built.colliders.push(c);
      }
      if (def.light && this.fireLights) {
        const lp = local(wp.x, wp.z, itemRot, 0, def.light.z ?? 0);
        built.lights.push(this.fireLights.add({ x: lp.x, y: y + def.light.y, z: lp.z, color: def.light.color, intensity: def.light.intensity, range: def.light.range, warm: def.light.warm }));
      }
    }
    h.built = built;
    h.plan = plan;
    this.generatedCount++;
  }

  /** Matriz de uma caixa (posição, rotação Euler YXZ, escala) em this._m. */
  compose(x, y, z, rx, ry, rz, sx, sy, sz) {
    this._m.compose(this._v.set(x, y, z), this._q.setFromEuler(this._e.set(rx, ry, rz, 'YXZ')), this._s.set(sx, sy, sz));
  }

  /** Desfaz o interior (slots, colisões e luzes voltam para o pool). */
  release(h) {
    for (const s of h.built.slots) this.pools.free(s);
    for (const c of h.built.colliders) this.collisions.remove(c);
    for (const l of h.built.lights) this.fireLights?.remove(l);
    h.built = null;
    h.plan = null;
  }

  /**
   * Casa (e andar) onde o ponto está, ou null.
   * @returns {{ house: object, floor: number, floorY: number, ceilY: number } | null}
   */
  insideAt(p) {
    for (const h of this.houses) {
      if (!h.built) continue;
      const dx = p.x - h.x, dz = p.z - h.z;
      const c = Math.cos(h.rot), s = Math.sin(h.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) > h.w / 2 || Math.abs(lz) > h.d / 2) continue;
      const floors = h.floors ?? [h.floorY];
      let f = 0;
      while (f + 1 < floors.length && p.y >= floors[f + 1] - 0.3) f++;
      const ceilY = f + 1 < floors.length ? floors[f + 1] - 0.18 : h.ceilY;
      if (p.y < floors[0] - 0.6 || p.y > ceilY) continue;
      return { house: h, floor: f, floorY: floors[f], ceilY, lx, lz };
    }
    return null;
  }

  /**
   * Mantém a câmera de 3ª pessoa dentro do cômodo quando o jogador está numa
   * casa (senão ela fica do lado de fora, atrás da parede).
   * @param {THREE.Vector3} cam posição da câmera (modificada)
   * @param {THREE.Vector3} player pés do jogador
   * @returns {boolean} true se a câmera foi confinada
   */
  confineCamera(cam, player) {
    const at = this.insideAt(player);
    if (!at) return false;
    const h = at.house;
    const c = Math.cos(h.rot), s = Math.sin(h.rot);
    const dx = cam.x - h.x, dz = cam.z - h.z;
    let lx = dx * c - dz * s, lz = dx * s + dz * c;
    const mx = h.w / 2 - 0.3, mz = h.d / 2 - 0.3;
    lx = THREE.MathUtils.clamp(lx, -mx, mx);
    lz = THREE.MathUtils.clamp(lz, -mz, mz);
    cam.x = h.x + lx * c + lz * s;
    cam.z = h.z - lx * s + lz * c;
    cam.y = THREE.MathUtils.clamp(cam.y, at.floorY + 0.5, at.ceilY - 0.2);
    return true;
  }
}
