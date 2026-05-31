import { GameEngine, loadGameData } from './engine.js';
import { formatScoreBreakdownLines } from './scoring.js';
import {
  formatSaveSlotTime,
  hasAnySaveSlot,
  listSaveSlots,
} from './save.js';

const $ = (sel) => document.querySelector(sel);

let engine = null;
let toastTimer = null;

export function setEngineForTest(nextEngine) {
  engine = nextEngine;
}

async function init() {
  const root = $('#app');
  try {
    const data = await loadGameData('/data');
    engine = new GameEngine(data);
    render();
  } catch (err) {
    root.innerHTML = `
      <div class="loading">
        <p>无法加载游戏数据。</p>
        <p style="color:#c45c3e">${err.message}</p>
        <p style="margin-top:1rem;font-size:0.85rem">
          请在本项目根目录启动本地服务器，例如：<br>
          <code>npx serve .</code> 然后打开 <code>/demo/</code>
        </p>
      </div>`;
  }
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2800);
}

function render() {
  const root = $('#app');
  const view = engine.getView();

  if (view.type === 'intro') {
    view.hasSavedGame = hasAnySaveSlot();
  }

  if (view.type === 'intro') {
    root.innerHTML = renderIntro(view);
    $('#btn-start')?.addEventListener('click', () => {
      engine.startGame();
      render();
    });
    $('#btn-continue')?.addEventListener('click', () => {
      openSaveSlotModal('load');
    });
    return;
  }

  if (view.type === 'gameover') {
    root.innerHTML = renderGameOver(view);
    $('#btn-restart').addEventListener('click', () => {
      engine.restart();
      render();
    });
    return;
  }

  if (view.type === 'demo_complete') {
    root.innerHTML = renderDemoComplete(view);
    $('#btn-restart').addEventListener('click', () => {
      engine.restart();
      render();
    });
    return;
  }

  if (view.type === 'explore_pick') {
    root.innerHTML = renderPlayShell(view) + renderExplorePick(view);
    bindPlayShell();
    view.areas.forEach((area) => {
      $(`#area-${area.id}`).addEventListener('click', () => {
        engine.pickExploreArea(area.id);
        render();
      });
    });
    return;
  }

  if (view.type === 'play') {
    root.innerHTML = renderPlayShell(view) + renderChoices(view.choices);
    bindPlayShell();
    bindChoices();
    maybeShowNearDeath();
    return;
  }

  root.innerHTML = '<p class="loading">未知界面状态</p>';
}

export function renderIntro(view) {
  const paras = view.intro.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  const continueBtn = view.hasSavedGame
    ? `<button type="button" class="btn-secondary" id="btn-continue" style="width:100%;margin-bottom:0.65rem">继续游戏</button>`
    : '';
  return `
    <header>
      <h1>惊变100天</h1>
      <p class="subtitle">Demo</p>
    </header>
    <div class="story-panel">
      <div class="narrative">${paras}</div>
      <p style="color:var(--muted);font-size:0.9rem;margin-top:1rem">${escapeHtml(view.hostOpening)}</p>
    </div>
    ${continueBtn}
    <button type="button" class="btn-primary" id="btn-start" style="width:100%">开始游戏</button>
  `;
}

export function renderOutcomeBlock(label, outcome, className) {
  if (!outcome?.text && !outcome?.effects?.length) return '';
  const labelHtml = label ? `<div class="outcome-label">${escapeHtml(label)}</div>` : '';
  const textHtml = outcome.text
    ? `<div class="outcome-text">${escapeHtml(outcome.text)}</div>`
    : '';
  const fxHtml = outcome.effects?.length
    ? `<div class="outcome-effects"><span class="outcome-effects-tag">结果</span> ${outcome.effects.map(escapeHtml).join(' · ')}</div>`
    : '';
  return `<div class="${className}">${labelHtml}${textHtml}${fxHtml}</div>`;
}

export function renderOutcomePanels(view) {
  return [
    renderOutcomeBlock('上一步选择', view.choiceOutcome, 'outcome-banner choice-outcome-banner'),
    renderOutcomeBlock(
      view.sceneOutcome?.label || '进入场景',
      view.sceneOutcome,
      'outcome-banner scene-outcome-banner'
    ),
  ].join('');
}

