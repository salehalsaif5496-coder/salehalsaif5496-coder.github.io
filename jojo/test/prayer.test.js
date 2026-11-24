const test = require('node:test');
const assert = require('node:assert');
const J = require('../core.js');

test('prayerTimes throws clear error without adhan', () => {
  assert.throws(() => J.prayerTimes('2026-11-24', 24.7136, 46.6753, 'Asia/Riyadh'), /adhan/i);
});

test('prayerTimes Riyadh 2026-11-24', () => {
  J.useAdhan(require('adhan'));
  const t = J.prayerTimes('2026-11-24', 24.7136, 46.6753, 'Asia/Riyadh');
  ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach(k => assert.match(t[k], /^\d\d:\d\d$/));
  assert.ok(t.fajr >= '04:50' && t.fajr <= '05:05', 'fajr ' + t.fajr);
  assert.ok(t.maghrib >= '17:00' && t.maghrib <= '17:15', 'maghrib ' + t.maghrib);
});
