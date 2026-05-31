/**
 * 《惊变100天》游戏引擎 — 数据驱动 + rules.json 规则层
 */

import { GameRules } from './rules.js';
import {
  getEligibleConvertPartners,
  buildCompanionConvertView,
  resolveCompanionConvertChoice,
} from './companion-convert.js';
import { playDiceGame, playRussianRoulette } from './minigames.js';
import { calculateEndingScore } from './scoring.js';
import {
  applySavedGame,
  deserializePlainState,
  loadGameFromSlot,
  saveGameToSlot,
  serializePlainState,
} from './save.js';

export {
  applySavedGame,
  deserializePlainState,
  listSaveSlots,
  loadGameFromSlot,
  saveGameToSlot,
  serializePlainState,
} from './save.js';

const SHELTER_NAMES = { villa: '山中别墅', bunker: '城郊防空洞' };

const PRE_PHASE_MAP = {
  phase_2h: 'pre_2h',
  phase_outbreak: 'outbreak_mall',
};

export function createInitialState(meta) {
  return {
    mode: 'intro',
    day: 0,
    prePhase: null,
    stats: { ...(meta.initialStats || { humanity: 50, supplies: 0, ammo: 0 }) },
    shelter: null,
    partners: [],
    items: [],
    tags: [],
    onceUsed: new Set(),
    flags: {},
    suppliesCostModifier: 0,
    adrenalineCharges: 0,
    exploreEventCount: 0,
    choseConvertToSupplies: false,
    skipNextDayActions: false,
    skipNextDayCostOnce: false,
    closedExploreAreas: [],
    disabledFixedEvents: [],
    event: null,
    explore: null,
    lastChoiceOutcome: null,
    lastSceneOutcome: null,
    lastCostLog: null,
    pendingNearDeath: false,
    pendingNearDeathContext: null,
    companionNightResolvedForTarget: null,
    gameOver: false,
    gameOverReason: null,
    demoComplete: false,
    route: null,
    endingScore: null,
    log: [],
    choiceLog: [],
  };
}

export class GameEngine {
  constructor(data) {
    this.meta = data.meta;
    this.preOutbreak = data.preOutbreak;
    this.allDays = data.days;
    this.demoMaxDay = data.rules?.demo?.maxDay ?? 10;
    this.days = data.days.filter(
      (d) => (d.choices?.length || d.choicesByRoute) && d.day <= this.demoMaxDay
    );
    this.events = Object.fromEntries(data.events.map((e) => [e.id, e]));
    this.exploration = Object.fromEntries(data.exploration.map((a) => [a.id, a]));
    this.tagsById = Object.fromEntries(data.tags.map((t) => [t.id, t]));
    this.scoring = data.scoring;
    this.rules = new GameRules(data.rules, data.partners || []);
    this.companionConvert = data.companionConvert;
    this.state = createInitialState(data.meta);
    this.dayCheckpoint = null;
    this.dayCheckpointKey = null;
    this.dayRestartUsed = false;
  }

  _isCompanionConvertEvent() {
    return this.state.event?.id === 'companion_convert_night';
  }

  getState() {
    return this.state;
  }

  getPartnerName(id) {
    return this._partnerName(id);
  }

  restart() {
    this.state = createInitialState(this.meta);
    this.dayCheckpoint = null;
    this.dayCheckpointKey = null;
    this.dayRestartUsed = false;
  }

  startGame() {
    this.state.mode = 'pre';
    this.state.prePhase = this.preOutbreak.days[0].phase;
    this.state.lastChoiceOutcome = null;
    this.state.lastSceneOutcome = null;
    this.state.lastCostLog = null;
    this._captureDayCheckpoint();
  }

  /** 将 state 深拷贝为可回滚快照（含 Set） */
  _cloneStateSnapshot(state = this.state) {
    return deserializePlainState(serializePlainState(state));
  }

  _dayCheckpointKey() {
    const s = this.state;
    if (s.mode === 'pre' || (s.day === 0 && s.prePhase)) {
      return `pre:${s.prePhase}`;
    }
    if (s.day > 0) return `day:${s.day}`;
    return null;
  }

  _captureDayCheckpoint() {
    const key = this._dayCheckpointKey();
    if (!key) return;
    if (this.dayCheckpointKey !== key) {
      this.dayRestartUsed = false;
      this.dayCheckpointKey = key;
    }
    this.dayCheckpoint = { state: this._cloneStateSnapshot() };
  }

  canRestartCurrentDay() {
    if (this.dayRestartUsed || !this.dayCheckpoint) return false;
    const mode = this.state.mode;
    if (mode === 'intro' || mode === 'gameover' || mode === 'demo_complete') return false;
    const key = this._dayCheckpointKey();
    return key != null && key === this.dayCheckpointKey;
  }

  restartCurrentDay() {
    if (!this.canRestartCurrentDay()) {
      return { error: this.dayRestartUsed ? '本天已使用过重新开启' : '当前无法重新开启当天' };
    }
    this.state = this._cloneStateSnapshot(this.dayCheckpoint.state);
    this.dayRestartUsed = true;
    return { ok: true };
  }

  saveGame(slot) {
    return saveGameToSlot(this, slot);
  }

  loadGame(slot) {
    const data = loadGameFromSlot(slot);
    if (!data) return { error: '该槽位没有存档' };
    return applySavedGame(this, data);
  }

  pickChoice(choiceId) {
    const located = this._locateChoice(choiceId);
    if (located.error) return { error: located.error };
    return this._executeChoice(located.choice);
  }

  pickChoiceWithInput(choiceId, rawValue) {
    const located = this._locateChoice(choiceId);
    if (located.error) return { error: located.error };
    const choice = located.choice;
    if (!choice.input) return { error: '该选项不需要输入' };

    const resolvedInput = this._resolveChoiceInput(choice, rawValue);
    if (resolvedInput.error) return { error: resolvedInput.error };

    return this._executeChoice(choice, resolvedInput);
  }

  _locateChoice(choiceId) {
    if (this._isCompanionConvertEvent()) {
      return { choice: { id: choiceId, _isCompanionConvertChoice: true } };
    }

    if (this.rules.shouldSkipDayActions(this.state) && this.state.mode === 'day') {
      return { error: '本日伤势过重，无法进行常规行动' };
    }

    const ctx = this._currentChoiceContext();
    if (!ctx) return { error: '无可选上下文' };

    const choice = ctx.choices.find((c) => c.id === choiceId);
    if (!choice) return { error: '无效选项' };

    return { choice };
  }

