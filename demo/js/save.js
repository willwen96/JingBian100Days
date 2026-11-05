/** 本地存档：3 个槽位，写入 localStorage */

export const SAVE_VERSION = 1;
export const SAVE_SLOT_COUNT = 3;
export const SAVE_SLOT_KEY_PREFIX = '100days:save:v1:';

const SHELTER_NAMES = { villa: '山中别墅', bunker: '城郊防空洞' };

function slotStorageKey(slot) {
  if (slot < 0 || slot >= SAVE_SLOT_COUNT) return null;
  return `${SAVE_SLOT_KEY_PREFIX}${slot}`;
}

export function serializePlainState(state) {
  if (!state) return null;
  const plain = {
    ...state,
    onceUsed: [...(state.onceUsed || [])],
  };
  return JSON.parse(JSON.stringify(plain));
}

export function deserializePlainState(raw) {
  if (!raw) return null;
  const state = {
    ...raw,
    onceUsed: new Set(raw.onceUsed || []),
  };
  if (state.lastResult != null || state.lastEffectSummary != null) {
    if (!state.lastChoiceOutcome) {
      const legacyText = state.lastResult;
      state.lastChoiceOutcome =
        legacyText || state.lastEffectSummary
          ? {
              text:
                legacyText?.includes('【结果】')
                  ? legacyText.split('\n\n【结果】')[0].trim() || null
                  : legacyText || null,
              effects: state.lastEffectSummary?.length ? state.lastEffectSummary : null,
            }
          : null;
    }
    delete state.lastResult;
    delete state.lastEffectSummary;
  }
  if (!('lastChoiceOutcome' in state)) state.lastChoiceOutcome = null;
  if (!('lastSceneOutcome' in state)) state.lastSceneOutcome = null;
  if (!state.choiceLog) state.choiceLog = [];
  return state;
}

/** 存档摘要：庇护所、天数、伙伴（供槽位列表展示） */
export function buildSaveSummary(engine) {
  const s = engine.state;
  const partnerNames = s.partners.map((id) => engine.getPartnerName(id));
  return {
    day: s.day,
    dayLabel: s.day > 0 ? `第 ${s.day} 天` : '爆发前',
    shelter: s.shelter,
    shelterName: s.shelter ? SHELTER_NAMES[s.shelter] : '—',
    partners: partnerNames,
    partnersLabel: partnerNames.length ? partnerNames.join('、') : '无',
  };
}

export function serializeGame(engine) {
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    summary: buildSaveSummary(engine),
    dayCheckpointKey: engine.dayCheckpointKey ?? null,
    dayRestartUsed: engine.dayRestartUsed ?? false,
    dayCheckpoint: engine.dayCheckpoint
      ? { state: serializePlainState(engine.dayCheckpoint.state) }
      : null,
    state: serializePlainState(engine.state),
  };
}

const VALID_MODES = new Set(['pre', 'day', 'event', 'explore', 'explore_pick', 'gameover', 'demo_complete']);
const ARRAY_FIELDS = ['partners', 'items', 'tags', 'closedExploreAreas', 'disabledFixedEvents', 'log', 'choiceLog'];

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/**
 * 校验存档 state 结构及其引用的事件/区域/天数是否仍存在于当前数据中。
 * 返回 null 表示有效，否则返回错误原因。
 */
