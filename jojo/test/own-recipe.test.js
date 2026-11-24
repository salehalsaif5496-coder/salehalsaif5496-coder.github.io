/* وصفات جوجو الخاصة: تحقق الفورم (Jojo.validateRecipe) وتحويل الوقت */
const test = require('node:test');
const assert = require('node:assert');
const J = require('../core.js');

const good = () => ({
  name: 'قهوة الجمعة', style: 'hot', dose: '16', water: '256', iceCubes: '', temp: '92', target: '3:10', grind: 16,
  pours: [{ at: '0:00', to: '48', note: 'بلّلي' }, { at: '0:45', to: '150', note: '' }, { at: '1:30', to: '256', note: '' }],
  tastes: ['حلو'], note: ''
});

test('parseMMSS / fmtMMSS', () => {
  assert.strictEqual(J.parseMMSS('3:10'), 190);
  assert.strictEqual(J.parseMMSS('٠:٤٥'), 45);
  assert.strictEqual(J.parseMMSS('3.30'), 210);
  assert.strictEqual(J.parseMMSS('3:75'), null);
  assert.strictEqual(J.parseMMSS('90'), null);
  assert.strictEqual(J.parseMMSS(''), null);
  assert.strictEqual(J.fmtMMSS(190), '3:10');
  assert.strictEqual(J.fmtMMSS(0), '0:00');
});

test('valid recipe → row with seconds, numbers, steps shape', () => {
  const v = J.validateRecipe(good());
  assert.ok(v.ok, JSON.stringify(v.errors));
  assert.deepStrictEqual(v.row, {
    name: 'قهوة الجمعة', style: 'hot', roast: [], dose: 16, water: 256, ice: 0, ice_cubes: null, temp_c: 92,
    target_sec: 190, grind_encore: 16,
    steps: [{ at_sec: 0, pour_to_g: 48, note: 'بلّلي' }, { at_sec: 45, pour_to_g: 150, note: '' }, { at_sec: 90, pour_to_g: 256, note: '' }],
    tastes: ['حلو'], note: null
  });
});

test('Arabic digits are accepted; iced keeps free-text ice, hot drops it', () => {
  const f = good(); f.style = 'iced'; f.iceCubes = ' ٤ حبات بالسيرفر '; f.dose = '١٦'; f.water = '٢٥٦';
  const v = J.validateRecipe(f);
  assert.ok(v.ok);
  assert.strictEqual(v.row.ice_cubes, '٤ حبات بالسيرفر');
  assert.strictEqual(v.row.ice, 0);
  assert.strictEqual(v.row.dose, 16);
  f.style = 'hot';
  assert.strictEqual(J.validateRecipe(f).row.ice_cubes, null);
});

test('empty form: friendly errors on the required fields', () => {
  const v = J.validateRecipe({ name: '', style: 'hot', dose: '', water: '', temp: '', target: '', grind: 15, pours: [], tastes: [] });
  assert.ok(!v.ok);
  for (const k of ['name', 'dose', 'water', 'temp', 'target', 'pours']) assert.ok(v.errors[k], k);
  assert.match(v.errors.name, /اكتبي/);
});

test('pours: times and amounts must increase; last = water; before target', () => {
  let f = good(); f.pours[2].at = '0:30';
  assert.match(J.validateRecipe(f).errors['p2.at'], /بعد اللي قبلها/);
  f = good(); f.pours[1].to = '40';
  assert.match(J.validateRecipe(f).errors['p1.to'], /تزيد/);
  f = good(); f.pours[2].to = '250';
  assert.match(J.validateRecipe(f).errors['p2.to'], /توصل لكمية الموية/);
  f = good(); f.pours[2].to = '300';
  assert.ok(J.validateRecipe(f).errors['p2.to']);
  f = good(); f.pours[2].at = '3:10';
  assert.match(J.validateRecipe(f).errors['p2.at'], /قبل الوقت المستهدف/);
  f = good(); f.pours[1].at = 'abc';
  assert.ok(J.validateRecipe(f).errors['p1.at']);
  f = good(); f.pours[0].to = '';
  assert.ok(J.validateRecipe(f).errors['p0.to']);
});

test('ranges: grind 1–40, temp, target, dose, water', () => {
  for (const [k, v, key] of [['grind', 0, 'grind'], ['grind', 41, 'grind'], ['temp', '120', 'temp'], ['target', '0:10', 'target'], ['dose', '2', 'dose'], ['water', '5000', 'water']]) {
    const f = good(); f[k] = v;
    assert.ok(J.validateRecipe(f).errors[key], k + '=' + v);
  }
  for (const g of [1, 40]) { const f = good(); f.grind = g; assert.ok(J.validateRecipe(f).ok, 'grind ' + g); }
});

test('unknown tastes dropped, duplicates removed', () => {
  const f = good(); f.tastes = ['حلو', 'حلو', 'غريب', 'مر'];
  assert.deepStrictEqual(J.validateRecipe(f).row.tastes, ['حلو', 'مر']);
});
