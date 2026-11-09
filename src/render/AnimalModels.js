import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Gerenciador de assets da fauna (preloader + cache): carrega, normaliza e
 * guarda os modelos dos animais (`ANIMAL_MODELS`) e entrega cópias prontas.
 *
 * - GLTFLoader + DRACOLoader (malhas comprimidas com Draco também funcionam;
 *   o decodificador fica em `public/draco/`).
 * - Tudo carrega durante a tela de carregamento (`loadAll(onProgress)`): o
 *   jogo começa com o cache cheio — nenhum animal trava o quadro ao nascer.
 * - Cópia por instância: `SkeletonUtils.clone` para modelos com esqueleto
 *   (cada um anima sozinho), `clone()` simples para os estáticos; geometria e
 *   materiais são compartilhados.
 * - Escala pela `THREE.Box3` (`normalize`): 1 unidade = 1 metro.
 * - Espécie sem modelo (ou que falhou) usa o corpo procedural do AnimalBody.
 *
 * @example
 *   const models = new AnimalModels(ANIMAL_MODELS, { dracoPath: ANIMAL_LOADER.dracoPath });
 *   await models.loadAll((done, total) => ui.setLoading(done / total));
 *   const m = models.instance('lobo');    // { object, clips, names } | null
 */
export class AnimalModels {
  /**
   * @param {Record<string, object>} config `ANIMAL_MODELS`
   * @param {{ dracoPath?: string }} [o] pasta do decodificador Draco
   */
  constructor(config, { dracoPath = null } = {}) {
    this.config = config;
    /** @type {Map<string, { template: THREE.Object3D, clips: THREE.AnimationClip[], skinned: boolean }>} */
    this.ready = new Map();
    this.failed = new Set();
    this.loader = new GLTFLoader();
    if (dracoPath) {
      const draco = new DRACOLoader();
      draco.setDecoderPath(dracoPath);
      this.loader.setDRACOLoader(draco);
    }
  }

  /**
   * Carrega todos em paralelo. Resolve quando todos terminarem (falhas viram
   * corpo procedural, nunca travam o jogo).
   * @param {(done: number, total: number, id: string) => void} [onProgress]
   */
  loadAll(onProgress) {
    const ids = Object.keys(this.config);
    let done = 0;
    return Promise.all(ids.map((id) => this.load(id).then(() => onProgress?.(++done, ids.length, id))));
  }

  /** Carrega e normaliza um modelo. Falha vira aviso, e a espécie fica procedural. */
  async load(id) {
    const cfg = this.config[id];
    try {
      const gltf = await this.fetchGltf(cfg);
      const template = normalize(gltf.scene, cfg);
      if (cfg.tint || cfg.emissive) recolor(template, cfg);
      let skinned = false;
      template.traverse((o) => {
        if (o.isSkinnedMesh) skinned = true;
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = false;
          o.frustumCulled = !o.isSkinnedMesh; // a caixa do skinned não segue a animação
          // Pelo não é metal: sem mapa de ambiente, metalness > 0 só escurece o animal.
          for (const m of [o.material].flat()) if (m.metalness) m.metalness = 0;
        }
      });
      this.ready.set(id, { template, clips: cleanClips(gltf.animations), skinned });
    } catch (err) {
      this.failed.add(id);
      console.warn(`Modelo do animal "${id}" não carregou; usando o procedural.`, err);
    }
  }

  /** GLB direto; se o servidor não entregar .glb, a cópia em base64 (.glb.json). */
  async fetchGltf(cfg) {
    try {
      return await this.loader.loadAsync(cfg.glb);
    } catch {
      const { glb } = await (await fetch(cfg.glbJson)).json();
      const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
      return this.loader.parseAsync(bytes.buffer, '');
    }
  }

  /**
   * Cópia nova do modelo (geometria e materiais compartilhados).
   * @returns {{ object: THREE.Object3D, clips: THREE.AnimationClip[], names: object } | null}
   */
  instance(id) {
    const m = this.ready.get(id);
    if (!m) return null;
    const object = m.skinned ? cloneSkinned(m.template) : m.template.clone();
    return { object, clips: m.clips, names: this.config[id].clips ?? null };
  }
}

/**
 * Conserta clipes comprimidos. O poly.pizza grava as animações com 2 casas
 * decimais: as posições dos ossos (≈0,02 no esqueleto da Quaternius) perdem
 * quase toda a precisão e os quatérnios deixam de ter comprimento 1, o que
 * deforma a malha (ossos esticados). Então:
 *  - tira as faixas de posição e escala (cada osso fica na posição de repouso
 *    do esqueleto, que vem certa);
 *  - normaliza cada quatérnio.
 * @param {THREE.AnimationClip[]} clips
 */
export function cleanClips(clips) {
  for (const clip of clips) {
    clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.position') && !t.name.endsWith('.scale'));
    for (const t of clip.tracks) {
      if (!t.name.endsWith('.quaternion')) continue;
      const v = t.values;
      for (let i = 0; i < v.length; i += 4) {
        const len = Math.hypot(v[i], v[i + 1], v[i + 2], v[i + 3]) || 1;
        v[i] /= len; v[i + 1] /= len; v[i + 2] /= len; v[i + 3] /= len;
      }
    }
  }
  return clips;
}

/**
 * Recolore um modelo (cópia dos materiais, então a outra espécie que usa o
 * mesmo arquivo — o lobo do cérbero — não muda).
 * @param {THREE.Object3D} root
 * @param {{ tint?: number, emissive?: number }} cfg
 */
export function recolor(root, cfg) {
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const swap = (m) => {
      if (!done.has(m)) {
        const c = m.clone();
        if (cfg.tint !== undefined && c.color) { c.color.set(cfg.tint); if (c.map) c.color.multiplyScalar(1.6); }
        if (cfg.emissive !== undefined && c.emissive) { c.emissive.set(cfg.emissive); c.emissiveIntensity = 0.5; }
        done.set(m, c);
      }
      return done.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
}

/**
 * Põe o modelo em pé, de frente para +Z, no tamanho certo e apoiado no chão.
 * Devolve um grupo cujo filho é a cena original (o grupo é o que se copia).
 */
export function normalize(scene, cfg) {
  const holder = new THREE.Group();
  const inner = new THREE.Group();
  inner.add(scene);
  holder.add(inner);
  const [rx, ry, rz] = cfg.rotation ?? [0, 0, 0];
  scene.rotation.set(rx, ry, rz);
  inner.rotation.y = cfg.yaw ?? 0;
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder, true);
  const size = box.getSize(new THREE.Vector3());
  const scale = cfg.height ? cfg.height / size.y : (cfg.length ?? 1) / Math.max(size.z, 1e-6);
  inner.scale.setScalar(scale);
  holder.updateMatrixWorld(true);

  box.setFromObject(holder, true);
  const center = box.getCenter(new THREE.Vector3());
  inner.position.set(-center.x, -box.min.y, -center.z);
  return holder;
}