  _executeChoice(choice, overrides = {}) {
    if (choice._isCompanionConvertChoice) {
      return this._pickCompanionConvertChoice(choice.id);
    }

    const check = this._canPickChoice(choice, overrides.cost);
    if (!check.ok) return { error: check.reason };

    if (choice.requirements?.once) {
      this.state.onceUsed.add(this._onceKey(choice));
    }

    this.rules.trackChoiceForRules(choice, this.state);

    const resolved = this._resolveChoiceOutcome(choice, overrides);

    const baseCost = overrides.cost ?? choice.cost;
    const effectiveCost = this._getEffectiveChoiceCost(choice, baseCost);
    const payResult = this.rules.payChoiceCost(this.state, effectiveCost);
    if (!payResult.paid) {
      return { error: '资源不足，无法执行该选项' };
    }

    if (payResult.usedAdrenaline) {
      this._log('肾上腺素生效：本次选择免疫消耗');
      this.state.lastCostLog = '肾上腺素已消耗，本次无消耗';
    } else if (effectiveCost) {
      this.state.lastCostLog = this._formatCost(effectiveCost);
    } else {
      this.state.lastCostLog = null;
    }

    const effectSummary = this._applyEffects(resolved.effects);
    const resultText = this._resolveResultText(choice, resolved);
    this._setChoiceOutcome(resultText, effectSummary);
    const hasChoiceOutcome = !!(resultText?.trim() || effectSummary?.length);

    this._appendChoiceLog({
      context: this._choiceLogContextTitle(),
      choiceText: choice.text,
      resultText: resultText?.trim() || null,
      effects: effectSummary,
      costLog: this.state.lastCostLog,
    });

    if (resolved.effects?.nearDeath || choice.effects?.nearDeath) {
      return this._triggerNearDeath('choice');
    }

    if (resolved.effects?.gameOver) {
      return this._triggerGameOver('你已死亡');
    }

    const goto = resolved.goto || choice.goto;

    if (this.state.mode === 'explore' && goto?.type === 'event') {
      const area = this.exploration[this.state.explore?.areaId];
      if (area?.nodes?.[goto.nodeId]) {
        this.state.explore.nodeId = goto.nodeId;
        return { ok: true };
      }
      if (this.events[goto.eventId]) {
        this.state.explore = null;
        return this._enterEvent(goto.eventId, goto.nodeId || 'start');
      }
    }

    const minigameOutcome = this._runMinigame(choice);
    if (minigameOutcome?.gameOver) {
      return this._triggerGameOver(minigameOutcome.text, minigameOutcome.grantTag);
    }
    if (minigameOutcome?.text) {
      const mgSummary = this._applyEffects(minigameOutcome.extraEffects);
      this._setChoiceOutcome(minigameOutcome.text, mgSummary);
    }

    if (goto?.type === 'event' && goto.eventId === 'pre_outbreak') {
      return this._gotoPrePhase(goto.nodeId);
    }

    let preserveOnGoto = hasChoiceOutcome;
    if (minigameOutcome?.text) preserveOnGoto = true;
    const gotoOpts = preserveOnGoto ? { preserveChoiceOutcome: true } : {};
    return this._handleGoto(goto, gotoOpts);
  }

  resolveNearDeath(acceptSkip) {
    if (!this.state.pendingNearDeath) return;

    this.state.pendingNearDeath = false;
    const ctx = this.state.pendingNearDeathContext;
    this.state.pendingNearDeathContext = null;

    if (!acceptSkip) {
      return this._triggerGameOver('在濒死中倒下', '尽头');
    }

    const paid = this.rules.payNearDeathSkip(this.state);
    if (!paid.ok) {
      return this._triggerGameOver(paid.reason || '物资不足以脱离濒死', '尽头');
    }

    this._log(`消耗 ${paid.paid} 物资脱离濒死`);
    this.state.skipNextDayCostOnce = true;

    if (ctx?.source === 'insufficientDayCost' && ctx.targetDay) {
      return this._enterDayAfterCost(ctx.targetDay);
    }

    return this._handleGoto({ type: 'nextDay' });
  }

  pickExploreArea(areaId) {
    if (this.state.closedExploreAreas.includes(areaId)) {
      return { error: '该区域已不可用' };
    }
    const area = this.exploration[areaId];
    if (!area) return { error: '未知区域' };
    const reqCheck = area.requirements
      ? this._canPickChoice({ requirements: area.requirements })
      : { ok: true };
    if (!reqCheck.ok) return { error: reqCheck.reason };

    // 探索区域在进入后即视为已消耗，后续不再出现在列表中
    this.state.closedExploreAreas.push(areaId);
    this.state.explore = { areaId, nodeId: null };
    this.state.mode = 'explore';
    this._appendChoiceLog({
      context: this.state.day > 0 ? `第 ${this.state.day} 天` : '爆发前',
      choiceText: `外出探索：${area.name}`,
      resultText: area.onEnterResultText?.trim() || null,
      effects: null,
      costLog: null,
    });
    if (area.onEnterEffects || area.onEnterResultText) {
      const summary = area.onEnterEffects ? this._applyEffects(area.onEnterEffects) : null;
      this._setSceneOutcome(area.name || '探索', area.onEnterResultText, summary);
      const last = this.state.choiceLog[this.state.choiceLog.length - 1];
      if (last) last.effects = summary;
    } else {
      this._clearSceneOutcome();
    }
    return { ok: true };
  }

  getView() {
    const s = this.state;

    if (s.mode === 'intro') {
      return { type: 'intro', intro: this.meta.intro, hostOpening: this.meta.hostOpening };
    }
    if (s.mode === 'gameover') {
      return {
        type: 'gameover',
        reason: s.gameOverReason || '物资耗尽或死亡',
        choiceOutcome: s.lastChoiceOutcome,
        lastResult: this._choiceOutcomeMessage(),
        lastEffectSummary: s.lastChoiceOutcome?.effects ?? null,
        endingScore: s.endingScore,
        tagsById: this.tagsById,
        choiceLog: [...(s.choiceLog || [])],
      };
    }
    if (s.mode === 'demo_complete') {
      return {
        type: 'demo_complete',
        state: s,
        tags: this.tagsById,
        endingScore: s.endingScore,
        finaleTitle: s.endingScore?.finaleTag?.name ?? '大结局',
        finaleNarrative: this._resolveFinaleNarrative(s),
        choiceLog: [...(s.choiceLog || [])],
      };
    }

    const nextDay = s.day > 0 ? this._getNextPlayableDay(s.day) : null;
    const nextDayDef = nextDay ? this._getDayDef(nextDay) : null;
    const nextCostPreview =
      nextDay && nextDay <= this.demoMaxDay
        ? { ...this.rules.calculateDaySuppliesCost(nextDay, s, nextDayDef), nextDay }
        : null;

    const base = {
      stats: { ...s.stats },
      shelter: s.shelter ? SHELTER_NAMES[s.shelter] : '—',
      partners: s.partners.map((id) => this._partnerName(id)),
      items: [...s.items],
      tags: [...s.tags],
      choiceOutcome: s.lastChoiceOutcome,
      sceneOutcome: s.lastSceneOutcome,
      lastResult: this._choiceOutcomeMessage(),
      lastCostLog: s.lastCostLog,
      lastEffectSummary: s.lastChoiceOutcome?.effects ?? null,
      day: s.day,
      nextDayCostPreview: nextCostPreview,
      hostReminder: s.day > 0 ? this.rules.getHostReminder(s.day) : null,
      skipDayActions: this.rules.shouldSkipDayActions(s),
      adrenalineReady: this.rules.hasAdrenalineReady(s),
      canRestartDay: this.canRestartCurrentDay(),
      dayRestartUsed: this.dayRestartUsed,
      choiceLog: [...(s.choiceLog || [])],
      deadlockWarning: this._getDeadlockWarning(),
    };

    if (s.mode === 'pre') {
      const phase = this._getPrePhase();
      return {
        type: 'play',
        ...base,
        title: phase.title,
        narrative: phase.openingText,
        choices: this._mapChoices(phase.choices),
      };
    }

    if (s.mode === 'day') {
      const dayDef = this._getDayDef(s.day);
      return {
        type: 'play',
        ...base,
        title: dayDef?.title || `第 ${s.day} 天`,
        narrative: this._resolveDayOpeningText(dayDef),
        choices: this._mapChoices(this._resolveDayChoices(dayDef)),
        hostNote: dayDef?.hostNote,
        route: s.route,
      };
    }

    if (s.mode === 'event') {
      if (this._isCompanionConvertEvent()) {
        const cc = buildCompanionConvertView(s, this.companionConvert, (id) => this._partnerName(id));
        if (cc) {
          return {
            type: 'play',
            ...base,
            title: cc.title,
            narrative: cc.narrative,
            choices: this._mapChoices(cc.choices),
          };
        }
      }

      const node = this._getEventNode(s.event.id, s.event.nodeId);
      const ev = this.events[s.event.id];
      return {
        type: 'play',
        ...base,
        title: ev?.title || '事件',
        narrative: this._resolveNodeText(node),
        choices: this._mapChoices(node?.choices || []),
      };
    }

    if (s.mode === 'explore_pick') {
      return {
        type: 'explore_pick',
        ...base,
        title: '外出探索',
        narrative: '你选择外出探索物资。今天你想去哪里？',
        areas: this._getAvailableExploreAreas().map((id) => ({
          id,
          name: this.exploration[id]?.name || id,
        })),
      };
    }

    if (s.mode === 'explore') {
      const ex = s.explore;
      const area = this.exploration[ex.areaId];
      if (ex.nodeId && area.nodes?.[ex.nodeId]) {
        const node = area.nodes[ex.nodeId];
        return {
          type: 'play',
          ...base,
          title: area.name,
          narrative: node.narrative || area.openingText,
          choices: this._mapChoices(node.choices || []),
        };
      }
      return {
        type: 'play',
        ...base,
        title: area.name,
        narrative: area.openingText,
        choices: this._mapChoices(area.choices || []),
      };
    }

    return { type: 'unknown' };
  }

