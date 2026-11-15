import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSim } from '../src/sim.js';

test('index.html 內嵌的規則與 src/sim.js 逐字一致', () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../tools/sync-sim.mjs', import.meta.url)), '--check'], { stdio: 'pipe' });
});

// 兩台電腦互打，跑到比賽結束
function botGame(win) {
  const sim = createSim(), { G } = sim;
  if (win) G.win = win;
  sim.newGame(false, 'king');
  G.p[0].human = false;
  let n = 0;
  while (G.phase !== 'over' && n++ < 120 * 60 * 30) sim.step(sim.H);
  return { sim, G, n };
}

test('電腦對打能打完一場，統計數字自洽', () => {
  const { G, n } = botGame();
  assert.equal(G.phase, 'over', `跑了 ${n} 步還沒結束`);
  const top = Math.max(...G.score);
  assert.ok(top >= 11);
  const s = G.stats;
  for (const i of [0, 1]) {
    assert.ok(s.fgm[i] <= s.fga[i], '命中數不會超過出手數');
    assert.ok(s.tpm[i] <= s.tpa[i], '三分命中不會超過三分出手');
    assert.ok(s.tpm[i] <= s.fgm[i] && s.dunk[i] <= s.fgm[i]);
    assert.equal(G.score[i], s.tpm[i] * 3 + (s.fgm[i] - s.tpm[i]) * 2, '比分等於三分×3＋其他×2');
  }
});

test('比賽長度可調（7 分制）', () => {
  const { G } = botGame(7);
  assert.equal(G.phase, 'over');
  const top = Math.max(...G.score);
  assert.ok(top >= 7 && top <= 9, `7 分制結束時最高分 ${top}`);
});

test('亂數跟著快照走：同一份狀態、同樣輸入，兩台機器算出同樣結果', () => {
  const a = createSim(), b = createSim();
  a.G.online = b.G.online = true;
  a.newGame(false, 'reg');
  // 快照會四捨五入到小數三位，所以兩邊都從同一份快照還原，起點才完全相同
  const st = JSON.stringify(a.snap());
  a.restore(JSON.parse(st)); b.restore(JSON.parse(st));
  b.G.p[0].human = b.G.p[1].human = true;
  // 用固定腳本餵兩邊一樣的操作，涵蓋移動、變向、投籃、抄球、封蓋
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 120 * 40; i++) {
    if (i % 24 === 0) for (const id of [0, 1]) {
      const ang = r() * Math.PI * 2, mag = r() < .8 ? 1 : 0, pa = r() < .3, pb = r() < .3, hold = r() < .5;
      for (const sim of [a, b]) { const I = sim.INP[id]; I.x = Math.cos(ang); I.z = Math.sin(ang); I.mag = mag; I.a = pa; I.b = pb && hold; if (pa) I.tapA = true; if (pb) I.tapB = true; }
    }
    a.step(a.H); b.step(b.H);
    if (a.G.phase === 'over') break;
  }
  assert.deepEqual(JSON.parse(JSON.stringify(b.snap())), JSON.parse(JSON.stringify(a.snap())));
  assert.ok(a.G.t > 5);
});

test('單人投籃模式：對手停在場邊，不會來撿球', () => {
  const sim = createSim(), { G } = sim;
  G.solo = true;
  sim.newGame(false, 'reg');
  for (let i = 0; i < 240; i++) sim.step(sim.H);
  assert.equal(G.phase, 'play');
  const foe = G.p[1];
  foe.x = 5.6; foe.z = 11; const x0 = foe.x, z0 = foe.z;
  // 球丟到對手腳邊，他也不會撿
  G.holder = null; Object.assign(G.ball, { mode: 'loose', x: 5.6, y: .3, z: 11, vx: 0, vy: 0, vz: 0, touched: true });
  for (let i = 0; i < 240; i++) sim.step(sim.H);
  assert.equal(G.holder, null);
  assert.ok(Math.hypot(foe.x - x0, foe.z - z0) < .05, '對手沒有移動');
});
