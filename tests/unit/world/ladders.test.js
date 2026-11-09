import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ladders } from '../../../src/world/Ladders.js';
import { CLIMB } from '../../../src/config/physics.js';

const make = () => {
  const L = new Ladders();
  // Escada em x=0, z=0, virada para +Z (sobe-se vindo de z positivo), pé y=0, topo y=9.
  const l = L.add({ x: 0, z: 0, rot: 0, y0: 0, y1: 9, exit: { x: 0, y: 9, z: -1 } });
  return { L, l };
};

test('agarra embaixo andando contra a escada (W)', () => {
  const { L, l } = make();
  assert.equal(L.find({ x: 0, y: 0, z: 0.6 }, { x: 0, z: -1 }, CLIMB), l);
});

test('não agarra de costas, de longe nem na altura errada', () => {
  const { L } = make();
  assert.equal(L.find({ x: 0, y: 0, z: 0.6 }, { x: 0, z: 1 }, CLIMB), null, 'andando para longe');
  assert.equal(L.find({ x: 0, y: 0, z: 3 }, { x: 0, z: -1 }, CLIMB), null, 'longe');
  assert.equal(L.find({ x: 0, y: 20, z: 0.6 }, { x: 0, z: -1 }, CLIMB), null, 'muito alto');
});

test('agarra no topo andando para a borda (para descer)', () => {
  const { L, l } = make();
  assert.equal(L.find({ x: 0, y: 9, z: -0.6 }, { x: 0, z: 1 }, CLIMB), l);
});
