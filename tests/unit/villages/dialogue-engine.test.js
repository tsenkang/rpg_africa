import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DialogueEngine as D } from '../../../src/systems/npc/DialogueEngine.js';
import { DIALOGUE } from '../../../src/config/dialogues.js';

const alberto = { first: 'Alberto', last: 'Torres', fullName: 'Alberto Torres', profession: 'agricultor', age: 'adult', role: 'chefe' };
const first = () => 0;

test('albertoTorres_tiredFarmerAt1745_saysHisSpecificLine', () => {
  const ctx = D.context({ person: alberto, energy: 0.1, activity: 'LEISURE', hour: 17.75, weather: 'limpo', family: ['Maria Torres'], hoursWorked: 10, professionName: 'Agricultor' });
  assert.equal(ctx.mood, 'TRISTE_E_CANSADO');
  assert.equal(D.header(ctx), 'Alberto Torres - Agricultor | Cansado & Cabisbaixo');
  const line = D.line('greet', ctx, first);
  assert.match(line, /costas estão moídas/);
  assert.match(line, /ver Maria e deitar/);
});

test('line_prefersMostSpecificMatch_andFallsBackToGeneric', () => {
  const smith = { ...alberto, fullName: 'Kofi Mensah', first: 'Kofi', profession: 'ferreiro' };
  const working = D.context({ person: smith, activity: 'WORK', hour: 10 });
  assert.match(D.line('greet', working, first), /martelo/);
  const nobody = D.context({ person: { ...alberto, profession: 'artesao' }, activity: 'HOME', hour: 2 });
  assert.ok(D.line('greet', nobody, first).length > 3);
});

test('mood_memoryAndWeatherAndEnergy', () => {
  assert.equal(D.mood({ memory: { agredido: true } }), 'RANCOROSO');
  assert.equal(D.mood({ fear: true }), 'ASSUSTADO');
  assert.equal(D.mood({ memory: { provocado: 2 } }), 'IRRITADO');
  assert.equal(D.mood({ energy: 0.9, weather: 'frio' }), 'COM_FRIO');
  assert.equal(D.mood({ energy: 0.9 }), 'FELIZ');
});

test('trade_refusedWhenFamilyWasAssaulted', () => {
  const ctx = D.context({ person: { ...alberto, profession: 'mercador' }, memory: { parente_agredido: true } });
  assert.match(D.line('trade', ctx, first), /Não vendo/);
  assert.match(D.line('provoke', ctx, first), /minha família/);
});

test('perceive_armedBloodyInsaneAndSprintingToward', () => {
  const calm = D.perceive({ armed: false, dirt: 0, bleeding: false, sanity: 90, sprinting: false, towardDot: 0, dist: 3 });
  assert.equal(calm.threat, 0);
  const scary = D.perceive({ armed: true, dirt: 90, bleeding: false, sanity: 10, sprinting: true, towardDot: 0.95, dist: 3 });
  assert.deepEqual(scary.tags.sort(), ['armado', 'correndo', 'ensanguentado', 'insano']);
  const far = D.perceive({ armed: true, dirt: 90, bleeding: true, sanity: 10, sprinting: false, towardDot: 0, dist: 20 });
  assert.equal(far.threat, 0, 'longe não percebe');
  const passing = D.perceive({ armed: false, dirt: 0, bleeding: false, sanity: 90, sprinting: true, towardDot: 0.1, dist: 5 });
  assert.equal(passing.threat, 0, 'correndo de lado não assusta');
});

test('fill_replacesAllMarkers_andTablesHaveNoUnknownMarkers', () => {
  const ctx = D.context({ person: alberto, family: ['Maria Torres', 'Zuri Torres'], village: 'Vila Renascimento', hoursWorked: 6, professionName: 'Agricultor' });
  for (const lines of Object.values(DIALOGUE)) for (const l of lines) assert.doesNotMatch(D.fill(l.text, ctx), /\{\w+\}/, l.text);
});

test('react_matchesPlayerTag', () => {
  const ctx = D.context({ person: alberto, player: ['armado'] });
  assert.match(D.line('react', ctx, first), /arma/);
});
