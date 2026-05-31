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

export function applySavedGame(engine, payload) {
  if (!payload?.state) {
    return { error: '存档数据无效' };
  }
  if (payload.version !== SAVE_VERSION) {
    return { error: '存档版本不兼容' };
  }

  engine.state = deserializePlainState(payload.state);
  engine.dayCheckpointKey = payload.dayCheckpointKey ?? null;
  engine.dayRestartUsed = payload.dayRestartUsed ?? false;
  engine.dayCheckpoint = payload.dayCheckpoint
    ? { state: deserializePlainState(payload.dayCheckpoint.state) }
    : null;
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
