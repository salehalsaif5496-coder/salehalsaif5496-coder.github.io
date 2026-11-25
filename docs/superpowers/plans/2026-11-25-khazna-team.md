# الخزنة — تبويب «الفريق» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** تبويب «الفريق» داخل الخزنة: لوحة حالة الموظفين + بريد رسائلهم + إشعارات (ملخص 8 الليل وشكوى فورية).

**Architecture:** منطق نقي في `khazna/team-core.js` (UMD: متصفح + `node --test`). البيانات في مشروع Supabase **khazna** بجداول `team_*` مقفلة (RLS، بدون anon) يوصل لها التطبيق عبر edge function جديدة `khazna-team` تتحقق من `device_hash` الموجود في `khazna_devices` (نفس أسلوب `khazna-sync`). الإشعارات تمر من `khazna-tick` الحالية عبر طابور `team_push`. الجولة اليومية مهمة مجدولة لـ Claude تكتب في الجداول بصلاحية الخادم.

**Tech Stack:** HTML/CSS/JS بدون bundler · Supabase (Postgres+RLS, Edge Functions Deno, pg_cron, pg_net) · `npm:web-push@3.6.7`.

**Spec:** `docs/superpowers/specs/2026-11-25-khazna-team-design.md`

## Global Constraints
- مشروع الفريق: **khazna** (`lpsifrdiangpfcwhjeim`). كل الجداول بادئتها `team_`، RLS مفعّل و`revoke all from anon, authenticated`.
- مشروع الشكاوى: **rays-quality** (`tjfgoymcjwatlcwovlhf`)، جدول `complaints` (قراءة فقط من الجولة).
- التوقيت `Asia/Riyadh`. ملخص الفا يوصل **20:00**.
- الهوية: متغيرات الخزنة الحالية (`--bg:#040404`, `--ink:#ececec`, `--mute`, `--line`, `--card`, `--green:#9cc4a2`)، خط IBM Plex Sans Arabic، RTL. بدون ألوان جديدة إلا 🟢 من `--green`.
- نص الموظف تحت رؤساء الأقسام: سطر تعريف + المجمل فقط. الإدارة (الفا + راكان/ماجد/يزن/سلطان) تقدر تفصّل.
- أي نص من قاعدة البيانات يدخل الصفحة عبر `textContent` أو `esc()` — ممنوع innerHTML خام.
- لا مفاتيح خادم داخل `khazna/` (التحقق: `grep -R "service_role\|cron_secret\|team_secret" khazna/*.html khazna/*.js` فاضي).

## Review Focus
1. **جولة انقطعت بالنص:** موظف ظل `working=true` → التطبيق يعرضه ⚪ إذا آخر تحديث أقدم من 45 دقيقة. (Task 1)
2. **ما فيه شكاوى:** مشعل يرسل «صفر شكاوى اليوم» وما يطلع إشعار شكوى. (Task 6)
3. **جهاز غير مسجّل للإشعارات:** التبويب يفتح ويعرض «فعّل الإشعارات من الإعدادات» بدل ما ينكسر. (Task 5)
4. **إشعار مكرر:** نفس رسالة `team_push` ما تنرسل مرتين لو `khazna-tick` اشتغل مرتين. (Task 3)
5. **نص فيه رموز HTML في رسالة موظف:** يظهر كنص عادي. (Task 1 + 5)

---

### Task 1: المنطق النقي للفريق
**Files:** Create `khazna/team-core.js`, `khazna/test/team.test.js`
**Interfaces — Produces:**
- `Team.tree(members) -> {lead, depts:[{head, kids:[]}], orphans:[]}` (`member = {id,n,t,dept,boss,lead,paused,order}`)
- `Team.isWorking(status, now:Date) -> boolean` (`status={working, updated_at}`؛ false لو أقدم من 45 دقيقة)
- `Team.sortMail(mail) -> mail[]` الأحدث فوق، غير المقروء قبل المقروء بنفس اليوم؟ لا — الأحدث فوق فقط.
- `Team.unread(mail) -> number`
- `Team.esc(s) -> string`
- [ ] اختبارات: شجرة الـ 21 (الفا رأس، 4 أقسام، أبناء صحيحين)، موظف `boss` مفقود يروح `orphans`، `isWorking` بعد 46 دقيقة = false، `esc('<b>')` = `&lt;b&gt;`.
- [ ] `node --test khazna/test/*.test.js` → FAIL ثم نفّذ → PASS. Commit `feat(team): core logic`.

