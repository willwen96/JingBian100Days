import { afterEach, describe, expect, it, vi } from 'vitest';

import { playDiceGame, playRussianRoulette } from '../demo/js/minigames.js';

function withRandomSequence(values) {
  let index = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => values[index++]);
}

describe('minigames', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('awards bonus supplies when dice rolls are all unique', () => {
    withRandomSequence([0.01, 0.2, 0.4, 0.7]); // 1, 2, 3, 5
    const state = { stats: { supplies: 0 } };

    const result = playDiceGame(state, 20);

    expect(result.win).toBe(true);
    expect(result.text).toContain('四点皆不相同');
    expect(state.stats.supplies).toBe(30);
  });

  it('keeps supplies unchanged when dice game loses', () => {
    withRandomSequence([0.01, 0.01, 0.4, 0.7]); // duplicate 1
    const state = { stats: { supplies: 0 } };

    const result = playDiceGame(state, 20);

    expect(result.win).toBe(false);
    expect(result.text).toContain('出现重复点数');
    expect(state.stats.supplies).toBe(0);
  });

  it('pays out 100 supplies on roulette survival', () => {
    withRandomSequence([0.01]); // roll 1
    const state = { stats: { supplies: 10 } };

    const result = playRussianRoulette(state);

    expect(result.survived).toBe(true);
    expect(result.roll).toBe(1);
    expect(state.stats.supplies).toBe(110);
  });

  it('returns game-over payload on roulette death', () => {
    withRandomSequence([0.55]); // roll 4
    const state = { stats: { supplies: 10 } };

    const result = playRussianRoulette(state);

    expect(result.survived).toBe(false);
    expect(result.gameOver).toBe(true);
    expect(result.grantTag).toBe('我不是主角');
    expect(state.stats.supplies).toBe(10);
  });
});
