const test = require('node:test');
const assert = require('node:assert');
const Jojo = require('../core.js');

const S = { gymDays: [1, 3], vitamins: ['D', 'B12', 'Iron'], waterGoal: 8, tz: 'Asia/Riyadh' };
const T = [{ id: 'study', title: 'مذاكرة', days: null }];
// 2026-11-23 = Monday (1), 2026-11-24 = Tuesday (2)

test('gym day with vitamins and a daily task → 14 items', () => {
  const items = Jojo.requiredItems(S, T, '2026-11-23');
  assert.strictEqual(items.length, 14);
  assert.ok(items.some((i) => i.key === 'gym'));
  assert.ok(items.some((i) => i.key === 'task:study'));
});

test('rest day → 13 items, no gym', () => {
  const items = Jojo.requiredItems(S, T, '2026-11-24');
  assert.strictEqual(items.length, 13);
  assert.ok(!items.some((i) => i.key === 'gym'));
});

test('empty vitamins list → no vitamins item', () => {
  const items = Jojo.requiredItems({ ...S, vitamins: [] }, [], '2026-11-24');
  assert.ok(!items.some((i) => i.key === 'vitamins'));
});

test('task with days:[1] only on Monday', () => {
  const t = [{ id: 'x', title: 'x', days: [1] }];
  assert.ok(Jojo.requiredItems(S, t, '2026-11-23').some((i) => i.key === 'task:x'));
  assert.ok(!Jojo.requiredItems(S, t, '2026-11-24').some((i) => i.key === 'task:x'));
});

test('water counts only at goal', () => {
  const items = [{ key: 'water', label: 'ماء' }, { key: 'sleep', label: 'نوم' }];
  const ctx = { waterGoal: 8 };
  assert.strictEqual(Jojo.dayScore(items, { water: 5, sleep: true }, ctx), 50);
  assert.strictEqual(Jojo.dayScore(items, { water: 8, sleep: true }, ctx), 100);
});

test('rest day: missing gym does not lower the score', () => {
  const items = Jojo.requiredItems(S, [], '2026-11-24');
  const checks = Object.fromEntries(items.map((i) => [i.key, i.key === 'water' ? 8 : true]));
  assert.strictEqual(Jojo.dayScore(items, checks, S), 100);
});

test('no items → null', () => {
  assert.strictEqual(Jojo.dayScore([], {}, S), null);
});

test('localDate uses the given timezone, not UTC', () => {
  assert.strictEqual(Jojo.localDate(new Date('2026-11-24T21:01:00Z'), 'Asia/Riyadh'), '2026-11-25');
  assert.strictEqual(Jojo.localDate(new Date('2026-11-24T20:58:00Z'), 'Asia/Riyadh'), '2026-11-24');
});
