import * as THREE from 'three';

/**
 * Malha da água em anéis polares em volta da origem (a câmera fica no centro).
 *
 * Raio cresce geometricamente: perto da câmera os vértices ficam a `inner` m, longe
 * passam de dezenas de metros — densidade de tela quase constante, como um CDLOD,
 * numa malha só (1 desenho). Cada vértice leva `aSpacing` (distância até o vizinho)
 * para o shader escolher o nível de mip de cada cascata (sem serrilhado nem "água nadando")
 * — mesma ideia do `level = log2(spacing / texel) + 0.7` do Tidewater.
 *
 * @example
 *   const geo = buildOceanGrid({ segments: 192, inner: 0.5, far: 6000 });
 *   geo.attributes.aSpacing.getX(0); // espaçamento do vértice 0 (m)
 *
 * @param {{ segments?: number, inner?: number, far?: number }} o
 * @returns {THREE.BufferGeometry} posição no plano y = 0
 */
export function buildOceanGrid({ segments = 192, inner = 0.5, far = 6000 } = {}) {
  const dTheta = (Math.PI * 2) / segments;
  const growth = 1 + dTheta; // espaçamento radial ≈ tangencial
  const r0 = inner / dTheta; // raio onde o espaçamento tangencial vale `inner`
  const radii = [];
  // Disco central em passos de `inner` até r0, depois crescimento geométrico.
  for (let r = inner; r < r0; r += inner) radii.push(r);
  for (let r = r0; r < far; r *= growth) radii.push(r);
  radii.push(far);
  const nR = radii.length;
  const pos = new Float32Array((1 + nR * segments) * 3);
  const spacing = new Float32Array(1 + nR * segments);
  spacing[0] = inner;
  for (let i = 0; i < nR; i++) {
    const r = radii[i], sp = Math.max(inner, r * dTheta, i ? r - radii[i - 1] : inner);
    for (let s = 0; s < segments; s++) {
      const k = 1 + i * segments + s, a = s * dTheta;
      pos[k * 3] = Math.cos(a) * r;
      pos[k * 3 + 2] = Math.sin(a) * r;
      spacing[k] = sp;
    }
  }
  const idx = [];
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let i = 0; i < nR - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = 1 + i * segments + s, b = 1 + i * segments + ((s + 1) % segments);
      const c = a + segments, d = b + segments;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSpacing', new THREE.BufferAttribute(spacing, 1));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), far);
  return geo;
}
