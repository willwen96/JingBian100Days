/**
 * 用法：node scripts/playtest.js [随机局数=1000] [起始种子=1]
 * 输出：随机局 + 各策略×爆发前组合的有目的试玩汇总；发现死局时退出码为 1。
 */
import { loadFixtureData } from '../tests/helpers/load-data.js';
import { playOnce, POLICIES, PRE_COMBOS, summarize } from '../tests/helpers/playtest.js';

const N = Number(process.argv[2] ?? 1000);
const SEED0 = Number(process.argv[3] ?? 1);
const fixture = await loadFixtureData();

const randomRuns = [];
for (let i = 0; i < N; i++) randomRuns.push(playOnce(fixture, { seed: SEED0 + i, policy: 'random' }));

const purposeful = [];
let seed = 100000;
for (const policy of Object.keys(POLICIES).filter((p) => p !== 'random')) {
  for (const pre of PRE_COMBOS) purposeful.push({ ...playOnce(fixture, { seed: seed++, policy, pre }), pre });
}

const fmt = (o) => Object.entries(o).filter(([k]) => k !== 'null').sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('，');

function report(title, results) {
  const s = summarize(results);
  console.log(`\n=== ${title}（${s.total} 局）===`);
  console.log('结果：', fmt(s.outcomes));
  console.log('路线：', fmt(s.routes));
  console.log('结束原因：', fmt(s.gameOverReasons));
  console.log('结束在：', fmt(s.gameOverDays));
  console.log(`触发「弹尽粮绝」兜底的局数：${s.exhaustedRuns}`);
  if (s.problems.length) {
    console.log(`\n!! 问题 ${s.problems.length} 局：`);
    const seen = new Map();
    for (const p of s.problems) {
      const k = `${p.outcome} @ ${p.where}: ${p.message?.split('\n')[0]}`;
      if (!seen.has(k)) seen.set(k, { n: 0, ex: p });
      seen.get(k).n++;
    }
    for (const [k, { n, ex }] of seen) {
      console.log(`- [${n} 局] ${k}\n  例：seed ${ex.seed} 策略 ${ex.policy}\n  最后几步：\n    ${ex.trace.join('\n    ')}`);
    }
  }
  return s;
}

const a = report('随机试玩', randomRuns);
const b = report('有目的试玩', purposeful);

console.log('\n=== 各策略 ===');
for (const p of Object.keys(POLICIES).filter((p) => p !== 'random')) {
  const rs = purposeful.filter((r) => r.policy === p);
  const s = summarize(rs);
  const avgDay = (rs.reduce((x, r) => x + r.day, 0) / rs.length).toFixed(1);
  console.log(`${POLICIES[p].label}：${fmt(s.outcomes)}；平均撑到第 ${avgDay} 天；路线 ${fmt(s.routes)}`);
}

const all = [...randomRuns, ...purposeful];
const cover = {};
for (const r of all) for (const v of r.visited) cover[v] = (cover[v] ?? 0) + 1;
const allTargets = [
  ...fixture.events.map((e) => `事件 ${e.id}`),
  ...fixture.exploration.map((a) => `区域 ${a.id}`),
];
const never = allTargets.filter((t) => !cover[t]);
console.log('\n=== 覆盖 ===');
console.log(`进入过的事件/区域：${allTargets.filter((t) => cover[t]).length}/${allTargets.length}`);
console.log('从未进入：', never.join('，') || '(无)');
console.log('很少进入（<1%）：', Object.entries(cover).filter(([, n]) => n < all.length / 100).map(([k, n]) => `${k} ${n}`).join('，') || '(无)');

process.exit(a.problems.length + b.problems.length ? 1 : 0);
