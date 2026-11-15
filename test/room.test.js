import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../src/room.js';
import { Matchmaker } from '../src/match.js';
import { createSim } from '../src/sim.js';

const VER = createSim().VER;
const sock = () => { const s = { sent: [], closed: false, send(m) { s.sent.push(JSON.parse(m)); }, close() { s.closed = true; }, buffered: () => 0 }; return s; };
const of = (s, t) => s.sent.filter(m => m.t === t);
const last = (s, t) => of(s, t).at(-1);
const join = (room, s, k, extra) => room.message(s, JSON.stringify({ t: 'j', k, v: VER, y: 'slash', ...extra }));
const ready = (room, s, extra) => room.message(s, JSON.stringify({ t: 'r', y: 'shoot', ...extra }));
const ping = (room, s) => room.message(s, JSON.stringify({ t: 'p', c: Date.now(), r: 50 }));
function timers(t) { mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] }); t.after(() => mock.timers.reset()); }
// 讓時間前進，期間兩支手機照常每秒送 ping（alive 可指定只有誰還活著）
function run(room, ms, alive) { for (let t = 0; t < ms; t += 16) { mock.timers.tick(16); if (t % 496 === 0) for (const s of alive) if (!s.closed) ping(room, s); } }
function start(room) {
  const a = sock(), b = sock();
  join(room, a, 'token-aaaa', { n: '阿明', w: 7 }); join(room, b, 'token-bbbb', { n: '<b>小華</b>', w: 21 });
  ready(room, a); ready(room, b);
  return { a, b };
}

test('版本不同的手機進不了房，會被告知伺服器版本', () => {
  const room = new Room(), s = sock();
  room.message(s, JSON.stringify({ t: 'j', k: 'token-aaaa', v: VER - 1 }));
  assert.deepEqual(s.sent, [{ t: 'ver', v: VER }]);
  assert.equal(room.count(), 0);
});

test('亂七八糟的訊息不會讓房間壞掉', t => {
  timers(t);
  const room = new Room(), s = sock();
  for (const raw of ['null', '42', '"x"', '{', '[]', '{"t":"j"}', '{"t":"j","v":' + VER + '}', '{"t":"j","v":' + VER + ',"k":5}', '{"t":"i"}', '{"t":"r"}']) room.message(s, raw);
  assert.equal(room.count(), 0);
  const { a } = start(room);
  for (const raw of ['{"t":"i"}', '{"t":"i","s":"x","pn":-5,"x":"9"}', '{"t":"i","s":1,"pn":1e99,"x":5,"z":5,"m":9}', '{"t":"p"}', '{"t":"p","c":{"a":1}}', '{"t":"zzz"}']) room.message(a, raw);
  run(room, 1000, []);
  assert.ok(room.timer, '比賽還在跑');
});

test('兩人準備好就開賽：房主決定比賽長度、名字會被清理', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  const ga = last(a, 'go'), gb = last(b, 'go');
  assert.equal(ga.seat, 0); assert.equal(gb.seat, 1);
  assert.equal(ga.w, 7, '用房主選的 7 分制');
  assert.deepEqual(ga.names, ['阿明', 'b小華/b'], '名字裡的標籤符號被拿掉');
  assert.equal(last(b, 'lobby').pn, '阿明');
  run(room, 1000, [a, b]);
  const s = of(a, 's');
  assert.ok(s.length >= 20 && s.length <= 40, `一秒約 25 份快照，實際 ${s.length}`);
  assert.ok(s[0].f && s[0].st, '第一份是完整快照');
  assert.equal(room.sim.G.win, 7);
});

test('打完會送出結果與勝方，再按一次就在同一間房重賽', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 500, [a, b]);
  const G = room.sim.G; G.score = [3, 8]; G.phase = 'dead'; G.pt = .01; G.next = 0;
  run(room, 500, [a, b]);
  const over = last(a, 'over');
  assert.deepEqual(over.score, [3, 8]); assert.equal(over.win, 1); assert.equal(over.why, undefined);
  assert.ok(over.stats.fga, '結果帶著雙方統計');
  assert.equal(room.timer, null);
  ready(room, a); ready(room, b);
  assert.equal(of(a, 'go').length, 2);
  assert.ok(room.timer);
});

test('比賽中斷線：暫停並通知對手，回來後從檢查球繼續', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 2500, [a, b]);
  assert.equal(room.sim.G.phase, 'play');
  room.sim.INP[1].mag = 1; room.sim.INP[1].b = true;
  room.close(b);
  assert.equal(last(a, 'wait').s, 45);
  assert.equal(room.sim.INP[1].mag, 0, '斷線的人不再繼續跑'); assert.equal(room.sim.INP[1].b, false);
  const t0 = room.sim.G.t; run(room, 3000, [a]);
  assert.equal(room.sim.G.t, t0, '暫停時比賽時間不動');
  const b2 = sock(); join(room, b2, 'token-bbbb');
  assert.equal(last(b2, 'go').resume, true); assert.equal(last(b2, 'go').seat, 1);
  assert.equal(last(a, 'back').c, 1); assert.equal(last(b2, 'back').c, 1);
  assert.equal(room.sim.G.phase, 'check', '重新檢查球');
  run(room, 200, [a, b2]);
  assert.ok(of(b2, 's')[0].f, '重連後第一份是完整快照');
});

