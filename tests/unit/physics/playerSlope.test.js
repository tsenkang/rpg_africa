import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../../../src/entities/Player.js';

const BASE = 60; // acima do nível da água
/** Plano em x ≤ 0; paredão de 63° (tangente 2) subindo para +x. */
const cliff = (x) => BASE + (x > 0 ? 2 * x : 0);

function makePlayer(keys = new Set(), terrain = cliff) {
  const p = new Player({
    groundAt: (x) => terrain(x),
    terrainAt: (x) => terrain(x),
    collisions: { move: (pos, dx, dz) => { pos.x += dx; pos.z += dz; } },
    state: { modifier: () => 1 },
    isUnderground: () => false,
  });
  const input = { isDown: (k) => keys.has(k), pressed: () => false };
  const camera = { forward: (out) => out.set(1, 0, 0) }; // olhando para +x (morro acima)
  return { p, input, camera };
}

test('player_walkingIntoSteepCliff_cannotClimb', () => {
  const { p, input, camera } = makePlayer(new Set(['KeyW']));
  p.teleport(-0.5, 0, 0);
  for (let i = 0; i < 180; i++) p.update(1 / 60, input, camera); // 3 s segurando W
  assert.ok(p.position.y < BASE + 3, `subiu ${(p.position.y - BASE).toFixed(2)} m`);
});

test('player_sprintingIntoCliff_losesGripAndSkids', () => {
  const keys = new Set(['KeyW', 'ShiftLeft', 'ShiftRight']);
  const { p, input, camera } = makePlayer(keys);
  let skids = 0;
  p.onSkid = () => skids++;
  p.teleport(1.5, 0, 0); // já na encosta
  for (let i = 0; i < 30; i++) p.update(1 / 60, input, camera);
  assert.equal(p.sprinting, false);
  assert.ok(skids >= 1);
  assert.ok(p.slope.slipping || p.slope.pushing);
});

test('player_standingOnSteep_slidesDownToFlatAndStops', () => {
  const { p, input, camera } = makePlayer();
  p.teleport(4, 0, 0); // 8 m acima da base, a 63°
  for (let i = 0; i < 300; i++) p.update(1 / 60, input, camera);
  assert.ok(p.position.x <= 0.5, `ainda na encosta: x=${p.position.x.toFixed(2)}`);
  assert.equal(p.slope.slipping, false);
});

test('player_gentleSlope_walksUpNormally', () => {
  const gentle = (x) => BASE + 0.5 * x; // 26,6°
  const { p, input, camera } = makePlayer(new Set(['KeyW']), gentle);
  p.teleport(0, 0, 0);
  for (let i = 0; i < 60; i++) p.update(1 / 60, input, camera);
  assert.ok(p.position.x > 2.5, `andou só ${p.position.x.toFixed(2)} m`);
  assert.equal(p.slope.slipping, false);
});

test('player_lowFramerate_sprintIntoCliff_stillCannotClimb', () => {
  // Quadros longos (10 FPS): o escorregão não pode descolar o jogador do chão
  // e deixar o passo seguinte "subir" a encosta pelo encaixe no chão.
  const steep80 = (x) => BASE + (x > 0 ? 5.67 * x : 0);
  const { p, input, camera } = makePlayer(new Set(['KeyW', 'ShiftLeft']), steep80);
  p.teleport(1, 0, 0);
  const y0 = p.position.y;
  for (let i = 0; i < 80; i++) p.update(0.1, input, camera); // 8 s
  assert.ok(p.position.y <= y0 + 0.01, `subiu ${(p.position.y - y0).toFixed(2)} m`);
});
