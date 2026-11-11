import { OUTFITS, OUTFIT_REGION, PROFESSIONS } from '../../config/npcLife.js';
import { SKIN_TONES } from '../../entities/Humanoid.js';

/**
 * Aparência de um morador (opções do Humanoid), contextual ao bioma e à
 * profissão (regra pura): sobretudo e pele na Taiga, linho e turbante no
 * deserto, fibra e couro na mata, avental de artesão, roupa nobre de
 * mercador e uniforme/armadura dos guardas.
 *
 * @example
 * const look = buildLook(person, 'taiga', rng); // { shirt, cape, hat: 'fur', gloves, boots, height, ... }
 * new Humanoid(look);
 */
export function buildLook(person, biome, rng) {
  const O = OUTFITS[OUTFIT_REGION[biome] ?? 'common'];
  const pick = (list) => (Array.isArray(list) ? list[Math.floor(rng() * list.length) % list.length] : list);
  const chance = (p) => rng() < (p ?? 0);
  const look = {
    skin: pick(SKIN_TONES),
    shirt: pick(O.shirts),
    pants: pick(O.pants),
    hair: [0x111111, 0x2a1a10, 0x3a2a1a, 0x1a1410][Math.floor(rng() * 4)],
    height: person.age === 'child' ? 1.05 + rng() * 0.3 : 1.58 + rng() * 0.3 * (person.sex === 'm' ? 1.1 : 0.85),
    build: person.age === 'child' ? 0.8 : 0.9 + rng() * 0.25,
    hunch: person.age === 'elder' ? 0.25 : 0,
  };
  if (person.age === 'elder') look.hair = 0xd8d8d8;
  if (chance(O.robeChance)) look.robe = true;
  if (O.hat && (O.hatChance === undefined || chance(O.hatChance))) { look.hat = O.hat; if (O.hatColors) look.hatColor = pick(O.hatColors); }
  if (O.cape && chance(O.capeChance)) look.cape = pick(O.cape);
  if (O.gloves) look.gloves = pick(O.gloves);
  if (O.boots) look.boots = pick(O.boots);
  if (O.straps && chance(O.strapsChance)) look.straps = pick(O.straps);
  const prof = PROFESSIONS[person.profession];
  if (prof?.apron) look.apron = prof.apron;
  if (person.profession === 'mercador' && O.noble && chance(0.5)) Object.assign(look, O.noble); // mercador abastado
  if (person.profession === 'cacador') look.accessory = 'spear';
  if (person.profession === 'guarda') Object.assign(look, O.guard, { accessory: 'spear' });
  if (person.age === 'child') { delete look.cape; delete look.apron; delete look.accessory; }
  return look;
}
