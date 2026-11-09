import * as THREE from 'three';
import { MINIMAP } from '../config/minimap.js';

/**
 * Minimapa em tempo real.
 *
 * 1. Uma OrthographicCamera fica no alto, olhando reto para baixo, seguindo
 *    o X/Z do jogador (norte para cima).
 * 2. Ela só enxerga a camada `MINIMAP.layer`: terreno, água, pontes e os
 *    ícones das construções. Partículas de clima, nuvens, céu, grama,
 *    árvores, NPCs e as casas 3D ficam fora (camada 0 = só a câmera
 *    principal) — o minimapa custa pouco.
 * 3. Ela desenha numa textura pequena (render target) a cada N quadros
 *    (nível gráfico); TODO quadro essa textura é copiada para um quadrado no
 *    canto superior direito com `setScissorTest(true)` + `setViewport` —
 *    sem neblina, sem refazer as sombras.
 * 4. Por cima, o canvas 2D da UI desenha só a moldura, a seta do jogador e
 *    os nomes das vilas (fundo transparente).
 *
 * @example
 * const minimap = new Minimap(renderer, scene);
 * minimap.show(terrain.mesh, water.mesh, bridges.group); // camada do minimapa
 * minimap.buildIcons(collisions.all, (x, z) => terrain.heightAt(x, z));
 * // no loop, DEPOIS de desenhar a cena principal:
 * minimap.render(player.position, rectDoCanvas, { viewMeters: 600 });
 */
export class Minimap {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   */
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.layer = MINIMAP.layer;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, MINIMAP.height * 2);
    this.camera.layers.set(this.layer);
    this.camera.up.set(0, 0, -1); // norte (−Z) para cima na tela
    this.target = new THREE.WebGLRenderTarget(MINIMAP.resolution, MINIMAP.resolution, { type: THREE.HalfFloatType });
    this.interval = 1;
    this.frame = 0;
    this.enabled = true;

    // Cena só com um quadrado que mostra a textura (tone mapping na saída,
    // como a câmera principal — mesmas cores).
    this.blitScene = new THREE.Scene();
    this.blitCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uMap: { value: this.target.texture } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `uniform sampler2D uMap; varying vec2 vUv;
        void main() { gl_FragColor = texture2D(uMap, vUv);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    })));
    this._v = new THREE.Vector4();
  }

  /** Coloca objetos (e filhos) também na camada do minimapa. */
  show(...objects) {
    for (const o of objects) o?.traverse((c) => c.layers.enable(this.layer));
  }

  /**
   * Ícones das construções, gerados a partir das colisões já registradas
   * pelas vilas (cada prédio tem sua caixa/círculo com uma etiqueta).
   * Um InstancedMesh só, achatado, sempre por cima do terreno.
   * @param {Array<object>} shapes `collisions.all`
   * @param {(x:number, z:number) => number} groundAt
   */
  buildIcons(shapes, groundAt) {
    const list = shapes.filter((s) => MINIMAP.icons[s.tag]);
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ toneMapped: false, depthTest: false, depthWrite: false }),
      Math.max(1, list.length),
    );
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    list.forEach((sh, i) => {
      const round = sh.type === 'circle';
      const w = round ? sh.r * 2 : sh.hw * 2, d = round ? sh.r * 2 : sh.hd * 2;
      const rot = round ? Math.PI / 4 : Math.atan2(sh.sin, sh.cos);
      q.setFromAxisAngle(up, rot);
      m.compose(p.set(sh.x, groundAt(sh.x, sh.z) + 2, sh.z), q, s.set(w, 1, d));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(MINIMAP.icons[sh.tag]));
    });
    mesh.count = list.length;
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    mesh.layers.set(this.layer); // só no minimapa
    mesh.name = 'minimap-icons';
    this.scene.add(mesh);
    this.icons = mesh;
  }

  /** Nível gráfico: refaz a imagem a cada `interval` quadros. */
  setInterval(interval) {
    this.interval = Math.max(1, interval);
  }

  /**
   * Desenha o minimapa no retângulo da tela (pixels CSS, origem no topo).
   * Chamar depois da cena principal (não limpa o resto da tela).
   * @param {{x:number, z:number}} center jogador
   * @param {{left:number, top:number, width:number, height:number}} rect onde fica o canvas da UI
   * @param {{ viewMeters: number }} o quantos metros o quadrado mostra
   */
  render(center, rect, { viewMeters }) {
    if (!this.enabled || !rect.width) return;
    const r = this.renderer;
    if (this.frame++ % this.interval === 0) {
      const cam = this.camera, half = viewMeters / 2;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.updateProjectionMatrix();
      cam.position.set(center.x, MINIMAP.height, center.z);
      cam.lookAt(center.x, 0, center.z);
      const fog = this.scene.fog, autoShadow = r.shadowMap.autoUpdate;
      this.scene.fog = null; // vista de cima: nada de neblina
      r.shadowMap.autoUpdate = false; // reaproveita o mapa de sombras da câmera principal
      r.setRenderTarget(this.target);
      r.clear();
      r.render(this.scene, cam);
      r.setRenderTarget(null);
      this.scene.fog = fog;
      r.shadowMap.autoUpdate = autoShadow;
    }
    // Copia a textura para o quadrado do canto (scissor).
    const autoClear = r.autoClear;
    r.getViewport(this._v);
    const y = window.innerHeight - rect.top - rect.height; // WebGL conta de baixo
    r.autoClear = false;
    r.setScissorTest(true);
    r.setScissor(rect.left, y, rect.width, rect.height);
    r.setViewport(rect.left, y, rect.width, rect.height);
    r.render(this.blitScene, this.blitCamera);
    r.setScissorTest(false);
    r.setViewport(this._v);
    r.autoClear = autoClear;
  }
}
