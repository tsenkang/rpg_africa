import { test } from 'node:test';
import assert from 'node:assert/strict';
import { icon, ICON_KEYS } from '../../../src/ui/Icons.js';
import { ITEMS } from '../../../src/systems/PlayerState.js';
import { WOUNDS, CONDITIONS, FOODS } from '../../../src/config/survival.js';
import { DEBUFFS } from '../../../src/config/weather.js';

const TABLES = { ITEMS, WOUNDS, CONDITIONS, FOODS, DEBUFFS };

test('dataIcons_everyIconKeyExistsInIconSet', () => {
  const missing = [];
  for (const [name, table] of Object.entries(TABLES)) {
    for (const [id, d] of Object.entries(table)) if (d.icon && !ICON_KEYS.includes(d.icon)) missing.push(`${name}.${id}=${d.icon}`);
  }
  assert.deepEqual(missing, []);
});

test('icon_knownKey_returnsSvgWithCurrentColor', () => {
  const s = icon('eye', 'lg');
  assert.match(s, /^<svg class="i lg"/);
  assert.match(s, /stroke="currentColor"/);
});

test('icon_emptyKey_returnsEmpty_unknownKey_returnsDot', () => {
  assert.equal(icon(''), '');
  assert.match(icon('nao-existe'), /<circle cx="12" cy="12" r="2.5"\/>/);
});
