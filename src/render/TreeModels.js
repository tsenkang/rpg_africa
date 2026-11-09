import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { OAK_FILES, OAK_VARIANTS, ACACIA_FILES } from '../config/treeModels.js';

/**
 * Carrega o pacote de carvalhos 3D (geometria do GLB + texturas).
 *
 * @example
 *   const oaks = await loadOakModels(renderer);
 *   oaks.parts['Big_oak_tree__001'].bark; // BufferGeometry em metros, Y para cima
 *
 * @param {THREE.WebGLRenderer} renderer usado para a anisotropia máxima.
 * @returns {Promise<{parts: Record<string, {bark, leaf, billboard: THREE.BufferGeometry}>, tex: object}>}
 */
export async function loadOakModels(renderer) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const texLoader = new THREE.TextureLoader();
  const tex = async (url, srgb = true) => {
    const t = await texLoader.loadAsync(url);
    t.flipY = false; // UVs no padrão glTF
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = aniso;
    return t;
  };

  const [gltf, acacia, bark, barkNormal, leaves, leavesNormal, leavesWinter, ...bbs] = await Promise.all([
    loadGltf(OAK_FILES),
    loadAcacias(tex).catch((err) => { console.warn('Acácias 3D indisponíveis:', err.message); return null; }),
    tex(OAK_FILES.bark),
    tex(OAK_FILES.barkNormal, false),
    tex(OAK_FILES.leaves),
    tex(OAK_FILES.leavesNormal, false),
    tex(OAK_FILES.leavesWinter),
    ...OAK_VARIANTS.map((n) => tex(OAK_FILES.billboard(n))),
  ]);
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  barkNormal.wrapS = barkNormal.wrapT = THREE.RepeatWrapping;

  // Modelo com Z para cima → Y para cima do Three.js.
  const parts = collectParts(gltf, new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  if (acacia) Object.assign(parts, acacia.parts);

  const billboards = Object.fromEntries(OAK_VARIANTS.map((n, i) => [n, bbs[i]]));
  return {
    parts,
    hasAcacia: !!acacia,
    tex: { bark, barkNormal, leaves, leavesNormal, leavesWinter, billboards, ...(acacia?.tex ?? {}) },
  };
}

/** Acácias: GLB já com Y para cima; casca e folhas repetem (UVs fora de 0–1). */
async function loadAcacias(tex) {
  const [gltf, acaciaBark, acaciaLeaves] = await Promise.all([
    loadGltf(ACACIA_FILES), tex(ACACIA_FILES.bark), tex(ACACIA_FILES.leaves),
  ]);
  for (const t of [acaciaBark, acaciaLeaves]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // Folhas finas (só ~11% opaco): sem isso a copa some de longe.
  coverageMipmaps(acaciaLeaves, ACACIA_FILES.leafAlphaCutoff);
  return { parts: collectParts(gltf, new THREE.Matrix4()), tex: { acaciaBark, acaciaLeaves } };
}

/**
 * Gera as mipmaps de uma textura recortada mantendo a mesma área opaca em
 * cada nível. A média normal deixa o alfa abaixo do corte nas mipmaps
 * pequenas e as folhas somem de longe.
 *
 * @param {THREE.Texture} texture textura com alfa (imagem já carregada)
 * @param {number} cutoff mesmo valor do `alphaTest` do material
 */
export function coverageMipmaps(texture, cutoff) {
  const img = texture.image;
  let w = img.width, h = img.height;
  const level = (cw, ch) => {
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, cw, ch);
    return c;
  };
  const coverage = (data, k) => {
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] * k >= cutoff * 255) n++;
    return n / (data.length / 4);
  };
  const base = level(w, h);
  const target = coverage(base.getContext('2d').getImageData(0, 0, w, h).data, 1);
  const mipmaps = [base];
  while (w > 1 || h > 1) {
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    const c = level(w, h);
    const ctx = c.getContext('2d');
    const id = ctx.getImageData(0, 0, w, h);
    // Busca o fator que devolve a área opaca original.
    let lo = 1, hi = 8;
    for (let it = 0; it < 12; it++) {
      const mid = (lo + hi) / 2;
      if (coverage(id.data, mid) < target) lo = mid; else hi = mid;
    }
    for (let i = 3; i < id.data.length; i += 4) id.data[i] = Math.min(255, id.data[i] * hi);
    ctx.putImageData(id, 0, 0);
    mipmaps.push(c);
  }
  texture.mipmaps = mipmaps;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

/**
 * Junta as malhas por árvore. Nome da malha: "<árvore>|<bark|leaf|billboard>"
 * (o sufixo _LOD1/_Billboard do carvalho é removido do nome da árvore).
 */
function collectParts(gltf, toYUp) {
  const m = new THREE.Matrix4();
  const parts = {};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const [lod, rawKind] = o.name.split('|');
    const kind = rawKind.replace(/_\d+$/, ''); // malha com várias primitivas: "leaf_1"…
    const name = lod.replace(/_(LOD1|Billboard)$/, '');
    const geo = toFloatGeometry(o.geometry);
    geo.applyMatrix4(m.multiplyMatrices(toYUp, o.matrixWorld));
    const part = (parts[name] ??= {});
    // Uma árvore pode ter várias malhas do mesmo tipo (ex.: dois galhos de folhas).
    part[kind] = part[kind] ? mergeGeometries([part[kind], geo]) : geo;
  });
  for (const [name, part] of Object.entries(parts)) {
    for (const geo of Object.values(part)) {
      if (!geo.attributes.uv) throw new Error(`Árvore ${name}: modelo sem UV (exporte o GLB de novo)`);
    }
  }
  return parts;
}

/**
 * Carrega o GLB. Se o servidor não entregar .glb (ex.: o artefato publicado),
 * usa a cópia em base64 `<nome>.glb.json` ({ "glb": "<base64>" }).
 */
async function loadGltf(files) {
  const loader = new GLTFLoader();
  try {
    return await loader.loadAsync(files.glb);
  } catch {
    const { glb } = await (await fetch(files.glbJson)).json();
    const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
    return loader.parseAsync(bytes.buffer, '');
  }
}

/** Copia posição/normal/UV para Float32 (o GLB vem quantizado em inteiros). */
function toFloatGeometry(src) {
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name];
    if (!a) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}
