import { describe, expect, it } from 'vitest';

import { loadFixtureData } from './helpers/load-data.js';
import { playOnce, POLICIES, PRE_COMBOS } from './helpers/playtest.js';

const fixture = await loadFixtureData();
const fmt = (p) => `[${p.outcome}] seed ${p.seed} ${p.policy} @ ${p.where}: ${p.message}\n  ${p.trace.join('\n  ')}`;

// 完整的 1000+ 局见 `npm run playtest`；这里跑一个小样本防回归
describe('playtest (no dead ends without cheating)', () => {
  it('300 random games all end in gameover or an ending', () => {
    const bad = [];
    for (let seed = 1; seed <= 300; seed++) {
      const r = playOnce(fixture, { seed, policy: 'random' });
      if (!['gameover', 'complete'].includes(r.outcome)) bad.push(fmt(r));
    }
    expect(bad, bad.join('\n\n')).toEqual([]);
  });

  it('every policy × pre-outbreak combo finishes', () => {
    const bad = [];
    let seed = 5000;
    for (const policy of Object.keys(POLICIES)) {
      for (const pre of PRE_COMBOS) {
        const r = playOnce(fixture, { seed: seed++, policy, pre });
        if (!['gameover', 'complete'].includes(r.outcome)) bad.push(fmt(r));
      }
    }
    expect(bad, bad.join('\n\n')).toEqual([]);
  });
});