export function validateSavedState(raw, engine) {
  if (!isPlainObject(raw)) return '存档数据无效';
  if (!VALID_MODES.has(raw.mode)) return '存档数据无效';
  if (!Number.isInteger(raw.day) || raw.day < 0) return '存档数据无效';
  const st = raw.stats;
  if (!isPlainObject(st) || !['humanity', 'supplies', 'ammo'].every((k) => Number.isFinite(st[k]))) {
    return '存档数据无效';
  }
  for (const f of ARRAY_FIELDS) {
    if (raw[f] != null && !Array.isArray(raw[f])) return '存档数据无效';
  }
  if (!Array.isArray(raw.partners) || !Array.isArray(raw.items) || !Array.isArray(raw.tags)) {
    return '存档数据无效';
  }
  if (raw.flags != null && !isPlainObject(raw.flags)) return '存档数据无效';
  if (raw.onceUsed != null && !Array.isArray(raw.onceUsed)) return '存档数据无效';

  const stale = '存档与当前游戏版本不匹配';
  if (raw.mode === 'pre' && engine?.preOutbreak) {
    if (!engine.preOutbreak.days?.some((d) => d.phase === raw.prePhase)) return stale;
  }
  if (raw.mode === 'day' && engine?.allDays && raw.day > 0) {
    if (!engine.allDays.some((d) => d.day === raw.day)) return stale;
  }
  if (raw.mode === 'event') {
    if (!isPlainObject(raw.event) || typeof raw.event.id !== 'string') return '存档数据无效';
    if (raw.event.id === 'companion_convert_night') {
      if (!isPlainObject(raw.event.meta) || !Array.isArray(raw.event.meta.eligible)) return '存档数据无效';
    } else if (engine?.events && !engine.events[raw.event.id]) {
      return stale;
    }
  }
  if (raw.mode === 'explore') {
    if (!isPlainObject(raw.explore) || typeof raw.explore.areaId !== 'string') return '存档数据无效';
    if (engine?.exploration && !engine.exploration[raw.explore.areaId]) return stale;
  }
  return null;
}

function normalizeState(raw) {
  const state = deserializePlainState(raw);
  for (const f of ARRAY_FIELDS) {
    if (!Array.isArray(state[f])) state[f] = [];
  }
  if (!isPlainObject(state.flags)) state.flags = {};
  return state;
}

export function applySavedGame(engine, payload) {
  if (!isPlainObject(payload) || !payload.state) {
    return { error: '存档数据无效' };
  }
  if (payload.version !== SAVE_VERSION) {
    return { error: '存档版本不兼容' };
  }
  const invalid = validateSavedState(payload.state, engine);
  if (invalid) return { error: invalid };
  const checkpointState = payload.dayCheckpoint?.state;
  const checkpointValid = checkpointState && !validateSavedState(checkpointState, engine);

  engine.state = normalizeState(payload.state);
  engine.dayCheckpointKey = payload.dayCheckpointKey ?? null;
  engine.dayRestartUsed = payload.dayRestartUsed ?? false;
  engine.dayCheckpoint = checkpointValid ? { state: normalizeState(checkpointState) } : null;
  return { ok: true, summary: payload.summary ?? null };
}

export function canSaveGame(state) {
  return state?.mode && state.mode !== 'intro';
}

export function saveGameToSlot(engine, slot) {
  const key = slotStorageKey(slot);
  if (key == null) return { error: '无效的存档槽位' };
  if (!canSaveGame(engine.state)) {
    return { error: '当前无法存档' };
  }
  if (typeof localStorage === 'undefined') {
    return { error: '当前环境不支持存档' };
  }
  const payload = serializeGame(engine);
  localStorage.setItem(key, JSON.stringify(payload));
  return { ok: true, slot, summary: payload.summary };
}

export function loadGameFromSlot(slot) {
  const key = slotStorageKey(slot);
  if (key == null || typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 列出 3 个槽位及其摘要（空槽 summary 为 null） */
export function listSaveSlots() {
  return Array.from({ length: SAVE_SLOT_COUNT }, (_, slot) => {
    const payload = loadGameFromSlot(slot);
    return {
      slot,
      empty: !payload,
      savedAt: payload?.savedAt ?? null,
      summary: payload?.summary ?? null,
    };
  });
}

export function hasAnySaveSlot() {
  return listSaveSlots().some((s) => !s.empty);
}

export function formatSaveSlotTime(savedAt) {
  if (!savedAt) return '';
  return new Date(savedAt).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
