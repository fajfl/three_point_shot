# 斷踝

手機直式 3D 街頭籃球 1 對 1。開房後朋友掃 QR Code 就能連線對打，也可以打電腦。

## 部署

Cloudflare Workers 匯入這個 repo，部署指令用 `npx wrangler deploy`。設定都在 `wrangler.jsonc`，房間用 SQLite 版 Durable Object，免費方案可用。

## 結構

- `src/worker.js`：把 `/ws/房號` 接到房間，其餘路徑給靜態檔案
- `src/room.js`：一間房的裁判，伺服器跑規則，雙方只送操作
- `src/sim.js`：籃球規則與物理，手機和伺服器共用
- `public/index.html`：遊戲畫面

## 素材授權

- 人物與動作：Quaternius Universal Animation Library，CC0 1.0
- three.js r128：MIT
- qrcode-generator（Kazuhiko Arase）：MIT
