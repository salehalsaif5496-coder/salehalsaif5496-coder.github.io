/* يتأكد إن وصفات jojo/server/recipes-seed.sql معقولة: نسب، طحنة Encore، خطوات الصب */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const sql = fs.readFileSync(path.join(__dirname, '../server/recipes-seed.sql'), 'utf8');
const recipes = JSON.parse(sql.split('$recipes$')[1]);
const TASTES = ['حلو', 'حامض', 'مر', 'خفيف', 'ثقيل'];

test('8 recipes: 4 hot, 4 iced, unique ids, all roasts covered', () => {
  assert.strictEqual(recipes.length, 8);
  assert.strictEqual(recipes.filter((r) => r.style === 'hot').length, 4);
  assert.strictEqual(recipes.filter((r) => r.style === 'iced').length, 4);
  assert.strictEqual(new Set(recipes.map((r) => r.id)).size, 8);
  for (const style of ['hot', 'iced']) {
    const roasts = new Set(recipes.filter((r) => r.style === style).flatMap((r) => r.roast));
    for (const x of ['light', 'medium', 'dark']) assert.ok(roasts.has(x), style + ' covers ' + x);
  }
});

test('each recipe is brewable', () => {
  for (const r of recipes) {
    const ratio = (r.water + r.ice) / r.dose;
    assert.ok(ratio >= 14.5 && ratio <= 17.2, r.id + ' ratio ' + ratio);
    assert.ok(r.style === 'hot' ? r.ice === 0 : r.ice > 0 && r.ice < r.water, r.id + ' ice');
    assert.ok(r.grind_encore >= 12 && r.grind_encore <= 22, r.id + ' grind');
    assert.ok(r.temp_c >= 85 && r.temp_c <= 96, r.id + ' temp');
    assert.ok(r.target_sec >= 120 && r.target_sec <= 240, r.id + ' time');
    assert.ok(r.name && r.note && !/معتمد|ريز|Rays|Notion/i.test(r.name + r.note), r.id + ' copy');
    assert.ok(r.tastes.length && r.tastes.every((t) => TASTES.includes(t)), r.id + ' tastes');
    const s = r.steps;
    assert.strictEqual(s[0].at_sec, 0, r.id + ' starts with bloom at 0');
    assert.ok(s[0].pour_to_g >= r.dose * 2 && s[0].pour_to_g <= r.dose * 3.2, r.id + ' bloom 2–3× dose');
    for (let i = 1; i < s.length; i++) {
      assert.ok(s[i].at_sec > s[i - 1].at_sec && s[i].pour_to_g > s[i - 1].pour_to_g, r.id + ' step ' + i);
      assert.ok(s[i].at_sec < r.target_sec, r.id + ' pours before target');
    }
    assert.strictEqual(s[s.length - 1].pour_to_g, r.water, r.id + ' last pour = water');
  }
});
