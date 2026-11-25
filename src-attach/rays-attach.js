/* ريز — مرفقات محادثة الشكوى (طبقة فوق التطبيق بدون ما تلمس كوده)
   - زر 📎 جنب خانة الكتابة في /complaint/<id>: صور أو PDF لين 20 ميقا
   - الملف ينرفع لمخزن complaint-attachments، وتنضاف رسالة "📎 اسم الملف" مربوطة فيه
   - رسائل المرفقات تصير قابلة للضغط، والصور تطلع مصغرة تحت الرسالة
   - مؤقت: يدخل كود التطبيق نفسه لما يرجع الكود */
(function () {
  var U = 'https://tjfgoymcjwatlcwovlhf.supabase.co';
  var K = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqZmdveW1jandhdGxjd292bGhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MTgwNjksImV4cCI6MjEwOTk5NDA2OX0.89cqRUVgTJ2NB4frhmYIHiGZFI-Ypatp7jIpx4wmzJQ';
  var B = 'complaint-attachments', MAX = 20 * 1024 * 1024;
  var OK_TYPES = /^(image\/(jpeg|png|heic|heif|webp)|application\/pdf)$/;
  var root = document.getElementById('root');
  if (!root) return;
  var EN = function () { return window.__RAYS_LANG === 'en'; };
  var T = function (ar, en) { return EN() ? en : ar; };

  function tok() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (/^sb-.*-auth-token$/.test(k)) {
          var v = localStorage.getItem(k);
          if (v.indexOf('base64-') === 0) v = atob(v.slice(7));
          var s = JSON.parse(v); s = s.currentSession || s;
          if (s.access_token && (!s.expires_at || s.expires_at > Date.now() / 1000)) return s.access_token;
        }
      }
    } catch (e) {}
    return null;
  }
  function H(extra) {
    var h = { apikey: K, Authorization: 'Bearer ' + tok() };
    for (var x in extra || {}) h[x] = extra[x];
    return h;
  }
  function cid() {
    var m = location.pathname.match(/\/complaint\/([^\/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function locked() {
    var l = document.getElementById('lock'), p = document.getElementById('langpick');
    return (l && l.style.display === 'flex') || (p && p.style.display === 'flex');
  }

  /* ---------- الواجهة ---------- */
  var css = document.createElement('style');
  css.textContent =
    '#rays-clip{position:fixed;z-index:9998;width:40px;height:40px;border-radius:20px;border:0;display:none;' +
    'align-items:center;justify-content:center;font-size:19px;background:#16295E;color:#EFE7D3;' +
    'box-shadow:0 4px 14px rgba(0,0,0,.25);-webkit-tap-highlight-color:transparent;cursor:pointer}' +
    '#rays-clip:active{transform:scale(.94)}' +
    '#rays-clip.busy{opacity:.6;pointer-events:none}' +
    '#rays-toast{position:fixed;left:50%;bottom:110px;transform:translateX(-50%);z-index:9999;background:#16295E;' +
    'color:#EFE7D3;padding:10px 16px;border-radius:14px;font:600 14px system-ui,-apple-system,sans-serif;direction:rtl;' +
    'box-shadow:0 6px 20px rgba(0,0,0,.25);display:none;max-width:86vw;text-align:center}' +
    '.rays-att{cursor:pointer;text-decoration:underline;text-underline-offset:3px}' +
    '.rays-thumb{display:block;max-width:220px;max-height:220px;border-radius:12px;margin-top:6px;object-fit:cover;cursor:pointer}';
  document.head.appendChild(css);

  var btn = document.createElement('button');
  btn.id = 'rays-clip'; btn.type = 'button'; btn.textContent = '📎';
  btn.setAttribute('aria-label', 'إرفاق ملف');
  document.body.appendChild(btn);

  var pick = document.createElement('input');
  pick.type = 'file'; pick.multiple = true;
  pick.accept = 'image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf';
  pick.style.display = 'none';
  document.body.appendChild(pick);

  var toast = document.createElement('div');
  toast.id = 'rays-toast'; document.body.appendChild(toast);
  var tt;
  function say(msg, ms) {
    toast.textContent = msg; toast.style.display = 'block';
    clearTimeout(tt); if (ms) tt = setTimeout(function () { toast.style.display = 'none'; }, ms);
  }

  function chatInput() {
    var els = root.querySelectorAll('textarea, input[type="text"], input:not([type])');
    var best = null, bestTop = -1;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width < 80 || r.height < 18 || r.bottom <= 0 || r.top >= innerHeight) continue;
      if (r.top > bestTop) { best = els[i]; bestTop = r.top; }
    }
    return best;
  }
  function place() {
    var on = !!cid() && !locked() && !!tok();
    var inp = on && chatInput();
    if (!inp) { btn.style.display = 'none'; return; }
    var r = inp.getBoundingClientRect();
    var x = r.left > 50 ? r.left - 46 : r.left + 6;
    btn.style.left = Math.max(6, x) + 'px';
    btn.style.top = (r.top + r.height / 2 - 20) + 'px';
    btn.style.display = 'flex';
  }

  /* ---------- الرفع ---------- */
  function shrink(f) {
    // الصور الكبيرة تتصغر لـ 2000 بكسل JPEG عشان ترفع أسرع (الـ PDF والصغيرة تروح مثل ما هي)
    return new Promise(function (res) {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size < 2.5 * 1024 * 1024) return res(f);
      var img = new Image(), url = URL.createObjectURL(f);
      img.onload = function () {
        var s = Math.min(1, 2000 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (!b) return res(f);
          res(new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); res(f); };
      img.src = url;
    });
  }
  function upload(c, f) {
    var ext = (f.name.match(/\.(\w+)$/) || [, f.type === 'application/pdf' ? 'pdf' : 'jpg'])[1].toLowerCase();
    var path = c + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    return fetch(U + '/storage/v1/object/' + B + '/' + path, {
      method: 'POST', headers: H({ 'Content-Type': f.type || 'application/octet-stream', 'x-upsert': 'false' }), body: f
    }).then(function (r) {
      if (!r.ok) throw new Error('up ' + r.status);
      return fetch(U + '/rest/v1/complaint_messages', {
        method: 'POST', headers: H({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ complaint_id: c, body: '📎 ' + f.name, attachment_path: path,
          attachment_name: f.name, attachment_type: f.type, attachment_size: f.size })
      });
    }).then(function (r) {
      if (!r.ok) {
        // الرسالة ما انحفظت: نحذف الملف عشان ما يبقى يتيم
        fetch(U + '/storage/v1/object/' + B + '/' + path, { method: 'DELETE', headers: H() }).catch(function () {});
        throw new Error('msg ' + r.status);
      }
      return f.name;
    });
  }

  btn.addEventListener('click', function () { pick.value = ''; pick.click(); });
  pick.addEventListener('change', function () {
    var c = cid(), files = Array.prototype.slice.call(pick.files || []);
    if (!c || !files.length) return;
    var bad = files.filter(function (f) { return !OK_TYPES.test(f.type); });
    if (bad.length) return say(T('المسموح صور أو PDF بس', 'Only images or PDF'), 3500);
    btn.classList.add('busy');
    var done = 0, names = [];
    say(T('جاري الرفع…', 'Uploading…'));
    files.reduce(function (p, f) {
      return p.then(function () { return shrink(f); }).then(function (g) {
        if (g.size > MAX) throw new Error('big');
        return upload(c, g);
      }).then(function (n) { names.push(n); done++; say(T('جاري الرفع… ', 'Uploading… ') + done + '/' + files.length); });
    }, Promise.resolve()).then(function () {
      say(T('تم الإرفاق ✓', 'Attached ✓'), 2500);
      afterSend(names);
    }).catch(function (e) {
      var m = String(e && e.message || '');
      say(m === 'big' ? T('الملف أكبر من 20 ميقا', 'File is over 20 MB')
        : /(up|msg) 40[13]/.test(m) ? T('الإرفاق متاح بس والشكوى قيد المعالجة', 'Attachments only while the complaint is in progress')
        : T('ما قدرت أرفع الملف، جرّب مرة ثانية', 'Upload failed, try again'), 4000);
      if (done) afterSend(names);
    }).then(function () { btn.classList.remove('busy'); });
  });
  function afterSend(names) {
    lastFetch = 0;
    // لو التطبيق ما حدّث المحادثة خلال 4 ثواني، نعيد تحميل الصفحة عشان تطلع الرسالة
    setTimeout(function () {
      var txt = root.innerText || '';
      var shown = names.every(function (n) { return txt.indexOf('📎 ' + n) >= 0; });
      if (!shown) location.reload();
    }, 4000);
  }

  /* ---------- عرض المرفقات داخل المحادثة ---------- */
  var atts = [], lastFetch = 0, lastCid = null, signed = {};
  function refresh() {
    var c = cid();
    if (!c || !tok() || locked()) return;
    if (c === lastCid && Date.now() - lastFetch < 8000) return decorate();
    lastCid = c; lastFetch = Date.now();
    fetch(U + '/rest/v1/complaint_messages?complaint_id=eq.' + encodeURIComponent(c) +
      '&attachment_path=not.is.null&select=id,body,attachment_path,attachment_name,attachment_type&order=created_at',
      { headers: H() })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { atts = rows || []; return sign(); })
      .then(decorate).catch(function () {});
  }
  function sign() {
    var need = atts.filter(function (a) { var s = signed[a.attachment_path]; return !s || s.at < Date.now() - 50 * 60 * 1000; });
    if (!need.length) return Promise.resolve();
    return fetch(U + '/storage/v1/object/sign/' + B, {
      method: 'POST', headers: H({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ expiresIn: 3600, paths: need.map(function (a) { return a.attachment_path; }) })
    }).then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      (list || []).forEach(function (s) {
        if (s.signedURL && s.path) signed[s.path] = { url: U + '/storage/v1' + s.signedURL, at: Date.now() };
      });
    });
  }
  function decorate() {
    if (!atts.length) return;
    var used = {};
    var nodes = root.querySelectorAll('div, span');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.children.length) continue;
      var t = (el.textContent || '').trim();
      if (t.indexOf('📎 ') !== 0) continue;
      for (var j = 0; j < atts.length; j++) {
        var a = atts[j];
        if (used[a.id] || a.body !== t) continue;
        used[a.id] = 1;
        var s = signed[a.attachment_path];
        if (!s) break;
        el.dataset.raysUrl = s.url;
        if (!el.classList.contains('rays-att')) {
          el.classList.add('rays-att');
          el.addEventListener('click', openIt, true);
        }
        if (/^image\//.test(a.attachment_type || '') && !/heic|heif/.test(a.attachment_type)) {
          var nx = el.nextSibling;
          if (!(nx && nx.classList && nx.classList.contains('rays-thumb'))) {
            var im = document.createElement('img');
            im.className = 'rays-thumb'; im.loading = 'lazy'; im.alt = a.attachment_name || '';
            im.addEventListener('click', openIt, true);
            el.parentNode.insertBefore(im, el.nextSibling);
            nx = im;
          }
          if (nx.src !== s.url) { nx.src = s.url; nx.dataset.raysUrl = s.url; }
        }
        break;
      }
    }
  }
  function openIt(e) {
    var u = e.currentTarget.dataset.raysUrl;
    if (!u) return;
    e.preventDefault(); e.stopPropagation();
    window.open(u, '_blank');
  }

  setInterval(place, 400);
  setInterval(refresh, 1500);
  addEventListener('resize', place);
  addEventListener('popstate', function () { lastFetch = 0; });
})();
