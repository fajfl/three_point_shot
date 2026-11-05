// 一間對戰房：伺服器當裁判，兩邊只送操作，這裡算出結果再傳回去
import { createSim } from './sim.js';

const TICK_MS = 16;
const SNAP_S = 1 / 15; // 15Hz server snapshots, local client still predicts motion
const clampNumber = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
const playerType = v => v === 'shoot' || v === 'slash' || v === 'wall' ? v : 'slash';

export class Room {
  constructor() {
    this.seats = [null, null];
    this.sim = null;
    this.timer = null;
    this.paused = false;
    this.last = 0;
    this.snapT = 0;
  }
  count() { return this.seats.filter(s => s && s.sock).length; }
  each(fn) { for (const s of this.seats) if (s && s.sock) fn(s); }
  lobby() { const n = this.count(); this.each(s => s.sock.send(JSON.stringify({ t: 'lobby', n }))); }

  message(sock, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'j') return this.join(sock, m);
    const seat = this.seats.find(s => s && s.sock === sock);
    if (!seat) return;
    if (m.t === 'r') { seat.type = playerType(m.y); seat.ready = true; return this.maybeStart(); }
    if (m.t === 'p') {
      sock.send(JSON.stringify({ t: 'q', c: m.c }));
      if (this.sim && Number.isFinite(m.r)) this.sim.G.lat[seat.i] = clampNumber(m.r / 1000 + 0.04, 0, 0.2);
      return;
    }
    if (m.t === 'i' && this.sim) {
      const I = this.sim.INP[seat.i];
      I.x = clampNumber(m.x, -1, 1);
      I.z = clampNumber(m.z, -1, 1);
      const length = Math.hypot(I.x, I.z);
      if (length > 1) { I.x /= length; I.z /= length; }
      I.mag = clampNumber(m.m, 0, 1);
      I.a = m.a === true; I.b = m.b === true; I.c = m.c === true;
      if (m.ta === true) I.tapA = true;
      if (m.tb === true) I.tapB = true;
      if (m.tc === true) I.tapC = true;
      if (Number.isSafeInteger(m.s) && m.s >= 0) seat.ack = m.s;
    }
  }
  join(sock, m) {
    let i = this.seats.findIndex(s => s && s.k === m.k);
    if (i < 0) i = this.seats.findIndex(s => !s);
    if (i < 0) { sock.send(JSON.stringify({ t: 'full' })); return; }
    const old = this.seats[i];
    this.seats[i] = old ? Object.assign(old, { sock }) : { i, k: m.k, sock, type: playerType(m.y), ready: false, ack: 0 };
    sock.send(JSON.stringify({ t: 'seat', seat: i }));
    this.lobby();
    if (this.timer) {
      sock.send(JSON.stringify({ t: 'go', seat: i, resume: true }));
      if (this.count() === 2) { this.paused = false; this.last = Date.now(); this.each(s => s.sock.send('{"t":"back"}')); }
    }
  }
  close(sock) {
    const seat = this.seats.find(s => s && s.sock === sock);
    if (!seat) return;
    seat.sock = null;
    if (!this.timer) { if (!seat.ready) this.seats[seat.i] = null; this.lobby(); return; }
    this.paused = true;
    this.each(s => s.sock.send('{"t":"wait"}'));
    clearTimeout(this.giveUp);
    this.giveUp = setTimeout(() => { if (this.count() < 2) this.stop(); }, 45000);
  }
  maybeStart() {
    if (this.timer) return;
    if (!(this.seats[0] && this.seats[1] && this.seats[0].ready && this.seats[1].ready && this.count() === 2)) { this.lobby(); return; }
    const sim = createSim(), G = sim.G;
    this.sim = sim;
    G.online = true; G.myType = this.seats[0].type; G.foeType = this.seats[1].type;
    sim.newGame(false, 'reg');
    for (const s of this.seats) { s.ready = false; s.ack = 0; s.sock.send(JSON.stringify({ t: 'go', seat: s.i })); }
    this.last = Date.now(); this.snapT = SNAP_S; this.paused = false;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  tick() {
    if (this.paused) return;
    const now = Date.now(), dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const { G } = this.sim;
    this.sim.advance(dt);
    this.snapT += dt;
    if (this.snapT < SNAP_S && G.phase !== 'over') return;
    this.snapT = 0;
    const fx = G.fx.splice(0);
    for (const f of fx) if (f[0] === 'over') f[1].stats = G.stats;
    const body = JSON.stringify({ st: this.sim.snap(), fx });
    this.each(s => s.sock.send(`{"t":"s","a":${s.ack},` + body.slice(1)));
    if (G.phase === 'over') {
      const ending = JSON.stringify({t:'over',score:G.score.slice(),stats:G.stats});
      this.each(s => s.sock.send(ending));
      this.stop();
    }
  }
  stop() { clearInterval(this.timer); this.timer = null; clearTimeout(this.giveUp); this.sim = null; for (let i = 0; i < 2; i++) if (this.seats[i] && !this.seats[i].sock) this.seats[i] = null; }
}
