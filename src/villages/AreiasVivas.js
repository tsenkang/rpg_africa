import { Village } from './Village.js';
import * as B from './Builders.js';
import * as X from './BuildersExtra.js';
import { VILLAGES } from '../config/villages.js';

/**
 * ACAMPAMENTO DAS AREIAS VIVAS — Kalahari (transição com a savana).
 * Nômades: tendas de couro em volta da fogueira comunal, cercado com os
 * burros de carga, varais e tótens de osso marcando o limite do território.
 */
export function buildAreiasVivas(game) {
  const v = new Village(game, VILLAGES.areiasVivas, 503);
  const { ctx } = v;
  const cx = v.x, cz = v.z;

  v.paintDisc(cx, cz, 12, 0x7a5434, 0.7);
  v.addFire(X.bonfire(ctx, { x: cx, z: cz, size: 1.1 }), { intensity: 40, range: 22 });
  v.reserve(cx, cz, 4);

  // Tendas de couro em anel irregular, porta para o fogo.
  const tents = 9;
  for (let k = 0; k < tents; k++) {
    const a = (k / tents) * Math.PI * 2 + (v.rnd() - 0.5) * 0.3;
    const r = 13 + v.rnd() * 9;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 2.8)) continue;
    const info = X.leatherTent(ctx, { x, z, r: 2 + v.rnd() * 0.7, rot: Math.atan2(cx - x, cz - z) });
    v.reserve(x, z, info.r + 0.8);
  }

  // Cercado dos animais de carga (sudeste) com burros.
  const pa = 0.9, px = cx + Math.cos(pa) * 36, pz = cz + Math.sin(pa) * 36;
  B.corral(ctx, { x: px, z: pz, rot: pa, w: 16, d: 11 });
  v.reserve(px, pz, 10);
  for (let i = 0; i < 4; i++) {
    const p = B.local(px, pz, pa, (v.rnd() - 0.5) * 10, (v.rnd() - 0.5) * 6);
    v.animals.push(B.animal(ctx, { x: p.x, z: p.z, kind: 'donkey' }));
  }

  // Varais (carne secando e peles).
  for (let k = 0; k < 3; k++) {
    const a = 3.4 + k * 0.6, r = 27;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (!v.isFree(x, z, 2.5)) continue;
    if (k % 2) B.dryingRack(ctx, { x, z, rot: a }); else X.hideRack(ctx, { x, z, rot: a + Math.PI / 2 });
    v.reserve(x, z, 2.5);
  }

  // Tótens de osso no limite do acampamento, virados para fora.
  const totems = 12;
  for (let k = 0; k < totems; k++) {
    const a = (k / totems) * Math.PI * 2;
    const x = cx + Math.cos(a) * (v.radius - 4), z = cz + Math.sin(a) * (v.radius - 4);
    if (!v.isFree(x, z, 0.5)) continue;
    X.boneTotem(ctx, { x, z, rot: Math.atan2(x - cx, z - cz) });
  }

  v.addElder(cx - 3, cz + 2.5, Math.atan2(3, -2.5));
  for (let i = 0; i < 4; i++) {
    const a = 0.8 + i * 1.4;
    v.addNPC({ id: `areias-${i}`, name: i % 2 ? 'Coletora' : 'Caçador', look: { shirt: 0x8a5a2a, pants: 0x5a4a3a }, x: cx + Math.cos(a) * 4.5, z: cz + Math.sin(a) * 4.5, facing: a + Math.PI });
  }

  v.finalize();
  return v;
}