test('瞬斷（一兩秒內接回）：原地繼續，不重置球權', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 2500, [a, b]);
  assert.equal(room.sim.G.phase, 'play');
  room.close(b);
  run(room, 600, [a]);
  const b2 = sock(); join(room, b2, 'token-bbbb');
  assert.equal(room.paused, false);
  assert.equal(room.sim.G.phase, 'play', '不重新檢查球');
  assert.equal(last(a, 'back').c, undefined);
  run(room, 200, [a, b2]);
  assert.ok(of(b2, 's')[0].f);
});

test('斷線超過 45 秒：留下來的人獲勝', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 1000, [a, b]);
  room.close(a);
  run(room, 44000, [b]);
  assert.equal(last(b, 'over'), undefined);
  run(room, 2000, [b]);
  const over = last(b, 'over');
  assert.equal(over.why, 'left'); assert.equal(over.win, 1);
  assert.equal(room.timer, null); assert.equal(room.seats[0], null);
  assert.equal(last(b, 'lobby').n, 1);
});

test('兩個人都斷線 45 秒：房間自己收掉', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 1000, [a, b]);
  room.close(a); room.close(b);
  run(room, 47000, []);
  assert.equal(room.timer, null); assert.equal(room.house, null);
  assert.deepEqual(room.seats, [null, null]);
});

test('按離開比賽：立刻判對手獲勝', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 1000, [a, b]);
  room.message(b, '{"t":"bye"}');
  const over = last(a, 'over');
  assert.equal(over.why, 'quit'); assert.equal(over.win, 0);
  assert.ok(b.closed); assert.equal(last(b, 'over'), undefined);
  assert.equal(room.timer, null);
});

test('連線沒斷但 4 秒沒消息（殭屍連線）：當作斷線，並放開他的按鍵', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 1500, [a, b]);
  run(room, 5200, [a]); // b 不再送任何東西
  assert.ok(b.closed, '殭屍連線被關掉');
  assert.ok(last(a, 'wait'));
  assert.equal(room.paused, true);
});

test('同一支手機換新連線：舊連線被關掉並收到通知，比賽不中斷', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 1500, [a, b]);
  const a2 = sock(); join(room, a2, 'token-aaaa');
  assert.ok(a.closed); assert.ok(last(a, 'dup'));
  assert.equal(room.paused, false);
  room.close(a); // 舊連線事後才觸發的 close 不該影響新連線
  assert.equal(room.paused, false); assert.equal(room.count(), 2);
  assert.notEqual(room.sim.G.phase, 'check', '沒有真的暫停過就不重新檢查球');
});

test('第三個人進不了已滿的房間；比賽中別人不能頂替斷線的位子', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  const c = sock(); join(room, c, 'token-cccc');
  assert.deepEqual(c.sent, [{ t: 'full' }]);
  room.close(b);
  const d = sock(); join(room, d, 'token-dddd');
  assert.deepEqual(d.sent, [{ t: 'full' }]);
});

test('比賽結束時不在線的人，回來會補收結果', t => {
  timers(t);
  const room = new Room(), { a, b } = start(room);
  run(room, 500, [a, b]);
  room.close(b);
  const b2 = sock(); join(room, b2, 'token-bbbb');
  const G = room.sim.G; G.score = [11, 2]; G.phase = 'dead'; G.pt = .01;
  b2.sent.length = 0; room.close(b2); // 又斷了
  const b3 = sock(); join(room, b3, 'token-bbbb');
  G.phase = 'dead'; G.pt = .01; G.score = [11, 2];
  run(room, 1500, [a, b3]);
  assert.equal(last(a, 'over').win, 0);
  room.close(b3);
  const b4 = sock(); join(room, b4, 'token-bbbb');
  assert.equal(last(b4, 'over').win, 0);
});

test('等待室閒置 15 分鐘會關房', t => {
  timers(t);
  const room = new Room(), a = sock();
  join(room, a, 'token-aaaa');
  run(room, 14 * 60000, [a]);
  assert.equal(a.closed, false);
  run(room, 2 * 60000, [a]);
  assert.ok(a.closed); assert.ok(last(a, 'idle'));
  assert.equal(room.house, null);
});

test('隨機配對：兩個人湊成一間房，版本不同不會配在一起', () => {
  const mm = new Matchmaker(), a = sock(), b = sock(), c = sock();
  mm.message(a, JSON.stringify({ t: 'q', k: 'token-aaaa', v: VER }));
  assert.deepEqual(a.sent, [{ t: 'w' }]);
  mm.message(c, JSON.stringify({ t: 'q', k: 'token-cccc', v: VER + 1 }));
  assert.deepEqual(c.sent, [{ t: 'w' }]);
  mm.message(b, JSON.stringify({ t: 'q', k: 'token-bbbb', v: VER }));
  const ra = last(a, 'm'), rb = last(b, 'm');
  assert.ok(ra && rb); assert.equal(ra.room, rb.room);
  assert.match(ra.room, /^Q[A-Z0-9]{5}$/);
  assert.ok(a.closed && b.closed && !c.closed);
  assert.equal(mm.wait.length, 1);
  mm.close(c);
  assert.equal(mm.wait.length, 0); assert.equal(mm.house, null);
});

test('隨機配對：同一支手機重複排隊只算一次，不會配到自己', () => {
  const mm = new Matchmaker(), a = sock(), a2 = sock();
  mm.message(a, JSON.stringify({ t: 'q', k: 'token-aaaa', v: VER }));
  mm.message(a2, JSON.stringify({ t: 'q', k: 'token-aaaa', v: VER }));
  assert.ok(a.closed); assert.equal(last(a2, 'm'), undefined);
  assert.equal(mm.wait.length, 1);
  mm.close(a2);
});
