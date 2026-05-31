/**
 * 结局评分 — 手册公式见 data/scoring.json
 * ((人性值 × humanityMultiplier) + 非大结局词条分数之和) × 大结局词条分数
 */

export function buildTagsById(tags) {
  return Object.fromEntries(tags.map((t) => [t.id, t]));
}

/**
 * @param {object} state - 含 stats.humanity、tags[]
 * @param {Record<string, { id: string, name?: string, score?: number, isFinale?: boolean }>} tagsById
 * @param {object} scoringConfig - scoring.json
 */
export function calculateEndingScore(state, tagsById, scoringConfig) {
  const humanity = state.stats?.humanity ?? 0;
  const humanityMultiplier = scoringConfig?.formula?.humanityMultiplier ?? 10;
  const finaleMultiplierWhenNone = scoringConfig?.formula?.finaleMultiplierWhenNone ?? 1;

  const additiveTags = [];
  let finaleTag = null;
  let finaleMultiplier = finaleMultiplierWhenNone;

  for (const tagId of state.tags ?? []) {
    const def = tagsById[tagId];
    const score = def?.score ?? 0;
    const entry = {
      id: tagId,
      name: def?.name ?? tagId,
      score,
    };

    if (def?.isFinale) {
      finaleTag = entry;
      finaleMultiplier = score;
    } else {
      additiveTags.push(entry);
    }
  }

  const tagScoreSum = additiveTags.reduce((s, t) => s + t.score, 0);
  const humanityPart = humanity * humanityMultiplier;
  const baseSum = humanityPart + tagScoreSum;
  const totalScore = baseSum * finaleMultiplier;
  const grade = resolveGrade(totalScore, scoringConfig?.grades ?? []);

  return {
    humanity,
    humanityMultiplier,
    humanityPart,
    tagScoreSum,
    additiveTags,
    finaleTag,
    finaleMultiplier,
    baseSum,
    totalScore,
    grade,
    formulaDescription: scoringConfig?.formulaDescription ?? '',
  };
}

/**
 * @param {number} score
 * @param {Array<{ rank: string, min: number | null, max: number | null, label: string }>} grades
 */
export function resolveGrade(score, grades) {
  for (const g of grades) {
    const min = g.min ?? -Infinity;
    const max = g.max ?? Infinity;
    if (score >= min && score <= max) {
      return { rank: g.rank, label: g.label };
    }
  }
  return { rank: '?', label: '未知' };
}

/**
 * @param {ReturnType<typeof calculateEndingScore>} result
 */
export function formatScoreBreakdownLines(result) {
  const lines = [];
  lines.push(`人性 ${result.humanity} × ${result.humanityMultiplier} = ${result.humanityPart}`);
  if (result.additiveTags.length) {
    const parts = result.additiveTags.map((t) => `${t.name} ${fmtSigned(t.score)}`);
    lines.push(`词条合计 ${fmtSigned(result.tagScoreSum)}（${parts.join('、')}）`);
  } else {
    lines.push('词条合计 0');
  }
  lines.push(`小计 ${result.baseSum}`);
  if (result.finaleTag) {
    lines.push(`× 大结局《${result.finaleTag.name}》 ${result.finaleMultiplier}`);
  } else {
    lines.push(`× 大结局乘数 ${result.finaleMultiplier}`);
  }
  lines.push(`= ${formatTotalScore(result.totalScore)}`);
  return lines;
}

function fmtSigned(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function formatTotalScore(n) {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, '');
}