### Task 2: الجداول والبيانات
**Files:** Create `khazna/server/team.sql`
- `team_members(id text pk, n, t, d, dept, boss, lead bool, paused_until date, duty text, cadence text /*daily|every2|monthly|weekly|on_demand*/, ord int)`
- `team_status(member_id pk→team_members, working bool, doing text, updated_at timestamptz)`
- `team_mail(id uuid pk, member_id, subject, body, created_at, read_at)`
- `team_push(id uuid pk, title, body, url, send_at timestamptz, sent_at timestamptz)`
- [ ] طبّق الـ migration، وانقل الـ 21 موظف من لوحة الـ artifact (يزن وموظفينه `paused_until='2027-01-10'`).
- [ ] تحقق: `select count(*) from team_members` = 21؛ anon ما يقدر يقرأ (`set role anon; select * from team_mail` → خطأ صلاحية). Commit.

### Task 3: إرسال إشعارات الفريق من khazna-tick
**Files:** Modify `khazna/server/functions/khazna-tick/index.ts`
- [ ] كل تشغيل: `team_push` اللي `send_at<=now and sent_at is null` → يرسل لكل جهاز مسجّل، ثم `sent_at=now()` **قبل** الإرسال بتحديث شرطي (`update … where sent_at is null returning`) عشان ما يتكرر.
- [ ] اختبار: أدخل صف تجريبي، شغّل الدالة مرتين، تأكد وصل إشعار واحد و`sent_at` انكتب. Commit.

### Task 4: edge function `khazna-team`
**Files:** Create `khazna/server/functions/khazna-team/index.ts`
- أفعال (POST JSON + `device_hash`): `list` (members+status+mail آخر 30 يوم)، `read` (mail id)، `upsert_member`، `delete_member`.
- فعل `notify` بمفتاح `x-team-secret` (من `khazna_config.team_secret`) للاستدعاء من rays-quality.
- [ ] رفض أي `device_hash` غير موجود (403). اختبار curl للحالتين. Commit.

### Task 5: واجهة التبويب
**Files:** Modify `khazna/index.html` (زر `data-t="team"` في `nav.tabs`، أضف `team` لقائمة `go()`، تحميل `team-core.js`)
- صفحتين داخل التبويب: «اللوحة» و«البريد» (شارة غير المقروء على البريد).
- شيت إضافة/تعديل موظف بنفس `.sheet` الحالي.
- استخدم مهارة impeccable-design. [ ] تحقق بصري على 390px و 720px. Commit.

### Task 6: الشكوى الفورية
**Files:** Create `khazna/server/rays-complaint-hook.sql` (يطبّق على rays-quality)
- trigger `after insert on complaints` → `net.http_post` إلى `khazna-team` (`notify`) بالكود والفئة والفرع فقط (بدون رقم العميل).
- `notify` يكتب رسالة من مشعل في `team_mail` + صف `team_push` بـ `send_at=now()`.
- [ ] اختبار: إدخال شكوى تجريبية → إشعار خلال دقيقة، ثم حذفها. Commit.

### Task 7: الجولة اليومية
- مهمة مجدولة يوميًا ~19:40 الرياض: لكل موظف نشط وموعده اليوم → `working=true, doing=…` → ينفذ من مصدره → `team_mail` → `working=false`. الفا آخر واحد: ملخص + `team_push` بـ `send_at` = 20:00.
- [ ] تشغيل يدوي أول مرة ومراجعة البريد والإشعار مع صالح.

### Task 8: التسليم
- [ ] verification-before-completion: الاختبارات، الفحص البصري، grep المفاتيح. ثم رفع الملفات لمستودع الموقع (يحتاج صلاحية رفع).
