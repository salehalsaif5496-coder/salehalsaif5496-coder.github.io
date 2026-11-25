const test = require('node:test');
const assert = require('node:assert');
const Team = require('../team-core.js');

const M = [
  { id: 'badr', n: 'الفا', t: 'المنسّق العام', lead: true, ord: 1 },
  { id: 'rakan', n: 'راكان', t: 'رئيس قسم العمل', boss: 'badr', ord: 2 },
  { id: 'mishal', n: 'مشعل', t: 'مراقب الجودة اليومي', boss: 'rakan', ord: 6, tasks: ['يرصد الشكاوى'], rule: 'أي شكوى تترحّل لسعد فورًا', ref: 'تطبيق ريز' },
  { id: 'saad', n: 'سعد', t: 'مدير الشكاوى', boss: 'rakan', ord: 7 },
];
const att = M.filter((m) => ['rakan', 'mishal', 'saad'].includes(m.id));

test('pickResponders: named attendee only', () => {
  assert.deepStrictEqual(Team.pickResponders('وش رأيك يا مشعل؟', att).map((m) => m.id), ['mishal']);
});
test('pickResponders: several named, in attendee order', () => {
  assert.deepStrictEqual(Team.pickResponders('سعد ومشعل ردوا', att).map((m) => m.id), ['mishal', 'saad']);
});
test('pickResponders: nobody named → everyone (heads first by ord)', () => {
  assert.deepStrictEqual(Team.pickResponders('طيب كيف نقلل الشكاوى؟', att).map((m) => m.id), ['rakan', 'mishal', 'saad']);
});
test('pickResponders: name inside another word does not match', () => {
  assert.deepStrictEqual(Team.pickResponders('سعدنا بالنتيجة', att).map((m) => m.id), ['rakan', 'mishal', 'saad']);
});

test('isHead: lead and department heads', () => {
  assert.strictEqual(Team.isHead(M[0], M), true);
  assert.strictEqual(Team.isHead(M[1], M), true);
  assert.strictEqual(Team.isHead(M[2], M), false);
});

test('memberPrompt: employee gets short-answer rule and its reference', () => {
  const p = Team.memberPrompt(M[2], M, { topic: 'الشكاوى' }, att);
  assert.match(p, /مشعل/);
  assert.match(p, /أي شكوى تترحّل لسعد فورًا/);
  assert.match(p, /سطر/);
  assert.match(p, /راكان، مشعل، سعد/);
});
test('memberPrompt: head may detail', () => {
  const p = Team.memberPrompt(M[1], M, { topic: 'x' }, att);
  assert.match(p, /تفصّل/);
});

test('transcript: labels speakers', () => {
  const t = Team.transcript([{ member_id: null, from_name: 'صالح', body: 'هلا' }, { member_id: 'mishal', from_name: 'مشعل', body: 'هلا فيك' }]);
  assert.strictEqual(t, 'صالح: هلا\nمشعل: هلا فيك');
});

test('parseMinutes: JSON inside text, names mapped to ids, non-attendees dropped', () => {
  const raw = 'تفضل:\n```json\n{"summary":"نراجع الفروع","tasks":[{"who":"مشعل","task":"يراجع شكاوى الأسبوع","due":"الخميس"},{"who":"زياد","task":"x"},{"who":"saad","task":"يتصل بالعميل"}]}\n```';
  const r = Team.parseMinutes(raw, att);
  assert.strictEqual(r.summary, 'نراجع الفروع');
  assert.deepStrictEqual(r.tasks, [
    { member_id: 'mishal', task: 'يراجع شكاوى الأسبوع', due: 'الخميس' },
    { member_id: 'saad', task: 'يتصل بالعميل', due: '' },
  ]);
});
test('parseMinutes: garbage → null', () => {
  assert.strictEqual(Team.parseMinutes('ما فيه شي', att), null);
});

test('taskProgress', () => {
  assert.deepStrictEqual(Team.taskProgress([{ status: 'done' }, { status: 'open' }, { status: 'done' }]), { done: 2, total: 3 });
  assert.deepStrictEqual(Team.taskProgress([]), { done: 0, total: 0 });
});

test('transcript: marks attached images', () => {
  const t = Team.transcript([{ member_id: null, body: 'شوفوا هذي', images: ['a', 'b'] }, { member_id: null, body: '', images: ['c'] }, { member_id: 'saad', from_name: 'سعد', body: 'تمام' }]);
  assert.strictEqual(t, 'صالح: شوفوا هذي [أرفق صورتين]\nصالح:  [أرفق صورة]\nسعد: تمام');
});
test('recentImages: newest first-capped, kept in order', () => {
  const msgs = [{ urls: ['u1', 'u2'] }, { body: 'x' }, { urls: ['u3', 'u4', 'u5'] }];
  assert.deepStrictEqual(Team.recentImages(msgs, 4), ['u2', 'u3', 'u4', 'u5']);
  assert.deepStrictEqual(Team.recentImages([], 4), []);
});
test('memberPrompt: tells the member to look at attached images', () => {
  assert.match(Team.memberPrompt(M[2], M, { topic: 'x' }, att), /صور/);
});
