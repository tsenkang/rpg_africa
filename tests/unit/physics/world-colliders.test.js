import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyWorldPhysics, pieceVolume, classifyPiece } from '../../../src/physics/WorldColliders.js';
import { StaticBatcher } from '../../../src/render/StaticBatcher.js';
import { CollisionWorld } from '../../../src/world/CollisionWorld.js';
import { Surfaces } from '../../../src/world/Surfaces.js';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld.js';
import { PHYSICS, MOVE_SUBSTEP, WORLD_COLLIDERS } from '../../../src/config/physics.js';

const box = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshStandardMaterial();
const flat = () => 0;
const RADIUS = 0.35;

/** Anda em linha reta (como o Player) e devolve onde parou. */
function walk(cw, from, to, secs = 3, speed = 4.2) {
  const pos = { x: from.x, y: from.y ?? 0, z: from.z };
  const len = Math.hypot(to.x - from.x, to.z - from.z), ux = (to.x - from.x) / len, uz = (to.z - from.z) / len;
  for (let t = 0; t < secs; t += 1 / 60) cw.move(pos, ux * speed / 60, uz * speed / 60, RADIUS, MOVE_SUBSTEP);
  return pos;
}

/** Cena com uma "casa" do StaticBatcher: 4 paredes (vão de 1,2 m em +Z), piso, telhado. */
function houseScene(surfaces) {
  const scene = new THREE.Scene();
  const b = new StaticBatcher();
  const H = 3;
  b.add(box, mat, { x: 0, y: H / 2, z: -3, sx: 6, sy: H, sz: 0.2 }); // fundo
  b.add(box, mat, { x: -3, y: H / 2, z: 0, sx: 0.2, sy: H, sz: 6 }); // esquerda
  b.add(box, mat, { x: 3, y: H / 2, z: 0, sx: 0.2, sy: H, sz: 6 }); // direita
  b.add(box, mat, { x: -1.8, y: H / 2, z: 3, sx: 2.4, sy: H, sz: 0.2 }); // frente, esq. do vão
  b.add(box, mat, { x: 1.8, y: H / 2, z: 3, sx: 2.4, sy: H, sz: 0.2 }); // frente, dir. do vão
  b.add(box, mat, { x: 0, y: 0.1, z: 0, sx: 6, sy: 0.2, sz: 6 }); // piso (degrau baixo)
  b.add(box, mat, { x: 0, y: H + 0.3, z: 0, sx: 6.6, sy: 0.6, sz: 6.6 }); // telhado
  surfaces?.addBox({ x: 0, z: 0, hw: 2.9, hd: 2.9, rot: 0, y: 0.2 });
  b.build(scene);
  return scene;
}

test('pieceVolume: caixa girada em Y vira OBB com o mesmo giro e tamanho', () => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(5, 1, -2), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.6, 0)), new THREE.Vector3(4, 2, 1));
  const v = pieceVolume(box, m);
  assert.equal(v.type, 'box');
  assert.ok(Math.abs(v.rot - 0.6) < 1e-6);
  assert.ok(Math.abs(v.hw - 2) < 1e-6 && Math.abs(v.hd - 0.5) < 1e-6);
  assert.ok(Math.abs(v.x - 5) < 1e-6 && Math.abs(v.z + 2) < 1e-6);
  assert.ok(Math.abs(v.y0) < 1e-6 && Math.abs(v.y1 - 2) < 1e-6);
});

test('pieceVolume: cilindro em pé vira círculo; deitado vira caixa', () => {
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
  const up = pieceVolume(cyl, new THREE.Matrix4().makeScale(0.4, 3, 0.4));
  assert.equal(up.type, 'circle');
  assert.ok(Math.abs(up.r - 0.4) < 1e-6);
  const lying = pieceVolume(cyl, new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(0.2, 3, 0.2)));
  assert.equal(lying.type, 'box');
});

test('casa do StaticBatcher: parede segura o jogador, a porta deixa entrar', () => {
  const cw = new CollisionWorld();
  const surfaces = new Surfaces();
  const stats = applyWorldPhysics(houseScene(surfaces), { collisions: cw, groundAt: flat, surfaceAt: (x, z, f) => surfaces.heightAt(x, z, f) });
  assert.equal(stats.added, 6, JSON.stringify(stats)); // 5 paredes + telhado (piso é degrau)
  // Contra a parede da frente (fora do vão): para antes dela.
  const blocked = walk(cw, { x: -1.8, z: 7 }, { x: -1.8, z: 0 });
  assert.ok(blocked.z > 3, `atravessou: z=${blocked.z.toFixed(2)}`);
  // Pelo vão da porta: entra (o telhado é alto demais para bater na cabeça).
  const inside = walk(cw, { x: 0, z: 7 }, { x: 0, z: 0 }, 3);
  assert.ok(inside.z < 1, `não entrou: z=${inside.z.toFixed(2)}`);
});

test('peça que coincide com superfície andável (piso, deck) não vira parede', () => {
  const surfaces = new Surfaces();
  surfaces.addBox({ x: 0, z: 0, hw: 2, hd: 2, rot: 0, y: 1.2 });
  const m = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.6, 0), new THREE.Quaternion(), new THREE.Vector3(4, 1.2, 4));
  const r = classifyPiece(box, m, { groundAt: flat, surfaceAt: (x, z, f) => surfaces.heightAt(x, z, f) });
  assert.equal(r.skip, 'floor');
});

test('parede de cabana (cilindro aberto com vão) é ignorada: o colisor é feito à mão', () => {
  const hutWall = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true, 0.24, Math.PI * 2 - 0.48);
  const r = classifyPiece(hutWall, new THREE.Matrix4().makeScale(2.6, 3, 2.6), { groundAt: flat });
  assert.equal(r.skip, 'open');
});

