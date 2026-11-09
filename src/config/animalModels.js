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
 * Espécie sem entrada aqui (suricato) usa o corpo procedural.
 */
const base = `${import.meta.env.BASE_URL}assets/models/animals/`;
const file = (id) => ({ glb: `${base}${id}.glb`, glbJson: `${base}${id}.glb.json` });

/** Clipes dos animais animados da Quaternius (mesmo esqueleto "AnimalArmature"). */
const QUATERNIUS = { idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack', death: 'Death', eat: 'Eating' };

export const ANIMAL_MODELS = {
  zebra: { ...file('zebra'), length: 2.4 },
  leao: { ...file('leao'), length: 2.3 },
  lobo: { ...file('lobo'), length: 1.5, clips: QUATERNIUS },
  alce: { ...file('alce'), length: 2.3, clips: { ...QUATERNIUS, attack: 'Attack_Headbutt' } },
  escorpiao: { ...file('escorpiao'), length: 1.7 },
  onca: { ...file('onca'), length: 1.9 },
  capivara: { ...file('capivara'), length: 1.2 },
  hiena: { ...file('hiena'), length: 1.5 },
  gorila: { ...file('gorila'), height: 1.6 },
  leopardo: { ...file('leopardo'), length: 1.9 },
  javali: { ...file('javali'), length: 1.4 },
  corvo: { ...file('corvo'), length: 0.5 },
};