export function renderPlayShell(view) {
  const dayLabel = view.day > 0 ? `第 ${view.day} 天` : '爆发前';
  const partners = view.partners.length
    ? view.partners.map((p) => `<span class="chip">伙伴 <strong>${escapeHtml(p)}</strong></span>`).join('')
    : '';
  const items = view.items.length
    ? view.items.map((i) => `<span class="chip">${escapeHtml(i)}</span>`).join('')
    : '';
  const tags = view.tags.length
    ? view.tags.map((t) => `<span class="chip">词条 <strong>${escapeHtml(t)}</strong></span>`).join('')
    : '';

  const outcomes = renderOutcomePanels(view);

  const costLog = view.lastCostLog ? `<div class="cost-banner">${escapeHtml(view.lastCostLog)}</div>` : '';

  const nextCost =
    view.nextDayCostPreview?.nextDay && view.day > 0
      ? `<div class="day-cost-preview">开启第 <strong>${view.nextDayCostPreview.nextDay}</strong> 天预计消耗物资 <strong>${view.nextDayCostPreview.total}</strong>（${escapeHtml(
          engine.rules.formatBreakdown(view.nextDayCostPreview.breakdown)
        )}）</div>`
      : '';

  const reminder = view.hostReminder
    ? `<div class="host-reminder">主持人提醒：${escapeHtml(view.hostReminder)}</div>`
    : '';

  const adrenaline = view.adrenalineReady
    ? `<div class="host-reminder">肾上腺素已就绪：下一次有消耗的选择免费</div>`
    : '';

  const skipNote = view.skipDayActions ? `<div class="host-reminder">本日无法进行常规行动</div>` : '';

  const restartBtn = view.canRestartDay
    ? `<button type="button" class="btn-secondary btn-toolbar" id="btn-restart-day">重新开启当天</button>`
    : view.dayRestartUsed
      ? `<button type="button" class="btn-secondary btn-toolbar" disabled title="本天已使用过">重新开启当天</button>`
      : '';

  const toolbar = `
    <div class="game-toolbar">
      <button type="button" class="btn-secondary btn-toolbar" id="btn-save">存档</button>
      <button type="button" class="btn-secondary btn-toolbar" id="btn-load">读档</button>
      ${restartBtn}
    </div>`;

  return `
    ${toolbar}
    <header>
      <h1>惊变100天</h1>
      <p class="subtitle">${escapeHtml(dayLabel)} · Demo</p>
    </header>
    <div class="stats-bar">
      <div class="stat humanity"><div class="label">人性值</div><div class="value">${view.stats.humanity}</div></div>
      <div class="stat supplies"><div class="label">物资</div><div class="value">${view.stats.supplies}</div></div>
      <div class="stat ammo"><div class="label">弹药</div><div class="value">${view.stats.ammo}</div></div>
    </div>
    <div class="meta-row">
      <span class="chip">庇护所 <strong>${escapeHtml(view.shelter)}</strong></span>
      ${partners}${items}${tags}
    </div>
    ${outcomes}${costLog}${nextCost}${reminder}${adrenaline}${skipNote}
    <div class="story-panel">
      <div class="phase-title">${escapeHtml(view.title)}</div>
      <div class="narrative" style="white-space:pre-wrap">${escapeHtml(view.narrative)}</div>
    </div>
  `;
}

export function renderChoices(choices) {
  if (!choices?.length) return '<p style="color:var(--muted)">（暂无选项）</p>';
  return `
    <div class="choices" id="choices">
      ${choices
        .map((c) => {
          if (c.input?.type === 'number') {
            return `
        <div class="choice-btn${c.special ? ' choice-special' : ''}" style="display:block;text-align:left">
          <span class="choice-label-row">${escapeHtml(c.text)}${c.special ? ` <span class="special-tag">${escapeHtml(c.specialLabel || '特殊事件')}</span>` : ''}</span>
          ${c.hint ? `<span class="hint">${escapeHtml(c.hint)}</span>` : ''}
          <div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.75rem;flex-wrap:wrap">
            <label style="font-size:0.9rem;color:var(--muted)">${escapeHtml(c.input.label)}</label>
            <input
              type="number"
              class="choice-number-input"
              data-input-for="${escapeHtml(c.id)}"
              min="${c.input.min}"
              max="${c.input.max}"
              step="${c.input.step}"
              value="${c.input.defaultValue}"
              placeholder="${escapeHtml(c.input.placeholder || '')}"
              ${c.disabled ? 'disabled' : ''}
              style="width:7rem;padding:0.55rem 0.7rem;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:#101218;color:#f5f7fb"
            >
            <button
              type="button"
              class="choice-btn"
              data-id="${escapeHtml(c.id)}"
              data-requires-input="true"
              ${c.disabled ? 'disabled' : ''}
              style="width:auto;min-width:6rem;margin:0"
            >${escapeHtml(c.input.submitText)}</button>
          </div>
        </div>`;
          }

          return `
        <button type="button" class="choice-btn${c.special ? ' choice-special' : ''}" data-id="${escapeHtml(c.id)}" ${c.disabled ? 'disabled' : ''}>
          <span class="choice-label-row">${escapeHtml(c.text)}${c.special ? ` <span class="special-tag">${escapeHtml(c.specialLabel || '特殊事件')}</span>` : ''}</span>
          ${c.hint ? `<span class="hint">${escapeHtml(c.hint)}</span>` : ''}
        </button>`;
        })
        .join('')}
    </div>
  `;
}

