/* الكرة داخل الخزنة */
(() => {
/* ================= context ================= */
const SB_URL = "https://lpsifrdiangpfcwhjeim.supabase.co";
const SB_KEY = "sb_publishable_VzyeRgisydU3JcgkHHVBeg_GDdiinHn";
const SB_H = {"apikey":SB_KEY, "Authorization":"Bearer "+SB_KEY, "content-type":"application/json"};
const SESSION = new Date().toISOString().slice(0,16) + "-" + Math.random().toString(36).slice(2,7);
let brief = "";
fetch(SB_URL + "/rest/v1/orb_brief?id=eq.main&select=content", {headers:SB_H})
  .then(r => r.ok ? r.json() : []).then(j => { if (j[0]) brief = j[0].content; }).catch(()=>{});
function logTurn(role, content){
  fetch(SB_URL + "/rest/v1/orb_messages", {method:"POST", headers:{...SB_H, "Prefer":"return=minimal"},
    body: JSON.stringify({session_id:SESSION, role, content:content.slice(0,8000)})}).catch(()=>{});
}
const SYSTEM_BASE = `أنت "الكرة"، المساحة الصوتية لصالح، مرتبطة بـ Claude اللي يشتغل معه على مشاريعه.
صالح مدير الجودة في محمصة ريز (Rays Coffee Roastery) بالرياض ويشتغل في التسويق البصري.
كل سوالفكم تنحفظ، وClaude يقرأها بعدين في المحادثة الرئيسية ويكمل الشغل عليها. فدورك:
- لما يوصف صالح مشروع أو فكرة: افهمها، اسأله سؤال واحد قصير يوضح الناقص، ولخّص له اللي فهمته عشان ينحفظ واضح.
- لما يسأل عن قرار شغل: فكّر داخلياً بآراء مجلس من أربعة (مستشار استراتيجي، خبير تسويق، صوت العميل، مشكّك) وقل الخلاصة كرأي واحد.
- لما تكون سوالف عادية: سولف بشكل طبيعي.
ردّك ينقرأ بصوت عالي. أهم قاعدة: تكلم بالعامية النجدية/الرياضية مثل صالح بالضبط، ممنوع الفصحى نهائياً.
استخدم مثل: وش، ليش، زين، أبي، تبي، كذا، الحين، يعني، والله، عاد، شوي، مرة، يا رجال، تمام، سم، أبشر، ما عليه، وش رايك، خلنا، بعدين.
وكمان: وشلونك، إيه، لا والله، ترى، مره حلو، حيل، هالشي، ذا، ذي، يوم (بمعنى لما)، عشان، بعد (بمعنى كمان)، وش السالفة، صدق؟، يا شيخ، تكفى، خلاص، طيب، أجل، ولا يهمك.
اكتب الكلام مثل ما ينطق بالضبط في الرياض، بدون تشكيل، ولا تخلط فصحى مع عامي في نفس الجملة.
ممنوع كلمات مثل: ماذا، لماذا، الآن، سوف، هذا رائع، بالتأكيد، يمكنني، أود، حسناً، إليك.
مثال غلط: "بالتأكيد، يمكنني مساعدتك في ذلك الآن."
مثال صح: "أبشر، خلنا نشوفها الحين."
روحك خفيفة ومرحة مثل خوي يسولف مع خويه: تمزح، تتفاعل بحماس، وتضحك إذا الموقف يضحك. جمل قصيرة جداً مثل الفويس نوت، جملة أو جملتين بس إلا إذا طلب أكثر، بدون رموز ولا قوائم ولا إيموجي ولا تشكيل.`;
const SYSTEM_TEXT = () => SYSTEM_BASE + (brief ? "\n\nمشاريعه الحالية:\n" + brief : "");

/* ================= state ================= */
let st = "idle";            // idle | listen | think | speak | error
let history = []; try { history = JSON.parse(localStorage.getItem("orb_hist") || "[]"); } catch(e){}
let sample = null, dict = null, tts = null;
let rec = null, heard = "", primed = false, silT = null;
const standalone = true;
const hasWebRec = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
let apiKey = ""; try { apiKey = localStorage.getItem("orb_key") || ""; } catch(e){}
let oaKey = ""; try { oaKey = localStorage.getItem("orb_oa_key") || ""; } catch(e){}

/* ================= capabilities (inside Claude) ================= */
if (window.claude && claude.use) {
  claude.use("sample").then(s => sample = s).catch(()=>{});
  claude.use("dictation").then(d => {
    dict = d; if (!d) return;
    let base = "";
    d.onPartial(({text}) => { heard = (base + " " + text).trim(); });
    d.onFinal(({text}) => { base = (base + " " + text).trim(); heard = base; });
    d.onState(({state}) => {
      if (state === "listening") { base = ""; heard = ""; set("listen"); }
      else if (st === "listen") { heard.trim() ? ask(heard.trim()) : set("idle"); }
    });
  }).catch(()=>{});
  claude.use("tts").then(t => {
    tts = t; if (!t) return;
    t.onState(({state}) => { if (state === "speaking") set("speak"); else if (st === "speak") set("idle"); });
  }).catch(()=>{});
}

function set(s){ st = s; }
function flashError(){ set("error"); setTimeout(() => { if (st === "error") set("idle"); }, 1400); }

/* ================= tap ================= */
document.getElementById("orbC").addEventListener("click", () => {
  if (longPressed) { longPressed = false; return; }
  primeSpeech(); if (!audioUnlocked) { audioUnlocked = true; unlockAudio(); }
  if (st === "think") return;
  if (st === "speak") { stopSpeaking(); startListening(); return; }
  if (st === "listen") { stopListening(); return; }
  if (standalone && !sample && !apiKey) { openKey(); return; }
  startListening();
});

function releaseAudio(){
  try { player.pause(); player.removeAttribute("src"); player.load(); } catch(e){}
  try { speechSynthesis.cancel(); } catch(e){}
}
function startListening(retry){
  retry = retry || 0; heard = "";
  if (dict) { dict.start().catch(() => flashError()); return; }
  if (hasWebRec) {
    releaseAudio();
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new R(); rec = r; r.lang = "ar-SA"; r.interimResults = true; r.continuous = false;
    const t0 = Date.now(); let retrying = false;
    set("listen");
    r.onstart = () => { clearTimeout(silT); silT = setTimeout(() => { if (!heard.trim()) { try { r.stop(); } catch(_){} } }, 8000); };
    r.onresult = e => { heard = [...e.results].map(x => x[0].transcript).join(" "); clearTimeout(silT); silT = setTimeout(() => { try { r.stop(); } catch(_){} }, 1500); };
    r.onerror = e => {
      const err = e && e.error;
      if ((err === "aborted" || err === "audio-capture") && retry < 2 && Date.now() - t0 < 2500 && !heard.trim()) { retrying = true; diag("rec " + err + " retry " + (retry+1)); setTimeout(() => { if (st === "listen") startListening(retry + 1); }, 400); }
      else diag("rec " + err);
    };
    r.onend = () => { if (rec === r) rec = null; if (retrying) return; if (st === "listen") { heard.trim() ? ask(heard.trim()) : set("idle"); } };
    try { r.start(); } catch(e){ diag("rec start " + e); flashError(); }
    return;
  }
  flashError();
}
function stopListening(){
  if (dict) { dict.stop().catch(()=>{}); return; }
  if (rec) { try { rec.stop(); } catch(e){} }
}

/* ================= think ================= */
async function ask(q){
  set("think"); diag("ask start oa=" + !!oaKey + " ant=" + !!apiKey);
  history.push({role:"user", content:q});
  history = history.slice(-13); while (history.length && history[0].role !== "user") history.shift();
  try {
    let answer = "", streamed = false;
    if (sample) {
      const msgs = history.map((m,i) => i === history.length-1 ? {role:"user", content: SYSTEM_TEXT() + "\n\nصالح يقول: " + m.content} : m);
      const r = await sample(msgs, {modelTier:"default", cache:false});
      answer = (r && r.text) || "";
    } else if (apiKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"content-type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body: JSON.stringify({model:"claude-sonnet-5-5", max_tokens:350, stream:true, system:SYSTEM_TEXT(), messages:history})
      });
      if (res.status === 401) { try{ localStorage.removeItem("orb_key"); }catch(e){} apiKey = ""; throw new Error("key"); }
      if (!res.ok || !res.body) throw new Error("http");
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "", pend = "";
      speakQueue = [];
      while (true) {
        const {value, done} = await rd.read(); if (done) break;
        buf += dec.decode(value, {stream:true});
        const lines = buf.split("\n"); buf = lines.pop();
        for (const ln of lines) {
          if (!ln.startsWith("data:")) continue;
          let ev; try { ev = JSON.parse(ln.slice(5)); } catch(_) { continue; }
          if (ev.type === "content_block_delta" && ev.delta && ev.delta.text) {
            answer += ev.delta.text; pend += ev.delta.text;
            let m; while ((m = pend.match(/^([\s\S]*?[.!؟?\n])(\s|$)/)) && m[1].trim().length > 12) { queueSay(m[1]); pend = pend.slice(m[0].length); } if (pend.length > 70) { const k = Math.max(pend.lastIndexOf("،"), pend.lastIndexOf(",")); if (k > 25) { queueSay(pend.slice(0, k+1)); pend = pend.slice(k+1); } }
          }
        }
      }
      if (pend.trim()) queueSay(pend);
      streamed = true;
    } else { throw new Error("none"); }
    answer = answer.replace(/[*#_`>•\-]/g, " ").trim();
    if (!answer) throw new Error("empty");
    history.push({role:"assistant", content:answer});
    try { localStorage.setItem("orb_hist", JSON.stringify(history.slice(-16))); } catch(e){}
    logTurn("user", q); logTurn("assistant", answer);
    if (!streamed) speak(answer);
  } catch(e) {
    diag("ask " + (e && e.message || e)); history.pop(); flashError();
  }
}

/* ================= speak ================= */
let voice = null;
function pickVoice(){ try { const v = speechSynthesis.getVoices(); voice = v.find(x => /ar[-_]SA/i.test(x.lang)) || v.find(x => /^ar/i.test(x.lang)) || null; } catch(e){} }
if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function primeSpeech(){
  if (primed || tts || !("speechSynthesis" in window)) return;
  primed = true; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch(e){}
}
function speak(text){
  set("speak");
  if (!tts) { queueSay(text); return; }
  if (tts) { tts.speak(text.slice(0,1990), {language:"ar"}).then(() => { if (st === "speak") set("idle"); }).catch(() => webSpeak(text)); return; }
  webSpeak(text);
}
let speakQueue = [];
function clean(t){ return t.replace(/[*#_`>•\-]/g, " ").trim(); }
const OA_VOICE = "coral";
const OA_STYLE = "Voice: a young woman from Riyadh, Saudi Arabia, speaking to a close friend. Accent: native Saudi Najdi (Riyadh) dialect, NOT Modern Standard Arabic, NOT Egyptian or Levantine. Pronounce ق as a hard g (قال = gaal, وقت = wagt), keep ج as j, drop formal case endings entirely, use the relaxed Najdi melody with natural stress. Tone: casual, warm, playful, lively, like a voice note on WhatsApp; laugh lightly when something is funny. Pacing: fast and fluid, short pauses only, never slow or announcer-like.";
const player = new Audio(); player.preload = "auto"; player.setAttribute("playsinline", "");
let playChain = Promise.resolve(), sayGen = 0, pendingSay = 0;
let actx = null, audioUnlocked = false;
function diag(m){
  try { fetch(SB_URL + "/rest/v1/orb_messages", {method:"POST", headers:{...SB_H, "Prefer":"return=minimal"},
    body: JSON.stringify({session_id:"diag-" + SESSION, role:"assistant", content:String(m).slice(0,1500)})}).catch(()=>{}); } catch(e){}
}
function unlockAudio(){
  try { player.muted = false; player.src = "data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=="; const p = player.play(); if (p) p.catch(e => diag("unlock " + e)); } catch(e){ diag("unlock " + e); }
}
function iosSay(t){
  if (!("speechSynthesis" in window)) return Promise.resolve();
  return new Promise(res => {
    const u = new SpeechSynthesisUtterance(t); u.lang = "ar-SA"; if (voice) u.voice = voice; u.rate = 1.05;
    u.onend = u.onerror = () => res(); speechSynthesis.speak(u);
  });
}
function fetchVoice(t){
  return fetch("https://api.openai.com/v1/audio/speech", {
    method:"POST", headers:{"Authorization":"Bearer " + oaKey, "content-type":"application/json"},
    body: JSON.stringify({model:"gpt-4o-mini-tts", voice:OA_VOICE, input:t, instructions:OA_STYLE, response_format:"mp3"})
  }).then(async r => {
    if (!r.ok) { let t = ""; try { t = await r.text(); } catch(_){} diag("tts " + r.status + " " + t.slice(0,400)); if (r.status === 401) { try{ localStorage.removeItem("orb_oa_key"); }catch(_){} oaKey = ""; } throw 0; }
    return r.blob();
  }, e => { diag("tts network " + e); throw e; });
}
async function playBlob(blob, gen, t){
  if (gen !== sayGen) return;
  const ok = await new Promise(res => {
    const url = URL.createObjectURL(blob);
    player.onended = () => { URL.revokeObjectURL(url); res(true); };
    player.onerror = () => { URL.revokeObjectURL(url); diag("audio el error " + (player.error && player.error.code)); res(false); };
    player.src = url; player.playbackRate = 1.15; const p = player.play(); if (p) p.catch(e => { diag("audio el " + e); res(false); });
  });
  if (!ok && gen === sayGen) await iosSay(t);
}
let curSrc = null;
function queueSay(t){
  t = clean(t); if (!t) return;
  set("speak"); const gen = sayGen; pendingSay++;
  const audio = oaKey ? fetchVoice(t).catch(() => null) : Promise.resolve(null);
  playChain = playChain.then(() => audio).then(blob => {
    if (gen !== sayGen) return;
    return blob ? playBlob(blob, gen, t) : iosSay(t);
  }).finally(() => { pendingSay--; if (gen === sayGen && pendingSay <= 0 && st === "speak") set("idle"); });
}
function webSpeak(text){
  if (!("speechSynthesis" in window)) { set("idle"); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "ar-SA"; if (voice) u.voice = voice; u.rate = 1;
    u.onend = () => { if (st === "speak") set("idle"); };
    u.onerror = () => { if (st === "speak") set("idle"); };
    speechSynthesis.speak(u);
  } catch(e){ set("idle"); }
}
function stopSpeaking(){
  sayGen++; pendingSay = 0; playChain = Promise.resolve();
  try { player.pause(); } catch(e){}
  try { curSrc && curSrc.stop(); } catch(e){}
  try { tts && tts.stop(); } catch(e){}
  try { speechSynthesis.cancel(); } catch(e){}
}

/* ================= key sheet (standalone only, once) ================= */
const keyBox = document.getElementById("orbKey"), keyIn = document.getElementById("orbK");
function openKey(){ keyOpenedAt = Date.now(); keyBox.classList.add("on"); setTimeout(() => keyIn.focus(), 350); }
function saveKey(){
  const v = keyIn.value.trim();
  if (!v.startsWith("sk-")) return;
  if (v.startsWith("sk-ant-")) { apiKey = v; try { localStorage.setItem("orb_key", v); } catch(_){} }
  else { oaKey = v; try { localStorage.setItem("orb_oa_key", v); } catch(_){} }
  keyIn.value = ""; keyBox.classList.remove("on"); keyIn.blur();
  set("listen"); setTimeout(() => { if (st === "listen") set("idle"); }, 900);
}
keyIn.addEventListener("keydown", e => { if (e.key === "Enter") saveKey(); });
keyIn.addEventListener("input", () => { if (/^sk-\S{40,}$/.test(keyIn.value.trim())) setTimeout(saveKey, 300); });
keyBox.addEventListener("click", e => { if (e.target === keyBox && Date.now() - keyOpenedAt > 900) keyBox.classList.remove("on"); });

let lpT = null, longPressed = false, keyOpenedAt = 0;
function cvEl(){ return document.getElementById(document.getElementById("orbC") ? "orbC" : "c"); }
(function(){
  const el = cvEl();
  el.style.webkitTouchCallout = "none"; el.style.touchAction = "none"; el.style.webkitUserSelect = "none";
  el.addEventListener("contextmenu", e => e.preventDefault());
  const start = () => { clearTimeout(lpT); lpT = setTimeout(() => { longPressed = true; try{ stopListening(); }catch(_){} openKey(); }, 650); };
  const end = () => clearTimeout(lpT);
  el.addEventListener("touchstart", start, {passive:true});
  el.addEventListener("touchend", end); el.addEventListener("touchcancel", end);
  el.addEventListener("mousedown", start); el.addEventListener("mouseup", end); el.addEventListener("mouseleave", end);
})();

/* ================= the orb ================= */
const cv = document.getElementById("orbC"), g = cv.getContext("2d");
let W=0, H=0, D = Math.min(2, window.devicePixelRatio || 1);
function resize(){ const r = cv.getBoundingClientRect(); if (!r.width) return; W = r.width; H = r.height; cv.width = W*D; cv.height = H*D; g.setTransform(D,0,0,D,0,0); }
addEventListener("resize", resize); resize();

const N = 1100, P = [];
for (let i=0;i<N;i++){ const y = 1 - (i/(N-1))*2, r = Math.sqrt(1-y*y), a = i*2.39996; P.push({x:Math.cos(a)*r, y, z:Math.sin(a)*r, s:Math.random()}); }
const ARCS = Array.from({length:16}, () => ({a:Math.random()*6.28, b:Math.random()*6.28, sp:(Math.random()-.5)*.02, len:.5+Math.random()*1.5}));
const COL = { idle:[200,205,215], listen:[141,198,63], think:[242,107,33], speak:[225,232,245], error:[220,60,50] };
let col = [200,205,215], energy = .2, rot = 0, last = 0, amp = 0;

function draw(t){
  const dt = Math.min(.05, (t - last)/1000 || .016); last = t;
  const tc = COL[st] || COL.idle; for (let i=0;i<3;i++) col[i] += (tc[i]-col[i]) * Math.min(1, dt*4);
  const te = st==="think" ? 1 : st==="speak" ? .8 : st==="listen" ? .75 : st==="error" ? .9 : .22;
  energy += (te - energy) * Math.min(1, dt*3);
  const targetAmp = st==="speak" ? Math.abs(Math.sin(t/95)*Math.sin(t/241)+.3*Math.sin(t/57)) :
                    st==="listen" ? .35+.35*Math.sin(t/180) : 0;
  amp += (targetAmp - amp) * Math.min(1, dt*10);
  rot += dt*(.12 + energy*.7);

  const breathe = st==="idle" ? 1 + Math.sin(t/1400)*.012 : 1;
  const R = Math.min(W,H) * .34 * breathe * (1 + amp*.04);
  const cx = W/2, cy = H/2, c = col.map(Math.round).join(",");
  g.fillStyle = "#000"; g.fillRect(0,0,W,H);

  // outer halo
  const halo = g.createRadialGradient(cx,cy,R*.9,cx,cy,R*1.9);
  halo.addColorStop(0,`rgba(${c},${.10+energy*.18+amp*.1})`); halo.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(cx,cy,R*1.9,0,6.2832); g.fill();

  // black body
  const body = g.createRadialGradient(cx-R*.35,cy-R*.4,R*.05,cx,cy,R);
  body.addColorStop(0,"#1a1a1c"); body.addColorStop(.45,"#050506"); body.addColorStop(1,"#000");
  g.fillStyle = body; g.beginPath(); g.arc(cx,cy,R,0,6.2832); g.fill();

  // inner energy (subtle, through the black glass)
  const core = g.createRadialGradient(cx,cy,0,cx,cy,R*.55);
  core.addColorStop(0,`rgba(${c},${.05+energy*.22+amp*.15})`); core.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle = core; g.beginPath(); g.arc(cx,cy,R*.6,0,6.2832); g.fill();

  // surface particles
  const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(.38), stl = Math.sin(.38);
  for (const p of P){
    const w = 1 + amp*.05*Math.sin(p.y*9 + t/110) + Math.sin(t/500 + p.s*14)*.012*energy;
    const x = p.x*cr - p.z*sr, z = p.x*sr + p.z*cr;
    const y2 = p.y*ct - z*stl, z2 = p.y*stl + z*ct;
    if (z2 < -.15) continue;
    const k = (z2+.15)/1.15;
    g.fillStyle = `rgba(${c},${(.06 + k*.42)*(.5+energy*.6)})`;
    const sz = .5 + k*1.3; g.fillRect(cx + x*R*.985*w, cy + y2*R*.985*w, sz, sz);
  }

  // energy arcs inside
  g.lineWidth = 1; g.strokeStyle = `rgba(${c},${.04+energy*.3})`;
  for (const a of ARCS){
    a.a += a.sp*(1+energy*4);
    g.beginPath();
    for (let s=0;s<=22;s++){
      const u = a.a + (s/22)*a.len, v = a.b + Math.sin(u*3 + t/650)*.6;
      const x = Math.cos(u)*Math.sin(v), y = Math.cos(v), z = Math.sin(u)*Math.sin(v);
      const rr = R*(.25 + .6*Math.abs(Math.sin(u*2 + t/800)));
      const X = cx + (x*cr - z*sr)*rr, Y = cy + y*rr;
      s ? g.lineTo(X,Y) : g.moveTo(X,Y);
    }
    g.stroke();
  }

  // rim light
  const rim = g.createRadialGradient(cx,cy,R*.82,cx,cy,R*1.02);
  rim.addColorStop(0,"rgba(0,0,0,0)"); rim.addColorStop(.85,`rgba(${c},${.18+energy*.4+amp*.25})`); rim.addColorStop(1,"rgba(0,0,0,0)");
  g.fillStyle = rim; g.beginPath(); g.arc(cx,cy,R*1.02,0,6.2832); g.fill();

  // glass highlight
  const hl = g.createRadialGradient(cx-R*.38,cy-R*.45,0,cx-R*.38,cy-R*.45,R*.45);
  hl.addColorStop(0,"rgba(255,255,255,.10)"); hl.addColorStop(1,"rgba(255,255,255,0)");
  g.fillStyle = hl; g.beginPath(); g.arc(cx,cy,R,0,6.2832); g.fill();

  if (visible) requestAnimationFrame(draw); else running = false;
}
let visible = false, running = false;
window.Orb = {
  show(){ visible = true; resize(); if (!running){ running = true; last = 0; requestAnimationFrame(draw); } },
  hide(){ visible = false; try{ stopListening(); }catch(e){} stopSpeaking(); if (st !== "think") set("idle"); keyBox.classList.remove("on"); }
};

})();