  _partnerName(id) {
    const map = { lime: '莱姆', blake: '布莱克', luna: '露娜', evelyn: '伊芙琳', john: '约翰', baby: '婴儿' };
    return map[id] || id;
  }

  _getPrePhase() {
    return this.preOutbreak.days.find((d) => d.phase === this.state.prePhase);
  }

  _getDayDef(day) {
    return this.allDays.find((d) => d.day === day);
  }

  /** 按结局线解析当日选项（85/90/100 等路线专属天） */
  _resolveDayChoices(dayDef) {
    if (!dayDef) return [];
    if (dayDef.choicesByRoute && this.state.route) {
      const routed = dayDef.choicesByRoute[this.state.route];
      if (routed?.length) return routed;
    }
    if (dayDef.routeOnly) return [];

    return (dayDef.choices || []).filter((choice) => {
      const reqRoute = choice.requirements?.route;
      if (!reqRoute) return true;
      return reqRoute === this.state.route;
    });
  }

  _isDaySkippedForRoute(day) {
    const route = this.state.route;
    if (!route) return false;
    if (route === 'lone_wolf' && (day === 85 || day === 90)) return true;
    if (route === 'savior' && day === 85) return true;
    if ((route === 'savior' || route === 'savior_zombie') && day === 100) return true;
    return false;
  }

  _getEventNode(eventId, nodeId) {
    const ev = this.events[eventId];
    if (!ev) return null;
    return ev.nodes.find((n) => n.id === (nodeId || 'start')) || ev.nodes[0];
  }

  _currentChoiceContext() {
    const s = this.state;
    if (s.mode === 'pre') {
      const phase = this._getPrePhase();
      return phase ? { choices: phase.choices } : null;
    }
    if (s.mode === 'day') {
      const dayDef = this._getDayDef(s.day);
      return dayDef ? { choices: this._resolveDayChoices(dayDef) } : null;
    }
    if (s.mode === 'event') {
      if (this._isCompanionConvertEvent()) {
        const cc = buildCompanionConvertView(this.state, this.companionConvert, (id) =>
          this._partnerName(id)
        );
        return cc ? { choices: cc.choices } : null;
      }
      const node = this._getEventNode(s.event.id, s.event.nodeId);
      return node ? { choices: node.choices } : null;
    }
    if (s.mode === 'explore') {
      const area = this.exploration[s.explore.areaId];
      if (s.explore.nodeId && area.nodes?.[s.explore.nodeId]) {
        return { choices: area.nodes[s.explore.nodeId].choices };
      }
      return { choices: area.choices };
    }
    return null;
  }

  _getChoiceExploreAreaTarget(choice) {
    const resolved = this._resolveChoiceOutcome(choice);
    if (resolved.goto?.type === 'exploreArea' && resolved.goto.areaId) {
      return resolved.goto.areaId;
    }
    if (choice.goto?.type === 'exploreArea' && choice.goto.areaId) {
      return choice.goto.areaId;
    }
    return null;
  }

  _isExploreAreaChoiceUnavailable(choice) {
    const areaId = this._getChoiceExploreAreaTarget(choice);
    if (!areaId) return false;
    if (this.state.closedExploreAreas.includes(areaId)) return true;
    const area = this.exploration[areaId];
    if (!area) return true;
    if (area.requirements && !this._canPickChoice({ requirements: area.requirements }).ok) {
      return true;
    }
    return false;
  }

  _mapChoices(choices) {
    return (choices || [])
      .filter((c) => {
        if (c.requirements?.once && this.state.onceUsed.has(this._onceKey(c))) {
          return false;
        }
        if (this._isExploreAreaChoiceUnavailable(c)) {
          return false;
        }
        if (c.requirements?.hideWhenUnmet && !this._canPickChoice(c).ok) {
          return false;
        }
        return true;
      })
      .map((c) => {
        const check = this._canPickChoice(c);
        const showSpecial = this._shouldShowSpecialLabel(c);
        let hint = check.ok ? this._choiceHint(c) : check.reason;
        if (check.ok && c.requirements?.once) {
          hint = hint ? `${hint} · 仅可触发一次` : '仅可触发一次';
        }
        return {
          id: c.id,
          text: c.text,
          input: this._mapChoiceInput(c),
          disabled: Boolean(c.disabled) || !check.ok,
          hint,
          special: showSpecial,
          specialLabel: showSpecial ? c.specialLabel || '特殊事件' : null,
        };
      });
  }

  _choiceHint(choice) {
    if (choice.input?.type === 'number') {
      const range = `输入 ${choice.input.min}-${choice.input.max}`;
      const costHint = this._costHint(
        this._getEffectiveChoiceCost(choice, this._getInputBaseCost(choice))
      );
      return costHint ? `${range} · ${costHint}` : range;
    }
    return this._costHint(this._getEffectiveChoiceCost(choice));
  }

  _mapChoiceInput(choice) {
    if (choice.input?.type !== 'number') return null;

    const input = choice.input;
    const max = this._getInputMax(choice);
    const min = input.min;
    const step = input.step ?? 1;
    const defaultValue = Math.min(Math.max(input.defaultValue ?? min, min), max);

    return {
      type: 'number',
      min,
      max,
      step,
      defaultValue,
      label: input.label || '请输入数值',
      placeholder: input.placeholder || `${min}-${max}`,
      submitText: input.submitText || '确认',
    };
  }

  _getInputBaseCost(choice) {
    if (choice.input?.type !== 'number' || !choice.input.perUnitCost) return choice.cost;
    return this._scaleCost(choice.input.perUnitCost, choice.input.min);
  }

  _getMatchedBranch(choice, context = {}) {
    if (!choice.branches?.length) return null;
    return choice.branches.find((b) => this._matchWhen(b.when, context)) || null;
  }

  /** 结算时扣费：合并当前命中 branch 的 cost */
  _getEffectiveChoiceCost(choice, baseCost = choice.cost) {
    const branch = this._getMatchedBranch(choice);
    return this._mergeCosts(baseCost, branch?.cost);
  }