export function renderExplorePick(view) {
  return `
    <div class="choices">
      ${view.areas
        .map(
          (a) => `
        <button type="button" class="choice-btn" id="area-${a.id}">
          前往：${escapeHtml(a.name)}
        </button>`
        )
        .join('')}
    </div>
  `;
}

export function renderGameOver(view) {
  const story =
    view.choiceOutcome?.text && view.choiceOutcome.text !== view.reason
      ? renderOutcomeBlock('上一步选择', view.choiceOutcome, 'outcome-banner choice-outcome-banner')
      : view.lastResult && view.lastResult !== view.reason
        ? `<div class="outcome-banner choice-outcome-banner"><div class="outcome-text">${escapeHtml(view.lastResult)}</div></div>`
        : '';
  const reason = view.reason
    ? `<p style="white-space:pre-wrap">${escapeHtml(view.reason)}</p>`
    : '';
  return `
    <div class="screen-end">
      <h2>游戏结束</h2>
      ${story}${reason}
      ${renderEndingScore(view.endingScore, view.tagsById)}
      <button type="button" class="btn-primary" id="btn-restart">重新开始</button>
    </div>
  `;
}

export function renderDemoComplete(view) {
  const s = view.state;
  const finaleStory = view.finaleNarrative
    ? `<div class="story-panel finale-story">
        <div class="phase-title">${escapeHtml(view.finaleTitle || '大结局')}</div>
        <div class="narrative" style="white-space:pre-wrap">${escapeHtml(view.finaleNarrative)}</div>
      </div>`
    : '';

  return `
    <div class="screen-end">
      <h2>结局结算</h2>
      ${finaleStory}
      <p class="finale-stats">人性 ${s.stats.humanity} · 物资 ${s.stats.supplies} · 弹药 ${s.stats.ammo} · 庇护所：${escapeHtml(s.shelter ? { villa: '山中别墅', bunker: '城郊防空洞' }[s.shelter] : '—')}</p>
      ${renderEndingScore(view.endingScore, view.tags)}
      <button type="button" class="btn-primary" id="btn-restart">再玩一次</button>
    </div>
  `;
}

export function renderEndingScore(endingScore, tagsById) {
  if (!endingScore) {
    return '<p class="score-missing">（未计算结局分数）</p>';
  }

  const total =
    Number.isInteger(endingScore.totalScore)
      ? String(endingScore.totalScore)
      : String(endingScore.totalScore);
  const formulaLines = formatScoreBreakdownLines(endingScore)
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  const tagItems = [];
  for (const t of endingScore.additiveTags) {
    const def = tagsById?.[t.id];
    const flavor = def?.flavorText
      ? `<p class="tag-flavor">${escapeHtml(def.flavorText)}</p>`
      : '';
    tagItems.push(
      `<li><span class="tag-name">${escapeHtml(t.name)}</span> <span class="tag-score ${tagScoreClass(t.score)}">${formatTagScore(t.score)}</span>${flavor}</li>`
    );
  }
  if (endingScore.finaleTag) {
    tagItems.push(
      `<li class="tag-finale"><span class="tag-name">${escapeHtml(endingScore.finaleTag.name)}</span> <span class="tag-score">×${endingScore.finaleMultiplier}</span> <span class="tag-role">大结局乘数</span></li>`
    );
  }

  const tagBlock = tagItems.length
    ? `<ul class="tag-list tag-list-scored">${tagItems.join('')}</ul>`
    : '<p class="score-missing">（无词条）</p>';

  return `
    <section class="score-panel">
      <p class="score-headline">
        结局分数 <strong class="score-total">${escapeHtml(total)}</strong>
        <span class="score-grade">${escapeHtml(endingScore.grade.rank)}</span>
        <span class="score-grade-label">${escapeHtml(endingScore.grade.label)}</span>
      </p>
      <ol class="score-formula">${formulaLines}</ol>
      <details class="score-tags-details" open>
        <summary>词条与分数</summary>
        ${tagBlock}
      </details>
    </section>
  `;
}

function formatTagScore(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function tagScoreClass(n) {
  return n < 0 ? 'tag-score-negative' : '';
}

function bindChoices() {
  const runChoice = (btn) => {
    const id = btn.dataset.id;
    const needsInput = btn.dataset.requiresInput === 'true';
    const result = needsInput
      ? engine.pickChoiceWithInput(id, document.querySelector(`[data-input-for="${id}"]`)?.value)
      : engine.pickChoice(id);
    if (result.error) {
      showToast(result.error);
      return;
    }
    const view = engine.getView();
    const fx = [
      ...(view.choiceOutcome?.effects || []),
      ...(view.sceneOutcome?.effects || []),
    ];
    if (fx.length) {
      showToast(fx.join(' · '));
    }
    render();
  };

  document.querySelectorAll('.choice-btn[data-id]').forEach((btn) => {
    btn.addEventListener('click', () => runChoice(btn));
  });

  document.querySelectorAll('.choice-number-input[data-input-for]').forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const btn = document.querySelector(`.choice-btn[data-id="${input.dataset.inputFor}"][data-requires-input="true"]`);
      if (btn && !btn.disabled) runChoice(btn);
    });
  });
}

