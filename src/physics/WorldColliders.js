import * as THREE from 'three';
import { WORLD_COLLIDERS } from '../config/physics.js';

/**
 * Gerador universal de colisores estáticos ("World Colliders Generator").
 *
 * Percorre a árvore da cena e garante que TODA peça sólida tenha colisão,
 * sem depender de alguém lembrar de chamar `collisions.addBox/addCircle`:
 *
 * - Meshes do StaticBatcher (casas, igrejas, lojas, barracas, muros, cercas,
 *   poços, pontes, ruínas, marcos): um colisor POR PEÇA original
 *   (`userData.colliderPieces`), não um bloco por material — assim portas,
 *   vãos e corredores continuam abertos.
 * - InstancedMesh: um colisor por instância.
 * - Mesh solto: o volume da própria malha.
 *
 * Forma de cada colisor (sempre com faixa de altura y0..y1, então telhado
 * não bloqueia quem anda embaixo e o 2º andar não bloqueia o térreo):
 * - círculo: cilindro, cone, esfera ou rocha em pé, com X ≈ Z
 * - caixa orientada (OBB no plano XZ): todo o resto
 *
 * O que NÃO vira parede (decisão consciente, não esquecimento):
 * - pisos, rampas, degraus e decks: o topo coincide com uma superfície
 *   andável (`surfaceAt`) ou fica a até `stepHeight` do chão
 * - casca aberta com vão (parede de cabana `hutWall`): colisor feito à mão
 * - o que já está coberto por um colisor existente (feito à mão ou maior)
 * - o vão de cada escada de mão (`ladders`)
 * - subárvores marcadas `userData.noCollide` (terreno, água, capim, nuvens,
 *   NPCs, animais, objetos dinâmicos — esses têm física própria)
 * - peças maiores que `maxSize` (céu, oceano) ou mais finas que `minSize`
 *
 * O CollisionWorld recebe os colisores (é ele que segura o jogador) e o
 * PhysicsWorld os transmite para o cannon-es (é ele que segura os objetos).
 *
 * @example
 * const stats = applyWorldPhysics(scene, {
 *   collisions, groundAt: (x, z) => terrain.heightAt(x, z),
 *   surfaceAt: (x, z, feetY) => surfaces.heightAt(x, z, feetY), ladders,
 * });
 * console.log(`${stats.added} colisores automáticos`);
 */

const _m = new THREE.Matrix4();
const _inst = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Tipos de geometria que são sólidos de revolução (podem virar círculo). */
const ROUND = new Set(['CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'IcosahedronGeometry', 'DodecahedronGeometry', 'OctahedronGeometry', 'CapsuleGeometry']);

/**
 * Casca aberta (cilindro sem tampa, ex.: parede de cabana com o vão da
 * porta): um volume cheio fecharia a entrada.
 * @param {THREE.BufferGeometry} g
 */
export function isOpenShell(g) {
  if (g.userData?.collider === 'none') return true;
  const p = g.parameters;
  return g.type === 'CylinderGeometry' && !!p?.openEnded;
}

/**
 * Volume de uma peça no mundo: caixa orientada em Y (OBB no plano XZ)
 * com faixa de altura, ou círculo para sólidos de revolução em pé.
 * Puro (testável).
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Matrix4} matrix local → mundo
 * @param {typeof WORLD_COLLIDERS} [cfg]
 * @returns {{type:'circle'|'box', x:number, z:number, r?:number, hw?:number, hd?:number, rot:number, y0:number, y1:number}}
 */
export function pieceVolume(geometry, matrix, cfg = WORLD_COLLIDERS) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  matrix.decompose(_p, _q, _s);
  _e.setFromQuaternion(_q, 'YXZ');
  const rot = _e.y;
  const c = Math.cos(rot), s = Math.sin(rot);
  // Projeta os 8 cantos no referencial girado só em Y: eixo X local = (c, −s), Z local = (s, c).
  let lx0 = Infinity, lx1 = -Infinity, lz0 = Infinity, lz1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(matrix);
    const lx = _v.x * c - _v.z * s, lz = _v.x * s + _v.z * c;
    if (lx < lx0) lx0 = lx; if (lx > lx1) lx1 = lx;
    if (lz < lz0) lz0 = lz; if (lz > lz1) lz1 = lz;
    if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y;
  }
  const hw = (lx1 - lx0) / 2, hd = (lz1 - lz0) / 2;
  const mx = (lx0 + lx1) / 2, mz = (lz0 + lz1) / 2;
  // Centro de volta ao mundo (inversa da projeção acima).
  const x = mx * c + mz * s, z = -mx * s + mz * c;
  const upright = Math.abs(_e.x) < cfg.uprightTilt && Math.abs(_e.z) < cfg.uprightTilt;
  const segs = geometry.parameters?.radialSegments ?? geometry.parameters?.widthSegments ?? 8;
  const ratio = Math.max(hw, hd) / Math.max(1e-6, Math.min(hw, hd));
  if (ROUND.has(geometry.type) && upright && segs >= 6 && ratio <= cfg.circleRatio) {
    return { type: 'circle', x, z, r: Math.max(hw, hd), rot: 0, y0, y1 };
  }
  return { type: 'box', x, z, hw, hd, rot, y0, y1 };
}

/**
 * Material de efeito (brilho aditivo, véu transparente sem profundidade:
 * raio, teia, névoa) — luz, não matéria.
 * @param {THREE.Material|THREE.Material[]} m
 */
export function isEffect(m) {
  if (Array.isArray(m)) return m.every(isEffect);
  return !!m && (m.blending === THREE.AdditiveBlending || (m.transparent && m.depthWrite === false));
}

