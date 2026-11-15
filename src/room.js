// 一間對戰房：伺服器當裁判，兩邊只送操作，這裡算出結果再傳回去
import { createSim } from './sim.js';

const TICK_MS = 16;
const SNAP_S = 1 / 25; // 25Hz snapshots (~640B per state) for smoother remote motion
const clampNumber = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
// 差量快照：只送跟「上一份已送出」不同的欄位。WebSocket 是有序可靠傳輸，所以每位玩家各自記住自己最後送出的狀態即可。
// snap() 裡的 cds / pend / spinS / dk 是模擬器內的活物件（之後會被原地修改），所以記錄時要先轉成字串。
const memo = st => ({ g: st.g.map(v => v && typeof v === 'object' ? JSON.stringify(v) : v), b: st.b, v: st.p.map(r => r[0]), o: st.p.map(r => [r[1], r[2], r[3], r[4]].map(x => JSON.stringify(x === undefined ? null : x))) });
const flatDiff = (a, b) => { const d = []; for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) d.push(i, b[i] === undefined ? null : b[i]); return d; };
function makeDelta(prev, cur, st) {
  const d = {};
  const g = [];
  cur.g.forEach((v, i) => { if (prev.g[i] !== v) g.push(i, st.g[i]); });
  if (g.length) d.g = g;
  const b = flatDiff(prev.b, cur.b); if (b.length) d.b = b;
  const p = cur.v.map((r, i) => flatDiff(prev.v[i], r));
  if (p.some(x => x.length)) d.p = p.map(x => x.length ? x : 0);
  const o = [];
  cur.o.forEach((r, i) => r.forEach((x, f) => { if (prev.o[i][f] !== x) o.push(i, f + 1, JSON.parse(x)); }));
  if (o.length) d.o = o;
  return d;
}
const QUEUE_MAX = 12; // 指令緩衝最多排幾個模擬步（約 100ms）
const QUEUE_KEEP = 3; // 平時希望只留幾步
const FULL_EVERY = 75; // 約 3 秒補送一次完整狀態，當作保險
const BACKLOG = 24576; // 送出佇列超過這個大小（約 1 秒的快照）就丟掉過時的狀態
const playerType = v => v === 'shoot' || v === 'slash' || v === 'wall' ? v : 'slash';
const STALE_MS = 4000;        // 比賽中這麼久沒收到任何訊息（手機每秒送一次 ping）就當作斷線，不讓對手跟「殭屍」打
const LOBBY_STALE_MS = 12000; // 等待室裡的死連線佔著位子太久就清掉
const GRACE_MS = 45000;       // 斷線後等對方回來的時間，超過就判離開的人輸
const IDLE_MS = 15 * 60000;   // 房間沒在比賽、閒置這麼久就關閉，不讓忘記關的分頁一直佔用
const WINS = [7, 11, 21];     // 房主可選的比賽長度
const validKey = k => typeof k === 'string' && k.length >= 6 && k.length <= 40;
const cleanName = v => typeof v === 'string' ? [...v.replace(/[\u0000-\u001f\u007f<>&"'`]/g, '').trim()].slice(0, 10).join('') : '';
let simVer = 0;
const ver = () => simVer || (simVer = createSim().VER); // 第一次有人連線時才建立（Workers 不允許在全域範圍取亂數）

export class Room {
  constructor() {
    this.seats = [null, null];
    this.sim = null;
    this.timer = null;
    this.house = null;
    this.paused = false;
    this.deadline = 0;
    this.last = 0;
    this.snapT = 0;
    this.result = null;
    this.players = [];
    this.win = 11;
    this.idleAt = Date.now();
  }
  count() { return this.seats.filter(s => s && s.sock).length; }
  each(fn) { for (const s of this.seats) if (s && s.sock) fn(s); }
  lobby() {
    const n = this.count(), r = this.seats.filter(s => s && s.ready).length;
    this.each(s => { const o = this.seats[1 - s.i]; s.sock.send(JSON.stringify({ t: 'lobby', n, r: s.ready ? r - 1 : r, w: this.win, pn: o && o.sock ? o.name : '' })); });
  }
  goMsg(seat, resume) {
    const m = { t: 'go', seat: seat.i, w: this.win, names: this.seats.map(s => s ? s.name : '') };
    if (resume) m.resume = true;
    return JSON.stringify(m);
  }
  // 有人進出或開賽時呼叫：重設閒置計時，並確保每秒一次的巡房在跑
  touch() {
    this.idleAt = Date.now();
    if (!this.house) this.house = setInterval(() => this.sweep(), 1000);
  }

  message(sock, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'j') return this.join(sock, m);
    const seat = this.seats.find(s => s && s.sock === sock);
    if (!seat) return;
    seat.rx = Date.now();
    switch (m.t) {
      case 'i': if (this.sim) this.feed(seat, m); return;
      case 'p':
        sock.send(JSON.stringify({ t: 'q', c: Number.isFinite(m.c) ? m.c : 0 }));
        if (this.sim && Number.isFinite(m.r)) this.sim.G.lat[seat.i] = clampNumber(m.r / 1000 + 0.04, 0, 0.3);
        return;
      case 'rs': seat.base = null; return; // 客戶端要求補送完整快照
      case 'r':
        seat.type = playerType(m.y); if (m.n !== undefined) seat.name = cleanName(m.n);
        seat.ready = true; this.touch(); return this.maybeStart();
      case 'bye': return this.leave(seat);
    }
  }
  // ---- 輸入緩衝 ----
  // 每筆指令帶著「上一筆指令在客戶端實際跑了幾步（pn）」。伺服器照這個步數把每筆指令各自執行完，
  // 而不是「一到就覆蓋」，所以網路抖動只會改變指令到達的時間，不會改變每筆指令被執行的長度，
  // 伺服器的結果就和客戶端預測的路徑一致。指令提早到就先排隊；太晚到只能沿用上一筆（跟舊版一樣）。
  feed(seat, m) {
    const I = this.sim.INP[seat.i];
    const e = { s: Number.isSafeInteger(m.s) && m.s >= 0 ? m.s : seat.ack, x: clampNumber(m.x, -1, 1), z: clampNumber(m.z, -1, 1), mag: clampNumber(m.m, 0, 1),
      a: m.a === true, b: m.b === true, c: m.c === true, ta: m.ta === true, tb: m.tb === true, tc: m.tc === true, dur: Infinity,
      hd: Number.isFinite(m.hd) && m.hd > 0 ? clampNumber(m.hd, 0, 3000) : 0, rs: Number.isFinite(m.rs) && m.rs >= 0 ? clampNumber(m.rs, 0, 1500) : -1 }; // 投籃按住毫秒、補扣按下時刻（sim 夾在 ±0.12 秒內）
    const length = Math.hypot(e.x, e.z);
    if (length > 1) { e.x /= length; e.z /= length; }
    if (!Number.isSafeInteger(m.pn) || m.pn < 0 || m.pn > 1e6) { // 舊版客戶端沒有步數：維持「一到就套用」
      seat.q = []; this.play(seat, e); return;
    }
    const last = seat.q.length ? seat.q[seat.q.length - 1] : seat.cur;
    if (last) last.dur = m.pn;
    seat.q.push(e);
    this.settle(seat);
    // 排隊的步數超過上限（網路卡住後一次湧進來）：略過最舊的，只保留最新的一段
    while (seat.q.length > 1 && (this.depth(seat) > QUEUE_MAX || seat.q.length > 48)) this.play(seat, seat.q.shift());
    // 抖動消失後，慢慢把多餘的排隊吃掉（每 150ms 少 1 步），不讓延遲停在歷史最大值
    const t = Date.now();
    if (seat.q.length > 1 && this.depth(seat) > QUEUE_KEEP && t - seat.trimT > 150) {
      seat.trimT = t;
      if (seat.cur.dur - seat.since > 0) seat.since++; else if (seat.q[0].dur > 0) seat.q[0].dur--;
    }
  }
  depth(seat) {
    let d = seat.cur && Number.isFinite(seat.cur.dur) ? Math.max(0, seat.cur.dur - seat.since) : 0;
    for (let i = 0; i < seat.q.length - 1; i++) d += seat.q[i].dur;
    return d;
  }
  play(seat, e) {
    const I = this.sim.INP[seat.i];
    I.x = e.x; I.z = e.z; I.mag = e.mag; I.a = e.a; I.b = e.b; I.c = e.c;
    if (e.ta) I.tapA = true;
    if (e.tb) I.tapB = true;
    if (e.tc) I.tapC = true;
    if (e.hd > 0) I.hd = e.hd;
    if (e.rs >= 0) I.rs = e.rs;
    seat.cur = e; seat.ack = e.s; seat.since = 0;
  }
  settle(seat) { while (seat.q.length && (!seat.cur || seat.since >= seat.cur.dur)) this.play(seat, seat.q.shift()); }
  join(sock, m) {
    // 規則版本不同（通常是手機還留著舊版頁面）：預測會對不上，請對方重新整理
    if (m.v !== ver()) { sock.send(JSON.stringify({ t: 'ver', v: ver() })); return; }
    if (!validKey(m.k)) { sock.send('{"t":"full"}'); return; }
    let i = this.seats.findIndex(s => s && s.k === m.k);
    if (i < 0) i = this.seats.findIndex(s => !s);
    if (i < 0) { sock.send('{"t":"full"}'); return; }
    const old = this.seats[i], prev = old && old.sock;
    // 房間是空的：第一個進來的人（房主）決定比賽長度
    if (!old && !this.seats[1 - i] && !this.timer) this.win = WINS.includes(m.w) ? m.w : 11;
    const seat = old || { i, k: m.k, sock: null, type: playerType(m.y), name: '', ready: false, ack: 0, since: 0, base: null, n: 0, cur: null, q: [], trimT: 0, pendingFx: [], rx: 0 };
    seat.sock = sock; seat.rx = Date.now();
    if (m.n !== undefined) seat.name = cleanName(m.n);
    this.seats[i] = seat;
    seat.base = null; // 新連線：第一份快照一定是完整的
    seat.cur = null; seat.q = []; // 重連：舊連線留下的排隊指令作廢，輸入從新連線的第一筆重新開始
    // 同一支手機換了新連線（舊的多半是半死不活的殭屍連線）：把舊的關掉。若其實是同一個分頁被複製，請舊分頁停止重連，免得兩邊互搶
    if (prev && prev !== sock) { prev.send('{"t":"dup"}'); prev.close(); }
    this.touch();
    sock.send(JSON.stringify({ t: 'seat', seat: i, live: !!this.timer }));
    // 比賽結束那一刻不在線的手機，回來時補送結果，才不會卡在球場。
    if (!this.timer && this.result && this.players.includes(m.k)) sock.send(this.result);
    this.lobby();
    if (this.timer) {
      sock.send(this.goMsg(seat, true));
      if (this.count() === 2) this.resume();
      else sock.send(JSON.stringify({ t: 'wait', s: this.waitLeft() }));
    }
  }
  waitLeft() { return Math.max(0, Math.ceil((this.deadline - Date.now()) / 1000)); }
  // 放開這位玩家的所有按鍵：斷線的人不該繼續往最後的方向跑、或一直蓄力投籃
  neutral(seat) {
    seat.cur = null; seat.q = [];
    if (this.sim) Object.assign(this.sim.INP[seat.i], { x: 0, z: 0, mag: 0, a: false, b: false, c: false, tapA: false, tapB: false, tapC: false, hd: 0, rs: -1 });
  }
  resume() {
    const wasPaused = this.paused;
    this.paused = false; this.deadline = 0; this.last = Date.now();
    // 真的暫停過：從檢查球重新開始這一波，雙方都有一秒回到位置，不會一回來就被偷襲
    if (wasPaused) { const { G } = this.sim; if (G.phase === 'play') this.sim.toCheck(G.off); else if (G.phase === 'check') G.pt = 0; }
    this.each(s => s.sock.send('{"t":"back"}'));
  }
  close(sock) {
    const seat = this.seats.find(s => s && s.sock === sock);
    if (!seat) return;
    seat.sock = null;
    if (!this.timer) { this.seats[seat.i] = null; this.lobby(); this.touch(); return; }
    // 比賽中斷線：暫停，等他回來
    this.neutral(seat);
    if (!this.paused) { this.paused = true; this.deadline = Date.now() + GRACE_MS; }
    const s = this.waitLeft();
    this.each(o => o.sock.send(JSON.stringify({ t: 'wait', s })));
  }
  // 連線還開著但已經沒反應：當作斷線處理，並把它關掉
  drop(seat) { const sock = seat.sock; this.close(sock); sock.close(); }
  // 主動離開（按了「離開比賽」）：比賽中算認輸
  leave(seat) {
    const sock = seat.sock;
    seat.sock = null;
    if (this.timer) { this.neutral(seat); this.forfeit(seat.i, 'quit'); }
    else { this.seats[seat.i] = null; this.lobby(); }
    sock.close();
  }
  forfeit(loser, why) {
    const { G } = this.sim;
    this.finish(JSON.stringify({ t: 'over', score: G.score.slice(), stats: G.stats, why, win: 1 - loser }));
    this.lobby();
  }
  finish(ending) {
    this.result = ending;
    this.players = this.seats.filter(Boolean).map(s => s.k);
    this.each(s => s.sock.send(ending));
    this.stop();
  }
  // 每秒巡房：清掉沒反應的連線、斷線等太久判定勝負、閒置太久關房
  sweep() {
    const now = Date.now();
    if (this.timer) {
      for (const s of this.seats) if (s && s.sock && now - s.rx > STALE_MS) this.drop(s);
      if (this.paused && now >= this.deadline) {
        const here = this.seats.filter(s => s && s.sock);
        if (here.length === 1) this.forfeit(1 - here[0].i, 'left');
        else if (!here.length) this.stop();
      }
    } else {
      for (const s of this.seats) if (s && s.sock && now - s.rx > LOBBY_STALE_MS) this.drop(s);
      if (this.count() && now - this.idleAt > IDLE_MS) this.each(s => { s.sock.send('{"t":"idle"}'); this.drop(s); });
    }
    if (!this.count() && !this.timer) { clearInterval(this.house); this.house = null; }
  }
  maybeStart() {
    if (this.timer) return;
    if (!(this.seats[0] && this.seats[1] && this.seats[0].ready && this.seats[1].ready && this.count() === 2)) { this.lobby(); return; }
    const sim = createSim(), G = sim.G;
    this.sim = sim;
    this.result = null;
    G.online = true; G.win = this.win; G.myType = this.seats[0].type; G.foeType = this.seats[1].type;
    sim.newGame(false, 'reg');
    const now = Date.now();
    for (const s of this.seats) { s.ready = false; s.ack = 0; s.since = 0; s.cur = null; s.q = []; s.base = null; s.pendingFx = []; s.rx = now; s.sock.send(this.goMsg(s, false)); }
    this.last = now; this.snapT = SNAP_S; this.paused = false; this.deadline = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.touch();
  }
  tick() {
    if (this.paused) return;
    const now = Date.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const { G } = this.sim;
    // 每推進一步，就替兩位玩家累計「目前這筆指令已執行幾步」
    this.sim.advance(dt, () => { for (const s of this.seats) if (s) { s.since++; if (s.q.length) this.settle(s); } });
    this.snapT += dt;
    if (this.snapT < SNAP_S && G.phase !== 'over' && G.fx.length === 0) return;
    this.snapT = Math.max(0, this.snapT - SNAP_S);
    const fx = G.fx.splice(0);
    for (const f of fx) if (f[0] === 'over') f[1].stats = G.stats;
    const state = this.sim.snap();
    let fullJ = null, fxJ = null, cur = null;
    // 當對方網路佇列嚴重阻塞時丟棄過時的狀態，但保留待發的遊戲事件。
    this.each(s => {
      const backlogged = s.sock.buffered?.() > BACKLOG && G.phase !== 'over';
      if (backlogged) {
        s.pendingFx = (s.pendingFx || []).concat(fx).slice(-80);
        return;
      }
      let fj;
      if (s.pendingFx?.length) { fj = JSON.stringify([...s.pendingFx, ...fx]); s.pendingFx = []; }
      else fj = fxJ || (fxJ = JSON.stringify(fx));
      const full = !s.base || ++s.n % FULL_EVERY === 0;
      cur = cur || memo(state);
      const body = full ? ',"f":1,"st":' + (fullJ || (fullJ = JSON.stringify(state))) : ',"d":' + JSON.stringify(makeDelta(s.base, cur, state));
      s.base = cur;
      s.sock.send('{"t":"s","a":' + s.ack + ',"k":' + s.since + body + ',"fx":' + fj + '}');
    });
    if (G.phase === 'over') {
      this.finish(JSON.stringify({ t: 'over', score: G.score.slice(), stats: G.stats, win: G.score[0] > G.score[1] ? 0 : 1 }));
      this.maybeStart(); // 結算前就按了再來一場的情況
    }
  }
  stop() {
    clearInterval(this.timer); this.timer = null; this.sim = null; this.paused = false; this.deadline = 0; this.idleAt = Date.now();
    for (let i = 0; i < 2; i++) if (this.seats[i] && !this.seats[i].sock) this.seats[i] = null;
  }
}
