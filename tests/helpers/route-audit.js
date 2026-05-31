/**
 * 路线审计：在「资源充足」前提下 BFS 探索引擎状态，找出无可用选项的死路点。
 * 不替代手工试玩，但能快速扫出「选项全被 hide / 全 disabled」类问题。
 */

import { GameEngine, createInitialState } from '../../demo/js/engine.js';

const MAX_STATES_PER_SCENARIO = 8000;
const MAX_DEPTH = 120;

function cloneState(engine) {
  const s = engine.state;
  return {
    ...s,
    stats: { ...s.stats },
    partners: [...s.partners],
    items: [...s.items],
    tags: [...s.tags],
    flags: { ...s.flags },
    onceUsed: new Set(s.onceUsed),
    closedExploreAreas: [...s.closedExploreAreas],
    disabledFixedEvents: [...s.disabledFixedEvents],
    event: s.event ? { ...s.event, meta: s.event.meta ? { ...s.event.meta } : undefined } : null,
    explore: s.explore ? { ...s.explore } : null,
    log: [...s.log],
  };
}

function restoreState(engine, snapshot) {
  engine.state = snapshot;
}

function stateKey(s) {
  const flags = Object.keys(s.flags)
    .filter((k) => s.flags[k])
    .sort();
  return JSON.stringify({
    mode: s.mode,
    day: s.day,
    prePhase: s.prePhase,
    route: s.route,
    shelter: s.shelter,
    partners: [...s.partners].sort(),
    tags: [...s.tags].sort(),
    flags,
    event: s.event ? `${s.event.id}:${s.event.nodeId}` : null,
    explore: s.explore ? `${s.explore.areaId}:${s.explore.nodeId ?? ''}` : null,
    skipNextDay: s.skipNextDayActions,
    nearDeath: s.pendingNearDeath,
    once: [...s.onceUsed].sort().join('|'),
    closed: [...s.closedExploreAreas].sort().join('|'),
  });
}

function isTerminal(s) {
  return s.gameOver || s.demoComplete || s.mode === 'gameover' || s.mode === 'demo_complete';
}

function locateRawChoice(engine, mapped) {
  const ctx = engine._currentChoiceContext();
  if (!ctx) return null;
  if (mapped._exploreArea) return null;
  return ctx.choices.find((c) => c.id === mapped.id) ?? null;
}

function getPlayableChoices(engine) {
  const view = engine.getView();

  if (view.type === 'explore_pick') {
    return (view.areas ?? []).map((a) => ({
      id: a.id,
      text: a.name,
      _exploreArea: true,
    }));
  }

  if (view.type !== 'play') return [];

  return (view.choices ?? [])
    .filter((c) => !c.disabled)
    .map((c) => ({ id: c.id, text: c.text, input: c.input }));
}

function describeLocation(engine) {
  const s = engine.state;
  const view = engine.getView();
  if (s.mode === 'pre') return `pre:${s.prePhase}`;
  if (s.mode === 'day') return `day:${s.day} · ${view.title ?? ''}`;
  if (s.mode === 'event') return `event:${s.event?.id}/${s.event?.nodeId}`;
  if (s.mode === 'explore') return `explore:${s.explore?.areaId}/${s.explore?.nodeId ?? 'root'}`;
  if (s.mode === 'explore_pick') return `explore_pick · day ${s.day}`;
  return s.mode;
}

/** 濒死 / 重伤跳过 / 探索无区等：自动解套以便继续 BFS */
function tryAutoResolve(engine) {
  const s = engine.state;

  if (s.pendingNearDeath) {
    s.stats.supplies = Math.max(s.stats.supplies, 9999);
    engine.resolveNearDeath(true);
    return true;
  }

  if (s.mode === 'day' && engine.rules.shouldSkipDayActions(s)) {
    engine._advanceDay();
    return true;
  }

  if (s.mode === 'explore_pick') {
    const areas = engine.getView().areas ?? [];
    if (areas.length === 0) {
      engine._finishExploreOrAdvance();
      return true;
    }
  }

  return false;
}

function applyChoice(engine, mapped) {
  engine.state.stats.supplies = Math.max(engine.state.stats.supplies, 9999);
  engine.state.stats.ammo = Math.max(engine.state.stats.ammo, 999);

  if (mapped._exploreArea) {
    return engine.pickExploreArea(mapped.id);
  }

  if (mapped.input) {
    return engine.pickChoiceWithInput(mapped.id, mapped.input.defaultValue);
  }

  const raw = locateRawChoice(engine, mapped);
  if (raw?.input) {
    const def = raw.input.defaultValue ?? raw.input.min;
    return engine.pickChoiceWithInput(mapped.id, def);
  }

  return engine.pickChoice(mapped.id);
}

function bfsFromEngine(engine, scenarioName) {
  const visited = new Set();
  const deadEnds = [];
  const routesSeen = new Set();
  const queue = [{ depth: 0 }];

  let statesExplored = 0;

  while (queue.length && statesExplored < MAX_STATES_PER_SCENARIO) {
    const { depth } = queue.shift();
    if (depth > MAX_DEPTH) continue;

    const snap = cloneState(engine);
    const key = stateKey(engine.state);

    if (visited.has(key)) continue;
    visited.add(key);
    statesExplored += 1;

    if (engine.state.route) routesSeen.add(engine.state.route);

    if (isTerminal(engine.state)) continue;

    let guard = 0;
    while (tryAutoResolve(engine) && guard++ < 5) {
      /* auto-resolve loops */
    }

    if (isTerminal(engine.state)) continue;

    const choices = getPlayableChoices(engine);

    if (choices.length === 0) {
      deadEnds.push({
        scenario: scenarioName,
        location: describeLocation(engine),
        stateKey: key,
        mode: engine.state.mode,
        day: engine.state.day,
        route: engine.state.route,
      });
      restoreState(engine, snap);
      continue;
    }

    for (const choice of choices) {
      restoreState(engine, snap);
      const result = applyChoice(engine, choice);
      if (result?.error) continue;
      queue.push({ depth: depth + 1 });
    }
  }

  return { deadEnds, routesSeen: [...routesSeen], statesExplored };
}

