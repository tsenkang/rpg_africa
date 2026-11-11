import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crafting } from '../../../src/systems/Crafting.js';
import { Notebook } from '../../../src/systems/Notebook.js';
import { PlayerState } from '../../../src/systems/PlayerState.js';
import { RECIPES, ITEM_CATALOG } from '../../../src/config/items.js';

test('crafting_matchIgnoresOrder_andRejectsUnknownCombos', () => {
  const c = new Crafting();
  assert.equal(c.match(['corda', 'osso']).id, 'faca_osso');
  assert.equal(c.match(['osso', 'corda']).id, 'faca_osso');
  assert.equal(c.match(['graveto_longo']).id, 'lanca_simples');
  assert.equal(c.match(['corda', 'lamina_pedra', 'graveto_longo']).id, 'lanca_pedra');
  assert.equal(c.match(['pedra', 'cipo']), null);
  assert.equal(c.match(['pedra', 'pedra', 'pedra', 'pedra', 'pedra']), null, 'mais que 4 itens');
});

test('crafting_toolIsRequiredButNotConsumed', () => {
  const c = new Crafting(), s = new PlayerState();
  s.addItem('fragmento_osso', 1); s.addItem('faca_osso', 1);
  const r = c.match(['fragmento_osso', 'faca_osso']);
  assert.equal(r.id, 'agulha_osso');
  assert.equal(c.apply(r, s).ok, true);
  assert.equal(s.hasItem('faca_osso'), true, 'faca fica');
  assert.equal(s.hasItem('fragmento_osso'), false);
  assert.equal(s.inventory.get('agulha_osso'), 1);
});

test('crafting_applyFailsWithoutIngredients', () => {
  const c = new Crafting(), s = new PlayerState();
  assert.equal(c.apply(c.match(['folha_medicinal']), s).ok, false);
});

test('crafting_partialHintsRecipesThatContainTable', () => {
  const c = new Crafting();
  const ids = c.partial(['curativo_folha']).map((r) => r.id);
  assert.ok(ids.includes('curativo_cinza') && ids.includes('curativo_tabaco'));
  assert.ok(!ids.includes('curativo_folha'), 'a própria receita exata não é "parcial"');
});

test('recipes_allIngredientsAndOutputsExistInCatalog', () => {
  for (const r of RECIPES) {
    for (const id of [...Object.keys(r.in), ...Object.keys(r.out), ...(r.tools ?? [])]) assert.ok(ITEM_CATALOG[id], `${r.id}: item ${id} não existe`);
    assert.ok(Crafting.expand(r).length <= 4, `${r.id}: mais de 4 itens`);
  }
  const keys = RECIPES.map((r) => Crafting.key(Crafting.expand(r)));
  assert.equal(new Set(keys).size, keys.length, 'duas receitas com a mesma mesa');
});

test('notebook_recordsOnlyOnce_andEmitsEntry', () => {
  const nb = new Notebook();
  const seen = [];
  nb.on('entry', (e) => seen.push(e));
  assert.equal(nb.record('biomas', 'savana'), true);
  assert.equal(nb.record('biomas', 'savana'), false);
  assert.equal(nb.record('fauna', 'leao'), true);
  assert.equal(nb.record('receitas', ''), false);
  assert.deepEqual(seen.map((e) => e.id), ['savana', 'leao']);
  assert.equal(nb.count, 2);
  assert.deepEqual(nb.list('biomas'), ['savana']);
});

test('playerState_addItem_emitsItemAddedAndChange', () => {
  const s = new PlayerState();
  const got = [];
  s.on('item-added', (e) => got.push(e.id));
  let changes = 0;
  s.on('change', () => changes++);
  s.addItem('lirio', 2);
  assert.deepEqual(got, ['lirio']);
  assert.equal(changes, 1);
});
