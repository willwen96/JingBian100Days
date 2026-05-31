import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  renderChoices,
  renderDemoComplete,
  renderEndingScore,
  renderGameOver,
  renderIntro,
  renderOutcomePanels,
  renderPlayShell,
  setEngineForTest,
} from '../demo/js/main.js';
import { calculateEndingScore, buildTagsById } from '../demo/js/scoring.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();
const tagsById = buildTagsById(fixture.tags);

describe('main render helpers', () => {
  setEngineForTest({
    rules: {
      formatBreakdown() {
        return '第 20 天基础消耗 -15';
      },
    },
  });

  it('escapes html-sensitive characters', () => {
    expect(escapeHtml('<tag>"x"&')).toBe('&lt;tag&gt;&quot;x&quot;&amp;');
  });

  it('renders intro content safely', () => {
    const html = renderIntro({
      intro: ['你好', '<危险>'],
      hostOpening: '主持人 <提示>',
    });

    expect(html).toContain('&lt;危险&gt;');
    expect(html).toContain('主持人 &lt;提示&gt;');
  });

  it('renders play shell with split choice and scene outcomes', () => {
    const html = renderPlayShell({
      day: 20,
      partners: ['露娜'],
      items: ['收音机'],
      tags: ['末世女王'],
      stats: { humanity: 60, supplies: 90, ammo: 25 },
      shelter: '城郊防空洞',
      choiceOutcome: { text: '广播内容', effects: ['人性 +5'] },
      sceneOutcome: { label: '第 20 天', text: null, effects: ['物资 +10'] },
      lastCostLog: '弹药 -5',
      nextDayCostPreview: { nextDay: 25, total: 15, breakdown: [{ label: '第 25 天基础消耗', amount: 15 }] },
      hostReminder: '尽量保留三十颗以上的弹药',
      adrenalineReady: true,
      skipDayActions: false,
      title: '惊变二十天',
      narrative: '今天你决定……',
    });

    expect(html).toContain('上一步选择');
    expect(html).toContain('广播内容');
    expect(html).toContain('人性 +5');
    expect(html).toContain('第 20 天');
    expect(html).toContain('物资 +10');
    expect(html).toContain('choice-outcome-banner');
    expect(html).toContain('scene-outcome-banner');
    expect(html).toContain('弹药 -5');
    expect(html).toContain('开启第 <strong>25</strong> 天预计消耗物资');
    expect(html).toContain('肾上腺素已就绪');
    expect(html).toContain('伙伴 <strong>露娜</strong>');
  });

  it('renders outcome panels with choice-only or scene-only content', () => {
    const both = renderOutcomePanels({
      choiceOutcome: { text: '你救下了伊芙琳。', effects: ['人性 +10'] },
      sceneOutcome: { label: '亚当夏娃·八十五天', effects: ['物资 +10000'] },
    });
    expect(both).toContain('上一步选择');
    expect(both).toContain('亚当夏娃·八十五天');
    expect(both).not.toContain('人性 +10 · 物资 +10000');
  });

  it('renders special choices and disabled hints', () => {
    const html = renderChoices([
      {
        id: 'dawn_camp',
        text: '前往黎明者营地',
        special: true,
        specialLabel: '特殊事件',
        disabled: true,
        hint: '此地已不再欢迎你',
      },
    ]);

    expect(html).toContain('choice-special');
    expect(html).toContain('特殊事件');
    expect(html).toContain('disabled');
    expect(html).toContain('此地已不再欢迎你');
  });

  it('renders numeric input choices with an input box and submit button', () => {
    const html = renderChoices([
      {
        id: 'kill_custom',
        text: '输入要击杀的丧尸数量',
        disabled: false,
        hint: '输入 1-10 · 弹药 -1',
        input: {
          type: 'number',
          min: 1,
          max: 10,
          step: 1,
          defaultValue: 5,
          label: '击杀数量',
          submitText: '确认击杀',
          placeholder: '1-10',
        },
      },
    ]);

    expect(html).toContain('type="number"');
    expect(html).toContain('data-input-for="kill_custom"');
    expect(html).toContain('确认击杀');
    expect(html).toContain('击杀数量');
  });

  it('renders game over story and reason separately', () => {
    const html = renderGameOver({
      choiceOutcome: { text: '露娜留下了字条。', effects: null },
      reason: '饥饿与悔恨吞噬了你。',
    });

    expect(html).toContain('露娜留下了字条。');
    expect(html).toContain('饥饿与悔恨吞噬了你。');
  });

  it('renders ending score panel with grade and formula', () => {
    const endingScore = calculateEndingScore(
      { stats: { humanity: 50 }, tags: ['救世主', '高墙之内'] },
      tagsById,
      fixture.scoring
    );
    const html = renderEndingScore(endingScore, tagsById);

    expect(html).toContain('结局分数');
    expect(html).toContain('1600');
    expect(html).toContain('B');
    expect(html).toContain('大结局');
    expect(html).toContain('高墙之内');
  });

  it('renders finale narrative at top of demo complete screen, not in tag list', () => {
    const endingScore = calculateEndingScore(
      { stats: { humanity: 50 }, tags: ['救世主', '高墙之内'] },
      tagsById,
      fixture.scoring
    );
    const finaleText =
      '惊变100天，丧尸进化的越来越强大，甚至有一些已经具备了思考能力。围绕着这所四面环山的别墅，所有幸存者开始驻立一座十米高的城墙……尼奥在高墙外的大门上写了八个字：高墙之内，丧尸禁行';
    const html = renderDemoComplete({
      state: {
        stats: { humanity: 50, supplies: 10000, ammo: 20 },
        shelter: 'villa',
      },
      endingScore,
      tags: tagsById,
      finaleTitle: '高墙之内',
      finaleNarrative: finaleText,
    });

    expect(html.indexOf(finaleText)).toBeLessThan(html.indexOf('结局分数'));
    expect(html).toContain('class="tag-finale"');
    expect(html).not.toMatch(/tag-finale[\s\S]*tag-flavor/);
    expect(html).toContain('高墙之内');
  });

  it('marks negative tag scores with a distinct class in tag list', () => {
    const endingScore = calculateEndingScore(
      { stats: { humanity: 50 }, tags: ['自私的胆小鬼', '高墙之内'] },
      tagsById,
      fixture.scoring
    );
    const html = renderEndingScore(endingScore, tagsById);

    expect(html).toContain('tag-score tag-score-negative">-350');
    expect(html).not.toMatch(/tag-finale[\s\S]*tag-score-negative/);
  });
});
