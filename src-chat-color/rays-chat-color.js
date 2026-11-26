/* ريز — لون محادثة الشكوى (طبقة فوق التطبيق بدون ما تلمس كوده)
   - البرتقالي داخل محادثة الشكوى (/complaint/<id>) يصير وايت شوكلت حسب الهوية: white-chocolate #EFE3C8
     (المرجع: rays-design-system/tokens.json)
   - الفقاعات والأزرار والحدود والأيقونات؛ والنص فوق الوايت شوكلت يصير كحلي عشان يبان
   - مؤقت: يدخل كود التطبيق نفسه لما يرجع الكود */
(function () {
  var WC = '#EFE3C8', WC_RGB = [239, 227, 200], NAVY = '#1A0089';
  var root = document.getElementById('root');
  if (!root) return;

  function inChat() { return /\/complaint\/[^\/?#]+/.test(location.pathname); }
  function rgb(c) {
    var m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(',').map(parseFloat);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  // برتقالي ريز (#F15227 في التطبيق، #EE6A26 في الهوية) ودرجاته القريبة
  function isOrange(c) {
    var x = rgb(c);
    return !!x && x.a > 0.05 && x.r >= 200 && x.g >= 50 && x.g <= 140 && x.b <= 90 && x.r - x.g > 100;
  }
  function isLight(c) {
    var x = rgb(c);
    return !!x && x.a > 0.05 && (0.299 * x.r + 0.587 * x.g + 0.114 * x.b) > 190;
  }
  function wc(alpha) {
    return alpha >= 0.99 ? WC : 'rgba(' + WC_RGB.join(',') + ',' + alpha + ')';
  }
  function set(el, prop, val) {
    if (el.style.getPropertyValue(prop) !== val) el.style.setProperty(prop, val, 'important');
  }
  function bgOf(el) {
    for (var n = el; n && n !== document.body; n = n.parentElement) {
      var b = rgb(getComputedStyle(n).backgroundColor);
      if (b && b.a > 0.5) return b;
    }
    return null;
  }
  function lightBg(el) {
    var b = bgOf(el);
    return !!b && (0.299 * b.r + 0.587 * b.g + 0.114 * b.b) > 190;
  }

  function paint() {
    if (!inChat()) return;
    var els = root.querySelectorAll('*');
    var bubbles = [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i], cs = getComputedStyle(el);
      // الخلفية
      if (isOrange(cs.backgroundColor)) {
        set(el, 'background-color', wc(rgb(cs.backgroundColor).a));
        bubbles.push(el);
      }
      // الحدود
      ['top', 'right', 'bottom', 'left'].forEach(function (s) {
        var bc = cs.getPropertyValue('border-' + s + '-color');
        if (parseFloat(cs.getPropertyValue('border-' + s + '-width')) > 0 && isOrange(bc))
          set(el, 'border-' + s + '-color', wc(rgb(bc).a));
      });
      // أيقونات SVG
      if (el instanceof SVGElement) {
        if (isOrange(cs.fill)) set(el, 'fill', lightBg(el) ? NAVY : WC);
        if (isOrange(cs.stroke)) set(el, 'stroke', lightBg(el) ? NAVY : WC);
      }
    }
    // النص البرتقالي: وايت شوكلت على الكحلي، كحلي لو صار فوق خلفية فاتحة
    for (var j = 0; j < els.length; j++) {
      var t = els[j], tc = getComputedStyle(t).color;
      if (isOrange(tc) && t.textContent.trim()) set(t, 'color', lightBg(t) ? NAVY : WC);
    }
    // النص الأبيض/الفاتح داخل الفقاعات اللي صارت وايت شوكلت يصير كحلي
    bubbles.forEach(function (b) {
      var kids = [b].concat([].slice.call(b.querySelectorAll('*')));
      kids.forEach(function (k) {
        var cs = getComputedStyle(k);
        if (isLight(cs.color) && k.textContent.trim()) set(k, 'color', NAVY);
        if (k instanceof SVGElement) {
          if (isLight(cs.fill)) set(k, 'fill', NAVY);
          if (isLight(cs.stroke)) set(k, 'stroke', NAVY);
        }
      });
    });
  }

  var queued = false;
  function schedule() {
    if (queued || !inChat()) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; paint(); });
  }
  new MutationObserver(schedule).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  setInterval(schedule, 1000);
  addEventListener('popstate', schedule);
})();
