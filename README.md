# 斷踝

手機直式 3D 街頭籃球 1 對 1。開房後朋友掃 QR Code 就能連線對打，也可以打電腦。

## 部署

Cloudflare Workers 匯入這個 repo，部署指令用 `npx wrangler deploy`。設定都在 `wrangler.jsonc`，房間用 SQLite 版 Durable Object，免費方案可用。

## 結構

- `src/worker.js`：把 `/ws/房號` 接到房間，其餘路徑給靜態檔案
- `src/room.js`：一間房的裁判，伺服器跑規則，雙方只送操作
- `src/sim.js`：籃球規則與物理，手機和伺服器共用
- `public/index.html`：遊戲畫面

## 遊戲規則（11 分版）

- 1 對 1，率先累計至少 **11 分**獲勝，三分球計 3 分、灌籃計 2 分。
- 新球權在三分線內取得球時，必須先將持球者帶回（踩到）三分線；後撤步可在踩線後直接銜接投籃，提早按住投籃鍵也能接招。
- 灌籃遭到封蓋時，有約 **0.7 秒**的短慢動作與綠條拉桿救球機會。
- 投籃干擾依防守者正面 120° 扇形的距離而定，背後起跳不干擾。
- 斷踝失誤只在**當次攻守球權**中累積，球權轉換或重新開球便清零。單人模式需 2 次，朋友對戰需 3 次，並給網路對戰更多反應時間。
- 球若連續 7.5 秒無人撿到，會重開下一個回合。

## 維護注意

遊戲的規則以 `src/sim.js` 為準；目前 `public/index.html` 仍內嵌同一份 `createSim()` 給瀏覽器使用。**修改規則時必須同步 HTML 內的函式內容**，否則單人模式可能與 Workers 伺服器／多人模式不同步。部署前請同時驗證單人與多人模式、出線、計分及攻守轉換。

## 素材授權

- 人物與動作：Quaternius Universal Animation Library，CC0 1.0
- three.js r128：MIT
- qrcode-generator（Kazuhiko Arase）：MIT
