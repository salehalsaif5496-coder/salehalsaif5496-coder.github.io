const test = require('node:test');
const assert = require('node:assert');
const Jojo = require('../core.js');

test('ACHIEVEMENTS lists every id unlocked() can return', () => {
  const items = [{ key: 'sleep', label: 'نوم' }, { key: 'gym', label: 'نادي' }];
  const days = [];
  for (let i = 0; i < 20; i++) {
    const date = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
    days.push({ date, items, checks: { sleep: true, gym: true, coffee: i === 0 } });
  }
  const got = Jojo.unlocked(days);
  assert.deepStrictEqual(got.slice().sort(), Jojo.ACHIEVEMENTS.slice().sort());
});

test('pctBand: none / low / mid / high', () => {
  assert.strictEqual(Jojo.pctBand(null), 'none');
  assert.strictEqual(Jojo.pctBand(undefined), 'none');
  assert.strictEqual(Jojo.pctBand(0), 'low');
  assert.strictEqual(Jojo.pctBand(49), 'low');
  assert.strictEqual(Jojo.pctBand(50), 'mid');
  assert.strictEqual(Jojo.pctBand(79), 'mid');
  assert.strictEqual(Jojo.pctBand(80), 'high');
  assert.strictEqual(Jojo.pctBand(100), 'high');
});

test('dailyStreak counts back from today; today below 80 does not break it', () => {
  const rows = [
    { date: '2026-11-20', pct: 90 }, { date: '2026-11-21', pct: 50 },
    { date: '2026-11-22', pct: 85 }, { date: '2026-11-23', pct: 100 }, { date: '2026-11-24', pct: 40 }
  ];
  assert.strictEqual(Jojo.dailyStreak(rows, '2026-11-24'), 2);
  rows[4].pct = 80;
  assert.strictEqual(Jojo.dailyStreak(rows, '2026-11-24'), 3);
});

test('dailyStreak: a missing day breaks, a null-pct day is skipped, no today row is fine', () => {
  assert.strictEqual(Jojo.dailyStreak([{ date: '2026-11-21', pct: 90 }, { date: '2026-11-23', pct: 90 }], '2026-11-24'), 1);
  assert.strictEqual(Jojo.dailyStreak([{ date: '2026-11-21', pct: 90 }, { date: '2026-11-22', pct: null }, { date: '2026-11-23', pct: 90 }], '2026-11-24'), 2);
  assert.strictEqual(Jojo.dailyStreak([], '2026-11-24'), 0);
  assert.strictEqual(Jojo.dailyStreak([{ date: '2026-11-23', pct: 79 }], '2026-11-24'), 0);
});

test('dailyStreak crosses month and year boundaries', () => {
  const rows = [{ date: '2025-12-31', pct: 100 }, { date: '2026-01-01', pct: 100 }];
  assert.strictEqual(Jojo.dailyStreak(rows, '2026-01-01'), 2);
});
