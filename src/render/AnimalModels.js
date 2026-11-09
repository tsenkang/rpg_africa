import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * Carrega e normaliza os modelos dos animais (`ANIMAL_MODELS`) e entrega
 * cópias prontas para pôr na cena.
 *
 * Os modelos carregam em segundo plano: enquanto um não chega, `instance()`
 * devolve null e o animal usa o corpo procedural.
 *
 * @example
 *   const models = new AnimalModels(ANIMAL_MODELS);
 *   models.loadAll();                     // não bloqueia o jogo
 *   const m = models.instance('lobo');    // { object, clips } | null
 */
export class AnimalModels {
  /** @param {Record<string, object>} config `ANIMAL_MODELS` */
  constructor(config) {
    this.config = config;
    /** @type {Map<string, { template: THREE.Object3D, clips: THREE.AnimationClip[], skinned: boolean }>} */
    this.ready = new Map();
    this.failed = new Set();
    this.loader = new GLTFLoader();
  }

  /** Começa a carregar todos (em paralelo). Resolve quando todos terminarem. */
  loadAll() {
    return Promise.all(Object.keys(this.config).map((id) => this.load(id)));
  }

  /** Carrega e normaliza um modelo. Falha vira aviso, e a espécie fica procedural. */
  async load(id) {
    const cfg = this.config[id];
    try {
      const gltf = await this.fetchGltf(cfg);
      const template = normalize(gltf.scene, cfg);
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
