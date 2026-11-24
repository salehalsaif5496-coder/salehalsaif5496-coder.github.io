const test = require('node:test');
const assert = require('node:assert');
const J = require('../core.js');

test('grindAdvice', () => {
  assert.strictEqual(J.grindAdvice(150, 180), 'finer');
  assert.strictEqual(J.grindAdvice(200, 180), 'coarser');
  assert.strictEqual(J.grindAdvice(185, 180), 'ok');
  assert.strictEqual(J.grindAdvice(190, 180), 'ok');
  assert.strictEqual(J.grindAdvice(170, 180), 'ok');
});

test('GENERIC_DRIP', () => {
  assert.deepStrictEqual(J.GENERIC_DRIP, { dose: 15, water: 240, tempC: 93, targetSec: 180, approved: false });
});

test('tasteProfile: likes sweet', () => {
  const r = [
    { beanId: 'a', liked: true, notes: ['حلو', 'خفيف'] },
    { beanId: 'a', liked: true, notes: ['حلو'] },
    { beanId: 'b', liked: true, notes: ['حامض'] },
    { beanId: 'b', liked: false, notes: ['مر'] },
    { beanId: 'b', liked: false, notes: ['مر'] }
  ];
  const p = J.tasteProfile(r);
  assert.ok(p.likes.indexOf('حلو') !== -1);
  assert.ok(p.likes.indexOf('حامض') === -1);
  assert.ok(p.dislikes.indexOf('مر') !== -1);
  assert.strictEqual(p.liked, 3);
  assert.strictEqual(p.total, 5);
});

test('tasteProfile: empty', () => {
  assert.deepStrictEqual(J.tasteProfile([]), { likes: [], dislikes: [], liked: 0, total: 0 });
});

const recipes = [{ id: 'r1', beanId: 'a' }, { id: 'r2', beanId: 'b' }, { id: 'r3', beanId: 'c' }];
const ratings = [{ beanId: 'a', liked: true, notes: [] }, { beanId: 'b', liked: false, notes: [] }];

test('recipeOfDay deterministic', () => {
  assert.deepStrictEqual(J.recipeOfDay(recipes, ratings, '2026-11-24'), J.recipeOfDay(recipes, ratings, '2026-11-24'));
});

test('recipeOfDay single recipe and empty', () => {
  assert.strictEqual(J.recipeOfDay([recipes[0]], [], '2026-11-24').id, 'r1');
  assert.strictEqual(J.recipeOfDay([], [], '2026-11-24'), null);
});

test('recipeOfDay avoids yesterday', () => {
  for (let d = 1; d <= 28; d++) {
    const dd = '2026-11-' + (d < 10 ? '0' + d : d);
    const prev = new Date(Date.UTC(2026, 10, d - 1)).toISOString().slice(0, 10);
    assert.notStrictEqual(J.recipeOfDay(recipes, ratings, dd).id, J._recipePick(recipes, ratings, prev).id, 'day ' + dd);
  }
});

test('recipeOfDay weighs library recipes by her taste (tastes, no beanId)', () => {
  const lib = [{ id: 'sweet', tastes: ['حلو'] }, { id: 'bitter', tastes: ['مر'] }, { id: 'sour', tastes: ['حامض'] }];
  const likesSweet = [
    { liked: true, notes: ['حلو'] }, { liked: true, notes: ['حلو'] },
    { liked: false, notes: ['مر'] }, { liked: false, notes: ['مر'] }
  ];
  const count = { sweet: 0, bitter: 0, sour: 0 }, base = { sweet: 0, bitter: 0, sour: 0 };
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    count[J._recipePick(lib, likesSweet, d).id]++;
    base[J._recipePick(lib, [], d).id]++;
  }
  assert.ok(count.sweet > base.sweet, 'sweet picked more once she likes sweet (' + count.sweet + ' vs ' + base.sweet + ')');
  assert.ok(count.sweet > count.bitter);
});
