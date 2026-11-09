import { yieldToBrowser } from '../core/yieldToBrowser.js';
import * as THREE from 'three';
import { WORLD, RENDER } from '../config/worldConfig.js';
import { BIOMES } from '../config/biomes.js';
import { mulberry32 } from './Noise.js';
import { createTreeGeometries, createVegetationMaterials } from './TreeFactory.js';

const CANDIDATE_SPACING = 10; // 1 candidato a cada 100 m² → densidades até 100/ha
const SNOW_LINE = 150;

const ROCK_TINT = {
  savana: 0xa89a84, taiga: 0x9a9890, deserto: 0xc9a275, kalahari: 0xa8603a,
  tropical: 0x7a776a, equatorial: 0x6e6c60, preta: 0x45484a,
};

/**
 * Árvores, arbustos e rochas espalhados por bioma.
 *
 * O mapa é dividido em blocos (chunks) de 256 m. Cada bloco tem um
 * InstancedMesh por espécie em duas versões (perto/longe). A cada quadro
 * só os blocos ao alcance ficam visíveis — milhares de árvores com poucas
 * draw calls.
 */
export class Vegetation {
  constructor({ terrain, generator, isBlocked, timeUniform, photos, oaks = null }) {
    this.terrain = terrain;
    this.gen = generator;
    this.isBlocked = isBlocked;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    this.material = createVegetationMaterials(timeUniform, photos, oaks);
    this.geos = createTreeGeometries(oaks);
    this.chunks = [];
    this.count = 0;
    this.viewDistance = RENDER.treeViewDistance;
    this.highDetailDistance = RENDER.treeHighDetailDistance;
  }

  /**
   * Alcance das árvores (nível gráfico, tecla G).
   * @param {number} view até onde aparecem (m)
   * @param {number} highDetail até onde usam o modelo detalhado (m)
   * @example vegetation.setDistances(820, 110)
   */
  setDistances(view, highDetail) {
    this.viewDistance = view;
    this.highDetailDistance = highDetail;
  }

