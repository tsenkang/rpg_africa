import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cameraReach } from '../../../src/world/InteriorCamera.js';
import { CameraRig } from '../../../src/core/CameraRig.js';
import { CAMERA } from '../../../src/config/camera.js';

const M = 0.25; // folga até a parede
const room = (o = {}) => ({ hw: 3, hd: 2.5, y0: 0, y1: 2.6, doorW: 1.1, doorH: 2.1, partitions: [], ...o });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

test('câmera livre dentro do cômodo: recuo inteiro', () => {
  assert.equal(cameraReach(room(), { x: 0, y: 1.5, z: 0 }, { x: 1, y: 2, z: -1 }, M), 1);
});

test('para antes da parede do fundo, sem entortar o ângulo', () => {
  const t = cameraReach(room(), { x: 0, y: 1.5, z: 0 }, { x: 0, y: 1.5, z: -6 }, M);
  assert.ok(near(t, (2.5 - M) / 6));
});

test('parede da frente fora da porta bloqueia', () => {
  const t = cameraReach(room(), { x: 2, y: 1.5, z: 0 }, { x: 2, y: 1.5, z: 6 }, M);
  assert.ok(near(t, (2.5 - M) / 6));
});

test('pelo vão da porta a câmera sai da casa', () => {
  assert.equal(cameraReach(room(), { x: 0, y: 1.5, z: 1 }, { x: 0, y: 1.8, z: 7 }, M), 1);
});

test('teto do andar limita a subida', () => {
  const t = cameraReach(room(), { x: 0, y: 1.5, z: 0 }, { x: 0, y: 4, z: -1 }, M);
  assert.ok(near(t, (2.6 - 0.15 - 1.5) / 2.5));
});

test('divisória: a câmera não passa para o cômodo vizinho', () => {
  const r = room({ partitions: [{ ax: -3, az: -0.5, bx: 3, bz: -0.5 }] });
  const t = cameraReach(r, { x: 0, y: 1.5, z: 1 }, { x: 0, y: 1.5, z: -2 }, M);
  assert.ok(near(t, 0.5 - M / 3));
  // pelo vão (a divisória termina antes): passa
  const gap = room({ partitions: [{ ax: -3, az: -0.5, bx: -0.6, bz: -0.5 }] });
  assert.equal(cameraReach(gap, { x: 0, y: 1.5, z: 1 }, { x: 0, y: 1.5, z: -1.5 }, M), 1);
});

test('jogador na soleira (dentro da parede): não confina', () => {
  assert.equal(cameraReach(room(), { x: 0, y: 1.5, z: 2.4 }, { x: 0, y: 2, z: 8 }, M), 1);
});

test('rig: encurta na hora ao bater e volta a se afastar suavemente (sem pulo)', () => {
  const rig = new CameraRig(new THREE.PerspectiveCamera(62, 1, 0.1, 1000), { groundAt: () => 0 });
  const feet = new THREE.Vector3(0, 0, 0);
  const focus = new THREE.Vector3(0, CAMERA.third.focusHeight, 0);
  let k = 0.3;
  rig.reach = () => k;
  rig.update(0.016, feet, null);
  assert.ok(near(rig.camera.position.distanceTo(focus), CAMERA.third.distance * 0.3, 1e-3), 'encurtou na hora');
  k = 1; // saiu de casa
  rig.update(0.016, feet, null);
  const d1 = rig.camera.position.distanceTo(focus);
  assert.ok(d1 > CAMERA.third.distance * 0.3 && d1 < CAMERA.third.distance * 0.5, 'afasta aos poucos');
  for (let i = 0; i < 300; i++) rig.update(0.016, feet, null);
  assert.ok(near(rig.camera.position.distanceTo(focus), CAMERA.third.distance, 1e-2), 'volta à distância normal');
});

test('rig: groundAt recebe a altura do pé do jogador', () => {
  const seen = [];
  const rig = new CameraRig(new THREE.PerspectiveCamera(62, 1, 0.1, 1000), { groundAt: (x, z, feetY) => { seen.push(feetY); return 0; } });
  rig.update(0.016, new THREE.Vector3(0, 3.2, 0), null);
  assert.equal(seen.at(-1), 3.2);
});
