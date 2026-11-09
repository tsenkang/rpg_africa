import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CameraRig } from '../../../src/core/CameraRig.js';
import { AltLockToggle } from '../../../src/core/Input.js';
import { CAMERA } from '../../../src/config/camera.js';

const EPS = 1e-6;
const fakeInput = (dx = 0, dy = 0) => ({ mouseDX: dx, mouseDY: dy, wheel: 0, isDown: () => false });
const makeRig = () => new CameraRig(new THREE.PerspectiveCamera(62, 1, 0.1, 1000), { groundAt: () => 0 });
const feet = () => new THREE.Vector3(10, 2, -5);

test('1ª pessoa: câmera na altura dos olhos, olhando para frente', () => {
  const rig = makeRig();
  rig.setMode('first');
  rig.update(0.016, feet(), null);
  const cam = rig.camera;
  assert.ok(Math.abs(cam.position.y - (2 + CAMERA.first.eyeHeight)) < EPS);
  const look = cam.getWorldDirection(new THREE.Vector3());
  const fwd = rig.forward();
  assert.ok(look.dot(fwd) > 0.999, 'olha na direção do movimento');
});

test('3ª pessoa: câmera atrás e acima do personagem', () => {
  const rig = makeRig();
  rig.update(0.016, feet(), null);
  const cam = rig.camera.position;
  const toCam = cam.clone().sub(feet());
  assert.ok(toCam.y > CAMERA.third.focusHeight, 'acima da cabeça');
  assert.ok(toCam.setY(0).dot(rig.forward()) < 0, 'atrás (oposto ao "para frente")');
  assert.ok(Math.abs(cam.distanceTo(new THREE.Vector3(10, 2 + CAMERA.third.focusHeight, -5)) - CAMERA.third.distance) < 1e-3);
});

test('alternar o modo mantém a direção (yaw) e avisa os ouvintes', () => {
  const rig = makeRig();
  rig.yaw = 0.7;
  const modes = [];
  rig.onModeChange((m) => modes.push(m));
  rig.toggleMode();
  rig.toggleMode();
  assert.equal(rig.yaw, 0.7);
  assert.deepEqual(modes, ['first', 'third']);
  assert.throws(() => rig.setMode('lado'));
});

test('mouse gira o yaw e a inclinação respeita os limites', () => {
  const rig = makeRig();
  const yaw0 = rig.yaw;
  rig.update(0.016, feet(), fakeInput(100, 0));
  assert.ok(Math.abs(rig.yaw - (yaw0 - 100 * CAMERA.sensitivity)) < EPS);
  rig.setMode('first');
  rig.update(0.016, feet(), fakeInput(0, 1e6));
  assert.equal(rig.firstPitch, CAMERA.first.maxPitch);
  rig.setMode('third');
  rig.update(0.016, feet(), fakeInput(0, -1e6));
  assert.equal(rig.pitch, CAMERA.third.minPitch);
});

test('ALT alterna a trava ao pressionar; repetição e segurar não alternam de novo', () => {
  const alt = new AltLockToggle();
  assert.equal(alt.keyDown('AltLeft'), true);
  assert.equal(alt.keyDown('AltLeft', true), false, 'repetição automática');
  assert.equal(alt.keyDown('Tab'), false, 'Alt+Tab não alterna de novo');
  assert.equal(alt.keyUp('AltLeft'), true, 'keyup de ALT só pede preventDefault');
  assert.equal(alt.keyDown('AltRight'), true, 'de novo depois de soltar');
  alt.reset();
  assert.equal(alt.keyDown('AltLeft'), true, 'blur esquece o ALT segurado');
  assert.equal(alt.keyDown('KeyW'), false);
});
