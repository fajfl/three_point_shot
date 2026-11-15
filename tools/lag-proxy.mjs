#!/usr/bin/env node
// 本機測試用的延遲代理：擋在 `wrangler dev` 前面，替 HTTP 與 WebSocket 加上延遲、抖動與瞬斷。
// 不需要安裝任何套件。
//
//   npx wrangler dev --port 8787
//   node tools/lag-proxy.mjs --listen 8788 --target 8787 --lag 60 --jitter 40 --stall 600 --every 8000
//
// 然後用手機或瀏覽器開 http://localhost:8788。
//   --lag     單程固定延遲（毫秒），來回延遲約為兩倍
//   --jitter  每個封包額外的隨機延遲上限（毫秒）；順序不變，所以大抖動會像 TCP 一樣整批擠在一起到
//   --stall   每隔 --every 毫秒整條線卡住這麼久（模擬行動網路換基地台）
//   --drop    每隔這麼多毫秒把所有連線直接切斷一次（測試自動重連）
import net from 'node:net';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const LISTEN = arg('listen', 8788), TARGET = arg('target', 8787), LAG = arg('lag', 60), JITTER = arg('jitter', 0);
const STALL = arg('stall', 0), EVERY = arg('every', 8000), DROP = arg('drop', 0);

let stallUntil = 0;
if (STALL > 0) setInterval(() => { stallUntil = Date.now() + STALL; }, EVERY);
const live = new Set();
if (DROP > 0) setInterval(() => { for (const s of live) s.destroy(); }, DROP);

// 單向管線：每塊資料延遲後再送，釋放時間只增不減，保證順序。
function pipe(from, to) {
  const q = []; let last = 0, timer = null;
  // 用單一佇列依序送出（個別 setTimeout 在同一毫秒到期時順序不保證，會把 TCP 資料流打亂）
  const drain = () => {
    timer = null;
    while (q.length && q[0].at <= Date.now()) {
      const e = q.shift();
      if (to.destroyed) continue;
      if (e.chunk) to.write(e.chunk); else if (e.end) to.end(); else to.destroy();
    }
    if (q.length) timer = setTimeout(drain, Math.max(1, q[0].at - Date.now()));
  };
  const push = e => {
    e.at = Math.max(last, stallUntil, Date.now() + LAG + (e.chunk ? Math.random() * JITTER : 0)); last = e.at;
    q.push(e); if (!timer) timer = setTimeout(drain, Math.max(1, e.at - Date.now()));
  };
  from.on('data', chunk => push({ chunk }));
  from.on('end', () => push({ end: true }));
  from.on('error', () => to.destroy());
  from.on('close', () => push({ close: true }));
}

net.createServer(client => {
  const upstream = net.connect(TARGET, '127.0.0.1');
  client.setNoDelay(true); upstream.setNoDelay(true);
  live.add(client); live.add(upstream);
  client.on('close', () => live.delete(client)); upstream.on('close', () => live.delete(upstream));
  pipe(client, upstream); pipe(upstream, client);
}).listen(LISTEN, () => {
  console.log(`lag-proxy :${LISTEN} → :${TARGET}  單程 ${LAG}ms + 抖動 ${JITTER}ms` + (STALL ? `，每 ${EVERY}ms 卡 ${STALL}ms` : '') + (DROP ? `，每 ${DROP}ms 斷線` : ''));
});
