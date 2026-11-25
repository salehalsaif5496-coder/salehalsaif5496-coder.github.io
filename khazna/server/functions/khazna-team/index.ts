// الخزنة — تبويب «الفريق»: يقرأ الموظفين وحالتهم وبريدهم للجوال المسجّل، ويستقبل تنبيه الشكاوى من تطبيق ريز
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info, x-team-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CADENCES = ["daily", "every2", "weekly", "monthly", "on_demand"];

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // ---- من تطبيق ريز: شكوى جديدة (بمفتاح سري، بدون بيانات العميل) ----
  if (body.action === "notify") {
    const { data: cfg } = await db.from("khazna_config").select("value").eq("key", "team_secret").maybeSingle();
    if (!cfg?.value || req.headers.get("x-team-secret") !== cfg.value) return json({ error: "forbidden" }, 403);
    const code = str(body.code, 40) || "بدون كود";
    const parts = [str(body.category, 60), str(body.branch, 60), str(body.severity, 30)].filter(Boolean).join(" · ");
    const line = `شكوى جديدة ${code}${parts ? " — " + parts : ""}. رحّلتها لسعد.`;
    await db.from("team_mail").insert({ member_id: "mishal", from_name: "مشعل", subject: "شكوى جديدة " + code, body: "مشعل — مراقب الجودة اليومي\n" + line });
    await db.from("team_status").upsert({ member_id: "mishal", working: false, doing: null, last_done: new Date().toISOString(), updated_at: new Date().toISOString() });
    await db.from("team_push").insert({ title: "🚨 شكوى جديدة " + code, body: parts || "افتح الفريق للتفاصيل", url: "/khazna/#team-mail", tag: "complaint-" + code });
    return json({ ok: true });
  }

  // ---- من الجوال: لازم يكون جهاز مسجّل في الخزنة (فعّل الإشعارات) ----
  const secret = String(body.secret || "");
  if (secret.length < 32 || secret.length > 128) return json({ error: "bad secret" }, 400);
  const device_hash = await sha256("khazna:" + secret);
  const { data: dev } = await db.from("khazna_devices").select("device_hash").eq("device_hash", device_hash).maybeSingle();
  if (!dev) return json({ error: "not_registered" }, 403);

  if (body.action === "list") {
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [m, s, mail] = await Promise.all([
      db.from("team_members").select("*").order("ord"),
      db.from("team_status").select("*"),
      db.from("team_mail").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(300),
    ]);
    if (m.error || s.error || mail.error) return json({ error: (m.error || s.error || mail.error)!.message }, 500);
    return json({ members: m.data, status: s.data, mail: mail.data, now: new Date().toISOString() });
  }

  if (body.action === "read") {
    const q = db.from("team_mail").update({ read_at: new Date().toISOString() }).is("read_at", null);
    const { error } = body.id === "all" ? await q.not("id", "is", null) : await q.eq("id", str(body.id, 40));
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  if (body.action === "upsert_member") {
    const m = body.member || {};
    const id = str(m.id, 40).replace(/[^a-z0-9_-]/gi, "") || ("m" + Date.now().toString(36));
    const row = {
      id, n: str(m.n, 40), t: str(m.t, 60), d: str(m.d, 80) || null, dept: str(m.dept, 60) || null,
      boss: str(m.boss, 40) || null, lead: !!m.lead, paused_until: /^\d{4}-\d{2}-\d{2}$/.test(m.paused_until || "") ? m.paused_until : null,
      duty: str(m.duty, 160) || null, cadence: CADENCES.includes(m.cadence) ? m.cadence : "on_demand",
      tasks: Array.isArray(m.tasks) ? m.tasks.map((x: unknown) => str(x, 160)).filter(Boolean).slice(0, 12) : [],
      ref: str(m.ref, 160) || null, rule: str(m.rule, 200) || null,
      ord: Number.isFinite(+m.ord) ? Math.round(+m.ord) : 100, updated_at: new Date().toISOString(),
    };
    if (!row.n || !row.t) return json({ error: "الاسم والمنصب مطلوبين" }, 400);
    if (row.boss === row.id) return json({ error: "الموظف ما يتبع نفسه" }, 400);
    const { error } = await db.from("team_members").upsert(row);
    if (error) return json({ error: error.message }, 500);
    await db.from("team_status").upsert({ member_id: id }, { onConflict: "member_id", ignoreDuplicates: true });
    return json({ ok: true, id });
  }

  if (body.action === "delete_member") {
    const id = str(body.id, 40);
    const { count } = await db.from("team_members").select("id", { count: "exact", head: true }).eq("boss", id);
    if (count) return json({ error: "انقل موظفينه لمدير ثاني قبل الحذف" }, 400);
    const { error } = await db.from("team_members").delete().eq("id", id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
});