/** 爆发前到第 1 天 */
export function setupAfterPreOutbreak(engine, { shelter = 'villa', prep = 'stock_food', dog = 'save_dog' } = {}) {
  engine.state = createInitialState(engine.meta);
  engine.startGame();
  engine.pickChoice(shelter === 'villa' ? 'shelter_villa' : 'shelter_bunker');
  engine.pickChoice(prep);
  const dogChoice = dog === 'save_dog' ? 'save_dog' : dog === 'ignore' ? 'ignore_dog' : 'dog_to_supplies';
  engine.pickChoice(dogChoice);
  engine.state.stats.supplies = 9999;
  engine.state.stats.ammo = 999;
}

/** 快速推进到指定天数（尽量选苟家/探索里第一个可用项） */
export function fastForwardToDay(engine, targetDay) {
  while (engine.state.day < targetDay && !isTerminal(engine.state)) {
    if (engine.state.mode !== 'day') {
      const choices = getPlayableChoices(engine);
      if (choices.length) applyChoice(engine, choices[0]);
      else if (!tryAutoResolve(engine)) break;
      continue;
    }

    const choices = getPlayableChoices(engine);
    const stay = choices.find((c) => c.id === 'stay_home' || c.id === 'stay_peaceful_villa' || c.id === 'stay_peaceful_bunker');
    const pick = stay ?? choices.find((c) => c.id === 'explore') ?? choices[0];
    if (!pick) {
      if (!tryAutoResolve(engine)) break;
      continue;
    }
    applyChoice(engine, pick);
  }
}

/** 静态：所有选项都带 hideWhenUnmet 的上下文（需人工核对条件是否互斥） */
export function findAllHiddenChoiceContexts(fixture) {
  const risky = [];

  const scan = (choices, ctx) => {
    if (!choices?.length) return;
    if (choices.every((c) => c.requirements?.hideWhenUnmet)) {
      risky.push(ctx);
    }
  };

  for (const d of fixture.days) {
    scan(d.choices, `days.json day ${d.day}`);
    if (d.choicesByRoute) {
      for (const [route, list] of Object.entries(d.choicesByRoute)) {
        scan(list, `days.json day ${d.day} route ${route}`);
      }
    }
  }

  for (const ev of fixture.events) {
    for (const n of ev.nodes ?? []) {
      scan(n.choices, `events.json ${ev.id} node ${n.id}`);
    }
  }

  for (const a of fixture.exploration) {
    scan(a.choices, `exploration.json ${a.id}`);
    for (const nodeId of Object.keys(a.nodes ?? {})) {
      scan(a.nodes[nodeId].choices, `exploration.json ${a.id} node ${nodeId}`);
    }
  }

  return risky;
}

export const SCENARIOS = [
  {
    name: '别墅+莱姆',
    run(engine) {
      setupAfterPreOutbreak(engine, { shelter: 'villa', dog: 'save_dog' });
    },
  },
  {
    name: '防空洞+无狗',
    run(engine) {
      setupAfterPreOutbreak(engine, { shelter: 'bunker', dog: 'ignore' });
    },
  },
  {
    name: '别墅→第35天',
    run(engine) {
      setupAfterPreOutbreak(engine, { shelter: 'villa' });
      fastForwardToDay(engine, 35);
    },
  },
  {
    name: '防空洞→第38天(无露娜)',
    run(engine) {
      setupAfterPreOutbreak(engine, { shelter: 'bunker', dog: 'ignore' });
      fastForwardToDay(engine, 38);
    },
  },
];

/**
 * @param {object} fixture - loadFixtureData() 返回值
 * @param {{ scenarios?: typeof SCENARIOS }} [opts]
 */
export function runRouteAudit(fixture, opts = {}) {
  const scenarios = opts.scenarios ?? SCENARIOS;
  const hiddenContexts = findAllHiddenChoiceContexts(fixture);
  const results = [];

  for (const scenario of scenarios) {
    const engine = new GameEngine(fixture);
    scenario.run(engine);
    const { deadEnds, routesSeen, statesExplored } = bfsFromEngine(engine, scenario.name);
    results.push({ name: scenario.name, deadEnds, routesSeen, statesExplored });
  }

  return { hiddenContexts, results };
}

export function formatAuditReport(audit) {
  const lines = ['=== 路线审计报告 ===', ''];

  lines.push('【静态】全部选项含 hideWhenUnmet 的上下文（需人工确认是否总有一条可满足）：');
  if (!audit.hiddenContexts.length) lines.push('  (无)');
  else audit.hiddenContexts.forEach((c) => lines.push(`  - ${c}`));
  lines.push('');

  for (const r of audit.results) {
    lines.push(`【BFS】${r.name} — 探索状态 ${r.statesExplored}，路线 ${r.routesSeen.join(', ') || '(无)'}`);
    if (!r.deadEnds.length) {
      lines.push('  未发现死路点');
    } else {
      for (const d of r.deadEnds) {
        lines.push(`  死路: ${d.location}`);
        lines.push(`        ${d.stateKey.slice(0, 120)}…`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
