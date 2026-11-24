/* جوجو — منطق التطبيق (بدون واجهة). يشتغل بالمتصفح (window.Jojo) وبـ node --test */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Jojo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRAYERS = [
    ['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']
  ];
  var MEALS = [['breakfast', 'الفطور'], ['lunch', 'الغداء'], ['dinner', 'العشاء']];

  /* 'YYYY-MM-DD' → يوم الأسبوع (0 = الأحد) بدون الاعتماد على ساعة الجهاز */
  function weekday(dateISO) {
    return new Date(dateISO + 'T12:00:00Z').getUTCDay();
  }

  function localDate(now, tz) {
    var p = {};
    new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(now).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day;
  }

  function requiredItems(settings, tasks, dateISO) {
    var s = settings || {};
    var wd = weekday(dateISO);
    var items = [];
    PRAYERS.forEach(function (p) { items.push({ key: 'prayer:' + p[0], label: 'صلاة ' + p[1] }); });
    items.push({ key: 'sleep', label: 'نمت بوقتي' });
    items.push({ key: 'wake', label: 'صحيت بوقتي' });
    MEALS.forEach(function (m) { items.push({ key: 'meal:' + m[0], label: m[1] }); });
    if (s.vitamins && s.vitamins.length) items.push({ key: 'vitamins', label: 'الفيتامينات' });
    if (s.waterGoal > 0) items.push({ key: 'water', label: 'الماء' });
    if ((s.gymDays || []).indexOf(wd) !== -1) items.push({ key: 'gym', label: 'النادي' });
    (tasks || []).forEach(function (t) {
      if (!t.days || !t.days.length || t.days.indexOf(wd) !== -1) items.push({ key: 'task:' + t.id, label: t.title });
    });
    return items;
  }

  function isDone(key, value, ctx) {
    if (key === 'water') return typeof value === 'number' && value >= ((ctx && ctx.waterGoal) || 0) && value > 0;
    return value === true;
  }

  function dayScore(items, checks, ctx) {
    if (!items || !items.length) return null;
    var c = checks || {};
    var done = items.filter(function (i) { return isDone(i.key, c[i.key], ctx); }).length;
    return Math.round((done / items.length) * 100);
  }

  /* ---------- السلاسل والإنجازات ---------- */
  function streak(days, key) {
    var n = 0;
    for (var i = (days || []).length - 1; i >= 0; i--) {
      var d = days[i];
      var req = (d.items || []).some(function (it) { return it.key === key; });
      if (!req) continue;
      var ctx = { waterGoal: d.waterGoal };
      if (isDone(key, (d.checks || {})[key], ctx)) n++;
      else break;
    }
    return n;
  }

  function unlocked(days) {
    var out = [];
    var list = days || [];
    var full = list.some(function (d) { return dayScore(d.items, d.checks, { waterGoal: d.waterGoal }) === 100; });
    if (full) out.push('full_day');
    if (streak(list, 'sleep') >= 7) out.push('sleep_7');
    if (streak(list, 'gym') >= 16) out.push('gym_4w');
    if (list.some(function (d) { return d.checks && d.checks.coffee; })) out.push('first_recipe');
    return out;
  }

  /* ---------- أوقات الصلاة (المكتبة تُمرَّر من برّا) ---------- */
  var adhanLib = null;
  function useAdhan(lib) { adhanLib = lib; }

  function prayerTimes(dateISO, lat, lng, tz) {
    if (!adhanLib) throw new Error('Jojo.useAdhan(adhan) must be called before prayerTimes (adhan library not set)');
    var p = dateISO.split('-').map(Number);
    var params = adhanLib.CalculationMethod.UmmAlQura();
    var pt = new adhanLib.PrayerTimes(new adhanLib.Coordinates(lat, lng), new Date(p[0], p[1] - 1, p[2]), params);
    var fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    function f(d) {
      var o = {};
      fmt.formatToParts(d).forEach(function (x) { o[x.type] = x.value; });
      return o.hour + ':' + o.minute;
    }
    return { fajr: f(pt.fajr), dhuhr: f(pt.dhuhr), asr: f(pt.asr), maghrib: f(pt.maghrib), isha: f(pt.isha) };
  }

  return {
    localDate: localDate,
    weekday: weekday,
    requiredItems: requiredItems,
    isDone: isDone,
    dayScore: dayScore,
    streak: streak,
    unlocked: unlocked,
    useAdhan: useAdhan,
    prayerTimes: prayerTimes
  };
});
