import * as THREE from 'three';
import { LIGHTING } from '../../config/lighting.js';

/**
 * Luz por imagem (IBL) do céu procedural (Etapa L1).
 *
 * O mesmo shader do domo do céu é desenhado numa cena só dele (céu em cima, chão escuro em
 * baixo, sem neblina) e filtrado pelo `PMREMGenerator` → `scene.environment`. Todo
 * `MeshStandardMaterial`/`MeshPhysicalMaterial` passa a receber luz ambiente do céu de verdade
 * (azul de cima, quente do lado do sol, escuro do chão) e reflexos suaves em 360°.
 *
 * Custo: refazer = 6 faces de uma cena pequena + filtros. Só acontece quando o sol andou mais
 * que `sunDelta` ou as cores do céu mudaram mais que `colorDelta`, e no máximo a cada
 * `minInterval` s — nunca a cada quadro.
 *
 * @example
 *   const ibl = new EnvironmentLighting(renderer, scene, environment.sky.material);
 *   ibl.update(dt, environment); // a cada quadro (quase sempre não faz nada)
 */
export class EnvironmentLighting {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene cena do jogo (recebe `environment`)
   * @param {THREE.ShaderMaterial} skyMaterial material do domo do céu (uniforms copiados)
   * @param {object} [cfg] `LIGHTING.ibl`
   */
  constructor(renderer, scene, skyMaterial, cfg = LIGHTING.ibl) {
    this.renderer = renderer;
    this.scene = scene;
    this.cfg = cfg;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileCubemapShader();
    this.envScene = new THREE.Scene();
    // céu: cópia do material (uniforms próprios: o sol entra mais fraco no IBL — a luz direta
    // do sol já existe; um disco forte no mapa viraria um segundo sol nos reflexos)
    this.skyMat = skyMaterial.clone();
    this.src = skyMaterial.uniforms;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMat);
    this.envScene.add(sky);
    // chão: a metade de baixo do mundo é terra, não céu claro
    this.groundMat = new THREE.MeshBasicMaterial({ color: cfg.ground, side: THREE.DoubleSide, fog: false });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2), this.groundMat);
    ground.position.y = -2;
    this.envScene.add(ground);
    this.rt = null;
    this.timer = 0;
    this.lastSun = new THREE.Vector3(0, -1, 0);
    this.lastTop = new THREE.Color(-1, -1, -1);
    this.lastHorizon = new THREE.Color(-1, -1, -1);
    this.regens = 0;
  }

  /** Mapa precisa ser refeito? (sol andou / cores mudaram) */
  stale() {
    const u = this.src, c = this.cfg;
    if (this.lastSun.angleTo(u.uSunDir.value) > c.sunDelta) return true;
    const d = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    return d(this.lastTop, u.uTop.value) > c.colorDelta || d(this.lastHorizon, u.uHorizon.value) > c.colorDelta;
  }

  /** Refaz o mapa de ambiente agora. */
  regenerate(env) {
    const u = this.skyMat.uniforms, s = this.src;
    u.uTop.value.copy(s.uTop.value);
    u.uHorizon.value.copy(s.uHorizon.value);
    u.uSunDir.value.copy(s.uSunDir.value);
    u.uSunColor.value.copy(s.uSunColor.value);
    u.uSunStrength.value = s.uSunStrength.value * 0.2;
    // chão do IBL: a cor do chão da luz hemisférica, um pouco mais escura
    this.groundMat.color.copy(env.state.hemiGround).multiplyScalar(0.55);
    const old = this.rt;
    this.rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 200, { size: this.cfg.size });
    this.scene.environment = this.rt.texture;
    old?.dispose();
    this.lastSun.copy(s.uSunDir.value);
    this.lastTop.copy(s.uTop.value);
    this.lastHorizon.copy(s.uHorizon.value);
    this.timer = 0;
    this.regens++;
  }

  /**
   * @param {number} dt
   * @param {{ night: number, state: object, hemi: THREE.HemisphereLight }} env Environment
   * @param {boolean} underground masmorras: sem céu
   */
  update(dt, env, underground = false) {
    const c = this.cfg;
    this.timer += dt;
    if (!c.enabled || underground) {
      this.scene.environmentIntensity = 0;
      return;
    }
    if (!this.rt || (this.timer >= c.minInterval && this.stale())) this.regenerate(env);
    this.scene.environmentIntensity = c.intensity + (c.nightIntensity - c.intensity) * env.night;
  }

  dispose() {
    this.rt?.dispose();
    this.pmrem.dispose();
  }
}
