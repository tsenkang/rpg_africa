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

/** Carregador: pasta do decodificador Draco (copiado de three/examples/jsm/libs/draco/gltf). */
export const ANIMAL_LOADER = { dracoPath: `${import.meta.env.BASE_URL}draco/` };

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
