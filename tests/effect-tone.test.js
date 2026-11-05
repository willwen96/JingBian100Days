import { describe, expect, it } from 'vitest';

import { effectTone, splitCostLog } from '../web/src/utils/effectTone.js';

describe('effectTone', () => {
  it.each([
    ['人性 +10', 'gain'],
    ['物资 -5', 'loss'],
    ['弹药 -3', 'loss'],
    ['获得伙伴：莱姆', 'gain'],
    ['失去伙伴：布莱克', 'loss'],
    ['物资 120 → 60', 'loss'],
    ['物资 10 → 60', 'gain'],
    ['每日物资消耗 +5（持续）', 'loss'],
    ['每日物资消耗 -5（持续）', 'gain'],
    ['下一天无法进行常规行动', 'loss'],
    ['词条：布莱克', 'neutral'],
    ['庇护所 → 山中别墅', 'neutral'],
    ['肾上腺素已消耗，本次无消耗', 'gain'],
  ])('%s → %s', (text, tone) => {
    expect(effectTone(text)).toBe(tone);
  });

  it('splits cost log', () => {
    expect(splitCostLog('弹药 -3，物资 -5')).toEqual(['弹药 -3', '物资 -5']);
    expect(splitCostLog(null)).toEqual([]);
    expect(splitCostLog('肾上腺素已消耗，本次无消耗')).toHaveLength(1);
  });
});
