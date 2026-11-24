const test = require('node:test');
const assert = require('node:assert');
const J = require('../core.js');

function day(date, items, checks, waterGoal) { return { date: date, items: items, checks: checks, waterGoal: waterGoal }; }
const S = [{ key: 'sleep', label: 'نمت بوقتي' }];
const SG = [{ key: 'sleep', label: 'نمت بوقتي' }, { key: 'gym', label: 'النادي' }];

test('streak: 7 days with a non-required day in the middle', () => {
  const days = [];
  for (let i = 1; i <= 8; i++) {
    const d = '2026-11-0' + i;
    if (i === 4) days.push(day(d, [{ key: 'wake', label: 'x' }], { wake: true }));
    else days.push(day(d, S, { sleep: true }));
  }
  assert.strictEqual(J.streak(days, 'sleep'), 7);
});

test('streak: a missed day breaks it', () => {
  const days = [
    day('2026-11-01', S, { sleep: true }), day('2026-11-02', S, { sleep: true }),
    day('2026-11-03', S, {}), day('2026-11-04', S, { sleep: true }), day('2026-11-05', S, { sleep: true })
  ];
  assert.strictEqual(J.streak(days, 'sleep'), 2);
});

test('streak: last day required and not done -> 0', () => {
  const days = [day('2026-11-01', S, { sleep: true }), day('2026-11-02', S, {})];
  assert.strictEqual(J.streak(days, 'sleep'), 0);
});

test('streak: water uses waterGoal', () => {
  const W = [{ key: 'water', label: 'الماء' }];
  const days = [day('2026-11-01', W, { water: 2000 }, 2000), day('2026-11-02', W, { water: 1000 }, 2000)];
  assert.strictEqual(J.streak(days, 'water'), 0);
  assert.strictEqual(J.streak(days.slice(0, 1), 'water'), 1);
});

test('unlocked: sleep_7 and full_day', () => {
  const days = [];
  for (let i = 1; i <= 7; i++) days.push(day('2026-11-0' + i, S, { sleep: true }));
  const u = J.unlocked(days);
  assert.ok(u.indexOf('sleep_7') !== -1);
  assert.ok(u.indexOf('full_day') !== -1);
  assert.ok(u.indexOf('gym_4w') === -1);
  assert.ok(u.indexOf('first_recipe') === -1);
});

test('unlocked: gym_4w needs 16 and first_recipe from coffee', () => {
  const days = [];
  for (let i = 1; i <= 16; i++) {
    const d = '2026-10-' + (i < 10 ? '0' + i : i);
    days.push(day(d, SG, { gym: true, coffee: i === 3 }));
  }
  const u = J.unlocked(days);
  assert.ok(u.indexOf('gym_4w') !== -1);
  assert.ok(u.indexOf('first_recipe') !== -1);
  assert.ok(J.unlocked(days.slice(1)).indexOf('gym_4w') === -1);
});

test('unlocked: empty', () => { assert.deepStrictEqual(J.unlocked([]), []); });