  _getInputMax(choice) {
    if (choice.input?.type !== 'number') return choice.input?.max ?? null;
    if (this.rules.hasAdrenalineReady(this.state) || !choice.input.perUnitCost) {
      return choice.input.max;
    }

    const caps = [choice.input.max];
    const { ammo = 0, supplies = 0 } = choice.input.perUnitCost;
    if (ammo > 0) caps.push(Math.floor(this.state.stats.ammo / ammo));
    if (supplies > 0) caps.push(Math.floor(this.state.stats.supplies / supplies));
    const max = Math.min(...caps);
    return Math.max(choice.input.min, max);
  }

  /** 当前状态下会命中的 branches（用于特殊事件/跳转判断） */
  _collectApplicableBranches(choice) {
    return (choice.branches ?? []).filter((b) => this._matchWhen(b.when));
  }

  /** 当前状态下实际会走到的 goto（branches 按 when 匹配，不含未生效分支） */
  _collectApplicableChoiceGotos(choice) {
    if (choice.branches?.length) {
      const gotos = this._collectApplicableBranches(choice).map((b) => b.goto).filter(Boolean);
      if (gotos.length) return gotos;
      return [];
    }
    return choice.goto ? [choice.goto] : [];
  }

  _isStoryEventGoto(goto) {
    return goto?.type === 'event' && goto.eventId && goto.eventId !== 'pre_outbreak';
  }

  /** 固定重复地点（如黎明者营地），不当作「特殊事件」标注 */
  _isRecurringFixedEventChoice(choice) {
    if (choice.id === 'dawn_camp') return true;
    if (choice.requirements?.fixedEventId) return true;
    return this._collectApplicableChoiceGotos(choice).some(
      (g) => g.type === 'event' && g.eventId === 'dawn_camp'
    );
  }

  /**
   * 特殊事件标红规则：
   * 1. 显式 specialEvent
   * 2. 当前命中的 branch 显式 specialEvent
   * 3. 从当前场景进入新的顶层剧情事件（如布莱克、露娜）
   * 4. 事件内跳转同一事件的后续节点不标红
   */
  _isSpecialChoice(choice) {
    if (this._isRecurringFixedEventChoice(choice)) return false;
    if (choice.specialEvent === true) return true;
    if (this._collectApplicableBranches(choice).some((b) => b.specialEvent === true)) return true;

    const storyGotos = this._collectApplicableChoiceGotos(choice).filter((g) =>
      this._isStoryEventGoto(g)
    );
    if (!storyGotos.length) return false;

    if (this.state.mode === 'event') {
      const currentId = this.state.event?.id;
      return storyGotos.some((g) => g.eventId !== currentId);
    }

    return true;
  }

  /** 外出探索（explore / explore_pick）不标注「特殊事件」；其余场景仍按 _isSpecialChoice 显示 */
  _shouldShowSpecialLabel(choice) {
    if (this.state.mode === 'explore' || this.state.mode === 'explore_pick') {
      return false;
    }
    if (this._isCompanionConvertEvent()) return Boolean(choice.special);
    return this._isSpecialChoice(choice);
  }

  _choiceLogContextTitle() {
    const s = this.state;
    if (s.mode === 'pre') {
      const phase = this._getPrePhase();
      return phase?.title || '爆发前';
    }
    if (s.mode === 'day') {
      const dayDef = this._getDayDef(s.day);
      return dayDef?.title || `第 ${s.day} 天`;
    }
    if (s.mode === 'event' && s.event) {
      return this.events[s.event.id]?.title || s.event.id;
    }
    if (s.mode === 'explore' && s.explore) {
      return this.exploration[s.explore.areaId]?.name || '探索';
    }
    return '—';
  }

  _appendChoiceLog(entry) {
    if (!this.state.choiceLog) this.state.choiceLog = [];
    this.state.choiceLog.push({
      index: this.state.choiceLog.length + 1,
      day: this.state.day,
      ...entry,
    });
  }

  _getDeadlockWarning() {
    const s = this.state;
    if (s.mode === 'gameover' || s.mode === 'demo_complete' || s.mode === 'intro') return null;
    if (s.pendingNearDeath) return null;

    if (s.mode === 'explore_pick') {
      if (!this._getAvailableExploreAreas().length) {
        return '当前没有可探索的区域，可能无法继续推进。';
      }
      return null;
    }

    const choices = this._getRawChoicesForCurrentContext();
    const enabled = this._mapChoices(choices).filter((c) => !c.disabled);
    if (!enabled.length) {
      return '当前没有可用选项，可能无法继续推进。请尝试读档或重新开启当天。';
    }
    return null;
  }

  _getRawChoicesForCurrentContext() {
    const s = this.state;
    if (s.mode === 'pre') return this._getPrePhase()?.choices || [];
    if (s.mode === 'day') return this._resolveDayChoices(this._getDayDef(s.day)) || [];
    if (s.mode === 'event') {
      if (this._isCompanionConvertEvent()) {
        const cc = buildCompanionConvertView(s, this.companionConvert, (id) => this._partnerName(id));
        return cc?.choices || [];
      }
      const node = this._getEventNode(s.event.id, s.event.nodeId);
      return node?.choices || [];
    }
    if (s.mode === 'explore') {
      const ex = s.explore;
      const area = this.exploration[ex?.areaId];
      if (ex?.nodeId && area?.nodes?.[ex.nodeId]) return area.nodes[ex.nodeId].choices || [];
      return area?.choices || [];
    }
    return [];
  }

  _costHint(cost) {
    if (this.rules.hasAdrenalineReady(this.state) && this.rules._hasMeaningfulCost(cost)) {
      return '肾上腺素：本次无消耗';
    }
    if (!cost) return null;
    return this._formatCost(cost);
  }

  _formatCost(cost) {
    const parts = [];
    if (cost.ammo) parts.push(`弹药 -${cost.ammo}`);
    if (cost.supplies) parts.push(`物资 -${cost.supplies}`);
    return parts.join('，');
  }

