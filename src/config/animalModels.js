/**
 * Modelos 3D dos animais (poly.pizza). Créditos em
 * `public/assets/models/animals/CREDITS.md` (CC-BY exige citar o autor).
 *
 * Cada modelo vem numa escala e num eixo diferentes; o carregador
 * (`src/render/AnimalModels.js`) normaliza assim, nesta ordem:
 *   1. `rotation` [x, y, z] (rad): deixa o animal em pé (Y para cima);
 *   2. `yaw` (rad): vira a cabeça para +Z (a frente dos animais no jogo);
 *   3. escala para `length` m de comprimento (eixo Z) ou `height` m de altura;
 *   4. apoia no chão (y mínimo = 0) e centraliza em X/Z.
 *
 * `clips`: nome da animação do GLB para cada estado (só nos animados).
 * `tint` / `emissive`: recolore o modelo (materiais copiados só para a espécie).
 * Espécie sem entrada aqui (suricato) usa o corpo procedural.
 */
const base = `${(import.meta.env?.BASE_URL ?? "/")}assets/models/animals/`;
const file = (id) => ({ glb: `${base}${id}.glb`, glbJson: `${base}${id}.glb.json` });

/** Clipes dos animais animados da Quaternius (mesmo esqueleto "AnimalArmature"). */
const QUATERNIUS = { idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack', death: 'Death', eat: 'Eating' };

/**
 * `rig`: esqueleto gerado pelo AutoRig (`src/render/AutoRig.js`) para modelos
 * ESTÁTICOS — sem ele o modelo só se move inteiro. `kind`: 'quadruped' |
 * 'biped' | 'bird' | 'scorpion'; `lateralLegs`: patas abertas para os lados
 * (jacaré); `spineBones`/`tailBones`: quantos ossos na coluna/cauda.
 * `rig: false` desliga. Modelos com `clips` já têm esqueleto próprio.
 */
const Q = { kind: 'quadruped' };

/** Carregador: pasta do decodificador Draco (copiado de three/examples/jsm/libs/draco/gltf). */
export const ANIMAL_LOADER = { dracoPath: `${(import.meta.env?.BASE_URL ?? "/")}draco/` };

/*
 * COMO ADICIONAR O MODELO DE UMA ESPÉCIE NOVA (camelo, víbora, girafa, urso,
 * arara, avestruz, jacaré, cérbero hoje usam o corpo procedural):
 *   1. ponha `<id>.glb` em `public/assets/models/animals/` (CC0/CC-BY; cite em CREDITS.md);
 *   2. acrescente aqui: `camelo: { ...file('camelo'), length: 3.0 }`
 *      (ou `height:` para bichos altos: `girafa: { ...file('girafa'), height: 5.2 }`);
 *   3. se for animado, mapeie os clipes: `clips: { idle: 'Idle', walk: 'Walk', run: 'Run', attack: 'Attack', death: 'Death' }`
 *      — o AnimalBody troca o clipe conforme o estado da IA (wander → walk, chase → run, attack → attack…);
 *   4. se vier deitado/de costas, ajuste `rotation` / `yaw` (ver o topo deste arquivo).
 * Não precisa mexer em mais nada: espécie com modelo usa o modelo, sem modelo usa o procedural.
 * O `.glb.json` (cópia em base64) só é necessário se o servidor não entregar `.glb`:
 *   node -e "const f=require('fs');f.writeFileSync('X.glb.json',JSON.stringify({glb:f.readFileSync('X.glb').toString('base64')}))"
 */
export const ANIMAL_MODELS = {
  zebra: { ...file('zebra'), length: 2.4, rig: Q },
  leao: { ...file('leao'), length: 2.3, rig: Q },
  lobo: { ...file('lobo'), length: 1.5, clips: QUATERNIUS },
  alce: { ...file('alce'), length: 2.3, clips: { ...QUATERNIUS, attack: 'Attack_Headbutt' } },
  escorpiao: { ...file('escorpiao'), length: 1.7, rig: { kind: 'scorpion' } },
  onca: { ...file('onca'), length: 1.9, rig: Q },
  capivara: { ...file('capivara'), length: 1.2, rig: Q },
  hiena: { ...file('hiena'), length: 1.5, rig: Q },
  gorila: { ...file('gorila'), height: 1.6, rig: { kind: 'quadruped', tail: false } },
  leopardo: { ...file('leopardo'), length: 1.9, rig: Q },
  javali: { ...file('javali'), length: 1.4, rig: Q },
  corvo: { ...file('corvo'), length: 0.5, rig: { kind: 'bird', jaw: false } },
  // ---- 3 espécies por bioma (ver CREDITS.md) ----
  camelo: { ...file('camelo'), length: 3.0, rig: Q },
  vibora: {
    ...file('vibora'), length: 1.6,
    clips: { idle: 'SnakeArmature|Snake_Idle', walk: 'SnakeArmature|Snake_Walk', run: 'SnakeArmature|Snake_Walk', attack: 'SnakeArmature|Snake_Attack' },
    tint: 0xb89a68, // Quaternius vem verde: pinta de areia (víbora do deserto)
  },
  girafa: { ...file('girafa'), height: 5.2, rig: Q },
  urso: { ...file('urso'), length: 2.2, rig: { kind: 'quadruped', tail: false } },
  arara: { ...file('arara'), length: 0.85, rig: { kind: 'bird', jaw: false } },
  avestruz: { ...file('avestruz'), height: 2.4, rig: { kind: 'biped', jaw: false } },
  jacare: { ...file('jacare'), length: 3.4, rig: { kind: 'quadruped', lateralLegs: true, spineBones: 4, tailBones: 4 } },
  // Cérbero: o lobo animado, maior, quase preto e com brilho vermelho (cão paranormal).
  cerbero: { ...file('lobo'), length: 2.6, clips: QUATERNIUS, tint: 0x1c1618, emissive: 0x2a0404 },
};
