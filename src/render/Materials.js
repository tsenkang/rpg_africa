import * as THREE from 'three';
import { createTextures } from './ProceduralTextures.js';

/**
 * Biblioteca de materiais compartilhados das construções.
 * `userData.uvScale` = metros cobertos por uma repetição da textura
 * (usado pelo StaticBatcher para projetar UVs em escala real).
 */
export function createMaterials(timeUniform = { value: 0 }) {
  const T = createTextures();

  const mat = (opts, uvScale = 2, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...opts });
    m.userData.uvScale = uvScale;
    Object.assign(m.userData, extra);
    return m;
  };

  const M = {
    textures: T,

    // Paredes
    adobeOchre: mat({ map: T.plaster(0xc89a64, 3) }, 3),
    adobeRed: mat({ map: T.plaster(0xb0704a, 4) }, 3),
    adobeWhite: mat({ map: T.plaster(0xe2d8c4, 5) }, 3),
    adobePastel: mat({ map: T.plaster(0xd4b48a, 6) }, 3),
    mudBrick: mat({ map: T.mudBrick(0xa8764a, 8) }, 2),
    mudBrickDark: mat({ map: T.mudBrick(0x7e583a, 9) }, 2),
    stone: mat({ map: T.stone(0xa79f90, 7) }, 3),
    stoneDark: mat({ map: T.stone(0x6f6a62, 12) }, 3),
    stoneLight: mat({ map: T.stone(0xd6cdb8, 14) }, 3),
    rubble: mat({ map: T.stone(0x8a7e6c, 21) }, 1.5),
    // Pedras dos marcos do mapa
    basalt: mat({ map: T.stone(0x3a3836, 61), roughness: 0.8 }, 4),
    basaltDark: mat({ map: T.stone(0x26252a, 62), roughness: 0.75 }, 5),
    mossStone: mat({ map: T.stone(0x7d8466, 63) }, 3),
    sandstone: mat({ map: T.stone(0xc49a66, 64) }, 4),
    redRock: mat({ map: T.stone(0xa8583a, 65) }, 5),
    dryStone: mat({ map: T.cobble(0x9c9282, 66) }, 2.2),

    // Telhados
    thatch: mat({ map: T.thatch(17) }, 2.5),
    tilesRed: mat({ map: T.tiles(0xa4553a, 19) }, 2),
    tilesBrown: mat({ map: T.tiles(0x7a4a32, 20) }, 2),
    metalRoof: mat({ map: T.metal(23), roughness: 0.6, metalness: 0.35 }, 2.5),

    // Madeira
    wood: mat({ map: T.wood(0x8a6644, 13) }, 2),
    woodDark: mat({ map: T.wood(0x553a26, 14) }, 2),
    woodLight: mat({ map: T.wood(0xb08c62, 15) }, 2),
    log: mat({ map: T.bark(), color: 0x6a5038 }, 1.5),
    // Madeira pintada (venezianas e portas)
    paintBlue: mat({ map: T.wood(0x3f6f8f, 51) }, 1.5),
    paintGreen: mat({ map: T.wood(0x4f7a4a, 52) }, 1.5),
    paintRed: mat({ map: T.wood(0x8f3b2c, 53) }, 1.5),
    paintOchre: mat({ map: T.wood(0xc08a3a, 54) }, 1.5),
    pottery: mat({ map: T.plaster(0x9a5a36, 55), roughness: 0.75 }, 1),

    // Pisos
    cobble: mat({ map: T.cobble(0x9a8f80, 9) }, 1.8), // pedras de ~20-30 cm
    cobbleWarm: mat({ map: T.cobble(0xb59a7a, 10) }, 1.8),
    dirt: mat({ map: T.plaster(0x7d6448, 33) }, 4),

    // Tecidos das feiras
    clothRed: mat({ map: T.cloth(0xa8382c, 0xe0c9a0, 29), side: THREE.DoubleSide }, 3),
    clothBlue: mat({ map: T.cloth(0x2f5d8a, 0xe8dcc0, 30), side: THREE.DoubleSide }, 3),
    clothGreen: mat({ map: T.cloth(0x4a7a3a, 0xe3d3a0, 31), side: THREE.DoubleSide }, 3),
    clothYellow: mat({ map: T.cloth(0xd2a02a, 0x8a3a24, 32), side: THREE.DoubleSide }, 3),

    // Detalhes
    iron: mat({ color: 0x2b2b2e, roughness: 0.45, metalness: 0.8 }, 1),
    brass: mat({ color: 0xb08a3c, roughness: 0.35, metalness: 0.9 }, 1),
    darkOpening: mat({ color: 0x14100c, roughness: 1 }, 1),
    glass: mat({ color: 0x23313a, roughness: 0.15, metalness: 0.2 }, 1),
    gold: mat({ color: 0xc9a64a, roughness: 0.3, metalness: 1 }, 1),
    whitePaint: mat({ color: 0xf0ebe0 }, 1),
    water: rippleWater(mat({ color: 0x1c3b44, roughness: 0.08, metalness: 0.1 }, 1), timeUniform),
    waterOasis: rippleWater(mat({ color: 0x3a8e92, roughness: 0.05, metalness: 0.15 }, 1), timeUniform),
    clockFace: mat({ map: T.clockFace(), roughness: 0.6 }, 1, { keepUV: true }),
    produceRed: mat({ color: 0xb8352a, roughness: 0.6 }, 1),
    produceGreen: mat({ color: 0x5f8f32, roughness: 0.6 }, 1),
    produceYellow: mat({ color: 0xd9b23a, roughness: 0.6 }, 1),
    produceOrange: mat({ color: 0xd9782a, roughness: 0.6 }, 1),
    basket: mat({ map: T.thatch(41), color: 0xc8a070 }, 0.6),
    cropGreen: mat({ color: 0x5e8a2e, roughness: 0.8, side: THREE.DoubleSide }, 1),
    cropDry: mat({ color: 0xc2a45a, roughness: 0.85, side: THREE.DoubleSide }, 1),
    soilRows: mat({ map: T.plaster(0x5a4230, 35) }, 2),
    runeGlow: mat({ color: 0xff7a2a, emissive: 0xff5a10, emissiveIntensity: 1.6, roughness: 0.6 }, 1),
    vine: mat({ color: 0x3e5a2a, roughness: 0.9 }, 1),
    // Novos assentamentos
    leather: mat({ map: T.plaster(0x9a6e48, 71), roughness: 0.85 }, 2),
    hide: mat({ map: T.plaster(0x7a5434, 72), side: THREE.DoubleSide }, 1.5),
    hideLight: mat({ map: T.plaster(0xc8a882, 73), side: THREE.DoubleSide }, 1.5),
    bone: mat({ color: 0xe6dcc6, roughness: 0.7 }, 1),
    rope: mat({ color: 0x9c8257, roughness: 1 }, 1),
    charred: mat({ map: T.bark(), color: 0x2a2420, roughness: 1 }, 1.5),
    snowCap: mat({ color: 0xf2f6fa, roughness: 0.6 }, 2),
    frozenLog: mat({ map: T.bark(), color: 0x7f8c96 }, 1.5), // madeira congelada (taiga)
    blackMoss: mat({ map: T.stone(0x35392f, 81) }, 3), // pedra com musgo negro (ruínas)
    flame: mat({ color: 0xffb04a, emissive: 0xff6a10, emissiveIntensity: 2.4, roughness: 1 }, 1),
    eerie: mat({ color: 0x6b4a8a, emissive: 0x2a1240, roughness: 0.4 }, 1),
  };
  return M;
}

/**
 * Água parada (poços, cisternas): três marolas cruzadas que perturbam a
 * normal com o tempo. O reflexo do sol e do céu "dança" na
 * superfície sem textura nenhuma. Funciona mesmo com a geometria unida pelo
 * StaticBatcher (usa a posição no mundo).
 * @param {THREE.MeshStandardMaterial} material
 * @param {{ value: number }} timeUniform tempo do jogo (compartilhado)
 * @returns {THREE.MeshStandardMaterial} o mesmo material
 */
function rippleWater(material, timeUniform) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.vertexShader = 'varying vec3 vRippleW;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\nvRippleW = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader = 'uniform float uTime;\nvarying vec3 vRippleW;\n' + shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        vec2 p = vRippleW.xz;
        // Três marolas cruzadas em frequências diferentes (sem padrão visível).
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 9.0 + uTime * 2.6) * 0.11;
        g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 13.0 + uTime * 3.4) * 0.07;
        g += vec2(0.2, -0.98) * cos(dot(p, vec2(0.2, -0.98)) * 21.0 + uTime * 4.7) * 0.04;
        vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
      }`,
    );
  };
  material.customProgramCacheKey = () => 'ripple-water';
  return material;
}
