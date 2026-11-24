// deno test jojo/server/functions/jojo-tick/  (node:assert عشان jsr ممكن يكون محجوب)
import assert from "node:assert/strict";
import * as adhan from "npm:adhan@4.4.6";
import { dueReminders, inWindow, localDate, localNow, prayerTimes, reminderTime, waterTimes, type DueInput } from "./due.ts";

const TUE = "2026-11-24"; // الثلاثاء = 2
const base = (o: Partial<DueInput> = {}): DueInput => ({
  date: TUE,
  nowMin: 0,
  settings: { sleepAt: "23:00", wakeAt: "06:30", waterGoal: 8, vitamins: ["د"], gymDays: [2], reminders: {} },
  tasks: [],
  checks: {},
  prayers: null,
  messages: [],
  sent: new Set(),
  ...o,
});
const m = (hm: string) => +hm.slice(0, 2) * 60 + +hm.slice(3);
const keys = (i: DueInput) => dueReminders(i).map((d) => d.key).sort();

Deno.test("inWindow edges: on time, 14 min late, 15 min late, 1 min early", () => {
  assert.equal(inWindow("07:30", m("07:30")), true);
  assert.equal(inWindow("07:30", m("07:44")), true);
  assert.equal(inWindow("07:30", m("07:45")), false);
  assert.equal(inWindow("07:30", m("07:29")), false);
  assert.equal(inWindow(null, m("07:30")), false);
  assert.equal(inWindow("7:30", m("07:30")), false);
});

Deno.test("task fires only on its days, at its time", () => {
  const tasks = [
    { id: "a", title: "مذاكرة", days: [2], remind_at: "16:00" },        // الثلاثاء
    { id: "b", title: "ترتيب", days: [5], remind_at: "16:00" },         // الجمعة → لا
    { id: "c", title: "قراءة", days: null, remind_at: "16:00" },        // كل يوم
    { id: "d", title: "رسم", days: [], remind_at: "16:00" },            // فاضي = كل يوم
    { id: "e", title: "بدون وقت", days: null, remind_at: null },        // بدون تذكير
  ];
  assert.deepEqual(keys(base({ tasks, nowMin: m("16:05") })), ["task:a@16:00", "task:c@16:00", "task:d@16:00"]);
  assert.deepEqual(keys(base({ tasks, nowMin: m("15:59") })), []);
  assert.deepEqual(keys(base({ tasks, nowMin: m("16:15") })), []);
  // نفس المهام يوم الجمعة
  assert.deepEqual(keys(base({ tasks, date: "2026-11-27", nowMin: m("16:00") })), ["task:b@16:00", "task:c@16:00", "task:d@16:00"]);
  const d = dueReminders(base({ tasks: [tasks[0]], nowMin: m("16:00") }))[0];
  assert.equal(d.url, "/jojo/#today");
  assert.match(d.title, /مذاكرة/);
});

Deno.test("already-checked items are skipped", () => {
  const tasks = [{ id: "a", title: "x", days: null, remind_at: "16:00" }];
  assert.deepEqual(keys(base({ tasks, nowMin: m("16:00"), checks: { "task:a": true } })), []);
  assert.deepEqual(keys(base({ tasks, nowMin: m("16:00"), checks: { "task:a": false } })), ["task:a@16:00"]);
  assert.deepEqual(keys(base({ nowMin: m("23:00"), checks: { sleep: true } })), []);
  assert.deepEqual(keys(base({ nowMin: m("06:30"), checks: { wake: true } })), []);
  const prayers = { fajr: "04:58", dhuhr: "11:40", asr: "14:40", maghrib: "17:05", isha: "18:35" };
  assert.deepEqual(keys(base({ prayers, nowMin: m("17:05"), checks: { "prayer:maghrib": true } })), []);
  const s = { ...base().settings, reminders: { vitamins: "09:00" } };
  assert.deepEqual(keys(base({ settings: s, nowMin: m("09:00"), checks: { vitamins: true } })), []);
  assert.deepEqual(keys(base({ settings: s, nowMin: m("09:00") })), ["vitamins@09:00"]);
});

Deno.test("sleep/wake default to sleepAt/wakeAt, can move or switch off", () => {
  assert.deepEqual(keys(base({ nowMin: m("23:00") })), ["sleep@23:00"]);
  assert.deepEqual(keys(base({ nowMin: m("06:30") })), ["wake@06:30"]);
  const r = (reminders: Record<string, unknown>) => ({ ...base().settings, reminders });
  assert.deepEqual(keys(base({ settings: r({ sleep: false }), nowMin: m("23:00") })), []);
  assert.deepEqual(keys(base({ settings: r({ sleep: "22:30" }), nowMin: m("22:31") })), ["sleep@22:30"]);
  assert.deepEqual(keys(base({ settings: r({ sleep: "22:30" }), nowMin: m("23:00") })), []);
  assert.equal(reminderTime({}, "vitamins"), null);
  assert.equal(reminderTime({ vitamins: "" }, "vitamins"), null);
  assert.equal(reminderTime({ wake: true }, "wake", "06:30"), "06:30");
});

Deno.test("gym only on gym days; meals only when set", () => {
  const s = { ...base().settings, reminders: { gym: "17:30", breakfast: "07:00", lunch: false } };
  assert.deepEqual(keys(base({ settings: s, nowMin: m("17:30") })), ["gym@17:30"]);
  assert.deepEqual(keys(base({ settings: s, date: "2026-11-25", nowMin: m("17:30") })), []); // الأربعاء
  assert.deepEqual(keys(base({ settings: s, nowMin: m("07:00") })), ["meal:breakfast@07:00"]);
  assert.deepEqual(keys(base({ settings: s, nowMin: m("07:00"), checks: { "meal:breakfast": true } })), []);
});

