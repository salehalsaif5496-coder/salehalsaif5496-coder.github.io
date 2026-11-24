// جوجو — ينسخ المنتجات والوصفات المعتمدة (V60) من Notion إلى jojo_rays_* (يُستدعى بسر cron)
import { createClient } from "npm:@supabase/supabase-js@2";
import { mapNotionRecipe } from "../jojo-scan/match.ts";

const PRODUCTS_DB = "39eb5181c4a74fbaafa9c6ec2571c3ba";
const RECIPES_DB = "9b278d8952c54012a769fd67675b6f20";

async function queryAll(dbId: string, token: string, filter?: unknown): Promise<any[]> {
  const out: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}), ...(filter ? { filter } : {}) }),
    });
    if (!res.ok) throw new Error(`notion ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    out.push(...(j.results || []));
    cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return out;
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: cfg } = await db.from("jojo_config").select("value").eq("key", "cron_secret").maybeSingle();
  const secret = cfg && typeof cfg.value === "string" ? cfg.value : null;
  if (!secret || req.headers.get("x-cron-secret") !== secret) return new Response("forbidden", { status: 403 });

  const token = Deno.env.get("NOTION_TOKEN");
  if (!token) return json({ ok: false, error: "no_notion_token" }, 500);

  try {
    const now = new Date().toISOString();
    const productPages = await queryAll(PRODUCTS_DB, token);
    const products = productPages.map((p) => {
      const titleProp: any = Object.values(p.properties || {}).find((x: any) => x?.type === "title");
      const name = ((titleProp?.title || []) as any[]).map((t) => t.plain_text ?? "").join("").trim();
      return { notion_id: p.id as string, name, aliases: [] as string[], updated_at: now };
    }).filter((p) => p.name);
    if (products.length) {
      const { error } = await db.from("jojo_rays_products").upsert(products, { onConflict: "notion_id" });
      if (error) throw new Error("products: " + error.message);
    }
    const known = new Set(products.map((p) => p.notion_id));

    const recipePages = await queryAll(RECIPES_DB, token, {
      and: [
        { property: "الحالة", select: { equals: "معتمدة" } },
        { property: "طريقة التحضير", select: { equals: "V60" } },
      ],
    });
    const recipes = recipePages.map(mapNotionRecipe).filter((r) => r !== null).map((r) => ({
      ...r!,
      product_notion_id: r!.product_notion_id && known.has(r!.product_notion_id) ? r!.product_notion_id : null,
      updated_at: now,
    }));
    if (recipes.length) {
      const { error } = await db.from("jojo_rays_recipes").upsert(recipes, { onConflict: "notion_id" });
      if (error) throw new Error("recipes: " + error.message);
    }
    return json({ ok: true, products: products.length, recipes: recipes.length });
  } catch (e) {
    console.log("sync error", String(e));
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
