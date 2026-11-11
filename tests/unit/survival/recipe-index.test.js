import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RecipeIndex } from '../../../src/systems/RecipeIndex.js';
import { RECIPES, ITEM_CATALOG } from '../../../src/config/items.js';

const idx = new RecipeIndex({ biomeName: (id) => id.toUpperCase() });

test('recipesFor_and_usesOf_matchRecipeTable', () => {
  assert.deepEqual(idx.recipesFor('lanca_pedra').map((r) => r.id), ['lanca_pedra']);
  const usesCorda = idx.usesOf('corda').map((r) => r.id);
  for (const id of ['lanca_pedra', 'faca_osso', 'arco']) assert.ok(usesCorda.includes(id), id);
  assert.ok(idx.usesOf('faca_osso').some((r) => r.id === 'agulha_osso'), 'ferramenta conta como uso');
  assert.deepEqual(idx.recipesFor('pedra'), [], 'pedra não se fabrica');
});

test('everyRecipeOutputIsReachable_andEveryIngredientHasASourceOrRecipe', () => {
  for (const r of RECIPES) {
    for (const id of [...Object.keys(r.in), ...(r.tools ?? [])]) {
      assert.ok(idx.sourcesOf(id).length || idx.recipesFor(id).length, `${id} (em ${r.id}) não tem origem`);
    }
  }
});

test('sourcesOf_listsGatheringSkinningFireShopAndRiver', () => {
  assert.ok(idx.sourcesOf('mel').some((s) => s.kind === 'coleta' && s.text.includes('SAVANA')));
  assert.ok(idx.sourcesOf('osso').some((s) => s.kind === 'caça'));
  assert.ok(idx.sourcesOf('carne_assada').some((s) => s.kind === 'fogueira'));
  assert.ok(idx.sourcesOf('livro').some((s) => s.kind === 'loja'));
  assert.ok(idx.sourcesOf('agua_rio').some((s) => s.kind === 'água'));
  assert.ok(idx.sourcesOf('agua_coco').length, 'vem junto com o coco');
});

test('effectsOf_describesTreatmentsAndFood', () => {
  assert.ok(idx.effectsOf('larvas_carne').some((t) => /infectada/i.test(t)));
  assert.ok(idx.effectsOf('curativo_tabaco').some((t) => /veneno/i.test(t)));
  assert.ok(idx.effectsOf('guanabana').some((t) => /parasitas/i.test(t)));
  assert.ok(idx.effectsOf('agua_rio').some((t) => /parasitas/.test(t)));
});

test('search_ignoresAccentsAndCase_andFiltersByCategory', () => {
  assert.ok(idx.search('LANCA').includes('lanca_pedra'));
  assert.ok(idx.search('guanábana').includes('guanabana'));
  const meds = idx.search('@remedio');
  assert.ok(meds.length && meds.every((id) => ITEM_CATALOG[id].kind === 'medicine'));
  assert.equal(idx.search('').length, Object.keys(ITEM_CATALOG).length);
});

test('missing_countsIngredientsAndTools', () => {
  const r = idx.recipesFor('agulha_osso')[0];
  assert.deepEqual(idx.missing(r, new Map()), { fragmento_osso: 1, faca_osso: 1 });
  assert.deepEqual(idx.missing(r, new Map([['fragmento_osso', 2], ['faca_osso', 1]])), {});
  assert.deepEqual(RecipeIndex.tableFor(idx.recipesFor('lamina_pedra')[0]), ['pedra', 'pedra']);
});