  _canPickChoice(choice, overrideCost) {
    if (choice.disabled) {
      return { ok: false, reason: '该选项不可用' };
    }
    const req = choice.requirements;
    const s = this.state;
    const baseCost = overrideCost ?? this._getInputBaseCost(choice);
    const effectiveCost = this._getEffectiveChoiceCost(choice, baseCost);

    if (req?.shelter && s.shelter !== req.shelter) {
      return { ok: false, reason: `需要：${SHELTER_NAMES[req.shelter]}` };
    }
    if (req?.tags?.length && !req.tags.every((t) => s.tags.includes(t))) {
      return { ok: false, reason: '缺少所需词条' };
    }
    if (req?.tagsNot?.length && req.tagsNot.some((t) => s.tags.includes(t))) {
      return { ok: false, reason: '当前词条条件不满足' };
    }
    if (req?.flags?.length && !req.flags.every((f) => s.flags[f])) {
      return { ok: false, reason: '当前剧情条件不满足' };
    }
    if (req?.flagsNot?.length && req.flagsNot.some((f) => s.flags[f])) {
      return { ok: false, reason: '当前剧情条件不满足' };
    }
    if (req?.partners?.length && !req.partners.every((p) => s.partners.includes(p))) {
      return { ok: false, reason: '缺少所需伙伴' };
    }
    if (req?.partnersNot?.length && req.partnersNot.some((p) => s.partners.includes(p))) {
      return { ok: false, reason: '当前伙伴条件不满足' };
    }
    if (req?.items?.length && !req.items.every((i) => s.items.includes(i))) {
      return { ok: false, reason: '缺少所需物品' };
    }
    if (req?.once && s.onceUsed.has(this._onceKey(choice))) {
      return { ok: false, reason: '已触发过' };
    }
    if (req?.dayRange) {
      const [min, max] = req.dayRange;
      if (s.day < min || s.day > max) return { ok: false, reason: '当前天数不可用' };
    }
    if (req?.minAmmo != null && s.stats.ammo < req.minAmmo) {
      return { ok: false, reason: `需要至少 ${req.minAmmo} 弹药` };
    }
    if (req?.maxAmmo != null && s.stats.ammo > req.maxAmmo) {
      return { ok: false, reason: `弹药须不超过 ${req.maxAmmo}` };
    }
    if (req?.fixedEventId && s.disabledFixedEvents.includes(req.fixedEventId)) {
      return { ok: false, reason: '此地已不再欢迎你' };
    }
    if (req?.route && s.route !== req.route) {
      return { ok: false, reason: '当前结局线不可用' };
    }

    if (this._isExploreAreaChoiceUnavailable(choice)) {
      return { ok: false, reason: '该区域已不可用' };
    }

    if (
      this.rules._hasMeaningfulCost(effectiveCost) &&
      !this.rules.hasAdrenalineReady(s) &&
      !this.rules.canAffordCost(s, effectiveCost)
    ) {
      return { ok: false, reason: '资源不足' };
    }

    if (!this.rules.hasAdrenalineReady(s)) {
      const outcome = this._resolveChoiceOutcome(
        choice,
        overrideCost != null ? { cost: overrideCost } : {}
      );
      const effects = outcome.effects || {};
      const suppliesNeed =
        (effectiveCost?.supplies ?? 0) + Math.max(0, -(effects.supplies ?? 0));
      const ammoNeed = (effectiveCost?.ammo ?? 0) + Math.max(0, -(effects.ammo ?? 0));
      if (suppliesNeed > 0 && s.stats.supplies < suppliesNeed) {
        return { ok: false, reason: '资源不足' };
      }
      if (ammoNeed > 0 && s.stats.ammo < ammoNeed) {
        return { ok: false, reason: '资源不足' };
      }
    }

    return { ok: true };
  }

  _onceKey(choice) {
    if (choice.requirements?.once) {
      const globalId = choice.requirements.onceKey || choice.id;
      return `once:global:${globalId}`;
    }
    const s = this.state;
    return `${s.mode}:${s.day}:${s.event?.id || ''}:${s.explore?.areaId || ''}:${s.explore?.nodeId || ''}:${choice.id}`;
  }

  _resolveChoiceOutcome(choice, overrides = {}) {
    let effects = { ...(choice.effects || {}) };
    let resultText = choice.resultText;
    let goto = choice.goto;

    if (choice.id === 'shelter_villa') effects.setShelter = 'villa';
    if (choice.id === 'shelter_bunker') effects.setShelter = 'bunker';

    const branchContext = { inputValue: overrides.inputValue };
    const branch = this._getMatchedBranch(choice, branchContext);
    if (branch) {
      if (branch.effects) effects = { ...effects, ...branch.effects };
      if (branch.resultText) resultText = branch.resultText;
      if (branch.goto) goto = branch.goto;
    }

    if (overrides.effects) effects = { ...effects, ...overrides.effects };
    if (overrides.resultText !== undefined) resultText = overrides.resultText;
    if (overrides.goto) goto = overrides.goto;

    return { effects, resultText, goto };
  }

  _resolveChoiceInput(choice, rawValue) {
    const input = choice.input;
    if (input?.type !== 'number') return { error: '该选项不支持输入' };

    const value = Number(rawValue);
    if (!Number.isFinite(value)) return { error: '请输入数字' };
    if (!Number.isInteger(value)) return { error: '请输入整数' };

    const min = input.min;
    const max = input.max;
    const step = input.step ?? 1;
    if (value < min || value > max) {
      return { error: `请输入 ${min}-${max} 之间的数值` };
    }
    if ((value - min) % step !== 0) {
      return { error: `请输入步长为 ${step} 的有效数值` };
    }

    const scaledCost = this._scaleCost(input.perUnitCost, value);
    const scaledEffects = this._scaleEffects(input.perUnitEffects, value);
    const cost = this._mergeCosts(choice.cost, scaledCost);
    const resultText = this._fillInputTemplate(input.resultTextTemplate ?? choice.resultText, {
      value,
      cost,
      effects: this._mergeEffects(choice.effects, scaledEffects),
    });

    return { cost, effects: scaledEffects, resultText, inputValue: value };
  }

  _scaleCost(cost, multiplier) {
    if (!cost) return null;
    return {
      ...(cost.ammo != null ? { ammo: cost.ammo * multiplier } : {}),
      ...(cost.supplies != null ? { supplies: cost.supplies * multiplier } : {}),
    };
  }

  _scaleEffects(effects, multiplier) {
    if (!effects) return null;
    return {
      ...(effects.humanity != null ? { humanity: effects.humanity * multiplier } : {}),
      ...(effects.supplies != null ? { supplies: effects.supplies * multiplier } : {}),
      ...(effects.ammo != null ? { ammo: effects.ammo * multiplier } : {}),
    };
  }

  _mergeCosts(base, extra) {
    if (!base) return extra || null;
    if (!extra) return base;
    return {
      ...(base.ammo != null ? { ammo: base.ammo } : {}),
      ...(base.supplies != null ? { supplies: base.supplies } : {}),
      ...(extra.ammo != null ? { ammo: (base.ammo || 0) + extra.ammo } : {}),
      ...(extra.supplies != null ? { supplies: (base.supplies || 0) + extra.supplies } : {}),
    };
  }

  _mergeEffects(base, extra) {
    if (!base) return extra || null;
    if (!extra) return base;
    return {
      ...base,
      ...(extra.humanity != null ? { humanity: (base.humanity || 0) + extra.humanity } : {}),
      ...(extra.supplies != null ? { supplies: (base.supplies || 0) + extra.supplies } : {}),
      ...(extra.ammo != null ? { ammo: (base.ammo || 0) + extra.ammo } : {}),
    };
  }

