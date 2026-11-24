// منطق نقي (قابل للاختبار): مطابقة منتجات ريز، تحويل الوقت، تحليل رد Claude، تحويل وصفة Notion

export function normalize(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "") // تشكيل + تطويل
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// الوقت في Notion صيغته دقائق.ثواني: 2.3 = 2:30، 3.15 = 3:15، 2 = 2:00
export function notionTimeToSec(v: string | number): number {
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const [m, f = ""] = s.split(".");
  const min = parseInt(m, 10) || 0;
  const sec = f ? parseInt((f + "0").slice(0, 2), 10) || 0 : 0;
  return min * 60 + sec;
}

export interface Extracted { roaster?: string | null; name?: string | null; origin?: string | null; process?: string | null; roast?: string | null; }
export interface RaysProduct { notion_id: string; name: string; aliases?: string[] | null; }

export function isRaysRoaster(roaster: unknown): boolean {
  const r = normalize(roaster);
  return r.includes("rays") || r.includes("ريز");
}

export function matchRaysProduct(ex: Extracted, products: RaysProduct[]): string | null {
  if (!isRaysRoaster(ex.roaster)) return null;
  const hay = ` ${normalize([ex.name, ex.origin].filter(Boolean).join(" "))} `;
  if (hay.trim() === "") return null;
  let best: { id: string; len: number } | null = null;
  for (const p of products) {
    for (const term of [p.name, ...(p.aliases || [])]) {
      const t = normalize(term);
      if (t.length < 3) continue;
      if (hay.includes(` ${t} `) && (!best || t.length > best.len)) best = { id: p.notion_id, len: t.length };
    }
  }
  return best ? best.id : null;
}

export function parseClaudeJson(text: string): Record<string, any> | null {
  const m = String(text ?? "").match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch { return null; }
}

const txt = (p: any): string => {
  if (!p) return "";
  const arr = p.type === "title" ? p.title : p.rich_text;
  return (arr || []).map((x: any) => x.plain_text ?? "").join("").trim();
};
const num = (p: any): number | null => (p && typeof p.number === "number" ? p.number : null);

export function mapNotionRecipe(page: any) {
  const pr = page?.properties || {};
  if (pr["الحالة"]?.select?.name !== "معتمدة") return null;
  if (pr["طريقة التحضير"]?.select?.name !== "V60") return null;
  const time = pr["الوقت المستهدف "];
  const t = num(time);
  return {
    notion_id: page.id as string,
    product_notion_id: (pr["المنتج"]?.relation?.[0]?.id ?? null) as string | null,
    name: txt(pr["اسم الوصفة"]) || null,
    dose: num(pr["الجرعة (جم)"]),
    water_out: num(pr["المخرج (جم)"]),
    temp_c: num(pr["حرارة الماء (°م)"]),
    target: t === null ? null : String(notionTimeToSec(t)),
    grinder: txt(pr["الطاحونة "]) || null,
    grind: txt(pr["رقم الطحنة"]) || null,
    source_url: (page.url ?? null) as string | null,
  };
}

export function sniffMediaType(b: Uint8Array): string | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return "image/gif";
  return null;
}