Deno.test("water: every 3h after waking, before sleep, only while under goal", () => {
  assert.deepEqual(waterTimes("06:30", "23:00"), ["09:30", "12:30", "15:30", "18:30", "21:30"]);
  assert.deepEqual(waterTimes("08:00", "17:00"), ["11:00", "14:00"]);          // 17:00 = النوم → لا
  assert.deepEqual(waterTimes("10:00", "01:00"), ["13:00", "16:00", "19:00", "22:00"]); // نوم بعد نص الليل
  assert.deepEqual(waterTimes(null, "23:00"), []);
  assert.deepEqual(keys(base({ nowMin: m("12:30"), checks: { water: 3 } })), ["water@12:30"]);
  assert.match(dueReminders(base({ nowMin: m("12:30"), checks: { water: 3 } }))[0].body, /5 أكواب/);
  assert.deepEqual(keys(base({ nowMin: m("12:30"), checks: { water: 8 } })), []);
  assert.deepEqual(keys(base({ nowMin: m("12:00"), checks: { water: 3 } })), []);
  const off = { ...base().settings, reminders: { water: false } };
  assert.deepEqual(keys(base({ settings: off, nowMin: m("12:30") })), []);
  assert.deepEqual(keys(base({ settings: { ...base().settings, waterGoal: 0 }, nowMin: m("12:30") })), []);
});

Deno.test("prayer times present (Umm al-Qura, Riyadh) and adhan reminders fire", () => {
  const p = prayerTimes(adhan, TUE, 24.7136, 46.6753, "Asia/Riyadh");
  for (const k of ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const) assert.match(p[k], /^\d\d:\d\d$/);
  assert.ok(p.fajr >= "04:50" && p.fajr <= "05:05", "fajr " + p.fajr);
  assert.ok(p.maghrib >= "17:00" && p.maghrib <= "17:15", "maghrib " + p.maghrib);
  assert.ok(p.fajr < p.dhuhr && p.dhuhr < p.asr && p.asr < p.maghrib && p.maghrib < p.isha);
  const d = dueReminders(base({ prayers: p, nowMin: m(p.maghrib) }));
  assert.deepEqual(d.map((x) => x.key), ["prayer:maghrib"]);
  assert.match(d[0].title, /المغرب/);
  const off = { ...base().settings, reminders: { prayers: false } };
  assert.deepEqual(keys(base({ settings: off, prayers: p, nowMin: m(p.maghrib) })), []);
});

Deno.test("Saleh's daily message: today's immediately, pre-written at wake, once, not when seen", () => {
  const now = { id: "m1", for_date: TUE, created_date: TUE, seen_at: null };
  const pre = { id: "m2", for_date: TUE, created_date: "2026-11-23", seen_at: null };
  assert.deepEqual(keys(base({ messages: [now], nowMin: m("03:00") })), ["msg:m1"]);
  assert.deepEqual(keys(base({ messages: [pre], nowMin: m("03:00") })), []);
  assert.deepEqual(keys(base({ messages: [pre], nowMin: m("06:30") })), ["msg:m2", "wake@06:30"]);
  assert.deepEqual(keys(base({ messages: [pre], nowMin: m("14:00") })), ["msg:m2"]); // فاتها الصبح → توصل بعدين
  assert.deepEqual(keys(base({ messages: [{ ...now, seen_at: "2026-11-24T05:00:00Z" }], nowMin: m("10:00") })), []);
  assert.deepEqual(keys(base({ messages: [{ ...now, for_date: "2026-11-25" }], nowMin: m("10:00") })), []);
  assert.deepEqual(keys(base({ messages: [now], nowMin: m("10:00"), sent: new Set(["msg:m1"]) })), []);
  const off = { ...base().settings, reminders: { message: false } };
  assert.deepEqual(keys(base({ settings: off, messages: [now], nowMin: m("10:00") })), []);
});

Deno.test("dedupe keys are stable across ticks and skip what was sent", () => {
  const tasks = [{ id: "a", title: "x", days: null, remind_at: "16:00" }];
  const i1 = base({ tasks, nowMin: m("16:00"), checks: { water: 1 } });
  const i2 = base({ tasks, nowMin: m("16:07"), checks: { water: 1 } });
  assert.deepEqual(keys(i1), keys(i2));
  assert.deepEqual(keys(i1), ["task:a@16:00"]);
  assert.deepEqual(keys(base({ tasks, nowMin: m("16:07"), sent: ["task:a@16:00"] })), []);
  // نقلت وقتها → مفتاح جديد، يوصل مرة ثانية بالوقت الجديد
  assert.deepEqual(keys(base({ tasks: [{ ...tasks[0], remind_at: "16:30" }], nowMin: m("16:30"), sent: ["task:a@16:00"] })), ["task:a@16:30"]);
  // كل مفتاح فريد وكل tag صالح
  const p = prayerTimes(adhan, TUE, 24.7136, 46.6753);
  const all = dueReminders(base({ tasks, prayers: p, nowMin: m("16:00") }));
  assert.equal(new Set(all.map((x) => x.key)).size, all.length);
  for (const x of all) assert.match(x.tag, /^jojo-[a-z0-9:_@-]+$/i);
});

Deno.test("localNow / localDate in Riyadh", () => {
  const at = new Date("2026-11-24T21:30:00Z"); // 00:30 الأربعاء بالرياض
  assert.deepEqual(localNow("Asia/Riyadh", at), { date: "2026-11-25", min: 30 });
  assert.deepEqual(localNow("Not/AZone", at), { date: "2026-11-25", min: 30 });
  assert.equal(localDate("2026-11-24T20:59:00Z", "Asia/Riyadh"), "2026-11-24");
});
