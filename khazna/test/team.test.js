const test = require('node:test');
const assert = require('node:assert');
const Team = require('../team-core.js');

const M = [
  { id: 'badr', n: 'الفا', lead: true, ord: 1 },
  { id: 'rakan', n: 'راكان', boss: 'badr', dept: 'قسم العمل', ord: 2 },
  { id: 'yazan', n: 'يزن', boss: 'badr', dept: 'قسم الجامعة', ord: 4, paused_until: '2027-01-10' },
  { id: 'majed', n: 'ماجد', boss: 'badr', ord: 3 },
  { id: 'saad', n: 'سعد', boss: 'rakan', ord: 7 },
  { id: 'mishal', n: 'مشعل', boss: 'rakan', ord: 6 },
  { id: 'lost', n: 'تايه', boss: 'nobody', ord: 9 },
];

test('tree: lead, heads in order, kids in order, orphans', () => {
  const t = Team.tree(M);
  assert.strictEqual(t.lead.id, 'badr');
  assert.deepStrictEqual(t.depts.map((d) => d.head.id), ['rakan', 'majed', 'yazan']);
  assert.deepStrictEqual(t.depts[0].kids.map((k) => k.id), ['mishal', 'saad']);
  assert.deepStrictEqual(t.orphans.map((o) => o.id), ['lost']);
});

test('paused: dept paused before date, active on/after', () => {
  const y = M.find((m) => m.id === 'yazan');
  assert.strictEqual(Team.isPaused(y, '2026-11-25'), true);
  assert.strictEqual(Team.isPaused(y, '2027-01-10'), false);
  assert.strictEqual(Team.isPaused(M[1], '2026-11-25'), false);
});

test('isWorking: stale after 45 minutes', () => {
  const now = new Date('2026-11-25T17:00:00Z');
  assert.strictEqual(Team.isWorking({ working: true, updated_at: '2026-11-25T16:30:00Z' }, now), true);
  assert.strictEqual(Team.isWorking({ working: true, updated_at: '2026-11-25T16:14:00Z' }, now), false);
  assert.strictEqual(Team.isWorking({ working: false, updated_at: '2026-11-25T16:59:00Z' }, now), false);
  assert.strictEqual(Team.isWorking(null, now), false);
});

test('mail: newest first, unread count', () => {
  const mail = [
    { id: 'a', created_at: '2026-11-24T17:00:00Z', read_at: '2026-11-24T18:00:00Z' },
    { id: 'b', created_at: '2026-11-25T17:00:00Z', read_at: null },
    { id: 'c', created_at: '2026-11-25T16:00:00Z' },
  ];
  assert.deepStrictEqual(Team.sortMail(mail).map((m) => m.id), ['b', 'c', 'a']);
  assert.strictEqual(Team.unread(mail), 2);
  assert.strictEqual(Team.unread([]), 0);
});

test('esc: html is shown as text', () => {
  assert.strictEqual(Team.esc('<b>"x"&\''), '&lt;b&gt;&quot;x&quot;&amp;&#39;');
  assert.strictEqual(Team.esc(null), '');
});

test('ago: Arabic relative time', () => {
  const now = new Date('2026-11-25T17:00:00Z');
  assert.strictEqual(Team.ago('2026-11-25T16:59:30Z', now), 'الحين');
  assert.strictEqual(Team.ago('2026-11-25T16:20:00Z', now), 'قبل 40 دقيقة');
  assert.strictEqual(Team.ago('2026-11-25T14:00:00Z', now), 'قبل 3 ساعات');
  assert.strictEqual(Team.ago('2026-11-23T17:00:00Z', now), 'قبل 2 أيام');
  assert.strictEqual(Team.ago(null, now), 'ما اشتغل للحين');
});
