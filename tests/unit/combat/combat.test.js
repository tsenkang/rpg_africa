import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat } from '../../../src/systems/Combat.js';

const PUNCH = { range: 1.7, cooldown: 0.45, damage: 5, rayHeights: [0, -0.5] };
const ORIGIN = new THREE.Vector3(0, 1.3, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

/** Caixa de 0,4 m com o centro a `distance` metros à frente da origem. */
function boxAt(distance) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 1.3, -distance);
  mesh.updateMatrixWorld(true);
  return mesh;
}

const quiet = () => new Combat({ punch: PUNCH }, { log: () => {} });

test('punch_hits_registered_target_in_range_and_calls_onHit', () => {
  const combat = quiet();
  const received = [];
  combat.register({ name: 'Boneco', object: boxAt(1.0), onHit: (h) => received.push(h) });
  const { ready, hit } = combat.punch(ORIGIN, FORWARD, 0);
  assert.equal(ready, true);
  assert.equal(hit.name, 'Boneco');
  assert.equal(hit.damage, PUNCH.damage);
  assert.equal(received.length, 1);
});

test('punch_misses_target_beyond_range', () => {
  const combat = quiet();
  combat.register({ name: 'Longe', object: boxAt(PUNCH.range + 0.5) });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).hit, null);
});

test('punch_respects_cooldown', () => {
  const combat = quiet();
  combat.register({ name: 'Boneco', object: boxAt(1.0) });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).ready, true);
  assert.equal(combat.punch(ORIGIN, FORWARD, PUNCH.cooldown - 0.01).ready, false);
  assert.equal(combat.punch(ORIGIN, FORWARD, PUNCH.cooldown).ready, true);
});

test('punch_resolves_child_mesh_to_registered_parent', () => {
  const combat = quiet();
  const npc = new THREE.Group();
  npc.add(boxAt(1.0));
  npc.updateMatrixWorld(true);
  combat.register({ name: 'Mercador', object: npc });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).hit.name, 'Mercador');
});

test('obstacle_stops_punch_and_uses_hitName', () => {
  const combat = quiet();
  const wall = boxAt(0.8);
  wall.userData.hitName = 'Parede';
  combat.addObstacle(wall);
  let called = false;
  combat.register({ name: 'Atrás', object: boxAt(1.4), onHit: () => { called = true; } });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).hit.name, 'Parede');
  assert.equal(called, false);
});

test('disabled_target_is_ignored', () => {
  const combat = quiet();
  combat.register({ name: 'Morto', object: boxAt(1.0), enabled: () => false });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).hit, null);
});

test('waist_ray_hits_short_target_below_chest_height', () => {
  const combat = quiet();
  const child = boxAt(1.0);
  child.position.y = ORIGIN.y - 0.5; // só a altura da cintura
  child.updateMatrixWorld(true);
  combat.register({ name: 'Criança', object: child });
  assert.equal(combat.punch(ORIGIN, FORWARD, 0).hit?.name, 'Criança');
});
