import { POPULATION, PROFESSIONS, NAMES, NAME_REGION } from '../../config/npcLife.js';

/**
 * Gera os moradores de uma vila (regra pura, determinística pelo rng):
 * famílias que compartilham o MESMO sobrenome e a mesma casa (`homeId`),
 * nomes completos únicos na vila, idade (criança/adulto/idoso), profissão
 * sorteada pelo bioma e os guardas da vila.
 *
 * @example
 * const people = generatePopulation({ villageId: 'renascimento', biome: 'savana', homes, rng });
 * people[0]; // { id, first, last, fullName, sex, age, role, familyId, homeId, profession, shift }
 */
export function generatePopulation({ villageId, biome, homes, rng, count = POPULATION.perVillage, guards = POPULATION.guards, cfg = POPULATION }) {
  const names = NAMES[NAME_REGION[biome] ?? 'common'];
  const used = new Set();
  const usedSurnames = new Set();
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const people = [];
  const professions = Object.entries(PROFESSIONS).filter(([, p]) => p.weight > 0 && (!p.biomes || p.biomes.includes(biome)));
  const pickProfession = () => {
    let total = 0;
    for (const [, p] of professions) total += p.weight;
    let r = rng() * total;
    for (const [id, p] of professions) { r -= p.weight; if (r <= 0) return id; }
    return professions[0][0];
  };
  const uniqueFirst = (sex, last) => {
    const pool = sex === 'f' ? names.female : names.male;
    for (let k = 0; k < pool.length * 2; k++) {
      const first = pick(pool);
      if (!used.has(`${first} ${last}`)) return first;
    }
    // Esgotou: numera (raro, só em vilas gigantes).
    let n = 2;
    while (used.has(`${pool[0]} ${last} ${n}`)) n++;
    return `${pool[0]} ${last} ${n}`.replace(` ${last}`, '');
  };
  const add = (o) => {
    const fullName = `${o.first} ${o.last}`;
    used.add(fullName);
    const p = { id: `${villageId}-${people.length}`, fullName, ...o };
    people.push(p);
    return p;
  };

  const homeList = [...homes];
  // Embaralha as casas (Fisher–Yates com o rng da vila).
  for (let i = homeList.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [homeList[i], homeList[j]] = [homeList[j], homeList[i]]; }
  let familyId = 0, h = 0;
  const civilians = Math.max(0, count - guards);
  while (people.length < civilians && h < homeList.length) {
    const home = homeList[h++];
    let last = pick(names.surnames);
    for (let k = 0; k < 6 && usedSurnames.has(last); k++) last = pick(names.surnames);
    usedSurnames.add(last);
    const fam = familyId++;
    const size = Math.min(civilians - people.length, cfg.familySize[0] + Math.floor(rng() * (cfg.familySize[1] - cfg.familySize[0] + 1)));
    // Chefe da família + cônjuge (se couber) + filhos/idosos.
    const sex0 = rng() < 0.5 ? 'm' : 'f';
    const head = add({ first: uniqueFirst(sex0, last), last, sex: sex0, age: 'adult', role: 'chefe', familyId: fam, homeId: home.id, profession: pickProfession() });
    if (size >= 2) {
      const sex1 = sex0 === 'm' ? 'f' : 'm';
      add({ first: uniqueFirst(sex1, last), last, sex: sex1, age: 'adult', role: 'conjuge', familyId: fam, homeId: home.id, profession: pickProfession(), spouseOf: head.id });
      head.spouseOf = people[people.length - 1].id;
    }
    for (let k = 2; k < size; k++) {
      const r = rng();
      const age = r < cfg.elderChance ? 'elder' : r < cfg.elderChance + cfg.childChance ? 'child' : 'adult';
      const sex = rng() < 0.5 ? 'm' : 'f';
      add({ first: uniqueFirst(sex, last), last, sex, age, role: age === 'elder' ? 'avo' : 'filho', familyId: fam, homeId: home.id, profession: age === 'adult' ? pickProfession() : null });
    }
  }
  // Guardas: moram nas casas seguintes (ou na primeira, se faltar casa), turnos alternados.
  for (let g = 0; g < guards; g++) {
    const home = homeList[(h + Math.floor(g / 2)) % Math.max(1, homeList.length)];
    const last = pick(names.surnames), sex = rng() < 0.8 ? 'm' : 'f';
    add({ first: uniqueFirst(sex, last), last, sex, age: 'adult', role: 'guarda', familyId: familyId++, homeId: home?.id ?? null, profession: 'guarda', shift: g % 4 < 2 ? 'day' : 'night', patrolPair: Math.floor(g / 2) });
  }
  return people;
}

/** Membros da família de uma pessoa (mesmo familyId), sem ela. */
export function familyOf(person, people) {
  return people.filter((p) => p.familyId === person.familyId && p.id !== person.id);
}
