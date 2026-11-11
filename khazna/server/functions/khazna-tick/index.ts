// الخزنة — يشتغل كل دقيقة (pg_cron) ويرسل إشعار كل مهمة جا وقتها
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const WINDOW_MIN = 15; // لو تأخر التشغيل، يرسل اللي فاته خلال آخر ربع ساعة

function localNow(tz: string) {
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]));
  } catch { return localNow("Asia/Riyadh"); }
  return { date: `${parts.year}-${parts.month}-${parts.day}`, min: +parts.hour * 60 + +parts.minute };
}
const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const due = (t: string | null, now: number) => !!t && toMin(t) <= now && now - toMin(t) < WINDOW_MIN;

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("khazna_config").select("key,value");
  const c = Object.fromEntries((cfg || []).map((x: any) => [x.key, x.value]));
  if (!c.cron_secret || req.headers.get("x-cron-secret") !== c.cron_secret) return new Response("forbidden", { status: 403 });
  webpush.setVapidDetails("mailto:noreply@khazna.app", c.vapid_public, c.vapid_private);

  const { data: devices } = await db.from("khazna_devices").select("*").not("subscription", "is", null);
  let sent = 0;
  for (const d of devices || []) {
    const now = localNow(d.tz || "Asia/Riyadh");
    const { data: rems } = await db.from("khazna_reminders").select("*").eq("device_hash", d.device_hash);
    const today = (rems || []).filter((r: any) => (r.daily || r.date === now.date) && r.skip_date !== now.date);
    const pushes: { payload: any; mark?: string }[] = [];

    for (const r of today) {
      if (r.last_sent === now.date || !due(r.time, now.min)) continue;
      pushes.push({ payload: { title: "⏰ " + r.title, body: r.daily ? "مهمتك اليومية — حان وقتها" : "حان وقت المهمة", url: "/khazna/#tasks", tag: "t-" + r.task_id }, mark: r.task_id });
    }
    if (d.morning && d.morning_sent !== now.date && due(d.morning, now.min)) {
      const n = today.length;
      pushes.push({ payload: { title: "🗂 مهام اليوم", body: n ? `عندك ${n} ${n === 1 ? "مهمة" : n === 2 ? "مهمتين" : n <= 10 ? "مهام" : "مهمة"} اليوم — افتح الخزنة` : "ما عندك مهام اليوم — يوم هادي", url: "/khazna/#tasks", tag: "morning" }, mark: "__morning" });
    }

    for (const p of pushes) {
      try {
        await webpush.sendNotification(d.subscription, JSON.stringify(p.payload), { TTL: 3600, urgency: "high" });
        sent++;
        if (p.mark === "__morning") await db.from("khazna_devices").update({ morning_sent: now.date }).eq("device_hash", d.device_hash);
        else await db.from("khazna_reminders").update({ last_sent: now.date }).eq("device_hash", d.device_hash).eq("task_id", p.mark);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.from("khazna_devices").update({ subscription: null }).eq("device_hash", d.device_hash);
          break;
        }
        console.log("push error", err?.statusCode, String(err?.body || err));
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
});
