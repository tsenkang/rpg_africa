import * as THREE from 'three';
import { FIRE_LIGHTS } from '../config/settlements.js';
import { pickNearest } from '../villages/Layout.js';

/**
 * Luzes dinâmicas de fogo (e outras luzes "vivas" como as luzes errantes
 * das ruínas).
 *
 * Cada PointLight a mais pesa em TODOS os materiais da cena, em todo pixel.
 * Por isso há um pool fixo e pequeno (`FIRE_LIGHTS.pool`) de luzes reais
 * que, a cada quadro, vão para as fontes mais perto do jogador. As chamas
 * em si (malhas emissivas) tremulam todas, perto ou longe — de longe
 * ninguém percebe que a luz real não está lá.
 *
 * @example
 * fireLights.add({ x, y: y0 + 1.2, z, color: 0xff8a3a, intensity: 40, range: 22, flames: [mesh1, mesh2] });
 * fireLights.update(time, player.position); // a cada quadro
 */
export class FireLights {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.sources = [];
    this.lights = [];
    for (let i = 0; i < FIRE_LIGHTS.pool; i++) {
      const l = new THREE.PointLight(0xff8a3a, 0, 20, 1.8);
      scene.add(l); // sempre na cena (intensidade 0 = apagada): sem recompilar shaders
      this.lights.push(l);
    }
    this._idx = new Int32Array(FIRE_LIGHTS.pool);
  }

  /**
   * Registra uma fonte de luz.
   * @param {{x:number, y:number, z:number, color:number, intensity:number, range:number, flames?: THREE.Object3D[], seed?: number}} src
   */
  add(src) {
    const s = { seed: Math.random() * 100, flames: [], ...src, colorObj: new THREE.Color(src.color) };
    this.sources.push(s);
    return s;
  }

  /** Tira uma fonte (lareira de um interior que foi descarregado). */
  remove(src) {
    const i = this.sources.indexOf(src);
    if (i >= 0) this.sources.splice(i, 1);
  }

  /** Tremor da chama: soma de senóides fora de fase (sem ruído aleatório). */
  static flicker(t, seed) {
    return 1 + FIRE_LIGHTS.flicker * (0.5 * Math.sin(t * 9.1 + seed) + 0.3 * Math.sin(t * 15.7 + seed * 2.3) + 0.2 * Math.sin(t * 4.3 + seed * 0.7));
  }

  /**
   * @param {number} time s
   * @param {{x:number, z:number}} pos jogador
   */
  update(time, pos) {
    for (const s of this.sources) {
      const f = FireLights.flicker(time, s.seed);
      const thin = 1 + (1 - f) * 0.5; // chama sobe → afina; desce → alarga
      for (const m of s.flames) m.scale.set(m.userData.base.x * thin, m.userData.base.y * f, m.userData.base.z * thin);
    }
    const n = pickNearest(this.sources, pos, this.lights.length, FIRE_LIGHTS.maxDistance, this._idx);
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      if (i >= n) { l.intensity = 0; continue; }
      const s = this.sources[this._idx[i]];
      l.position.set(s.x, s.y, s.z);
      l.color.copy(s.colorObj);
      l.distance = s.range;
      l.intensity = s.intensity * FireLights.flicker(time, s.seed);
    }
  }
}
