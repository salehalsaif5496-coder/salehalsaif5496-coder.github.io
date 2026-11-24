const test = require('node:test');
const assert = require('node:assert');
const Jojo = require('../core.js');
const it = [{ key: 'sleep', label: 'نوم' }];

test('streak keeps counting while today is still unchecked', () => {
  const days = [
    { date: '2026-11-22', items: it, checks: { sleep: true } },
    { date: '2026-11-23', items: it, checks: { sleep: true } },
    { date: '2026-11-24', items: it, checks: {} },
  ];
  assert.strictEqual(Jojo.streak(days, 'sleep'), 2);
});

test('streak still breaks on a missed earlier day', () => {
  const days = [
    { date: '2026-11-22', items: it, checks: { sleep: true } },
    { date: '2026-11-23', items: it, checks: {} },
    { date: '2026-11-24', items: it, checks: { sleep: true } },
  ];
  assert.strictEqual(Jojo.streak(days, 'sleep'), 1);
});

test('recipeOfDay works for recipes without ids', () => {
  const r = [{ beanId: 'a' }, { beanId: 'b' }];
  for (const d of ['2026-11-24', '2026-11-25', '2026-12-01']) assert.ok(Jojo.recipeOfDay(r, [], d));
});
