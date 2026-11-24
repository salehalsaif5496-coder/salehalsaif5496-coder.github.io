/* ريز — طبقة الحركة (تشتغل فوق التطبيق بدون ما تلمس كوده)
   - البطاقات تطلع بالتتابع لما تفتح أي شاشة
   - الأرقام الكبيرة تعد لقيمتها
   - ضغطة ناعمة على الأزرار
   - صور أدوات التقطير بدون حركة
   - تنطفي تلقائياً مع "تقليل الحركة"، أو يدوياً: localStorage rays-motion = off */
(function () {
  try {
    if (localStorage.getItem('rays-motion') === 'off') return;
  } catch (e) {}
  if (!window.matchMedia || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!Element.prototype.animate) return;

  var root = document.getElementById('root');
  if (!root) return;
  var EASE = 'cubic-bezier(.2,.8,.2,1)';
  var seen = new WeakMap();        // عنصر ← آخر وقت تحرك
  var MAX = 12;                    // أقصى عدد بطاقات تتحرك مرة وحدة

  function locked() {
    var l = document.getElementById('lock'), p = document.getElementById('langpick');
    return (l && l.style.display === 'flex') || (p && p.style.display === 'flex');
  }
  function alpha(c) {
    var m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return 0;
    var p = m[1].split(',');
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }
  function isBrewer(el) {
    var imgs = el.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) if (/\/brewers\//.test(imgs[i].src)) return true;
    return /\/brewers\//.test(el.style.backgroundImage || '');
  }
  function isCard(el) {
    if (el.nodeType !== 1 || !/^(DIV|A|BUTTON)$/.test(el.tagName)) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 100 || r.height < 44 || r.height > innerHeight * 0.85) return false;
    if (r.bottom < 0 || r.top > innerHeight) return false;
    var cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') return false;
    if ((parseFloat(cs.borderTopLeftRadius) || 0) < 10) return false;
    // لازم تكون ظاهرة فعلاً، مو شاشة مخفية ورا الشاشة الحالية
    var cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + Math.min(r.height / 2, 30), 1), innerHeight - 1);
    var hit = document.elementFromPoint(cx, cy);
    if (!hit || !(el === hit || el.contains(hit))) return false;
    if (alpha(cs.backgroundColor) < 0.04 && !(parseFloat(cs.borderTopWidth) > 0)) return false;
    return !isBrewer(el);
  }
  function collect(scope, onlyNew) {
    var out = [], all = scope.querySelectorAll ? scope.querySelectorAll('div,a,button') : [];
    var list = scope.nodeType === 1 ? [scope].concat([].slice.call(all)) : [].slice.call(all);
    var now = Date.now();
    for (var i = 0; i < list.length && out.length < 40; i++) {
      var el = list[i];
      if (onlyNew && seen.has(el)) continue;
      if (!onlyNew && now - (seen.get(el) || 0) < 1200) continue;
      if (!isCard(el)) continue;
      var nested = false;
      for (var j = 0; j < out.length; j++) if (out[j].contains(el)) { nested = true; break; }
      if (!nested) out.push(el);
    }
    out.sort(function (a, b) {
      var A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
      return A.top - B.top || B.left - A.left;
    });
    return out.slice(0, MAX);
  }
  function reveal(cards) {
    var now = Date.now();
    cards.forEach(function (el, i) {
      seen.set(el, now);
      el.animate(
        [{ opacity: 0, transform: 'translateY(14px) scale(.985)' }, { opacity: 1, transform: 'none' }],
        { duration: 420, delay: Math.min(i * 45, 360), easing: EASE, fill: 'backwards' }
      );
      countUp(el);
    });
  }

  // الأرقام الكبيرة تعد من الصفر لقيمتها
  var NUM = /^(\d{1,3}(?:[,٬]\d{3})*|\d+)(?:([.٫])(\d{1,2}))?(\s?%)?$/;
  function countUp(card) {
    var w = document.createTreeWalker(card, NodeFilter.SHOW_TEXT), n, jobs = [];
    while ((n = w.nextNode()) && jobs.length < 3) {
      var t = n.nodeValue.trim(), m = t.match(NUM);
      if (!m || !n.parentElement) continue;
      if (parseFloat(getComputedStyle(n.parentElement).fontSize) < 20) continue;
      var target = parseFloat(m[1].replace(/[,٬]/g, '') + (m[3] ? '.' + m[3] : ''));
      if (!(target > 0) || target > 1e7) continue;
      jobs.push({ node: n, text: n.nodeValue, target: target, dec: m[3] ? m[3].length : 0, comma: /[,٬]/.test(m[1]), pct: m[4] || '' });
    }
    jobs.forEach(function (j) {
      var start = performance.now(), dur = 700, last = j.text;
      function fmt(v) {
        var s = j.dec ? v.toFixed(j.dec) : String(Math.round(v));
        if (j.comma) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return j.text.replace(j.text.trim(), s + j.pct);
      }
      function step(now) {
        if (j.node.nodeValue !== last) return;        // التطبيق غيّر الرقم: نوقف ونخليه
        var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
        last = p < 1 ? fmt(j.target * e) : j.text;
        j.node.nodeValue = last;
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  // بطاقات جديدة تنضاف للشاشة
  new MutationObserver(function (muts) {
    if (locked()) return;
    var added = [];
    for (var i = 0; i < muts.length; i++)
      for (var k = 0; k < muts[i].addedNodes.length; k++) {
        var a = muts[i].addedNodes[k];
        if (a.nodeType === 1) added.push(a);
      }
    if (!added.length) return;
    var cards = [];
    for (var x = 0; x < added.length && cards.length < MAX; x++) cards = cards.concat(collect(added[x], true));
    if (cards.length) reveal(cards.slice(0, MAX));
  }).observe(root, { childList: true, subtree: true });

  // تغيير الشاشة (التبويبات والتنقل)
  var path = location.pathname;
  function onRoute() {
    if (location.pathname === path) return;
    path = location.pathname;
    [60, 220].forEach(function (d) {
      setTimeout(function () { if (!locked()) reveal(collect(root, false)); }, d);
    });
  }
  ['pushState', 'replaceState'].forEach(function (f) {
    var o = history[f];
    history[f] = function () { var r = o.apply(this, arguments); setTimeout(onRoute, 0); return r; };
  });
  addEventListener('popstate', function () { setTimeout(onRoute, 0); });

  // ضغطة ناعمة على أي زر
  document.addEventListener('pointerdown', function (e) {
    var el = e.target.closest && e.target.closest('[role="button"],[role="tab"],a,button');
    if (!el || !root.contains(el) || isBrewer(el)) return;
    var r = el.getBoundingClientRect();
    if (r.width > innerWidth * 0.95 && r.height > 140) return;   // بطاقات كبيرة: بدون ضغطة
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: EASE });
  }, { passive: true });
})();