function bindPlayShell() {
  $('#btn-save')?.addEventListener('click', () => {
    openSaveSlotModal('save');
  });

  $('#btn-load')?.addEventListener('click', () => {
    openSaveSlotModal('load');
  });

  $('#btn-restart-day')?.addEventListener('click', () => {
    if (!window.confirm('将回到本天开始时的状态（仅可使用一次），确定吗？')) return;
    const result = engine.restartCurrentDay();
    if (result.error) {
      showToast(result.error);
      return;
    }
    showToast('已重新开启当天');
    render();
  });
}

export function renderSaveSlotCard(entry, mode) {
  const slotNo = entry.slot + 1;
  if (entry.empty) {
    return `
      <button type="button" class="save-slot save-slot-empty" data-slot="${entry.slot}" ${mode === 'load' ? 'disabled' : ''}>
        <span class="save-slot-title">存档 ${slotNo}</span>
        <span class="save-slot-meta">空</span>
      </button>`;
  }

  const s = entry.summary;
  const time = formatSaveSlotTime(entry.savedAt);
  const overwriteHint = mode === 'save' ? '<span class="save-slot-warn">点击覆盖</span>' : '';
  return `
    <button type="button" class="save-slot" data-slot="${entry.slot}">
      <span class="save-slot-title">存档 ${slotNo}</span>
      <span class="save-slot-meta">${escapeHtml(s.dayLabel)} · ${escapeHtml(s.shelterName)}</span>
      <span class="save-slot-meta">伙伴：${escapeHtml(s.partnersLabel)}</span>
      ${time ? `<span class="save-slot-time">${escapeHtml(time)}</span>` : ''}
      ${overwriteHint}
    </button>`;
}

export function renderSaveSlotModal(slots, mode) {
  const title = mode === 'save' ? '选择存档槽位' : '读取存档';
  const hint =
    mode === 'save'
      ? '将覆盖所选槽位的已有进度。'
      : '读档将覆盖当前未保存的进度。';
  return `
    <div class="modal save-slot-modal">
      <h2>${title}</h2>
      <p class="save-slot-hint">${hint}</p>
      <div class="save-slot-list">
        ${slots.map((entry) => renderSaveSlotCard(entry, mode)).join('')}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn-secondary" id="slot-cancel">取消</button>
      </div>
    </div>`;
}

function openSaveSlotModal(mode) {
  const slots = listSaveSlots();
  if (mode === 'load' && slots.every((s) => s.empty)) {
    showToast('没有任何存档');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = renderSaveSlotModal(slots, mode);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  overlay.querySelector('#slot-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  overlay.querySelectorAll('.save-slot:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slot = Number(btn.dataset.slot);
      if (mode === 'save') {
        const result = engine.saveGame(slot);
        if (result.error) {
          showToast(result.error);
          return;
        }
        const s = result.summary;
        showToast(`已存入存档 ${slot + 1}（${s.dayLabel} · ${s.shelterName}）`);
        close();
        return;
      }

      if (!window.confirm(`读取存档 ${slot + 1}？当前进度将被替换。`)) return;
      const result = engine.loadGame(slot);
      if (result.error) {
        showToast(result.error);
        return;
      }
      showToast('读档成功');
      close();
      render();
    });
  });
}

function maybeShowNearDeath() {
  if (!engine.getState().pendingNearDeath) return;

  const cost = engine.rules.nearDeathCost;
  const ctx = engine.getState().pendingNearDeathContext;
  const needLine = ctx?.need ? `<p>开启下一天需要 <strong>${ctx.need}</strong> 物资。</p>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>濒死</h2>
      ${needLine}
      <p>消耗 <strong>${cost}</strong> 物资可跳过本天并免除本次开启新一天的消耗；否则游戏结束。</p>
      <p style="font-size:0.85rem">当前物资：${engine.getState().stats.supplies}</p>
      <div class="modal-actions">
        <button type="button" class="btn-primary" id="nd-skip">消耗 ${cost} 物资跳过</button>
        <button type="button" class="btn-secondary" id="nd-die">放弃</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  $('#nd-skip').addEventListener('click', () => {
    engine.resolveNearDeath(true);
    overlay.remove();
    render();
  });
  $('#nd-die').addEventListener('click', () => {
    engine.resolveNearDeath(false);
    overlay.remove();
    render();
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined' && document.getElementById('app')) {
  init();
}
