import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { wantsSprint, resolveMoveSpeed, approach } from '../../../src/entities/Locomotion.js';
import { CameraRig } from '../../../src/core/CameraRig.js';
import { CAMERA } from '../../../src/config/camera.js';

const CFG = { walkSpeed: 4, sprintMultiplier: 2, swimSpeed: 2, fastTravelMultiplier: 7 };
const keys = (...down) => ({ isDown: (c) => down.includes(c) });
const makeRig = () => new CameraRig(new THREE.PerspectiveCamera(62, 1, 0.1, 1000), { groundAt: () => 0 });
const feet = new THREE.Vector3(0, 0, 0);

test('Shift + movendo = sprint; parado ou nadando não', () => {
  assert.equal(wantsSprint(keys('ShiftLeft'), true), true);
  assert.equal(wantsSprint(keys('ShiftRight'), true), true);
  assert.equal(wantsSprint(keys('ShiftLeft'), false), false);
  assert.equal(wantsSprint(keys(), true), false);
  assert.equal(wantsSprint(keys('ShiftLeft'), true, { swimming: true }), false);
});

test('correndo anda sprintMultiplier× mais rápido; a diagonal normalizada não passa disso', () => {
  assert.equal(resolveMoveSpeed(CFG, { sprinting: false }), 4);
  assert.equal(resolveMoveSpeed(CFG, { sprinting: true }), 8);
  assert.equal(resolveMoveSpeed(CFG, { sprinting: true, swimming: true }), 2);
  assert.equal(resolveMoveSpeed(CFG, { sprinting: true, modifier: 0.5 }), 4);
  const diag = new THREE.Vector3(1, 0, 1).normalize().multiplyScalar(resolveMoveSpeed(CFG, { sprinting: true }));
  assert.ok(Math.abs(diag.length() - 8) < 1e-9);
});

test('approach é suave e independente do framerate', () => {
  let a = 0;
  for (let i = 0; i < 10; i++) a = approach(a, 1, 5, 0.1);
  const b = approach(0, 1, 5, 1);
  assert.ok(Math.abs(a - b) < 1e-9);
  assert.ok(a > 0.99 && a < 1);
});

test('FOV abre suavemente ao correr e volta ao parar', () => {
  const rig = makeRig();
  assert.equal(rig.camera.fov, CAMERA.fov);
  rig.update(0.1, feet, null, { sprinting: true, speed: 8 });
  const mid = rig.camera.fov;
  assert.ok(mid > CAMERA.fov && mid < CAMERA.sprintFov, 'interpola, não pula');
  for (let i = 0; i < 60; i++) rig.update(0.1, feet, null, { sprinting: true, speed: 8 });
  assert.ok(Math.abs(rig.camera.fov - CAMERA.sprintFov) < 0.05);
  for (let i = 0; i < 60; i++) rig.update(0.1, feet, null, { sprinting: false, speed: 0 });
  assert.ok(Math.abs(rig.camera.fov - CAMERA.fov) < 0.05);
});

test('balanço da câmera: zero parado, maior e mais rápido correndo', () => {
  const rig = makeRig();
  rig.setMode('first');
  for (let i = 0; i < 30; i++) rig.update(0.05, feet, null, { speed: 0 });
  assert.ok(rig.bobOffset.length() < 1e-3);
  const peak = (sprinting) => {
    const r = makeRig();
    r.setMode('first');
    let max = 0, phase0 = r.bobPhase;
    for (let i = 0; i < 100; i++) {
      r.update(0.02, feet, null, { speed: sprinting ? 8 : 4, sprinting });
      max = Math.max(max, -r.bobOffset.y);
    }
    return { max, rate: (r.bobPhase - phase0) / 2 };
  };
  const walk = peak(false), run = peak(true);
  assert.ok(run.max > walk.max, 'amplitude maior correndo');
  assert.ok(run.rate > walk.rate, 'frequência maior correndo');
  assert.ok(Math.abs(walk.max - CAMERA.bob.first.walkAmp) < 0.004);
});
