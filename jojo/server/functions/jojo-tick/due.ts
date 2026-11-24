// جوجو — حساب التنبيهات اللي جا وقتها (منطق صافي بدون شبكة ولا قاعدة بيانات).
// index.ts يجمع البيانات ويرسل؛ هنا بس: "وش لازم يوصلها الحين؟"
//
// إعدادات التنبيهات: jojo_profiles.settings.reminders
//   sleep, wake ........ undefined/true/null/'' = بوقت النوم/الصحيان نفسه · 'HH:MM' = وقت ثاني · false = مقفل
//   vitamins, gym,
//   breakfast, lunch,
//   dinner ............. 'HH:MM' = شغّال بهالوقت · غير كذا = مقفل (النادي بأيامه بس)
//   water, prayers,
//   message ............ شغّال إلا لو false
// مهامها: jojo_tasks.remind_at 'HH:MM' + days (null/فاضي = كل يوم، 0 = الأحد).

export const WINDOW_MIN = 15; // لو تأخر التشغيل، نرسل اللي فاته خلال آخر ربع ساعة (نفس الخزنة)
export const WATER_EVERY_MIN = 180;
export const APP = "/jojo/";

export type HM = string; // 'HH:MM'
export interface Task { id: string; title: string; days?: number[] | null; remind_at?: string | null }
export interface Message { id: string; for_date: string | null; created_date: string; seen_at?: string | null }
export type Prayers = Record<"fajr" | "dhuhr" | "asr" | "maghrib" | "isha", HM>;
export interface DueInput {
  date: string;          // اليوم بتوقيتها 'YYYY-MM-DD'
  nowMin: number;        // الدقيقة من بداية اليوم بتوقيتها
  settings: Record<string, any>;
  tasks: Task[];
  checks: Record<string, unknown>;
  prayers?: Prayers | null;
  messages?: Message[];
  sent?: Set<string> | string[]; // مفاتيح انرسلت اليوم (jojo_push_log)
}
export interface Due { key: string; title: string; body: string; url: string; tag: string }

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHM = (v: unknown): v is HM => typeof v === "string" && HM_RE.test(v);
export const toMin = (t: HM) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const fromMin = (m: number): HM => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export const weekday = (dateISO: string) => new Date(dateISO + "T12:00:00Z").getUTCDay();

/** صار وقته وما فات عليه أكثر من النافذة: t <= now < t + WINDOW */
export function inWindow(t: HM | null | undefined, nowMin: number, win = WINDOW_MIN): boolean {
  if (!isHM(t)) return false;
  const d = nowMin - toMin(t);
  return d >= 0 && d < win;
}

/** وقت تنبيه بند أساسي من الإعدادات (null = مقفل) */
export function reminderTime(rem: Record<string, unknown> | undefined, key: string, fallback?: HM | null): HM | null {
  const v = (rem || {})[key];
  if (v === false || v === "off") return null;
  if (isHM(v)) return v;
  if (fallback !== undefined && (v === undefined || v === null || v === true || v === "")) return isHM(fallback) ? fallback : null;
  return null;
}
export const flagOn = (rem: Record<string, unknown> | undefined, key: string) => (rem || {})[key] !== false;

/** أوقات تذكير الماء: كل ٣ ساعات بعد الصحيان، وقبل النوم (لو النوم بعد نص الليل، لين نهاية اليوم) */
export function waterTimes(wakeAt: unknown, sleepAt: unknown): HM[] {
  if (!isHM(wakeAt)) return [];
  const w = toMin(wakeAt);
  let s = isHM(sleepAt) ? toMin(sleepAt) : 24 * 60;
  if (s <= w) s += 24 * 60;
  const out: HM[] = [];
  for (let t = w + WATER_EVERY_MIN; t < s && t < 24 * 60; t += WATER_EVERY_MIN) out.push(fromMin(t));
  return out;
}

const PRAYER_AR: [keyof Prayers, string][] = [["fajr", "الفجر"], ["dhuhr", "الظهر"], ["asr", "العصر"], ["maghrib", "المغرب"], ["isha", "العشاء"]];
const MEAL_AR: [string, string, string][] = [["breakfast", "الفطور", "🥐"], ["lunch", "الغداء", "🍲"], ["dinner", "العشاء", "🥗"]];

function cups(n: number) {
  if (n === 1) return "كوب واحد";
  if (n === 2) return "كوبين";
  if (n >= 3 && n <= 10) return n + " أكواب";
  return n + " كوب";
}

