// جوجو — يشتغل كل دقيقة (pg_cron) ويرسل لجوجو التنبيهات اللي جا وقتها.
// الحماية: هيدر x-cron-secret لازم يطابق jojo_config 'cron_secret' (لو ناقص → 403، يقفل).
// verify_jwt = false (الكرون ما عنده JWT).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import * as adhan from "npm:adhan@4.4.6";
import { dueReminders, localDate, localNow, prayerTimes, type Prayers } from "./due.ts";

function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("jojo_config").select("key,value").in("key", ["cron_secret", "vapid_public", "vapid_private"]);
  const c = Object.fromEntries((cfg || []).map((x) => [x.key, x.value]));
  const got = req.headers.get("x-cron-secret") || "";
  if (typeof c.cron_secret !== "string" || c.cron_secret.length < 16 || !sameSecret(got, c.cron_secret)) {
    return new Response("forbidden", { status: 403 });
  }
  if (typeof c.vapid_public !== "string" || typeof c.vapid_private !== "string") return new Response("vapid not set", { status: 500 });
  webpush.setVapidDetails("mailto:noreply@jojo.invalid", c.vapid_public, c.vapid_private);

  const { data: subs } = await db.from("jojo_push").select("user_id,subscription,tz");
  let sent = 0, failed = 0;
  for (const row of subs || []) {
    try {
      const { data: prof } = await db.from("jojo_profiles").select("role,settings").eq("user_id", row.user_id).maybeSingle();
      if (!prof || prof.role !== "jojo") continue;
      const settings = prof.settings || {};
      const tz = typeof settings.tz === "string" ? settings.tz : (row.tz || "Asia/Riyadh");
      const now = localNow(tz);

      const [tasksR, checksR, msgsR, logR] = await Promise.all([
        db.from("jojo_tasks").select("id,title,days,remind_at,created_at").eq("user_id", row.user_id).not("remind_at", "is", null),
        db.from("jojo_checks").select("key,value").eq("user_id", row.user_id).eq("date", now.date),
        db.from("jojo_messages").select("id,for_date,created_at,seen_at").eq("kind", "daily").eq("for_date", now.date).is("seen_at", null),
        db.from("jojo_push_log").select("key").eq("user_id", row.user_id).eq("date", now.date),
      ]);
      if (tasksR.error || checksR.error || msgsR.error || logR.error) {
        console.log("jojo-tick load error", tasksR.error || checksR.error || msgsR.error || logR.error);
        continue;
      }
      const checks: Record<string, unknown> = {};
      for (const x of checksR.data || []) checks[x.key] = x.value;
      let prayers: Prayers | null = null;
      const city = settings.city;
      if (city && typeof city.lat === "number" && typeof city.lng === "number") {
        try { prayers = prayerTimes(adhan, now.date, city.lat, city.lng, tz); } catch (e) { console.log("prayer error", String(e)); }
      }
      const due = dueReminders({
        date: now.date,
        nowMin: now.min,
        settings,
        tasks: (tasksR.data || []).filter((t) => !t.created_at || localDate(t.created_at, tz) <= now.date),
        checks,
        prayers,
        messages: (msgsR.data || []).map((m) => ({ id: m.id, for_date: m.for_date, seen_at: m.seen_at, created_date: localDate(m.created_at, tz) })),
        sent: new Set((logR.data || []).map((x) => x.key)),
      });

      for (const d of due) {
        // نحجز المفتاح أول: لو تشغيلتين تداخلت، وحدة بس ترسل
        const { data: claimed, error: ce } = await db.from("jojo_push_log")
          .upsert({ user_id: row.user_id, date: now.date, key: d.key }, { onConflict: "user_id,date,key", ignoreDuplicates: true })
          .select("key");
        if (ce || !claimed || !claimed.length) continue;
        try {
          await webpush.sendNotification(row.subscription, JSON.stringify({ title: d.title, body: d.body, url: d.url, tag: d.tag }), { TTL: 3600, urgency: "high" });
          sent++;
        } catch (err) {
          // deno-lint-ignore no-explicit-any
          const e = err as any;
          if (e?.statusCode === 404 || e?.statusCode === 410) {   // الاشتراك انتهى: نشيله وننتظر تفعيل جديد
            await db.from("jojo_push_log").delete().eq("user_id", row.user_id).eq("date", now.date).eq("key", d.key);
            await db.from("jojo_push").delete().eq("user_id", row.user_id);
            break;
          }
          failed++;
          // خطأ مؤقت: نفك الحجز عشان الدقيقة الجاية تجرب (داخل نافذة الربع ساعة)
          await db.from("jojo_push_log").delete().eq("user_id", row.user_id).eq("date", now.date).eq("key", d.key);
          console.log("push error", e?.statusCode, String(e?.body || e));
        }
      }
    } catch (e) {
      console.log("jojo-tick row error", String(e));
    }
  }
  // تنظيف: سجل أقدم من أسبوع ما نحتاجه
  if (new Date().getUTCMinutes() === 7) {
    await db.from("jojo_push_log").delete().lt("date", addDays(localNow("Asia/Riyadh").date, -7));
  }
  return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { "Content-Type": "application/json" } });
});
