/* جوجو — منطق التطبيق (بدون واجهة). يشتغل بالمتصفح (window.Jojo) وبـ node --test */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Jojo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* نسخة المنطق: غيّرها مع أي تعديل هنا. صفحة صالح تاخذ رقم نسختها منها (Jojo.CORE_VERSION)،
     وتطبيق جوجو يجدد core.js مع JOJO_VERSION. */
  var CORE_VERSION = '2026-11-25.2';

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
      else if (i === days.length - 1) continue; // آخر يوم (اليوم) لسه ما خلص — ما يكسر السلسلة
      else break;
    }
    return n;
  }

  /* كل إنجاز ممكن يطلع من unlocked() — صفحة صالح تكتب رسالة لكل واحد منها */
  var ACHIEVEMENTS = ['full_day', 'sleep_7', 'gym_4w', 'first_recipe'];

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

  /* ---------- لصالح: النسبة اليومية ----------
     فئة الحبة حسب النسبة: null = ما فيه نسبة، low < 50، mid 50–79، high ≥ 80 */
  function pctBand(pct) {
    if (typeof pct !== 'number' || isNaN(pct)) return 'none';
    if (pct >= 80) return 'high';
    if (pct >= 50) return 'mid';
    return 'low';
  }

  /* أيام ورا بعض نسبتها ≥ min (افتراضي ٨٠)، تنتهي باليوم.
     rows: [{date, pct}] من jojo_daily. اليوم لسه ما خلص: لو ما وصل ما يكسر السلسلة.
     يوم بدون صف (ما فتحت التطبيق) يكسرها؛ يوم نسبته null (ما فيه بنود) يتخطّى. */
  function dailyStreak(rows, todayISO, min) {
    min = min == null ? 80 : min;
    var by = {};
    (rows || []).forEach(function (r) { if (r && r.date) by[r.date] = r; });
    var n = 0, d = todayISO;
    for (var i = 0; i < 400; i++, d = prevDate(d)) {
      var r = by[d];
      var has = !!r && typeof r.pct === 'number';
      if (r && r.pct == null) continue;
      if (has && r.pct >= min) { n++; continue; }
      if (i === 0) continue;
      break;
    }
    return n;
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

  /* ---------- القهوة ---------- */
  var GENERIC_DRIP = { dose: 15, water: 240, tempC: 93, targetSec: 180, approved: false };

  function grindAdvice(actualSec, targetSec) {
    if (actualSec < targetSec - 10) return 'finer';
    if (actualSec > targetSec + 10) return 'coarser';
    return 'ok';
  }

  function tasteProfile(ratings) {
    var r = ratings || [];
    var likedR = r.filter(function (x) { return x.liked; });
    var dislikedR = r.filter(function (x) { return !x.liked; });
    function pick(list) {
      var counts = {}, order = [];
      list.forEach(function (x) {
        var seen = {};
        (x.notes || []).forEach(function (n) {
          if (seen[n]) return;
          seen[n] = true;
          if (!counts[n]) { counts[n] = 0; order.push(n); }
          counts[n]++;
        });
      });
      return order.filter(function (n) { return counts[n] >= 2 && counts[n] / list.length >= 0.6; });
    }
    return { likes: pick(likedR), dislikes: pick(dislikedR), liked: likedR.length, total: r.length };
  }

  function hashStr(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  }

  /* الاختيار الخام (بدون قاعدة تجنب أمس) */
  function recipePick(recipes, ratings, dateISO) {
    if (!recipes || !recipes.length) return null;
    var rs = ratings || [];
    var prof = null;
    var weights = recipes.map(function (rc) {
      /* وصفات المكتبة (لها tastes وما لها beanId): ضعف الفرصة لو طعمها من اللي تحبه وما فيها شي ما تحبه */
      if (rc.tastes && rc.beanId === undefined) {
        prof = prof || tasteProfile(rs);
        var t = rc.tastes || [];
        var hit = t.some(function (x) { return prof.likes.indexOf(x) !== -1; });
        var bad = t.some(function (x) { return prof.dislikes.indexOf(x) !== -1; });
        return hit && !bad ? 2 : 1;
      }
      var of = rs.filter(function (x) { return x.beanId === rc.beanId; });
      if (!of.length) return 1;
      var likes = of.filter(function (x) { return x.liked; }).length;
      return likes / of.length >= 0.5 ? 2 : 1;
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var t = hashStr(dateISO) % total;
    for (var i = 0; i < recipes.length; i++) {
      if (t < weights[i]) return recipes[i];
      t -= weights[i];
    }
    return recipes[recipes.length - 1];
  }

  function prevDate(dateISO) {
    var p = dateISO.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] - 1)).toISOString().slice(0, 10);
  }

  function recipeOfDay(recipes, ratings, dateISO) {
    if (!recipes || !recipes.length) return null;
    var pick = recipePick(recipes, ratings, dateISO);
    if (recipes.length === 1) return pick;
    var yest = recipePick(recipes, ratings, prevDate(dateISO));
    if (pick !== yest) return pick;
    var rest = recipes.filter(function (x) { return x !== yest; });
    return recipePick(rest, ratings, dateISO);
  }

  /* ---- وصفات جوجو الخاصة (الفورم → صف jojo_recipes) ---- */
  var RECIPE_TASTES = ['حلو', 'حامض', 'مر', 'خفيف', 'ثقيل'];
  /* أرقام عربية/فارسية → لاتينية، وفاصلة عربية → نقطة */
  function normDigits(s) {
    return String(s == null ? '' : s).replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 1632); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 1776); })
      .replace(/[٫,،]/g, '.').replace(/[：]/g, ':').trim();
  }
  /* 'm:ss' → ثواني (null لو مو صيغة صحيحة) */
  function parseMMSS(str) {
    var m = /^(\d{1,3}):([0-5]\d)$/.exec(normDigits(str).replace(/\./g, ':'));
    return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function fmtMMSS(sec) { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
  function num(v) {
    var t = normDigits(v);
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    return +t;
  }
  function arD(x) { return String(x).replace(/\d/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'[d]; }); }
  /* form: { name, style, dose, water, iceCubes, temp, target, grind, pours:[{at,to,note}], tastes, note }
     يرجع { ok, errors, row } — row = الأعمدة اللي تنكتب بـ jojo_recipes (بدون id و owner) */
  function validateRecipe(f) {
    var e = {}, row = null;
    var name = String(f.name || '').trim();
    if (!name) e.name = 'اكتبي اسم لوصفتك 🤍';
    else if (name.length > 40) e.name = 'الاسم طويل شوي، اختصريه (٤٠ حرف)';
    var style = f.style === 'iced' ? 'iced' : 'hot';
    var dose = num(f.dose), water = num(f.water);
    if (dose === null || dose < 5 || dose > 60) e.dose = 'اكتبي كمية القهوة بالجرام (من ٥ لين ٦٠)';
    if (water === null || water < 50 || water > 1000) e.water = 'اكتبي كمية الموية (من ٥٠ لين ١٠٠٠)';
    var cubes = style === 'iced' ? String(f.iceCubes || '').trim() : '';
    if (cubes.length > 60) e.iceCubes = 'الثلج طويل شوي، اختصريه (٦٠ حرف)';
    var temp = num(f.temp);
    if (temp === null || temp < 60 || temp > 100) e.temp = 'الحرارة من ٦٠ لين ١٠٠ درجة';
    var target = parseMMSS(f.target);
    if (target === null) e.target = 'اكتبي الوقت مثل ٣:٠٠';
    else if (target < 30 || target > 900) e.target = 'الوقت المستهدف من ٠:٣٠ لين ١٥:٠٠';
    var grind = Math.round(num(f.grind) || 0);
    if (!(grind >= 1 && grind <= 40)) e.grind = 'رقم الطحنة من ١ لين ٤٠';
    var pours = f.pours || [], steps = [];
    if (!pours.length) e.pours = 'أضيفي صبّة وحدة على الأقل';
    var prevAt = -1, prevTo = 0;
    pours.forEach(function (p, i) {
      var at = parseMMSS(p.at), to = num(p.to), note = String(p.note || '').trim();
      if (at === null) e['p' + i + '.at'] = 'اكتبي الوقت مثل ٠:٤٥';
      else if (at <= prevAt) e['p' + i + '.at'] = 'وقت الصبّة لازم يكون بعد اللي قبلها';
      else if (target !== null && at >= target) e['p' + i + '.at'] = 'الصبّة لازم تبدأ قبل الوقت المستهدف';
      if (to === null || to <= 0) e['p' + i + '.to'] = 'اكتبي الكمية بالجرام';
      else if (to <= prevTo) e['p' + i + '.to'] = 'الكمية لازم تزيد عن الصبّة اللي قبلها (' + arD(prevTo) + ' جم)';
      else if (water !== null && to > water) e['p' + i + '.to'] = 'الكمية أكبر من كمية الموية (' + arD(water) + ' جم)';
      else if (i === pours.length - 1 && water !== null && to !== water && water >= 50 && water <= 1000) e['p' + i + '.to'] = 'آخر صبّة لازم توصل لكمية الموية (' + arD(water) + ' جم)';
      if (note.length > 80) e['p' + i + '.note'] = 'الملاحظة طويلة شوي (٨٠ حرف)';
      if (at !== null) prevAt = at;
      if (to !== null) prevTo = to;
      steps.push({ at_sec: at, pour_to_g: to, note: note });
    });
    var note = String(f.note || '').trim();
    if (note.length > 200) e.note = 'الملاحظة طويلة شوي (٢٠٠ حرف)';
    var tastes = (f.tastes || []).filter(function (t, i, a) { return RECIPE_TASTES.indexOf(t) !== -1 && a.indexOf(t) === i; });
    var ok = Object.keys(e).length === 0;
    if (ok) {
      row = { name: name, style: style, roast: [], dose: dose, water: water, ice: 0, ice_cubes: cubes || null, temp_c: temp,
        target_sec: target, grind_encore: grind, steps: steps, tastes: tastes, note: note || null };
    }
    return { ok: ok, errors: e, row: row };
  }

  return {
    CORE_VERSION: CORE_VERSION,
    localDate: localDate,
    weekday: weekday,
    requiredItems: requiredItems,
    isDone: isDone,
    dayScore: dayScore,
    streak: streak,
    unlocked: unlocked,
    ACHIEVEMENTS: ACHIEVEMENTS,
    pctBand: pctBand,
    dailyStreak: dailyStreak,
    useAdhan: useAdhan,
    prayerTimes: prayerTimes,
    GENERIC_DRIP: GENERIC_DRIP,
    grindAdvice: grindAdvice,
    tasteProfile: tasteProfile,
    recipeOfDay: recipeOfDay,
    validateRecipe: validateRecipe,
    parseMMSS: parseMMSS,
    fmtMMSS: fmtMMSS,
    RECIPE_TASTES: RECIPE_TASTES,
    _recipePick: recipePick
  };
});
