import { useCallback, useEffect, useMemo, useState } from 'react';

import { GameEngine, loadGameData } from '@engine/engine.js';
import { hasAnySaveSlot, listSaveSlots } from '@engine/save.js';

/** Vite BASE_URL → loadGameData 前缀（如 /100Days/ → /100Days） */
function dataBasePath() {
  const base = import.meta.env.BASE_URL || '/';
  return base === '/' ? '' : base.replace(/\/$/, '');
}

export function useGame() {
  const [engine, setEngine] = useState(null);
  const [tick, setTick] = useState(0);
  const [loadError, setLoadError] = useState(null);
  const [lastDay, setLastDay] = useState(null);
  const [dayPulse, setDayPulse] = useState(false);
  /** 本步操作造成的数值变化（人性/物资/弹药），用于顶部差值提示 */
  const [statDelta, setStatDelta] = useState(null);

  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadGameData(dataBasePath());
        if (cancelled) return;
        setEngine(new GameEngine(data));
      } catch (err) {
        if (!cancelled) setLoadError(err.message || String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    if (!engine) return null;
    void tick;
    return engine.getView();
  }, [engine, tick]);

  useEffect(() => {
    if (!view?.day) return;
    if (lastDay != null && view.day !== lastDay && view.day > 0) {
      setDayPulse(true);
      const t = setTimeout(() => setDayPulse(false), 900);
      return () => clearTimeout(t);
    }
    setLastDay(view.day);
  }, [view?.day, lastDay]);

  const run = useCallback(
    (fn, { trackDelta = false } = {}) => {
      if (!engine) return { error: '游戏未加载' };
      const before = { ...engine.state.stats };
      const result = fn(engine);
      if (trackDelta && !result?.error) {
        const after = engine.state.stats;
        const delta = {};
        for (const k of ['humanity', 'supplies', 'ammo']) delta[k] = (after[k] ?? 0) - (before[k] ?? 0);
        setStatDelta((prev) => ({ delta, key: (prev?.key ?? 0) + 1 }));
      } else if (!trackDelta) {
        setStatDelta(null);
      }
      refresh();
      return result;
    },
    [engine, refresh]
  );

  return {
    engine,
    view,
    loadError,
    dayPulse,
    statDelta,
    refresh,
    run,
    saveSlots: engine ? listSaveSlots() : [],
    hasSavedGame: hasAnySaveSlot(),
  };
}
