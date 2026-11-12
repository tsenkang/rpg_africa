import * as THREE from 'three';
import { PROBE } from '../../config/lighting.js';

/**
 * Sonda de reflexo local (Etapa L4).
 *
 * Um `CubeCamera` parado perto do jogador desenha **uma face por vez** (no máximo uma a cada
 * `faceEvery` quadros); quando as 6 ficam prontas, o cubo é filtrado pelo `PMREMGenerator`
 * (rugosidades diferentes = mipmaps diferentes) e entra como `envMap` dos metais e do vidro.
 * O IBL do céu (L1) continua valendo para todo o resto e enquanto a sonda não existe.
 *
 * @example
 *   const probe = new ReflectionProbe(renderer, scene, [materials.iron, materials.glass]);
 *   probe.setEnabled(true);
 *   probe.update(dt, player.position, { hide: [player.root] }); // a cada quadro
 */
export class ReflectionProbe {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.MeshStandardMaterial[]} materials quem recebe o reflexo local
   * @param {object} [cfg] `PROBE`
   */
  constructor(renderer, scene, materials, cfg = PROBE) {
    this.renderer = renderer;
    this.scene = scene;
    this.materials = materials.filter(Boolean);
    this.cfg = cfg;
    this.enabled = false;
    this.cubeRT = new THREE.WebGLCubeRenderTarget(cfg.size, { type: THREE.HalfFloatType });
    this.camera = new THREE.CubeCamera(cfg.near, cfg.far, this.cubeRT);
    this.pmrem = null;
    this.envRT = null;
    this.face = 0;
    this.frame = 0;
    this.age = Infinity;
    this.anchor = new THREE.Vector3(Infinity, 0, 0);
    this.captures = 0;
  }

  /** Liga/desliga (nível gráfico). Desligada, os materiais voltam ao IBL do céu. */
  setEnabled(on) {
    this.enabled = on;
    if (!on) this.apply(null);
  }

  apply(tex) {
    for (const m of this.materials) {
      if (m.envMap === tex) continue;
      m.envMap = tex;
      m.needsUpdate = true; // muda o programa (com/sem envMap)
    }
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} focus posição do jogador
   * @param {{ hide?: THREE.Object3D[], active?: boolean }} [o] `active=false` (masmorra) desliga
   */
  update(dt, focus, o = {}) {
    if (!this.enabled) return;
    if (o.active === false) { this.apply(null); this.face = 0; this.anchor.x = Infinity; return; }
    const c = this.cfg;
    this.age += dt;
    // recomeça no lugar novo / depois de um tempo
    if (this.face === 0 && (this.anchor.distanceTo(focus) > c.moveDist || this.age > c.refresh)) {
      this.anchor.copy(focus);
      this.camera.position.set(focus.x, focus.y + c.height, focus.z);
      this.camera.updateMatrixWorld(true);
      this.face = 1; // 1..6 = próxima face a desenhar
    }
    if (this.face === 0 || ++this.frame % c.faceEvery) return;
    this.renderFace(this.face - 1, o.hide ?? []);
    if (++this.face > 6) {
      this.face = 0;
      this.age = 0;
      this.filter();
    }
  }

  /** Desenha uma face do cubo (esconde o jogador: a sonda está "dentro" dele). */
  renderFace(i, hide) {
    const r = this.renderer, prev = r.getRenderTarget();
    const vis = hide.map((h) => h.visible);
    hide.forEach((h) => { h.visible = false; });
    const xr = r.xr.enabled;
    r.xr.enabled = false;
    r.setRenderTarget(this.cubeRT, i);
    r.render(this.scene, this.camera.children[i]);
    r.xr.enabled = xr;
    r.setRenderTarget(prev);
    hide.forEach((h, k) => { h.visible = vis[k]; });
  }

  /** Cubo pronto → PMREM (mipmaps por rugosidade) → envMap dos materiais. */
  filter() {
    this.pmrem ??= new THREE.PMREMGenerator(this.renderer);
    const old = this.envRT;
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture);
    this.apply(this.envRT.texture);
    old?.dispose();
    this.captures++;
  }

  dispose() {
    this.apply(null);
    this.cubeRT.dispose();
    this.envRT?.dispose();
    this.pmrem?.dispose();
  }
}
