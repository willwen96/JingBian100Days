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
    (fn) => {
      if (!engine) return { error: '游戏未加载' };
      const result = fn(engine);
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
    refresh,
    run,
    saveSlots: engine ? listSaveSlots() : [],
    hasSavedGame: hasAnySaveSlot(),
  };
}
