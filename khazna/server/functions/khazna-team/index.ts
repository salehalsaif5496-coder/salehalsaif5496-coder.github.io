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

  // ---------------- الاجتماعات ----------------
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "");
  const loadMeeting = async (id: string) => {
    const { data } = await db.from("team_meetings").select("*").eq("id", id).maybeSingle();
    return data;
  };
  // صور الاجتماع: مخزن خاص، والجوال ياخذ روابط موقّعة لمدة ساعة
  const BUCKET = "team-meet", MAX_IMG = 4;
  const withUrls = async (msgs: any[]) => {
    const paths = msgs.flatMap((m) => m.images || []);
    if (!paths.length) return msgs;
    const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
    const url: Record<string, string> = {};
    (data || []).forEach((x: any) => { if (x.signedUrl && x.path) url[x.path] = x.signedUrl; });
    return msgs.map((m) => (m.images && m.images.length ? { ...m, urls: m.images.map((p: string) => url[p]).filter(Boolean) } : m));
  };

  if (body.action === "meetings") {
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const { data: meetings, error } = await db.from("team_meetings").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(60);
    if (error) return json({ error: error.message }, 500);
    const ids = (meetings || []).map((m: any) => m.id);
    const { data: tasks } = ids.length ? await db.from("team_meeting_tasks").select("*").in("meeting_id", ids).order("created_at") : { data: [] };
    return json({ meetings, tasks: tasks || [] });
  }

  if (body.action === "meeting_get") {
    const id = uuid(body.id);
    const meeting = id && await loadMeeting(id);
    if (!meeting) return json({ error: "الاجتماع مو موجود" }, 404);
    const [msgs, tasks] = await Promise.all([
      db.from("team_meeting_msgs").select("*").eq("meeting_id", id).order("created_at").limit(500),
      db.from("team_meeting_tasks").select("*").eq("meeting_id", id).order("created_at"),
    ]);
    return json({ meeting, msgs: await withUrls(msgs.data || []), tasks: tasks.data || [] });
  }

  if (body.action === "meeting_upload") {
    const meeting = await loadMeeting(uuid(body.id));
    if (!meeting) return json({ error: "الاجتماع مو موجود" }, 404);
    if (meeting.status !== "open") return json({ error: "الاجتماع مقفول" }, 400);
    const types: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const ext = types[String(body.type || "")];
    if (!ext) return json({ error: "نوع الصورة مو مدعوم" }, 400);
    const b64 = String(body.data || "").replace(/^data:[^,]*,/, "");
    if (!b64 || b64.length > 4_300_000) return json({ error: "الصورة كبيرة" }, 400);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { return json({ error: "الصورة خربانة" }, 400); }
    const path = `${meeting.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: body.type, upsert: false });
    if (error) return json({ error: error.message }, 500);
    const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    return json({ ok: true, path, url: s?.signedUrl || null });
  }

  if (body.action === "meeting_create") {
    const topic = str(body.topic, 160), details = str(body.details, 1500) || null;
    const want = Array.isArray(body.attendees) ? body.attendees.map((x: unknown) => str(x, 40)).filter(Boolean).slice(0, 12) : [];
    if (!topic) return json({ error: "اكتب موضوع الاجتماع" }, 400);
    const { data: mem } = await db.from("team_members").select("id").in("id", want.length ? want : ["-"]);
    const attendees = want.filter((id: string) => (mem || []).some((m: any) => m.id === id));
    if (!attendees.length) return json({ error: "اختر موظف واحد على الأقل" }, 400);
    const { data, error } = await db.from("team_meetings").insert({ topic, details, attendees }).select().single();
    return error ? json({ error: error.message }, 500) : json({ ok: true, meeting: data });
  }

  if (body.action === "meeting_post") {
    const meeting = await loadMeeting(uuid(body.id));
    if (!meeting) return json({ error: "الاجتماع مو موجود" }, 404);
    if (meeting.status !== "open") return json({ error: "الاجتماع مقفول" }, 400);
    const { data: mem } = await db.from("team_members").select("id,n").in("id", meeting.attendees);
    const own = new RegExp(`^${meeting.id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`, "i");
    const rows = (Array.isArray(body.msgs) ? body.msgs : []).slice(0, 15).map((x: any) => {
      const text = str(x?.body, 4000);
      if (!x?.member_id) {
        // صور صالح بس، ولازم تكون مرفوعة لنفس الاجتماع
        const images = (Array.isArray(x?.images) ? x.images : []).filter((p: unknown) => typeof p === "string" && own.test(p)).slice(0, MAX_IMG);
        if (!text && !images.length) return null;
        return { meeting_id: meeting.id, member_id: null, from_name: "صالح", body: text, images };
      }
      if (!text) return null;
      const m = (mem || []).find((y: any) => y.id === x.member_id);
      return m ? { meeting_id: meeting.id, member_id: m.id, from_name: m.n, body: text } : null;
    }).filter(Boolean);
    if (!rows.length) return json({ error: "ما فيه رسالة" }, 400);
    const { data, error } = await db.from("team_meeting_msgs").insert(rows).select();
    return error ? json({ error: error.message }, 500) : json({ ok: true, msgs: await withUrls(data || []) });
  }

  if (body.action === "meeting_close") {
    const meeting = await loadMeeting(uuid(body.id));
    if (!meeting) return json({ error: "الاجتماع مو موجود" }, 404);
    if (meeting.status !== "open") return json({ error: "الاجتماع مقفول من قبل" }, 400);
    const summary = str(body.summary, 3000);
    if (!summary) return json({ error: "المحضر فاضي" }, 400);
    const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 20).map((t: any) => ({
      meeting_id: meeting.id, member_id: meeting.attendees.includes(t?.member_id) ? t.member_id : null,
      task: str(t?.task, 400), due: str(t?.due, 60) || null,
    })).filter((t: any) => t.member_id && t.task);
    const { error } = await db.from("team_meetings").update({ status: "closed", minutes: summary, closed_at: new Date().toISOString() }).eq("id", meeting.id).eq("status", "open");
    if (error) return json({ error: error.message }, 500);
    if (tasks.length) { const r = await db.from("team_meeting_tasks").insert(tasks); if (r.error) return json({ error: r.error.message }, 500); }
    const { data: mem } = await db.from("team_members").select("id,n,lead").in("id", [...meeting.attendees, ...tasks.map((t: any) => t.member_id)]);
    const { data: lead } = await db.from("team_members").select("id,n").eq("lead", true).maybeSingle();
    const nm = (id: string) => (mem || []).find((m: any) => m.id === id)?.n || id;
    const lines = tasks.map((t: any) => `• ${nm(t.member_id)}: ${t.task}${t.due ? " (" + t.due + ")" : ""}`).join("\n");
    await db.from("team_mail").insert({
      member_id: lead?.id || null, from_name: lead?.n || "الفا", subject: "محضر اجتماع: " + meeting.topic,
      body: `${lead?.n || "الفا"} — المنسّق العام\n\n${summary}${lines ? "\n\nالمهام:\n" + lines : ""}`,
    });
    return json({ ok: true, tasks: tasks.length });
  }

  return json({ error: "unknown action" }, 400);
});