test('colisor feito à mão não é duplicado; subárvore noCollide e céu gigante ficam de fora', () => {
  const cw = new CollisionWorld();
  cw.addCircle(10, 10, 1, 'well');
  const scene = new THREE.Scene();
  const well = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12), mat);
  well.position.set(10, 0.5, 10); well.scale.set(0.9, 1, 0.9);
  const npc = new THREE.Group(); npc.userData.noCollide = true;
  npc.add(new THREE.Mesh(box, mat));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 8, 6), mat);
  scene.add(well, npc, sky);
  const stats = applyWorldPhysics(scene, { collisions: cw, groundAt: flat });
  assert.equal(stats.added, 0, JSON.stringify(stats));
  assert.equal(stats.skipped.covered, 1);
  assert.equal(stats.skipped.huge, 1);
  assert.equal(cw.all.length, 1);
});

test('InstancedMesh: um colisor por instância (estacas de cerca)', () => {
  const cw = new CollisionWorld();
  const scene = new THREE.Scene();
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), mat, 5);
  for (let i = 0; i < 5; i++) im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(i * 2, 0.6, 0), new THREE.Quaternion(), new THREE.Vector3(0.08, 1.2, 0.08)));
  scene.add(im);
  const stats = applyWorldPhysics(scene, { collisions: cw, groundAt: flat });
  assert.equal(stats.added, 5);
  assert.ok(cw.all.every((c) => c.type === 'circle' && c.auto && c.y1 > 1));
});

test('escada de mão: peças no vão dela ficam livres para agarrar', () => {
  const rail = new THREE.Matrix4().compose(new THREE.Vector3(0, 2, 0), new THREE.Quaternion(), new THREE.Vector3(0.06, 4, 0.06));
  const ladders = { all: [{ x: 0.1, z: 0, y0: 0, y1: 4 }] };
  assert.equal(classifyPiece(box, rail, { groundAt: flat, ladders }).skip, 'ladder');
});

test('sub-passos: em viagem rápida (60 m/s) o jogador não atravessa um poste de 12 cm', () => {
  const cw = new CollisionWorld();
  cw.addCircle(0, 5, 0.06, 'post');
  const end = walk(cw, { x: 0, z: 0 }, { x: 0, z: 20 }, 1, 60);
  assert.ok(end.z < 5, `atravessou: z=${end.z.toFixed(2)}`);
  // Sem sub-passos (um passo por quadro) ele atravessaria:
  const naive = new CollisionWorld();
  naive.addCircle(0, 5, 0.06, 'post');
  const pos = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 60; i++) naive.move(pos, 0, 1, RADIUS, { fraction: 100, maxSteps: 1 });
  assert.ok(pos.z > 5);
});

test('grade com folga: colisor na borda da célula vizinha ainda segura', () => {
  const cw = new CollisionWorld(24);
  cw.addCircle(24.2, 5, 0.1, 'post'); // poste logo depois da borda x = 24 (face em 24,1)
  // Corpo com centro ainda na célula 0 já encosta no poste (célula 1).
  assert.ok(cw.overlaps(23.9, 5, RADIUS), 'poste invisível a partir da célula vizinha');
  const end = walk(cw, { x: 20, z: 5 }, { x: 30, z: 5 });
  assert.ok(Math.abs(end.x - (24.1 - RADIUS)) < 0.02, `parou em x=${end.x.toFixed(3)} (esperado ${24.1 - RADIUS})`);
});

test('PhysicsWorld: colisor automático só vira corpo dentro de staticRadius', () => {
  const cw = new CollisionWorld();
  const near = cw.setHeightRange(cw.addBox(PHYSICS.staticRadius - 5, 0, 0.5, 0.5, 0, 'auto'), 0, 1);
  const far = cw.setHeightRange(cw.addBox(PHYSICS.staticRadius + 10, 0, 0.5, 0.5, 0, 'auto'), 0, 1);
  const hand = cw.addBox(PHYSICS.staticRadius + 10, 4, 0.5, 0.5, 0, 'wall');
  near.auto = far.auto = true;
  const pw = new PhysicsWorld({ groundAt: flat, collisions: cw });
  pw.update(1 / 60, { x: 0, y: 0, z: 0 });
  assert.ok(pw.statics.has(near));
  assert.ok(!pw.statics.has(far));
  assert.ok(pw.statics.has(hand), 'feito à mão continua no raio grande');
});

test('novos objetos dinâmicos (pote, pedra, ferramenta) caem e voam com o soco', () => {
  const pw = new PhysicsWorld({ groundAt: flat, collisions: new CollisionWorld() });
  const pot = pw.addProp('pot', { x: 1.3, z: 0 });
  pw.addProp('stone', { x: -3, z: 0 });
  pw.addProp('tool', { x: 0, z: -3 });
  for (let i = 0; i < 12; i++) pw.update(1 / 60, { x: 0, y: 0, z: 0 });
  assert.equal(pw.punch({ x: 0, y: 0.6, z: 0 }, { x: 1, y: 0, z: 0 }), pot);
  for (let i = 0; i < 60; i++) pw.update(1 / 60, { x: 0, y: 0, z: 0 });
  assert.ok(pot.pos.x > 2, `x=${pot.pos.x.toFixed(2)}`);
});

test('config: arbustos e todas as rochas têm colisão', async () => {
  const { TREE_COLLIDERS } = await import('../../../src/config/physics.js');
  assert.ok(TREE_COLLIDERS.bush > 0 && TREE_COLLIDERS.shrub > 0);
  assert.equal(TREE_COLLIDERS.rockMin, 0);
  assert.ok(WORLD_COLLIDERS.stepHeight < 0.5);
});
