import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, MAOS_LIVRES } from '../../../src/systems/Inventory.js';

const SLOTS = 8;
const faca = () => ({ id: 'faca', nome: 'Faca', tipo: 'arma' });

test('inventory_new_has_8_empty_slots_and_free_hands', () => {
  const inv = new Inventory({ slots: SLOTS });
  assert.equal(inv.slots.length, SLOTS);
  assert.ok(inv.slots.every((s) => s === null));
  assert.equal(inv.equipado, MAOS_LIVRES);
  assert.equal(inv.maosLivres, true);
});

test('adicionarItem_uses_first_empty_slot_and_returns_index', () => {
  const inv = new Inventory({ slots: SLOTS });
  assert.equal(inv.adicionarItem(faca()), 0);
  assert.equal(inv.adicionarItem({ id: 'pedra' }), 1);
  assert.equal(inv.slots[1].nome, 'pedra'); // sem nome: usa o id
});

test('adicionarItem_returns_minus_one_when_full', () => {
  const inv = new Inventory({ slots: SLOTS });
  for (let i = 0; i < SLOTS; i++) inv.adicionarItem({ id: `item${i}` });
  assert.equal(inv.adicionarItem(faca()), -1);
});

test('adicionarItem_rejects_item_without_id', () => {
  const inv = new Inventory({ slots: SLOTS });
  assert.throws(() => inv.adicionarItem({ nome: 'sem id' }));
});

test('selecting_filled_slot_equips_item_and_empty_slot_frees_hands', () => {
  const inv = new Inventory({ slots: SLOTS });
  inv.adicionarItem(faca());
  inv.selecionar(0);
  assert.equal(inv.equipado.nome, 'Faca');
  assert.equal(inv.maosLivres, false);
  inv.selecionar(5);
  assert.equal(inv.equipado, MAOS_LIVRES);
});

test('selecionar_ignores_out_of_range', () => {
  const inv = new Inventory({ slots: SLOTS });
  inv.selecionar(3);
  inv.selecionar(SLOTS);
  inv.selecionar(-1);
  assert.equal(inv.selected, 3);
});

test('removing_equipped_item_returns_to_free_hands', () => {
  const inv = new Inventory({ slots: SLOTS });
  inv.adicionarItem(faca());
  assert.equal(inv.removerItem(0).id, 'faca');
  assert.equal(inv.equipado, MAOS_LIVRES);
});

test('onChange_fires_on_add_and_select', () => {
  const inv = new Inventory({ slots: SLOTS });
  let calls = 0;
  inv.onChange(() => calls++);
  inv.adicionarItem(faca());
  inv.selecionar(2);
  inv.selecionar(2); // mesmo slot: sem evento
  assert.equal(calls, 2);
});