/** كل التنبيهات اللي جا وقتها الحين وما انرسلت اليوم وما تأشرت */
export function dueReminders(inp: DueInput): Due[] {
  const s = inp.settings || {};
  const rem = (s.reminders || {}) as Record<string, unknown>;
  const c = inp.checks || {};
  const sent = inp.sent instanceof Set ? inp.sent : new Set(inp.sent || []);
  const wd = weekday(inp.date);
  const now = inp.nowMin;
  const out: Due[] = [];
  const done = (k: string) => c[k] === true;
  const add = (key: string, title: string, body: string, hash = "#today") => {
    if (sent.has(key)) return;
    out.push({ key, title, body, url: APP + hash, tag: "jojo-" + key.replace(/[^a-z0-9:_@-]/gi, "") });
  };

  // مهامها: كل مهمة بوقتها وأيامها
  for (const t of inp.tasks || []) {
    if (!isHM(t.remind_at)) continue;
    if (t.days && t.days.length && !t.days.includes(wd)) continue;
    if (done("task:" + t.id) || !inWindow(t.remind_at, now)) continue;
    add("task:" + t.id + "@" + t.remind_at, "🎀 " + String(t.title || "مهمتك").slice(0, 80), "جا وقتها يا جوجو، تقدرين عليها 🐱");
  }

  // الأذان (أم القرى بإحداثيات مدينتها)
  if (flagOn(rem, "prayers") && inp.prayers) {
    for (const [k, ar] of PRAYER_AR) {
      const at = inp.prayers[k];
      if (done("prayer:" + k) || !inWindow(at, now)) continue;
      add("prayer:" + k, "🕌 أذان " + ar, "حان وقت صلاة " + ar + " يا جوجو 🤍");
    }
  }

  // النوم والصحيان
  const sleepAt = reminderTime(rem, "sleep", s.sleepAt ?? null);
  if (sleepAt && !done("sleep") && inWindow(sleepAt, now)) {
    add("sleep@" + sleepAt, "🌙 وقت النوم يا جوجو", "حطي الجوال على جنب ونامي بوقتك، بكرة يومك أحلى 🎀");
  }
  const wakeAt = reminderTime(rem, "wake", s.wakeAt ?? null);
  if (wakeAt && !done("wake") && inWindow(wakeAt, now)) {
    add("wake@" + wakeAt, "☀️ صباح الورد يا جوجو", "قومي يا حلوة، يومك يستناك والقطوة صاحية قبلك 🐱");
  }

  // الفيتامينات (لو عندها فيتامينات)
  const vitAt = reminderTime(rem, "vitamins");
  if (vitAt && Array.isArray(s.vitamins) && s.vitamins.length && !done("vitamins") && inWindow(vitAt, now)) {
    add("vitamins@" + vitAt, "💊 فيتاميناتك يا جوجو", "لا تنسين " + s.vitamins.slice(0, 4).join("، ") + " 🎀");
  }

  // النادي بأيامه بس
  const gymAt = reminderTime(rem, "gym");
  if (gymAt && Array.isArray(s.gymDays) && s.gymDays.includes(wd) && !done("gym") && inWindow(gymAt, now)) {
    add("gym@" + gymAt, "💪 اليوم يوم نادي", "جهزي شنطتك يا بطلة، القطوة تشجعك 🐱");
  }

  // الوجبات
  for (const [k, ar, em] of MEAL_AR) {
    const at = reminderTime(rem, k);
    if (!at || done("meal:" + k) || !inWindow(at, now)) continue;
    add("meal:" + k + "@" + at, em + " وقت " + ar, "لا يفوتك " + ar + " يا جوجو، صحتك أهم 🎀");
  }

  // الماء: كل ٣ ساعات بين الصحيان والنوم، لو ما وصلت هدفها
  const goal = +s.waterGoal || 0;
  const w = typeof c.water === "number" ? c.water : 0;
  if (flagOn(rem, "water") && goal > 0 && w < goal) {
    for (const at of waterTimes(s.wakeAt, s.sleepAt)) {
      if (!inWindow(at, now)) continue;
      add("water@" + at, "💧 اشربي مويتك يا جوجو", "باقي لك " + cups(goal - w) + " وتوصلين هدفك 🐱");
    }
  }

  // رسالة صالح الجديدة لليوم: المكتوبة اليوم توصل على طول؛ المكتوبة من قبل توصل وقت صحيانها
  if (flagOn(rem, "message")) {
    const from = isHM(s.wakeAt) ? toMin(s.wakeAt) : 8 * 60;
    for (const m of inp.messages || []) {
      if (m.seen_at || (m.for_date && m.for_date !== inp.date)) continue;
      if (m.created_date < inp.date && now < from) continue;
      add("msg:" + m.id, "💌 رسالة من صالح", "كتب لك صالح رسالة اليوم، افتحيها يا جوجو 🎀");
    }
  }
  return out;
}

/** أوقات الأذان بطريقة أم القرى (نفس jojo/core.js prayerTimes)؛ المكتبة تنمرر عشان يبقى الملف صافي */
// deno-lint-ignore no-explicit-any
export function prayerTimes(adhan: any, dateISO: string, lat: number, lng: number, tz = "Asia/Riyadh"): Prayers {
  const [y, mo, d] = dateISO.split("-").map(Number);
  const pt = new adhan.PrayerTimes(new adhan.Coordinates(lat, lng), new Date(y, mo - 1, d), adhan.CalculationMethod.UmmAlQura());
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const f = (x: Date) => {
    const o: Record<string, string> = {};
    fmt.formatToParts(x).forEach((p) => (o[p.type] = p.value));
    return o.hour + ":" + o.minute;
  };
  return { fajr: f(pt.fajr), dhuhr: f(pt.dhuhr), asr: f(pt.asr), maghrib: f(pt.maghrib), isha: f(pt.isha) };
}

/** التاريخ والدقيقة الحين بتوقيتها */
export function localNow(tz: string, at = new Date()): { date: string; min: number } {
  let p: Record<string, string>;
  try {
    p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at).map((x) => [x.type, x.value]));
  } catch {
    return localNow("Asia/Riyadh", at);
  }
  return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
}
export function localDate(ts: string | Date, tz: string): string {
  return localNow(tz, new Date(ts)).date;
}
