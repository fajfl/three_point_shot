#!/usr/bin/env node
// 把 src/sim.js 的 createSim() 原封不動貼進 public/index.html（單檔網頁仍內嵌同一份規則）。
//   node tools/sync-sim.mjs          → 同步
//   node tools/sync-sim.mjs --check  → 只檢查，不一致時以非零狀態結束
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('..', import.meta.url);
const sim = readFileSync(new URL('src/sim.js', root), 'utf8');
const htmlPath = new URL('public/index.html', root);
const html = readFileSync(htmlPath, 'utf8');
const a = sim.indexOf('function createSim(){'), b = sim.lastIndexOf('\nexport ');
if (a < 0 || b < 0) throw new Error('src/sim.js 找不到 createSim() 或 export');
const body = sim.slice(a, b).trimEnd() + '\n';
const START = 'function createSim(){', END = '\nfunction decodeRig(';
const i = html.indexOf(START), j = html.indexOf(END);
if (i < 0 || j < 0 || j < i) throw new Error('public/index.html 找不到內嵌的 createSim()');
const next = html.slice(0, i) + body + html.slice(j);
if (next === html) { console.log('index.html 內嵌的規則與 src/sim.js 一致'); process.exit(0); }
if (process.argv.includes('--check')) { console.error('index.html 內嵌的規則與 src/sim.js 不一致，請執行 node tools/sync-sim.mjs'); process.exit(1); }
writeFileSync(htmlPath, next);
console.log('已把 src/sim.js 同步到 public/index.html');
