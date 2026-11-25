/* الخزنة — منطق تبويب «الفريق» (بدون واجهة). يشتغل بالمتصفح (window.Team) وبـ node --test */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Team = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STALE_MIN = 45; // جولة انقطعت: الموظف يرجع «متوقف» بعد 45 دقيقة بدون تحديث

  function byOrd(a, b) { return (a.ord || 0) - (b.ord || 0); }

  /* الهيكل: الفا ← رؤساء الأقسام ← موظفينهم. أي موظف مديره مو موجود يروح orphans */
  function tree(members) {
    var list = (members || []).slice().sort(byOrd);
    var ids = {};
    list.forEach(function (m) { ids[m.id] = m; });
    var lead = list.filter(function (m) { return m.lead; })[0] || null;
    var heads = list.filter(function (m) {
      return !m.lead && (!m.boss || (lead && m.boss === lead.id));
    });
    var headIds = {};
    heads.forEach(function (h) { headIds[h.id] = true; });
    var depts = heads.map(function (h) {
      return { head: h, kids: list.filter(function (m) { return !m.lead && m.boss === h.id; }) };
    });
    var orphans = list.filter(function (m) {
      return !m.lead && !headIds[m.id] && !(m.boss && headIds[m.boss]);
    });
    return { lead: lead, depts: depts, orphans: orphans };
  }

  /* القسم موقوف لين تاريخ paused_until (مثل الجامعة لين 10 يناير) */
  function isPaused(member, todayISO) {
    return !!(member && member.paused_until && todayISO < member.paused_until);
  }

  function isWorking(status, now) {
    if (!status || !status.working || !status.updated_at) return false;
    var age = ((now || new Date()) - new Date(status.updated_at)) / 60000;
    return age >= 0 && age <= STALE_MIN;
  }

  function sortMail(mail) {
    return (mail || []).slice().sort(function (a, b) {
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  function unread(mail) {
    return (mail || []).filter(function (m) { return !m.read_at; }).length;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* عدد بالعربي: 1 ساعة، ساعتين، 3–10 ساعات، 11+ ساعة */
  function count(n, one, two, few) {
    if (n === 1) return one;
    if (n === 2) return two;
    return n + ' ' + (n <= 10 ? few : one);
  }

  function ago(iso, now) {
    if (!iso) return 'ما اشتغل للحين';
    var min = Math.floor(((now || new Date()) - new Date(iso)) / 60000);
    if (min < 1) return 'الحين';
    if (min < 60) return 'قبل ' + min + ' دقيقة';
    var h = Math.floor(min / 60);
    if (h < 24) return 'قبل ' + count(h, 'ساعة', 'ساعتين', 'ساعات');
    return 'قبل ' + count(Math.floor(h / 24), 'يوم', 'يومين', 'أيام');
  }

  return { STALE_MIN: STALE_MIN, tree: tree, isPaused: isPaused, isWorking: isWorking, sortMail: sortMail, unread: unread, esc: esc, ago: ago };
});
