import * as THREE from 'three';
import { StaticBatcher } from '../render/StaticBatcher.js';
import { smoothstep } from './Noise.js';

const DECK_WIDTH = 5;
const COUNT = 8;

/**
 * As 8 pontes de madeira que ligam a ilha da Vila Renascimento ao continente.
 * Os pontos de início/fim são encontrados automaticamente onde o terreno sai
 * da água. Também fornece a altura do tabuleiro para a física.
 */
export class Bridges {
  constructor(terrain, generator) {
    this.terrain = terrain;
    this.lake = generator.lake;
    this.list = [];
    for (let k = 0; k < COUNT; k++) {
      const a = ((k + 0.5) / COUNT) * Math.PI * 2;
      const dir = { x: Math.cos(a), z: Math.sin(a) };
      const at = (r) => ({ x: this.lake.x + dir.x * r, z: this.lake.z + dir.z * r });
      // Borda da ilha: último ponto seco indo para fora.
      let r0 = this.lake.Ri - 30;
      while (r0 < this.lake.R && terrain.heightAt(at(r0).x, at(r0).z) > 1.6) r0 += 2;
      let r1 = r0 + 20;
      while (r1 < this.lake.R + 300 && terrain.heightAt(at(r1).x, at(r1).z) < 1.6) r1 += 2;
      r0 -= 6;
      r1 += 8;
      const a0 = at(r0), a1 = at(r1);
      this.list.push({
        angle: a, ax: a0.x, az: a0.z, bx: a1.x, bz: a1.z,
        h0: terrain.heightAt(a0.x, a0.z), h1: terrain.heightAt(a1.x, a1.z),
        length: r1 - r0, dir,
      });
    }
  }

  /** Altura do tabuleiro em (x,z) ou null se fora das pontes. */
  deckHeightAt(x, z) {
    for (const b of this.list) {
      const t = this.project(b, x, z);
      if (!t) continue;
      return this.deckHeight(b, t.t);
    }
    return null;
  }

  deckHeight(b, t) {
    const arch = Math.sin(t * Math.PI) * 2.6;
    return b.h0 + (b.h1 - b.h0) * t + arch + 0.35;
  }

  project(b, x, z) {
    const abx = b.bx - b.ax, abz = b.bz - b.az;
    const len2 = abx * abx + abz * abz;
    const t = ((x - b.ax) * abx + (z - b.az) * abz) / len2;
    if (t < 0 || t > 1) return null;
    const px = b.ax + abx * t - x, pz = b.az + abz * t - z;
    if (px * px + pz * pz > (DECK_WIDTH / 2 + 0.2) ** 2) return null;
    return { t };
  }

  /** Distância de (x,z) até a ponte mais próxima (para não plantar árvores nela). */
  distanceTo(x, z) {
    let best = Infinity;
    for (const b of this.list) {
      const abx = b.bx - b.ax, abz = b.bz - b.az;
      const t = Math.max(0, Math.min(1, ((x - b.ax) * abx + (z - b.az) * abz) / (abx * abx + abz * abz)));
      best = Math.min(best, Math.hypot(b.ax + abx * t - x, b.az + abz * t - z));
    }
    return best;
  }

  build(materials, collisions) {
    const group = new THREE.Group();
    group.name = 'bridges';
    const batch = new StaticBatcher();
    const plank = new THREE.BoxGeometry(DECK_WIDTH, 0.12, 0.28);
    const beam = new THREE.BoxGeometry(0.25, 0.3, 1);
    const post = new THREE.BoxGeometry(0.16, 1.15, 0.16);
    const rail = new THREE.BoxGeometry(0.1, 0.1, 1);
    const pile = new THREE.CylinderGeometry(0.22, 0.26, 1, 8);

    for (const b of this.list) {
      const rot = Math.atan2(b.bx - b.ax, b.bz - b.az);
      const sideX = Math.cos(rot), sideZ = -Math.sin(rot);
      const steps = Math.ceil(b.length / 0.32);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = b.ax + (b.bx - b.ax) * t, z = b.az + (b.bz - b.az) * t;
        const y = this.deckHeight(b, t) - 0.06;
        const t2 = Math.min(1, t + 1 / steps);
        const slope = Math.atan2(this.deckHeight(b, t2) - this.deckHeight(b, t), b.length / steps);
        batch.add(plank, i % 7 === 0 ? materials.woodDark : materials.wood, {
          x, y, z, ry: rot, rx: -slope, sx: 1 + ((i * 37) % 5) * 0.004,
        });
      }
      // Vigas, postes, corrimão e estacas a cada 4 m.
      const segs = Math.ceil(b.length / 4);
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = b.ax + (b.bx - b.ax) * t, z = b.az + (b.bz - b.az) * t;
        const y = this.deckHeight(b, t);
        for (const side of [-1, 1]) {
          const px = x + sideX * side * (DECK_WIDTH / 2 - 0.08);
          const pz = z + sideZ * side * (DECK_WIDTH / 2 - 0.08);
          batch.add(post, materials.woodDark, { x: px, y: y + 0.5, z: pz, ry: rot });
          const ground = this.terrain.heightAt(px, pz);
          if (ground < y - 1) {
            const len = y - 0.2 - (ground - 1.5);
            batch.add(pile, materials.log, { x: px, y: y - 0.2 - len / 2, z: pz, sy: len });
          }
          if (i < segs) {
            const t2 = (i + 1) / segs;
            const y2 = this.deckHeight(b, t2);
            const segLen = b.length / segs;
            const tilt = Math.atan2(y2 - y, segLen);
            const mx = b.ax + (b.bx - b.ax) * (t + t2) / 2 + sideX * side * (DECK_WIDTH / 2 - 0.08);
            const mz = b.az + (b.bz - b.az) * (t + t2) / 2 + sideZ * side * (DECK_WIDTH / 2 - 0.08);
            const my = (y + y2) / 2;
            batch.add(rail, materials.wood, { x: mx, y: my + 1.0, z: mz, ry: rot, rx: -tilt, sz: segLen });
            batch.add(rail, materials.wood, { x: mx, y: my + 0.55, z: mz, ry: rot, rx: -tilt, sz: segLen });
            batch.add(beam, materials.woodDark, { x: mx, y: my - 0.3, z: mz, ry: rot, rx: -tilt, sz: segLen });
          }
        }
      }
      // Corrimãos sólidos para a física (só no trecho sobre a água).
      for (const side of [-1, 1]) {
        const off = DECK_WIDTH / 2 + 0.15;
        const s0 = 0.06, s1 = 0.94;
        collisions.addWall(
          b.ax + (b.bx - b.ax) * s0 + sideX * side * off, b.az + (b.bz - b.az) * s0 + sideZ * side * off,
          b.ax + (b.bx - b.ax) * s1 + sideX * side * off, b.az + (b.bz - b.az) * s1 + sideZ * side * off,
          0.3, 'bridge-rail',
        );
      }
    }
    batch.build(group);
    this.group = group;
    return group;
  }

  /** Pinturas de estrada nas cabeceiras das pontes (terra batida). */
  paints() {
    return this.list.map((b) => ({
      x: (b.ax + b.bx) / 2, z: (b.az + b.bz) / 2, radius: b.length / 2 + 60,
      shapes: [
        { type: 'segment', ax: b.bx, az: b.bz, bx: b.bx + b.dir.x * 45, bz: b.bz + b.dir.z * 45, width: 5, color: 0x7a6248, strength: 0.75 },
      ],
    }));
  }
}

export { smoothstep };
