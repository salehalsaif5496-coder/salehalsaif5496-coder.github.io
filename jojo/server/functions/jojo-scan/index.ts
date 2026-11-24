// جوجو — قراءة صورة كيس قهوة (Claude Haiku) وحفظها في jojo_beans
import { createClient } from "npm:@supabase/supabase-js@2";
import { matchRaysProduct, parseClaudeJson, sniffMediaType } from "./match.ts";

const ORIGIN = "https://salehalsaif5496-coder.github.io";
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PROMPT = "هذي صورة كيس قهوة. اقرأ المكتوب عليه. Return ONLY a JSON object (no other text) with keys: roaster, name, origin, process, roast, is_coffee_bag (boolean — true only if the photo shows a coffee bag/package). Use null for anything unreadable.";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, reason: "method" }, 405);

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, reason: "unauthorized" }, 401);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u, error: uerr } = await db.auth.getUser(token);
  if (uerr || !u?.user) return json({ ok: false, reason: "unauthorized" }, 401);
  const uid = u.user.id;

  const { data: prof } = await db.from("jojo_profiles").select("role").eq("user_id", uid).maybeSingle();
  if (prof?.role !== "jojo") return json({ ok: false, reason: "forbidden" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: "bad_request" }, 400); }
  const photo_path = body?.photo_path;
  if (typeof photo_path !== "string" || !photo_path.startsWith(uid + "/") || photo_path.includes("..")) return json({ ok: false, reason: "bad_path" }, 400);

  const { data: blob, error: derr } = await db.storage.from("jojo-beans").download(photo_path);
  if (derr || !blob) return json({ ok: false, reason: "no_photo" }, 404);
  if (blob.size > 5 * 1024 * 1024) return json({ ok: false, reason: "too_large" });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) return json({ ok: false, reason: "too_large" });
  const mediaType = sniffMediaType(bytes);
  if (!mediaType) return json({ ok: false, reason: "unsupported_format" });
  const data = b64(bytes);

  let text = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "", "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-5-5",
        max_tokens: 400,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: PROMPT },
        ] }],
      }),
    });
    if (!r.ok) { console.error("anthropic", r.status, (await r.text()).slice(0, 200)); return json({ ok: false, error: "scan_failed" }, 502); }
    const j = await r.json();
    text = (j.content || []).map((c: any) => c.text || "").join("");
  } catch (e) { console.error("anthropic fetch", String(e)); return json({ ok: false, error: "scan_failed" }, 502); }

  const p = parseClaudeJson(text);
  if (!p) return json({ ok: false, reason: "unreadable" });
  if (p.is_coffee_bag === false || p.is_coffee_bag === "false") return json({ ok: false, reason: "not_coffee" });

  const f = { roaster: str(p.roaster), name: str(p.name), origin: str(p.origin), process: str(p.process), roast: str(p.roast) };
  const { data: products } = await db.from("jojo_rays_products").select("notion_id,name,aliases");
  const matched = matchRaysProduct(f, products || []);

  const { data: bean, error: ierr } = await db.from("jojo_beans")
    .insert({ user_id: uid, photo_path, ...f, is_rays: matched != null, product_id: matched })
    .select().single();
  if (ierr) { console.error("insert", ierr.message); return json({ ok: false, error: "db_failed" }, 500); }
  return json({ ok: true, bean });
});
