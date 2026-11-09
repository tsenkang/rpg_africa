import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planRooms, interiorCategory, footprint } from '../../../src/world/InteriorLayout.js';
import { FURNITURE, ROOM_FURNITURE, STYLE_SWAPS, INTERIOR_STYLES } from '../../../src/config/interiors.js';
import { mulberry32 } from '../../../src/world/Noise.js';

const catalog = { FURNITURE, ROOM_FURNITURE, STYLE_SWAPS, styles: INTERIOR_STYLES };
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

test('categoria pelo tamanho: pequena, média, sobrado', () => {
  assert.equal(interiorCategory({ w: 4, d: 4 }), 'small');
  assert.equal(interiorCategory({ w: 3.5, d: 3.5, round: 2.6 }), 'small');
  assert.equal(interiorCategory({ w: 7, d: 5.5 }), 'medium');
  assert.equal(interiorCategory({ w: 7, d: 6, stories: 2 }), 'large');
  assert.equal(planRooms({ w: 4, d: 4 }).rooms.length, 1);
  const med = planRooms({ w: 7.5, d: 6 }).rooms.length;
  assert.ok(med >= 2 && med <= 3);
  const big = planRooms({ w: 8, d: 6.5, stories: 2, stair: { lx: -3.4, w: 1 } });
  assert.ok(big.rooms.some((r) => r.floor === 1) && big.rooms.some((r) => r.floor === 0));
});

for (const [name, desc] of [
  ['pequena rústica', { w: 4.2, d: 4, style: 'rustic' }],
  ['média do deserto', { w: 7.6, d: 6.2, style: 'desert' }],
  ['média comum', { w: 6.8, d: 5.4, style: 'common' }],
  ['sobrado', { w: 8.2, d: 6.4, stories: 2, stair: { lx: -3.55, w: 1 }, style: 'rustic' }],
  ['ruína', { w: 6.5, d: 5.5, style: 'ruin' }],
]) {
  test(`${name}: móveis dentro dos cômodos, fora dos caminhos e sem se sobrepor`, () => {
    for (let seed = 1; seed <= 25; seed++) {
      const plan = planInterior(desc, catalog, mulberry32(seed));
      const solids = plan.items.filter((it) => FURNITURE[it.type].mount === undefined && !FURNITURE[it.type].floor && it.type !== 'cobweb');
      assert.ok(solids.length >= 2, `seed ${seed}: só ${solids.length} móveis`);
      const fps = solids.map((it) => ({ ...footprint(FURNITURE[it.type].size, it.x, it.z, it.rot), floor: it.floor }));
      for (const fp of fps) {
        assert.ok(fp.x0 >= -desc.w / 2 - 1e-6 && fp.x1 <= desc.w / 2 + 1e-6 && fp.z0 >= -desc.d / 2 - 1e-6 && fp.z1 <= desc.d / 2 + 1e-6, 'dentro da casa');
        for (const k of plan.keepOut) assert.ok(k.floor !== fp.floor || !overlap(fp, k), `seed ${seed}: móvel no caminho`);
      }
      for (let i = 0; i < fps.length; i++) for (let j = i + 1; j < fps.length; j++) {
        assert.ok(fps[i].floor !== fps[j].floor || !overlap(fps[i], fps[j]), `seed ${seed}: ${solids[i].type} × ${solids[j].type}`);
      }
    }
  });
}

test('mesma casa = mesma mobília (semente); casas diferentes variam', () => {
  const d = { w: 7, d: 5.6, style: 'common' };
  assert.deepEqual(planInterior(d, catalog, mulberry32(42)).items, planInterior(d, catalog, mulberry32(42)).items);
  assert.notDeepEqual(planInterior(d, catalog, mulberry32(42)).items, planInterior(d, catalog, mulberry32(43)).items);
});

test('estilos: deserto troca cadeira por almofada; taiga tem lareira; ruína tem teias e nenhuma luz', () => {
  const desert = planInterior({ w: 7.6, d: 6.2, style: 'desert' }, catalog, mulberry32(3)).items.map((i) => i.type);
  assert.ok(!desert.includes('chair') && desert.includes('cushion'));
  const rustic = planInterior({ w: 4.4, d: 4.2, style: 'rustic' }, catalog, mulberry32(5)).items.map((i) => i.type);
  assert.ok(rustic.includes('fireplace'));
  const ruin = planInterior({ w: 6.5, d: 5.5, style: 'ruin' }, catalog, mulberry32(7)).items.map((i) => i.type);
  assert.ok(ruin.includes('cobweb') && !ruin.includes('fireplace') && !ruin.includes('torch'));
});
