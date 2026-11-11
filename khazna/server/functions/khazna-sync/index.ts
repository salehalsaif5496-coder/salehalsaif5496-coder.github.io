// الخزنة — مزامنة اشتراك الإشعارات ومواعيد المهام من الجوال
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const hhmm = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const secret = String(body.secret || "");
  if (secret.length < 32 || secret.length > 128) return json({ error: "bad secret" }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const device_hash = await sha256("khazna:" + secret);
  const tz = typeof body.tz === "string" && body.tz.length < 64 ? body.tz : "Asia/Riyadh";

  // device row
  const dev: Record<string, unknown> = { device_hash, tz, morning: hhmm(body.morning), updated_at: new Date().toISOString() };
  if (body.subscription && body.subscription.endpoint) dev.subscription = body.subscription;
  if (body.unsubscribe) dev.subscription = null;
  const { error: e1 } = await db.from("khazna_devices").upsert(dev);
  if (e1) return json({ error: e1.message }, 500);

  // reminders: full replace of this device's list (keeps last_sent when time/date unchanged)
  if (Array.isArray(body.reminders)) {
    const list = body.reminders.slice(0, 500).map((r: any) => ({
      device_hash,
      task_id: String(r.task_id || "").slice(0, 64),
      title: String(r.title || "").slice(0, 140),
      time: hhmm(r.time),
      date: r.daily ? null : ymd(r.date),
      daily: !!r.daily,
      skip_date: ymd(r.skip_date),
    })).filter((r: any) => r.task_id && r.title && (r.daily || r.date));
    const { data: old } = await db.from("khazna_reminders").select("task_id,time,date,last_sent").eq("device_hash", device_hash);
    const prev = new Map((old || []).map((o: any) => [o.task_id, o]));
    const rows = list.map((r: any) => {
      const o: any = prev.get(r.task_id);
      return { ...r, last_sent: o && o.time === r.time && o.date === r.date ? o.last_sent : null };
    });
    const keep = rows.map((r: any) => r.task_id);
    let del = db.from("khazna_reminders").delete().eq("device_hash", device_hash);
    if (keep.length) del = del.not("task_id", "in", `(${keep.map((k: string) => `"${k.replace(/"/g, "")}"`).join(",")})`);
    await del;
    if (rows.length) {
      const { error: e2 } = await db.from("khazna_reminders").upsert(rows);
      if (e2) return json({ error: e2.message }, 500);
    }
  }

  // test push
  if (body.test) {
    const { data: d } = await db.from("khazna_devices").select("subscription").eq("device_hash", device_hash).single();
    if (!d?.subscription) return json({ ok: true, test: "no-subscription" });
    const { data: cfg } = await db.from("khazna_config").select("key,value");
    const c = Object.fromEntries((cfg || []).map((x: any) => [x.key, x.value]));
    webpush.setVapidDetails("mailto:noreply@khazna.app", c.vapid_public, c.vapid_private);
    try {
      await webpush.sendNotification(d.subscription, JSON.stringify({ title: "🔔 الخزنة", body: "الإشعارات شغالة — بيوصلك تنبيه كل مهمة في وقتها", url: "/khazna/#tasks", tag: "test" }));
      return json({ ok: true, test: "sent" });
    } catch (err: any) {
      return json({ ok: false, test: "failed", status: err?.statusCode, msg: String(err?.body || err?.message || err) });
    }
  }
  return json({ ok: true });
});