  _fillInputTemplate(text, { value, cost, effects }) {
    if (!text) return text;
    const replacements = {
      value,
      ammoDelta: effects?.ammo ?? 0,
      suppliesDelta: effects?.supplies ?? 0,
      humanityDelta: effects?.humanity ?? 0,
      ammoCost: cost?.ammo ?? 0,
      suppliesCost: cost?.supplies ?? 0,
    };
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(replacements[key] ?? ''));
  }

  /** 剧情结果 + 数值变化，合并为玩家可见的完整反馈 */
  /** 收音机等内容：各天选项可省略 resultText，由 rules.radioBroadcasts 按 onceKey 补全 */
  _resolveResultText(choice, resolved) {
    const direct = resolved.resultText || choice.resultText;
    if (direct?.trim()) return direct.trim();

    const key = choice.requirements?.onceKey;
    const broadcasts = this.rules.config.radioBroadcasts;
    if (key && broadcasts?.[key]) {
      const entry = broadcasts[key];
      if (entry.dayRange) {
        const [min, max] = entry.dayRange;
        if (this.state.day < min || this.state.day > max) return null;
      }
      return entry.resultText || null;
    }

    if ((choice.id === 'radio' || choice.id === 'radio_airdrop') && broadcasts?.radio_listen) {
      return broadcasts.radio_listen.resultText;
    }

    return null;
  }

  _formatOutcomeMessage(resultText, effectSummary) {
    const parts = [];
    if (resultText?.trim()) parts.push(resultText.trim());
    if (effectSummary?.length) {
      const block = effectSummary.join(' · ');
      parts.push(parts.length ? `\n\n【结果】${block}` : `【结果】${block}`);
    }
    return parts.length ? parts.join('') : null;
  }

  _shouldPreserveChoiceOutcome(options = {}) {
    return Boolean(options.preserveChoiceOutcome ?? options.preserveLastResult);
  }

  _setChoiceOutcome(text, effects) {
    const trimmed = text?.trim();
    const fx = effects?.length ? effects : null;
    if (!trimmed && !fx) {
      this.state.lastChoiceOutcome = null;
      return;
    }
    this.state.lastChoiceOutcome = { text: trimmed || null, effects: fx };
  }

  _setSceneOutcome(label, text, effects) {
    const trimmed = text?.trim();
    const fx = effects?.length ? effects : null;
    if (!trimmed && !fx) {
      this.state.lastSceneOutcome = null;
      return;
    }
    this.state.lastSceneOutcome = {
      label: label || '进入场景',
      text: trimmed || null,
      effects: fx,
    };
  }

  _clearChoiceOutcome() {
    this.state.lastChoiceOutcome = null;
  }

  _clearSceneOutcome() {
    this.state.lastSceneOutcome = null;
  }

  _clearAllOutcomes() {
    this.state.lastChoiceOutcome = null;
    this.state.lastSceneOutcome = null;
  }

  _choiceOutcomeMessage() {
    const o = this.state.lastChoiceOutcome;
    return this._formatOutcomeMessage(o?.text, o?.effects);
  }

  _matchWhen(when, context = {}) {
    if (!when || Object.keys(when).length === 0) return true;
    const s = this.state;
    if (when.minInputValue != null && (context.inputValue ?? 0) < when.minInputValue) {
      return false;
    }
    if (when.shelter && s.shelter !== when.shelter) return false;
    if (when.tags?.length && !when.tags.every((t) => s.tags.includes(t))) return false;
    if (when.tagsNot?.length && when.tagsNot.some((t) => s.tags.includes(t))) return false;
    if (when.flags?.length && !when.flags.every((f) => s.flags[f])) return false;
    if (when.flagsNot?.length && when.flagsNot.some((f) => s.flags[f])) return false;
    if (when.partners?.length && !when.partners.every((p) => s.partners.includes(p))) {
      return false;
    }
    if (when.partnersNot?.length && when.partnersNot.some((p) => s.partners.includes(p))) {
      return false;
    }
    if (when.items?.length && !when.items.every((i) => s.items.includes(i))) return false;
    if (when.minAmmo != null && s.stats.ammo < when.minAmmo) return false;
    if (when.maxAmmo != null && s.stats.ammo > when.maxAmmo) return false;
    if (when.minSupplies != null && s.stats.supplies < when.minSupplies) return false;
    if (when.maxHumanity != null && s.stats.humanity > when.maxHumanity) return false;
    if (when.minHumanity != null && s.stats.humanity < when.minHumanity) return false;
    if (when.humanityAbove != null && s.stats.humanity <= when.humanityAbove) return false;
    if (when.humanityBelow != null && s.stats.humanity >= when.humanityBelow) return false;
    if (when.route != null && s.route !== when.route) return false;
    if (when.routeNot != null && s.route === when.routeNot) return false;
    return true;
  }

  _getAvailableExploreAreas() {
    const s = this.state;
    return Object.keys(this.exploration).filter((id) => {
      if (s.closedExploreAreas.includes(id)) return false;
      const area = this.exploration[id];
      if (!area.requirements) return true;
      return this._canPickChoice({ requirements: area.requirements }).ok;
    });
  }

  _getNextPlayableDay(afterDay) {
    const nums = this.days
      .map((d) => d.day)
      .filter((d) => d > afterDay && !this._isDaySkippedForRoute(d))
      .sort((a, b) => a - b);
    return nums[0] ?? null;
  }

  _enterRoute(routeId, options = {}) {
    this.state.route = routeId;
    this.state.flags.day80Resolved = true;

    switch (routeId) {
      case 'savior':
        return this._enterEvent('savior_pre', 'solo', options);
      case 'adam_eve':
      case 'lone_wolf': {
        const next = this._getNextPlayableDay(this.state.day);
        if (next) {
          return this._enterDayAfterCost(next, options);
        }
        this.state.event = null;
        this.state.mode = 'day';
        return { ok: true };
      }
      default:
        this.state.event = null;
        this.state.mode = 'day';
        return { ok: true };
    }
  }

  _finalizeEnding(context = { survived: true }) {
    const autoTags = this.rules.getAutoTagsForState(this.state, context);
    autoTags.forEach((t) => this._addTag(t, true));
    if (this.scoring) {
      this.state.endingScore = calculateEndingScore(
        this.state,
        this.tagsById,
        this.scoring
      );
    }
  }

  /** 结局结算页展示的大结局正文：优先用选项 resultText，否则用大结局词条 flavorText */
  _resolveFinaleNarrative(state) {
    if (state.lastChoiceOutcome?.text?.trim()) return state.lastChoiceOutcome.text.trim();
    const finaleId = state.endingScore?.finaleTag?.id;
    const flavor = finaleId ? this.tagsById[finaleId]?.flavorText : null;
    return flavor?.trim() || null;
  }

  _completeFinale() {
    this._finalizeEnding({ survived: true });
    this.state.demoComplete = true;
    this.state.mode = 'demo_complete';
    this.state.event = null;
    return { ok: true, demoComplete: true };
  }

  _runMinigame(choice) {
    if (!choice.minigame) return null;
    if (choice.minigame === 'dice') {
      const bet = choice.bet ?? 10;
      const result = playDiceGame(this.state, bet);
      return { text: result.text };
    }
    if (choice.minigame === 'russian_roulette') {
      const result = playRussianRoulette(this.state);
      return {
        text: result.text,
        gameOver: result.gameOver,
        grantTag: result.grantTag,
      };
    }
    return null;
  }

  _applyEffects(effects) {
    if (!effects) return null;

    const s = this.state;
    const st = s.stats;
    const lines = [];
    const before = { ...st };

    if (effects.setShelter) {
      s.shelter = effects.setShelter;
      lines.push(`庇护所 → ${SHELTER_NAMES[effects.setShelter]}`);
    }
    if (effects.humanity) {
      st.humanity += effects.humanity;
      lines.push(`人性 ${fmtDelta(effects.humanity)}`);
    }
    if (effects.supplies) {
      st.supplies += effects.supplies;
      lines.push(`物资 ${fmtDelta(effects.supplies)}`);
    }
    if (effects.setSupplies != null) {
      const prev = st.supplies;
      st.supplies = effects.setSupplies;
      lines.push(`物资 ${prev} → ${st.supplies}`);
    }
    if (effects.ammo) {
      st.ammo += effects.ammo;
      lines.push(`弹药 ${fmtDelta(effects.ammo)}`);
    }
    if (effects.suppliesHalve) {
      const prev = st.supplies;
      st.supplies = Math.floor(st.supplies / 2);
      lines.push(`物资 ${prev} → ${st.supplies}`);
    }
    if (effects.suppliesCostModifier) {
      this.rules.applySuppliesCostModifier(s, effects.suppliesCostModifier);
      lines.push(`每日物资消耗 ${fmtDelta(effects.suppliesCostModifier)}（持续）`);
    }
    if (effects.skipNextDayActions) {
      s.skipNextDayActions = true;
      lines.push('下一天无法进行常规行动');
    }
    if (effects.setRoute) {
      s.route = effects.setRoute;
    }
    if (effects.setFlag) {
      s.flags[effects.setFlag] = true;
    }
    if (effects.clearFlag) {
      delete s.flags[effects.clearFlag];
    }
    if (effects.closeExploreArea) {
      s.closedExploreAreas.push(effects.closeExploreArea);
    }
    if (effects.disableFixedEvent) {
      s.disabledFixedEvents.push(effects.disableFixedEvent);
    }

    if (effects.addPartner && !s.partners.includes(effects.addPartner)) {
      s.partners.push(effects.addPartner);
      lines.push(`获得伙伴：${this._partnerName(effects.addPartner)}`);
    }
    if (effects.removePartner) {
      const name = this._partnerName(effects.removePartner);
      s.partners = s.partners.filter((p) => p !== effects.removePartner);
      lines.push(`失去伙伴：${name}`);
    }
    if (effects.addItem && !s.items.includes(effects.addItem)) {
      s.items.push(effects.addItem);
      this.rules.onItemAcquired(s, effects.addItem);
      if (effects.addItem === '肾上腺素') {
        lines.push('获得物品：肾上腺素（下一次有消耗的选择免费）');
      } else {
        lines.push(`获得物品：${effects.addItem}`);
      }
    }
    if (effects.addTag) {
      this._addTag(effects.addTag);
      lines.push(`词条：${effects.addTag}`);
    }
    if (effects.addTagSilentIfDuplicate) {
      this._addTag(effects.addTagSilentIfDuplicate, true);
      lines.push(`词条：${effects.addTagSilentIfDuplicate}`);
    }
    if (effects.addTags) {
      effects.addTags.forEach((t) => {
        this._addTag(t);
        lines.push(`词条：${t}`);
      });
    }

    this.rules.clampStats(s);
    return lines.length ? lines : null;
  }

  _addTag(tagId, silentDup = false) {
    if (this.state.tags.includes(tagId)) {
      if (!silentDup) this._log(`重复词条：${tagId}`);
      return;
    }
    this.state.tags.push(tagId);
    this._log(`获得词条：${tagId}`);
  }

  _log(msg) {
    this.state.log.push(msg);
  }

  _triggerGameOver(reason, grantTag) {
    if (grantTag) this._addTag(grantTag, true);
    this._finalizeEnding({ gameOver: true });
    this.state.gameOver = true;
    this.state.mode = 'gameover';
    this.state.gameOverReason = reason;
    return { ok: true, gameOver: true };
  }

  _triggerNearDeath(source) {
    this.state.pendingNearDeath = true;
    this.state.pendingNearDeathContext = { source };
    return { ok: true, nearDeath: true };
  }

  _handleGoto(goto, options = {}) {
    if (!goto) return this._finishExploreOrAdvance();

    switch (goto.type) {
      case 'day':
        return this._enterDayAfterCost(goto.day, options);
      case 'nextDay':
        return this._advanceDay(options);
      case 'event':
        return this._enterEvent(goto.eventId, goto.nodeId, options);
      case 'route':
        return this._enterRoute(goto.routeId, options);
      case 'skipToDay':
        return this._enterDayAfterCost(goto.day, options);
      case 'finale':
        return this._completeFinale();
      case 'explore':
        this.state.mode = 'explore_pick';
        this.state.explore = null;
        return { ok: true };
      case 'exploreArea':
        if (goto.areaId) {
          return this.pickExploreArea(goto.areaId);
        }
        this.state.mode = 'explore_pick';
        this.state.explore = null;
        return { ok: true };
      case 'nearDeath':
        return this._triggerNearDeath('goto');
      case 'retryChoices':
        this._clearAllOutcomes();
        this.state.lastCostLog = null;
        this.state.event = null;
        this.state.explore = null;
        if (this.state.day > 0) {
          this.state.mode = 'day';
        } else if (this.state.prePhase) {
          this.state.mode = 'pre';
        }
        return { ok: true };
      case 'areaNode':
        if (this.state.mode === 'explore' && this.state.explore) {
          this.state.explore.nodeId = goto.nodeId;
          return { ok: true };
        }
        return { ok: true };
      default:
        return this._finishExploreOrAdvance();
    }
  }

  _enterEvent(eventId, nodeId, options = {}) {
    const ev = this.events[eventId];
    if (!ev) {
      this._log(`未知事件：${eventId}`);
      return this._advanceDay();
    }
    if (ev.shelter && this.state.shelter !== ev.shelter) {
      return this._advanceDay();
    }

    const resolvedNodeId = nodeId || ev.nodes[0]?.id || 'start';
    const node = ev.nodes.find((n) => n.id === resolvedNodeId);
    const sameEvent = this.state.event?.id === eventId;

    this.state.mode = 'event';
    this.state.event = { id: eventId, nodeId: resolvedNodeId };

    const preserveChoice = this._shouldPreserveChoiceOutcome(options);

    if (!sameEvent && !preserveChoice) {
      this._clearChoiceOutcome();
    }

    if (node?.onEnterEffects || node?.onEnterResultText) {
      const summary = node.onEnterEffects ? this._applyEffects(node.onEnterEffects) : null;
      this._setSceneOutcome(ev?.title || '事件', node.onEnterResultText || null, summary);
    } else if (!preserveChoice || sameEvent) {
      this._clearSceneOutcome();
    }

    return { ok: true };
  }

  /**
   * 结局线里程碑（第80天选线后）：
   * - savior：save/save_john → savior_pre → 跳85 → 90 savior_day90 → 大结局@90
   * - savior_zombie：+穿越者 arc → 85(continue) → 90 savior_day90 → 大结局@90
   * - adam_eve：save_evelyn/承诺 → 85 adam_eve_85 → 90 adam_eve_90 → 100 adam_eve_100 → 大结局
   * - lone_wolf：dont_save → 100 lone_wolf_100 → 大结局
   *
   * routeOnly 天若当前路线仅有唯一 specialEvent，进入当天时自动跳进对应事件（避免空白天数卡）。
   */
  _resolveDayAutoEnter(dayDef) {
    if (!dayDef?.routeOnly || !dayDef.choicesByRoute || !this.state.route) return null;
    const choices = dayDef.choicesByRoute[this.state.route];
    if (!choices || choices.length !== 1) return null;
    const only = choices[0];
    if (only.disabled || !only.specialEvent || only.goto?.type !== 'event') return null;
    return { eventId: only.goto.eventId, nodeId: only.goto.nodeId };
  }

  _enterDay(day, options = {}) {
    this.rules.clearDayActionFlags(this.state);
    this.state.mode = 'day';
    this.state.day = day;
    this.state.event = null;
    this.state.explore = null;
    this.state.prePhase = null;
    if (!this._shouldPreserveChoiceOutcome(options)) {
      this._clearChoiceOutcome();
      this.state.lastCostLog = null;
    }
    this._clearSceneOutcome();
    const dayDef = this._getDayDef(day);
    this._applyDayEnterHooks(dayDef);
    const autoEvent = this._resolveDayAutoEnter(dayDef);
    if (autoEvent) {
      const result = this._enterEvent(autoEvent.eventId, autoEvent.nodeId, options);
      this._captureDayCheckpoint();
      return result;
    }
    this._captureDayCheckpoint();
    return { ok: true };
  }

  /** 进入某天时的手册开场效果（如第35天收音机/物资、第38天菌类收成） */
  _resolveDayOpeningText(dayDef) {
    if (!dayDef) return '';
    if (dayDef.openingBranches?.length) {
      const branch =
        dayDef.openingBranches.find((b) => this._matchWhen(b.when)) ||
        dayDef.openingBranches.find((b) => !b.when || Object.keys(b.when).length === 0);
      if (branch?.openingText) return branch.openingText;
    }
    return dayDef.openingText || '';
  }

  _resolveNodeText(node) {
    if (!node) return '';
    const parts = [];
    if (node.openingBranches?.length) {
      const branch =
        node.openingBranches.find((b) => this._matchWhen(b.when)) ||
        node.openingBranches.find((b) => !b.when || Object.keys(b.when).length === 0);
      if (branch?.openingText) parts.push(branch.openingText);
    }
    if (node.narrative?.trim()) parts.push(node.narrative.trim());
    return parts.join('\n\n');
  }

  _applyDayEnterHooks(dayDef) {
    if (!dayDef) return;

    let effects = dayDef.onEnterEffects ? { ...dayDef.onEnterEffects } : null;
    let resultText = dayDef.onEnterResultText;

    if (dayDef.onEnterBranches?.length) {
      const branch =
        dayDef.onEnterBranches.find((b) => this._matchWhen(b.when)) ||
        dayDef.onEnterBranches.find((b) => !b.when || Object.keys(b.when).length === 0);
      if (branch) {
        if (branch.effects) effects = { ...(effects || {}), ...branch.effects };
        if (branch.resultText) resultText = branch.resultText;
      }
    }

    if (!effects && !resultText) return;

    const summary = effects ? this._applyEffects(effects) : null;
    const label = dayDef.title || (this.state.day > 0 ? `第 ${this.state.day} 天` : '新的一天');
    this._setSceneOutcome(label, resultText || null, summary);
  }

  _enterDayAfterCost(day, options = {}) {
    if (day <= 1) {
      return this._enterDay(day, options);
    }

    if (this.state.skipNextDayCostOnce) {
      this.state.skipNextDayCostOnce = false;
      this._log('濒死跳过：免除本次开启新一天的物资消耗');
      return this._enterDay(day, options);
    }

    const dayDef = this._getDayDef(day);
    const attempt = this.rules.tryEnterDay(day, this.state, dayDef);

    if (attempt.ok) {
      if (attempt.paid > 0) {
        this._log(`进入第 ${day} 天，消耗物资 ${attempt.paid}（${this.rules.formatBreakdown(attempt.breakdown)}）`);
      }
      return this._enterDay(day, options);
    }

    return this._resolveInsufficientDayCost(day, attempt);
  }

  _advanceDay(options = {}) {
    const next =
      this.state.day === 0 ? 1 : this._getNextPlayableDay(this.state.day);

    if (!next || next > this.demoMaxDay) {
      this._finalizeEnding({ survived: true });
      this.state.demoComplete = true;
      this.state.mode = 'demo_complete';
      return { ok: true, demoComplete: true };
    }

    return this._enterDayAfterCost(next, options);
  }

  _resolveInsufficientDayCost(targetDay, attempt) {
    const cfg = this.rules.config.companionToSupplies;

    if (
      cfg?.enabled &&
      this.state.companionNightResolvedForTarget !== targetDay &&
      this.companionConvert
    ) {
      const eligible = getEligibleConvertPartners(this.state, this.companionConvert);
      if (eligible.length > 0) {
        return this._enterCompanionConvertNight(targetDay, attempt, eligible);
      }
    }

    return this._resolveInsufficientDayCostFallback(targetDay, attempt);
  }

  _resolveInsufficientDayCostFallback(targetDay, attempt) {
    const nearCost = this.rules.nearDeathCost;

    if (this.state.stats.supplies >= nearCost) {
      this.state.pendingNearDeath = true;
      this.state.pendingNearDeathContext = {
        source: 'insufficientDayCost',
        targetDay,
        need: attempt.need,
        breakdown: attempt.breakdown,
      };
      this.state.gameOverReason = `物资不足（需要 ${attempt.need}），可消耗 ${nearCost} 物资濒死跳过`;
      return { ok: true, nearDeath: true };
    }

    return this._triggerGameOver('物资耗尽，无法开启新的一天', '尽头');
  }

  _enterCompanionConvertNight(targetDay, attempt, eligible) {
    this.state.mode = 'event';
    this.state.event = {
      id: 'companion_convert_night',
      nodeId: 'night',
      meta: {
        targetDay,
        need: attempt.need,
        breakdown: attempt.breakdown,
        eligible,
        selectedPartner: eligible.length === 1 ? eligible[0] : null,
      },
    };
    this._clearAllOutcomes();
    this._log(`物资不足，触发第 ${this.state.day} 天前夜事件`);
    return { ok: true };
  }

  _pickCompanionConvertChoice(choiceId) {
    const resolved = resolveCompanionConvertChoice(choiceId, this.state, this.companionConvert);
    if (resolved.error) return { error: resolved.error };

    if (resolved.phase === 'selected') {
      this._clearChoiceOutcome();
      return { ok: true };
    }

    if (resolved.countsAsConvertChoice) {
      this.state.choseConvertToSupplies = true;
    }

    const effectSummary = this._applyEffects(resolved.effects);
    this._setChoiceOutcome(resolved.resultText, effectSummary);
    const fullOutcome = this._formatOutcomeMessage(resolved.resultText, effectSummary);

    const targetDay = this.state.event.meta.targetDay;
    const need = this.state.event.meta.need;
    this.state.companionNightResolvedForTarget = targetDay;
    this.state.event = null;
    this.state.mode = 'day';

    switch (resolved.after) {
      case 'gameOver':
        return this._triggerGameOver(
          fullOutcome || resolved.gameOverReason || '你死了'
        );
      case 'retryEnterDay':
        return this._enterDayAfterCost(targetDay);
      case 'retryDayOrNearDeath':
      default:
        return this._resolveInsufficientDayCostFallback(targetDay, { need });
    }
  }

  _finishExploreOrAdvance() {
    if (this.state.mode === 'explore' || this.state.mode === 'explore_pick') {
      this.rules.onExploreCompleted(this.state);
      this.state.mode = 'day';
      this.state.explore = null;
      return this._advanceDay();
    }
    return { ok: true };
  }

  _gotoPrePhase(nodeId) {
    const phase = PRE_PHASE_MAP[nodeId] || nodeId;
    const found = this.preOutbreak.days.find((d) => d.phase === phase);
    if (found) {
      this.state.prePhase = found.phase;
      this._captureDayCheckpoint();
      return { ok: true };
    }
    return this._advanceDay();
  }
}

function fmtDelta(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

export async function loadGameData(basePath = '/data') {
  const fetchJson = (path) =>
    fetch(`${basePath}/${path}`).then((r) => {
      if (!r.ok) throw new Error(`加载失败: ${path}`);
      return r.json();
    });

  const [
    meta,
    preOutbreakRaw,
    days,
    events,
    exploreEvents,
    exploration,
    tags,
    rules,
    partners,
    companionConvert,
    scoring,
  ] = await Promise.all([
    fetchJson('meta.json'),
    fetchJson('pre-outbreak.json'),
    fetchJson('days.json'),
    fetchJson('events.json'),
    fetchJson('explore-events.json').catch(() => []),
    fetchJson('exploration.json'),
    fetchJson('tags.json'),
    fetchJson('rules.json'),
    fetchJson('partners.json'),
    fetchJson('companion-convert.json'),
    fetchJson('scoring.json'),
  ]);

  const allEvents = [...events, ...(exploreEvents || [])];

  return {
    meta,
    preOutbreak: preOutbreakRaw,
    days,
    events: allEvents,
    exploration,
    tags,
    rules,
    partners,
    companionConvert,
    scoring,
  };
}
