import * as THREE from 'three';
import { PHOTO_TEXTURES } from '../config/photoAssets.js';

/**
 * Carrega as texturas fotográficas (chão, casca, atlas de folhagem).
 *
 * @example
 *   const photos = await loadPhotoTextures(renderer);
 *   material.map = photos.ground;
 *
 * @param {THREE.WebGLRenderer} renderer usado só para saber a anisotropia máxima.
 * @returns {Promise<{ground, groundNormal, bark, barkNormal, foliage: THREE.Texture}>}
 */
export async function loadPhotoTextures(renderer) {
  const loader = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (key, { srgb = true, repeat = true } = {}) => {
    const tex = await loader.loadAsync(PHOTO_TEXTURES[key].url);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = aniso;
    return tex;
  };
  const [ground, groundNormal, bark, barkNormal, foliage] = await Promise.all([
    load('ground'),
    load('groundNormal', { srgb: false }),
    load('bark'),
    load('barkNormal', { srgb: false }),
    load('foliage', { repeat: false }),
  ]);
  return { ground, groundNormal, bark, barkNormal, foliage };
}
