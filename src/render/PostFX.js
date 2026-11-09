import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BLOOM } from '../config/weather.js';

/**
 * Pós-processamento (bloom). Só existe nos níveis gráficos com `bloom: true`
 * e só roda quando o clima pede brilho (ex.: ondas de calor do Kalahari).
 * Fora disso desenha direto na tela — custo zero.
 *
 * @example
 * const postfx = new PostFX(renderer);
 * postfx.setEnabled(preset.bloom);
 * postfx.render(scene, camera, weather.bloomStrength);
 */
export class PostFX {
  /** @param {THREE.WebGLRenderer} renderer */
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = false;
    this.composer = null;
  }

  /** @param {boolean} on liga/desliga o bloom (nível gráfico) */
  setEnabled(on) {
    this.enabled = on;
  }

  /** Cria o compositor na primeira vez que precisa (MSAA se o canvas tem). */
  ensure(scene, camera) {
    if (this.composer) return;
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: r.getContextAttributes()?.antialias ? 4 : 0,
    });
    this.composer = new EffectComposer(r, target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setSize();
  }

  /** Acompanha o tamanho/resolução do renderer (resize e troca de nível). */
  setSize() {
    if (!this.composer) return;
    const r = this.renderer;
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * Desenha o quadro.
   * @param {number} strength força do bloom pedida pelo clima
   */
  render(scene, camera, strength) {
    if (!this.enabled || strength < BLOOM.minStrength) {
      this.renderer.render(scene, camera);
      return;
    }
    this.ensure(scene, camera);
    this.bloom.strength = strength;
    this.composer.render();
  }
}