  async build(onProgress) {
    const cs = RENDER.treeChunkSize;
    const ncx = Math.ceil(WORLD.width / cs);
    const ncz = Math.ceil(WORLD.depth / cs);
    const rnd = mulberry32(WORLD.seed ^ 0x5eed);
    const w = new Float32Array(BIOMES.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();

    // Tabela por bioma: chance total e espécies acumuladas.
    const tables = BIOMES.map((b) => {
      const total = b.vegetation.reduce((s, v) => s + v.density, 0);
      let acc = 0;
      return {
        chance: Math.min(1, total / 100),
        entries: b.vegetation.map((v) => ({ ...v, cum: (acc += v.density / total) })),
      };
    });

    for (let cz = 0; cz < ncz; cz++) {
      for (let cx = 0; cx < ncx; cx++) {
        const x0 = -WORLD.width / 2 + cx * cs;
        const z0 = -WORLD.depth / 2 + cz * cs;
        const byType = new Map();

        for (let gz = 0; gz < cs; gz += CANDIDATE_SPACING) {
          for (let gx = 0; gx < cs; gx += CANDIDATE_SPACING) {
            const x = x0 + gx + rnd() * CANDIDATE_SPACING;
            const z = z0 + gz + rnd() * CANDIDATE_SPACING;
            if (Math.abs(x) > WORLD.width / 2 - 5 || Math.abs(z) > WORLD.depth / 2 - 5) continue;

            this.terrain.weightsAt(x, z, w);
            // Sorteia o bioma pelos pesos → bordas mistas e naturais.
            let r = rnd(), bi = 0;
            for (; bi < w.length - 1; bi++) { r -= w[bi]; if (r <= 0) break; }
            const table = tables[bi];
            if (rnd() > table.chance) continue;
            const pick = rnd();
            const spec = table.entries.find((en) => pick <= en.cum) ?? table.entries.at(-1);

            const h = this.terrain.heightAt(x, z);
            if (h < 0.9) continue;
            const isRock = spec.type === 'rock';
            const slope = this.terrain.slopeAt(x, z);
            if (!isRock && slope > 0.85) continue;
            if (h > SNOW_LINE + 60 && !isRock) continue;
            if (h > SNOW_LINE && !isRock && spec.type !== 'spruce' && spec.type !== 'pine') continue;
            if (spec.nearWater && h > 6 && this.gen.distanceToRiver(x, z) > 120) continue;
            if (this.isBlocked(x, z, isRock ? 3 : 5)) continue;

            const s = isRock ? 0.5 + rnd() ** 2 * 3.2 : 0.75 + rnd() * 0.55;
            e.set(isRock ? (rnd() - 0.5) * 0.4 : 0, rnd() * Math.PI * 2, isRock ? (rnd() - 0.5) * 0.4 : 0, 'YXZ');
            q.setFromEuler(e);
            const sy = isRock ? s * (0.6 + rnd() * 0.6) : s * (0.9 + rnd() * 0.2);
            m.compose(pos.set(x, h - (isRock ? s * 0.25 : 0.15), z), q, scl.set(s, sy, s));

            if (isRock) {
              col.set(ROCK_TINT[BIOMES[bi].id]).multiplyScalar(0.85 + rnd() * 0.3);
            } else {
              const v = 0.82 + rnd() * 0.3;
              col.setRGB(v * (0.95 + rnd() * 0.1), v, v * (0.9 + rnd() * 0.12));
            }
            // Espécies com modelos 3D têm várias variantes: sorteia uma.
            const variants = this.geos[spec.type];
            const key = Array.isArray(variants) ? `${spec.type}#${Math.floor(rnd() * variants.length)}` : spec.type;
            if (!byType.has(key)) byType.set(key, { matrices: [], colors: [] });
            const bucket = byType.get(key);
            bucket.matrices.push(m.clone());
            bucket.colors.push(col.clone());
          }
        }

        if (byType.size) this.chunks.push(this.createChunk(x0 + cs / 2, z0 + cs / 2, byType));
      }
      onProgress?.((cz + 1) / ncz);
      await yieldToBrowser();
    }
  }

  /**
   * Planta árvores em pontos fixos (palmeiras do oásis etc.), num bloco próprio.
   * @param {{ type: string, x: number, z: number, s?: number, ry?: number }[]} list
   * @example vegetation.plant([{ type: 'palm', x: 10, z: 4, s: 1.1 }])
   */
  plant(list) {
    if (!list?.length) return;
    const byType = new Map();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let sx = 0, sz = 0;
    for (const p of list) {
      if (!this.geos[p.type]) continue;
      const s = p.s ?? 1;
      e.set(0, p.ry ?? 0, 0, 'YXZ');
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, this.terrain.heightAt(p.x, p.z) - 0.15, p.z), q, new THREE.Vector3(s, s, s));
      const variants = this.geos[p.type];
      const key = Array.isArray(variants) ? `${p.type}#0` : p.type;
      if (!byType.has(key)) byType.set(key, { matrices: [], colors: [] });
      byType.get(key).matrices.push(m.clone());
      byType.get(key).colors.push(new THREE.Color(1, 1, 1));
      sx += p.x; sz += p.z;
    }
    if (byType.size) this.chunks.push(this.createChunk(sx / list.length, sz / list.length, byType));
  }

  createChunk(cx, cz, byType) {
    const hi = new THREE.Group();
    const lo = new THREE.Group();
    for (const [key, { matrices, colors }] of byType) {
      const [type, variant] = key.split('#');
      const geo = variant === undefined ? this.geos[type] : this.geos[type][+variant];
      for (const [group, geometry, detailed] of [[hi, geo.hi, true], [lo, geo.lo, false]]) {
        const mesh = new THREE.InstancedMesh(geometry, this.material, matrices.length);
        matrices.forEach((mat, i) => { mesh.setMatrixAt(i, mat); mesh.setColorAt(i, colors[i]); });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = detailed;
        mesh.receiveShadow = detailed;
        group.add(mesh);
      }
      this.count += matrices.length;
    }
    hi.visible = lo.visible = false;
    this.group.add(hi, lo);
    return { x: cx, z: cz, hi, lo };
  }

  /** Liga/desliga blocos e troca o nível de detalhe conforme a distância. */
  update(viewPos, enabled = true) {
    const half = RENDER.treeChunkSize * 0.7;
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - viewPos.x, c.z - viewPos.z) - half;
      const visible = enabled && d < this.viewDistance;
      const near = d < this.highDetailDistance;
      c.hi.visible = visible && near;
      c.lo.visible = visible && !near;
    }
  }
}
