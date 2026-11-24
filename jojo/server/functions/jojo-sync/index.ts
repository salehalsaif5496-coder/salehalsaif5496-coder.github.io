// جوجو — حفظ اشتراك الإشعارات (Web Push) من جوالها.
// POST مع Authorization: Bearer <access token حقها>. نتحقق من التوكن (auth.getUser) ومن إن دورها 'jojo'.
//   {subscription, tz}      → upsert jojo_push
//   {unsubscribe: true}     → حذف اشتراكها
//   {test: true}            → (مع اللي فوق) يرسل إشعار تجربة
// verify_jwt = false: التحقق هنا (عشان طلب CORS المبدئي يعدي)، والجداول service role بس.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const ORIGIN = "https://salehalsaif5496-coder.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
function cleanSub(s: any) {
  if (!s || typeof s !== "object") return null;
  const endpoint = s.endpoint, p256dh = s.keys && s.keys.p256dh, auth = s.keys && s.keys.auth;
  if (typeof endpoint !== "string" || !/^https:\/\//.test(endpoint) || endpoint.length > 1024) return null;
  if (typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 256 || auth.length > 64) return null;
  return { endpoint, expirationTime: typeof s.expirationTime === "number" ? s.expirationTime : null, keys: { p256dh, auth } };
}
function validTz(tz: unknown) {
  if (typeof tz !== "string" || tz.length > 64) return "Asia/Riyadh";
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } catch { return "Asia/Riyadh"; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "auth" }, 401);
  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!body || typeof body !== "object") return json({ error: "bad json" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u, error: ue } = await db.auth.getUser(token);
  if (ue || !u?.user) return json({ error: "auth" }, 401);
  const uid = u.user.id;
  const { data: prof } = await db.from("jojo_profiles").select("role").eq("user_id", uid).maybeSingle();
  if (prof?.role !== "jojo") return json({ error: "forbidden" }, 403);

  if (body.unsubscribe) {
    const { error } = await db.from("jojo_push").delete().eq("user_id", uid);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, subscribed: false });
  }

  const sub = cleanSub(body.subscription);
  if (!sub) return json({ error: "bad subscription" }, 400);
  const { error } = await db.from("jojo_push").upsert({ user_id: uid, subscription: sub, tz: validTz(body.tz), updated_at: new Date().toISOString() });
  if (error) return json({ error: error.message }, 500);

  if (body.test) {
    const { data: cfg } = await db.from("jojo_config").select("key,value").in("key", ["vapid_public", "vapid_private"]);
    const c = Object.fromEntries((cfg || []).map((x) => [x.key, x.value]));
    if (typeof c.vapid_public !== "string" || typeof c.vapid_private !== "string") return json({ ok: true, test: "no-vapid" });
    webpush.setVapidDetails("mailto:noreply@jojo.invalid", c.vapid_public, c.vapid_private);
    try {
      await webpush.sendNotification(sub, JSON.stringify({ title: "🎀 جوجو", body: "التنبيهات شغالة يا جوجو، القطوة بتذكرك بكل شي بوقته 🐱", url: "/jojo/#today", tag: "jojo-test" }), { TTL: 600 });
      return json({ ok: true, test: "sent" });
    } catch (err) {
      // deno-lint-ignore no-explicit-any
      const e = err as any;
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from("jojo_push").delete().eq("user_id", uid);
      return json({ ok: false, test: "failed", status: e?.statusCode });
    }
  }
  return json({ ok: true, subscribed: true });
});
