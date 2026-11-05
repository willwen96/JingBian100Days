/**
 * 判断效果文字对玩家是增益还是损失，用于标签配色。
 * 返回 'gain' | 'loss' | 'neutral'
 */
export function effectTone(text) {
  if (!text) return 'neutral';
  const t = String(text);

  if (t.includes('肾上腺素已消耗') || t.includes('本次无消耗') || t.includes('免除')) return 'gain';
  if (t.startsWith('失去')) return 'loss';
  if (t.startsWith('获得')) return 'gain';
  if (t.startsWith('下一天无法')) return 'loss';

  // 「物资 120 → 60」
  const arrow = t.match(/(-?\d+)\s*→\s*(-?\d+)/);
  if (arrow) {
    const [a, b] = [Number(arrow[1]), Number(arrow[2])];
    if (b > a) return 'gain';
    if (b < a) return 'loss';
    return 'neutral';
  }

  const delta = t.match(/([+-])\d+/);
  if (delta) {
    // 「每日物资消耗 +5」：消耗增加是坏事
    const inverted = t.includes('消耗');
    const positive = delta[1] === '+';
    return positive !== inverted ? 'gain' : 'loss';
  }
  return 'neutral';
}

/** 「弹药 -3，物资 -5」→ ['弹药 -3', '物资 -5'] */
export function splitCostLog(costLog) {
  if (!costLog) return [];
  if (String(costLog).includes('肾上腺素')) return [String(costLog)];
  return String(costLog)
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatDelta(n) {
  return n > 0 ? `+${n}` : `${n}`;
}
