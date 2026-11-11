import * as THREE from 'three';
import { TRAILS } from '../config/hunting.js';

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Rastros no chão: gotas de sangue e pegadas do animal ferido (dois
 * InstancedMesh em anel; o mais antigo é reaproveitado). Somem depois de
 * `TRAILS.life` s. É o que o jogador segue até o animal cair.
 *
 * @example
 * const trails = new Trails(); scene.add(trails.group);
 * trails.add('blood', x, y, z, time); trails.add('print', x, y, z, time, yaw);
 * trails.update(time); // a cada quadro (limpa os velhos a cada 2 s)
 */
export class Trails {
  constructor(cfg = TRAILS) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.group.name = 'trails';
    const mk = (geo, color, opacity) => {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
      const m = new THREE.InstancedMesh(geo, mat, cfg.max);
      m.count = 0;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.userData.noCollide = true;
      this.group.add(m);
      return m;
    };
    this.meshes = {
      blood: mk(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), 0x5a0808, 0.9),
      print: mk(new THREE.CircleGeometry(1, 8).rotateX(-Math.PI / 2).scale(0.65, 1, 1), 0x2e2014, 0.8),
    };
    this.times = { blood: new Float32Array(cfg.max).fill(-Infinity), print: new Float32Array(cfg.max).fill(-Infinity) };
    this.next = { blood: 0, print: 0 };
    this._lastSweep = 0;
  }

  /**
   * @param {'blood'|'print'} kind
   * @param {number} time tempo do jogo (s)
   * @param {number} [yaw] orientação (pegadas)
   */
  add(kind, x, y, z, time, yaw = 0) {
    const mesh = this.meshes[kind], i = this.next[kind];
    this.next[kind] = (i + 1) % this.cfg.max;
    const s = kind === 'blood' ? this.cfg.bloodSize * (0.6 + Math.random() * 0.8) : this.cfg.printSize;
    _q.setFromEuler(_e.set(0, yaw, 0));
    _m.compose(_p.set(x, y + 0.02, z), _q, _s.set(s, 1, s));
    mesh.setMatrixAt(i, _m);
    mesh.count = Math.max(mesh.count, i + 1);
    mesh.instanceMatrix.needsUpdate = true;
    this.times[kind][i] = time;
  }

  /** Apaga rastros antigos (varredura a cada 2 s). */
  update(time) {
    if (time - this._lastSweep < 2) return;
    this._lastSweep = time;
    for (const kind of ['blood', 'print']) {
      const mesh = this.meshes[kind], t = this.times[kind];
      let dirty = false;
      for (let i = 0; i < mesh.count; i++) {
        if (t[i] !== -Infinity && time - t[i] > this.cfg.life) { t[i] = -Infinity; mesh.setMatrixAt(i, ZERO); dirty = true; }
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
