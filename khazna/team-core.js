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

  /* ---------------- الاجتماعات ---------------- */

  function isHead(m, members) {
    if (!m) return false;
    if (m.lead) return true;
    var lead = (members || []).filter(function (x) { return x.lead; })[0];
    return !m.boss || !!(lead && m.boss === lead.id);
  }

  // الاسم لازم يكون كلمة لحالها (مو جزء من كلمة ثانية)، مع حروف الجر الملتصقة: لمشعل، ومشعل، يا مشعل
  function mentions(text, name) {
    var t = ' ' + String(text || '').replace(/[؟?!.,،:؛"'()\-\n]/g, ' ') + ' ';
    return t.indexOf(' ' + name + ' ') >= 0 || t.indexOf(' و' + name + ' ') >= 0 || t.indexOf(' ل' + name + ' ') >= 0;
  }

  /* مين يرد: اللي انذكر اسمه، وإذا ما انذكر أحد يردون كلهم (الرؤساء قبل) */
  function pickResponders(text, attendees) {
    var list = (attendees || []).slice().sort(byOrd);
    var named = list.filter(function (m) { return mentions(text, m.n); });
    return named.length ? named : list;
  }

  function memberPrompt(m, members, meeting, attendees) {
    var head = isHead(m, members);
    var boss = (members || []).filter(function (x) { return x.id === m.boss; })[0];
    var L = [];
    L.push('أنت «' + m.n + '» — ' + (m.t || '') + ' في فريق صالح (موظفين ذكاء اصطناعي يشتغلون له).');
    if (m.d) L.push('دورك: ' + m.d);
    if (m.tasks && m.tasks.length) L.push('مهامك:\n- ' + m.tasks.join('\n- '));
    if (m.ref) L.push('مرجعك: ' + m.ref);
    if (m.rule) L.push('قاعدتك الذهبية: ' + m.rule);
    if (boss) L.push('مديرك المباشر: ' + boss.n);
    L.push('أنت الحين في اجتماع مع صالح. الموضوع: ' + (meeting.topic || '') + (meeting.details ? '\nتفاصيل: ' + meeting.details : ''));
    L.push('الحضور: ' + (attendees || []).map(function (a) { return a.n; }).join('، '));
    L.push(head
      ? 'أنت من الإدارة: تقدر تفصّل إذا احتاج، بس خلك مركّز وعملي.'
      : 'أنت موظف: عرّف بنفسك بسطر واحد أول مرة تتكلم، وبعدها أعط الزبدة فقط بسطرين أو ثلاثة. بدون كلام طويل.');
    L.push('تكلم بلهجة سعودية بسيطة ومن زاوية تخصصك بس. لا تكرر كلام غيرك، ولا تخترع أرقام أو معايير ما عندك مرجعها — إذا ما تعرف قل.');
    L.push('لا تكتب اسمك قبل الرد. لا تستخدم عناوين أو جداول.');
    return L.join('\n\n');
  }

  function transcript(msgs) {
    return (msgs || []).map(function (x) { return (x.member_id ? x.from_name : 'صالح') + ': ' + x.body; }).join('\n');
  }

  /* محضر الفا: JSON فيه summary و tasks[{who, task, due}] — يتحول لـ member_id ويحذف اللي مو من الحضور */
  function parseMinutes(raw, attendees) {
    var s = String(raw || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    var j; try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
    if (!j || typeof j.summary !== 'string') return null;
    var tasks = (Array.isArray(j.tasks) ? j.tasks : []).map(function (t) {
      var who = String((t && (t.who || t.member_id)) || '').trim();
      var m = (attendees || []).filter(function (x) { return x.id === who || x.n === who; })[0];
      var task = String((t && t.task) || '').trim();
      return m && task ? { member_id: m.id, task: task, due: String((t && t.due) || '').trim() } : null;
    }).filter(Boolean);
    return { summary: j.summary.trim(), tasks: tasks };
  }

  function taskProgress(tasks) {
    var list = tasks || [];
    return { done: list.filter(function (t) { return t.status === 'done'; }).length, total: list.length };
  }

  return { isHead: isHead, pickResponders: pickResponders, memberPrompt: memberPrompt, transcript: transcript, parseMinutes: parseMinutes, taskProgress: taskProgress,
    STALE_MIN: STALE_MIN, tree: tree, isPaused: isPaused, isWorking: isWorking, sortMail: sortMail, unread: unread, esc: esc, ago: ago };
});
