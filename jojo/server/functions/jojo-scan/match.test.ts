import { deepStrictEqual as assertEquals } from "node:assert";
import { matchRaysProduct, mapNotionRecipe, normalize, notionTimeToSec, parseClaudeJson } from "./match.ts";

const products = [
  { notion_id: "p1", name: "إثيوبيا قوجي", aliases: ["Guji"] },
  { notion_id: "p2", name: "كولومبيا سوبريمو", aliases: [] },
];

Deno.test("notionTimeToSec: min.sec format", () => {
  assertEquals(notionTimeToSec("2.3"), 150);
  assertEquals(notionTimeToSec("3.15"), 195);
  assertEquals(notionTimeToSec("2"), 120);
  assertEquals(notionTimeToSec(2.3), 150);
  assertEquals(notionTimeToSec(3.15), 195);
});

Deno.test("normalize: arabic + latin", () => {
  assertEquals(normalize("إِثْيُوبْيَا  قُوجِي"), "اثيوبيا قوجي");
  assertEquals(normalize("مَحمصة ريز"), "محمصه ريز");
  assertEquals(normalize("  Rays — Ethiopia, GUJI! "), "rays ethiopia guji");
  assertEquals(normalize("على"), "علي");
});

Deno.test("match: Rays + alias Guji", () => {
  assertEquals(matchRaysProduct({ roaster: "Rays", name: "Ethiopia Guji" }, products), "p1");
  assertEquals(matchRaysProduct({ roaster: "Rays — Coffee Roastery", name: "Ethiopia Guji" }, products), "p1");
  assertEquals(matchRaysProduct({ roaster: "محمصة ريز", name: "إثيوبيا قوجي" }, products), "p1");
  assertEquals(matchRaysProduct({ roaster: "Rays", name: "Rays — Ethiopia Guji" }, products), "p1");
});

Deno.test("match: other roaster -> null", () => {
  assertEquals(matchRaysProduct({ roaster: "Blue Bottle", name: "Ethiopia Guji" }, products), null);
  assertEquals(matchRaysProduct({ roaster: null, name: "Ethiopia Guji" }, products), null);
});

Deno.test("match: Rays but unknown product -> null", () => {
  assertEquals(matchRaysProduct({ roaster: "Rays", name: "Brazil Santos" }, products), null);
});

Deno.test("parseClaudeJson: defensive", () => {
  assertEquals(parseClaudeJson('```json\n{"roaster":"X","is_coffee_bag":true}\n```'), { roaster: "X", is_coffee_bag: true });
  assertEquals(parseClaudeJson('Here: {"a":1} done'), { a: 1 });
  assertEquals(parseClaudeJson("no json"), null);
  assertEquals(parseClaudeJson("{broken"), null);
});

Deno.test("mapNotionRecipe", () => {
  const t = (s: string) => ({ type: "rich_text", rich_text: [{ plain_text: s }] });
  const page = {
    id: "r1", url: "https://app.notion.com/p/r1",
    properties: {
      "اسم الوصفة": { type: "title", title: [{ plain_text: "قوجي V60" }] },
      "الحالة": { type: "select", select: { name: "معتمدة" } },
      "طريقة التحضير": { type: "select", select: { name: "V60" } },
      "الجرعة (جم)": { type: "number", number: 15 },
      "المخرج (جم)": { type: "number", number: 250 },
      "حرارة الماء (°م)": { type: "number", number: 93 },
      "الوقت المستهدف ": { type: "number", number: 2.3 },
      "الطاحونة ": t("Comandante"),
      "رقم الطحنة": t("24"),
      "المنتج": { type: "relation", relation: [{ id: "p1" }] },
    },
  };
  assertEquals(mapNotionRecipe(page), {
    notion_id: "r1", product_notion_id: "p1", name: "قوجي V60", dose: 15, water_out: 250, temp_c: 93,
    target: "150", grinder: "Comandante", grind: "24", source_url: "https://app.notion.com/p/r1",
  });
  const other = structuredClone(page);
  other.properties["طريقة التحضير"].select!.name = "Espresso";
  assertEquals(mapNotionRecipe(other), null);
});
