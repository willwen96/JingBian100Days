/**
 * 自动试玩：不作弊（不改资源），按策略一路点到游戏结束，检查是否会卡死。
 *
 * 结果分类：
 *   complete  — 走到结局（demo_complete）
 *   gameover  — 正常的游戏结束（物资耗尽、死亡等）
 *   deadend   — 没结束却没有任何可点的选项 / 可去的区域（死局，需要修）
 *   stuck     — 步数超过上限，疑似死循环
 *   error     — 引擎抛异常或数值异常（NaN 等）
 */

import { GameEngine, createInitialState } from '../../demo/js/engine.js';

const MAX_STEPS = 3000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function locate(engine) {
  const s = engine.state;
  if (s.mode === 'pre') return `爆发前 ${s.prePhase}`;
  if (s.mode === 'day') return `第${s.day}天`;
  if (s.mode === 'event') return `第${s.day}天 事件 ${s.event?.id}/${s.event?.nodeId}`;
  if (s.mode === 'explore') return `第${s.day}天 探索 ${s.explore?.areaId}/${s.explore?.nodeId ?? 'root'}`;
  if (s.mode === 'explore_pick') return `第${s.day}天 选探索区域`;
  return s.mode;
}

function statsBroken(s) {
  return ['humanity', 'supplies', 'ammo'].some((k) => !Number.isFinite(s.stats?.[k]));
}

/**
 * 策略：weight(choice, ctx) 返回权重（0 = 不选）。都为 0 时退回均匀随机。
 * nearDeath: 濒死时是否花物资脱离（默认 true）
 */
const has = (c, ...words) => words.some((w) => c.text.includes(w) || c.id.includes(w));

export const POLICIES = {
  random: { label: '完全随机', weight: () => 1 },
  homebody: {
    label: '能苟就苟',
    weight: (c) => (has(c, 'stay', '苟') ? 20 : 1),
  },
  explorer: {
    label: '天天外出探索',
    weight: (c) => (has(c, 'explore', '探索', '前往') ? 20 : 1),
  },
  saint: {
    label: '圣母：救人、收伙伴、讲人性',
    weight: (c) =>
      has(c, 'd1_c2', '同意', '开门', '接纳', '营救', '救', '给你', '帮', '带上', '一起', '信任', '分享')
        ? 20
        : has(c, '拒绝', '驱逐', '视而不见', '不同意', '冷酷', '离开', '无视')
          ? 0.2
          : 1,
  },
  ruthless: {
    label: '冷血：拒绝一切、只顾自己',
    weight: (c) =>
      has(c, 'd1_c1', '拒绝', '驱逐', '视而不见', '不同意', '冷酷', '不是慈善', '无视', '抢', '杀')
        ? 20
        : has(c, '同意', '开门', '接纳', '营救', '救')
          ? 0.2
          : 1,
  },
  truth: {
    label: '真相党：调查重生原因',
    weight: (c) => (has(c, 'd1_c3', '真相', '调查', '悬崖', '博士', '科研', '前世') ? 20 : 1),
  },
  gambler: {
    label: '赌徒：小游戏和高风险选项',
    weight: (c) => (has(c, '赌', '游戏', '以大搏小', '不计后果', '全部', '轮盘') ? 20 : 1),
  },
  giveUp: {
    label: '濒死就放弃（测结束流程）',
    weight: () => 1,
    nearDeath: false,
  },
};

