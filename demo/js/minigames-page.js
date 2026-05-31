import { playDiceGame, playRussianRoulette } from './minigames.js';

const root = document.querySelector('#app');

const state = {
  stats: {
    supplies: 100,
  },
  logs: [],
};

function withForcedRolls(rolls, fn) {
  if (!rolls.length) return fn();

  let index = 0;
  const original = Math.random;
  Math.random = () => {
    const roll = rolls[Math.min(index, rolls.length - 1)];
    index += 1;
    const clamped = Math.max(1, Math.min(6, roll));
    return (clamped - 0.01) / 6;
  };

  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function parseRolls(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => Number(part))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 6);
}

function addLog(text) {
  state.logs.unshift(text);
  state.logs = state.logs.slice(0, 12);
}

function render() {
  root.innerHTML = `
    <header>
      <h1>小游戏测试页</h1>
      <p class="subtitle">独立测试黎明者营地骰子 / 赌命逻辑</p>
    </header>

    <div class="stats-bar">
      <div class="stat supplies">
        <div class="label">当前物资</div>
        <div class="value">${state.stats.supplies}</div>
      </div>
      <div class="stat humanity">
        <div class="label">最近日志</div>
        <div class="value">${state.logs.length}</div>
      </div>
      <div class="stat ammo">
        <div class="label">说明</div>
        <div class="value">试玩</div>
      </div>
    </div>

    <div class="story-panel">
      <div class="phase-title">测试控制</div>
      <div class="narrative">
        <label style="display:block;margin-bottom:.75rem">
          当前物资
          <input id="supplies-input" type="number" min="0" value="${state.stats.supplies}" style="width:100%;margin-top:.35rem;padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        </label>
        <label style="display:block;margin-bottom:.75rem">
          骰子下注（10 的倍数）
          <input id="bet-input" type="number" min="10" step="10" value="10" style="width:100%;margin-top:.35rem;padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        </label>
        <label style="display:block;margin-bottom:.75rem">
          固定骰点（可选，逗号分隔，例：1,2,3,4）
          <input id="dice-rolls-input" type="text" placeholder="留空则随机" style="width:100%;margin-top:.35rem;padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        </label>
        <label style="display:block;margin-bottom:1rem">
          固定赌命点数（可选，填 1-6）
          <input id="roulette-roll-input" type="number" min="1" max="6" placeholder="留空则随机" style="width:100%;margin-top:.35rem;padding:.55rem;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text)">
        </label>
      </div>
    </div>

    <div class="choices">
      <button type="button" class="choice-btn" id="btn-dice">测试「以大搏小」</button>
      <button type="button" class="choice-btn" id="btn-roulette">测试「我和你赌命！」</button>
      <button type="button" class="choice-btn" id="btn-reset">重置物资与日志</button>
      <a class="choice-btn" href="index.html" style="text-decoration:none;display:block">返回主 Demo</a>
    </div>

    <div class="story-panel" style="margin-top:1rem">
      <div class="phase-title">结果日志</div>
      <div class="narrative">${state.logs.length ? state.logs.map((line) => `<p>${escapeHtml(line)}</p>`).join('') : '<p>（还没有测试记录）</p>'}</div>
    </div>
  `;

  bind();
}

function syncSuppliesFromInput() {
  const input = document.querySelector('#supplies-input');
  state.stats.supplies = Math.max(0, Number(input.value) || 0);
}

function bind() {
  document.querySelector('#btn-dice').addEventListener('click', () => {
    syncSuppliesFromInput();
    const bet = Math.max(10, Number(document.querySelector('#bet-input').value) || 10);
    const forced = parseRolls(document.querySelector('#dice-rolls-input').value);
    const before = state.stats.supplies;

    if (before < bet) {
      addLog(`物资不足：当前仅 ${before}，无法押注 ${bet}。`);
      render();
      return;
    }

    state.stats.supplies -= bet;
    const result = withForcedRolls(forced, () => playDiceGame(state, bet));
    addLog(`骰子：${result.text} 当前物资 ${before} -> ${state.stats.supplies}`);
    render();
  });

  document.querySelector('#btn-roulette').addEventListener('click', () => {
    syncSuppliesFromInput();
    const rawRoll = document.querySelector('#roulette-roll-input').value.trim();
    const forcedRoll = rawRoll === '' ? NaN : Number(rawRoll);
    const forced =
      Number.isFinite(forcedRoll) && forcedRoll >= 1 && forcedRoll <= 6 ? [forcedRoll] : [];
    const before = state.stats.supplies;
    const result = withForcedRolls(forced, () => playRussianRoulette(state));
    addLog(`赌命：${result.text} 当前物资 ${before} -> ${state.stats.supplies}`);
    render();
  });

  document.querySelector('#btn-reset').addEventListener('click', () => {
    state.stats.supplies = 100;
    state.logs = [];
    render();
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

render();
