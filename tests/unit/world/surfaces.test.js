import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Surfaces } from '../../../src/world/Surfaces.js';
import { CollisionWorld } from '../../../src/world/CollisionWorld.js';

test('plataforma: sobe quando o pé está perto; por baixo não conta', () => {
  const s = new Surfaces({ step: 0.6 });
  s.addDisc({ x: 0, z: 0, r: 4, y: 12 });
  assert.equal(s.heightAt(1, 1, 11.6), 12);
  assert.equal(s.heightAt(1, 1, 0), -Infinity);
  assert.equal(s.heightAt(10, 0, 12), -Infinity);
  assert.equal(s.heightAt(1, 1), 12, 'sem pé = a mais alta (chuva/NPC)');
});

test('ponte inclinada: altura interpolada ao longo do segmento', () => {
  const s = new Surfaces();
  s.addSegment({ ax: 0, az: 0, bx: 20, bz: 0, width: 1.2, y0: 10, y1: 12 });
  assert.ok(Math.abs(s.heightAt(10, 0.3, 11) - 11) < 1e-9);
  assert.equal(s.heightAt(10, 1, 11), -Infinity, 'fora da largura');
});

test('escada: degrau a degrau (cada um ≤ step acima do anterior)', () => {
  const s = new Surfaces({ step: 0.6 });
  for (let i = 0; i < 20; i++) s.addBox({ x: i * 0.5, z: 0, hw: 0.25, hd: 0.6, y: 0.21 * (i + 1) });
  let y = 0;
  for (let i = 0; i < 20; i++) y = Math.max(y, s.heightAt(i * 0.5, 0, y));
  assert.ok(Math.abs(y - 4.2) < 1e-9, `chegou a ${y}`);
});

test('colisor com faixa de altura: bloqueia só quem está na faixa', () => {
  const cw = new CollisionWorld();
  cw.setHeightRange(cw.addCircle(0, 0, 2, 'hut'), 12, 15);
  const below = { x: 1, y: 0, z: 0 };
  cw.resolve(below, 0.35);
  assert.equal(below.x, 1, 'no chão passa por baixo');
  const on = { x: 1, y: 12, z: 0 };
  cw.resolve(on, 0.35);
  assert.ok(on.x >= 2.35 - 1e-9, 'na plataforma bate');
});
