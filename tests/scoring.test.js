import { describe, expect, it } from 'vitest';

import {
  buildTagsById,
  calculateEndingScore,
  formatScoreBreakdownLines,
  resolveGrade,
} from '../demo/js/scoring.js';
import { loadFixtureData } from './helpers/load-data.js';

const fixture = await loadFixtureData();
const tagsById = buildTagsById(fixture.tags);
const scoring = fixture.scoring;

describe('ending score', () => {
  it('applies handbook formula with finale multiplier', () => {
    const state = {
      stats: { humanity: 50 },
      tags: ['救世主', '高墙之内'],
    };
    const result = calculateEndingScore(state, tagsById, scoring);

    expect(result.humanityPart).toBe(500);
    expect(result.tagScoreSum).toBe(300);
    expect(result.baseSum).toBe(800);
    expect(result.finaleMultiplier).toBe(2);
    expect(result.totalScore).toBe(1600);
    expect(result.grade.rank).toBe('B');
  });

  it('uses finaleMultiplierWhenNone when no finale tag', () => {
    const state = {
      stats: { humanity: 40 },
      tags: ['伙伴', '复仇者'],
    };
    const result = calculateEndingScore(state, tagsById, scoring);

    expect(result.baseSum).toBe(40 * 10 + 350 + 400);
    expect(result.finaleMultiplier).toBe(1);
    expect(result.totalScore).toBe(1150);
  });

  it('uses last finale tag when multiple exist', () => {
    const state = {
      stats: { humanity: 50 },
      tags: ['高墙之内', '真正的救世主'],
    };
    const result = calculateEndingScore(state, tagsById, scoring);

    expect(result.finaleMultiplier).toBe(1.7);
    expect(result.finaleTag.id).toBe('真正的救世主');
    expect(result.tagScoreSum).toBe(0);
  });

  it('resolves X grade for negative totals', () => {
    expect(resolveGrade(-50, scoring.grades).rank).toBe('X');
    expect(resolveGrade(500, scoring.grades).rank).toBe('C');
    expect(resolveGrade(3500, scoring.grades).rank).toBe('S');
    expect(resolveGrade(8000, scoring.grades).rank).toBe('SSS');
  });

  it('formats breakdown lines for display', () => {
    const result = calculateEndingScore(
      { stats: { humanity: 50 }, tags: ['恋人', '真正的救世主'] },
      tagsById,
      scoring
    );
    const lines = formatScoreBreakdownLines(result);
    expect(lines.some((l) => l.includes('× 大结局'))).toBe(true);
    expect(lines[lines.length - 1]).toMatch(/^= /);
  });
});
