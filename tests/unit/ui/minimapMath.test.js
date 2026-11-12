import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimapPoint } from '../../../src/ui/minimapMath.js';

test('minimapPoint: dentro do quadro vira pixel direto (leste → direita, sul → baixo)', () => {
  const q = minimapPoint(20, -10, 0.5, 200);
  assert.deepEqual(q, { x: 110, y: 95, clamped: false });
});

test('minimapPoint: fora do quadro prende na borda mantendo a direção', () => {
  const q = minimapPoint(1000, 500, 0.5, 200, 10);
  assert.equal(q.clamped, true);
  assert.equal(q.x, 190); // borda direita menos a margem
  assert.ok(Math.abs((q.y - 100) / (q.x - 100) - 0.5) < 1e-9, 'mesma direção');
});
