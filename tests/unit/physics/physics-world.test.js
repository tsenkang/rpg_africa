import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld.js';
import { CollisionWorld } from '../../../src/world/CollisionWorld.js';
import { Surfaces } from '../../../src/world/Surfaces.js';
import { PHYSICS } from '../../../src/config/physics.js';

const flat = (h) => () => h;
const run = (pw, pos, secs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) pw.update(dt, pos); };

test('objeto dinâmico repousa no chão (heightfield) sem afundar', () => {
  const pw = new PhysicsWorld({ groundAt: flat(5), collisions: new CollisionWorld() });
  const p = pw.addProp('crate', { x: 3, z: 0 });
  p.pos.y += 2; // solta de 2 m
  run(pw, { x: 0, y: 5, z: 0 }, 0.02);
  p.body.position.y = p.pos.y; p.body.wakeUp();
  run(pw, { x: 0, y: 5, z: 0 }, 3);
  assert.ok(Math.abs(p.pos.y - (5 + 0.4)) < 0.08, `y=${p.pos.y.toFixed(3)}`);
});

test('jogador (cinemático) empurra o barril ao andar contra ele', () => {
  const pw = new PhysicsWorld({ groundAt: flat(0), collisions: new CollisionWorld() });
  const p = pw.addProp('barrel', { x: 2, z: 0 });
  const pos = { x: 0, y: 0, z: 0 };
  run(pw, pos, 0.2);
  const x0 = p.pos.x;
  for (let i = 0; i < 90; i++) { pos.x += 3 / 60; pw.update(1 / 60, pos); } // anda 4,5 m/s → 1,5 m
  run(pw, pos, 0.5);
  assert.ok(p.pos.x > x0 + 0.6, `barril foi de ${x0.toFixed(2)} para ${p.pos.x.toFixed(2)}`);
});

test('soco aplica impulso: o caixote voa/rola para frente', () => {
  const pw = new PhysicsWorld({ groundAt: flat(0), collisions: new CollisionWorld() });
  const p = pw.addProp('crate', { x: 1.4, z: 0 });
  run(pw, { x: 0, y: 0, z: 0 }, 0.2);
  const hit = pw.punch({ x: 0, y: 0.6, z: 0 }, { x: 1, y: 0, z: 0 });
  assert.equal(hit, p);
  run(pw, { x: 0, y: 0, z: 0 }, 1.2);
  assert.ok(p.pos.x > 2.4, `x=${p.pos.x.toFixed(2)}`);
  assert.equal(pw.punch({ x: 0, y: 0.6, z: 0 }, { x: -1, y: 0, z: 0 }), null, 'nada atrás');
});

test('soco longe da origem do mundo: impulso igual (ponto relativo ao centro)', () => {
  const pw = new PhysicsWorld({ groundAt: flat(40), collisions: new CollisionWorld() });
  const p = pw.addProp('crate', { x: 2001.4, z: -1500 });
  const pos = { x: 2000, y: 40, z: -1500 };
  run(pw, pos, 0.2);
  pw.punch({ x: 2000, y: 40.6, z: -1500 }, { x: 1, y: 0, z: 0 });
  run(pw, pos, 1.5);
  const moved = p.pos.x - 2001.4;
  assert.ok(moved > 0.8 && moved < 8, `andou ${moved.toFixed(2)} m`);
});

test('parede estática segura o objeto (não atravessa)', () => {
  const cw = new CollisionWorld();
  cw.addBox(4, 0, 0.3, 3, 0, 'house'); // parede em x = 3,7..4,3
  const pw = new PhysicsWorld({ groundAt: flat(0), collisions: cw });
  const p = pw.addProp('crate', { x: 1.4, z: 0 });
  run(pw, { x: 0, y: 0, z: 0 }, 0.2);
  pw.punch({ x: 0, y: 0.6, z: 0 }, { x: 1, y: 0, z: 0 });
  run(pw, { x: 0, y: 0, z: 0 }, 2);
  assert.ok(p.pos.x < 3.7, `x=${p.pos.x.toFixed(2)}`);
});

test('transmissão: só objetos/estáticos no raio entram no mundo; longe ficam congelados', () => {
  const cw = new CollisionWorld();
  cw.addCircle(5, 0, 1, 'rock');
  cw.addCircle(5000, 0, 1, 'rock');
  const pw = new PhysicsWorld({ groundAt: flat(0), collisions: cw, surfaces: new Surfaces() });
  const near = pw.addProp('barrel', { x: 3, z: 3 });
  const far = pw.addProp('barrel', { x: 4000, z: 0 });
  pw.update(1 / 60, { x: 0, y: 0, z: 0 });
  assert.ok(near.active && !far.active);
  assert.equal(pw.statics.size, 1);
  pw.update(1 / 60, { x: 4000, y: 0, z: 0 }); // teleporte
  assert.ok(!near.active && far.active);
  assert.ok(Math.abs(near.pos.x - 3) < 0.01, 'congelado onde estava');
  assert.ok(PHYSICS.radius >= 40);
});
