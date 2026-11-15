// 隨機配對：把正在找對手的人兩兩湊成一間房，再各自連到那間房去打
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const WAIT_MS = 5 * 60000;  // 排隊最久等這麼久，免得忘記關的分頁一直佔著
const STALE_MS = 15000;     // 手機每 5 秒送一次 ping；這麼久沒消息就當作離開
const validKey = k => typeof k === 'string' && k.length >= 6 && k.length <= 40;

export class Matchmaker {
  constructor() { this.wait = []; this.house = null; }
  code() { let c = 'Q'; for (let i = 0; i < 5; i++) c += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return c; }
  message(sock, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const me = this.wait.find(e => e.sock === sock);
    if (m.t === 'p') { if (me) me.rx = Date.now(); sock.send(JSON.stringify({ t: 'q', c: Number.isFinite(m.c) ? m.c : 0 })); return; }
    if (m.t !== 'q' || me || !validKey(m.k) || !Number.isSafeInteger(m.v)) return;
    this.sweep();
    // 同一支手機重複排隊（重新整理、重連）：舊的那筆作廢
    for (const e of this.wait.filter(e => e.k === m.k)) this.remove(e, true);
    // 只跟規則版本相同的人配對
    const peer = this.wait.find(e => e.v === m.v);
    if (peer) {
      this.remove(peer);
      const msg = JSON.stringify({ t: 'm', room: this.code() });
      for (const s of [peer.sock, sock]) { s.send(msg); s.close(); }
    } else {
      const now = Date.now();
      this.wait.push({ sock, k: m.k, v: m.v, at: now, rx: now });
      sock.send('{"t":"w"}');
      if (!this.house) this.house = setInterval(() => this.sweep(), 5000);
    }
  }
  remove(e, closeIt) {
    const i = this.wait.indexOf(e);
    if (i >= 0) this.wait.splice(i, 1);
    if (closeIt) e.sock.close();
  }
  close(sock) {
    const e = this.wait.find(e => e.sock === sock);
    if (e) this.remove(e);
    this.sweep();
  }
  sweep() {
    const now = Date.now();
    for (const e of this.wait.slice()) {
      if (now - e.at > WAIT_MS) { e.sock.send('{"t":"x"}'); this.remove(e, true); }
      else if (now - e.rx > STALE_MS) this.remove(e, true);
    }
    if (!this.wait.length && this.house) { clearInterval(this.house); this.house = null; }
  }
}