/** Ponto (x, z) dentro de um colisor do CollisionWorld (sem folga). */
function contains(c, x, z) {
  if (c.type === 'circle') return Math.hypot(x - c.x, z - c.z) <= c.r;
  const dx = x - c.x, dz = z - c.z;
  const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
  return Math.abs(lx) <= c.hw && Math.abs(lz) <= c.hd;
}

/**
 * Já existe colisor cobrindo esta peça? (centro dentro, e a faixa de altura
 * do colisor contém a da peça — colisor sem faixa = parede infinita.)
 */
function covered(collisions, v) {
  for (const c of collisions.query(v.x, v.z)) {
    if (!c.enabled || !contains(c, v.x, v.z)) continue;
    if (c.y0 === undefined || (c.y0 <= v.y0 + 0.05 && c.y1 >= v.y1 - 0.05)) return true;
  }
  return false;
}

/**
 * Decide se a peça vira colisor; devolve o volume ou o motivo de recusa.
 * @returns {{volume?:object, skip?:string}}
 */
export function classifyPiece(geometry, matrix, { groundAt, surfaceAt, ladders, floorY }, cfg = WORLD_COLLIDERS) {
  if (isOpenShell(geometry)) return { skip: 'open' };
  const v = pieceVolume(geometry, matrix, cfg);
  const half = v.type === 'circle' ? v.r : Math.max(v.hw, v.hd);
  const thin = v.type === 'circle' ? v.r * 2 : Math.max(v.hw, v.hd) * 2;
  if (half * 2 > cfg.maxSize) return { skip: 'huge' };
  if (thin < cfg.minSize) return { skip: 'tiny' };
  const ground = floorY ?? groundAt(v.x, v.z);
  if (v.y1 <= ground + cfg.stepHeight) return { skip: 'step' };
  if (surfaceAt && floorY === undefined) {
    const s = surfaceAt(v.x, v.z, v.y1 + cfg.surfaceSnap);
    if (Number.isFinite(s) && Math.abs(s - v.y1) <= cfg.surfaceSnap) return { skip: 'floor' };
  }
  if (ladders) {
    for (const l of ladders.all ?? ladders) {
      if (v.y1 < l.y0 - 0.5 || v.y0 > l.y1 + 0.5) continue;
      if (Math.hypot(v.x - l.x, v.z - l.z) < cfg.ladderClear) return { skip: 'ladder' };
    }
  }
  // Volume sem espessura (placa, relógio na parede): dá uma espessura mínima.
  if (v.type === 'box') { v.hw = Math.max(v.hw, cfg.minSize / 2); v.hd = Math.max(v.hd, cfg.minSize / 2); }
  return { volume: v };
}

/**
 * Varre `root` (normalmente a cena inteira) e cria um colisor estático para
 * cada peça sólida ainda sem colisão.
 *
 * @param {THREE.Object3D} root
 * @param {object} o
 * @param {import('../world/CollisionWorld.js').CollisionWorld} o.collisions destino
 * @param {(x:number, z:number) => number} o.groundAt chão natural (terreno)
 * @param {(x:number, z:number, feetY:number) => number} [o.surfaceAt] superfícies andáveis
 * @param {{all: object[]}} [o.ladders] escadas de mão (o vão fica livre)
 * @param {typeof WORLD_COLLIDERS} [o.config]
 * @returns {{added:number, pieces:number, skipped:Record<string, number>}}
 */
export function applyWorldPhysics(root, { collisions, groundAt, surfaceAt = null, ladders = null, config = WORLD_COLLIDERS }) {
  root.updateMatrixWorld(true);
  const candidates = [];
  const skipped = {};
  let pieces = 0;
  const consider = (geometry, matrix, ctx) => {
    pieces++;
    const r = classifyPiece(geometry, matrix, ctx, config);
    if (r.skip) skipped[r.skip] = (skipped[r.skip] ?? 0) + 1;
    else candidates.push(r.volume);
  };

  const visit = (obj, floorY) => {
    if (obj.userData?.noCollide) return;
    if (obj.userData?.floorY !== undefined) floorY = obj.userData.floorY; // área subterrânea
    const ctx = { groundAt, surfaceAt, ladders, floorY };
    if (obj.isMesh && !obj.isSkinnedMesh && !isEffect(obj.material)) {
      const list = obj.userData.colliderPieces;
      if (list) {
        for (const pc of list) consider(pc.geometry, _m.multiplyMatrices(obj.matrixWorld, pc.matrix), ctx);
      } else if (obj.isInstancedMesh) {
        if (obj.count > config.maxInstances) skipped.instances = (skipped.instances ?? 0) + obj.count;
        else for (let i = 0; i < obj.count; i++) {
          obj.getMatrixAt(i, _inst);
          consider(obj.geometry, _m.multiplyMatrices(obj.matrixWorld, _inst), ctx);
        }
      } else {
        consider(obj.geometry, obj.matrixWorld, ctx);
      }
    }
    for (const child of obj.children) visit(child, floorY);
  };
  visit(root, undefined);

  // Maiores primeiro: o enfeite em cima da mesa fica coberto pela mesa.
  const area = (v) => (v.type === 'circle' ? Math.PI * v.r * v.r : 4 * v.hw * v.hd);
  candidates.sort((a, b) => area(b) - area(a));
  let added = 0;
  for (const v of candidates) {
    if (covered(collisions, v)) { skipped.covered = (skipped.covered ?? 0) + 1; continue; }
    const c = v.type === 'circle'
      ? collisions.addCircle(v.x, v.z, v.r, 'auto')
      : collisions.addBox(v.x, v.z, v.hw, v.hd, v.rot, 'auto');
    collisions.setHeightRange(c, v.y0, v.y1);
    c.auto = true;
    added++;
  }
  return { added, pieces, skipped };
}