function chooseWeighted(options, policy, rng) {
  const weights = options.map((o) => Math.max(0, policy.weight(o) ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return pickRandom(options, rng);
  let r = rng() * total;
  for (let i = 0; i < options.length; i++) {
    r -= weights[i];
    if (r <= 0) return options[i];
  }
  return options[options.length - 1];
}

/**
 * @param {object} fixture loadFixtureData()
 * @param {{ seed?: number, policy?: string, pre?: {shelter?:string, prep?:string, dog?:string} }} opts
 */
export function playOnce(fixture, { seed = 1, policy = 'random', pre = null } = {}) {
  const rng = mulberry32(seed);
  const pol = POLICIES[policy];
  const engine = new GameEngine(fixture);
  const trace = [];
  const visited = new Set();
  const origRandom = Math.random;
  Math.random = rng; // 小游戏骰子也可复现

  const finish = (outcome, extra = {}) => {
    Math.random = origRandom;
    const s = engine.state;
    return {
      seed,
      policy,
      outcome,
      day: s.day,
      route: s.route ?? null,
      shelter: s.shelter ?? null,
      partners: [...(s.partners ?? [])],
      stats: { ...s.stats },
      reason: s.gameOverReason ?? null,
      score: s.endingScore?.total ?? s.endingScore?.score ?? null,
      steps: trace.length,
      visited: [...visited],
      exhausted: trace.filter((t) => t.includes('弹尽粮绝')).length,
      trace: trace.slice(-12),
      ...extra,
    };
  };

  try {
    engine.state = createInitialState(engine.meta);
    engine.startGame();

    for (let step = 0; step < MAX_STEPS; step++) {
      const s = engine.state;
      if (statsBroken(s)) return finish('error', { where: locate(engine), message: `数值异常 ${JSON.stringify(s.stats)}` });
      if (s.mode === 'gameover') return finish('gameover');
      if (s.mode === 'demo_complete' || s.demoComplete) return finish('complete');

      if (s.pendingNearDeath) {
        const accept = pol.nearDeath ?? true;
        trace.push(`${locate(engine)} → 濒死${accept ? '脱离' : '放弃'}`);
        engine.resolveNearDeath(accept);
        continue;
      }

      if (s.mode === 'event' && s.event) visited.add(`事件 ${s.event.id}`);
      if (s.mode === 'explore' && s.explore) visited.add(`区域 ${s.explore.areaId}`);
      const view = engine.getView();

      if (view.type === 'explore_pick') {
        const areas = view.areas ?? [];
        if (!areas.length) return finish('deadend', { where: locate(engine), message: '没有可去的探索区域' });
        const area = chooseWeighted(areas.map((a) => ({ id: a.id, text: a.name ?? a.id })), pol, rng);
        trace.push(`${locate(engine)} → ${area.text}`);
        const res = engine.pickExploreArea(area.id);
        if (res?.error) return finish('error', { where: locate(engine), message: `选区域报错：${res.error}` });
        continue;
      }

      if (view.type !== 'play') return finish('error', { where: locate(engine), message: `未知画面 ${view.type}` });

      // 预设的爆发前选择
      let options = (view.choices ?? []).filter((c) => !c.disabled);
      if (pre && s.mode === 'pre') {
        const want = { pre_5h: pre.shelter, pre_2h: pre.prep, outbreak_mall: pre.dog }[s.prePhase];
        const forced = options.find((c) => c.id === want);
        if (forced) options = [forced];
      }

      if (!options.length) {
        const all = (view.choices ?? []).map((c) => `${c.text}（${c.hint ?? '不可选'}）`);
        return finish('deadend', { where: locate(engine), message: all.length ? `选项全部不可用：${all.join('；')}` : '没有任何选项' });
      }

      let picked = false;
      const tried = new Set();
      while (!picked && tried.size < options.length) {
        const remaining = options.filter((o) => !tried.has(o.id));
        const c = chooseWeighted(remaining, pol, rng);
        tried.add(c.id);
        let res;
        if (c.input) {
          const lo = c.input.min;
          const hi = Math.max(lo, c.input.max);
          const val = lo + Math.floor(rng() * (hi - lo + 1));
          trace.push(`${locate(engine)} → ${c.text}［输入 ${val}］`);
          res = engine.pickChoiceWithInput(c.id, val);
        } else {
          trace.push(`${locate(engine)} → ${c.text}`);
          res = engine.pickChoice(c.id);
        }
        if (res?.error) trace.push(`  （被拒：${res.error}）`);
        else picked = true;
      }
      if (!picked) return finish('deadend', { where: locate(engine), message: '显示可选的选项点了全部被拒绝' });
    }
    return finish('stuck', { where: locate(engine), message: `超过 ${MAX_STEPS} 步仍未结束` });
  } catch (err) {
    return finish('error', { where: locate(engine), message: String(err?.stack ?? err) });
  }
}

export const PRE_COMBOS = (() => {
  const out = [];
  for (const shelter of ['shelter_villa', 'shelter_bunker'])
    for (const prep of ['stock_food', 'stock_medicine', 'stock_weapons'])
      for (const dog of ['save_dog', 'ignore_dog', 'dog_to_supplies']) out.push({ shelter, prep, dog });
  return out;
})();

export function summarize(results) {
  const by = (key) => {
    const m = {};
    for (const r of results) {
      const k = typeof key === 'function' ? key(r) : r[key];
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  };
  return {
    total: results.length,
    outcomes: by('outcome'),
    routes: by((r) => r.route ?? '(无路线)'),
    gameOverDays: by((r) => (r.outcome === 'gameover' ? `第${r.day}天` : null)),
    gameOverReasons: by((r) => (r.outcome === 'gameover' ? r.reason : null)),
    exhaustedRuns: results.filter((r) => r.exhausted > 0).length,
    problems: results.filter((r) => ['deadend', 'stuck', 'error'].includes(r.outcome)),
  };
}
